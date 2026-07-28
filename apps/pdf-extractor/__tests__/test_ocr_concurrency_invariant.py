"""
__tests__/test_ocr_concurrency_invariant.py — FIX-PDFX-TESSERACT-CONCURRENCY-VIOLATES-SINGLE-WORKER-INVARIANT

Regression suite for the OCR concurrency gate (infrastructure/ocr_gateway.py).

Why the pre-existing guard (test_pek_engine_adapter.py::TestSemaphoreGuard)
did not catch this defect (see design brief §10.1, and the task handoff):
    1. It calls PekEngineAdapter.extract_layout_and_tables() DIRECTLY — no ASGI
       app, no route. /extract (100% of the live OCR load) is never exercised.
    2. It hand-acquires _extraction_semaphore and asserts the NEXT call raises.
       That proves "the guard rejects while held" — never "the guard is on the
       path", the exact property that failed here.
    3. It counts nothing — no concurrency watermark anywhere in that suite.

T1 below drives the REAL served path (register_routes -> ExtractPDFUseCase ->
ExtractPDFService -> PdfplumberExtractionEngine -> ocr_gateway) via a real ASGI
transport, and asserts a concurrency WATERMARK — the property that actually
failed in production.

Honesty note (see task close-out report for the full accounting): this suite
does NOT include a "cancel mid-flight kills the child immediately" test. What
IS implemented and tested here is the GUARANTEED, bounded mechanism that
breaks the ratchet: every OCR call carries a wall-clock deadline
(PDFX_OCR_PAGE_TIMEOUT_S), so an abandoned call releases its slot within a
bounded time instead of holding it forever (previously: unbounded — observed
holding a slot for 88+ minutes and climbing). A best-effort opportunistic
reap-on-cancel also exists (ocr_gateway._reap_oldest_tesseract_child_best_effort)
but is not independently asserted here — it is Linux/proc-dependent and not
reliably observable from this host without a real Tesseract binary.
"""

from __future__ import annotations

import ast
import asyncio
import threading
import time
from pathlib import Path
from typing import Optional

import pytest

import infrastructure.ocr_gateway as ocr_gateway


# ---------------------------------------------------------------------------
# Shared fixture: a real 1-page PDF whose native text is short enough
# (< 50 chars) to force the OCR fallback path on every request.
# ---------------------------------------------------------------------------


def _build_short_text_pdf_bytes() -> bytes:
    import fitz  # PyMuPDF — already a pdf-extractor dependency

    doc = fitz.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Hi")  # 2 chars, well under the 50-char native-text floor
    pdf_bytes = doc.tobytes()
    doc.close()
    return pdf_bytes


_SHORT_TEXT_PDF_BYTES = _build_short_text_pdf_bytes()


# ---------------------------------------------------------------------------
# Fakes for the non-OCR ports (doc/storage repos) — the OCR-invoking chain
# (ExtractPDFUseCase -> ExtractPDFService -> PdfplumberExtractionEngine ->
# ocr_gateway) is 100% REAL, unmocked production code. Only the peripheral
# I/O (document persistence, PDF byte fetch) is faked, matching this
# codebase's existing test conventions (FakeOcrPort, FakeAlertPort, etc.).
# ---------------------------------------------------------------------------


