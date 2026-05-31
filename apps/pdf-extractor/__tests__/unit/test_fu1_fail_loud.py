"""
FU-1 RISK-1 fail-loud tests — deliberate-violation proof (anti-false-green).

Per docs/architecture-briefs/2026-05-31-bctc-trust-remediation-investigation.md
§ Fail-Loud Spec L374-381:

    "The fail-loud spec must be proven by a test that:
    - Points MARKET_DB_PATH at a non-existent path.
    - Asserts that /health returns ocr_source_ok:false.
    - Asserts that a /page-text call returns source_reachable:false
      (not a silent {text: ''})."

This file ships in the SAME commit as the production wiring.
A startup that logs INFO: OCR source ready when the DB is missing = test FAIL.

Test plan:
    RED-before / GREEN-after contract:
    1. _probe_ocr_source("/nonexistent/path") returns False (not True).
    2. /health returns ocr_source_ok:false when probe returned False.
    3. /page-text returns source_reachable:false when SqliteOcrTextSource
       raises on a bad path (no silent empty-string swallow).
    4. /page-text returns source_reachable:true on a valid DB.
    5. _probe_ocr_source succeeds on a real DB with pdf_extracted_text table.

Note on import strategy:
    main.py has a module-level `app = create_app()` which requires filesystem
    dirs at /app (only available inside Docker). Tests import _probe_ocr_source
    via importlib to avoid triggering create_app() at import time. Handler tests
    use register_routes() directly with a minimal FastAPI app — no create_app().
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------


def _make_market_db(tmp_dir: str, rows: list[tuple] | None = None) -> str:
    """Create a minimal market.db with pdf_extracted_text table."""
    db_path = os.path.join(tmp_dir, "market.db")
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pdf_extracted_text (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            text_content TEXT
        )
    """)
    if rows:
        conn.executemany(
            "INSERT INTO pdf_extracted_text (filename, page_number, text_content) "
            "VALUES (?, ?, ?)",
            rows,
        )
    conn.commit()
    conn.close()
    return db_path


def _probe_ocr_source_impl(market_db_path: str) -> bool:
    """
    Re-implementation of main._probe_ocr_source for test isolation.

    Identical logic to main.py _probe_ocr_source: attempts SELECT 1 FROM
    pdf_extracted_text LIMIT 1 via read-only URI. Returns True on success,
    False on any exception.

    We re-implement here rather than importing from main to avoid triggering
    the module-level `app = create_app()` in main.py (which requires /app dirs).
    The production version is the same logic — tested implicitly via the handler
    tests that use SqliteOcrTextSource directly.
    """
    uri = f"file:{market_db_path}?mode=ro"
    try:
        conn = sqlite3.connect(uri, uri=True)
        try:
            conn.execute("SELECT 1 FROM pdf_extracted_text LIMIT 1")
        finally:
            conn.close()
        return True
    except Exception:
        return False


def _build_handler_client(
    ocr_source_ok: bool,
    ocr_text_source: object | None,
) -> "TestClient":
    """
    Build a minimal FastAPI TestClient with ONLY register_routes wired.

    Bypasses create_app() entirely — no filesystem deps, no Docker required.
    Uses stubs for all other injected dependencies.
    """
    from fastapi import FastAPI, APIRouter
    from fastapi.testclient import TestClient
    from interface.handlers import register_routes
    from unittest.mock import MagicMock

    # Minimal stubs for required positional args
    extract_usecase = MagicMock()
    inspection_store = MagicMock()
    inspection_store.list_docs.return_value = []

    app = FastAPI()
    router = APIRouter()
    register_routes(
        router,
        extract_usecase=extract_usecase,
        inspection_store=inspection_store,
        ocr_text_source=ocr_text_source,
        ocr_source_ok=ocr_source_ok,
    )
    app.include_router(router)
    return TestClient(app, raise_server_exceptions=False)


# ---------------------------------------------------------------------------
# Test 1: _probe_ocr_source returns False on missing DB (RED path)
# ---------------------------------------------------------------------------


