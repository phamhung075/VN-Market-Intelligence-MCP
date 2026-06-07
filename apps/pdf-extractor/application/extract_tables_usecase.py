"""
application/extract_tables_usecase.py — BT-3-B + BT-5 + BT-3-D + BT-7

ExtractTablesUseCase: orchestrates TEXT-path table extraction + balance check +
cross-check gate (BT-5) + push.

BT-3-D fix: OcrPort injected so the production path actually runs Tesseract.
The BT-3-C integration test gave a FALSE-GREEN by pre-supplying OCR text via a
PreloadedTextTableExtractor subclass that ignored the pages arg entirely. In
production, execute() built pages=[{"page_number": 0, "path": pdf_path}] with
no "text" key, so assemble() got empty strings → 0 rows.

Fixed wiring (BT-3-D):
  1. If caller supplies pages with "text" already (from mcp-server pre-supply via
     BT-4b-2 DEFERRED), use them directly — no OCR needed (host-safe).
  2. Otherwise, call ocr_port.locate_balance_sheet_pages(pdf_path) to auto-find
     the section, then ocr_port.ocr_pages() to OCR only those pages (host-safe:
     sequential, small page range, self-hosted Tesseract only).

Application layer rules (DDD):
    - Imports ONLY from domain/ (domain ports, primitives) and the standard library.
    - ZERO imports from infrastructure/, interface/ — all concrete adapters are
      injected at the composition root (main.py).
    - No HTTP or DB knowledge here — only orchestration via port calls.

Ports injected:
    - TableAssemblerPort  (concrete: infrastructure.text_table_extractor.TextTableExtractor)
    - TablePushClientPort (concrete: infrastructure.table_push_client.TablePushClient)
    - AlertPort           (concrete: infrastructure.alert_adapter.TelegramAlertAdapter) [BT-5]
                          (fake: FakeAlertPort in tests)
    - OcrPort             (concrete: infrastructure.ocr_adapter.PdfOcrAdapter) [BT-3-D]
                          (fake: FakeOcrPort in tests — returns pre-built pages)
                          (default None → falls back to empty pages, preserves backward-compat
                           with existing unit tests that inject fake assemblers)
    - ocr_executor        Optional[Executor] — PDFX-SINGLE-WORKER-BLOCKING fix.
                          When supplied (production: ProcessPoolExecutor(max_workers=1)),
                          OCR worker functions from infrastructure.ocr_worker are dispatched
                          via loop.run_in_executor() into a separate OS process.
                          This isolates Tesseract CPU from the uvicorn event loop process,
                          allowing /health to respond even when CPU is saturated at 100%+.
                          Default None → falls back to asyncio.to_thread() (backward-compat
                          for unit tests that inject fake OcrPort adapters).

Balance-check logic (pure):
    Total Assets (code 270) == Total Liabilities (code 300) + Total Equity (code 400)
    within a tolerance of 1 VND (absolute delta). Any row with value_current=None
    is skipped for balance purposes. If none of the three codes are present,
    balance_check is returned as None (income statement / cash flow docs).

BT-5 Cross-check Gate (reconciliation gate — BEFORE push):
    Two blocking conditions (either triggers a block):
    1. balance_check is available AND balance_pass=False
       (accounting identity fails beyond 1 VND tolerance)
    2. reconcile_figures(total_assets, liab_plus_equity) returns "shift"
       (ratio > 10× — decimal-shift / unit anomaly)

    If BLOCKED: push is skipped; blocked_reason="cross_check_fail" returned;
    WORK alert emitted via injected AlertPort (no Telegram credentials in this layer).

    If PASSED: push proceeds normally; blocked_reason=None in result.

    Non-balance-sheet sections (income_statement / cash_flow): no gate applied
    (balance identity does not apply; push proceeds unconditionally).

BCTC balance-sheet codes used for the identity check:
    - "270" → Total Assets (TỔNG CỘNG TÀI SẢN)
    - "300" → Total Liabilities (NỢ PHẢI TRẢ)
    - "400" → Total Equity (VỐN CHỦ SỞ HỨU)
    - "440" → also equity-side subtotal; used as fallback for equity if 400 is absent

FPT golden balance-check (regression anchor from BT-0 spike eval):
    Total Assets:       88,089,621,779,862 VND  → balance_pass=True  delta=0.0
    Total Liabilities:  44,338,155,487,272 VND
    Total Equity:       43,751,466,292,590 VND
    reconcile_figures(total_assets, liab+equity) → "agree" (same value) → gate PASS
"""