def _make_real_app_for_extract():
    """
    Build a FastAPI app wired the same way create_app() would for the
    OCR-invoking chain, WITHOUT create_app()'s filesystem/DB dependencies
    (ensure_dirs() requires /app — not available on this host; the existing
    test_fu1_fail_loud.py established this exact bypass pattern: build via
    register_routes() directly).
    """
    from fastapi import FastAPI, APIRouter
    from domain.models import PDFDocument
    from domain.repositories import PDFDocumentRepository, PDFStorageRepository
    from domain.services import ExtractPDFService
    from application.usecases import ExtractPDFUseCase
    from infrastructure.extraction_engine import PdfplumberExtractionEngine
    from interface.handlers import register_routes

    class _FakeDocRepo(PDFDocumentRepository):
        def __init__(self) -> None:
            self._docs: dict = {}

        async def save(self, doc: PDFDocument) -> None:
            self._docs[doc.id] = doc

        async def find_by_id(self, doc_id: str) -> Optional[PDFDocument]:
            return self._docs.get(doc_id)

        async def find_pending(self) -> list:
            return [d for d in self._docs.values() if d.status == "pending"]

        async def find_all(self) -> list:
            return list(self._docs.values())

    class _FakeStorageRepo(PDFStorageRepository):
        async def fetch_pdf(self, url: str) -> bytes:
            return _SHORT_TEXT_PDF_BYTES

        async def store_extraction(self, doc_id: str, content) -> str:
            return f"/fake/{doc_id}.json"

    engine = PdfplumberExtractionEngine()  # REAL — the class under test
    service = ExtractPDFService(doc_repo=_FakeDocRepo(), storage_repo=_FakeStorageRepo(), engine=engine)
    extract_usecase = ExtractPDFUseCase(extract_service=service)

    app = FastAPI()
    router = APIRouter()
    register_routes(router, extract_usecase=extract_usecase)
    app.include_router(router)
    return app


# ---------------------------------------------------------------------------
# T1 — test_extract_burst_never_exceeds_sanctioned_concurrency
# THE test that would have caught this (brief §10.2).
# ---------------------------------------------------------------------------


class TestExtractBurstConcurrency:
    @pytest.mark.asyncio
    async def test_extract_burst_never_exceeds_sanctioned_concurrency(self, monkeypatch):
        """
        Drives 15 concurrent POST /extract (the measured caller burst width —
        see design brief §10.2) against the REAL served path and asserts the
        concurrency watermark never exceeds PDFX_OCR_MAX_CONCURRENCY.

        monkeypatches ocr_gateway._exec_tesseract (the gateway's single
        tesseract execution point) with a probe that tracks live/peak
        concurrency and sleeps briefly to create real overlap — this covers
        ALL rewired call sites at once (extraction_engine.py, ocr_backends.py,
        ocr_adapter.py, generic_md_table/unit_ocr.py) and any future one added
        through the gateway, without needing a real Tesseract binary.
        """
        import httpx

        live = 0
        peak = 0
        lock = threading.Lock()

        def _probe(image, mode, lang, config, output_type, deadline_s):
            nonlocal live, peak
            with lock:
                live += 1
                peak = max(peak, live)
            time.sleep(0.15)  # real overlap window, not simulated
            with lock:
                live -= 1
            return ""  # empty OCR text — acceptable per contract

        monkeypatch.setattr(ocr_gateway, "_exec_tesseract", _probe)

        # Test-environment adaptation (documented, not a scope change to the
        # code under test): PdfplumberExtractionEngine._ocr_page()'s call to
        # `page.to_image()` (pypdfium2 rendering — a DIFFERENT library than
        # the OCR gateway, invoked one rendering-step BEFORE it) is not safe
        # to call concurrently across OS threads on this host — it crashes
        # the whole interpreter (Fatal Python error: Aborted) when 15
        # requests render real PDF pages at once via the shared default
        # executor. That hazard is orthogonal to THIS fix (it exists whether
        # or not the OCR concurrency gate is present, and it fires BEFORE the
        # gate is ever reached) — it belongs to its own row if confirmed live.
        # This test therefore patches _ocr_page to skip the pypdfium2
        # rendering sub-step while still calling the REAL
        # ocr_gateway.run_image_sync() — the exact call the production code
        # makes — so the property actually under test (the gateway enforces
        # the concurrency bound on the real /extract route) remains 100% real.
        from infrastructure.extraction_engine import PdfplumberExtractionEngine
        from infrastructure.tesseract_config import TESSERACT_LANG, TESSERACT_PSM6_CONFIG

        def _ocr_page_skip_render(self, page):
            return ocr_gateway.run_image_sync(
                page, mode="string", lang=TESSERACT_LANG, config=TESSERACT_PSM6_CONFIG
            )

        monkeypatch.setattr(PdfplumberExtractionEngine, "_ocr_page", _ocr_page_skip_render)

        app = _make_real_app_for_extract()

        transport = httpx.ASGITransport(app=app)
        async with httpx.AsyncClient(transport=transport, base_url="http://test") as client:
            tasks = [
                client.post("/extract", json={"url": f"http://fake/report-{i}.pdf"})
                for i in range(15)
            ]
            responses = await asyncio.gather(*tasks)

        assert peak <= ocr_gateway.PDFX_OCR_MAX_CONCURRENCY, (
            f"peak concurrent tesseract invocations = {peak}, sanctioned max = "
            f"{ocr_gateway.PDFX_OCR_MAX_CONCURRENCY} — the concurrency guard is "
            f"NOT enforced on the /extract path (this is the exact defect this "
            f"task closes)."
        )
        for r in responses:
            assert r.status_code in (200, 429), (
                f"unexpected status {r.status_code} — every response must be "
                f"200 (served) or 429 (capacity backpressure), never 500"
            )
        assert len(responses) == 15, "nothing may be silently dropped from the burst"


