"""
infrastructure/alert_adapter.py — BT-5

Concrete adapter implementing AlertPort (domain/repositories.py).

Sends WORK-channel Telegram alerts when the BT-5 cross-check gate blocks a push.
This is the ONLY place in pdf-extractor that knows about Telegram credentials.

DDD compliance:
    - Lives in infrastructure/ (I/O layer — correct placement for network calls)
    - Implements AlertPort Protocol (domain/repositories.py) via duck-typing
    - The use case (application/extract_tables_usecase.py) calls only the
      AlertPort.send_work_alert() Protocol method — zero Telegram knowledge there
    - Fence-A/B: this file is NOT in domain/ — fences untouched

Configuration (from environment, NOT hardcoded):
    TELEGRAM_BOT_TOKEN           — Telegram bot token
    TELEGRAM_INFO_WORK_CHANNEL_ID — WORK channel chat ID (negative for groups)

Failure behaviour:
    send_work_alert() is fire-and-forget.
    If Telegram fails (network error, invalid token, etc.) the error is logged
    and the method returns normally — the extraction pipeline is NOT disrupted.

Security note:
    Credentials read from env at instance construction time (not module load).
    Zero credentials appear in sandbox/runner.py (Security Clause satisfied).
"""

from __future__ import annotations

import asyncio
import logging
import os
import urllib.request
import urllib.parse
import json

logger = logging.getLogger(__name__)

_TELEGRAM_API_BASE = "https://api.telegram.org/bot"


class TelegramAlertAdapter:
    """
    Concrete AlertPort — sends WORK-channel Telegram message via Bot API.

    Implements the AlertPort Protocol (domain/repositories.py) via duck-typing
    (Python structural typing — no explicit 'implements' declaration needed).

    Instantiated in main.py (composition root) and injected into ExtractTablesUseCase.
    Never imported in domain/ or application/ layers.
    """

    def __init__(
        self,
        bot_token: str | None = None,
        work_chat_id: str | None = None,
    ) -> None:
        """
        Args:
            bot_token:    Telegram bot token. Defaults to env TELEGRAM_BOT_TOKEN.
            work_chat_id: WORK channel chat ID. Defaults to env
                          TELEGRAM_INFO_WORK_CHANNEL_ID.
        """
        self._bot_token: str | None = bot_token or os.getenv("TELEGRAM_BOT_TOKEN")
        self._work_chat_id: str | None = work_chat_id or os.getenv(
            "TELEGRAM_INFO_WORK_CHANNEL_ID"
        )

    async def send_work_alert(self, message: str) -> None:
        """
        Send a WORK-channel alert via Telegram Bot API (sendMessage).

        Fire-and-forget: errors are logged and silently swallowed so they
        never disrupt the extraction pipeline caller.

        The blocking urllib.request.urlopen call is offloaded to a worker
        thread via asyncio.to_thread() — same pattern as TablePushClient
        (commit f0999cff) — to avoid stalling the asyncio event loop during
        the BT-5 gate block path.

        Args:
            message: Alert text (plain text, ≤ 4096 chars for Telegram compatibility).
        """
        if not self._bot_token or not self._work_chat_id:
            logger.warning(
                "TelegramAlertAdapter: TELEGRAM_BOT_TOKEN or "
                "TELEGRAM_INFO_WORK_CHANNEL_ID not set — skipping WORK alert. "
                "Message: %s",
                message,
            )
            return

        url = f"{_TELEGRAM_API_BASE}{self._bot_token}/sendMessage"
        payload = json.dumps(
            {
                "chat_id": self._work_chat_id,
                "text": f"[pdf-extractor WORK] {message}",
                "parse_mode": "HTML",
            }
        ).encode("utf-8")

        # FIX (FIX-PDFX-ALERT-ADAPTER-BLOCKING): urllib.request.urlopen() is a
        # synchronous blocking call (5s timeout). Running it directly in an async
        # context blocks the event loop for the full duration of the Telegram
        # round-trip. Wrap in asyncio.to_thread() to offload to a worker thread —
        # same pattern as TablePushClient.push_table() (commit f0999cff).
        def _do_request() -> None:
            try:
                req = urllib.request.Request(
                    url,
                    data=payload,
                    headers={"Content-Type": "application/json"},
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=5) as resp:
                    status = resp.status
                    if status != 200:
                        logger.warning(
                            "TelegramAlertAdapter: Telegram API returned status=%d for WORK alert",
                            status,
                        )
                    else:
                        logger.info(
                            "TelegramAlertAdapter: WORK alert sent (status=200)"
                        )
            except Exception as exc:  # noqa: BLE001
                # Fire-and-forget: never raise, never disrupt the caller
                logger.error(
                    "TelegramAlertAdapter: Failed to send WORK alert: %s — message: %s",
                    exc,
                    message,
                )

        await asyncio.to_thread(_do_request)