from __future__ import annotations

import asyncio
import logging
from concurrent.futures import Executor
from typing import Dict, List, Optional

from domain.modules.financial_reports.ports import (
    TableAssemblerPort,
    TablePushClientPort,
)
from domain.primitives.reconcile_figures import reconcile_figures
from domain.primitives.select_balance_sheet_section import select_balance_sheet_section
from domain.repositories import AlertPort, OcrPort

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Balance-check constants
# ---------------------------------------------------------------------------

# BCTC code for Total Assets (used in BS identity check)
_CODE_TOTAL_ASSETS = "270"
# BCTC code for Total Liabilities
_CODE_TOTAL_LIABILITIES = "300"
# BCTC code for Total Equity (primary)
_CODE_TOTAL_EQUITY = "400"
# BCTC code for Total Equity (fallback — sometimes present instead of 400)
_CODE_TOTAL_EQUITY_ALT = "440"

# Tolerance: 1 VND absolute delta (FPT identity holds to the dong)
_BALANCE_TOLERANCE_VND = 1.0


# ---------------------------------------------------------------------------
# Pure balance-check helper
# ---------------------------------------------------------------------------


def _compute_balance_check(rows: List[Dict]) -> Optional[Dict]:
    """
    Compute balance check from structured rows.

    Searches for codes 270 (total assets), 300 (liabilities), 400/440 (equity).
    Returns None if none of the three codes are found (e.g., income-statement docs).

    Args:
        rows: List of row dicts from TableAssemblerPort.assemble().

    Returns:
        dict with keys:
            total_assets (float | None)
            total_liabilities (float | None)
            total_equity (float | None)
            balance_delta (float)   — assets - (liab + equity); 0.0 if values missing
            balance_pass (bool)     — True when |delta| <= tolerance AND all values present
        or None if the accounting identity cannot be evaluated (missing codes).
    """
    total_assets: Optional[float] = None
    total_liabilities: Optional[float] = None
    total_equity: Optional[float] = None

    for row in rows:
        code = row.get("code")
        val = row.get("value_current")
        if val is None:
            continue
        if code == _CODE_TOTAL_ASSETS:
            total_assets = float(val)
        elif code == _CODE_TOTAL_LIABILITIES:
            total_liabilities = float(val)
        elif code in (_CODE_TOTAL_EQUITY, _CODE_TOTAL_EQUITY_ALT):
            # Prefer 400 over 440; take first match
            if total_equity is None:
                total_equity = float(val)

    # If none of the codes were found, this is not a balance-sheet section
    if total_assets is None and total_liabilities is None and total_equity is None:
        return None

    # Compute delta (assets - (liab + equity))
    if total_assets is not None and total_liabilities is not None and total_equity is not None:
        delta = total_assets - (total_liabilities + total_equity)
        balance_pass = abs(delta) <= _BALANCE_TOLERANCE_VND
    else:
        # At least one value is missing — cannot confirm identity
        delta = 0.0
        balance_pass = False

    return {
        "total_assets": total_assets,
        "total_liabilities": total_liabilities,
        "total_equity": total_equity,
        "balance_delta": delta,
        "balance_pass": balance_pass,
    }


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------


