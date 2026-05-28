"""
infrastructure/eval_push_client.py — BCTC-EVAL-SUBSTRATE

EvalPushClient: HTTP port adapter — POSTs a stage EvalStageResult to mcp-server.

Endpoint: POST /api/bctc-eval/push-stage

Mirrors the pattern of layout_first_push_client.py:
    - stdlib urllib only (no requests/httpx/aiohttp — AC-LFE-8 unchanged)
    - async declaration for use-case compatibility
    - RAISES on HTTP error — fail-loud-first, NO bare except (§15 anti-false-green)
    - internal Docker network only

DDD: infrastructure layer.
    - MAY import from domain/ and infrastructure/.
    - MUST NOT import from application/ or interface/.

Privacy: internal Docker network only. No external API calls.
"""

from __future__ import annotations

import json
import logging
import urllib.error
import urllib.request
from typing import Any, Dict

logger = logging.getLogger(__name__)


class EvalPushClient:
    """
    HTTP POST client — pushes one EvalStageResult to mcp-server.

    Implements the EvalPushClientPort (informal protocol: single method `push_stage`).

    RAISES on HTTP 4xx/5xx — never swallows HTTP errors.
    The application layer (extract_layout_first_usecase.py) is responsible for
    catching and logging when the eval push fails but extraction must continue.
    """

    def __init__(self, mcp_server_url: str = "http://mcp-server:3000") -> None:
        """
        Args:
            mcp_server_url: Base URL for mcp-server (no trailing slash).
                            From env MCP_SERVER_URL, default "http://mcp-server:3000".
        """
        self._base_url = mcp_server_url.rstrip("/")
        self._push_endpoint = f"{self._base_url}/api/bctc-eval/push-stage"

    async def push_stage(
        self,
        report_id: str,
        stage_result: Dict[str, Any],
    ) -> Dict[str, Any]:
        """
        POST one EvalStageResult to mcp-server /api/bctc-eval/push-stage.

        The stage_result dict comes from domain.eval_detectors (one of the three
        eval_stage{1,2,3}_* functions). It matches the EvalStageResult JSON contract
        from brief §4. The application layer wraps report_id around it.

        Payload shape:
        {
            "report_id":          "<uuid>",
            "stage_no":           1,
            "stage_name":         "RASTERIZE",
            "status":             "green",
            "metrics_json":       { ... },
            "gate_failures_json": [ ... ],
            "golden_diff_json":   { ... },
            "detector_version":   "v1",
            "schema_version":     "1"
        }

        Returns:
            dict with at minimum: { "ok": bool }
            (mcp-server may return additional fields — callers should not rely on them)

        Raises:
            urllib.error.HTTPError: on HTTP 4xx / 5xx — caller MUST NOT swallow.
            urllib.error.URLError:  on network failure.
            Exception:              on any other error (JSON decode failure, etc.).

        Fail-loud-first contract (brief §15):
            This method NEVER catches and suppresses HTTP errors.
            The application layer that calls push_stage is responsible for
            deciding whether a push failure aborts extraction or continues.
            Per task spec: "If push fails, log + continue."
        """
        payload: Dict[str, Any] = {
            "report_id": report_id,
            **stage_result,
        }

        # Serialise metrics_json and gate_failures_json to JSON strings for transport
        # (mcp-server stores them as TEXT columns per the schema in brief §3)
        transport_payload: Dict[str, Any] = {
            **payload,
            "metrics_json": json.dumps(payload.get("metrics_json", {})),
            "gate_failures_json": json.dumps(payload.get("gate_failures_json", [])),
            "golden_diff_json": json.dumps(payload.get("golden_diff_json", {})),
        }

        body = json.dumps(transport_payload).encode("utf-8")
        req = urllib.request.Request(
            url=self._push_endpoint,
            data=body,
            headers={"Content-Type": "application/json"},
            method="POST",
        )

        logger.info(
            "EvalPushClient.push_stage: report_id=%s stage_no=%s stage_name=%s "
            "status=%s endpoint=%s",
            report_id,
            stage_result.get("stage_no"),
            stage_result.get("stage_name"),
            stage_result.get("status"),
            self._push_endpoint,
        )

        # RAISE on HTTP error — fail-loud-first.
        # NO bare except. NO silent swallow.
        with urllib.request.urlopen(req, timeout=30) as resp:
            raw = resp.read().decode("utf-8")
            result: Dict[str, Any] = json.loads(raw)
            logger.info(
                "EvalPushClient.push_stage OK: report_id=%s stage_no=%s ok=%s",
                report_id,
                stage_result.get("stage_no"),
                result.get("ok"),
            )
            return result
