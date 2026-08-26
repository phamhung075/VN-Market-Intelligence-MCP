"""
Regression tests — FIX-PDFX-PEK-EXTRACT-202-ACCEPTED-THEN-SILENTLY-DROPPED-SEMAPHORE-1800S

AC-2 (REPRODUCE FIRST): reproduces the drop deterministically — 2 concurrent
extractions, 1 slot, a SHORTENED wait bound (not the production 1800s
default) — and pins the fix with a regression test. No real OCR: PekEngineAdapter
is real (so the real threading.Semaphore(1) + SemaphoreContendedError path
runs), but PekEngineAdapter._run_extraction is mocked, exactly the technique
__tests__/test_pek_engine_adapter.py::TestSemaphoreGuard already uses for this
same primitive. The wait bound is shortened by patching the module-level
_SEMAPHORE_WAIT_SECONDS constant that extract_layout_and_tables() reads at
call time (same mechanism PEK_SEMAPHORE_WAIT_SECONDS overrides in production —
this is NOT the "raise the wait bound" non-fix the row forbids; it is a
TEST-ONLY shortening so the reproduction runs in milliseconds, not 30 minutes).

AC-1 (CONTRACT): before this fix, a background task that died with
SemaphoreContendedError (queue wait exhausted) was ONLY a logged traceback —
interface/pek_run_helper.py's except-Exception branch called logger.error()
and nothing else. These tests assert the NEW durable, queryable record: a
contended report_id that loses the race ends with status="failed" and an
error message describing the queue-wait timeout, readable back via
PekExtractionStatusRepository.get() / GET /pek-extract/{report_id}
(interface/routes_pek_status.py) — never silently absent.
"""

from __future__ import annotations

import asyncio
import time
from unittest.mock import AsyncMock, patch

from infrastructure.pek_engine_adapter import PekEngineAdapter, _extraction_semaphore
from infrastructure.pek_extraction_status_repository import (
    PekExtractionStatusRepository,
)
from interface.pek_run_helper import _run_pek_extract


def _fake_push_client() -> AsyncMock:
    client = AsyncMock()
    client.push_layout = AsyncMock(return_value={"units_stored": 0, "pages_stored": 0})
    return client


def _release_leak_guard() -> None:
    """
    Never leave the module-global semaphore corrupted for a later test.
    Only release if we can actually acquire it (i.e. it is free) — releasing
    a Semaphore we never held would inflate its internal counter past 1 and
    silently break the REQ-PEK-4d one-at-a-time guarantee for every test
    that runs after this one.
    """
    can_acquire = _extraction_semaphore.acquire(blocking=False)
    assert can_acquire, (
        "module-global _extraction_semaphore leaked (still held) after test "
        "teardown — REQ-PEK-4d guarantee would be broken for later tests"
    )
    _extraction_semaphore.release()