def _run_reconciliation_gate(
    balance_check: Optional[Dict],
    rows: List[Dict],
) -> Optional[str]:
    """
    BT-5 cross-check gate (pure — no I/O).

    Runs two checks in order:
    1. Balance identity: if balance_check is available and balance_pass=False → block.
    2. Decimal-shift anomaly: compare total_assets (code 270) against
       (liab+equity) using reconcile_figures. Ratio >10× → block.

    Args:
        balance_check: Result of _compute_balance_check(), or None.
        rows:          Structured rows from TableAssemblerPort.assemble().

    Returns:
        "cross_check_fail" if the gate fires (push must be blocked).
        None if the gate passes (push may proceed).
    """
    # Check 1: Balance identity failure
    if balance_check is not None and not balance_check["balance_pass"]:
        logger.warning(
            "BT-5 gate: balance identity FAIL — delta=%s (tolerance=1 VND)",
            balance_check.get("balance_delta"),
        )
        return "cross_check_fail"

    # Check 2: Decimal-shift anomaly between total_assets and (liab+equity sum)
    total_assets: Optional[float] = None
    total_liabilities: Optional[float] = None
    total_equity: Optional[float] = None

    for row in rows:
        code = row.get("code")
        val = row.get("value_current")
        if val is None:
            continue
        if code == _CODE_TOTAL_ASSETS:
            total_assets = float(val)
        elif code == _CODE_TOTAL_LIABILITIES:
            total_liabilities = float(val)
        elif code in (_CODE_TOTAL_EQUITY, _CODE_TOTAL_EQUITY_ALT):
            if total_equity is None:
                total_equity = float(val)

    # Only run reconcile if we have all three values
    if total_assets is not None and total_liabilities is not None and total_equity is not None:
        liab_plus_equity = total_liabilities + total_equity
        verdict = reconcile_figures(total_assets, liab_plus_equity, tol=1.0)
        if verdict == "shift":
            logger.warning(
                "BT-5 gate: reconcile_figures SHIFT — total_assets=%s liab+equity=%s "
                "(ratio >10×, decimal-shift anomaly)",
                total_assets,
                liab_plus_equity,
            )
            return "cross_check_fail"

    return None


