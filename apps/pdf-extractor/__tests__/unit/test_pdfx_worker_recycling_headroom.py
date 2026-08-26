"""
__tests__/unit/test_pdfx_worker_recycling_headroom.py

FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM (worker-recycling amendment,
2026-08-26) — unit tests for AC-1, AC-4, AC-5 of docs/architecture-briefs/
2026-08-26-fix-pdfx-parent-process-memory-burst-headroom-worker-recycling.md

AC-2/AC-3/AC-6 are live-measurement, market-hours-gated ACs — not this file's
job (they need a real container rebuild, per that brief's AC-8/AC-9). Only
the code-complete, mock-based ACs land here.

AC-1: main.py's ocr_executor = ProcessPoolExecutor(max_workers=1,
      max_tasks_per_child=1) — recycles the shared executor CHILD process
      between every submitted task, so infrastructure/ocr_worker.py's
      module-global _paddle_ocr_worker_instance never survives cross-
      document/cross-task. Mock-based: patches ProcessPoolExecutor before
      importing main (the composition root), asserts BOTH kwargs together.

AC-4: BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT env var bounds the per-
      document PaddleOCR rescue-fire count inside ocr_pages_worker.
      Recycling (AC-1) only bounds CROSS-task retention — it structurally
      cannot interrupt one already-running ocr_pages_worker task's own
      internal loop (brief §3), which is why this budget is a mandatory
      safety belt, not an optional extra. Mocks
      _rasterize_and_ocr_page_worker to always "fire"; asserts it stops
      being called once the budget is exhausted, and that the remaining
      low-char pages keep their Tesseract text untouched (never silently
      re-attempted, never dropped).

AC-5: malloc_trim(0) fires once per rescue FIRE (not per page) inside
      ocr_pages_worker's loop — same guarded ctypes.CDLL("libc.so.6") shape
      already shipped twice (interface/pek_run_helper.py,
      interface/routes_extract.py), duplicated (not imported) here so
      ocr_worker.py — a ProcessPoolExecutor-dispatched, picklable module —
      stays self-contained and does not reach into the interface layer.
      Mocks ctypes.CDLL, asserts call count equals fire count, not page
      count.

DDD: infrastructure / composition-root layer only. No domain imports here.
"""

from __future__ import annotations

import os
import sys
import tempfile
import unittest
from unittest.mock import MagicMock, patch


# ---------------------------------------------------------------------------
# AC-1 — main.py composition root: ocr_executor recycling kwargs
# ---------------------------------------------------------------------------


class TestMainOcrExecutorRecycling(unittest.TestCase):
    """
    AC-1: main.py's ocr_executor construction carries BOTH max_workers=1
    (D6 host-safety, pre-existing, unchanged) AND max_tasks_per_child=1
    (this row) — see main.py:154's own comment for the full cross-task-vs-
    intra-task rationale (§4 of the worker-recycling brief).
    """

    def setUp(self) -> None:
        # main.py has a module-level `app = create_app()` — force a genuine
        # re-import inside the test so the patched ProcessPoolExecutor is
        # actually the one main.py's own `from concurrent.futures import
        # ProcessPoolExecutor` statement binds. The patch must be live
        # BEFORE that import statement executes, which means `main` must
        # not already be cached in sys.modules going in.
        self._prior_main = sys.modules.pop("main", None)

    def tearDown(self) -> None:
        # Test isolation — never leak a mock-executor-backed `main` module
        # into any other test file that might run in the same session.
        sys.modules.pop("main", None)
        if self._prior_main is not None:
            sys.modules["main"] = self._prior_main

    def test_ocr_executor_constructed_with_max_workers_1_and_max_tasks_per_child_1(
        self,
    ) -> None:
        with tempfile.TemporaryDirectory() as tmp_dir:
            env_overrides = {
                "DB_PATH": os.path.join(tmp_dir, "pdf_extractor.db"),
                "STORAGE_DIR": os.path.join(tmp_dir, "extractions"),
                "MARKET_DB_PATH": os.path.join(tmp_dir, "market.db"),
                "DOCLANG_OUTPUT_DIR": os.path.join(tmp_dir, "doclang"),
            }
            mock_executor_cls = MagicMock(name="ProcessPoolExecutor")
            mock_executor_cls.return_value = MagicMock(name="ocr_executor_instance")

            with patch.dict(os.environ, env_overrides), patch(
                "concurrent.futures.ProcessPoolExecutor", mock_executor_cls
            ):
                import main  # noqa: F401  — triggers create_app() at module import time

            mock_executor_cls.assert_called_once_with(
                max_workers=1, max_tasks_per_child=1
            )


