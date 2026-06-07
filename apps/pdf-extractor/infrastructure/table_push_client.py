"""
infrastructure/table_push_client.py — BT-3-A

HTTP push client — delivers assembled BCTC table rows to mcp-server.

Implements TablePushClientPort (defined in domain/modules/financial_reports/ports.py).

Layer: infrastructure (does aiohttp I/O — impure). Safe per Fence-A/B.
DDD: may import from domain/primitives and infrastructure/. MUST NOT import
     from application/ or interface/.

Endpoint: POST /api/push-bctc-table on mcp-server (internal Docker network).
Auth: none (internal Docker network — same pattern as all other service-to-mcp POSTs).

Error handling: log + raise (let the use case handle retry/blocking).
"""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.error
import urllib.parse
import urllib.request
from typing import Dict, List, Optional

logger = logging.getLogger(__name__)


class TablePushClient:
    """
    HTTP POST client — pushes assembled BCTC table rows to mcp-server.

    Implements TablePushClientPort.

    Uses urllib (stdlib) instead of aiohttp for simplicity and testability —
    the use-case async wrapper calls this in a thread-pool executor if needed.
    For direct async compatibility the method is declared async; callers
    awaiting it in an event loop work correctly.

    The concrete aiohttp variant can be substituted as a drop-in replacement
    behind the same port interface (BT-3-B composition root decision).
    """

    def __init__(self, mcp_server_url: str = "http://mcp-server:3000") -> None:
        """
        Args:
            mcp_server_url: Base URL for mcp-server (no trailing slash).
                            From env MCP_SERVER_URL, default "http://mcp-server:3000".
        """
        self._base_url = mcp_server_url.rstrip("/")
        self._push_endpoint = f"{self._base_url}/api/push-bctc-table"

    async def push_table(
        self,
        report_id: str,
        statement_section: str,
        rows: List[Dict],
        balance_check: Optional[Dict],
        period_current: str,
        period_prior: Optional[str],
    ) -> Dict:
        """
        POST assembled table rows to mcp-server.

        Payload shape (matches architect's schema §2):
        {
            "report_id": "<uuid>",
            "statement_section": "balance_sheet",
            "period_current": "31/12/2025",
            "period_prior": "31/12/2024",
            "rows": [...],
            "balance_check": { ... } | null
        }

        Returns:
            dict with at least {ok: bool, rows_stored: int}.

        Raises:
            urllib.error.URLError: on network failure.
            Exception: on HTTP 4xx/5xx.
        """
        payload = {
            "report_id": report_id,
            "statement_section": statement_section,
            "period_current": period_current,
            "period_prior": period_prior,
            "rows": rows,
            "balance_check": balance_check,
        }

        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url=self._push_endpoint,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        logger.info(
            "TablePushClient.push_table: report_id=%s section=%s rows=%d endpoint=%s",
            report_id,
            statement_section,
            len(rows),
            self._push_endpoint,
        )

        # FIX (HEALTH-BLOCK): urllib.request.urlopen() is a synchronous blocking call
        # (up to 30s timeout). Running it directly in an async function blocks the
        # event loop, making /health unresponsive for the full push duration.
        # Wrap in asyncio.to_thread() to offload to a worker thread.
        def _do_request() -> Dict:
            try:
                with urllib.request.urlopen(req, timeout=30) as resp:
                    raw = resp.read().decode("utf-8")
                    result: Dict = json.loads(raw)
                    logger.info(
                        "TablePushClient.push_table OK: report_id=%s rows_stored=%s",
                        report_id,
                        result.get("rows_stored"),
                    )
                    return result
            except urllib.error.HTTPError as exc:
                body_txt = exc.read().decode("utf-8", errors="replace")
                logger.error(
                    "TablePushClient.push_table HTTP %d: report_id=%s body=%s",
                    exc.code,
                    report_id,
                    body_txt[:200],
                )
                raise
            except urllib.error.URLError as exc:
                logger.error(
                    "TablePushClient.push_table network error: report_id=%s reason=%s",
                    report_id,
                    exc.reason,
                )
                raise

        return await asyncio.to_thread(_do_request)