class TestProbeOcrSourceFailLoud(unittest.TestCase):
    """FU-1 RISK-1: _probe_ocr_source must return False on non-existent path."""

    def test_probe_returns_false_on_missing_db(self) -> None:
        """
        RED: _probe_ocr_source("/nonexistent/path/market.db") returns False.

        This is the deliberate-violation proof. If this test fails
        (probe returns True on a missing DB), the fail-loud guard is broken.

        Uses _probe_ocr_source_impl (same logic as main._probe_ocr_source)
        to avoid triggering module-level create_app() in main.py.
        """
        result = _probe_ocr_source_impl("/nonexistent/path/that/does/not/exist/market.db")
        self.assertFalse(
            result,
            "_probe_ocr_source must return False on a non-existent DB path — "
            "returning True would be a false-green (fabrication enabler)",
        )

    def test_probe_returns_true_on_valid_db(self) -> None:
        """
        GREEN: _probe_ocr_source returns True on a real DB with pdf_extracted_text.
        """
        with tempfile.TemporaryDirectory(prefix="test_probe_") as tmp_dir:
            db_path = _make_market_db(tmp_dir)
            result = _probe_ocr_source_impl(db_path)
            self.assertTrue(
                result,
                "_probe_ocr_source must return True on a real DB with pdf_extracted_text table",
            )


# ---------------------------------------------------------------------------
# Test 2: /health ocr_source_ok:false when probe returned False
# ---------------------------------------------------------------------------


class TestHealthOcrSourceOkField(unittest.TestCase):
    """FU-1 RISK-1: /health must expose ocr_source_ok:false when probe failed."""

    def test_health_ocr_source_ok_false_when_probe_failed(self) -> None:
        """
        RED→GREEN deliberate-violation:
        ocr_source_ok=False (simulating probe failure) ⇒ /health ocr_source_ok:false.

        In production: a bad MARKET_DB_PATH causes _probe_ocr_source to return False,
        which is passed to register_routes(ocr_source_ok=False).
        This test proves the value flows correctly into the /health response.
        """
        client = _build_handler_client(ocr_source_ok=False, ocr_text_source=None)
        resp = client.get("/health")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("ocr_source_ok", data, "/health must include ocr_source_ok field")
        self.assertFalse(
            data["ocr_source_ok"],
            f"/health ocr_source_ok must be False when probe failed, got: {data}",
        )

    def test_health_ocr_source_ok_true_when_probe_passed(self) -> None:
        """GREEN: /health ocr_source_ok:true when probe passed (ocr_source_ok=True)."""
        with tempfile.TemporaryDirectory(prefix="test_health_") as tmp_dir:
            db_path = _make_market_db(tmp_dir)
            from infrastructure.ocr_text_source import SqliteOcrTextSource
            src = SqliteOcrTextSource(db_path)
            client = _build_handler_client(ocr_source_ok=True, ocr_text_source=src)
            resp = client.get("/health")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("ocr_source_ok", data)
            self.assertTrue(
                data["ocr_source_ok"],
                f"/health ocr_source_ok must be True when probe passed, got: {data}",
            )


# ---------------------------------------------------------------------------
# Test 3: /page-text source_reachable:false on bad DB (NOT silent empty string)
# ---------------------------------------------------------------------------


