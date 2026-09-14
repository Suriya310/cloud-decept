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

    async def test_get_stats_includes_sessions_per_day_and_unclassified(self):
        """Verify /stats returns sessions_per_day and handles unclassified threat level."""
        self.mock_ch.command.return_value = 5
        mock_queries = []

        def mock_query(sql):
            mock_queries.append(sql)
            res = MagicMock()
            if "sessions_per_day" in str(sql) or "toDate(start_time) as date" in str(sql):
                res.named_results.return_value = [{"date": "2026-09-09", "count": 10}]
            elif "threat_distribution" in str(sql) or "skill_level" in str(sql):
                res.named_results.return_value = [
                    {"level": "High", "count": 2},
                    {"level": "unclassified", "count": 8},
                ]
            elif "top_countries" in str(sql) or "country" in str(sql):
                res.named_results.return_value = [{"country": "US", "count": 20}]
            else:
                res.named_results.return_value = []
            return res

        self.mock_ch.query.side_effect = mock_query

        stats = await api_main.get_stats(hours=24)
        self.assertIsInstance(stats.sessions_per_day, list)
        self.assertIn("LIMIT 50", "".join(mock_queries))

    async def test_list_sessions_min_skill_level_filter(self):
        """Verify /sessions respects min_skill_level query parameter."""
        executed_queries = []
        def mock_query(sql):
            executed_queries.append(sql)
            res = MagicMock()
            res.named_results.return_value = []
            return res

        self.mock_ch.query.side_effect = mock_query

        await api_main.list_sessions(limit=10, min_skill_level=5)
        sql_joined = " ".join(executed_queries)
        self.assertIn("skill_level >= 5", sql_joined)

    async def test_command_response_includes_exit_code_and_duration(self):
        """Verify /sessions/{id}/commands returns exit_code and duration_ms."""
        ch_res = MagicMock()
        ch_res.named_results.return_value = [
            {
                "event_id": "cmd-1",
                "session_id": "s123",
                "timestamp": datetime.now(timezone.utc),
                "command": "uname -a",
                "arguments": ["-a"],
                "output": "Linux 5.15.0-x86_64",
                "intent": "system_discovery",
                "intent_confidence": 0.9,
                "mitre_techniques": ["T1082"],
                "exit_code": 0,
                "duration_ms": 12,
            }
        ]
        self.mock_ch.query.return_value = ch_res

        res = await api_main.get_session_commands("s123")
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0].exit_code, 0)
        self.assertEqual(res[0].duration_ms, 12)

    async def test_active_session_returns_none_end_time(self):
        """Verify active in-flight sessions return end_time=None instead of placeholder."""
        now = datetime.now(timezone.utc)
        ch_res = MagicMock()
        ch_res.named_results.return_value = [
            {
                "session_id": "s-active",
                "start_time": now,
                "end_time": now,
                "attacker_ip": "1.2.3.4",
                "country": "US",
                "duration_seconds": 0,
                "commands_executed": 3,
                "credentials_tried": 1,
                "intent": "system_discovery",
                "skill_level": 2,
                "disconnection_reason": "",
                "protocol": "ssh",
                "files_transferred": 0,
            }
        ]
        self.mock_ch.query.return_value = ch_res

        sessions = await api_main.list_sessions(limit=10)
        self.assertEqual(len(sessions), 1)
        self.assertIsNone(sessions[0].end_time)

    def test_intent_classifier_classifies_unix_discovery_commands(self):
        """Verify RuleBasedClassifier detects standard unix discovery commands."""
        import importlib.util
        classifier_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "services", "intent-engine", "src", "classifier.py")
        )
        spec = importlib.util.spec_from_file_location("classifier_mod", classifier_path)
        mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(mod)
        clf = mod.RuleBasedClassifier()

        result = clf.classify(["whoami", "id", "uname -a"])
        self.assertIn(result.intent, ["system_discovery", "account_discovery"])
        self.assertGreater(result.confidence, 0.5)

    async def test_canonical_assessment_reconciles_empty_clickhouse_session(self):
        """Verify get_session reconciles intent='' and skill_level=0 from Postgres summary."""
        now = datetime.now(timezone.utc)
        sess_res = MagicMock()
        sess_res.named_results.return_value = [
            {
                "session_id": "f81991343ed8",
                "start_time": now,
                "end_time": now,
                "duration_seconds": 58,
                "attacker_ip": "152.58.62.90",
                "country": "IN",
                "protocol": "ssh",
                "commands_executed": 6,
                "files_transferred": 0,
                "credentials_tried": 1,
                "intent": "",       # Unreconciled in ClickHouse
                "skill_level": 0,   # Unreconciled in ClickHouse
                "disconnection_reason": "",
            }
        ]
        self.mock_ch.query.return_value = sess_res
        self.mock_ch.command.return_value = 0

        # Mock Postgres session_summaries returning analyzed data
        mock_conn = MagicMock()
        mock_cur = MagicMock()
        self.mock_pg_pool.getconn.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur
        mock_cur.fetchone.return_value = (
            "f81991343ed8",
            "Attacker executed discovery commands to map user privileges and host details.",
            "system discovery",
            1,
            ["T1087.001", "T1082", "T1087.001"],  # Raw summary with duplicates
            [{"type": "ip", "value": "152.58.62.90"}],
            now,
        )

        res = await api_main.get_session("f81991343ed8")
        self.assertEqual(res.session_id, "f81991343ed8")
        self.assertEqual(res.intent, "system discovery")
        self.assertEqual(res.skill_level, 1)
        self.assertIsNotNone(res.assessment)
        self.assertEqual(res.assessment.status, "analyzed")
        self.assertEqual(res.assessment.threat_level, "low")
        self.assertEqual(res.assessment.threat_score, 10)
        # Verify deduplicated MITRE techniques in assessment
        self.assertEqual(res.assessment.mitre_techniques, ["T1087.001", "T1082"])

    async def test_get_session_case_file_structure_and_masking(self):
        """Verify get_session_case_file strictly produces unified truth for authoritative CASE-F8199134."""
        t_start = datetime(2026, 9, 12, 16, 36, 41, tzinfo=timezone.utc)
        t_auth = datetime(2026, 9, 12, 16, 36, 45, tzinfo=timezone.utc)
        t_cmds = datetime(2026, 9, 12, 16, 36, 51, tzinfo=timezone.utc)
        t_exit = datetime(2026, 9, 12, 16, 36, 53, tzinfo=timezone.utc)
        t_end = datetime(2026, 9, 12, 16, 36, 53, tzinfo=timezone.utc)
        t_analysis = datetime(2026, 9, 12, 16, 38, 18, tzinfo=timezone.utc)

        raw_commands = [
            {"event_id": "3271100d-1795-4bb9-b354-8b6a32c99efc", "session_id": "f81991343ed8", "timestamp": t_cmds, "command": "whoami", "arguments": [], "output": "root", "exit_code": 0, "duration_ms": 0, "intent": "", "mitre_techniques": ["T1033"]},
            {"event_id": "6b3a1235-f123-4bbf-b5dd-e44005f04639", "session_id": "f81991343ed8", "timestamp": t_cmds, "command": "uname -a", "arguments": [], "output": "Linux cowrie 5.15.0", "exit_code": 0, "duration_ms": 0, "intent": "", "mitre_techniques": ["T1082"]},
            {"event_id": "82a99c4b-379c-46d2-9c6a-324fdefc5eff", "session_id": "f81991343ed8", "timestamp": t_cmds, "command": "pwd", "arguments": [], "output": "/root", "exit_code": 0, "duration_ms": 0, "intent": "", "mitre_techniques": ["T1083"]},
            {"event_id": "de98244a-7d40-4f92-9cc1-f590f5f5b988", "session_id": "f81991343ed8", "timestamp": t_cmds, "command": "id", "arguments": [], "output": "uid=0(root) gid=0(root)", "exit_code": 0, "duration_ms": 0, "intent": "", "mitre_techniques": ["T1087.001"]},
            {"event_id": "eb2bc5dd-d80c-469a-bc62-e31bd1f1d301", "session_id": "f81991343ed8", "timestamp": t_exit, "command": "exit", "arguments": [], "output": "", "exit_code": 0, "duration_ms": 0, "intent": "", "mitre_techniques": []},
        ]

        def mock_ch_query(sql, *args, **kwargs):
            res = MagicMock()
            sql_str = str(sql)
            if "clouddecept.sessions" in sql_str:
                res.named_results.return_value = [{
                    "session_id": "f81991343ed8",
                    "start_time": t_start,
                    "end_time": t_end,
                    "duration_seconds": 11,
                    "attacker_ip": "122.164.81.145",
                    "country": "IN",
                    "protocol": "ssh",
                    "commands_executed": 5,
                    "files_transferred": 0,
                    "credentials_tried": 1,
                    "intent": "",       # Unreconciled in ClickHouse
                    "skill_level": 0,   # Unreconciled in ClickHouse
                    "disconnection_reason": "Attacker terminated session cleanly (exit command)",
                }]
            elif "clouddecept.auth_attempts" in sql_str:
                res.named_results.return_value = [{
                    "event_id": "3fb58d30-9106-4fcc-84e8-bd53e2c8ea9f",
                    "session_id": "f81991343ed8",
                    "timestamp": t_auth,
                    "username": "root",
                    "password": "root",
                    "auth_method": "password",
                    "success": 1,
                    "source_ip": "122.164.81.145",
                    "target_port": 2222,
                }]
            elif "clouddecept.commands" in sql_str:
                res.named_results.return_value = raw_commands
            else:
                res.named_results.return_value = []
            return res

        self.mock_ch.query.side_effect = mock_ch_query
        self.mock_ch.command.return_value = 5

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        self.mock_pg_pool.getconn.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur

        def mock_pg_execute(sql, params=None):
            sql_str = str(sql)
            if "session_summaries" in sql_str:
                mock_cur.fetchone.return_value = (
                    "f81991343ed8",
                    "Attacker attempting system discovery",
                    "system discovery",
                    1,
                    ["T1033", "T1082", "T1083", "T1087.001"],
                    [],  # 0 IOCs extracted from commands
                    t_analysis,
                )
            elif "threat_intelligence" in sql_str:
                mock_cur.fetchall.return_value = [
                    ("T1033", "System Owner/User Discovery", "Discovery", "low", "whoami", 0.85, t_analysis),
                    ("T1082", "System Information Discovery", "Discovery", "low", "uname", 0.85, t_analysis),
                    ("T1083", "File and Directory Discovery", "Discovery", "low", "pwd", 0.85, t_analysis),
                    ("T1087.001", "Account Discovery: Local Account", "Discovery", "low", "id", 0.85, t_analysis),
                ]

        mock_cur.execute.side_effect = mock_pg_execute

        with patch("httpx.AsyncClient") as mock_client:
            mock_resp = MagicMock()
            mock_resp.status_code = 404
            mock_client.return_value.__aenter__.return_value.get.return_value = mock_resp

            case_file = await api_main.get_session_case_file("f81991343ed8")

        # 1. Case ID & Session Identity
        self.assertEqual(case_file["case_id"], "CASE-F8199134")
        self.assertEqual(case_file["session"]["session_id"], "f81991343ed8")
        self.assertEqual(case_file["session"]["attacker_ip"], "122.164.81.145")
        self.assertEqual(case_file["session"]["duration_seconds"], 11)
        self.assertEqual(case_file["session"]["commands_executed"], 5)
        self.assertEqual(case_file["session"]["credentials_tried"], 1)

        # 2. Reconciled Analytical fields (NO contradiction with assessment)
        self.assertEqual(case_file["session"]["intent"], "system discovery")
        self.assertEqual(case_file["session"]["skill_level"], 1)
        self.assertEqual(case_file["session"]["threat_score"], 10)
        self.assertEqual(case_file["session"]["status"], "closed")

        # 3. Assessment fields
        self.assertEqual(case_file["assessment"]["status"], "classified")
        self.assertEqual(case_file["assessment"]["intent"], "system discovery")
        self.assertEqual(case_file["assessment"]["threat_level"], "low")
        self.assertEqual(case_file["assessment"]["threat_score"], 10)
        self.assertEqual(case_file["assessment"]["skill_level"], 1)
        self.assertEqual(case_file["assessment"]["confidence"], 0.85)
        self.assertEqual(case_file["assessment"]["mitre_techniques"], ["T1033", "T1082", "T1083", "T1087.001"])

        # 4. Threat Intel block & IOC Semantics
        ti = case_file["threat_intel"]["summary"]
        self.assertEqual(ti["intent"], "system discovery")
        self.assertEqual(ti["primary_objective"], "system discovery")
        self.assertEqual(ti["skill_level"], 1)
        self.assertEqual(ti["risk_level"], "low")
        self.assertEqual(ti["created_at"], t_analysis)
        self.assertEqual(ti["iocs"], [])  # Attacker IP is NOT an IOC; 0 IOCs extracted from command text
        self.assertEqual(case_file["threat_intel"]["iocs"], [])
        self.assertEqual(ti["mitre_techniques"], ["T1033", "T1082", "T1083", "T1087.001"])

        # 5. Adaptive Deception (Honest passive status)
        self.assertEqual(case_file["adaptive_deception"]["state"], "PASSIVE_TELEMETRY")
        self.assertEqual(case_file["adaptive_deception"]["status"], "PASSIVE_TELEMETRY")
        self.assertFalse(case_file["adaptive_deception"]["action_taken"])
        self.assertIn("No dynamic decoy triggers", case_file["adaptive_deception"]["reason"])

        # 6. Credential Masking
        self.assertEqual(len(case_file["auth_attempts"]), 1)
        self.assertEqual(case_file["auth_attempts"][0]["password"], "••••••••")
        self.assertNotIn("Raw Password", case_file["auth_attempts"][0])

        # 7. Exact Chronological Timeline Order
        timeline = case_file["timeline"]
        expected_events = [
            ("connection", t_start, "CONNECTION ESTABLISHED"),
            ("auth", t_auth, "AUTHENTICATION SUCCESSFUL"),
            ("command", t_cmds, "COMMAND EXECUTED: $ whoami"),
            ("command", t_cmds, "COMMAND EXECUTED: $ uname -a"),
            ("command", t_cmds, "COMMAND EXECUTED: $ pwd"),
            ("command", t_cmds, "COMMAND EXECUTED: $ id"),
            ("command", t_exit, "COMMAND EXECUTED: $ exit"),
            ("termination", t_end, "SESSION TERMINATED"),
            ("threat_assessment", t_analysis, "THREAT INTELLIGENCE ANALYSIS COMPLETED"),
        ]

        self.assertEqual(len(timeline), len(expected_events))
        for idx, (exp_type, exp_time, exp_title) in enumerate(expected_events):
            actual = timeline[idx]
            self.assertEqual(actual["type"], exp_type, f"Event {idx} type mismatch")
            self.assertEqual(actual["timestamp"], exp_time, f"Event {idx} timestamp mismatch")
            self.assertEqual(actual["title"], exp_title, f"Event {idx} title mismatch")
            if "details" in actual:
                self.assertNotIn("Raw Password", actual["details"])
                if "Password" in actual["details"]:
                    self.assertEqual(actual["details"]["Password"], "••••••••")

    async def test_reconciliation_preserves_immutable_session_identity_and_telemetry(self):
        """Verify reconciliation enriches analytical fields while strictly preserving immutable telemetry."""
        t_start = datetime(2026, 9, 12, 16, 36, 41, tzinfo=timezone.utc)
        t_auth = datetime(2026, 9, 12, 16, 36, 45, tzinfo=timezone.utc)
        t_cmd = datetime(2026, 9, 12, 16, 36, 51, tzinfo=timezone.utc)
        t_end = datetime(2026, 9, 12, 16, 36, 53, tzinfo=timezone.utc)
        t_analysis = datetime(2026, 9, 12, 16, 38, 18, tzinfo=timezone.utc)

        raw_session_row = {
            "session_id": "f81991343ed8",
            "start_time": t_start,
            "end_time": t_end,
            "duration_seconds": 11,
            "attacker_ip": "122.164.81.145",
            "country": "IN",
            "protocol": "ssh",
            "commands_executed": 5,
            "files_transferred": 0,
            "credentials_tried": 1,
            "intent": "",       # Unreconciled in ClickHouse
            "skill_level": 0,   # Unreconciled in ClickHouse
            "disconnection_reason": "Attacker terminated cleanly",
        }

        def mock_ch_query(sql, *args, **kwargs):
            res = MagicMock()
            sql_str = str(sql)
            if "clouddecept.sessions" in sql_str:
                res.named_results.return_value = [dict(raw_session_row)]
            elif "clouddecept.auth_attempts" in sql_str:
                res.named_results.return_value = [{
                    "event_id": "auth-ev-1",
                    "session_id": "f81991343ed8",
                    "timestamp": t_auth,
                    "username": "root",
                    "password": "root",
                    "auth_method": "password",
                    "success": 1,
                }]
            elif "clouddecept.commands" in sql_str:
                res.named_results.return_value = [{
                    "event_id": "cmd-ev-1",
                    "session_id": "f81991343ed8",
                    "timestamp": t_cmd,
                    "command": "whoami",
                    "arguments": [],
                    "output": "root",
                    "exit_code": 0,
                    "duration_ms": 0,
                    "intent": "",
                    "mitre_techniques": ["T1033"],
                }]
            else:
                res.named_results.return_value = []
            return res

        self.mock_ch.query.side_effect = mock_ch_query
        self.mock_ch.command.return_value = 5

        mock_conn = MagicMock()
        mock_cur = MagicMock()
        self.mock_pg_pool.getconn.return_value = mock_conn
        mock_conn.cursor.return_value.__enter__.return_value = mock_cur
        mock_cur.fetchone.return_value = (
            "f81991343ed8",
            "Attacker attempting system discovery",
            "system discovery",
            1,
            ["T1033"],
            [],
            t_analysis,
        )

        res = await api_main.get_session("f81991343ed8")

        # 1. Analytical fields ARE reconciled
        self.assertEqual(res.intent, "system discovery")
        self.assertEqual(res.skill_level, 1)
        self.assertEqual(res.threat_score, 10)
        self.assertIsNotNone(res.assessment)
        self.assertEqual(res.assessment.threat_level, "low")

        # 2. Immutable session identity fields are NEVER altered
        self.assertEqual(res.session_id, "f81991343ed8")
        self.assertEqual(res.attacker_ip, "122.164.81.145")
        self.assertEqual(res.start_time, t_start)
        self.assertEqual(res.end_time, t_end)
        self.assertEqual(res.duration_seconds, 11)
        self.assertEqual(res.protocol, "ssh")
        self.assertEqual(res.country, "IN")
        self.assertEqual(res.files_transferred, 0)
        self.assertEqual(res.commands_executed, 5)
        self.assertEqual(res.credentials_tried, 1)

    def test_mitre_mapping_deduplication_and_triggers(self):
        """Verify MITREMapper deduplicates technique IDs while aggregating triggers."""
        import importlib.util
        intel_path = os.path.abspath(
            os.path.join(os.path.dirname(__file__), "..", "services", "threat-intel", "src", "intel.py")
        )
        spec = importlib.util.spec_from_file_location("intel_mod", intel_path)
        intel_mod = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(intel_mod)
        mapper = intel_mod.MITREMapper()

        # Test exact 5 commands from CASE-F8199134
        cmds = [
            {"command": "whoami", "output": "root"},
            {"command": "uname -a", "output": "Linux cowrie 5.15.0"},
            {"command": "pwd", "output": "/root"},
            {"command": "id", "output": "uid=0(root) gid=0(root)"},
            {"command": "exit", "output": ""},
        ]
        mapped = mapper.map_commands(cmds)

        tech_map = {m.technique_id: m for m in mapped}
        tech_ids = list(tech_map.keys())

        # Verify no duplicate technique IDs
        self.assertEqual(len(mapped), len(tech_ids))
        self.assertEqual(len(mapped), 4)

        # Verify exact techniques and triggers
        self.assertIn("T1033", tech_map)
        self.assertEqual(tech_map["T1033"].trigger, "whoami")
        self.assertEqual(tech_map["T1033"].name, "System Owner/User Discovery")

        self.assertIn("T1082", tech_map)
        self.assertEqual(tech_map["T1082"].trigger, "uname")
        self.assertEqual(tech_map["T1082"].name, "System Information Discovery")

        self.assertIn("T1083", tech_map)
        self.assertEqual(tech_map["T1083"].trigger, "pwd (heuristic: directory orientation)")
        self.assertEqual(tech_map["T1083"].name, "File and Directory Discovery (Heuristic)")
        self.assertEqual(tech_map["T1083"].confidence, 0.50)

        self.assertIn("T1087.001", tech_map)
        self.assertEqual(tech_map["T1087.001"].trigger, "id")
        self.assertEqual(tech_map["T1087.001"].name, "Account Discovery: Local Account")

        # Test duplicate trigger avoidance when multiple triggers occur in same session
        duplicate_probe_cmds = [
            {"command": "whoami", "output": "root"},
            {"command": "w", "output": "root"},
            {"command": "id", "output": "uid=0(root)"},
            {"command": "cat /etc/passwd", "output": "root:x:0:0:..."},
        ]
        mapped_dups = mapper.map_commands(duplicate_probe_cmds)
        dup_tech_ids = [m.technique_id for m in mapped_dups]
        self.assertEqual(len(dup_tech_ids), len(set(dup_tech_ids)))
        self.assertEqual(len(dup_tech_ids), 2)  # Only T1033 and T1087.001, no duplicates!

    async def test_list_sessions_reconciles_zero_command_count_against_commands_table(self):
        """Regression test for production bug:
        Session row has commands_executed = 0, but clouddecept.commands contains events.
        Canonical list_sessions API response must reconcile and return the true event count.
        """
        now = datetime.now(timezone.utc)
        sid = "f81991343ed8"

        # Mock sessions query returning commands_executed = 0
        sessions_query_res = MagicMock()
        sessions_query_res.named_results.return_value = [
            {
                "session_id": sid,
                "start_time": now,
                "end_time": now,
                "duration_seconds": 12,
                "attacker_ip": "122.164.81.145",
                "country": "India",
                "protocol": "ssh",
                "commands_executed": 0,  # Stale production row with 0!
                "files_transferred": 0,
                "credentials_tried": 0,
                "intent": "system discovery",
                "skill_level": 3,
                "disconnection_reason": "Connection closed",
            }
        ]

        # Mock commands count query returning actual count of 4
        commands_cnt_res = MagicMock()
        commands_cnt_res.named_results.return_value = [
            {"session_id": sid, "cmd_count": 4}
        ]

        # Mock auth count query returning actual count of 1
        auth_cnt_res = MagicMock()
        auth_cnt_res.named_results.return_value = [
            {"session_id": sid, "auth_count": 1}
        ]

        def mock_query(sql):
            sql_str = str(sql)
            if "FROM clouddecept.sessions" in sql_str:
                return sessions_query_res
            if "FROM clouddecept.commands" in sql_str:
                return commands_cnt_res
            if "FROM clouddecept.auth_attempts" in sql_str:
                return auth_cnt_res
            return MagicMock(named_results=MagicMock(return_value=[]))

        self.mock_ch.query.side_effect = mock_query

        results = await api_main.list_sessions(limit=50, hours=24)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].session_id, sid)
        # Truthful reconciliation: must report 4 unique commands, NOT 0!
        self.assertEqual(results[0].commands_executed, 4)
        self.assertEqual(results[0].credentials_tried, 1)

    async def test_search_sessions_reconciles_zero_command_count(self):
        """Verify /sessions/search reconciles commands_executed from commands table."""
        now = datetime.now(timezone.utc)
        sid = "f81991343ed8"

        cmd_match_res = MagicMock()
        cmd_match_res.named_results.return_value = [{"session_id": sid}]

        sessions_query_res = MagicMock()
        sessions_query_res.named_results.return_value = [
            {
                "session_id": sid,
                "start_time": now,
                "end_time": now,
                "duration_seconds": 12,
                "attacker_ip": "122.164.81.145",
                "country": "India",
                "protocol": "ssh",
                "commands_executed": 0,  # Stale row with 0
                "intent": "system discovery",
                "skill_level": 3,
            }
        ]

        commands_cnt_res = MagicMock()
        commands_cnt_res.named_results.return_value = [
            {"session_id": sid, "cmd_count": 6}
        ]

        def mock_query(sql):
            sql_str = str(sql)
            if "WHERE command ILIKE" in sql_str:
                return cmd_match_res
            if "FROM clouddecept.sessions" in sql_str:
                return sessions_query_res
            if "FROM clouddecept.commands" in sql_str:
                return commands_cnt_res
            return MagicMock(named_results=MagicMock(return_value=[]))

        self.mock_ch.query.side_effect = mock_query

        results = await api_main.search_sessions(query="whoami")
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["commands_executed"], 6)

    async def test_list_sessions_deduplicates_multiple_historical_session_rows(self):
        """Verify list_sessions deduplicates multiple historical ReplacingMergeTree rows."""
        now = datetime.now(timezone.utc)
        sid = "f81991343ed8"

        # ClickHouse returns 2 unmerged rows for same session_id
        sessions_query_res = MagicMock()
        sessions_query_res.named_results.return_value = [
            {
                "session_id": sid,
                "start_time": now,
                "end_time": now,
                "duration_seconds": 12,
                "attacker_ip": "122.164.81.145",
                "country": "India",
                "protocol": "ssh",
                "commands_executed": 0,
                "files_transferred": 0,
                "credentials_tried": 0,
                "intent": "system discovery",
                "skill_level": 3,
                "disconnection_reason": "Connection closed",
            },
            {
                "session_id": sid,
                "start_time": now,
                "end_time": now,
                "duration_seconds": 12,
                "attacker_ip": "122.164.81.145",
                "country": "India",
                "protocol": "ssh",
                "commands_executed": 0,
                "files_transferred": 0,
                "credentials_tried": 0,
                "intent": "system discovery",
                "skill_level": 3,
                "disconnection_reason": "Connection closed",
            },
        ]

        commands_cnt_res = MagicMock()
        commands_cnt_res.named_results.return_value = [{"session_id": sid, "cmd_count": 3}]

        def mock_query(sql):
            sql_str = str(sql)
            if "FROM clouddecept.sessions" in sql_str:
                return sessions_query_res
            if "FROM clouddecept.commands" in sql_str:
                return commands_cnt_res
            return MagicMock(named_results=MagicMock(return_value=[]))

        self.mock_ch.query.side_effect = mock_query

        results = await api_main.list_sessions(limit=50, hours=24)
        # Must be deduplicated down to 1 session
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].commands_executed, 3)

    async def test_persisted_10_authoritative_4_returns_4(self):
        """Verify persisted count 10 + authoritative count 4 → API returns 4 without max() override."""
        now = datetime.now(timezone.utc)
        sid = "sess-audit-1"

        sessions_res = MagicMock()
        sessions_res.named_results.return_value = [{
            "session_id": sid,
            "start_time": now,
            "end_time": now,
            "duration_seconds": 30,
            "attacker_ip": "10.0.0.1",
            "country": "US",
            "protocol": "ssh",
            "commands_executed": 10,
            "files_transferred": 0,
            "credentials_tried": 2,
            "intent": "reconnaissance",
            "skill_level": 2,
            "disconnection_reason": "closed",
        }]

        cmds_res = MagicMock()
        cmds_res.named_results.return_value = [{"session_id": sid, "cmd_count": 4}]

        auth_res = MagicMock()
        auth_res.named_results.return_value = [{"session_id": sid, "auth_count": 1}]

        def mock_query(sql):
            s = str(sql)
            if "FROM clouddecept.sessions" in s:
                return sessions_res
            if "FROM clouddecept.commands" in s:
                return cmds_res
            if "FROM clouddecept.auth_attempts" in s:
                return auth_res
            return MagicMock(named_results=MagicMock(return_value=[]))

        self.mock_ch.query.side_effect = mock_query

        results = await api_main.list_sessions(limit=50, hours=24)
        self.assertEqual(len(results), 1)
        # Authoritative telemetry 4 must override stale persisted 10
        self.assertEqual(results[0].commands_executed, 4)
        self.assertEqual(results[0].credentials_tried, 1)

    async def test_persisted_0_authoritative_4_returns_4(self):
        """Verify persisted count 0 + authoritative count 4 → API returns 4."""
        now = datetime.now(timezone.utc)
        sid = "sess-audit-2"

        sessions_res = MagicMock()
        sessions_res.named_results.return_value = [{
            "session_id": sid,
            "start_time": now,
            "end_time": now,
            "duration_seconds": 30,
            "attacker_ip": "10.0.0.2",
            "country": "US",
            "protocol": "ssh",
            "commands_executed": 0,
            "files_transferred": 0,
            "credentials_tried": 0,
            "intent": "reconnaissance",
            "skill_level": 2,
            "disconnection_reason": "closed",
        }]

        cmds_res = MagicMock()
        cmds_res.named_results.return_value = [{"session_id": sid, "cmd_count": 4}]

        def mock_query(sql):
            s = str(sql)
            if "FROM clouddecept.sessions" in s:
                return sessions_res
            if "FROM clouddecept.commands" in s:
                return cmds_res
            return MagicMock(named_results=MagicMock(return_value=[]))

        self.mock_ch.query.side_effect = mock_query

        results = await api_main.list_sessions(limit=50, hours=24)
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0].commands_executed, 4)

    async def test_authoritative_query_failure_retains_persisted_value(self):
        """Verify authoritative query failure → safely retain persisted value."""
        now = datetime.now(timezone.utc)
        sid = "sess-audit-3"

        sessions_res = MagicMock()
        sessions_res.named_results.return_value = [{
            "session_id": sid,
            "start_time": now,
            "end_time": now,
            "duration_seconds": 30,
            "attacker_ip": "10.0.0.3",
            "country": "US",
            "protocol": "ssh",
            "commands_executed": 8,
            "files_transferred": 0,
            "credentials_tried": 3,
            "intent": "reconnaissance",
            "skill_level": 2,
            "disconnection_reason": "closed",
        }]

        def mock_query(sql):
            s = str(sql)
            if "FROM clouddecept.sessions" in s:
                return sessions_res
            if "FROM clouddecept.commands" in s or "FROM clouddecept.auth_attempts" in s:
                raise RuntimeError("Telemetry table temporarily unavailable")
            return MagicMock(named_results=MagicMock(return_value=[]))

        self.mock_ch.query.side_effect = mock_query

        results = await api_main.list_sessions(limit=50, hours=24)
        self.assertEqual(len(results), 1)
        # Should gracefully retain persisted count when query fails
        self.assertEqual(results[0].commands_executed, 8)
        self.assertEqual(results[0].credentials_tried, 3)

    async def test_duplicate_session_rows_consolidated(self):
        """Verify duplicate session rows from ClickHouse MergeTree are consolidated deterministically."""
        now = datetime.now(timezone.utc)
        later = datetime.now(timezone.utc)
        sid = "sess-multi-part"

        # Simulate 2 parts: older part with duration 0 and empty intent, newer part with complete data
        sessions_res = MagicMock()
        sessions_res.named_results.return_value = [
            {
                "session_id": sid,
                "start_time": now,
                "end_time": now,
                "duration_seconds": 0,
                "attacker_ip": "10.0.0.4",
                "country": "DE",
                "protocol": "ssh",
                "commands_executed": 0,
                "files_transferred": 0,
                "credentials_tried": 1,
                "intent": "",
                "skill_level": 1,
                "disconnection_reason": "",
            },
            {
                "session_id": sid,
                "start_time": now,
                "end_time": later,
                "duration_seconds": 45,
                "attacker_ip": "10.0.0.4",
                "country": "DE",
                "protocol": "ssh",
                "commands_executed": 5,
                "files_transferred": 2,
                "credentials_tried": 1,
                "intent": "privilege escalation",
                "skill_level": 3,
                "disconnection_reason": "Connection closed",
            },
        ]

        cmds_res = MagicMock()
        cmds_res.named_results.return_value = [{"session_id": sid, "cmd_count": 5}]

        def mock_query(sql):
            s = str(sql)
            if "FROM clouddecept.sessions" in s:
                return sessions_res
            if "FROM clouddecept.commands" in s:
                return cmds_res
            return MagicMock(named_results=MagicMock(return_value=[]))

        self.mock_ch.query.side_effect = mock_query

        results = await api_main.list_sessions(limit=50, hours=24)
        self.assertEqual(len(results), 1)
        sess = results[0]
        self.assertEqual(sess.session_id, sid)
        self.assertEqual(sess.duration_seconds, 45)
        self.assertEqual(sess.commands_executed, 5)
        self.assertEqual(sess.files_transferred, 2)
        self.assertEqual(sess.intent, "privilege escalation")
        self.assertEqual(sess.skill_level, 3)


if __name__ == "__main__":
    unittest.main()