class TestSilentDropNowLeavesDurableRecord:
    """AC-1 + AC-2 for FIX-PDFX-PEK-EXTRACT-202-ACCEPTED-THEN-SILENTLY-DROPPED-SEMAPHORE-1800S."""

    def test_contended_loser_gets_failed_record_not_silent_drop(self, tmp_path):
        """
        AC-2 reproduce: extraction #1 already holds the ONE slot (mirrors the
        setup in TestSemaphoreGuard::test_semaphore_contention_waits_then_raises_after_bound
        — "another extraction is currently in flight"). Extraction #2 runs
        through the ACTUAL /pek-extract background-task path
        (interface.pek_run_helper._run_pek_extract), with the queue-wait
        bound shortened to 0.2s (not the 1800s production default) so the
        test is fast and deterministic.

        Before this fix: SemaphoreContendedError was caught and only logged —
        report_id "loser-report" would stay status="accepted" forever, with
        the failure invisible outside stdout. AC-1 requires a durable,
        queryable record instead.
        """
        wait_s = 0.2
        db_path = str(tmp_path / "pek_status_test.db")
        status_repo = PekExtractionStatusRepository(db_path=db_path)

        acquired = _extraction_semaphore.acquire(blocking=False)
        assert acquired, "test setup could not acquire the module semaphore"

        try:
            adapter = PekEngineAdapter()
            # AC-1 sequencing: the accepted record is written by routes_pek.py
            # BEFORE the background task runs — simulate that here so the test
            # proves the accepted->failed TRANSITION, not just a bare write.
            status_repo.mark_accepted("loser-report")

            with patch(
                "infrastructure.pek_engine_adapter._SEMAPHORE_WAIT_SECONDS", wait_s
            ):
                asyncio.run(
                    _run_pek_extract(
                        pek_adapter=adapter,
                        push_client=_fake_push_client(),
                        report_id="loser-report",
                        pdf_path="/fake/loser.pdf",
                        status_repo=status_repo,
                    )
                )
        finally:
            _extraction_semaphore.release()

        record = status_repo.get("loser-report")
        assert record is not None, (
            "AC-1 VIOLATION: no durable record at all for a report_id whose "
            "background task died — this is the exact silent-drop defect"
        )
        assert record["status"] == "failed", (
            f"expected status='failed' for a SemaphoreContendedError, got {record!r}"
        )
        assert record["error"] and "queue wait" in record["error"], (
            f"error message must describe the queue-wait timeout, got: {record['error']!r}"
        )
        assert record["updated_at"], "updated_at must be set on the failed record"

    def test_two_concurrent_extractions_one_slot_winner_done_loser_failed(self, tmp_path):
        """
        AC-2 literal shape: TWO concurrent /pek-extract background tasks race
        for the ONE slot at the same time (asyncio.gather — both call
        _run_pek_extract concurrently, exactly as two overlapping POST
        /pek-extract requests would). Wait bound is shortened to 0.15s;
        the winner's (mocked) extraction body holds the slot for 0.4s, long
        enough that the loser's shortened bound genuinely elapses.

        Both must end with a terminal, durable record — never one silently
        missing. This is the "13 of 45 vanished" defect at the unit level:
        with this fix, 2 requests in, 2 terminal records out (1 done + 1
        failed), never 2 in / 1 out.
        """
        wait_s = 0.2
        hold_s = 0.5
        db_path = str(tmp_path / "pek_status_race.db")
        status_repo = PekExtractionStatusRepository(db_path=db_path)

        winner_adapter = PekEngineAdapter()
        loser_adapter = PekEngineAdapter()  # shares the same module-global semaphore

        def _slow_success(pdf_path, report_id):
            time.sleep(hold_s)
            return {
                "document_map": {"total_pages": 0, "units": []},
                "units": [],
                "page_zones": [],
                "pass_rate_report": {
                    "units_total": 0,
                    "units_passing": 0,
                    "units_quarantined": 0,
                    "quarantine_breakdown": {},
                },
            }

        status_repo.mark_accepted("winner-report")
        status_repo.mark_accepted("loser-report-2")

        async def _run_both():
            with patch.object(winner_adapter, "_run_extraction", side_effect=_slow_success):
                winner_task = asyncio.ensure_future(
                    _run_pek_extract(
                        pek_adapter=winner_adapter,
                        push_client=_fake_push_client(),
                        report_id="winner-report",
                        pdf_path="/fake/winner.pdf",
                        status_repo=status_repo,
                    )
                )
                # Give the winner's worker thread a head start acquiring the
                # slot so the outcome is deterministic rather than a coin
                # flip on which coroutine's to_thread() call schedules first.
                await asyncio.sleep(0.1)
                with patch(
                    "infrastructure.pek_engine_adapter._SEMAPHORE_WAIT_SECONDS", wait_s
                ):
                    loser_task = asyncio.ensure_future(
                        _run_pek_extract(
                            pek_adapter=loser_adapter,
                            push_client=_fake_push_client(),
                            report_id="loser-report-2",
                            pdf_path="/fake/loser2.pdf",
                            status_repo=status_repo,
                        )
                    )
                    await asyncio.gather(winner_task, loser_task)

        try:
            asyncio.run(_run_both())
        finally:
            _release_leak_guard()

        winner_record = status_repo.get("winner-report")
        loser_record = status_repo.get("loser-report-2")

        assert winner_record is not None and winner_record["status"] == "done", (
            f"winner must reach status='done', got {winner_record!r}"
        )
        assert loser_record is not None, (
            "AC-1 VIOLATION: loser report_id has NO durable record — silently dropped"
        )
        assert loser_record["status"] == "failed", (
            f"loser must reach status='failed' (SemaphoreContendedError), got {loser_record!r}"
        )
        assert loser_record["error"] and "queue wait" in loser_record["error"]
