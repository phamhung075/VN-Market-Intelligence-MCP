"""
Unit test: interface/pek_run_helper.py process-memory hygiene.

FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM AC3/AC5 — architect brief
docs/architecture-briefs/2026-08-07-fix-pdfx-parent-process-memory-burst-headroom.md
§3/§6/§10/§11: PEK layout+table inference (PyTorch/PaddlePaddle) runs
in-process (thread-isolated only, not process-isolated like the tesseract
path). Isolated repro measured glibc `malloc_trim(0)` recovering ~70-99% of
each job's per-job RSS growth (`gc.collect()` recovers 0 bytes — the growth
is native-allocator, invisible to Python's own GC). This test guards the
`finally:`-block fix that returns that memory to the OS after every
`_run_pek_extract` invocation, on BOTH the success and the exception path
(a failed job still pays the full layout-detection allocation cost per the
brief's §2 retry-storm observation).

Per the brief's own §10/§11 test-strategy note: do NOT assert on real RSS
numbers here (non-deterministic/slow) — the RSS evidence lives in the brief
+ the replayable `scripts/audits/pdfx-pek-mem-arena-probe.py` probe, not in
CI. This unit test only asserts the trim call happens, mocked, both branches.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest


def test_malloc_trim_or_noop_calls_libc_malloc_trim():
    """Guarded ctypes.CDLL("libc.so.6").malloc_trim(0) — same shape as the
    sibling rag-service fix (app_factory._malloc_trim_or_noop), which cites
    this row as its own precedent."""
    from interface.pek_run_helper import _malloc_trim_or_noop

    fake_libc = MagicMock()
    with patch("ctypes.CDLL", return_value=fake_libc) as mock_cdll:
        _malloc_trim_or_noop()

    mock_cdll.assert_called_once_with("libc.so.6")
    fake_libc.malloc_trim.assert_called_once_with(0)


def test_malloc_trim_or_noop_swallows_oserror_on_non_glibc_platform():
    """On a platform without libc.so.6 (e.g. macOS dev/test host), ctypes.CDLL
    raises OSError — must be caught, never raised out of this helper."""
    from interface.pek_run_helper import _malloc_trim_or_noop

    with patch("ctypes.CDLL", side_effect=OSError("dlopen failed")):
        _malloc_trim_or_noop()  # must not raise


def test_malloc_trim_or_noop_real_call_never_raises():
    """Unmocked real call (exercises the actual guard on this host) — must
    never raise regardless of platform (macOS dev/test host included)."""
    from interface.pek_run_helper import _malloc_trim_or_noop

    _malloc_trim_or_noop()  # must not raise on macOS/Linux/anywhere


def _make_success_fixtures():
    adapter = MagicMock()
    adapter.extract_layout_and_tables.return_value = {
        "document_map": {},
        "units": [],
        "page_zones": [],
        "pass_rate_report": {},
    }
    push_client = AsyncMock()
    push_client.push_layout = AsyncMock(
        return_value={"units_stored": 1, "pages_stored": 1}
    )
    return adapter, push_client


def test_run_pek_extract_calls_malloc_trim_on_success_path():
    """AC3: malloc_trim(0) must run after a successful extraction (finally
    block, not only the happy-path body)."""
    from interface.pek_run_helper import _run_pek_extract

    adapter, push_client = _make_success_fixtures()

    with patch(
        "interface.pek_run_helper._malloc_trim_or_noop"
    ) as mock_trim:
        asyncio.run(
            _run_pek_extract(
                pek_adapter=adapter,
                push_client=push_client,
                report_id="mem-hygiene-success",
                pdf_path="/fake/success.pdf",
            )
        )

    mock_trim.assert_called_once_with()


def test_run_pek_extract_calls_malloc_trim_on_exception_path():
    """AC3: a FAILED job still pays the full layout-detection allocation cost
    (brief §2 retry-storm evidence) — malloc_trim(0) must run on the except
    branch too, not only on success."""
    from interface.pek_run_helper import _run_pek_extract

    failing_adapter = MagicMock()
    failing_adapter.extract_layout_and_tables.side_effect = RuntimeError(
        "simulated PEK extraction failure for mem-hygiene test"
    )

    with patch(
        "interface.pek_run_helper._malloc_trim_or_noop"
    ) as mock_trim:
        asyncio.run(
            _run_pek_extract(
                pek_adapter=failing_adapter,
                push_client=AsyncMock(),
                report_id="mem-hygiene-failure",
                pdf_path="/fake/failure.pdf",
            )
        )

    mock_trim.assert_called_once_with()


def test_run_pek_extract_trim_failure_is_non_fatal():
    """A trim sweep exception must not propagate out of _run_pek_extract —
    mirrors the file's own FAIL-LOUD-but-never-crash-the-caller discipline."""
    from interface.pek_run_helper import _run_pek_extract

    adapter, push_client = _make_success_fixtures()

    with patch(
        "interface.pek_run_helper._malloc_trim_or_noop",
        side_effect=RuntimeError("trim boom"),
    ):
        asyncio.run(
            _run_pek_extract(
                pek_adapter=adapter,
                push_client=push_client,
                report_id="mem-hygiene-trim-failure",
                pdf_path="/fake/trim-failure.pdf",
            )
        )  # must not raise
