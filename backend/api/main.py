"""
Backend API Service - Provides REST API for dashboard and external consumers.
Queries ClickHouse (analytics), PostgreSQL (threat intel), Redis (cache/state).
"""
from __future__ import annotations

import os
from contextlib import asynccontextmanager
from datetime import datetime, timedelta
from typing import Any, Optional

import clickhouse_connect
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel, Field, ConfigDict

# Database connections
clickhouse_client = None
postgres_pool = None
redis_client = None


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
            ioc_type VARCHAR(50),
            ioc_value VARCHAR(500),
            confidence DECIMAL(3,2),
            mitre_techniques TEXT[],
            mitre_tactics TEXT[],
            severity VARCHAR(20),
            context TEXT,
            enrichment JSONB,
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

    conn = postgres_pool.getconn()
    try:
        with conn.cursor() as cur:
            for table_sql in pg_tables:
                cur.execute(table_sql)
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
        clickhouse_client.command("SELECT 1")
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
    now = datetime.utcnow()
    since = now - timedelta(hours=hours)
    since_str = since.strftime('%Y-%m-%d %H:%M:%S')
    recent_str = (now - timedelta(hours=1)).strftime('%Y-%m-%d %H:%M:%S')
    day_ago_str = (now - timedelta(days=1)).strftime('%Y-%m-%d %H:%M:%S')
    week_ago_str = (now - timedelta(days=7)).strftime('%Y-%m-%d %H:%M:%S')

    # ============================================================
    # ALL-TIME TOTALS (no time filter) - primary fields
    # ============================================================
    # Use fully qualified table names to ensure correct database
    total_sessions = clickhouse_client.command("SELECT count() FROM clouddecept.sessions")
    total_commands = clickhouse_client.command("SELECT count() FROM clouddecept.commands")
    unique_attackers = clickhouse_client.command("SELECT uniq(attacker_ip) FROM clouddecept.sessions")

    # ============================================================
    # RECENT WINDOW STATS (respects hours parameter)
    # ============================================================
    recent_sessions = clickhouse_client.command(
        f"SELECT count() FROM clouddecept.sessions WHERE start_time >= '{since_str}'"
    )
    recent_commands = clickhouse_client.command(
        f"SELECT count() FROM clouddecept.commands WHERE timestamp >= '{since_str}'"
    )
    recent_unique_attackers = clickhouse_client.command(
        f"SELECT uniq(attacker_ip) FROM clouddecept.sessions WHERE start_time >= '{since_str}'"
    )

    # ============================================================
    # ACTIVE SESSIONS (no end_time)
    # ============================================================
    # end_time is a non-nullable DateTime in ClickHouse.
    # Active sessions have end_time = epoch (1970-01-01 00:00:00).
    # Do NOT compare DateTime to empty string '' - causes CANNOT_PARSE_DATETIME.
    active_sessions = clickhouse_client.command(
        "SELECT count() FROM clouddecept.sessions WHERE end_time = '1970-01-01 00:00:00'"
    )

    # ============================================================
    # TOP INTENTS (all-time)
    # ============================================================
    top_intents = clickhouse_client.query(
        """
        SELECT intent, count() as cnt
        FROM clouddecept.sessions
        WHERE intent != '' AND intent IS NOT NULL
        GROUP BY intent
        ORDER BY cnt DESC
        LIMIT 10
        """
    ).named_results()

    # ============================================================
    # TOP COUNTRIES (all-time)
    # ============================================================
    top_countries = clickhouse_client.query(
        """
        SELECT country, count() as cnt
        FROM clouddecept.sessions
        WHERE country != '' AND country IS NOT NULL
        GROUP BY country
        ORDER BY cnt DESC
        LIMIT 10
        """
    ).named_results()

    # ============================================================
    # THREAT DISTRIBUTION (based on skill_level)
    # ============================================================
    # skill_level: 1-10, map to threat levels
    # 1-2: Low, 3-4: Medium, 5-7: High, 8-10: Critical
    threat_dist = clickhouse_client.query(
        """
        SELECT
            sum(if(skill_level >= 8, 1, 0)) as critical,
            sum(if(skill_level >= 5 AND skill_level < 8, 1, 0)) as high,
            sum(if(skill_level >= 3 AND skill_level < 5, 1, 0)) as medium,
            sum(if(skill_level < 3 AND skill_level > 0, 1, 0)) as low
        FROM clouddecept.sessions
        WHERE skill_level IS NOT NULL
        """
    ).named_results()

    # Convert generator to list for subscriptable access
    threat_rows = list(threat_dist)

    threat_distribution = []
    if threat_rows:
        row = threat_rows[0]
        threat_distribution = [
            {"level": "Critical", "count": row["critical"] or 0},
            {"level": "High", "count": row["high"] or 0},
            {"level": "Medium", "count": row["medium"] or 0},
            {"level": "Low", "count": row["low"] or 0},
        ]

    # ============================================================
    # SESSIONS PER HOUR (last 24 hours)
    # ============================================================
    sessions_per_hour = clickhouse_client.query(
        f"""
        SELECT
            formatDateTime(toStartOfHour(start_time), '%H:%M') as hour,
            count() as cnt
        FROM clouddecept.sessions
        WHERE start_time >= '{day_ago_str}'
        GROUP BY hour
        ORDER BY hour
        """
    ).named_results()

    sessions_per_hour_formatted = [
        {"hour": r["hour"], "count": r["cnt"]}
        for r in sessions_per_hour
    ]

    # ============================================================
    # COMMANDS PER DAY (last 7 days)
    # ============================================================
    commands_per_day = clickhouse_client.query(
        f"""
        SELECT
            toDate(timestamp) as day,
            count() as cnt
        FROM clouddecept.commands
        WHERE timestamp >= '{week_ago_str}'
        GROUP BY day
        ORDER BY day
        """
    ).named_results()

    commands_per_day_formatted = [
        {"date": r["day"][:10] if isinstance(r["day"], str) else str(r["day"])[:10], "count": r["cnt"]}
        for r in commands_per_day
    ]

    return StatsResponse(
        total_sessions=total_sessions,
        total_commands=total_commands,
        unique_attackers=unique_attackers,
        recent_sessions=recent_sessions,
        recent_commands=recent_commands,
        recent_unique_attackers=recent_unique_attackers,
        active_sessions=active_sessions,
        top_intents=[{"intent": r["intent"], "count": r["cnt"]} for r in top_intents],
        top_countries=[{"country": r["country"], "count": r["cnt"]} for r in top_countries],
        threat_distribution=threat_distribution,
        sessions_per_hour=sessions_per_hour_formatted,
        commands_per_day=commands_per_day_formatted,
    )


