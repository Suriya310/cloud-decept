"""
Unit tests for Event Collector priority ingestion and bounded orphan message recovery.
Validates that:
1. Fresh events (">") are prioritized and written to ClickHouse first.
2. XAUTOCLAIM is strictly bounded per cycle (never loops infinitely).
3. Pagination cursors are persisted across cycles.
4. Malformed reclaimed events are NEVER ACKed.
5. Failed ClickHouse writes do not ACK messages.
6. ACK retry with exponential backoff works properly.
"""
import sys
import os
import json
import unittest
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure mocks for third-party modules not installed locally
for mod in ["clickhouse_connect", "httpx", "redis", "redis.asyncio", "fastapi.responses"]:
    sys.modules.setdefault(mod, MagicMock())

fastapi_mock = sys.modules.setdefault("fastapi", MagicMock())
fastapi_mock.FastAPI.return_value.get.side_effect = lambda *a, **kw: lambda f: f
fastapi_mock.FastAPI.return_value.post.side_effect = lambda *a, **kw: lambda f: f

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.collector.main import EventCollector, health, collector
from backend.schemas.events import ConsumerGroups, StreamNames


class TestCollectorRecovery(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.collector = EventCollector()
        self.collector.redis = AsyncMock()
        self.collector.clickhouse_client = MagicMock()

    async def test_reclaim_orphaned_messages_strictly_bounded(self):
        """Verify XAUTOCLAIM is bounded by max_total_reclaimed and persists cursors."""
        streams_to_consume = [
            (StreamNames.SESSION_EVENTS, "sessions"),
            (StreamNames.AUTH_EVENTS, "auth"),
        ]

        sample_event = {
            "event_type": "session_start",
            "payload": {
                "session_id": "sess-recover-1",
                "timestamp": "2026-09-05T12:00:00Z",
                "attacker_ip": "1.2.3.4",
            },
        }

        # Mock xautoclaim returning 50 messages on first stream, with cursor '100-0'
        msgs_stream1 = [(f"1-{i}", {"data": json.dumps(sample_event)}) for i in range(50)]
        msgs_stream2 = [(f"2-{i}", {"data": json.dumps(sample_event)}) for i in range(50)]

        self.collector.redis.xautoclaim.side_effect = [
            ("100-0", msgs_stream1, []),
            ("200-0", msgs_stream2, []),
        ]

        with patch.object(self.collector, "_write_events_to_clickhouse", new_callable=AsyncMock) as mock_write, \
             patch.object(self.collector, "_ack_messages_with_retry", new_callable=AsyncMock) as mock_ack:

            await self.collector._reclaim_orphaned_messages(
                streams_to_consume, "test-consumer", max_total_reclaimed=100
            )

            # Reclaimed 50 from stream 1, 50 from stream 2 -> exactly 100 total
            self.assertEqual(self.collector.redis.xautoclaim.call_count, 2)
            self.assertEqual(mock_write.call_count, 2)
            self.assertEqual(mock_ack.call_count, 2)

            # Verify cursors were persisted
            self.assertEqual(self.collector._autoclaim_cursors[StreamNames.SESSION_EVENTS], "100-0")
            self.assertEqual(self.collector._autoclaim_cursors[StreamNames.AUTH_EVENTS], "200-0")

    async def test_reclaim_cursor_wraps_around_to_zero(self):
        """Verify cursor resets to '0-0' when next_start_id is '0-0'."""
        streams = [(StreamNames.SESSION_EVENTS, "sessions")]
        self.collector._autoclaim_cursors[StreamNames.SESSION_EVENTS] = "999-0"

        self.collector.redis.xautoclaim.return_value = ("0-0", [], [])

        await self.collector._reclaim_orphaned_messages(streams, "test-consumer", max_total_reclaimed=100)
        self.assertEqual(self.collector._autoclaim_cursors[StreamNames.SESSION_EVENTS], "0-0")

    async def test_malformed_reclaimed_events_never_acked(self):
        """Malformed events in reclaimed messages must NOT be ACKed."""
        streams = [(StreamNames.SESSION_EVENTS, "sessions")]

        valid_event = {
            "event_type": "session_start",
            "payload": {"session_id": "sess-ok", "timestamp": "2026-09-05T12:00:00Z"},
        }
        claimed_messages = [
            ("msg-valid-1", {"data": json.dumps(valid_event)}),
            ("msg-malformed-2", {"data": "{not-valid-json"}),
            ("msg-missing-data-3", {}),
            ("msg-valid-4", {"data": json.dumps(valid_event)}),
        ]

        self.collector.redis.xautoclaim.return_value = ("100-0", claimed_messages, [])

        with patch.object(self.collector, "_write_events_to_clickhouse", new_callable=AsyncMock) as mock_write, \
             patch.object(self.collector, "_ack_messages_with_retry", new_callable=AsyncMock) as mock_ack:

            await self.collector._reclaim_orphaned_messages(streams, "test-consumer", max_total_reclaimed=100)

            mock_write.assert_called_once()
            written_events = mock_write.call_args[0][0]
            self.assertEqual(len(written_events), 2)
            self.assertEqual([e["id"] for e in written_events], ["msg-valid-1", "msg-valid-4"])

            # ONLY valid message IDs must be ACKed
            mock_ack.assert_called_once_with(StreamNames.SESSION_EVENTS, ["msg-valid-1", "msg-valid-4"])

    async def test_failed_clickhouse_write_does_not_ack(self):
        """If writing to ClickHouse fails, messages must NOT be ACKed."""
        streams = [(StreamNames.SESSION_EVENTS, "sessions")]
        valid_event = {
            "event_type": "session_start",
            "payload": {"session_id": "sess-fail", "timestamp": "2026-09-05T12:00:00Z"},
        }
        self.collector.redis.xautoclaim.return_value = (
            "100-0",
            [("msg-1", {"data": json.dumps(valid_event)})],
            [],
        )

        with patch.object(self.collector, "_write_events_to_clickhouse", new_callable=AsyncMock, side_effect=RuntimeError("ClickHouse down")), \
             patch.object(self.collector, "_ack_messages_with_retry", new_callable=AsyncMock) as mock_ack:

            await self.collector._reclaim_orphaned_messages(streams, "test-consumer", max_total_reclaimed=100)
            mock_ack.assert_not_called()

    async def test_ack_messages_with_retry_success_first_try(self):
        """ACK succeeds immediately on first attempt."""
        self.collector.redis.xack.return_value = 2
        success = await self.collector._ack_messages_with_retry(
            StreamNames.SESSION_EVENTS, ["msg-1", "msg-2"]
        )
        self.assertTrue(success)
        self.collector.redis.xack.assert_called_once_with(
            ConsumerGroups.EVENT_COLLECTOR, StreamNames.SESSION_EVENTS, "msg-1", "msg-2"
        )

    async def test_ack_messages_with_retry_exponential_backoff(self):
        """ACK fails on initial call, succeeds on retry 2 with backoff."""
        self.collector.redis.xack.side_effect = [
            Exception("Connection reset"),
            Exception("Connection reset"),
            2,
        ]

        with patch("asyncio.sleep", new_callable=AsyncMock) as mock_sleep:
            success = await self.collector._ack_messages_with_retry(
                StreamNames.SESSION_EVENTS, ["msg-1", "msg-2"], max_retries=3, base_delay=0.1
            )
            self.assertTrue(success)
            self.assertEqual(self.collector.redis.xack.call_count, 3)
            mock_sleep.assert_any_call(0.1)
            mock_sleep.assert_any_call(0.2)

    async def test_ack_messages_with_retry_exhausted_retries(self):
        """ACK fails on all retries, returns False without unhandled crash."""
        self.collector.redis.xack.side_effect = Exception("Persistent error")

        with patch("asyncio.sleep", new_callable=AsyncMock):
            success = await self.collector._ack_messages_with_retry(
                StreamNames.SESSION_EVENTS, ["msg-1"], max_retries=2, base_delay=0.01
            )
            self.assertFalse(success)
            self.assertEqual(self.collector.redis.xack.call_count, 3)

    async def test_fresh_events_consumed_first_in_consumer_loop(self):
        """Verify _consumer_loop consumes fresh events ('>') and writes them immediately."""
        self.collector.running = True

        fresh_event = {
            "id": "fresh-msg-1",
            "stream": StreamNames.SESSION_EVENTS,
            "data": {"event_type": "session_start", "payload": {"session_id": "sess-fresh-1"}},
        }

        # Mock consume_events to return fresh event on first stream, empty on others
        async def fake_consume(stream, group, consumer, count=50, block_ms=1000):
            # Stop the loop after consuming all streams in first iteration
            if stream == StreamNames.CLOUD_API_EVENTS:
                self.collector.running = False
            if stream == StreamNames.SESSION_EVENTS:
                return [fresh_event], ["fresh-msg-1"]
            return [], []

        self.collector.consume_events = AsyncMock(side_effect=fake_consume)
        self.collector._write_events_to_clickhouse = AsyncMock()
        self.collector._ack_messages_with_retry = AsyncMock()
        self.collector._reclaim_orphaned_messages = AsyncMock()

        with patch("asyncio.sleep", new_callable=AsyncMock):
            await self.collector._consumer_loop()

        # Fresh events written to ClickHouse and ACKed
        self.collector._write_events_to_clickhouse.assert_called_once_with([fresh_event])
        self.collector._ack_messages_with_retry.assert_called_once_with(
            StreamNames.SESSION_EVENTS, ["fresh-msg-1"]
        )

    async def test_write_events_to_clickhouse_runs_in_thread(self):
        """Verify _write_events_to_clickhouse delegates to asyncio.to_thread."""
        events = [{"id": "1", "data": {"event_type": "session_start"}}]

        with patch("asyncio.to_thread", new_callable=AsyncMock) as mock_to_thread:
            await self.collector._write_events_to_clickhouse(events)
            mock_to_thread.assert_called_once_with(
                self.collector._write_events_to_clickhouse_sync, events
            )

    async def test_health_responsive_during_background_write(self):
        """Verify /health endpoint responds immediately while background writes are active."""
        collector.redis = AsyncMock()
        collector.redis.ping.return_value = True

        collector.clickhouse_client = MagicMock()
        collector.clickhouse_client.command.return_value = 1

        import asyncio

        # Simulate background task executing ClickHouse inserts via to_thread
        async def background_write():
            await self.collector._write_events_to_clickhouse([{"id": "1", "data": {}}])

        # Run background write and health check concurrently
        write_task = asyncio.create_task(background_write())
        health_resp = await health()
        await write_task

        self.assertEqual(health_resp["status"], "healthy")
        self.assertEqual(health_resp["redis"], "healthy")
        self.assertEqual(health_resp["clickhouse"], "healthy")

    async def test_health_timeout_on_slow_clickhouse(self):
        """Verify /health does not block forever if ClickHouse hangs, returning degraded."""
        collector.redis = AsyncMock()
        collector.redis.ping.return_value = True

        collector.clickhouse_client = MagicMock()

        import time
        # Simulate ClickHouse hanging for longer than the 2s timeout
        def hanging_command(*args, **kwargs):
            time.sleep(3.0)
            return 1

        collector.clickhouse_client.command.side_effect = hanging_command

        health_resp = await health()
        self.assertEqual(health_resp["status"], "degraded")
        self.assertEqual(health_resp["redis"], "healthy")
        self.assertEqual(health_resp["clickhouse"], "unhealthy")


if __name__ == "__main__":
    unittest.main()
