"""
Unit tests for infrastructure/ocr_text_source.py and
infrastructure/ocr_text_source_factory.py — AR-PDF FR-2

Test plan (AC-FR2-1 through AC-FR2-3):
    AC-FR2-1: Port defined — OcrTextSourcePort exists in domain/repositories.py.
    AC-FR2-2: SqliteOcrTextSource reads correct row from pdf_extracted_text table.
    AC-FR2-3: MistralOcrSource stub raises NotImplementedError.

Additional tests:
    - Factory: select_ocr_text_source("sqlite") returns SqliteOcrTextSource.
    - Factory: select_ocr_text_source("mistral") returns MistralOcrSource.
    - Factory: unknown backend raises ValueError.
    - SqliteOcrTextSource: returns "" when no row found (no row for the key).
    - SqliteOcrTextSource: returns "" gracefully on corrupt DB path.
"""

from __future__ import annotations

import os
import sqlite3
import tempfile
import unittest
from pathlib import Path


# ---------------------------------------------------------------------------
# AC-FR2-1: Port defined
# ---------------------------------------------------------------------------


class TestOcrTextSourcePortDefined(unittest.TestCase):
    """AC-FR2-1: OcrTextSourcePort Protocol exists in domain/repositories."""

    def test_port_importable(self) -> None:
        """OcrTextSourcePort can be imported from domain.repositories."""
        from domain.repositories import OcrTextSourcePort  # noqa: F401
        self.assertTrue(True)

    def test_port_has_get_page_text(self) -> None:
        """OcrTextSourcePort has get_page_text method defined."""
        from domain.repositories import OcrTextSourcePort
        self.assertTrue(
            hasattr(OcrTextSourcePort, "get_page_text"),
            "OcrTextSourcePort must define get_page_text",
        )


# ---------------------------------------------------------------------------
# AC-FR2-2: SqliteOcrTextSource reads correct row
# ---------------------------------------------------------------------------


def _create_test_db(db_path: str, rows: list[tuple]) -> None:
    """
    Create a minimal market.db with pdf_extracted_text table.

    rows: list of (filename, page_number, text_content) tuples.
    """
    conn = sqlite3.connect(db_path)
    conn.execute("""
        CREATE TABLE IF NOT EXISTS pdf_extracted_text (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            filename TEXT NOT NULL,
            page_number INTEGER NOT NULL,
            text_content TEXT
        )
    """)
    conn.executemany(
        "INSERT INTO pdf_extracted_text (filename, page_number, text_content) VALUES (?, ?, ?)",
        rows,
    )
    conn.commit()
    conn.close()


class TestSqliteOcrTextSource(unittest.TestCase):
    """AC-FR2-2: SqliteOcrTextSource reads pdf_extracted_text correctly."""

    def setUp(self) -> None:
        self.tmp_dir = tempfile.mkdtemp(prefix="test_ocr_src_")
        self.db_path = os.path.join(self.tmp_dir, "market.db")

    def tearDown(self) -> None:
        import shutil
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def test_ac_fr2_2_reads_correct_row(self) -> None:
        """AC-FR2-2: get_page_text returns the correct text_content for (filename, page_number)."""
        _create_test_db(self.db_path, [
            ("VCB_2024_Q4.pdf", 1, "Page 1 OCR text — balance sheet"),
            ("VCB_2024_Q4.pdf", 2, "Page 2 OCR text — income statement"),
            ("ACB_2024_Q4.pdf", 1, "ACB page 1 text"),
        ])

        from infrastructure.ocr_text_source import SqliteOcrTextSource
        src = SqliteOcrTextSource(self.db_path)

        self.assertEqual(
            src.get_page_text("VCB_2024_Q4.pdf", 1),
            "Page 1 OCR text — balance sheet",
        )
        self.assertEqual(
            src.get_page_text("VCB_2024_Q4.pdf", 2),
            "Page 2 OCR text — income statement",
        )
        self.assertEqual(
            src.get_page_text("ACB_2024_Q4.pdf", 1),
            "ACB page 1 text",
        )

    def test_returns_empty_string_when_no_row(self) -> None:
        """get_page_text returns '' when no row found (never raises)."""
        _create_test_db(self.db_path, [
            ("VCB_2024_Q4.pdf", 1, "some text"),
        ])

        from infrastructure.ocr_text_source import SqliteOcrTextSource
        src = SqliteOcrTextSource(self.db_path)

        # Page 99 does not exist — must return ""
        result = src.get_page_text("VCB_2024_Q4.pdf", 99)
        self.assertEqual(result, "")

    def test_returns_empty_string_when_wrong_filename(self) -> None:
        """get_page_text returns '' when filename not found."""
        _create_test_db(self.db_path, [
            ("VCB_2024_Q4.pdf", 1, "some text"),
        ])

        from infrastructure.ocr_text_source import SqliteOcrTextSource
        src = SqliteOcrTextSource(self.db_path)

        result = src.get_page_text("NONEXISTENT.pdf", 1)
        self.assertEqual(result, "")

    def test_raises_on_bad_db_path(self) -> None:
        """
        FU-1: get_page_text RAISES on a non-existent db_path.

        PREVIOUS behaviour (pre-FU-1): silently return "".
        NEW behaviour (FU-1): raise sqlite3.OperationalError so the handler
        can return source_reachable:false instead of a silent empty string.

        The silent-swallow was the root cause of the fabrication defect:
        a refine agent receiving text="" with ok:true had no signal to abort.
        The caller (/page-text handler) catches the exception and returns
        source_reachable:false — a distinct error signal.

        See FU-1 RISK-1 in test_fu1_fail_loud.py for the end-to-end proof.
        """
        from infrastructure.ocr_text_source import SqliteOcrTextSource
        src = SqliteOcrTextSource("/nonexistent/path/market.db")

        # Must raise — NOT silently return ""
        with self.assertRaises(Exception):
            src.get_page_text("any.pdf", 1)

    def test_returns_empty_string_when_text_content_is_null(self) -> None:
        """get_page_text returns '' when text_content is NULL in the DB."""
        _create_test_db(self.db_path, [
            ("VCB_2024_Q4.pdf", 1, None),  # NULL text_content
        ])

        from infrastructure.ocr_text_source import SqliteOcrTextSource
        src = SqliteOcrTextSource(self.db_path)

        result = src.get_page_text("VCB_2024_Q4.pdf", 1)
        self.assertEqual(result, "")