# ---------------------------------------------------------------------------
# T2 — static call-site fence (durability — a 7th call site cannot sneak in)
# ---------------------------------------------------------------------------


_REPO_ROOT = Path(__file__).resolve().parents[1]

# Documented, deliberate exceptions (see infrastructure/ocr_gateway.py module
# docstring "Scope note" for the full rationale):
#   ocr_worker.py                      — runs INSIDE a ProcessPoolExecutor
#                                        CHILD process; cannot see this
#                                        module's in-memory semaphore. Bound
#                                        is composed at the PARENT instead
#                                        (extract_tables_usecase.py's
#                                        ocr_gateway.slot_async()).
#   generic_md_table/extractor.py      — `_process_page` takes pytesseract /
#                                        Output as explicit params and is a
#                                        direct test seam for ~40 tests in
#                                        test_generic_md_table_extractor.py.
#                                        NOT rewired in this P0 fix (flagged
#                                        as a follow-up in the close-out
#                                        report) to keep blast radius bounded.
#   ocr_backends.py / unit_ocr.py      — retain a PRE-EXISTING, narrow
#                                        `import pytesseract` used ONLY as a
#                                        dependency-existence check (raises a
#                                        clear RuntimeError if missing) BEFORE
#                                        delegating the actual OCR call to the
#                                        gateway. Required verbatim by AC-7
#                                        (test_ocr_backends.py::test_b_* must
#                                        pass unmodified). This fence asserts
#                                        on the INVOCATION pattern, not the
#                                        bare import statement.
# Files that still call pytesseract.image_to_string()/image_to_data() AS A
# REAL INVOCATION (not just a dependency-existence check) — the two
# documented, deliberate exceptions from the module docstring above.
_ALLOWED_INVOCATION_FILES = {
    "infrastructure/ocr_gateway.py",
    "infrastructure/ocr_worker.py",
    "infrastructure/generic_md_table/extractor.py",
}

# Files that retain a bare `import pytesseract` used ONLY as a pre-flight
# dependency-existence check (raises RuntimeError/logs+returns before doing
# any real work) immediately before delegating to the gateway. Required
# verbatim by AC-7 (test_ocr_backends.py::test_b_* asserts this exact
# ImportError -> RuntimeError contract and must pass unmodified).
_ALLOWED_EXISTENCE_CHECK_IMPORT_FILES = {
    "infrastructure/ocr_backends.py",
    "infrastructure/ocr_adapter.py",
    "infrastructure/extraction_engine.py",
    "infrastructure/generic_md_table/unit_ocr.py",
}


def _iter_py_files():
    for layer in ("infrastructure", "application", "interface", "domain"):
        base = _REPO_ROOT / layer
        if not base.is_dir():
            continue
        for path in base.rglob("*.py"):
            if "__pycache__" in path.parts:
                continue
            yield path


def _find_pytesseract_invocations(tree: ast.AST) -> bool:
    """AST-based (not text/regex) detection of a REAL
    pytesseract.image_to_string(...)/image_to_data(...) call — ignores
    comments and docstrings that merely mention the pattern in prose."""
    for node in ast.walk(tree):
        if not isinstance(node, ast.Call):
            continue
        func = node.func
        if (
            isinstance(func, ast.Attribute)
            and func.attr in ("image_to_string", "image_to_data")
            and isinstance(func.value, ast.Name)
            and func.value.id == "pytesseract"
        ):
            return True
    return False


