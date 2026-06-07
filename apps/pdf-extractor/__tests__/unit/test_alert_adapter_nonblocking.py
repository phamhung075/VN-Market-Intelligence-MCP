"""
Unit test: TelegramAlertAdapter.send_work_alert must not block the event loop.

TC-ALERT-1: send_work_alert() runs urllib.request.urlopen via asyncio.to_thread().
            The event loop thread must NOT be the thread executing urlopen.

Regression guard for the FIX-PDFX-ALERT-ADAPTER-BLOCKING incident:
    TelegramAlertAdapter.send_work_alert() used urllib.request.urlopen() directly
    in an async def without offloading — a synchronous blocking HTTP call (5s
    timeout) that pinned the asyncio event loop during the BT-5 gate block path.
    This test fails if the asyncio.to_thread() wrapper is removed.

Pattern mirrors TC-PUSH-1 in test_table_push_client_nonblocking.py (commit f0999cff).
"""

from __future__ import annotations

import asyncio
import threading
import urllib.request
from typing import Optional
from unittest.mock import MagicMock, patch

import pytest

from infrastructure.alert_adapter import TelegramAlertAdapter


def test_tc_alert_1_urlopen_runs_in_worker_thread_not_event_loop():
    """
    TC-ALERT-1: send_work_alert() must call urlopen from a worker thread, not the
    event loop thread. Regression guard for FIX-PDFX-ALERT-ADAPTER-BLOCKING.
    """
    # Thread ID captured inside urlopen mock
    urlopen_thread_id: Optional[int] = None
    event_loop_thread_id: Optional[int] = None

    # Minimal fake HTTP response
    fake_resp = MagicMock()
    fake_resp.__enter__ = lambda s: s
    fake_resp.__exit__ = MagicMock(return_value=False)
    fake_resp.status = 200

    def fake_urlopen(req, timeout=None):
        nonlocal urlopen_thread_id
        urlopen_thread_id = threading.get_ident()
        return fake_resp

    async def run():
        nonlocal event_loop_thread_id
        event_loop_thread_id = threading.get_ident()

        adapter = TelegramAlertAdapter(
            bot_token="test-token",
            work_chat_id="-100123456789",
        )
        with patch.object(urllib.request, "urlopen", side_effect=fake_urlopen):
            await adapter.send_work_alert("TC-ALERT-1 test message")

    asyncio.run(run())

    assert urlopen_thread_id is not None, (
        "urlopen was never called — check send_work_alert routing"
    )
    assert event_loop_thread_id is not None
    assert urlopen_thread_id != event_loop_thread_id, (
        "urlopen ran on the event loop thread — asyncio.to_thread() was not used; "
        "this would block the event loop for up to 5s during each BT-5 gate alert"
    )
