"""
infrastructure/layout_first_push_client.py — LF-EXTRACT

LayoutFirstPushClient: HTTP push client for layout-first extraction results.

Implements LayoutFirstPushClientPort (domain/modules/financial_reports/ports.py).

Endpoint: POST /api/push-bctc-layout on mcp-server (internal Docker network).

Contract (brief §3.2):
    Request:  {
        report_id:        str (UUID),
        document_map:     { total_pages: int, units: [...] },
        units:            [ { unit_id, stitched_markdown, row_count,
                              quarantined, quarantine_reason, page_row_spans } ],
        page_zones:       [ { page_number, unit_id, page_type, is_schema_page,
                              is_continuation_page, schema_inherited_from_page,
                              zones: { image_width_px, image_height_px,
                                       image_dpi, coordinate_origin,
                                       coordinate_unit, header_band, footer_band,
                                       column_gutters, row_bands, unit_hints,
                                       unit_boundary_after_page } } ],
        pass_rate_report: { units_total, units_passing, units_quarantined,
                            quarantine_breakdown }
    }
    Response: { ok: bool, units_stored: int, pages_stored: int }

Layer: infrastructure (does urllib I/O — impure). Safe per Fence-A/B.
DDD: may import from domain/primitives and infrastructure/. MUST NOT import
     from application/ or interface/.

Privacy: internal Docker network only. No external API calls. Zero data leaves machine.
AC-LFE-8: no requests/httpx/aiohttp/cloud SDK imports.

Uses stdlib urllib (same pattern as MdTablePushClient and TablePushClient).
The method is declared async for use-case compatibility.
"""

from __future__ import annotations

import asyncio
import json
import logging
import urllib.error
import urllib.request
from typing import Dict, List

logger = logging.getLogger(__name__)


class LayoutFirstPushClient:
    """
    HTTP POST client — pushes layout-first extraction results to mcp-server.

    Implements LayoutFirstPushClientPort.

    Uses urllib (stdlib) — same pattern as MdTablePushClient. No aiohttp dependency.
    The async declaration allows direct await in the event loop.
    """

    def __init__(self, mcp_server_url: str = "http://mcp-server:3000") -> None:
        """
        Args:
            mcp_server_url: Base URL for mcp-server (no trailing slash).
                            From env MCP_SERVER_URL, default "http://mcp-server:3000".
        """
        self._base_url = mcp_server_url.rstrip("/")
        self._push_endpoint = f"{self._base_url}/api/push-bctc-layout"

    async def push_layout(
        self,
        report_id: str,
        document_map: Dict,
        units: List[Dict],
        page_zones: List[Dict],
        pass_rate_report: Dict,
    ) -> Dict:
        """
        POST layout-first extraction results to mcp-server.

        Payload shape (brief §3.2):
        {
            "report_id":       "<uuid>",
            "document_map":    { "total_pages": N, "units": [...] },
            "units":           [ { "unit_id": ..., "stitched_markdown": ..., ... } ],
            "page_zones":      [ { "page_number": N, "zones": {...}, ... } ],
            "pass_rate_report": { "units_total": N, "units_passing": P, ... }
        }

        Returns:
            dict with keys: ok (bool), units_stored (int), pages_stored (int).

        Raises:
            urllib.error.URLError: on network failure.
            Exception: on HTTP 4xx/5xx.
        """
        payload = {
            "report_id": report_id,
            "document_map": document_map,
            "units": units,
            "page_zones": page_zones,
            "pass_rate_report": pass_rate_report,
        }

        body = json.dumps(payload).encode("utf-8")
        req = urllib.request.Request(
            url=self._push_endpoint,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        logger.info(
            "LayoutFirstPushClient.push_layout: report_id=%s units=%d pages=%d endpoint=%s",
            report_id,
            len(units),
            len(page_zones),
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
                        "LayoutFirstPushClient.push_layout OK: report_id=%s "
                        "units_stored=%s pages_stored=%s",
                        report_id,
                        result.get("units_stored"),
                        result.get("pages_stored"),
                    )
                    return result
            except urllib.error.HTTPError as exc:
                body_txt = exc.read().decode("utf-8", errors="replace")
                logger.error(
                    "LayoutFirstPushClient.push_layout HTTP %d: report_id=%s body=%s",
                    exc.code,
                    report_id,
                    body_txt[:200],
                )
                raise
            except urllib.error.URLError as exc:
                logger.error(
                    "LayoutFirstPushClient.push_layout network error: report_id=%s reason=%s",
                    report_id,
                    exc.reason,
                )
                raise

        return await asyncio.to_thread(_do_request)