def _imports_pytesseract(tree: ast.AST) -> bool:
    for node in ast.walk(tree):
        if isinstance(node, ast.Import) and any(a.name == "pytesseract" for a in node.names):
            return True
        if isinstance(node, ast.ImportFrom) and node.module == "pytesseract":
            return True
    return False


class TestOcrCallSiteFence:
    def test_pytesseract_invocation_only_at_allowed_call_sites(self):
        """
        Fails the moment a NEW call site invokes pytesseract.image_to_string()
        / image_to_data() directly instead of going through the OCR
        concurrency gateway. AST-based (not text/regex) so comments/docstrings
        that merely mention the pattern (e.g. "...instead of calling
        pytesseract.image_to_data() directly...") are never false positives.
        """
        violations = []
        for path in _iter_py_files():
            rel = path.relative_to(_REPO_ROOT).as_posix()
            if rel in _ALLOWED_INVOCATION_FILES:
                continue
            tree = ast.parse(path.read_text(encoding="utf-8"))
            if _find_pytesseract_invocations(tree):
                violations.append(rel)

        assert not violations, (
            f"pytesseract.image_to_string()/image_to_data() invoked directly "
            f"outside the OCR concurrency gateway in: {violations}. Route "
            f"through infrastructure.ocr_gateway.run_image[_sync]() instead — "
            f"see infrastructure/ocr_gateway.py module docstring."
        )

    def test_import_pytesseract_only_at_documented_sites(self):
        """
        Weaker, informational companion to the invocation fence: flags any
        NEW bare `import pytesseract` outside the documented allowlist
        (the invocation-allowed files above, plus the four files that retain
        a pre-existing existence-check-only import — see module docstring).
        """
        allowed = _ALLOWED_INVOCATION_FILES | _ALLOWED_EXISTENCE_CHECK_IMPORT_FILES
        violations = []
        for path in _iter_py_files():
            rel = path.relative_to(_REPO_ROOT).as_posix()
            if rel in allowed:
                continue
            tree = ast.parse(path.read_text(encoding="utf-8"))
            if _imports_pytesseract(tree):
                violations.append(rel)

        assert not violations, (
            f"new 'import pytesseract' found outside the documented allowlist: "
            f"{violations}"
        )


# ---------------------------------------------------------------------------
# Deadline / ratchet-break test — the guaranteed mechanism this fix ships
# (see module docstring "Honesty note").
# ---------------------------------------------------------------------------


class TestDeadlineBreaksTheRatchet:
    def test_hung_ocr_call_releases_slot_within_bounded_deadline_not_forever(self, monkeypatch):
        """
        AC-3 (task DoD): "Abandoned/aborted requests must not permanently
        consume a slot — the ratchet must be broken, not just narrowed."

        Simulates the exact production failure mode: a call that never
        returns (the client already gave up; asyncio.to_thread/run_in_executor
        cannot be cancelled once started — see brief §3.2). Before this fix,
        that call held its executor slot FOREVER (observed: 88+ minutes and
        climbing). With the gateway's outer backstop
        (PDFX_OCR_PAGE_TIMEOUT_S + grace), the call is force-failed and the
        slot IS released — bounded, not permanent.
        """
        monkeypatch.setattr(ocr_gateway, "PDFX_OCR_PAGE_TIMEOUT_S", 0)
        monkeypatch.setattr(ocr_gateway, "_BACKSTOP_GRACE_S", 0.3)

        def _hung(image, mode, lang, config, output_type, deadline_s):
            time.sleep(5.0)  # simulates a call the caller already abandoned
            return "should never be reached before the backstop fires"

        monkeypatch.setattr(ocr_gateway, "_exec_tesseract", _hung)

        from domain.errors import OcrDeadlineExceededError

        start = time.monotonic()
        with pytest.raises(OcrDeadlineExceededError):
            ocr_gateway.run_image_sync(object(), mode="string", deadline_s=0)
        elapsed = time.monotonic() - start

        assert elapsed < 3.0, (
            f"backstop took {elapsed:.2f}s to fire — must be bounded, not "
            f"open-ended (the exact ratchet this task closes)"
        )

        # The slot MUST be available again immediately — not held by the
        # abandoned call. Prove it by acquiring it directly with zero wait.
        acquired = ocr_gateway._OCR_SLOTS.acquire(blocking=False)
        assert acquired, (
            "OCR slot was NOT released after the hung call's deadline fired — "
            "this is exactly the permanent-slot-consumption ratchet"
        )
        ocr_gateway._OCR_SLOTS.release()