# ---------------------------------------------------------------------------
# AC-4 / AC-5 — ocr_pages_worker: per-document rescue-fire budget + malloc_trim
# ---------------------------------------------------------------------------


class TestRescueBudgetDefaultValue(unittest.TestCase):
    def test_default_budget_is_4_pending_ac3(self) -> None:
        """
        AC-4: default is 4 — PROVISIONAL pending AC-3. This row does not
        measure ocr_worker.py's own fire-count curve; the design brief
        explicitly forbids picking this default by appeal to the sibling
        PID1/AutoFallbackOcrBackend measurement (evidence-provenance gap,
        brief §2).
        """
        from infrastructure import ocr_worker

        self.assertEqual(ocr_worker.BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT, 4)


class TestOcrPagesWorkerRescueBudget(unittest.TestCase):
    """AC-4: per-document PaddleOCR rescue-fire budget inside ocr_pages_worker."""

    def test_budget_stops_further_fires_remaining_pages_keep_tesseract_text(
        self,
    ) -> None:
        """
        5 low-char pages, budget=2 -> exactly 2 PaddleOCR fires (pages 1,2);
        pages 3,4,5 are never rescued and keep their (short) Tesseract text.
        """
        from infrastructure import ocr_worker

        fake_image = MagicMock()
        tess_text = "AB"  # below LOW_TESSERACT_PAGE_CHARS on every page
        paddle_text = "mot doan van ban dai hon AB duoc phuc hoi boi PaddleOCR"
        page_numbers = [1, 2, 3, 4, 5]

        with patch(
            "pdf2image.convert_from_path", return_value=[fake_image], create=True
        ), patch(
            "pytesseract.image_to_string", return_value=tess_text, create=True
        ), patch.object(
            ocr_worker, "BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT", 2
        ), patch.object(
            ocr_worker, "_rasterize_and_ocr_page_worker", return_value=paddle_text
        ) as mock_paddle:
            result = ocr_worker.ocr_pages_worker("/fake/scanned.pdf", page_numbers)

        # Fired exactly at the budget, never once per low-char page (5 would
        # be the naive/unbudgeted count).
        self.assertEqual(mock_paddle.call_count, 2)
        self.assertEqual(
            [call.args[1] for call in mock_paddle.call_args_list],
            [1, 2],
            "budget exhausts in page order: 1,2 rescued, 3,4,5 skipped",
        )

        self.assertEqual(len(result), 5)
        by_page = {row["page_number"]: row["text"] for row in result}
        # Within budget: PaddleOCR (longer) result kept.
        self.assertEqual(by_page[1], paddle_text)
        self.assertEqual(by_page[2], paddle_text)
        # After budget exhausted: Tesseract result kept as-is — never
        # silently dropped, never re-attempted.
        self.assertEqual(by_page[3], tess_text)
        self.assertEqual(by_page[4], tess_text)
        self.assertEqual(by_page[5], tess_text)

    def test_budget_exhaustion_logs_a_warning(self) -> None:
        """AC-4: exhaustion is visible in logs, not just silent aggregate behavior."""
        from infrastructure import ocr_worker

        fake_image = MagicMock()
        tess_text = "AB"
        paddle_text = "van ban duoc phuc hoi dai hon AB"

        with patch(
            "pdf2image.convert_from_path", return_value=[fake_image], create=True
        ), patch(
            "pytesseract.image_to_string", return_value=tess_text, create=True
        ), patch.object(
            ocr_worker, "BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT", 1
        ), patch.object(
            ocr_worker, "_rasterize_and_ocr_page_worker", return_value=paddle_text
        ), self.assertLogs(ocr_worker.logger, level="WARNING") as log_ctx:
            ocr_worker.ocr_pages_worker("/fake/scanned.pdf", [1, 2])

        self.assertTrue(
            any("budget exhausted" in msg for msg in log_ctx.output),
            f"expected a budget-exhaustion warning, got: {log_ctx.output}",
        )

    def test_budget_never_blocks_a_document_within_it(self) -> None:
        """
        Non-regression: a document whose low-char page count is <= the
        budget behaves exactly as before this row (every low-char page
        rescued) — the budget only bites once EXCEEDED.
        """
        from infrastructure import ocr_worker

        fake_image = MagicMock()
        tess_text = "AB"
        paddle_text = "rescued text longer than AB"

        with patch(
            "pdf2image.convert_from_path", return_value=[fake_image], create=True
        ), patch(
            "pytesseract.image_to_string", return_value=tess_text, create=True
        ), patch.object(
            ocr_worker, "BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT", 4
        ), patch.object(
            ocr_worker, "_rasterize_and_ocr_page_worker", return_value=paddle_text
        ) as mock_paddle:
            result = ocr_worker.ocr_pages_worker("/fake/scanned.pdf", [1, 2, 3])

        self.assertEqual(mock_paddle.call_count, 3)
        self.assertTrue(all(row["text"] == paddle_text for row in result))