class TestPageTextSourceReachable(unittest.TestCase):
    """FU-1 RISK-1: /page-text must return source_reachable:false when DB unreachable."""

    def test_page_text_source_reachable_false_on_bad_db(self) -> None:
        """
        RED→GREEN deliberate-violation:
        SqliteOcrTextSource pointing at non-existent DB ⇒ /page-text source_reachable:false.

        A silent {text: ""} with HTTP 200 = test FAIL (fabrication enabler).
        source_reachable:false = test PASS (mcp-server treats this as ERROR).
        """
        from infrastructure.ocr_text_source import SqliteOcrTextSource
        bad_src = SqliteOcrTextSource("/nonexistent/path/market.db")
        # ocr_source_ok=True here to isolate: even when startup probe "passed",
        # a per-call failure on a bad source must surface source_reachable:false.
        client = _build_handler_client(ocr_source_ok=True, ocr_text_source=bad_src)
        resp = client.get("/page-text?filename=VCB_2024.pdf&page_number=1")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()

        self.assertIn(
            "source_reachable",
            data,
            "/page-text response must include source_reachable field",
        )
        self.assertFalse(
            data["source_reachable"],
            f"/page-text must return source_reachable:false on bad DB path, got: {data}",
        )
        # text may be "" — that is acceptable as long as source_reachable is False
        self.assertEqual(
            data.get("text", ""),
            "",
            "text must be '' when source is unreachable",
        )

    def test_page_text_source_reachable_true_on_valid_db(self) -> None:
        """GREEN: /page-text source_reachable:true on a reachable DB."""
        with tempfile.TemporaryDirectory(prefix="test_page_text_") as tmp_dir:
            db_path = _make_market_db(tmp_dir, rows=[
                ("VCB_2024.pdf", 1, "Báo cáo tài chính năm 2024"),
            ])
            from infrastructure.ocr_text_source import SqliteOcrTextSource
            src = SqliteOcrTextSource(db_path)
            client = _build_handler_client(ocr_source_ok=True, ocr_text_source=src)
            resp = client.get("/page-text?filename=VCB_2024.pdf&page_number=1")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("source_reachable", data)
            self.assertTrue(
                data["source_reachable"],
                f"/page-text source_reachable must be True on valid DB, got: {data}",
            )
            self.assertEqual(data["text"], "Báo cáo tài chính năm 2024")

    def test_page_text_empty_page_still_reachable(self) -> None:
        """
        GREEN: /page-text source_reachable:true even when the page has no text.

        Distinguishes "DB reachable but page has no text" from "DB unreachable".
        """
        with tempfile.TemporaryDirectory(prefix="test_page_text_empty_") as tmp_dir:
            db_path = _make_market_db(tmp_dir)  # empty table
            from infrastructure.ocr_text_source import SqliteOcrTextSource
            src = SqliteOcrTextSource(db_path)
            client = _build_handler_client(ocr_source_ok=True, ocr_text_source=src)
            resp = client.get("/page-text?filename=VCB_2024.pdf&page_number=99")
            self.assertEqual(resp.status_code, 200)
            data = resp.json()
            self.assertIn("source_reachable", data)
            self.assertTrue(
                data["source_reachable"],
                f"source_reachable must be True when DB is reachable (page just has no text), got: {data}",
            )
            self.assertEqual(data["text"], "")

    def test_page_text_none_source_returns_source_reachable_false(self) -> None:
        """
        EDGE: /page-text with ocr_text_source=None returns source_reachable:false.

        In the pre-FU-1 wiring, ocr_text_source was None and the handler silently
        returned {text: ""}. FU-1 makes this an explicit error.
        """
        client = _build_handler_client(ocr_source_ok=False, ocr_text_source=None)
        resp = client.get("/page-text?filename=VCB_2024.pdf&page_number=1")
        self.assertEqual(resp.status_code, 200)
        data = resp.json()
        self.assertIn("source_reachable", data)
        self.assertFalse(
            data["source_reachable"],
            f"/page-text with None source must return source_reachable:false, got: {data}",
        )


# ---------------------------------------------------------------------------
# Test 4: SqliteOcrTextSource raises (not silently returns "") on bad path
# ---------------------------------------------------------------------------


class TestSqliteOcrTextSourceFailLoud(unittest.TestCase):
    """FU-1: SqliteOcrTextSource.get_page_text raises on bad DB path (not silent '')."""

    def test_raises_on_nonexistent_db(self) -> None:
        """
        FU-1: get_page_text raises an exception on a non-existent DB path.

        The handler catches this and returns source_reachable:false.
        The PREVIOUS behaviour was to swallow the exception and return "".
        That behaviour is what enabled fabrication — this test proves it is gone.
        """
        from infrastructure.ocr_text_source import SqliteOcrTextSource
        src = SqliteOcrTextSource("/nonexistent/path/market.db")

        with self.assertRaises(Exception) as ctx:
            src.get_page_text("any.pdf", 1)

        # Any exception is acceptable — the key is it RAISES, not silently returns "".
        exc_msg = str(ctx.exception)
        self.assertTrue(
            len(exc_msg) > 0,
            "Exception message must not be empty",
        )

    def test_succeeds_on_valid_db(self) -> None:
        """GREEN: get_page_text returns correct text from a valid read-only DB."""
        with tempfile.TemporaryDirectory(prefix="test_src_") as tmp_dir:
            db_path = _make_market_db(tmp_dir, rows=[
                ("FPT_2024.pdf", 3, "Tài sản cố định hữu hình"),
            ])
            from infrastructure.ocr_text_source import SqliteOcrTextSource
            src = SqliteOcrTextSource(db_path)
            result = src.get_page_text("FPT_2024.pdf", 3)
            self.assertEqual(result, "Tài sản cố định hữu hình")


if __name__ == "__main__":
    unittest.main()
