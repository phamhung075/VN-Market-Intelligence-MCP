"""
infrastructure/md_table_push_client.py — MD-EXTRACT

MdTablePushClient: HTTP push client for generic markdown tables.

Implements MdTablePushClientPort (domain/modules/financial_reports/ports.py).

Endpoint: POST /api/push-bctc-md-tables on mcp-server (internal Docker network).
Contract (brief §4.3):
    Request:  { report_id, md_tables: string[], ocr_as_markdown: string, page_count: int }
    Response: { ok: bool, tables_stored: int }

Layer: infrastructure (does urllib I/O — impure). Safe per Fence-A/B.
DDD: may import from domain/primitives and infrastructure/. MUST NOT import
     from application/ or interface/.

Privacy: internal Docker network only. No external API calls. Zero data leaves machine.

Note: Uses stdlib urllib (same pattern as TablePushClient) for simplicity
and testability. The method is declared async for use-case compatibility.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Dict, List

logger = logging.getLogger(__name__)


class MdTablePushClient:
    """
    HTTP POST client — pushes generic markdown tables to mcp-server.

    Implements MdTablePushClientPort.

    Uses urllib (stdlib) — same pattern as TablePushClient. No aiohttp dependency.
    The async declaration allows direct await in the event loop.
    """

    def __init__(self, mcp_server_url: str = "http://mcp-server:3000") -> None:
        """
        Args:
            mcp_server_url: Base URL for mcp-server (no trailing slash).
                            From env MCP_SERVER_URL, default "http://mcp-server:3000".
        """
        self._base_url = mcp_server_url.rstrip("/")
        self._push_endpoint = f"{self._base_url}/api/push-bctc-md-tables"

    async def push_md_tables(
        self,
        report_id: str,
        md_tables: List[str],
        ocr_as_markdown: str,
        page_count: int,
    ) -> Dict:
        """
        POST markdown tables to mcp-server.

        Payload shape (brief §4.3):
        {
            "report_id":        "<uuid>",
            "md_tables":        ["| Col1 | Col2 |\\n|---|---|\\n...", ...],
            "ocr_as_markdown":  "## Section\\n...",
            "page_count":       7
        }

        Returns:
            dict with keys: ok (bool), tables_stored (int).

        Raises:
            urllib.error.URLError: on network failure.
            Exception: on HTTP 4xx/5xx.
        """
        payload = {
            "report_id": report_id,
            "md_tables": md_tables,
            "ocr_as_markdown": ocr_as_markdown,
            "page_count": page_count,
        }

        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url=self._push_endpoint,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        logger.info(
            "MdTablePushClient.push_md_tables: report_id=%s tables=%d page_count=%d endpoint=%s",
            report_id,
            len(md_tables),
            page_count,
            self._push_endpoint,
        )

        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                raw = resp.read().decode("utf-8")
                result: Dict = json.loads(raw)
                logger.info(
                    "MdTablePushClient.push_md_tables OK: report_id=%s tables_stored=%s",
                    report_id,
                    result.get("tables_stored"),
                )
                return result
        except urllib.error.HTTPError as exc:
            body_txt = exc.read().decode("utf-8", errors="replace")
            logger.error(
                "MdTablePushClient.push_md_tables HTTP %d: report_id=%s body=%s",
                exc.code,
                report_id,
                body_txt[:200],
            )
            raise
        except urllib.error.URLError as exc:
            logger.error(
                "MdTablePushClient.push_md_tables network error: report_id=%s reason=%s",
                report_id,
                exc.reason,
            )
            raise