class TestOcrPagesWorkerMallocTrimPerFire(unittest.TestCase):
    """AC-5: malloc_trim(0) fires once per rescue FIRE, not once per page."""

    def test_malloc_trim_called_once_per_fire_not_per_page(self) -> None:
        """
        3 pages: 2 low-char (fire) + 1 high-char (no fire). malloc_trim must
        be invoked exactly 2 times — matching fire count, not the 3-page count.
        """
        from infrastructure import ocr_worker

        fake_image = MagicMock()
        low_char_text = "AB"  # below threshold -> fires
        high_char_text = "X" * 200  # above threshold -> no fire
        paddle_text = "rescued text longer than AB"

        # Pages processed in sorted order 1,2,3 -> tesseract side effects line up.
        tess_side_effect = [low_char_text, low_char_text, high_char_text]

        mock_libc = MagicMock()
        mock_cdll = MagicMock(return_value=mock_libc)

        with patch(
            "pdf2image.convert_from_path", return_value=[fake_image], create=True
        ), patch(
            "pytesseract.image_to_string", side_effect=tess_side_effect, create=True
        ), patch.object(
            ocr_worker, "BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT", 10
        ), patch.object(
            ocr_worker, "_rasterize_and_ocr_page_worker", return_value=paddle_text
        ) as mock_paddle, patch("ctypes.CDLL", mock_cdll):
            ocr_worker.ocr_pages_worker("/fake/scanned.pdf", [1, 2, 3])

        self.assertEqual(mock_paddle.call_count, 2, "only the 2 low-char pages fire")
        mock_cdll.assert_called_with("libc.so.6")
        self.assertEqual(
            mock_libc.malloc_trim.call_count,
            2,
            "malloc_trim must run once per FIRE, not once per page (3 pages, 2 fires)",
        )

    def test_malloc_trim_still_fires_when_rescue_raises(self) -> None:
        """
        AC-5 shape parity with the two existing PID1 call sites: the trim
        runs on BOTH the success and exception path of the fire it follows
        (finally-block semantics), same as pek_run_helper._run_pek_extract.
        """
        from infrastructure import ocr_worker

        fake_image = MagicMock()
        tess_text = "AB"

        mock_libc = MagicMock()
        mock_cdll = MagicMock(return_value=mock_libc)

        with patch(
            "pdf2image.convert_from_path", return_value=[fake_image], create=True
        ), patch(
            "pytesseract.image_to_string", return_value=tess_text, create=True
        ), patch.object(
            ocr_worker, "BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT", 5
        ), patch.object(
            ocr_worker,
            "_rasterize_and_ocr_page_worker",
            side_effect=RuntimeError("boom"),
        ), patch("ctypes.CDLL", mock_cdll):
            result = ocr_worker.ocr_pages_worker("/fake/scanned.pdf", [1])

        self.assertEqual(mock_libc.malloc_trim.call_count, 1)
        # Existing exception fallback behavior (pre-dates this row) is unchanged:
        # keep the Tesseract text when the rescue itself raises.
        self.assertEqual(result[0]["text"], tess_text)

    def test_malloc_trim_guarded_against_non_glibc_host(self) -> None:
        """
        AC-5 guard parity: on a host without libc.so.6 (e.g. macOS dev/test),
        ctypes.CDLL raises OSError and _malloc_trim_or_noop is a silent
        no-op — never propagates, never breaks the rescue result.
        """
        from infrastructure import ocr_worker

        fake_image = MagicMock()
        tess_text = "AB"
        paddle_text = "rescued text longer than AB"

        with patch(
            "pdf2image.convert_from_path", return_value=[fake_image], create=True
        ), patch(
            "pytesseract.image_to_string", return_value=tess_text, create=True
        ), patch.object(
            ocr_worker, "BCTC_MAX_PADDLE_RESCUE_FIRES_PER_DOCUMENT", 5
        ), patch.object(
            ocr_worker, "_rasterize_and_ocr_page_worker", return_value=paddle_text
        ), patch("ctypes.CDLL", side_effect=OSError("no libc.so.6 here")):
            result = ocr_worker.ocr_pages_worker("/fake/scanned.pdf", [1])

        self.assertEqual(result[0]["text"], paddle_text)


if __name__ == "__main__":
    unittest.main()
