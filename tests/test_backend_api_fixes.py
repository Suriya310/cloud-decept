"""
Unit tests for Backend API fixes:
1. /threat-intel query safety and column compatibility
2. /mitre/techniques aggregation from PostgreSQL & ClickHouse without 500
3. /sessions/{id}/summary fallback to Threat Intel and PostgreSQL caching
4. /sessions/{id}/commands logical deduplication with LIMIT 1 BY event_id
5. /sessions/{id} unique count reporting
6. /stats unique command aggregation with uniqExact
"""
import sys
import os
import unittest
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

# Ensure mocks for third-party modules not installed locally
for mod in ["clickhouse_connect", "httpx", "redis", "redis.asyncio", "psycopg2", "psycopg2.pool"]:
    sys.modules.setdefault(mod, MagicMock())

fastapi_mock = sys.modules.setdefault("fastapi", MagicMock())
fastapi_mock.FastAPI.return_value.get.side_effect = lambda *a, **kw: lambda f: f
fastapi_mock.FastAPI.return_value.post.side_effect = lambda *a, **kw: lambda f: f

sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

from backend.api import main as api_main


class TestBackendApiFixes(unittest.IsolatedAsyncioTestCase):

    def setUp(self):
        self.mock_ch = MagicMock()
        self.mock_pg_pool = MagicMock()
        api_main.clickhouse_client = self.mock_ch
        api_main.postgres_pool = self.mock_pg_pool

    async def test_threat_intel_query_safety(self):
        """Verify /threat-intel handles rows safely without undefined column errors."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        self.mock_pg_pool.getconn.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur

        now = datetime.now(timezone.utc)
        mock_cur.fetchall.return_value = [
            (
                "d9b89182-1111-2222-3333-444455556666",
                "ip",
                "1.2.3.4",
                0.95,
                ["T1087.001"],
                ["Discovery"],
                "high",
                "account discovery",
                {"raw": "test"},
                now,
            )
        ]

        results = await api_main.list_threat_intel(limit=10)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].id, "d9b89182-1111-2222-3333-444455556666")
        self.assertEqual(results[0].mitre_techniques, ["T1087.001"])
        self.assertEqual(results[0].severity, "high")

    async def test_mitre_techniques_aggregation(self):
        """Verify /mitre/techniques aggregates from both postgres and ClickHouse without 500."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        self.mock_pg_pool.getconn.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur

        mock_cur.fetchall.return_value = [
            (["T1087.001", "T1083"],),
            (["T1083", "T1059.004"],),
        ]

        ch_query_res = MagicMock()
        ch_query_res.named_results.return_value = [
            {"tech": "T1083", "cnt": 5},
            {"tech": "T1082", "cnt": 3},
        ]
        self.mock_ch.query.return_value = ch_query_res

        results = await api_main.list_mitre_techniques()
        res_map = {r["technique"]: r["count"] for r in results}
        self.assertEqual(res_map["T1083"], 7)
        self.assertEqual(res_map["T1087.001"], 1)
        self.assertEqual(res_map["T1082"], 3)

    async def test_session_summary_cached_in_postgres(self):
        """Verify /sessions/{id}/summary returns immediately when row exists in session_summaries."""
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        self.mock_pg_pool.getconn.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur

        now = datetime.now(timezone.utc)
        mock_cur.fetchone.return_value = (
            "7736867d1287",
            "Attacker executed discovery commands",
            "system discovery",
            2,
            ["T1087.001", "T1083"],
            [{"type": "ip", "value": "129.146.167.2"}],
            now,
        )

        res = await api_main.get_session_summary("7736867d1287")
        self.assertEqual(res.session_id, "7736867d1287")
        self.assertEqual(res.intent, "system discovery")
        self.assertEqual(res.skill_level, 2)
        self.assertIn("T1087.001", res.mitre_techniques)

    async def test_session_commands_deduplication(self):
        """Verify /sessions/{id}/commands includes LIMIT 1 BY event_id in query."""
        ch_res = MagicMock()
        now = datetime.now(timezone.utc)
        ch_res.named_results.return_value = [
            {
                "event_id": "ev-1",
                "session_id": "7736867d1287",
                "timestamp": now,
                "command": "whoami",
                "arguments": [],
                "output": "root",
                "exit_code": 0,
                "duration_ms": 10,
                "intent": "system discovery",
                "mitre_techniques": ["T1087.001"],
            }
        ]
        self.mock_ch.query.return_value = ch_res

        results = await api_main.get_session_commands("7736867d1287")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].command, "whoami")

        called_sql = self.mock_ch.query.call_args[0][0]
        self.assertIn("LIMIT 1 BY event_id", called_sql)

    async def test_get_session_reconciles_unique_command_count(self):
        """Verify /sessions/{id} overrides commands_executed with uniqExact(event_id)."""
        now = datetime.now(timezone.utc)
        sess_res = MagicMock()
        sess_res.named_results.return_value = [
            {
                "session_id": "7736867d1287",
                "start_time": now,
                "end_time": now,
                "duration_seconds": 10,
                "attacker_ip": "129.146.167.2",
                "country": "US",
                "protocol": "ssh",
                "commands_executed": 28,
                "files_transferred": 0,
                "credentials_tried": 4,
                "intent": "system discovery",
                "skill_level": 1,
                "disconnection_reason": "",
            }
        ]
        self.mock_ch.query.return_value = sess_res

        def mock_command(sql):
            if "commands" in sql and "uniqExact(event_id)" in sql:
                return 7
            if "auth_attempts" in sql and "uniqExact(event_id)" in sql:
                return 1
            return 0

        self.mock_ch.command.side_effect = mock_command

        res = await api_main.get_session("7736867d1287")
        self.assertEqual(res.commands_executed, 7)
        self.assertEqual(res.credentials_tried, 1)

    async def test_get_stats_uses_uniq_exact_for_commands(self):
        """Verify /stats aggregates total and recent commands via uniqExact(event_id)."""
        executed_commands = []
        def mock_command(sql):
            executed_commands.append(sql)
            if "uniqExact(event_id)" in sql:
                return 42
            return 10

        self.mock_ch.command.side_effect = mock_command

        q_res = MagicMock()
        q_res.named_results.return_value = []
        self.mock_ch.query.return_value = q_res

        stats = await api_main.get_stats()
        self.assertEqual(stats.total_commands, 42)
        self.assertEqual(stats.recent_commands, 42)

        cmd_sqls = [s for s in executed_commands if "clouddecept.commands" in s]
        for s in cmd_sqls:
            self.assertIn("uniqExact(event_id)", s)


if __name__ == "__main__":
    unittest.main()
