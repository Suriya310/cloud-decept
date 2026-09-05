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
import socket
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
        self._autoclaim_cursors: dict[str, str] = {}

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
        # Convert event to dict to preserve all concrete type fields
        event_dict = event.model_dump(mode='json')

        # Map to canonical event_type string (e.g. SessionStartEvent -> session_start)
        event_type_name = {
            SessionStartEvent: "session_start",
            SessionEndEvent: "session_end",
            CommandEvent: "command",
            AuthEvent: "auth",
            CloudAPIEvent: "cloud_api",
            FileTransferEvent: "file_transfer",
            NetworkConnectionEvent: "network_connection",
        }.get(type(event), event.__class__.__name__.replace("Event", "").lower())

        envelope = EventEnvelope(
            event_type=event_type_name,
            payload=event_dict,
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
    ) -> tuple[list[dict], list[str]]:
        """Consume events from a stream using consumer group
        Returns: (events, message_ids)
        Only returns message_ids for successfully parsed events - unparseable messages are NOT added to message_ids
        so they won't be ACKed and will remain in PEL for inspection/retry.
        """
        if not self.redis:
            raise RuntimeError("Redis not initialized")

        try:
            results = await self.redis.xreadgroup(
                group, consumer, {stream: ">"}, count=count, block=block_ms
            )
            events = []
            message_ids = []
            for stream_name, messages in results:
                for msg_id, msg_data in messages:
                    try:
                        envelope_data = json.loads(msg_data["data"])
                        events.append({
                            "id": msg_id,
                            "stream": stream_name,
                            "data": envelope_data,
                        })
                        message_ids.append(msg_id)
                    except Exception as e:
                        logger.error(f"Failed to parse event {msg_id}: {e}")
                        # IMPORTANT: Do NOT add msg_id to message_ids - we want it to stay in PEL
                        # so it can be inspected/redelivered. ACKing unparseable messages loses them.
            return events, message_ids
        except redis.ResponseError as e:
            logger.error(f"Error consuming from {stream}: {e}")
            return [], []

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
            # TTL expressions need toDateTime() conversion for DateTime64 columns
            # Use ReplacingMergeTree for idempotent inserts - deduplicates by event_id on merge
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
                ) ENGINE = ReplacingMergeTree(start_time) ORDER BY (start_time, session_id)
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
                ) ENGINE = ReplacingMergeTree(timestamp) ORDER BY (event_id, timestamp, session_id)
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
                ) ENGINE = ReplacingMergeTree(timestamp) ORDER BY (event_id, timestamp, session_id)
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
                ) ENGINE = ReplacingMergeTree(timestamp) ORDER BY (event_id, timestamp, session_id)
                PARTITION BY toYYYYMM(timestamp)
                TTL toDateTime(timestamp) + INTERVAL 90 DAY
                """,
            ]
            for table_sql in tables:
                self.clickhouse_client.command(table_sql)
            logger.info("ClickHouse tables verified/created")

        except Exception as e:
            logger.error(f"Failed to initialize ClickHouse: {e}")
            raise

    def _write_events_to_clickhouse_sync(self, events: list[dict]):
        """Synchronously write parsed events to ClickHouse tables.

        Executed in a background thread via asyncio.to_thread to prevent
        blocking the Uvicorn/FastAPI event loop.
        Raises Exception on any insert failure so caller can avoid ACKing.
        Uses ReplacingMergeTree for idempotent inserts - duplicates are deduplicated on merge.
        """
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

        def safe_int(value: Any, default: int = 0) -> int:
            """Safely convert value to int, defaulting to 0 for None/invalid"""
            if value is None:
                return default
            try:
                return int(value)
            except (ValueError, TypeError):
                return default

        def safe_list(value: Any) -> list:
            """Safely convert value to list, defaulting to [] for None"""
            if value is None:
                return []
            if isinstance(value, list):
                return value
            return []

        def safe_str(value: Any, default: str = "") -> str:
            """Safely convert value to string, defaulting to empty string for None"""
            if value is None:
                return default
            return str(value)

        # Group events by stream/type
        sessions = []
        commands = []
        auth_attempts = []
        cloud_api = []

        for ev in events:
            # The event data is wrapped in an EventEnvelope with the actual event in the "payload" field
            envelope = ev.get("data", {})
            # The actual event data is in the envelope's "payload" field for event-specific data
            # The actual event data including session_id, timestamp, attacker_ip is in the payload
            event_data = envelope.get("payload", envelope)
            event_type = envelope.get("event_type", "")
            stream = envelope.get("stream_name", "")

            try:
                if event_type in ("session_start", "sessionstart"):
                    # SessionStartEvent - top-level fields in envelope, payload-specific in event_data
                    start_time = parse_dt(event_data.get("timestamp", datetime.utcnow()))
                    sessions.append((
                        safe_str(event_data.get("session_id")),
                        start_time,
                        start_time,  # end_time placeholder (updated on session_end)
                        0,     # duration_seconds
                        safe_str(event_data.get("attacker_ip") or event_data.get("client_ip")),
                        safe_str(event_data.get("country")),
                        safe_str(event_data.get("asn")),
                        safe_str(event_data.get("protocol", "ssh")),
                        0,  # commands_executed
                        0,  # files_transferred
                        0,  # credentials_tried
                        safe_str(event_data.get("intent", "")),
                        0,  # skill_level
                        safe_str(event_data.get("disconnection_reason", "")),
                    ))
                elif event_type in ("session_end", "sessionend"):
                    session_id = safe_str(event_data.get("session_id"))
                    if session_id:
                        end_time = parse_dt(event_data.get("timestamp", datetime.utcnow()))
                        duration = safe_int(event_data.get("duration_seconds", 0))
                        disconnection_reason = safe_str(event_data.get("disconnection_reason", ""))
                        try:
                            # Count commands and auth attempts recorded for this session
                            cmd_cnt = safe_int(self.clickhouse_client.command(f"SELECT count() FROM {self.clickhouse_db}.commands WHERE session_id = '{session_id}'"))
                            auth_cnt = safe_int(self.clickhouse_client.command(f"SELECT count() FROM {self.clickhouse_db}.auth_attempts WHERE session_id = '{session_id}'"))
                            escaped_reason = disconnection_reason.replace("'", "''")
                            update_sql = (
                                f"ALTER TABLE {self.clickhouse_db}.sessions UPDATE "
                                f"end_time = '{end_time.strftime('%Y-%m-%d %H:%M:%S')}', "
                                f"duration_seconds = {duration}, "
                                f"commands_executed = {cmd_cnt}, "
                                f"credentials_tried = {auth_cnt}, "
                                f"disconnection_reason = '{escaped_reason}' "
                                f"WHERE session_id = '{session_id}'"
                            )
                            self.clickhouse_client.command(update_sql)
                            logger.info(f"Updated session {session_id} with end_time={end_time}, duration={duration}s, cmds={cmd_cnt}, auth={auth_cnt}")
                        except Exception as e:
                            logger.error(f"Failed to update session_end for {session_id}: {e}", exc_info=True)
                elif event_type == "command" or stream == StreamNames.COMMAND_EVENTS:
                    cmd = safe_str(event_data.get("command"))
                    logger.debug(f"Preparing command for ClickHouse: session={event_data.get('session_id')}, command={cmd[:50] if cmd else 'empty'}")
                    commands.append((
                        safe_str(event_data.get("event_id", str(uuid.uuid4()))),
                        safe_str(event_data.get("session_id")),
                        parse_dt(event_data.get("timestamp", datetime.utcnow())),
                        cmd,
                        safe_list(event_data.get("arguments")),
                        safe_str(event_data.get("output")),
                        safe_int(event_data.get("exit_code")),
                        safe_int(event_data.get("duration_ms")),
                        "",
                        safe_list(event_data.get("mitre_techniques")),
                    ))
                elif event_type == "auth" or stream == StreamNames.AUTH_EVENTS:
                    auth_attempts.append((
                        safe_str(event_data.get("event_id", str(uuid.uuid4()))),
                        safe_str(event_data.get("session_id")),
                        parse_dt(event_data.get("timestamp", datetime.utcnow())),
                        safe_str(event_data.get("username")),
                        safe_str(event_data.get("password")),
                        1 if event_data.get("success", False) else 0,
                        safe_str(event_data.get("auth_method", "password")),
                    ))
                elif event_type == "cloud_api" or stream == StreamNames.CLOUD_API_EVENTS:
                    cloud_api.append((
                        safe_str(event_data.get("event_id", str(uuid.uuid4()))),
                        safe_str(event_data.get("session_id")),
                        parse_dt(event_data.get("timestamp", datetime.utcnow())),
                        safe_str(event_data.get("cloud_provider")),
                        safe_str(event_data.get("http_method")),
                        safe_str(event_data.get("endpoint")),
                        safe_str(event_data.get("path")),
                        safe_int(event_data.get("response_status")),
                        safe_int(event_data.get("duration_ms")),
                    ))
            except Exception as e:
                logger.error(f"Failed to prepare event for ClickHouse: {e}", exc_info=True)
                raise  # Re-raise to prevent ACK on preparation failure

        # Log batch counts before insert
        logger.info(f"Batch insert counts: sessions={len(sessions)}, commands={len(commands)}, auth={len(auth_attempts)}, cloud_api={len(cloud_api)}")

        # Batch insert - RAISE on any failure so caller doesn't ACK
        # Each type independently so we can log specific failures
        if sessions:
            try:
                self.clickhouse_client.insert(
                    f"{self.clickhouse_db}.sessions",
                    sessions,
                    column_names=[
                        "session_id", "start_time", "end_time", "duration_seconds",
                        "attacker_ip", "country", "asn", "protocol",
                        "commands_executed", "files_transferred", "credentials_tried",
                        "intent", "skill_level", "disconnection_reason"
                    ]
                )
                logger.info(f"Inserted {len(sessions)} sessions to ClickHouse")
            except Exception as e:
                logger.error(f"Failed to insert sessions: {e}", exc_info=True)
                raise

        if commands:
            try:
                self.clickhouse_client.insert(
                    f"{self.clickhouse_db}.commands",
                    commands,
                    column_names=[
                        "event_id", "session_id", "timestamp", "command",
                        "arguments", "output", "exit_code", "duration_ms",
                        "intent", "mitre_techniques"
                    ]
                )
                logger.info(f"Inserted {len(commands)} commands to ClickHouse")
                for cmd in commands[:3]:  # Log first 3 commands for verification
                    logger.info(f"  CMD: session={cmd[1]}, command={cmd[3][:50] if cmd[3] else 'empty'}")
            except Exception as e:
                logger.error(f"Failed to insert commands: {e}", exc_info=True)
                raise

        if auth_attempts:
            try:
                self.clickhouse_client.insert(
                    f"{self.clickhouse_db}.auth_attempts",
                    auth_attempts,
                    column_names=[
                        "event_id", "session_id", "timestamp", "username",
                        "password", "success", "auth_method"
                    ]
                )
                logger.info(f"Inserted {len(auth_attempts)} auth attempts to ClickHouse")
            except Exception as e:
                logger.error(f"Failed to insert auth_attempts: {e}", exc_info=True)
                raise

        if cloud_api:
            try:
                self.clickhouse_client.insert(
                    f"{self.clickhouse_db}.cloud_api_requests",
                    cloud_api,
                    column_names=[
                        "event_id", "session_id", "timestamp", "cloud_provider",
                        "http_method", "endpoint", "path", "response_status",
                        "duration_ms"
                    ]
                )
                logger.info(f"Inserted {len(cloud_api)} cloud API requests to ClickHouse")
            except Exception as e:
                logger.error(f"Failed to insert cloud_api_requests: {e}", exc_info=True)
                raise

    async def _write_events_to_clickhouse(self, events: list[dict]):
        """Write parsed events to ClickHouse tables asynchronously via worker thread.

        Offloads blocking synchronous ClickHouse inserts and queries to a thread pool
        to keep the Uvicorn/FastAPI event loop completely free for HTTP requests.
        Raises Exception on any insert failure so caller can avoid ACKing.
        Uses ReplacingMergeTree for idempotent inserts - duplicates are deduplicated on merge.
        """
        if not self.clickhouse_client or not events:
            return
        await asyncio.to_thread(self._write_events_to_clickhouse_sync, events)

    async def _ack_messages_with_retry(
        self, stream: str, message_ids: list[str], max_retries: int = 3, base_delay: float = 0.5
    ) -> bool:
        """ACK messages with exponential backoff retry.

        Returns True if all messages were ACKed, False if any failed after all retries.
        """
        if not self.redis or not message_ids:
            return True

        failed_ids = []
        try:
            await self.redis.xack(ConsumerGroups.EVENT_COLLECTOR, stream, *message_ids)
            logger.debug(f"ACKed {len(message_ids)} messages from {stream}")
            return True
        except Exception as e:
            logger.error(f"Failed to batch ACK messages from {stream}: {e}")
            failed_ids = list(message_ids)

        for attempt in range(max_retries):
            if not failed_ids:
                return True
            delay = base_delay * (2 ** attempt)
            logger.info(
                f"Retrying failed XACKs for {stream} (attempt {attempt + 1}/{max_retries}) after {delay}s delay"
            )
            await asyncio.sleep(delay)
            try:
                await self.redis.xack(ConsumerGroups.EVENT_COLLECTOR, stream, *failed_ids)
                logger.debug(f"Retry ACKed {len(failed_ids)} messages from {stream}")
                return True
            except Exception as e:
                logger.error(f"Retry ACK attempt {attempt + 1} failed for {stream}: {e}")

        logger.warning(
            f"{len(failed_ids)} messages from {stream} failed to XACK after {max_retries} retries; "
            f"they will remain in PEL and may be reclaimed by XAUTOCLAIM"
        )
        return False

    async def _consumer_loop(self):
        """Background task that consumes from Redis streams and writes to ClickHouse.

        Prioritizes fresh incoming events over recovering old orphaned messages
        to avoid queue starvation when historical PEL is large.
        """
        logger.info("Starting ClickHouse consumer loop")
        self.running = True

        # Streams to consume from with their consumer group
        streams_to_consume = [
            (StreamNames.SESSION_EVENTS, "sessions"),
            (StreamNames.COMMAND_EVENTS, "commands"),
            (StreamNames.AUTH_EVENTS, "auth"),
            (StreamNames.CLOUD_API_EVENTS, "cloud_api"),
        ]

        # Use stable consumer identity based on hostname (consistent across restarts in Docker)
        # This preserves the Pending Entries List (PEL) across container restarts
        self.consumer_name = f"clickhouse-writer-{socket.gethostname()}"
        logger.info(f"Consumer name: {self.consumer_name}, group: {ConsumerGroups.EVENT_COLLECTOR}")

        # Track when we last ran XAUTOCLAIM to reclaim orphaned messages from previous consumers
        last_autoclaim = 0
        autoclaim_interval_sec = 30  # Run XAUTOCLAIM every 30 seconds

        while self.running:
            try:
                all_events = []
                stream_to_ids_map = {}  # Map stream -> list of message IDs

                # STEP 1 (High Priority): Always consume fresh incoming events first (">")
                for stream, stream_type in streams_to_consume:
                    events, message_ids = await self.consume_events(
                        stream=stream,
                        group=ConsumerGroups.EVENT_COLLECTOR,
                        consumer=self.consumer_name,
                        count=50,
                        block_ms=1000,
                    )
                    if events:
                        logger.info(f"Consumed {len(events)} events from {stream} (type={stream_type})")
                        event_types = {}
                        for ev in events:
                            et = ev.get("data", {}).get("event_type", "unknown")
                            event_types[et] = event_types.get(et, 0) + 1
                        logger.debug(f"Event types from {stream}: {event_types}")
                        all_events.extend(events)
                        if message_ids:
                            stream_to_ids_map[stream] = message_ids

                if all_events:
                    await self._write_events_to_clickhouse(all_events)
                    logger.info(f"Processed {len(all_events)} events to ClickHouse")

                    # ACK all successfully processed messages with retry logic
                    for stream, message_ids in stream_to_ids_map.items():
                        if message_ids:
                            await self._ack_messages_with_retry(stream, message_ids)

                # STEP 2 (Background Recovery): Periodically reclaim orphaned messages from dead/old consumers
                # Strictly bounded per cycle so fresh ingestion is never starved
                now = asyncio.get_event_loop().time()
                if now - last_autoclaim >= autoclaim_interval_sec:
                    last_autoclaim = now
                    await self._reclaim_orphaned_messages(
                        streams_to_consume, self.consumer_name, max_total_reclaimed=100
                    )

                # Adaptive sleep: brief pause if work was done, slightly longer if idle
                if not all_events:
                    await asyncio.sleep(0.5)
                else:
                    await asyncio.sleep(0.1)

            except asyncio.CancelledError:
                logger.info("Consumer loop cancelled")
                break
            except Exception as e:
                logger.error(f"Error in consumer loop: {e}", exc_info=True)
                await asyncio.sleep(5)  # Back off on error

        logger.info("Consumer loop stopped")

    async def _reclaim_orphaned_messages(
        self, streams_to_consume: list, consumer_name: str, max_total_reclaimed: int = 100
    ):
        """Use XAUTOCLAIM to reclaim idle pending messages from dead/old consumers.

        Strictly bounded: claims at most max_total_reclaimed messages per cycle
        and persists cursors across invocations to prevent starvation and looping.
        """
        if not self.redis:
            return

        total_reclaimed = 0

        for stream, stream_type in streams_to_consume:
            if total_reclaimed >= max_total_reclaimed:
                break

            try:
                batch_limit = min(50, max_total_reclaimed - total_reclaimed)
                start_id = self._autoclaim_cursors.get(stream, "0-0")

                # XAUTOCLAIM parameters:
                # - group: consumer group name
                # - consumer: this consumer's name (claims will be assigned to us)
                # - min_idle_time: only claim messages idle for at least this many ms (60 seconds)
                # - start_id: cursor for pagination ('0-0' starts from beginning of PEL)
                # - count: max messages to claim per call
                # Returns: [next_start_id, claimed_messages, deleted_ids]
                next_start_id, claimed_messages, deleted_ids = await self.redis.xautoclaim(
                    stream,
                    ConsumerGroups.EVENT_COLLECTOR,
                    consumer_name,
                    min_idle_time=60000,
                    start_id=start_id,
                    count=batch_limit,
                )

                # Persist cursor for next cycle (0-0 means scan wrapped around)
                self._autoclaim_cursors[stream] = next_start_id if next_start_id != "0-0" else "0-0"

                if not claimed_messages:
                    continue

                total_reclaimed += len(claimed_messages)
                logger.info(
                    f"XAUTOCLAIM reclaimed {len(claimed_messages)} orphaned messages from {stream} "
                    f"(cursor={next_start_id}, total_reclaimed={total_reclaimed}/{max_total_reclaimed})"
                )

                # Process the reclaimed messages through the same pipeline
                reclaimed_events = []
                valid_message_ids = []
                for msg_id, msg_data in claimed_messages:
                    try:
                        raw_data = msg_data.get("data") if isinstance(msg_data, dict) else None
                        if not raw_data:
                            raise ValueError(f"Missing 'data' field in message {msg_id}")
                        envelope_data = json.loads(raw_data)
                        reclaimed_events.append({
                            "id": msg_id,
                            "stream": stream,
                            "data": envelope_data,
                        })
                        valid_message_ids.append(msg_id)
                    except Exception as e:
                        logger.error(f"Failed to parse reclaimed event {msg_id} from {stream}: {e}")
                        # Malformed events are NOT added to valid_message_ids and thus NOT ACKed

                if reclaimed_events:
                    try:
                        # Insert into ClickHouse
                        await self._write_events_to_clickhouse(reclaimed_events)
                        logger.info(f"Processed {len(reclaimed_events)} reclaimed events from {stream} to ClickHouse")

                        # ACK only successfully parsed and persisted messages with retry logic
                        if valid_message_ids:
                            await self._ack_messages_with_retry(stream, valid_message_ids)
                    except Exception as e:
                        logger.error(
                            f"Failed to write reclaimed events from {stream} to ClickHouse: {e}",
                            exc_info=True,
                        )
                        # Do NOT ACK if ClickHouse insert failed; messages remain in PEL for retry

            except redis.ResponseError as e:
                # NOGROUP means consumer group doesn't exist yet - that's fine
                if "NOGROUP" not in str(e):
                    logger.warning(f"XAUTOCLAIM error for {stream}: {e}")
            except Exception as e:
                logger.error(f"Unexpected error in XAUTOCLAIM for {stream}: {e}", exc_info=True)


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


class SessionUpdateRequest(BaseModel):
    """Request to update session with analysis results"""
    session_id: str
    intent: Optional[str] = None
    skill_level: Optional[int] = None
    commands_executed: Optional[int] = None
    credentials_tried: Optional[int] = None
    disconnection_reason: Optional[str] = None
    duration_seconds: Optional[int] = None


class SessionUpdateResponse(BaseModel):
    session_id: str
    success: bool
    error: Optional[str] = None


@app.get("/health")
async def health():
    checks = {"redis": "unknown", "clickhouse": "unknown"}

    # Check Redis
    try:
        if collector.redis:
            await asyncio.wait_for(collector.redis.ping(), timeout=2.0)
            checks["redis"] = "healthy"
        else:
            checks["redis"] = "not_initialized"
    except Exception:
        checks["redis"] = "unhealthy"

    # Check ClickHouse
    try:
        if collector.clickhouse_client:
            await asyncio.wait_for(
                asyncio.to_thread(collector.clickhouse_client.command, "SELECT 1"),
                timeout=2.0,
            )
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


@app.post("/update-session", response_model=SessionUpdateResponse)
async def update_session(request: SessionUpdateRequest):
    """Update session with analysis results (intent, skill_level, etc.)"""
    logger.info(f"Updating session {request.session_id}: intent={request.intent}, skill_level={request.skill_level}")
    if not collector.clickhouse_client:
        return SessionUpdateResponse(
            session_id=request.session_id,
            success=False,
            error="ClickHouse not connected"
        )

    try:
        # Build update query
        updates = []
        if request.intent is not None:
            escaped_intent = request.intent.replace("'", "''")
            updates.append(f"intent = '{escaped_intent}'")
        if request.skill_level is not None:
            updates.append(f"skill_level = {request.skill_level}")
        if request.commands_executed is not None:
            updates.append(f"commands_executed = {request.commands_executed}")
        if request.disconnection_reason is not None:
            escaped_reason = request.disconnection_reason.replace("'", "''")
            updates.append(f"disconnection_reason = '{escaped_reason}'")
        if request.duration_seconds is not None:
            updates.append(f"duration_seconds = {request.duration_seconds}")
        if request.credentials_tried is not None:
            updates.append(f"credentials_tried = {request.credentials_tried}")

        if not updates:
            return SessionUpdateResponse(
                session_id=request.session_id,
                success=False,
                error="No fields to update"
            )

        # ClickHouse ALTER TABLE UPDATE
        update_sql = f"ALTER TABLE clouddecept.sessions UPDATE {', '.join(updates)} WHERE session_id = '{request.session_id}'"
        logger.debug(f"Executing: {update_sql}")
        await asyncio.to_thread(collector.clickhouse_client.command, update_sql)

        # Verify update
        count = await asyncio.to_thread(
            collector.clickhouse_client.command,
            f"SELECT count() FROM clouddecept.sessions WHERE session_id = '{request.session_id}'"
        )

        return SessionUpdateResponse(
            session_id=request.session_id,
            success=count > 0,
            error=None if count > 0 else "Session not found"
        )

    except Exception as e:
        logger.error(f"Failed to update session {request.session_id}: {e}", exc_info=True)
        return SessionUpdateResponse(
            session_id=request.session_id,
            success=False,
            error=str(e)
        )


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


@app.get("/debug/pipeline")
async def debug_pipeline():
    """Diagnostic endpoint to trace command/event pipeline status"""
    result = {
        "stream_lengths": {},
        "consumer_groups": {},
        "pending_messages": {},
        "consumer_task_status": "unknown",
        "clickhouse_counts": {},
    }

    # Stream lengths
    streams_to_check = [
        StreamNames.HONEYPOT_EVENTS,
        StreamNames.AUTH_EVENTS,
        StreamNames.COMMAND_EVENTS,
        StreamNames.CLOUD_API_EVENTS,
        StreamNames.FILE_EVENTS,
        StreamNames.NETWORK_EVENTS,
        StreamNames.SESSION_EVENTS,
    ]
    for stream in streams_to_check:
        try:
            result["stream_lengths"][stream] = await collector.redis.xlen(stream)
        except Exception as e:
            result["stream_lengths"][stream] = f"error: {e}"

    # Consumer groups and pending messages
    for stream in streams_to_check:
        try:
            groups = await collector.redis.xinfo_groups(stream)
            result["consumer_groups"][stream] = groups
            # Check pending messages for event_collector group
            for group in groups:
                if group.get("name") == ConsumerGroups.EVENT_COLLECTOR:
                    pending = await collector.redis.xpending_range(
                        stream, ConsumerGroups.EVENT_COLLECTOR, "-", "+", 10,
                        consumername=collector.consumer_name
                    )
                    result["pending_messages"][stream] = len(pending)
        except Exception as e:
            result["consumer_groups"][stream] = f"error: {e}"
            result["pending_messages"][stream] = f"error: {e}"

    # Consumer task status
    if collector.consumer_task:
        result["consumer_task_status"] = "running" if not collector.consumer_task.done() else "done/crashed"
        if collector.consumer_task.done():
            try:
                collector.consumer_task.result()
            except Exception as e:
                result["consumer_task_error"] = str(e)
    else:
        result["consumer_task_status"] = "not_started"

    # ClickHouse counts
    if collector.clickhouse_client:
        try:
            tables = ["sessions", "commands", "auth_attempts", "cloud_api_requests"]
            for table in tables:
                try:
                    count = await asyncio.to_thread(
                        collector.clickhouse_client.command,
                        f"SELECT count() FROM clouddecept.{table}",
                    )
                    result["clickhouse_counts"][table] = count
                except Exception as e:
                    result["clickhouse_counts"][table] = f"error: {e}"
        except Exception as e:
            result["clickhouse_counts"] = f"error: {e}"
    else:
        result["clickhouse_counts"] = "clickhouse not connected"

    return result


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