# ---------------------------------------------------------------------------
# Observability — /health ocr block (brief §5.2 / AC-6)
# ---------------------------------------------------------------------------


class TestHealthInflightObservability:
    def test_inflight_reports_semaphore_count_and_shape(self):
        """
        AC-6: bookkeeping is published, not asserted away. Basic shape check
        (portable — does not depend on Linux /proc or a real Tesseract
        binary): inflight() always returns max/semaphore/os_children/
        oldest_child_s, and semaphore reflects a call actually in flight.
        """
        baseline = ocr_gateway.inflight()
        assert baseline["semaphore"] == 0
        assert baseline["max"] == ocr_gateway.PDFX_OCR_MAX_CONCURRENCY

        acquired = ocr_gateway._OCR_SLOTS.acquire(blocking=False)
        assert acquired
        with ocr_gateway._inflight_lock:
            ocr_gateway._inflight_calls["test-call-id"] = time.monotonic()
        try:
            during = ocr_gateway.inflight()
            assert during["semaphore"] == 1
        finally:
            with ocr_gateway._inflight_lock:
                ocr_gateway._inflight_calls.pop("test-call-id", None)
            ocr_gateway._OCR_SLOTS.release()

        after = ocr_gateway.inflight()
        assert after["semaphore"] == 0

    def test_health_endpoint_exposes_ocr_block(self):
        """GET /health includes the ocr block (not just ocr_source_ok)."""
        from fastapi import FastAPI, APIRouter
        from fastapi.testclient import TestClient
        from interface.handlers import register_routes
        from unittest.mock import MagicMock

        app = FastAPI()
        router = APIRouter()
        register_routes(router, extract_usecase=MagicMock())
        app.include_router(router)
        client = TestClient(app)

        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert "ocr" in data
        assert data["ocr"] is not None
        assert data["ocr"]["max"] == ocr_gateway.PDFX_OCR_MAX_CONCURRENCY
        assert "semaphore" in data["ocr"]
        assert "os_children" in data["ocr"]


# ---------------------------------------------------------------------------
# /proc parsing — host-portable unit test of the /proc scanning logic itself
# (real Linux semantics, fixture-based — no real Tesseract, no container).
# ---------------------------------------------------------------------------


class TestProcScanningPortable:
    def _write_stat(self, proc_root: Path, pid: int, comm: str, ppid: int) -> None:
        pid_dir = proc_root / str(pid)
        pid_dir.mkdir(parents=True, exist_ok=True)
        # Minimal /proc/<pid>/stat: "pid (comm) state ppid ..." (24 total
        # fields on real Linux; only ppid at index 3 is read by our parser).
        fields = [str(pid), f"({comm})", "R", str(ppid)] + ["0"] * 20
        (pid_dir / "stat").write_text(" ".join(fields))

    def test_finds_matching_tesseract_children_only(self, tmp_path, monkeypatch):
        monkeypatch.setattr(ocr_gateway, "_PROC_ROOT", str(tmp_path))
        my_pid = 12345
        self._write_stat(tmp_path, pid=200, comm="tesseract", ppid=my_pid)
        self._write_stat(tmp_path, pid=201, comm="tesseract", ppid=my_pid)
        self._write_stat(tmp_path, pid=202, comm="bash", ppid=my_pid)  # wrong comm
        self._write_stat(tmp_path, pid=203, comm="tesseract", ppid=99999)  # wrong ppid

        pids = ocr_gateway._find_tesseract_child_pids(ppid=my_pid)
        assert sorted(pids) == [200, 201]

    def test_returns_empty_when_proc_root_absent(self, monkeypatch, tmp_path):
        monkeypatch.setattr(ocr_gateway, "_PROC_ROOT", str(tmp_path / "does-not-exist"))
        assert ocr_gateway._find_tesseract_child_pids() == []
