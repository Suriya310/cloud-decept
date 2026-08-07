"""
Event Collector Service - Normalizes events from all sources into Redis Streams.
Consumes from: Cowrie (SSH/Telnet), Cloud API Mock, Internal services
Produces to: Redis Streams (honeypot:events, honeypot:commands, etc.)
Also consumes from Redis Streams and writes to ClickHouse for analytics.
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import uuid
from contextlib import asynccontextmanager
from datetime import datetime
from typing import Any, Optional

import clickhouse_connect
import httpx
import redis.asyncio as redis
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field, ConfigDict

from backend.schemas.events import (
    AuthEvent,
    BaseEvent,
    CloudAPIEvent,
    CommandEvent,
    ConsumerGroups,
    EventEnvelope,
    EventSource,
    EventTypes,
    FileTransferEvent,
    NetworkConnectionEvent,
    SessionEndEvent,
    SessionStartEvent,
    StreamNames,
)

# Configure logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("event-collector")


class EventCollector:
    """Main event collector managing Redis Streams and ClickHouse sync"""

    def __init__(self):
        self.redis_url = os.getenv("REDIS_URL", "redis://redis:6379")
        self.redis: Optional[redis.Redis] = None
        self.running = False
        self.consumer_task: Optional[asyncio.Task] = None

        # ClickHouse configuration
        self.clickhouse_host = os.getenv("CLICKHOUSE_HOST", "clickhouse")
        self.clickhouse_port = int(os.getenv("CLICKHOUSE_PORT", "8123"))
        self.clickhouse_user = os.getenv("CLICKHOUSE_USER", "default")
        self.clickhouse_password = os.getenv("CLICKHOUSE_PASSWORD", "")
        self.clickhouse_db = os.getenv("CLICKHOUSE_DB", "clouddecept")
        self.clickhouse_client = None

    async def initialize(self):
        """Initialize Redis and ClickHouse connections"""
        # Redis
        self.redis = redis.from_url(
            self.redis_url,
            encoding="utf-8",
            decode_responses=True,
            max_connections=20,
        )
        await self.redis.ping()
        logger.info("Redis connection established")

        # ClickHouse
        await self._init_clickhouse()

        # Create consumer groups
        await self._create_consumer_groups()

    async def _create_consumer_groups(self):
        """Create consumer groups for each stream"""
        streams = [
            StreamNames.HONEYPOT_EVENTS,
            StreamNames.AUTH_EVENTS,
            StreamNames.COMMAND_EVENTS,
            StreamNames.CLOUD_API_EVENTS,
            StreamNames.FILE_EVENTS,
            StreamNames.NETWORK_EVENTS,
            StreamNames.SESSION_EVENTS,
        ]

        for stream in streams:
            try:
                await self.redis.xgroup_create(
                    stream, ConsumerGroups.EVENT_COLLECTOR, id="0", mkstream=True
                )
            except redis.ResponseError as e:
                if "BUSYGROUP" not in str(e):
                    logger.warning(f"Could not create group for {stream}: {e}")

    async def close(self):
        """Close Redis and ClickHouse connections"""
        self.running = False

        # Cancel consumer task
        if self.consumer_task:
            self.consumer_task.cancel()
            try:
                await self.consumer_task
            except asyncio.CancelledError:
                pass

        if self.redis:
            await self.redis.close()
        if self.clickhouse_client:
            self.clickhouse_client.close()

    async def publish_event(self, event: BaseEvent) -> str:
        """Publish event to appropriate Redis Stream"""
        if not self.redis:
            raise RuntimeError("Redis not initialized")

        # Determine stream based on event type
        stream_name = self._get_stream_for_event(event)
        logger.debug(f"Event {event.event_id} type={event.__class__.__name__} -> stream={stream_name}")
        envelope = EventEnvelope(
            event_type=event.__class__.__name__.replace("Event", "").lower(),
            payload=event,
            stream_name=stream_name,
            partition_key=event.session_id,
        )

        # Serialize to JSON
        event_data = envelope.model_dump_json()

        # Publish to stream
        msg_id = await self.redis.xadd(stream_name, {"data": event_data})
        logger.info(f"XADD success: stream={stream_name} msg_id={msg_id} event_id={event.event_id}")
        return msg_id

    def _get_stream_for_event(self, event: BaseEvent) -> str:
        """Map event type to Redis Stream"""
        mapping = {
            AuthEvent: StreamNames.AUTH_EVENTS,
            CommandEvent: StreamNames.COMMAND_EVENTS,
            CloudAPIEvent: StreamNames.CLOUD_API_EVENTS,
            FileTransferEvent: StreamNames.FILE_EVENTS,
            NetworkConnectionEvent: StreamNames.NETWORK_EVENTS,
            SessionStartEvent: StreamNames.SESSION_EVENTS,
            SessionEndEvent: StreamNames.SESSION_EVENTS,
        }
        return mapping.get(type(event), StreamNames.HONEYPOT_EVENTS)

    async def consume_events(
        self,
        stream: str,
        group: str,
        consumer: str,
        count: int = 10,
        block_ms: int = 5000,
    ) -> list[dict]:
        """Consume events from a stream using consumer group"""
        if not self.redis:
            raise RuntimeError("Redis not initialized")

        try:
            results = await self.redis.xreadgroup(
                group, consumer, {stream: ">"}, count=count, block=block_ms
            )
            events = []
            for stream_name, messages in results:
                for msg_id, msg_data in messages:
                    try:
                        envelope_data = json.loads(msg_data["data"])
                        events.append({
                            "id": msg_id,
                            "stream": stream_name,
                            "data": envelope_data,
                        })
                    except Exception as e:
                        logger.error(f"Failed to parse event {msg_id}: {e}")
            return events
        except redis.ResponseError as e:
            logger.error(f"Error consuming from {stream}: {e}")
            return []

    async def _init_clickhouse(self):
        """Initialize ClickHouse connection and create tables if needed"""
        try:
            self.clickhouse_client = clickhouse_connect.get_client(
                host=self.clickhouse_host,
                port=self.clickhouse_port,
                username=self.clickhouse_user,
                password=self.clickhouse_password,
            )
            # Create database if not exists
            self.clickhouse_client.command(f"CREATE DATABASE IF NOT EXISTS {self.clickhouse_db}")
            self.clickhouse_client.command(f"USE {self.clickhouse_db}")
            logger.info(f"ClickHouse connected to database '{self.clickhouse_db}'")

            # Create tables with DateTime64(6) to match backend-api schema
            tables = [
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
            for table_sql in tables:
                self.clickhouse_client.command(table_sql)
            logger.info("ClickHouse tables verified/created")

        except Exception as e:
            logger.error(f"Failed to initialize ClickHouse: {e}")
            raise

    async def _write_events_to_clickhouse(self, events: list[dict]):
        """Write parsed events to ClickHouse tables"""
        if not self.clickhouse_client or not events:
            return

        def parse_dt(value: Any) -> datetime:
            """Parse ISO datetime string to datetime object"""
            if isinstance(value, datetime):
                return value
            if isinstance(value, str):
                # Handle ISO format with Z or without
                return datetime.fromisoformat(value.replace("Z", "+00:00"))
            return datetime.utcnow()

        # Group events by stream/type
        sessions = []
        commands = []
        auth_attempts = []
        cloud_api = []

        for ev in events:
            data = ev.get("data", {})
            payload = data.get("payload", {})
            event_type = data.get("event_type", "")
            stream = ev.get("stream", "")

            try:
                if event_type == "session_start" or stream == StreamNames.SESSION_EVENTS:
                    # SessionStartEvent
                    sessions.append((
                        payload.get("session_id", ""),
                        parse_dt(payload.get("timestamp", datetime.utcnow())),
                        None,  # end_time
                        0,     # duration_seconds
                        payload.get("client_ip", payload.get("attacker_ip", "")),
                        payload.get("country", ""),
                        payload.get("asn", ""),
                        payload.get("protocol", "ssh"),
                        0,  # commands_executed
                        0,  # files_transferred
                        0,  # credentials_tried
                        "", # intent
                        0,  # skill_level
                        "", # disconnection_reason
                    ))
                elif event_type == "session_end" or stream == StreamNames.SESSION_EVENTS:
                    # SessionEndEvent - we'd need to update existing session, for now skip
                    # Could implement upsert logic later
                    pass
                elif event_type == "command" or stream == StreamNames.COMMAND_EVENTS:
                    commands.append((
                        payload.get("event_id", str(uuid.uuid4())),
                        payload.get("session_id", ""),
                        parse_dt(payload.get("timestamp", datetime.utcnow())),
                        payload.get("command", ""),
                        payload.get("arguments", []),
                        payload.get("output", ""),
                        payload.get("exit_code", 0),
                        payload.get("duration_ms", 0),
                        payload.get("intent", ""),
                        payload.get("mitre_techniques", []),
                    ))
                elif event_type == "auth" or stream == StreamNames.AUTH_EVENTS:
                    auth_attempts.append((
                        payload.get("event_id", str(uuid.uuid4())),
                        payload.get("session_id", ""),
                        parse_dt(payload.get("timestamp", datetime.utcnow())),
                        payload.get("username", ""),
                        payload.get("password", ""),
                        1 if payload.get("success", False) else 0,
                        payload.get("auth_method", "password"),
                    ))
                elif event_type == "cloud_api" or stream == StreamNames.CLOUD_API_EVENTS:
                    cloud_api.append((
                        payload.get("event_id", str(uuid.uuid4())),
                        payload.get("session_id", ""),
                        parse_dt(payload.get("timestamp", datetime.utcnow())),
                        payload.get("cloud_provider", ""),
                        payload.get("http_method", ""),
                        payload.get("endpoint", ""),
                        payload.get("path", ""),
                        payload.get("response_status", 0),
                        payload.get("duration_ms", 0),
                    ))
            except Exception as e:
                logger.error(f"Failed to prepare event for ClickHouse: {e}")

        # Batch insert
        try:
            if sessions:
                self.clickhouse_client.insert(
                    "sessions",
                    sessions,
                    column_names=[
                        "session_id", "start_time", "end_time", "duration_seconds",
                        "attacker_ip", "country", "asn", "protocol",
                        "commands_executed", "files_transferred", "credentials_tried",
                        "intent", "skill_level", "disconnection_reason"
                    ]
                )
                logger.debug(f"Inserted {len(sessions)} sessions to ClickHouse")

            if commands:
                self.clickhouse_client.insert(
                    "commands",
                    commands,
                    column_names=[
                        "event_id", "session_id", "timestamp", "command",
                        "arguments", "output", "exit_code", "duration_ms",
                        "intent", "mitre_techniques"
                    ]
                )
                logger.debug(f"Inserted {len(commands)} commands to ClickHouse")

            if auth_attempts:
                self.clickhouse_client.insert(
                    "auth_attempts",
                    auth_attempts,
                    column_names=[
                        "event_id", "session_id", "timestamp", "username",
                        "password", "success", "auth_method"
                    ]
                )
                logger.debug(f"Inserted {len(auth_attempts)} auth attempts to ClickHouse")

            if cloud_api:
                self.clickhouse_client.insert(
                    "cloud_api_requests",
                    cloud_api,
                    column_names=[
                        "event_id", "session_id", "timestamp", "cloud_provider",
                        "http_method", "endpoint", "path", "response_status",
                        "duration_ms"
                    ]
                )
                logger.debug(f"Inserted {len(cloud_api)} cloud API requests to ClickHouse")

        except Exception as e:
            logger.error(f"Failed to insert events to ClickHouse: {e}")

    async def _consumer_loop(self):
        """Background task that consumes from Redis streams and writes to ClickHouse"""
        logger.info("Starting ClickHouse consumer loop")
        self.running = True

        # Streams to consume from with their consumer group
        streams_to_consume = [
            (StreamNames.SESSION_EVENTS, "sessions"),
            (StreamNames.COMMAND_EVENTS, "commands"),
            (StreamNames.AUTH_EVENTS, "auth"),
            (StreamNames.CLOUD_API_EVENTS, "cloud_api"),
        ]

        consumer_name = f"clickhouse-writer-{uuid.uuid4().hex[:8]}"

        while self.running:
            try:
                all_events = []
                for stream, _ in streams_to_consume:
                    events = await self.consume_events(
                        stream=stream,
                        group=ConsumerGroups.EVENT_COLLECTOR,
                        consumer=consumer_name,
                        count=50,
                        block_ms=2000,
                    )
                    all_events.extend(events)

                if all_events:
                    await self._write_events_to_clickhouse(all_events)
                    logger.info(f"Processed {len(all_events)} events to ClickHouse")

                await asyncio.sleep(1)  # Small delay between batches

            except asyncio.CancelledError:
                logger.info("Consumer loop cancelled")
                break
            except Exception as e:
                logger.error(f"Error in consumer loop: {e}")
                await asyncio.sleep(5)  # Back off on error

        logger.info("Consumer loop stopped")


# --- FastAPI Application ---

collector = EventCollector()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    await collector.initialize()

    # Start ClickHouse consumer task
    collector.consumer_task = asyncio.create_task(collector._consumer_loop())
    logger.info("ClickHouse consumer task started")

    yield

    # Shutdown
    await collector.close()


app = FastAPI(
    title="CloudDecept Event Collector",
    version="1.0.0",
    lifespan=lifespan,
)


class IngestRequest(BaseModel):
    """Request to ingest external event (e.g., from Cowrie JSON logs)"""
    model_config = ConfigDict(use_enum_values=True)

    source: EventSource
    event_type: str  # auth, command, cloud_api, file_transfer, etc.
    session_id: str
    attacker_ip: str
    timestamp: Optional[datetime] = None
    payload: dict[str, Any]


class IngestResponse(BaseModel):
    event_id: str
    stream: str
    message_id: str
    success: bool
    error: Optional[str] = None


@app.get("/health")
async def health():
    checks = {"redis": "unknown", "clickhouse": "unknown"}

    # Check Redis
    try:
        await collector.redis.ping()
        checks["redis"] = "healthy"
    except Exception:
        checks["redis"] = "unhealthy"

    # Check ClickHouse
    try:
        if collector.clickhouse_client:
            collector.clickhouse_client.command("SELECT 1")
            checks["clickhouse"] = "healthy"
        else:
            checks["clickhouse"] = "not_initialized"
    except Exception:
        checks["clickhouse"] = "unhealthy"

    overall = "healthy" if all(v == "healthy" for v in checks.values()) else "degraded"
    return {"status": overall, **checks}


@app.post("/ingest", response_model=IngestResponse)
async def ingest_event(request: IngestRequest):
    """Ingest event from external source (Cowrie, Cloud API Mock, etc.)"""
    logger.info(f"Received single ingest: source={request.source}, type={request.event_type}, session={request.session_id}")
    try:
        event = _create_event_from_request(request)
        msg_id = await collector.publish_event(event)

        return IngestResponse(
            event_id=event.event_id,
            stream=collector._get_stream_for_event(event),
            message_id=msg_id,
            success=True,
        )
    except Exception as e:
        logger.error(f"Failed to ingest event: {e}", exc_info=True)
        return IngestResponse(
            event_id="",
            stream="",
            message_id="",
            success=False,
            error=str(e),
        )


@app.post("/ingest/batch", response_model=list[IngestResponse])
async def ingest_batch(requests: list[IngestRequest]):
    """Ingest multiple events at once"""
    logger.info(f"Received batch ingest: {len(requests)} events")
    results = []
    for i, req in enumerate(requests):
        try:
            logger.debug(f"Processing event {i}: source={req.source}, type={req.event_type}, session={req.session_id}")
            event = _create_event_from_request(req)
            logger.debug(f"Created event: {event.__class__.__name__}, event_id={event.event_id}")
            msg_id = await collector.publish_event(event)
            logger.info(f"Published event {event.event_id} to stream (msg_id={msg_id})")
            results.append(IngestResponse(
                event_id=event.event_id,
                stream=collector._get_stream_for_event(event),
                message_id=msg_id,
                success=True,
            ))
        except Exception as e:
            logger.error(f"Failed to ingest event {i}: {e}", exc_info=True)
            results.append(IngestResponse(
                event_id="",
                stream="",
                message_id="",
                success=False,
                error=str(e),
            ))
    success_count = sum(1 for r in results if r.success)
    logger.info(f"Batch complete: {success_count}/{len(requests)} succeeded")
    return results


def _create_event_from_request(request: IngestRequest) -> BaseEvent:
    """Create appropriate event object from ingest request"""
    logger.debug(f"_create_event_from_request: event_type={request.event_type}, payload_keys={list(request.payload.keys())}")
    base_kwargs = {
        "source": request.source,
        "session_id": request.session_id,
        "attacker_ip": request.attacker_ip,
        "timestamp": request.timestamp or datetime.utcnow(),
        "metadata": request.payload.get("metadata", {}),
    }

    event_map = {
        "auth": AuthEvent,
        "command": CommandEvent,
        "cloud_api": CloudAPIEvent,
        "file_transfer": FileTransferEvent,
        "network_connection": NetworkConnectionEvent,
        "session_start": SessionStartEvent,
        "session_end": SessionEndEvent,
    }

    event_class = event_map.get(request.event_type)
    if not event_class:
        raise ValueError(f"Unknown event type: {request.event_type}")

    # Merge base kwargs with payload
    kwargs = {**base_kwargs, **request.payload}
    logger.debug(f"Creating {event_class.__name__} with kwargs: {list(kwargs.keys())}")
    event = event_class(**kwargs)
    logger.debug(f"Created event: {event.__class__.__name__} event_id={event.event_id}")
    return event


@app.get("/streams")
async def list_streams():
    """List available streams and their info"""
    streams = [
        StreamNames.HONEYPOT_EVENTS,
        StreamNames.AUTH_EVENTS,
        StreamNames.COMMAND_EVENTS,
        StreamNames.CLOUD_API_EVENTS,
        StreamNames.FILE_EVENTS,
        StreamNames.NETWORK_EVENTS,
        StreamNames.SESSION_EVENTS,
        StreamNames.INTENT_PREDICTIONS,
        StreamNames.ADAPTATIONS,
        StreamNames.THREAT_INTEL,
        StreamNames.LLM_REQUESTS,
        StreamNames.LLM_RESPONSES,
        StreamNames.HEALTH_CHECKS,
        StreamNames.METRICS,
        StreamNames.DEAD_LETTER,
    ]

    info = {}
    for stream in streams:
        try:
            length = await collector.redis.xlen(stream)
            info[stream] = {"length": length}
        except Exception:
            info[stream] = {"length": 0, "error": "unavailable"}
    return info


@app.get("/consumer-groups")
async def list_consumer_groups():
    """List consumer groups for monitoring"""
    streams = [
        StreamNames.HONEYPOT_EVENTS,
        StreamNames.COMMAND_EVENTS,
        StreamNames.CLOUD_API_EVENTS,
        StreamNames.SESSION_EVENTS,
    ]

    groups = {}
    for stream in streams:
        try:
            group_info = await collector.redis.xinfo_groups(stream)
            groups[stream] = group_info
        except Exception as e:
            groups[stream] = {"error": str(e)}
    return groups


@app.get("/events/stream")
async def event_stream(
    request: Request,
    streams: str = "honeypot:events",
    last_id: str = "0",
    limit: int = 100,
):
    """
    Server-Sent Events endpoint for real-time event streaming.

    Query params:
    - streams: comma-separated list of stream names (default: honeypot:events)
    - last_id: resume from this message ID (default: "0" for all)
    - limit: max events per poll (default: 100)
    """
    stream_list = [s.strip() for s in streams.split(",") if s.strip()]

    if not stream_list:
        stream_list = [StreamNames.HONEYPOT_EVENTS]

    async def event_generator():
        # Send initial connection event
        yield f"data: {json.dumps({'type': 'connected', 'streams': stream_list})}\n\n"

        # Track last message ID per stream to avoid replaying
        last_ids = {stream: last_id for stream in stream_list}

        try:
            while True:
                # Check if client disconnected
                if await request.is_disconnected():
                    logger.debug("Client disconnected from SSE stream")
                    break

                # Read from all requested streams
                streams_dict = {stream: last_ids[stream] for stream in stream_list}

                try:
                    results = await collector.redis.xread(
                        streams_dict, count=limit, block=5000
                    )

                    for stream_name, messages in results:
                        for msg_id, msg_data in messages:
                            try:
                                yield f"data: {msg_data['data']}\n\n"
                            except Exception as e:
                                logger.error(f"Failed to yield event {msg_id}: {e}")
                            last_ids[stream_name] = msg_id

                except redis.ResponseError as e:
                    logger.error(f"Error reading from streams: {e}")
                    yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"
                    await asyncio.sleep(1)

                # Small delay to prevent tight loop
                await asyncio.sleep(0.1)

        except asyncio.CancelledError:
            logger.debug("SSE stream cancelled")
        except Exception as e:
            logger.error(f"SSE stream error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",  # Disable nginx buffering
        },
    )


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)