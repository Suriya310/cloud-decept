# Backend API Service - Provides REST API for dashboard and external consumers.
# Queries ClickHouse (analytics), PostgreSQL (threat intel), Redis (cache/state).
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

        # ClickHouse
        clickhouse_client = clickhouse_connect.get_client(
            host=os.getenv("CLICKHOUSE_HOST", "clickhouse"),
            port=int(os.getenv("CLICKHOUSE_PORT", "8123")),
            username=os.getenv("CLICKHOUSE_USER", "default"),
            password=os.getenv("CLICKHOUSE_PASSWORD", ""),
            database=os.getenv("CLICKHOUSE_DB", "clouddecept"),
        )

        # Ensure database exists and is selected
        db_name = os.getenv("CLICKHOUSE_DB", "clouddecept")
        clickhouse_client.command(f"CREATE DATABASE IF NOT EXISTS {db_name}")
        clickhouse_client.command(f"USE {db_name}")

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

        # Initialize schemas - fail fast if this fails
        await init_schemas()


    async def init_schemas():
        """Create database tables if they don't exist. Raises on failure."""

        # ClickHouse tables - create with DateTime64(6) for microsecond precision
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
            TTL start_time + INTERVAL 90 DAY
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
            TTL timestamp + INTERVAL 90 DAY
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
            TTL timestamp + INTERVAL 90 DAY
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
            TTL timestamp + INTERVAL 90 DAY
            """,
        ]

        for table_sql in ch_tables:
            clickhouse_client.command(table_sql)

        # Verify tables were created
        result = clickhouse_client.query(
            "SELECT name FROM system.tables WHERE database = currentDatabase() AND name IN ('sessions', 'commands', 'auth_attempts', 'cloud_api_requests')"
        )
        created_tables = {row[0] for row in result.result_rows}
        expected_tables = {"sessions", "commands", "auth_attempts", "cloud_api_requests"}
        missing = expected_tables - created_tables
        if missing:
            raise RuntimeError(f"ClickHouse tables not created: {missing}. Created: {created_tables}")

        print(f"ClickHouse schema initialized: {created_tables}")

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

        print("PostgreSQL schema initialized")


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