@app.get("/sessions", response_model=list[SessionSummary])
async def list_sessions(
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
    intent: Optional[str] = None,
    hours: int = Query(24, ge=1, le=87600),  # Allow up to ~10 years for all-time
):
    """List recent sessions with filters"""
    since = datetime.utcnow() - timedelta(hours=hours)
    since_str = since.strftime('%Y-%m-%d %H:%M:%S')

    where_clauses = [f"start_time >= '{since_str}'"]
    if intent:
        where_clauses.append(f"intent = '{intent}'")

    where_sql = " AND ".join(where_clauses)

    results = clickhouse_client.query(
        f"""
        SELECT session_id, start_time, end_time, duration_seconds,
               attacker_ip, country, protocol, commands_executed,
               files_transferred, credentials_tried, intent, skill_level
        FROM clouddecept.sessions
        WHERE {where_sql}
        ORDER BY start_time DESC
        LIMIT {limit} OFFSET {offset}
        """
    ).named_results()

    return [SessionSummary(**r) for r in results]


@app.get("/sessions/{session_id}", response_model=SessionSummary)
async def get_session(session_id: str):
    """Get detailed session info"""
    result = clickhouse_client.query(
        f"""
        SELECT session_id, start_time, end_time, duration_seconds,
               attacker_ip, country, protocol, commands_executed,
               files_transferred, credentials_tried, intent, skill_level,
               disconnection_reason
        FROM clouddecept.sessions
        WHERE session_id = '{session_id}'
        LIMIT 1
        """
    ).named_results()

    # Convert generator to list for subscriptable access and truthiness check
    result_rows = list(result)

    if not result_rows:
        raise HTTPException(status_code=404, detail="Session not found")

    return SessionSummary(**result_rows[0])


@app.get("/sessions/{session_id}/commands", response_model=list[CommandResponse])
async def get_session_commands(
    session_id: str,
    limit: int = Query(100, ge=1, le=500),
):
    """Get all commands for a session"""
    results = clickhouse_client.query(
        f"""
        SELECT event_id, session_id, timestamp, command, arguments,
               output, exit_code, duration_ms, intent, mitre_techniques
        FROM clouddecept.commands
        WHERE session_id = '{session_id}'
        ORDER BY timestamp ASC
        LIMIT {limit}
        """
    ).named_results()

    return [CommandResponse(**r) for r in results]


@app.get("/sessions/{session_id}/auth", response_model=list[AuthAttemptResponse])
async def get_session_auth(session_id: str):
    """Get all auth attempts for a session"""
    results = clickhouse_client.query(
        f"""
        SELECT event_id, session_id, timestamp, username, password,
               success, auth_method
        FROM clouddecept.auth_attempts
        WHERE session_id = '{session_id}'
        ORDER BY timestamp ASC
        """
    ).named_results()

    return [AuthAttemptResponse(**r) for r in results]


@app.get("/sessions/{session_id}/summary", response_model=SessionSummaryDetail)
async def get_session_summary(session_id: str):
    """Get AI-generated session summary from PostgreSQL"""
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
            if not row:
                raise HTTPException(status_code=404, detail="Summary not found")

            return SessionSummaryDetail(
                session_id=row[0],
                summary=row[1],
                intent=row[2],
                skill_level=row[3],
                mitre_techniques=row[4] or [],
                iocs=row[5] or [],
                created_at=row[6],
            )
    finally:
        postgres_pool.putconn(conn)