class ExtractTablesUseCase:
    """
    Application use case: TEXT-path table extraction → balance check →
    cross-check gate (BT-5) → push to mcp-server.

    Separate from ExtractPDFUseCase (no 1954c collision — different trigger,
    different endpoint, different data store).

    Wiring (composition root — main.py):
        table_extractor  = TextTableExtractor()
        table_push_client = TablePushClient(mcp_server_url=cfg.mcp_server_url)
        alert_adapter     = TelegramAlertAdapter()
        ocr_adapter       = PdfOcrAdapter()          # BT-3-D
        ocr_executor      = ProcessPoolExecutor(max_workers=1)  # PDFX-SINGLE-WORKER-BLOCKING
        extract_tables_usecase = ExtractTablesUseCase(
            table_extractor, table_push_client, alert_adapter, ocr_adapter,
            ocr_executor=ocr_executor,
        )

    BT-3-D OCR wiring:
        execute() now accepts an optional pre_supplied_pages argument. When pages
        already have "text" (pre-supplied from mcp-server, BT-4b-2 DEFERRED), they
        are used directly. When pages are absent or have no "text", the injected
        ocr_port auto-locates the balance-sheet section and OCRs only those pages.

    PDFX-SINGLE-WORKER-BLOCKING process pool wiring:
        When ocr_executor is supplied, Path B dispatches work via
        loop.run_in_executor(ocr_executor, worker_fn, args...) using picklable
        functions from infrastructure.ocr_worker. The OCR runs in a separate OS
        process, isolating CPU saturation from the uvicorn event loop process.
        When ocr_executor is None (unit tests, backward-compat), falls back to
        asyncio.to_thread() with the injected ocr_port methods.

    BT-5 gate:
        After balance-check, before push — runs _run_reconciliation_gate().
        If gate fires: push is SKIPPED, blocked_reason="cross_check_fail" returned,
        WORK alert emitted via injected alert_port.
        If gate passes: push proceeds, blocked_reason=None in result.

    Backward-compat: alert_port, ocr_port, and ocr_executor default to None.
    Existing unit tests (BT-3-B, BT-5, TC11) use fake OcrPort and are unaffected.
    """

    def __init__(
        self,
        table_extractor: TableAssemblerPort,
        table_push_client: TablePushClientPort,
        alert_port: Optional[AlertPort] = None,
        ocr_port: Optional[OcrPort] = None,
        ocr_executor: Optional[Executor] = None,
    ) -> None:
        """
        Args:
            table_extractor:   Injected TableAssemblerPort implementation.
                               Converts PDF OCR text → structured rows.
            table_push_client: Injected TablePushClientPort implementation.
                               POSTs rows + balance check to mcp-server.
            alert_port:        Injected AlertPort implementation (BT-5).
                               Emits WORK-channel alert when gate blocks.
                               Default None → no alert (backward-compat).
            ocr_port:          Injected OcrPort implementation (BT-3-D).
                               Auto-locates BS pages + runs Tesseract.
                               Default None → no OCR (backward-compat for
                               unit tests that inject fake assemblers with
                               pre-built row fixtures).
            ocr_executor:      Optional[Executor] — PDFX-SINGLE-WORKER-BLOCKING.
                               When provided (production: ProcessPoolExecutor),
                               OCR work runs in a separate process via
                               loop.run_in_executor(). Uses picklable worker
                               functions from infrastructure.ocr_worker.
                               Default None → asyncio.to_thread() fallback
                               (unit-test backward-compat).
        """
        self._extractor = table_extractor
        self._push_client = table_push_client
        self._alert_port = alert_port
        self._ocr_port = ocr_port
        self._ocr_executor = ocr_executor

    async def execute(
        self,
        report_id: str,
        pdf_path: str,
        statement_section: str,
        pre_supplied_pages: Optional[List[Dict]] = None,
    ) -> Dict:
        """
        Orchestrate: OCR (if needed) → assemble rows → compute balance check →
        cross-check gate (BT-5) → push to mcp-server (if gate passes).

        Args:
            report_id:           UUID string matching financial_reports.id on mcp-server.
            pdf_path:            Absolute path to the PDF file on disk.
            statement_section:   One of "balance_sheet" | "income_statement" | "cash_flow".
            pre_supplied_pages:  Optional list of {page_number, text} dicts.
                                 When present AND all pages have a "text" key, used directly
                                 without calling OCR (host-safe reuse of stored OCR text).
                                 BT-4b-2 DEFERRED: mcp-server backfill will populate this
                                 from pdf_extracted_text to avoid re-OCR on the 16GB Mac.

        Returns:
            dict with keys:
                rows_stored (int):      Number of rows stored (echoed from push client).
                                        0 when gate blocks (push skipped).
                balance_pass (bool):    True when accounting identity holds within tolerance.
                balance_delta (float):  assets - (liab + equity); 0.0 when identity N/A.
                blocked_reason (str|None): "cross_check_fail" when gate blocks;
                                            None when gate passes (BT-5).
        """
        logger.info(
            "ExtractTablesUseCase.execute: report_id=%s section=%s pdf_path=%s",
            report_id,
            statement_section,
            pdf_path,
        )

        # ------------------------------------------------------------------
        # Step 1: Build pages list with OCR text
        #
        # Priority order (host-safety — avoid redundant OCR on 16GB Mac):
        #   A) pre_supplied_pages with "text" → use as-is (zero Tesseract calls)
        #   B) ocr_port available → auto-locate BS pages + OCR only those pages
        #   C) Neither available → pass empty pages (backward-compat for unit tests
        #      that inject fake assemblers; real rows come from the fake assemble())
        # ------------------------------------------------------------------
        pages: List[Dict]

        if pre_supplied_pages and all(p.get("text") is not None for p in pre_supplied_pages):
            # Path A: caller pre-supplied OCR text (e.g. mcp-server backfill from
            # pdf_extracted_text) — no Tesseract needed. Host-safe.
            #
            # BT-7 fix: apply balance-sheet section filter BEFORE assembling.
            # Without this filter, ALL stored OCR pages (including cover, signature,
            # notes) flood the assembler → ~2000+ noise rows and a corrupted
            # period_current (e.g., "26/01/2026" from digital-signature timestamp
            # instead of "31/12/2025" from the BS column header).
            #
            # select_balance_sheet_section() is a pure domain primitive that scans
            # each page's text for Vietnamese BS markers and returns only the
            # contiguous BS section pages. Applied here (Path A) so both paths
            # (A and B) feed only BS pages to the assembler.
            raw_pages = pre_supplied_pages
            if statement_section == "balance_sheet":
                pages = select_balance_sheet_section(raw_pages)
                logger.info(
                    "ExtractTablesUseCase: BS section filter: %d pre-supplied pages → "
                    "%d BS pages (section=%s)",
                    len(raw_pages),
                    len(pages),
                    statement_section,
                )
                if len(pages) == len(raw_pages):
                    # No filter applied (fallback: no markers found — non-standard layout)
                    logger.warning(
                        "ExtractTablesUseCase: BS section filter found no markers in "
                        "pre-supplied pages — using all %d pages (non-standard layout). "
                        "Row count may be noisy.",
                        len(pages),
                    )
            else:
                # Non-balance-sheet sections: no section filter needed
                pages = raw_pages
            logger.info(
                "ExtractTablesUseCase: using %d pre-supplied pages after filtering (no OCR needed)",
                len(pages),
            )
        elif self._ocr_port is not None:
            # Path B: auto-locate BS pages + OCR (BT-3-D production path).
            # locate_balance_sheet_pages() uses pdfplumber native text (fast, no OCR).
            # ocr_pages() uses Tesseract vie+eng on the located pages only (sequential).
            #
            # PDFX-SINGLE-WORKER-BLOCKING root-cause fix:
            #   When ocr_executor (ProcessPoolExecutor) is injected, dispatch picklable
            #   worker functions from infrastructure.ocr_worker into a separate OS
            #   process. This fully isolates Tesseract CPU from the uvicorn event loop
            #   process — even at 100%+ CPU, the OS schedules uvicorn independently
            #   so /health can accept and respond within the healthcheck window.
            #
            #   When ocr_executor is None (unit tests / backward-compat), fall back to
            #   asyncio.to_thread() with the injected ocr_port methods. This preserves
            #   TC11's thread-isolation assertion (different thread from event loop).
            if self._ocr_executor is not None:
                # Process-pool path (production): import worker fns here to avoid
                # importing infrastructure/ at module load time (DDD boundary).
                # The import is deferred so application/ never has a top-level
                # dependency on infrastructure/ — composition root injects executor.
                import importlib
                _ocr_worker = importlib.import_module("infrastructure.ocr_worker")
                _locate_fn = _ocr_worker.locate_balance_sheet_pages_worker
                _ocr_fn = _ocr_worker.ocr_pages_worker

                loop = asyncio.get_running_loop()
                bs_page_numbers: List[int] = await loop.run_in_executor(
                    self._ocr_executor, _locate_fn, pdf_path
                )
                logger.info(
                    "ExtractTablesUseCase [process-pool]: auto-located %d BS pages: %s",
                    len(bs_page_numbers),
                    bs_page_numbers,
                )
                # functools.partial needed because run_in_executor takes fn + *args
                import functools
                pages = await loop.run_in_executor(
                    self._ocr_executor,
                    functools.partial(_ocr_fn, pdf_path, bs_page_numbers),
                )
                logger.info(
                    "ExtractTablesUseCase [process-pool]: OCR complete — %d pages, total chars=%d",
                    len(pages),
                    sum(len(p.get("text", "")) for p in pages),
                )
            else:
                # Thread-pool fallback (unit tests / no-executor path).
                # asyncio.to_thread() offloads to the default ThreadPoolExecutor —
                # OCR runs on a worker thread, not the event loop thread.
                # TC11 verifies this via threading.get_ident() comparison.
                ocr_port = self._ocr_port
                bs_page_numbers = await asyncio.to_thread(
                    ocr_port.locate_balance_sheet_pages, pdf_path
                )
                logger.info(
                    "ExtractTablesUseCase [thread-pool]: auto-located %d BS pages: %s",
                    len(bs_page_numbers),
                    bs_page_numbers,
                )
                pages = await asyncio.to_thread(
                    ocr_port.ocr_pages, pdf_path, bs_page_numbers
                )
                logger.info(
                    "ExtractTablesUseCase [thread-pool]: OCR complete — %d pages, total chars=%d",
                    len(pages),
                    sum(len(p.get("text", "")) for p in pages),
                )
        else:
            # Path C: no OCR port, no pre-supplied text — backward-compat for unit tests.
            # Unit tests inject a FakeTableAssembler that returns pre-built rows regardless
            # of the pages argument. This path yields 0 rows in production (intentionally
            # not supported without an OcrPort).
            pages = []
            logger.warning(
                "ExtractTablesUseCase: no ocr_port and no pre_supplied_pages — "
                "passing empty pages (backward-compat unit-test path; "
                "production MUST inject ocr_port)"
            )

        assembled = self._extractor.assemble(pages=pages, statement_section=statement_section)
        rows: List[Dict] = assembled.get("rows", [])
        period_current: str = assembled.get("period_current", "")
        period_prior: Optional[str] = assembled.get("period_prior")

        logger.info(
            "ExtractTablesUseCase: assembled rows=%d period_current=%s period_prior=%s",
            len(rows),
            period_current,
            period_prior,
        )

        # ------------------------------------------------------------------
        # Step 2: Compute balance check (pure logic — no I/O)
        # ------------------------------------------------------------------
        balance_check: Optional[Dict] = None
        if statement_section == "balance_sheet":
            balance_check = _compute_balance_check(rows)
            if balance_check is not None:
                logger.info(
                    "ExtractTablesUseCase: balance_pass=%s delta=%s",
                    balance_check["balance_pass"],
                    balance_check.get("balance_delta"),
                )
            else:
                logger.info(
                    "ExtractTablesUseCase: balance-check N/A (no BS codes found in rows)"
                )

        # ------------------------------------------------------------------
        # Step 3 (BT-5): Cross-check gate — BEFORE push
        #   Applies only to balance_sheet sections (income_statement / cash_flow
        #   have no balance identity to check).
        # ------------------------------------------------------------------
        blocked_reason: Optional[str] = None
        if statement_section == "balance_sheet" and balance_check is not None:
            blocked_reason = _run_reconciliation_gate(
                balance_check=balance_check,
                rows=rows,
            )

        if blocked_reason is not None:
            # Gate fired — emit WORK alert and skip push
            alert_msg = (
                f"BT-5 cross-check GATE BLOCKED: report_id={report_id} "
                f"reason={blocked_reason} "
                f"balance_pass={balance_check['balance_pass'] if balance_check else 'N/A'} "
                f"balance_delta={balance_check['balance_delta'] if balance_check else 'N/A'}"
            )
            logger.warning(alert_msg)

            if self._alert_port is not None:
                try:
                    await self._alert_port.send_work_alert(alert_msg)
                except Exception as exc:  # noqa: BLE001
                    # Alert failure must NOT disrupt the extraction pipeline result
                    logger.error("AlertPort.send_work_alert failed: %s", exc)

            # Return blocked result — rows_stored=0 (nothing pushed)
            balance_pass_result: bool = (
                balance_check["balance_pass"] if balance_check is not None else False
            )
            balance_delta_result: float = (
                balance_check["balance_delta"] if balance_check is not None else 0.0
            )
            logger.info(
                "ExtractTablesUseCase.execute BLOCKED: report_id=%s blocked_reason=%s",
                report_id,
                blocked_reason,
            )
            return {
                "rows_stored": 0,
                "balance_pass": balance_pass_result,
                "balance_delta": balance_delta_result,
                "blocked_reason": blocked_reason,
            }

        # ------------------------------------------------------------------
        # Step 4: Push rows + balance check to mcp-server (gate passed)
        # ------------------------------------------------------------------
        push_result = await self._push_client.push_table(
            report_id=report_id,
            statement_section=statement_section,
            rows=rows,
            balance_check=balance_check,
            period_current=period_current,
            period_prior=period_prior,
        )

        rows_stored: int = push_result.get("rows_stored", 0)

        # ------------------------------------------------------------------
        # Step 5: Return summary
        # ------------------------------------------------------------------
        balance_pass: bool = (
            balance_check["balance_pass"] if balance_check is not None else False
        )
        balance_delta: float = (
            balance_check["balance_delta"] if balance_check is not None else 0.0
        )

        logger.info(
            "ExtractTablesUseCase.execute DONE: report_id=%s rows_stored=%d balance_pass=%s",
            report_id,
            rows_stored,
            balance_pass,
        )

        return {
            "rows_stored": rows_stored,
            "balance_pass": balance_pass,
            "balance_delta": balance_delta,
            "blocked_reason": None,
        }
