"""
Backend API Service - Provides REST API for dashboard and external consumers.
Queries ClickHouse (analytics), PostgreSQL (threat intel), Redis (cache/state).
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any, Optional

import urllib.request
import urllib.error

import clickhouse_connect
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("backend-api")

# Database connections
clickhouse_client = None
postgres_pool = None
redis_client = None
clickhouse_lock = asyncio.Lock()


async def run_ch_query(query: str):
    """Safely execute a ClickHouse query using the shared client with lock."""
    async with clickhouse_lock:
        return await asyncio.to_thread(clickhouse_client.query, query)


async def run_ch_command(command: str):
    """Safely execute a ClickHouse command using the shared client with lock."""
    async with clickhouse_lock:
        return await asyncio.to_thread(clickhouse_client.command, command)


def _query_threat_intel_service(url: str, payload: dict) -> dict:
    """Synchronous HTTP POST to threat-intel service via urllib."""
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=30.0) as resp:
        if resp.status == 200:
            return json.loads(resp.read().decode("utf-8"))
    return {}


async def init_databases():
    """Initialize all database connections"""
    global clickhouse_client, postgres_pool, redis_client

    # ClickHouse - connect without database first to create it
    clickhouse_client = clickhouse_connect.get_client(
        host=os.getenv("CLICKHOUSE_HOST", "clickhouse"),
        port=int(os.getenv("CLICKHOUSE_PORT", "8123")),
        username=os.getenv("CLICKHOUSE_USER", "default"),
        password=os.getenv("CLICKHOUSE_PASSWORD", ""),
    )

    # Create clouddecept database if it doesn't exist
    db_name = os.getenv("CLICKHOUSE_DB", "clouddecept")
    clickhouse_client.command(f"CREATE DATABASE IF NOT EXISTS {db_name}")
    clickhouse_client.command(f"USE {db_name}")
    print(f"ClickHouse: Using database '{db_name}'")

    # PostgreSQL (using psycopg2)
    import psycopg2
    from psycopg2.pool import ThreadedConnectionPool

    postgres_pool = ThreadedConnectionPool(
        1, 10,
        host=os.getenv("POSTGRES_HOST", "postgres"),
        port=int(os.getenv("POSTGRES_PORT", "5432")),
        user=os.getenv("POSTGRES_USER", "clouddecept"),
        password=os.getenv("POSTGRES_PASSWORD", ""),
        database=os.getenv("POSTGRES_DB", "clouddecept"),
    )

    # Redis
    redis_client = redis.from_url(
        os.getenv("REDIS_URL", "redis://redis:6379"),
        encoding="utf-8",
        decode_responses=True,
    )

    # Initialize schemas (creates tables)
    await init_schemas()


async def init_schemas():
    """Create database tables if they don't exist"""

    # ClickHouse tables - CREATE TABLE IF NOT EXISTS with DateTime64(6)
    ch_tables = [
        """
        CREATE TABLE IF NOT EXISTS sessions (
            session_id String,
            start_time DateTime64(6),
            end_time DateTime64(6),
            duration_seconds UInt32,
            attacker_ip String,
            country String,
            asn String,
            protocol String,
            commands_executed UInt32,
            files_transferred UInt32,
            credentials_tried UInt32,
            intent String,
            skill_level UInt8,
            disconnection_reason String
        ) ENGINE = MergeTree() ORDER BY (start_time, session_id)
        PARTITION BY toYYYYMM(start_time)
        TTL toDateTime(start_time) + INTERVAL 90 DAY
        """,
        """
        CREATE TABLE IF NOT EXISTS commands (
            event_id String,
            session_id String,
            timestamp DateTime64(6),
            command String,
            arguments Array(String),
            output String,
            exit_code Int32,
            duration_ms UInt32,
            intent String,
            mitre_techniques Array(String)
        ) ENGINE = MergeTree() ORDER BY (timestamp, session_id)
        PARTITION BY toYYYYMM(timestamp)
        TTL toDateTime(timestamp) + INTERVAL 90 DAY
        """,
        """
        CREATE TABLE IF NOT EXISTS auth_attempts (
            event_id String,
            session_id String,
            timestamp DateTime64(6),
            username String,
            password String,
            success UInt8,
            auth_method String
        ) ENGINE = MergeTree() ORDER BY (timestamp, session_id)
        PARTITION BY toYYYYMM(timestamp)
        TTL toDateTime(timestamp) + INTERVAL 90 DAY
        """,
        """
        CREATE TABLE IF NOT EXISTS cloud_api_requests (
            event_id String,
            session_id String,
            timestamp DateTime64(6),
            cloud_provider String,
            http_method String,
            endpoint String,
            path String,
            response_status UInt16,
            duration_ms UInt32
        ) ENGINE = MergeTree() ORDER BY (timestamp, session_id)
        PARTITION BY toYYYYMM(timestamp)
        TTL toDateTime(timestamp) + INTERVAL 90 DAY
        """,
    ]

    for table_sql in ch_tables:
        clickhouse_client.command(table_sql)

    # Verify ClickHouse tables exist
    result = clickhouse_client.query(
        "SELECT name FROM system.tables WHERE database = currentDatabase() AND name IN ('sessions','commands','auth_attempts','cloud_api_requests')"
    )
    created_tables = {row[0] for row in result.result_rows}
    expected_tables = {"sessions", "commands", "auth_attempts", "cloud_api_requests"}
    missing = expected_tables - created_tables
    if missing:
        raise RuntimeError(f"ClickHouse tables missing after creation: {missing}")
    print(f"ClickHouse: All tables verified: {created_tables}")

    # PostgreSQL tables
    pg_tables = [
        """
        CREATE TABLE IF NOT EXISTS threat_intelligence (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id VARCHAR(255),
            technique_id VARCHAR(50),
            technique_name VARCHAR(255),
            tactic VARCHAR(100),
            ioc_type VARCHAR(50),
            ioc_value VARCHAR(500),
            confidence DECIMAL(3,2),
            mitre_techniques TEXT[],
            mitre_tactics TEXT[],
            severity VARCHAR(20),
            context TEXT,
            enrichment JSONB,
            iocs JSONB,
            raw_data JSONB,
            created_at TIMESTAMP DEFAULT NOW(),
            updated_at TIMESTAMP DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS session_summaries (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id VARCHAR(100) UNIQUE,
            summary TEXT,
            intent VARCHAR(50),
            skill_level INTEGER,
            mitre_techniques TEXT[],
            iocs JSONB,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """,
        """
        CREATE TABLE IF NOT EXISTS alerts (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            session_id VARCHAR(100),
            alert_type VARCHAR(50),
            severity VARCHAR(20),
            message TEXT,
            acknowledged BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT NOW()
        )
        """,
    ]

    alter_sqls = [
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS session_id VARCHAR(255)",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS technique_id VARCHAR(50)",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS technique_name VARCHAR(255)",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS tactic VARCHAR(100)",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS ioc_type VARCHAR(50)",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS ioc_value VARCHAR(500)",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS confidence FLOAT",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS mitre_techniques TEXT[]",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS mitre_tactics TEXT[]",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS severity VARCHAR(20)",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS context TEXT",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS enrichment JSONB",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS iocs JSONB",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS raw_data JSONB",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS created_at TIMESTAMP DEFAULT NOW()",
        "ALTER TABLE threat_intelligence ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP DEFAULT NOW()",
        "ALTER TABLE session_summaries ADD COLUMN IF NOT EXISTS mitre_techniques TEXT[]",
        "ALTER TABLE session_summaries ADD COLUMN IF NOT EXISTS iocs JSONB",
    ]

    conn = postgres_pool.getconn()
    try:
        with conn.cursor() as cur:
            for table_sql in pg_tables:
                cur.execute(table_sql)
            for alter_sql in alter_sqls:
                try:
                    cur.execute(alter_sql)
                except Exception as e:
                    logger.debug(f"Schema alter notice: {e}")
            conn.commit()
    finally:
        postgres_pool.putconn(conn)


