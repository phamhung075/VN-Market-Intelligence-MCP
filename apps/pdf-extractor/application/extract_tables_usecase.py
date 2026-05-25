"""
application/extract_tables_usecase.py — BT-3-B

ExtractTablesUseCase: orchestrates TEXT-path table extraction + balance check + push.

Application layer rules (DDD):
    - Imports ONLY from domain/ (domain ports, errors) and the standard library.
    - ZERO imports from infrastructure/, interface/ — all concrete adapters are
      injected at the composition root (main.py).
    - No HTTP or DB knowledge here — only orchestration via port calls.

Ports injected:
    - TableAssemblerPort  (concrete: infrastructure.text_table_extractor.TextTableExtractor)
    - TablePushClientPort (concrete: infrastructure.table_push_client.TablePushClient)

Balance-check logic (pure):
    Total Assets (code 270) == Total Liabilities (code 300) + Total Equity (code 400)
    within a tolerance of 1 VND (absolute delta). Any row with value_current=None
    is skipped for balance purposes. If none of the three codes are present,
    balance_check is returned as None (income statement / cash flow docs).

BCTC balance-sheet codes used for the identity check:
    - "270" → Total Assets (TỔNG CỘNG TÀI SẢN)
    - "300" → Total Liabilities (NỢ PHẢI TRẢ)
    - "400" → Total Equity (VỐN CHỦ SỞ HỮU)
    - "440" → also equity-side subtotal; used as fallback for equity if 400 is absent

FPT golden balance-check (regression anchor from BT-0 spike eval):
    Total Assets:       88,089,621,779,862 VND  → balance_pass=True  delta=0.0
    Total Liabilities:  44,338,155,487,272 VND
    Total Equity:       43,751,466,292,590 VND
"""

from __future__ import annotations

import logging
from typing import Dict, List, Optional

from domain.modules.financial_reports.ports import (
    TableAssemblerPort,
    TablePushClientPort,
)

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


class ExtractTablesUseCase:
    """
    Application use case: TEXT-path table extraction → balance check → push to mcp-server.

    Separate from ExtractPDFUseCase (no 1954c collision — different trigger,
    different endpoint, different data store).

    Wiring (composition root — main.py):
        table_extractor  = TextTableExtractor()
        table_push_client = TablePushClient(mcp_server_url=cfg.mcp_server_url)
        extract_tables_usecase = ExtractTablesUseCase(table_extractor, table_push_client)
    """

    def __init__(
        self,
        table_extractor: TableAssemblerPort,
        table_push_client: TablePushClientPort,
    ) -> None:
        """
        Args:
            table_extractor:   Injected TableAssemblerPort implementation.
                               Converts PDF OCR text → structured rows.
            table_push_client: Injected TablePushClientPort implementation.
                               POSTs rows + balance check to mcp-server.
        """
        self._extractor = table_extractor
        self._push_client = table_push_client

    async def execute(
        self,
        report_id: str,
        pdf_path: str,
        statement_section: str,
    ) -> Dict:
        """
        Orchestrate: assemble rows → compute balance check → push to mcp-server.

        Args:
            report_id:         UUID string matching financial_reports.id on mcp-server.
            pdf_path:          Absolute path to the PDF file on disk.
            statement_section: One of "balance_sheet" | "income_statement" | "cash_flow".

        Returns:
            dict with keys:
                rows_stored (int):    Number of rows stored (echoed from push client).
                balance_pass (bool):  True when accounting identity holds within tolerance.
                balance_delta (float): assets - (liab + equity); 0.0 when identity N/A.
        """
        logger.info(
            "ExtractTablesUseCase.execute: report_id=%s section=%s pdf_path=%s",
            report_id,
            statement_section,
            pdf_path,
        )

        # ------------------------------------------------------------------
        # Step 1: Assemble structured rows from OCR text
        # ------------------------------------------------------------------
        # Build pages list — the concrete TextTableExtractor reads the PDF
        # directly from pdf_path when pages=[{"page_number": 0, "path": pdf_path}].
        # The port contract requires pages: list[dict] with at least page_number + text.
        # TextTableExtractor interprets an empty pages list as a "read-from-path" signal.
        pages: List[Dict] = [{"page_number": 0, "path": pdf_path}]

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
        # Step 3: Push rows + balance check to mcp-server
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
        # Step 4: Return summary
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
        }