# ---------------------------------------------------------------------------
# AC-FR2-3: MistralOcrSource stub raises NotImplementedError
# ---------------------------------------------------------------------------


class TestMistralOcrSource(unittest.TestCase):
    """AC-FR2-3: MistralOcrSource stub raises NotImplementedError."""

    def test_ac_fr2_3_raises_not_implemented(self) -> None:
        """AC-FR2-3: get_page_text always raises NotImplementedError."""
        from infrastructure.ocr_text_source import MistralOcrSource
        stub = MistralOcrSource()

        with self.assertRaises(NotImplementedError):
            stub.get_page_text("any.pdf", 1)

    def test_error_message_mentions_mistral(self) -> None:
        """NotImplementedError message mentions 'Mistral OCR not yet wired'."""
        from infrastructure.ocr_text_source import MistralOcrSource
        stub = MistralOcrSource()

        try:
            stub.get_page_text("any.pdf", 1)
            self.fail("Expected NotImplementedError")
        except NotImplementedError as exc:
            self.assertIn("Mistral OCR not yet wired", str(exc))


# ---------------------------------------------------------------------------
# Factory tests
# ---------------------------------------------------------------------------


class TestSelectOcrTextSource(unittest.TestCase):
    """Tests for select_ocr_text_source() factory function."""

    def setUp(self) -> None:
        self.tmp_dir = tempfile.mkdtemp(prefix="test_ocr_factory_")
        self.db_path = os.path.join(self.tmp_dir, "market.db")

    def tearDown(self) -> None:
        import shutil
        shutil.rmtree(self.tmp_dir, ignore_errors=True)

    def _set_backend(self, value: str | None) -> str | None:
        """Set BCTC_PAGE_TEXT_BACKEND and return old value."""
        old = os.environ.get("BCTC_PAGE_TEXT_BACKEND")
        if value is None:
            os.environ.pop("BCTC_PAGE_TEXT_BACKEND", None)
        else:
            os.environ["BCTC_PAGE_TEXT_BACKEND"] = value
        return old

    def _restore_backend(self, old: str | None) -> None:
        if old is None:
            os.environ.pop("BCTC_PAGE_TEXT_BACKEND", None)
        else:
            os.environ["BCTC_PAGE_TEXT_BACKEND"] = old

    def test_default_backend_is_sqlite(self) -> None:
        """Factory returns SqliteOcrTextSource when env var is unset."""
        from infrastructure.ocr_text_source import SqliteOcrTextSource
        from infrastructure.ocr_text_source_factory import select_ocr_text_source

        old = self._set_backend(None)
        try:
            src = select_ocr_text_source(self.db_path)
            self.assertIsInstance(src, SqliteOcrTextSource)
        finally:
            self._restore_backend(old)

    def test_sqlite_backend_explicit(self) -> None:
        """Factory returns SqliteOcrTextSource when BCTC_PAGE_TEXT_BACKEND=sqlite."""
        from infrastructure.ocr_text_source import SqliteOcrTextSource
        from infrastructure.ocr_text_source_factory import select_ocr_text_source

        old = self._set_backend("sqlite")
        try:
            src = select_ocr_text_source(self.db_path)
            self.assertIsInstance(src, SqliteOcrTextSource)
        finally:
            self._restore_backend(old)

    def test_mistral_backend(self) -> None:
        """Factory returns MistralOcrSource when BCTC_PAGE_TEXT_BACKEND=mistral."""
        from infrastructure.ocr_text_source import MistralOcrSource
        from infrastructure.ocr_text_source_factory import select_ocr_text_source

        old = self._set_backend("mistral")
        try:
            src = select_ocr_text_source(self.db_path)
            self.assertIsInstance(src, MistralOcrSource)
        finally:
            self._restore_backend(old)

    def test_unknown_backend_raises_value_error(self) -> None:
        """Factory raises ValueError for unknown BCTC_PAGE_TEXT_BACKEND value."""
        from infrastructure.ocr_text_source_factory import select_ocr_text_source

        old = self._set_backend("unknown_backend")
        try:
            with self.assertRaises(ValueError) as ctx:
                select_ocr_text_source(self.db_path)
            self.assertIn("unknown_backend", str(ctx.exception))
        finally:
            self._restore_backend(old)


if __name__ == "__main__":
    unittest.main()
