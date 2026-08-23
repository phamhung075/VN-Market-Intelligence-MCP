"""
Unit test: interface/routes_extract.py process-memory hygiene.

FIX-PDFX-LEGACY-EXTRACT-MEMORY-BURST-HEADROOM — root-cause fix for the
2026-08-23 silent memcg-OOM restart loop (dev-pdf-extractor cycle).

Ground truth (kernel dmesg, not app log, not `docker inspect .State.OOMKilled`
which reads false despite this): the container's single long-lived main
`python3` process was killed twice by the Linux memcg OOM killer at the
container's 2.5GiB cgroup limit (anon-rss ~2.47-2.48GB at kill time in both
events), ~31 minutes apart, with ZERO uvicorn/lifespan shutdown log lines
before either restart — i.e. an abrupt kill, not a clean `sys.exit()` (no
code path in this service calls sys.exit/os._exit outside test/sandbox
scripts). Traffic during both windows was dominated by `POST /extract`
(pdfplumber + pdf2image + pytesseract, all running in-process), while
`/pek-extract` volume was ~0 — so this is NOT a regression of the
FIX-PEK-EXTRACT-SEMAPHORE-CONTENTION-BOUNDED-QUEUE fix (that fix verifiably
works: SemaphoreContendedError=0, FAILED=0 post-rebuild).

The 2026-08-15 FIX-PDFX-PARENT-PROCESS-MEMORY-BURST-HEADROOM fix already
proved that PyTorch/PaddleOCR/pdfplumber/PIL native allocations are
glibc-arena memory invisible to Python's own `gc.collect()`, and that
`ctypes.CDLL("libc.so.6").malloc_trim(0)` recovers ~70-99% of it — but wired
that fix ONLY into the PEK background-task path (`interface/pek_run_helper.
_run_pek_extract`), never into the legacy synchronous `/extract` path. This
test guards the same trim call in `/extract`'s request lifecycle, on BOTH
the success and the exception path, mirroring test_pek_mem_hygiene.py.

Per that file's own test-strategy note: do NOT assert on real RSS numbers
here (non-deterministic/slow) — this unit test only asserts the trim call
happens, mocked, both branches.
"""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from fastapi import APIRouter, HTTPException

from interface.routes_extract import register_extract_routes
from interface.serializers import ExtractPDFRequestSchema


def _get_extract_endpoint(extract_usecase, local_extract_usecase=None):
    router = APIRouter()
    register_extract_routes(router, extract_usecase, local_extract_usecase)
    # Only one route registered — grab its raw endpoint (bypasses FastAPI's
    # dependency-injection wrapping, callable directly with the Pydantic body).
    return router.routes[-1].endpoint


def test_extract_pdf_calls_malloc_trim_on_success_path():
    """AC1: malloc_trim(0) must run after a successful /extract call (finally
    block, not only the happy-path body) — same guarantee /pek-extract has."""
    fake_response = MagicMock()
    fake_response.to_json.return_value = {"status": "ok"}
    extract_usecase = MagicMock()
    extract_usecase.execute = AsyncMock(return_value=fake_response)

    endpoint = _get_extract_endpoint(extract_usecase)
    body = ExtractPDFRequestSchema(url="https://example.com/f.pdf")

    with patch("interface.routes_extract._malloc_trim_or_noop") as mock_trim:
        result = asyncio.run(endpoint(body))

    assert result == {"status": "ok"}
    mock_trim.assert_called_once_with()


def test_extract_pdf_calls_malloc_trim_on_exception_path():
    """AC1: a FAILED /extract call still pays the full pdfplumber/pdf2image/
    tesseract allocation cost — malloc_trim(0) must run on the except branch
    too, not only on success."""
    extract_usecase = MagicMock()
    extract_usecase.execute = AsyncMock(
        side_effect=RuntimeError("simulated extraction failure for mem-hygiene test")
    )

    endpoint = _get_extract_endpoint(extract_usecase)
    body = ExtractPDFRequestSchema(url="https://example.com/f.pdf")

    with patch("interface.routes_extract._malloc_trim_or_noop") as mock_trim:
        with pytest.raises(HTTPException):
            asyncio.run(endpoint(body))

    mock_trim.assert_called_once_with()


def test_extract_pdf_trim_failure_is_non_fatal():
    """A trim sweep exception must not propagate out of the handler and must
    not mask the real response — mirrors pek_run_helper's own
    FAIL-LOUD-but-never-crash-the-caller discipline."""
    fake_response = MagicMock()
    fake_response.to_json.return_value = {"status": "ok"}
    extract_usecase = MagicMock()
    extract_usecase.execute = AsyncMock(return_value=fake_response)

    endpoint = _get_extract_endpoint(extract_usecase)
    body = ExtractPDFRequestSchema(url="https://example.com/f.pdf")

    with patch(
        "interface.routes_extract._malloc_trim_or_noop",
        side_effect=RuntimeError("trim boom"),
    ):
        result = asyncio.run(endpoint(body))  # must not raise

    assert result == {"status": "ok"}
