"""
Unit test: EvalPushClient.push_stage must not block the event loop.

TC-PUSH-EVAL-1: push_stage() runs urllib.request.urlopen via asyncio.to_thread().
                The event loop thread must NOT be the thread executing urlopen.

Regression guard for the /health block bug:
    EvalPushClient.push_stage() used urllib.request.urlopen() directly in
    an async def — a synchronous blocking HTTP call (up to 30s timeout) that
    pinned the asyncio event loop and made /health unresponsive.
    This test fails if the asyncio.to_thread() wrapper is removed.
"""

from __future__ import annotations

import asyncio
import threading
import urllib.request
from typing import Optional
from unittest.mock import MagicMock, patch

import pytest

from infrastructure.eval_push_client import EvalPushClient


def test_tc_push_eval_1_urlopen_runs_in_worker_thread_not_event_loop():
    """
    TC-PUSH-EVAL-1: push_stage() must call urlopen from a worker thread, not the
    event loop thread. Regression guard for the HEALTH-BLOCK bug.
    """
    # Thread ID captured inside urlopen mock
    urlopen_thread_id: Optional[int] = None
    event_loop_thread_id: Optional[int] = None

    # Minimal fake HTTP response
    fake_resp = MagicMock()
    fake_resp.__enter__ = lambda s: s
    fake_resp.__exit__ = MagicMock(return_value=False)
    fake_resp.read.return_value = b'{"ok": true}'

    def fake_urlopen(req, timeout=None):
        nonlocal urlopen_thread_id
        urlopen_thread_id = threading.get_ident()
        return fake_resp

    async def run():
        nonlocal event_loop_thread_id
        event_loop_thread_id = threading.get_ident()

        client = EvalPushClient(mcp_server_url="http://fake-mcp:3000")
        with patch.object(urllib.request, "urlopen", side_effect=fake_urlopen):
            await client.push_stage(
                report_id="tc-push-eval-1",
                stage_result={
                    "stage_no": 1,
                    "stage_name": "RASTERIZE",
                    "status": "green",
                    "metrics_json": {},
                    "gate_failures_json": [],
                    "golden_diff_json": {},
                    "detector_version": "v1",
                    "schema_version": "1",
                },
            )

    asyncio.run(run())

    assert urlopen_thread_id is not None, (
        "urlopen was never called — check push_stage routing"
    )
    assert event_loop_thread_id is not None
    assert urlopen_thread_id != event_loop_thread_id, (
        "urlopen ran on the event loop thread — asyncio.to_thread() was not used; "
        "this would block /health for up to 30s during each push"
    )
