#!/usr/bin/env python3
"""
Log Forwarder - Tails Cowrie JSON log file and forwards events to Event Collector.

Maps Cowrie event types to CloudDecept event schema and POSTs to /ingest endpoint.
"""

import asyncio
import json
import logging
import os
import sys
import time
from datetime import datetime
from pathlib import Path
from typing import Any, Optional

import httpx

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(name)s: %(message)s"
)
logger = logging.getLogger("log-forwarder")

# Configuration
COWRIE_LOG_PATH = os.getenv("COWRIE_LOG_PATH", "/cowrie/var/log/cowrie/cowrie.json")
EVENT_COLLECTOR_URL = os.getenv("EVENT_COLLECTOR_URL", "http://event-collector:8000")
INGEST_ENDPOINT = f"{EVENT_COLLECTOR_URL}/ingest"
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "10"))
BATCH_TIMEOUT = float(os.getenv("BATCH_TIMEOUT", "1.0"))
FORWARDER_SOURCE = os.getenv("FORWARDER_SOURCE", "cowrie_ssh")

# Cowrie event type mapping to CloudDecept event types
COWRIE_EVENT_MAP = {
    "cowrie.session.connect": "session_start",
    "cowrie.session.closed": "session_end",
    "cowrie.login.failed": "auth",
    "cowrie.login.success": "auth",
    "cowrie.command.input": "command",
    "cowrie.command.failed": "command",
    "cowrie.command.success": "command",
    "cowrie.session.input": "command",  # interactive input
    "cowrie.session.file_download": "file_transfer",
    "cowrie.session.file_upload": "file_transfer",
}


class LogForwarder:
    """Tails a JSON log file and forwards events to HTTP endpoint."""

    def __init__(self):
        self.log_path = Path(COWRIE_LOG_PATH)
        self.client: Optional[httpx.AsyncClient] = None
        self.buffer: list[dict] = []
        self.last_flush = time.time()
        self.position = 0

    async def initialize(self):
        """Initialize HTTP client and verify log file exists."""
        self.client = httpx.AsyncClient(timeout=30.0)

        # Wait for log file to exist
        while not self.log_path.exists():
            logger.info(f"Waiting for log file: {self.log_path}")
            await asyncio.sleep(2)

        # Seek to end of file to only process new events
        self.position = self.log_path.stat().st_size
        logger.info(f"Starting tail at position {self.position}")

    async def close(self):
        """Flush buffer and close client."""
        await self.flush()
        if self.client:
            await self.client.aclose()

    def _map_event(self, cowrie_event: dict) -> Optional[dict]:
        """Map Cowrie event to CloudDecept ingest schema."""
        event_type = cowrie_event.get("eventid") or cowrie_event.get("event")
        if not event_type:
            logger.warning(f"Event missing eventid: {cowrie_event}")
            return None

        mapped_type = COWRIE_EVENT_MAP.get(event_type)
        if not mapped_type:
            logger.debug(f"No mapping for event type: {event_type}")
            return None

        # Extract session ID
        session_id = cowrie_event.get("session", "unknown")
        src_ip = cowrie_event.get("src_ip", "0.0.0.0")

        # Parse timestamp
        timestamp = cowrie_event.get("timestamp")
        if timestamp:
            try:
                dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
            except Exception:
                dt = datetime.utcnow()
        else:
            dt = datetime.utcnow()

        # Build payload based on event type
        payload = {}

        if mapped_type == "session_start":
            payload = {
                "protocol": cowrie_event.get("protocol", "ssh"),
                "client_version": cowrie_event.get("version", ""),
                "client_ip": src_ip,
            }
        elif mapped_type == "session_end":
            payload = {
                "duration_seconds": cowrie_event.get("duration", 0) // 1000
                if cowrie_event.get("duration")
                else 0,
                "commands_executed": 0,  # Could track from command events
                "disconnection_reason": cowrie_event.get("message", ""),
            }
        elif mapped_type == "auth":
            payload = {
                "username": cowrie_event.get("username", ""),
                "password": cowrie_event.get("password", ""),
                "protocol": cowrie_event.get("protocol", "ssh"),
                "success": event_type == "cowrie.login.success",
                "auth_method": cowrie_event.get("auth_method", "password"),
            }
        elif mapped_type == "command":
            payload = {
                "command": cowrie_event.get("input", ""),
                "arguments": [],
                "working_directory": "/home/ubuntu",
                "exit_code": 0 if event_type != "cowrie.command.failed" else 1,
            }
        elif mapped_type == "file_transfer":
            payload = {
                "filename": cowrie_event.get("filename", ""),
                "size_bytes": cowrie_event.get("size", 0),
                "direction": "download" if "download" in event_type else "upload",
                "protocol": "ssh",
            }

        return {
            "source": FORWARDER_SOURCE,
            "event_type": mapped_type,
            "session_id": session_id,
            "attacker_ip": src_ip,
            "timestamp": dt.isoformat(),
            "payload": payload,
        }

    async def _process_line(self, line: str) -> Optional[dict]:
        """Parse and map a single log line."""
        line = line.strip()
        if not line:
            return None

        try:
            cowrie_event = json.loads(line)
        except json.JSONDecodeError as e:
            logger.warning(f"Invalid JSON: {e} - line: {line[:100]}")
            return None

        return self._map_event(cowrie_event)

    async def flush(self):
        """Send buffered events to Event Collector."""
        if not self.buffer:
            return

        batch = self.buffer[:BATCH_SIZE]
        self.buffer = self.buffer[BATCH_SIZE:]

        try:
            response = await self.client.post(
                f"{EVENT_COLLECTOR_URL}/ingest/batch",
                json=batch,
                timeout=10.0,
            )
            if response.status_code == 200:
                results = response.json()
                success = sum(1 for r in results if r.get("success"))
                logger.debug(f"Flushed {len(batch)} events: {success} succeeded")
            else:
                logger.error(f"Failed to flush batch: {response.status_code} {response.text}")
                # Re-buffer on failure
                self.buffer = batch + self.buffer
        except Exception as e:
            logger.error(f"Error flushing events: {e}")
            # Re-buffer on error
            self.buffer = batch + self.buffer

    async def tail_log(self):
        """Main tail loop."""
        logger.info("Starting log tail...")

        while True:
            try:
                stat = self.log_path.stat()
                current_size = stat.st_size

                if current_size < self.position:
                    # Log rotated
                    logger.info("Log file rotated, seeking to start")
                    self.position = 0

                if current_size > self.position:
                    # New content
                    with open(self.log_path, "r") as f:
                        f.seek(self.position)
                        lines = f.readlines()
                        self.position = f.tell()

                    for line in lines:
                        mapped = await self._process_line(line)
                        if mapped:
                            self.buffer.append(mapped)

                    # Flush if buffer full or timeout
                    if len(self.buffer) >= BATCH_SIZE:
                        await self.flush()
                    elif time.time() - self.last_flush > BATCH_TIMEOUT:
                        await self.flush()
                        self.last_flush = time.time()

                await asyncio.sleep(0.5)

            except FileNotFoundError:
                logger.warning("Log file not found, waiting...")
                await asyncio.sleep(2)
            except Exception as e:
                logger.error(f"Error in tail loop: {e}")
                await asyncio.sleep(1)


async def main():
    forwarder = LogForwarder()
    await forwarder.initialize()

    try:
        await forwarder.tail_log()
    except KeyboardInterrupt:
        logger.info("Shutting down...")
    finally:
        await forwarder.close()


if __name__ == "__main__":
    asyncio.run(main())