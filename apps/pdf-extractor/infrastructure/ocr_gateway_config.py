"""
infrastructure/ocr_gateway_config.py — env-driven configuration for
infrastructure/ocr_gateway.py (the OCR concurrency gateway).

Read once at import time. ocr_gateway.py imports every name below into ITS
OWN module namespace and keeps them there — this is deliberate, not an
oversight: __tests__/test_ocr_concurrency_invariant.py monkeypatches these
constants directly on the gateway module (e.g.
`monkeypatch.setattr(ocr_gateway, "PDFX_OCR_PAGE_TIMEOUT_S", 0)`), and that
only works because every function that reads a constant below (run_image,
run_image_sync, inflight, etc.) is defined IN ocr_gateway.py and resolves
the bare name via THAT module's own globals. Do not move any gateway logic
that reads these constants into this file, and do not have ocr_gateway.py
read them via `ocr_gateway_config.<NAME>` attribute access instead of a
plain top-level `from ... import NAME` — either change would silently
detach the constant from the existing monkeypatch-based tests.

See docs/architecture-briefs/2026-07-28-pdfx-tesseract-concurrency-invariant.md
§8 for the full env var table and rationale.
"""

from __future__ import annotations

import logging
import os

logger = logging.getLogger(__name__)


def _read_int_env(name: str, default: int) -> int:
    try:
        return int(os.environ.get(name, default))
    except (TypeError, ValueError):
        logger.warning("ocr_gateway: invalid int env %s — using default %s", name, default)
        return default


def _read_float_env(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, default))
    except (TypeError, ValueError):
        logger.warning("ocr_gateway: invalid float env %s — using default %s", name, default)
        return default


PDFX_OCR_MAX_CONCURRENCY: int = _read_int_env("PDFX_OCR_MAX_CONCURRENCY", 1)
PDFX_OCR_QUEUE_WAIT_S: float = _read_float_env("PDFX_OCR_QUEUE_WAIT_S", 5.0)
PDFX_OCR_PAGE_TIMEOUT_S: int = _read_int_env("PDFX_OCR_PAGE_TIMEOUT_S", 600)

# FIX-OCRGATEWAY-INFLIGHT-BOOKKEEPING-DIVERGES-OS-TRUTH (2026-08-24): grace
# window before a semaphore/os_children mismatch is logged as an ERROR.
#
# Root-caused live (task close-out): NOT a leaked acquire — every acquire in
# run_image()/run_image_sync() is unconditionally released in a `finally`
# (confirmed by code inspection of both), and this refutation is corroborated
# by 24h of live traffic: a real leak would permanently wedge the semaphore
# at capacity (every subsequent call 429s forever); instead traffic kept
# flowing normally after each mismatch. The mismatch is instead an EXPECTED,
# momentary skew: `held` (semaphore + _inflight_calls) spans the FULL
# Python-level OCR call — image serialization to a temp file BEFORE
# pytesseract spawns the tesseract subprocess, and output-file parsing/
# cleanup AFTER it exits — while `os_children` is a single-instant /proc
# snapshot of only the subprocess-alive sub-window strictly inside that
# span. A frequent /health poller (measured live: ~4490 polls/24h, ~1 every
# 19s combined across 2 poll sources) samples that narrow setup/teardown gap
# often enough to explain the observed count with NO leak required — and
# live evidence backs this directly: all 20 mismatches in a 24h capture
# landed in the container's first ~5h15m (cold disk cache + concurrent PEK
# model-loading CPU contention slow the non-subprocess I/O around each
# tesseract call), then ZERO in the following ~7.5h at unchanged /extract
# traffic. A leak does not self-heal like that; a sampling artifact does.
#
# This grace window keeps the alarm for what actually matters — a mismatch
# that PERSISTS past the time a call should reasonably have shown (or
# cleared) its OS child — while dropping the false alarm for a normal,
# short-lived setup/teardown gap. The dangerous direction (an OS child with
# NO tracked call at all, held=0) gets ZERO grace: see ocr_gateway.inflight().
PDFX_OCR_INFLIGHT_MISMATCH_GRACE_S: float = _read_float_env(
    "PDFX_OCR_INFLIGHT_MISMATCH_GRACE_S", 5.0
)

# Grace added on top of PDFX_OCR_PAGE_TIMEOUT_S for the OUTER backstop wait
# (future.result(timeout=...)). Normally pytesseract's OWN internal
# `timeout=` kwarg fires first (it kills the tesseract subprocess directly —
# see pytesseract.pytesseract.timeout_manager). This backstop only fires if
# something hangs BEFORE that inner wait (e.g. temp-file save, image prep).
_BACKSTOP_GRACE_S: float = 30.0

# Output-type sentinels — callers select these instead of importing
# pytesseract.Output directly, so `import pytesseract` never has to appear
# outside ocr_gateway.py for the four rewired call sites.
OUTPUT_DICT: str = "dict"
OUTPUT_DATAFRAME: str = "dataframe"