@app.get("/threat-intel", response_model=list[ThreatIntelResponse])
async def list_threat_intel(
    limit: int = Query(50, ge=1, le=200),
    severity: Optional[str] = None,
    ioc_type: Optional[str] = None,
):
    """List threat intelligence findings"""
    query = "SELECT id, ioc_type, ioc_value, confidence, mitre_techniques, mitre_tactics, severity, context, enrichment, created_at FROM threat_intelligence WHERE 1=1"
    params = []

    if severity:
        query += " AND severity = %s"
        params.append(severity)
    if ioc_type:
        query += " AND ioc_type = %s"
        params.append(ioc_type)

    query += " ORDER BY created_at DESC LIMIT %s"
    params.append(limit)

    conn = postgres_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute(query, params)
            rows = cur.fetchall()
            return [
                ThreatIntelResponse(
                    id=str(r[0]),
                    ioc_type=r[1],
                    ioc_value=r[2],
                    confidence=float(r[3]),
                    mitre_techniques=r[4] or [],
                    mitre_tactics=r[5] or [],
                    severity=r[6],
                    context=r[7],
                    enrichment=r[8] or {},
                    created_at=r[9],
                )
                for r in rows
            ]
    finally:
        postgres_pool.putconn(conn)


@app.get("/mitre/techniques")
async def list_mitre_techniques():
    """Get MITRE ATT&CK techniques from threat intel"""
    query = """
        SELECT mitre_techniques, count() as freq
        FROM threat_intelligence
        WHERE array_length(mitre_techniques, 1) > 0
        GROUP BY mitre_techniques
        ORDER BY freq DESC
        LIMIT 50
    """
    # This is a bit complex for SQL, fetch and process in Python
    conn = postgres_pool.getconn()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT mitre_techniques FROM threat_intelligence WHERE array_length(mitre_techniques, 1) > 0")
            rows = cur.fetchall()

        technique_counts = {}
        for row in rows:
            for tech in row[0]:
                technique_counts[tech] = technique_counts.get(tech, 0) + 1

        sorted_techniques = sorted(
            technique_counts.items(), key=lambda x: x[1], reverse=True
        )[:50]

        return [{"technique": t, "count": c} for t, c in sorted_techniques]
    finally:
        postgres_pool.putconn(conn)


@app.get("/attackers/top")
async def top_attackers(
    limit: int = Query(20, ge=1, le=100),
    hours: int = Query(168, ge=1, le=720),
):
    """Get top attackers by session count"""
    since = datetime.utcnow() - timedelta(hours=hours)
    since_str = since.strftime('%Y-%m-%d %H:%M:%S')

    results = clickhouse_client.query(
        f"""
        SELECT attacker_ip, country, count() as sessions,
               uniq(session_id) as unique_sessions,
               max(start_time) as last_seen
        FROM clouddecept.sessions
        WHERE start_time >= '{since_str}'
        GROUP BY attacker_ip, country
        ORDER BY sessions DESC
        LIMIT {limit}
        """
    ).named_results()

    return results


@app.get("/commands/top")
async def top_commands(
    limit: int = Query(20, ge=1, le=100),
    hours: int = Query(24, ge=1, le=168),
):
    """Get most executed commands"""
    since = datetime.utcnow() - timedelta(hours=hours)
    since_str = since.strftime('%Y-%m-%d %H:%M:%S')

    results = clickhouse_client.query(
        f"""
        SELECT command, count() as executions,
               uniq(session_id) as unique_sessions
        FROM clouddecept.commands
        WHERE timestamp >= '{since_str}'
        GROUP BY command
        ORDER BY executions DESC
        LIMIT {limit}
        """
    ).named_results()

    return results


@app.post("/search/sessions")
async def search_sessions(
    query: str,
    limit: int = Query(50, ge=1, le=200),
):
    """Full-text search across sessions (commands, IPs, etc.)"""
    # Search in commands
    cmd_results = clickhouse_client.query(
        f"""
        SELECT DISTINCT session_id
        FROM clouddecept.commands
        WHERE command ILIKE '%{query}%' OR output ILIKE '%{query}%'
        LIMIT {limit}
        """
    ).named_results()

    session_ids = [r["session_id"] for r in cmd_results]

    if not session_ids:
        return []

    # Get session details
    placeholders = ",".join(f"'{sid}'" for sid in session_ids)
    sessions = clickhouse_client.query(
        f"""
        SELECT session_id, start_time, end_time, duration_seconds,
               attacker_ip, country, protocol, commands_executed,
               intent, skill_level
        FROM clouddecept.sessions
        WHERE session_id IN ({placeholders})
        ORDER BY start_time DESC
        """
    ).named_results()

    return sessions


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8004)