async def close_databases():
    """Close all database connections"""
    global clickhouse_client, postgres_pool, redis_client

    if clickhouse_client:
        clickhouse_client.close()
    if postgres_pool:
        postgres_pool.closeall()
    if redis_client:
        await redis_client.close()


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_databases()
    yield
    await close_databases()


app = FastAPI(
    title="CloudDecept Backend API",
    version="1.0.0",
    lifespan=lifespan,
)


# ============================================================
# Pydantic Models
# ============================================================

class SessionSummary(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    session_id: str
    start_time: datetime
    end_time: Optional[datetime] = None
    duration_seconds: int
    attacker_ip: str
    country: Optional[str] = None
    protocol: str
    commands_executed: int
    files_transferred: int
    credentials_tried: int
    intent: str
    skill_level: int


class CommandResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: str
    session_id: str
    timestamp: datetime
    command: str
    arguments: list[str] = []
    output: Optional[str] = None
    exit_code: Optional[int] = 0
    duration_ms: Optional[int] = 0
    intent: Optional[str] = None
    mitre_techniques: list[str] = []


class AuthAttemptResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    event_id: str
    session_id: str
    timestamp: datetime
    username: str
    password: str
    success: bool
    auth_method: str


class ThreatIntelResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: str
    ioc_type: str
    ioc_value: str
    confidence: float
    mitre_techniques: list[str]
    mitre_tactics: list[str]
    severity: str
    context: str
    enrichment: dict
    created_at: datetime


class SessionSummaryDetail(BaseModel):
    session_id: str
    summary: str
    intent: str
    skill_level: int
    mitre_techniques: list[str]
    iocs: list[dict]
    created_at: datetime


class StatsResponse(BaseModel):
    # All-time totals (no time filter)
    total_sessions: int
    total_commands: int
    unique_attackers: int

    # Recent window (default 24h)
    recent_sessions: int
    recent_commands: int
    recent_unique_attackers: int

    # Active sessions (no end_time)
    active_sessions: int

    # Aggregated data for charts
    top_intents: list[dict]
    top_countries: list[dict]
    threat_distribution: list[dict]
    sessions_per_hour: list[dict]
    commands_per_day: list[dict]
    sessions_per_day: list[dict] = []


class HealthResponse(BaseModel):
    status: str
    clickhouse: str
    postgres: str
    redis: str
    timestamp: datetime


# ============================================================
# API Endpoints
# ============================================================

@app.get("/health", response_model=HealthResponse)
async def health():
    """Health check for all dependencies"""
    checks = {"clickhouse": "unknown", "postgres": "unknown", "redis": "unknown"}

    # Check ClickHouse
    try:
        await run_ch_command("SELECT 1")
        checks["clickhouse"] = "healthy"
    except Exception:
        checks["clickhouse"] = "unhealthy"

    # Check PostgreSQL
    try:
        conn = postgres_pool.getconn()
        with conn.cursor() as cur:
            cur.execute("SELECT 1")
        checks["postgres"] = "healthy"
        postgres_pool.putconn(conn)
    except Exception:
        checks["postgres"] = "unhealthy"

    # Check Redis
    try:
        await redis_client.ping()
        checks["redis"] = "healthy"
    except Exception:
        checks["redis"] = "unhealthy"

    overall = "healthy" if all(v == "healthy" for v in checks.values()) else "degraded"
    return HealthResponse(
        status=overall,
        **checks,
        timestamp=datetime.utcnow(),
    )


@app.get("/stats", response_model=StatsResponse)
async def get_stats(
    hours: int = Query(24, ge=1, le=87600),  # Allow up to 10 years for "all time"
):
    """Get high-level statistics for dashboard"""
    try:
        hours_val = int(hours)
    except Exception:
        hours_val = 24

    now = datetime.utcnow()
    since = now - timedelta(hours=hours_val)
    since_str = since.strftime('%Y-%m-%d %H:%M:%S')
    recent_str = (now - timedelta(hours=1)).strftime('%Y-%m-%d %H:%M:%S')
    day_ago_str = (now - timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S')
    week_ago_str = (now - timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')

    # ============================================================
    # ALL-TIME TOTALS (no time filter) - primary fields
    # ============================================================
    # Use fully qualified table names to ensure correct database
    total_sessions_raw = await run_ch_command("SELECT count() FROM clouddecept.sessions")
    total_sessions = int(total_sessions_raw or 0)
    total_commands_raw = await run_ch_command("SELECT uniqExact(event_id) FROM clouddecept.commands")
    total_commands = int(total_commands_raw or 0)
    unique_attackers_raw = await run_ch_command("SELECT uniq(attacker_ip) FROM clouddecept.sessions")
    unique_attackers = int(unique_attackers_raw or 0)

    # ============================================================
    # RECENT WINDOW STATS (respects hours parameter)
    # ============================================================
    recent_sessions_raw = await run_ch_command(
        f"SELECT count() FROM clouddecept.sessions WHERE start_time >= '{since_str}'"
    )
    recent_sessions = int(recent_sessions_raw or 0)
    recent_commands_raw = await run_ch_command(
        f"SELECT uniqExact(event_id) FROM clouddecept.commands WHERE timestamp >= '{since_str}'"
    )
    recent_commands = int(recent_commands_raw or 0)
    recent_unique_attackers_raw = await run_ch_command(
        f"SELECT uniq(attacker_ip) FROM clouddecept.sessions WHERE start_time >= '{since_str}'"
    )
    recent_unique_attackers = int(recent_unique_attackers_raw or 0)

    # ============================================================
    # ACTIVE SESSIONS (Live In-Flight Honeypot Sockets)
    # ============================================================
    active_sessions = 0
    if redis_client:
        try:
            r_active = await redis_client.scard("clouddecept:active_sessions")
            if r_active is not None and r_active > 0:
                active_sessions = int(r_active)
        except Exception as e:
            logger.debug(f"Redis active_sessions query failed: {e}")

    if active_sessions == 0:
        # Fallback to ClickHouse active sessions (unclosed within last 2 hours)
        try:
            active_sessions_raw = await run_ch_command(
                f"""
                SELECT count() FROM clouddecept.sessions
                WHERE end_time = start_time
                  AND duration_seconds = 0
                  AND (disconnection_reason = '' OR disconnection_reason IS NULL)
                  AND start_time >= '{recent_str}'
                  AND start_time <= now()
                """
            )
            active_sessions = int(active_sessions_raw or 0)
        except Exception as e:
            logger.debug(f"ClickHouse active_sessions query failed: {e}")
            active_sessions = 0

    # ============================================================
    # TOP INTENTS (all-time)
    # ============================================================
    top_intents_res = await run_ch_query(
        """
        SELECT intent, count() as cnt
        FROM clouddecept.sessions
        WHERE intent != '' AND intent IS NOT NULL
        GROUP BY intent
        ORDER BY cnt DESC
        LIMIT 10
        """
    )
    top_intents = top_intents_res.named_results()

    # ============================================================
    # TOP COUNTRIES (all-time, top 50 for full geographic coverage)
    # ============================================================
    top_countries_res = await run_ch_query(
        """
        SELECT country, count() as cnt
        FROM clouddecept.sessions
        WHERE country != '' AND country IS NOT NULL
        GROUP BY country
        ORDER BY cnt DESC
        LIMIT 50
        """
    )
    top_countries = top_countries_res.named_results()

    # ============================================================
    # THREAT DISTRIBUTION (Authoritative PostgreSQL + ClickHouse)
    # ============================================================
    pg_threat_counts = {}
    if postgres_pool:
        try:
            conn = postgres_pool.getconn()
            try:
                with conn.cursor() as cur:
                    cur.execute(
                        """
                        SELECT lower(severity), count(*)
                        FROM threat_intelligence
                        WHERE severity IS NOT NULL AND severity != ''
                        GROUP BY lower(severity)
                        """
                    )
                    for sev, cnt in cur.fetchall():
                        pg_threat_counts[sev] = int(cnt)
            finally:
                postgres_pool.putconn(conn)
        except Exception as e:
            logger.warning(f"Failed to query PostgreSQL threat distribution: {e}")

    if pg_threat_counts:
        crit = pg_threat_counts.get("critical", 0)
        high = pg_threat_counts.get("high", 0)
        med = pg_threat_counts.get("medium", 0)
        low = pg_threat_counts.get("low", 0)
        eval_total = crit + high + med + low
        unclassified = max(0, total_sessions - eval_total)
        threat_distribution = [
            {"level": "Critical", "count": crit},
            {"level": "High", "count": high},
            {"level": "Medium", "count": med},
            {"level": "Low", "count": low},
            {"level": "Unclassified", "count": unclassified},
        ]
    else:
        # Fallback to ClickHouse skill_level
        threat_dist_res = await run_ch_query(
            """
            SELECT
                sum(if(skill_level >= 8, 1, 0)) as critical,
                sum(if(skill_level >= 5 AND skill_level < 8, 1, 0)) as high,
                sum(if(skill_level >= 3 AND skill_level < 5, 1, 0)) as medium,
                sum(if(skill_level < 3 AND skill_level > 0, 1, 0)) as low,
                sum(if(skill_level = 0, 1, 0)) as unclassified
            FROM clouddecept.sessions
            """
        )
        threat_rows = list(threat_dist_res.named_results())
        row = threat_rows[0] if threat_rows else {}
        threat_distribution = [
            {"level": "Critical", "count": int(row.get("critical") or 0)},
            {"level": "High", "count": int(row.get("high") or 0)},
            {"level": "Medium", "count": int(row.get("medium") or 0)},
            {"level": "Low", "count": int(row.get("low") or 0)},
            {"level": "Unclassified", "count": int(row.get("unclassified") or 0)},
        ]

    # ============================================================
    # SESSIONS PER HOUR (last 24 hours, chronological)
    # ============================================================
    sessions_per_hour_res = await run_ch_query(
        f"""
        SELECT
            toStartOfHour(start_time) as hour_dt,
            count() as cnt
        FROM clouddecept.sessions
        WHERE start_time >= '{day_ago_str}' AND start_time <= now()
        GROUP BY hour_dt
        ORDER BY hour_dt ASC
        """
    )
    sessions_per_hour_formatted = []
    for r in sessions_per_hour_res.named_results():
        h_dt = r.get("hour_dt")
        if isinstance(h_dt, datetime):
            h_str = h_dt.strftime('%H:00')
            d_str = h_dt.strftime('%Y-%m-%d %H:00')
        else:
            h_str = str(h_dt)[11:16] if len(str(h_dt)) >= 16 else str(h_dt)
            d_str = str(h_dt)[:16]
        sessions_per_hour_formatted.append({
            "hour": h_str,
            "date": d_str,
            "count": int(r["cnt"]),
        })

    # ============================================================
    # COMMANDS PER DAY (last 7 days, up to now)
    # ============================================================
    commands_per_day_res = await run_ch_query(
        f"""
        SELECT
            toDate(timestamp) as day,
            uniqExact(event_id) as cnt
        FROM clouddecept.commands
        WHERE timestamp >= '{week_ago_str}' AND timestamp <= now()
        GROUP BY day
        ORDER BY day ASC
        """
    )
    commands_per_day = commands_per_day_res.named_results()

    commands_per_day_formatted = [
        {
            "date": (r.get("day") or r.get("date") or "")[:10] if isinstance(r.get("day") or r.get("date"), str) else str(r.get("day") or r.get("date") or "")[:10],
            "count": int(r.get("cnt", r.get("count", 0)))
        }
        for r in commands_per_day
    ]

    # ============================================================
    # SESSIONS PER DAY (last 7 days, up to now)
    # ============================================================
    sessions_per_day_res = await run_ch_query(
        f"""
        SELECT
            toDate(start_time) as day,
            uniqExact(session_id) as cnt
        FROM clouddecept.sessions
        WHERE start_time >= '{week_ago_str}' AND start_time <= now()
        GROUP BY day
        ORDER BY day ASC
        """
    )
    sessions_per_day_formatted = [
        {
            "date": (r.get("day") or r.get("date") or "")[:10] if isinstance(r.get("day") or r.get("date"), str) else str(r.get("day") or r.get("date") or "")[:10],
            "count": int(r.get("cnt", r.get("count", 0)))
        }
        for r in sessions_per_day_res.named_results()
    ]

    return StatsResponse(
        total_sessions=total_sessions,
        total_commands=total_commands,
        unique_attackers=unique_attackers,
        recent_sessions=recent_sessions,
        recent_commands=recent_commands,
        recent_unique_attackers=recent_unique_attackers,
        active_sessions=active_sessions,
        top_intents=[{"intent": r.get("intent", ""), "count": int(r.get("cnt", r.get("count", 0)))} for r in top_intents],
        top_countries=[{"country": r.get("country", ""), "count": int(r.get("cnt", r.get("count", 0)))} for r in top_countries],
        threat_distribution=threat_distribution,
        sessions_per_hour=sessions_per_hour_formatted,
        commands_per_day=commands_per_day_formatted,
        sessions_per_day=sessions_per_day_formatted,
    )


@app.get("/sessions", response_model=list[SessionSummary])
async def list_sessions(
    limit: int = Query(50, ge=1, le=1000),
    offset: int = Query(0, ge=0),
    intent: Optional[str] = None,
    min_skill_level: Optional[int] = None,
    hours: int = Query(24, ge=1, le=87600),  # Allow up to ~10 years for all-time
):
    """List recent sessions with filters"""
    try:
        limit_val = int(limit)
    except Exception:
        limit_val = 50
    try:
        offset_val = int(offset)
    except Exception:
        offset_val = 0
    try:
        hours_val = int(hours)
    except Exception:
        hours_val = 24

    since = datetime.utcnow() - timedelta(hours=hours_val)
    since_str = since.strftime('%Y-%m-%d %H:%M:%S')

    where_clauses = [f"start_time >= '{since_str}'"]
    if intent:
        where_clauses.append(f"intent = '{intent}'")
    if min_skill_level is not None:
        where_clauses.append(f"skill_level >= {int(min_skill_level)}")

    where_sql = " AND ".join(where_clauses)

    results = (await run_ch_query(
        f"""
        SELECT session_id, start_time, end_time, duration_seconds,
               attacker_ip, country, protocol, commands_executed,
               files_transferred, credentials_tried, intent, skill_level,
               disconnection_reason
        FROM clouddecept.sessions
        WHERE {where_sql}
        ORDER BY start_time DESC
        LIMIT {limit_val} OFFSET {offset_val}
        """
    )).named_results()

    formatted_sessions = []
    for r in results:
        sess_dict = dict(r)
        # An active session in ClickHouse has end_time placeholder equal to start_time, duration 0, and no disconnect reason
        is_active = (
            sess_dict.get("end_time") == sess_dict.get("start_time") and
            int(sess_dict.get("duration_seconds") or 0) == 0 and
            not sess_dict.get("disconnection_reason")
        )
        if is_active:
            sess_dict["end_time"] = None
        sess_dict.pop("disconnection_reason", None)
        formatted_sessions.append(SessionSummary(**sess_dict))

    return formatted_sessions


@app.get("/sessions/{session_id}", response_model=SessionSummary)
async def get_session(session_id: str):
    """Get detailed session info with accurate unique counts"""
    result = await run_ch_query(
        f"""
        SELECT session_id, start_time, end_time, duration_seconds,
               attacker_ip, country, protocol, commands_executed,
               files_transferred, credentials_tried, intent, skill_level,
               disconnection_reason
        FROM clouddecept.sessions
        WHERE session_id = '{session_id}'
        LIMIT 1
        """
    )

    result_rows = list(result.named_results())
    if not result_rows:
        raise HTTPException(status_code=404, detail="Session not found")

    sess_dict = dict(result_rows[0])

    # Ensure commands_executed and credentials_tried reflect unique events
    try:
        actual_cmds = await run_ch_command(
            f"SELECT uniqExact(event_id) FROM clouddecept.commands WHERE session_id = '{session_id}'"
        )
        if actual_cmds is not None:
            sess_dict["commands_executed"] = int(actual_cmds)
    except Exception:
        pass

    try:
        actual_auth = await run_ch_command(
            f"SELECT uniqExact(event_id) FROM clouddecept.auth_attempts WHERE session_id = '{session_id}'"
        )
        if actual_auth is not None:
            sess_dict["credentials_tried"] = int(actual_auth)
    except Exception:
        pass

    # Active session check
    if (
        sess_dict.get("end_time") == sess_dict.get("start_time") and
        int(sess_dict.get("duration_seconds") or 0) == 0 and
        not sess_dict.get("disconnection_reason")
    ):
        sess_dict["end_time"] = None
    sess_dict.pop("disconnection_reason", None)

    return SessionSummary(**sess_dict)


@app.get("/sessions/{session_id}/commands", response_model=list[CommandResponse])
async def get_session_commands(
    session_id: str,
    limit: int = Query(100, ge=1, le=500),
):
    """Get all commands for a session (deduplicated by event_id)"""
    try:
        limit_val = int(limit)
    except Exception:
        limit_val = 100

    results = (await run_ch_query(
        f"""
        SELECT event_id, session_id, timestamp, command, arguments,
               output, exit_code, duration_ms, intent, mitre_techniques
        FROM clouddecept.commands
        WHERE session_id = '{session_id}'
        ORDER BY timestamp ASC
        LIMIT 1 BY event_id
        LIMIT {limit_val}
        """
    )).named_results()

    return [CommandResponse(**r) for r in results]


@app.get("/sessions/{session_id}/auth", response_model=list[AuthAttemptResponse])
async def get_session_auth(session_id: str):
    """Get all auth attempts for a session (deduplicated by event_id)"""
    results = (await run_ch_query(
        f"""
        SELECT event_id, session_id, timestamp, username, password,
               success, auth_method
        FROM clouddecept.auth_attempts
        WHERE session_id = '{session_id}'
        ORDER BY timestamp ASC
        LIMIT 1 BY event_id
        """
    )).named_results()

    return [AuthAttemptResponse(**r) for r in results]


@app.get("/sessions/{session_id}/summary", response_model=SessionSummaryDetail)
async def get_session_summary(session_id: str):
    """Get AI-generated session summary from PostgreSQL, falling back to Threat Intel service on demand"""
    conn = postgres_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT session_id, summary, intent, skill_level,
                          mitre_techniques, iocs, created_at
                   FROM session_summaries WHERE session_id = %s""",
                (session_id,)
            )
            row = cur.fetchone()
            if row:
                return SessionSummaryDetail(
                    session_id=row[0],
                    summary=row[1] or "",
                    intent=row[2] or "unknown",
                    skill_level=row[3] or 1,
                    mitre_techniques=row[4] or [],
                    iocs=row[5] or [],
                    created_at=row[6] or datetime.utcnow(),
                )
    finally:
        postgres_pool.putconn(conn)

    # If not found in PostgreSQL, query Threat Intel engine on demand
    threat_intel_url = os.getenv("THREAT_INTEL_URL", "http://threat-intel:8005")
    # Fetch unique commands for this session from ClickHouse
    cmd_rows = (await run_ch_query(
        f"""
        SELECT event_id, command, output
        FROM clouddecept.commands
        WHERE session_id = '{session_id}'
        ORDER BY timestamp ASC
        LIMIT 1 BY event_id
        """
    )).named_results()
    commands_list = [
        {"command": r["command"], "output": r.get("output", "")}
        for r in cmd_rows
    ]

    sess_rows = (await run_ch_query(
        f"""
        SELECT attacker_ip, country, duration_seconds, intent, skill_level
        FROM clouddecept.sessions
        WHERE session_id = '{session_id}'
        LIMIT 1
        """
    )).named_results()
    sess_data = list(sess_rows)
    attacker_ip = sess_data[0]["attacker_ip"] if sess_data else "unknown"
    country = sess_data[0]["country"] if sess_data else "unknown"
    duration = int(sess_data[0]["duration_seconds"]) if sess_data else 0
    intent = sess_data[0]["intent"] if sess_data else ""
    skill_level = int(sess_data[0]["skill_level"]) if sess_data else 1

    if not sess_data and not commands_list:
        raise HTTPException(status_code=404, detail="Session not found")

    data = None
    try:
        payload = {
            "session_id": session_id,
            "commands": commands_list,
            "outputs": [c.get("output", "") for c in commands_list if c.get("output")],
            "intent_history": [intent] if intent else [],
            "attacker_ip": attacker_ip,
            "attacker_country": country,
            "duration_seconds": duration,
        }
        data = await asyncio.to_thread(
            _query_threat_intel_service,
            f"{threat_intel_url}/analyze",
            payload,
        )
    except Exception as e:
        logger.warning(f"On-demand Threat Intel call failed for {session_id}: {e}")

    summary_data = (data.get("summary") if data else None) or {}
    techs = (
        [
            t.get("technique_id")
            for t in data.get("techniques", [])
            if t.get("technique_id")
        ]
        if data and data.get("techniques")
        else []
    )
    if not techs and commands_list:
        for cmd in commands_list:
            c_str = cmd.get("command", "").lower()
            if any(x in c_str for x in ["whoami", "id", "uname"]):
                if "T1033" not in techs:
                    techs.append("T1033")
            if any(x in c_str for x in ["ls", "find", "dir"]):
                if "T1083" not in techs:
                    techs.append("T1083")

    iocs = data.get("iocs", []) if data else []
    summary_text = (
        summary_data.get("narrative")
        or summary_data.get("techniques_summary")
        or f"Session {session_id} analysis: Attacker executed {len(commands_list)} commands with intent '{intent or 'system discovery'}'. Risk assessed at skill level {skill_level}."
    )
    intent_val = summary_data.get("primary_objective") or intent or "unknown"
    skill_val = int(summary_data.get("skill_level", skill_level or 1))
    now_dt = datetime.utcnow()

    # Persist to session_summaries in Postgres so subsequent calls are instant
    try:
        conn = postgres_pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """INSERT INTO session_summaries (session_id, summary, intent, skill_level, mitre_techniques, iocs, created_at)
                       VALUES (%s, %s, %s, %s, %s, %s, %s)
                       ON CONFLICT (session_id) DO UPDATE SET
                           summary = EXCLUDED.summary,
                           intent = EXCLUDED.intent,
                           skill_level = EXCLUDED.skill_level,
                           mitre_techniques = EXCLUDED.mitre_techniques,
                           iocs = EXCLUDED.iocs""",
                    (session_id, summary_text, intent_val, skill_val, techs, json.dumps(iocs), now_dt)
                )
                # Also persist techniques to threat_intelligence table
                if data:
                    for tech in data.get("techniques", []):
                        cur.execute(
                            """INSERT INTO threat_intelligence (session_id, technique_id, technique_name, tactic, confidence, mitre_techniques, mitre_tactics, severity, context, enrichment, created_at)
                               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                               ON CONFLICT DO NOTHING""",
                            (
                                session_id,
                                tech.get("technique_id", ""),
                                tech.get("name", ""),
                                tech.get("tactic", ""),
                                float(tech.get("confidence", 1.0)),
                                [tech.get("technique_id", "")] if tech.get("technique_id") else [],
                                [tech.get("tactic", "")] if tech.get("tactic") else [],
                                tech.get("severity", "medium"),
                                tech.get("trigger", ""),
                                json.dumps(tech),
                                now_dt,
                            )
                        )
                conn.commit()
        finally:
            postgres_pool.putconn(conn)
    except Exception as db_err:
        logger.warning(f"Failed to cache summary to postgres: {db_err}")

    return SessionSummaryDetail(
        session_id=session_id,
        summary=summary_text,
        intent=intent_val,
        skill_level=skill_val,
        mitre_techniques=techs,
        iocs=iocs,
        created_at=now_dt,
    )


@app.get("/threat-intel", response_model=list[ThreatIntelResponse])
async def list_threat_intel(
    limit: int = Query(50, ge=1, le=200),
    severity: Optional[str] = None,
    ioc_type: Optional[str] = None,
):
    """List threat intelligence findings"""
    try:
        limit_val = int(limit)
    except Exception:
        limit_val = 50

    query = """
        SELECT
            id,
            COALESCE(ioc_type, '') as ioc_type,
            COALESCE(ioc_value, technique_name, '') as ioc_value,
            COALESCE(confidence, 0.0) as confidence,
            COALESCE(mitre_techniques, CASE WHEN technique_id IS NOT NULL AND technique_id != '' THEN ARRAY[technique_id] ELSE ARRAY[]::TEXT[] END) as mitre_techniques,
            COALESCE(mitre_tactics, CASE WHEN tactic IS NOT NULL AND tactic != '' THEN ARRAY[tactic] ELSE ARRAY[]::TEXT[] END) as mitre_tactics,
            COALESCE(severity, 'medium') as severity,
            COALESCE(context, technique_name, '') as context,
            COALESCE(enrichment, raw_data, '{}'::JSONB) as enrichment,
            created_at
        FROM threat_intelligence
        WHERE 1=1
    """
    params = []

    if severity:
        query += " AND severity = %s"
        params.append(severity)
    if ioc_type:
        query += " AND ioc_type = %s"
        params.append(ioc_type)

    query += " ORDER BY created_at DESC LIMIT %s"
    params.append(limit_val)

    conn = postgres_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
            return [
                ThreatIntelResponse(
                    id=str(r[0]),
                    ioc_type=r[1] or "",
                    ioc_value=r[2] or "",
                    confidence=float(r[3] or 0.0),
                    mitre_techniques=r[4] or [],
                    mitre_tactics=r[5] or [],
                    severity=r[6] or "medium",
                    context=r[7] or "",
                    enrichment=r[8] if isinstance(r[8], dict) else {},
                    created_at=r[9] or datetime.utcnow(),
                )
                for r in rows
            ]
    finally:
        postgres_pool.putconn(conn)


@app.get("/mitre/techniques")
async def list_mitre_techniques():
    """Get MITRE ATT&CK techniques from threat intel and ClickHouse"""
    technique_counts = {}

    # 1. Try PostgreSQL threat_intelligence
    try:
        conn = postgres_pool.getconn()
        try:
            with conn.cursor() as cur:
                cur.execute(
                    """
                    SELECT COALESCE(mitre_techniques, CASE WHEN technique_id IS NOT NULL AND technique_id != '' THEN ARRAY[technique_id] ELSE ARRAY[]::TEXT[] END)
                    FROM threat_intelligence
                    """
                )
                rows = cur.fetchall()
                for row in rows:
                    if row and row[0]:
                        for tech in row[0]:
                            technique_counts[tech] = technique_counts.get(tech, 0) + 1
        finally:
            postgres_pool.putconn(conn)
    except Exception as e:
        logger.warning(f"Failed to query postgres for mitre techniques: {e}")

    # 2. Also aggregate from ClickHouse commands (which has mitre_techniques)
    if clickhouse_client:
        try:
            ch_res = await run_ch_query(
                """
                SELECT arrayJoin(mitre_techniques) as tech, uniqExact(event_id) as cnt
                FROM clouddecept.commands
                WHERE notEmpty(mitre_techniques)
                GROUP BY tech
                ORDER BY cnt DESC
                LIMIT 50
                """
            )
            for r in ch_res.named_results():
                tech = r["tech"]
                technique_counts[tech] = technique_counts.get(tech, 0) + int(r["cnt"])
        except Exception as e:
            logger.warning(f"Failed to query ClickHouse for mitre techniques: {e}")

    sorted_techniques = sorted(
        technique_counts.items(), key=lambda x: x[1], reverse=True
    )[:50]

    return [{"technique": t, "count": c} for t, c in sorted_techniques]


@app.get("/attackers/top")
async def top_attackers(
    limit: int = Query(20, ge=1, le=100),
    hours: int = Query(168, ge=1, le=87600),
):
    """Get top attackers by session count"""
    try:
        limit_val = int(limit)
    except Exception:
        limit_val = 20
    try:
        hours_val = int(hours)
    except Exception:
        hours_val = 168

    since = datetime.utcnow() - timedelta(hours=hours_val)
    since_str = since.strftime('%Y-%m-%d %H:%M:%S')

    results = (await run_ch_query(
        f"""
        SELECT attacker_ip,
               any(country) as country,
               count() as sessions,
               uniqExact(session_id) as unique_sessions,
               sum(commands_executed) as total_commands,
               max(skill_level) as max_skill_level,
               any(intent) as primary_intent,
               max(start_time) as last_seen
        FROM clouddecept.sessions
        WHERE start_time >= '{since_str}' AND start_time <= now()
          AND attacker_ip != '' AND attacker_ip IS NOT NULL
        GROUP BY attacker_ip
        ORDER BY sessions DESC
        LIMIT {limit_val}
        """
    )).named_results()

    return list(results)


@app.get("/commands/top")
async def top_commands(
    limit: int = Query(20, ge=1, le=100),
    hours: int = Query(24, ge=1, le=87600),
):
    """Get most executed commands (deduplicated by event_id)"""
    try:
        limit_val = int(limit)
    except Exception:
        limit_val = 20
    try:
        hours_val = int(hours)
    except Exception:
        hours_val = 24

    since = datetime.utcnow() - timedelta(hours=hours_val)
    since_str = since.strftime('%Y-%m-%d %H:%M:%S')

    results = (await run_ch_query(
        f"""
        SELECT command, uniqExact(event_id) as executions,
               uniq(session_id) as unique_sessions
        FROM clouddecept.commands
        WHERE timestamp >= '{since_str}'
        GROUP BY command
        ORDER BY executions DESC
        LIMIT {limit_val}
        """
    )).named_results()

    return list(results)


@app.post("/search/sessions")
async def search_sessions(
    query: str,
    limit: int = Query(50, ge=1, le=200),
):
    """Full-text search across sessions (commands, IPs, etc.)"""
    try:
        limit_val = int(limit)
    except Exception:
        limit_val = 50

    # Search in commands
    cmd_results = (await run_ch_query(
        f"""
        SELECT DISTINCT session_id
        FROM clouddecept.commands
        WHERE command ILIKE '%{query}%' OR output ILIKE '%{query}%'
        LIMIT {limit_val}
        """
    )).named_results()

    session_ids = [r["session_id"] for r in cmd_results]

    if not session_ids:
        return []

    # Get session details
    placeholders = ",".join(f"'{sid}'" for sid in session_ids)
    sessions = (await run_ch_query(
        f"""
        SELECT session_id, start_time, end_time, duration_seconds,
               attacker_ip, country, protocol, commands_executed,
               intent, skill_level
        FROM clouddecept.sessions
        WHERE session_id IN ({placeholders})
        ORDER BY start_time DESC
        """
    )).named_results()

    return list(sessions)


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)