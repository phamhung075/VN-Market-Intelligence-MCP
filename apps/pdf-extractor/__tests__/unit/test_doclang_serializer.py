"""
Golden-file unit tests for DocLangSerializer.

Sprint: DOCLANG-SERIALIZE Phase 1

Fixtures:
- Fixture A: single-page FPT Q4 B01-DN table (real BCTC shape)
- Fixture B: multi-column Vietnamese BCTC table with diacritics
- Fixture C: cross-page continuation (synthetic, two DTOs same table_index, different pages)

Edge cases:
- EC-2: empty table (zero headers + zero rows)
- EC-3: row with surplus columns (logged WARNING, not schematron-valid by design)
- EC-4: row with missing columns (short row, padded)

All tests use NullDocLangWriteAdapter (no filesystem write).
Fixtures A/B/C assert: (1) well-formed XML, (2) doclang.validate() passes, (3) known value present.

XSD note: <thread thread_id> requires xs:positiveInteger (>= 1). Serializer emits
thread_id = table_index + 1 to satisfy this constraint. Fixture C uses table_index=0,
so the emitted thread_id is 1.
"""

import os
import tempfile
import xml.etree.ElementTree as ET

import pytest

from application.dtos import ExtractedTableDTO, ExtractPDFResponse
from infrastructure.doclang_serializer import (
    DocLangSerializer,
    NullDocLangWriteAdapter,
)
from application.doclang_serialize_usecase import DocLangSerializeUseCase


class TestDocLangSerializer:
    """Core serializer tests."""

    @pytest.fixture
    def serializer(self) -> DocLangSerializer:
        """Return a DocLangSerializer instance."""
        return DocLangSerializer(bbox_provider=None)

    # =====================================================================
    # FIXTURE A: Single-page FPT Q4 B01-DN
    # =====================================================================

    def test_fixture_a_single_page_fpt_q4(self, serializer: DocLangSerializer) -> None:
        """
        Fixture A: FPT Q4 2025 B01-DN single-page table.

        Source: Actual BCTC balance sheet table shape. Headers + 5 rows.
        Headers: Mã, Chỉ tiêu, 31/12/2025, 31/12/2024

        Assertions:
        - Well-formed XML
        - doclang.validate() passes (0 XSD + 0 Schematron errors)
        - Cell "Tổng cộng tài sản" present exactly once
        """
        dto = ExtractedTableDTO(
            table_index=0,
            page_number=4,
            headers=["Mã", "Chỉ tiêu", "31/12/2025", "31/12/2024"],
            rows=[
                ["100", "Tài sản ngắn hạn", "1000.0", "900.0"],
                ["110", "Tiền và tương đương tiền", "200.0", "150.0"],
                ["120", "Các khoản phải thu", "350.0", "300.0"],
                ["130", "Hàng tồn kho", "400.0", "400.0"],
                ["", "Tổng cộng tài sản", "1500.0", "1300.0"],
            ],
        )

        xml_str = serializer.serialize([dto], report_id="FPT-Q4-2025")

        # Assert 1: Well-formed XML
        root = ET.fromstring(xml_str)
        assert root.tag.endswith("doclang"), f"Unexpected root tag: {root.tag}"
        assert root.get("version") == "0.6"

        # Assert 2: doclang.validate() passes
        _validate_and_assert(xml_str, "FPT-Q4-2025")

        # Assert 3: Known cell present exactly once
        assert "Tổng cộng tài sản" in xml_str
        assert xml_str.count("Tổng cộng tài sản") == 1

    # =====================================================================
    # FIXTURE B: Vietnamese diacritics UTF-8 round-trip
    # =====================================================================

    def test_fixture_b_vietnamese_diacritics(self, serializer: DocLangSerializer) -> None:
        """
        Fixture B: Multi-column BCTC table with Vietnamese diacritics.

        Source: Synthetic table with realistic Vietnamese labels containing diacritics.
        Verifies UTF-8 round-trip and XSD validation.

        Assertions:
        - Well-formed XML
        - doclang.validate() passes
        - Vietnamese label present verbatim
        """
        dto = ExtractedTableDTO(
            table_index=0,
            page_number=1,
            headers=["Mã", "Chỉ tiêu", "Q4 2025", "Q4 2024"],
            rows=[
                ["5001", "Doanh thu bán hàng và cung cấp dịch vụ", "5000.0", "4800.0"],
                ["5002", "Lợi nhuận gộp về bán hàng và cung cấp dịch vụ", "1500.0", "1300.0"],
                ["5003", "Chi phí bán hàng", "800.0", "700.0"],
            ],
        )

        xml_str = serializer.serialize([dto], report_id="BCTC-VN-2025")

        # Assert 1: Well-formed XML
        ET.fromstring(xml_str)  # Raises if malformed

        # Assert 2: doclang.validate() passes
        _validate_and_assert(xml_str, "BCTC-VN-2025")

        # Assert 3: Vietnamese label present verbatim (UTF-8 round-trip)
        assert "Lợi nhuận gộp về bán hàng và cung cấp dịch vụ" in xml_str

    # =====================================================================
    # FIXTURE C: Cross-page continuation (SYNTHETIC)
    # =====================================================================

    def test_fixture_c_cross_page_threading(self, serializer: DocLangSerializer) -> None:
        """
        Fixture C: Cross-page table continuation (synthetic).

        Source: Two ExtractedTableDTO objects with same table_index (0) but different
                page_numbers (4 and 5), representing a logical table split across pages.

        # SYNTHETIC: represents a cross-page B01-DN continuation.
        # FPT Q4 2025 p4-5 shape. Source: manual construction from corpus row structure.

        XSD note: <thread thread_id> requires xs:positiveInteger (>= 1). For table_index=0,
        the serializer emits thread_id=1 (table_index + 1). The test asserts thread_id="1".

        Assertions:
        - Well-formed XML
        - doclang.validate() passes
        - <thread thread_id="1"/> appears exactly 2x (one per table, thread_id = table_index+1)
        - <page_break/> appears exactly 1x (between tables)
        """
        # SYNTHETIC: represents a cross-page B01-DN continuation.
        # FPT Q4 2025 p4-5 shape. Source: manual construction from corpus row structure.
        dto_p4 = ExtractedTableDTO(
            table_index=0,
            page_number=4,
            headers=["Mã", "Chỉ tiêu", "31/12/2025", "31/12/2024"],
            rows=[
                ["100", "Tài sản ngắn hạn", "1000.0", "900.0"],
                ["110", "Tiền và tương đương tiền", "200.0", "150.0"],
            ],
        )
        dto_p5 = ExtractedTableDTO(
            table_index=0,
            page_number=5,
            headers=["Mã", "Chỉ tiêu", "31/12/2025", "31/12/2024"],
            rows=[
                ["120", "Các khoản phải thu", "350.0", "300.0"],
                ["130", "Hàng tồn kho", "400.0", "400.0"],
            ],
        )

        xml_str = serializer.serialize([dto_p4, dto_p5], report_id="CROSS-PAGE-2025")

        # Assert 1: Well-formed XML
        ET.fromstring(xml_str)

        # Assert 2: doclang.validate() passes
        _validate_and_assert(xml_str, "CROSS-PAGE-2025")

        # Assert 3: Threading markers — thread_id=1 because table_index=0 → 0+1=1
        thread_count = xml_str.count('<thread thread_id="1"/>')
        assert thread_count == 2, (
            f"Expected 2 <thread thread_id=\"1\"/> markers, found {thread_count}\n"
            f"Full XML:\n{xml_str}"
        )
        page_break_count = xml_str.count("<page_break/>")
        assert page_break_count == 1, (
            f"Expected 1 <page_break/>, found {page_break_count}"
        )

    # =====================================================================
    # EDGE CASES
    # =====================================================================

    def test_ec2_empty_table_zero_headers_zero_rows(
        self, serializer: DocLangSerializer
    ) -> None:
        """
        Edge case EC-2: Table with zero headers AND zero rows.

        Expected behavior: No <table> element emitted (skip with WARNING log).
        Output is a valid doclang document with empty body.
        """
        dto = ExtractedTableDTO(
            table_index=0,
            page_number=1,
            headers=[],
            rows=[],
        )

        xml_str = serializer.serialize([dto], report_id="EMPTY-TABLE")

        # No <table> in output
        assert "<table>" not in xml_str, "Empty table should not emit <table> element"

        # Root is still well-formed and valid doclang
        ET.fromstring(xml_str)
        _validate_and_assert(xml_str, "EMPTY-TABLE")

    def test_ec4_short_row_padding(self, serializer: DocLangSerializer) -> None:
        """
        Edge case EC-4: Row with fewer columns than headers.

        Expected behavior: Padded with empty <fcel/> to reach header count.
        Validates successfully (padding preserves rectangular rule).
        """
        dto = ExtractedTableDTO(
            table_index=0,
            page_number=1,
            headers=["A", "B", "C", "D"],
            rows=[
                ["1", "2"],  # Only 2 columns — padded to 4
            ],
        )

        xml_str = serializer.serialize([dto], report_id="SHORT-ROW")

        # Row should have 4 <fcel/> tags (2 real + 2 padded)
        # Count fcel in the data line
        fcel_count = xml_str.count("<fcel/>")
        assert fcel_count >= 4, f"Expected >= 4 <fcel/> (padded to header count), got {fcel_count}"

        # Validates (padded = rectangular)
        ET.fromstring(xml_str)
        _validate_and_assert(xml_str, "SHORT-ROW")

    def test_ec3_long_row_surplus_cells(
        self, serializer: DocLangSerializer, caplog: pytest.LogCaptureFixture
    ) -> None:
        """
        Edge case EC-3: Row with more columns than headers.

        Expected behavior: Surplus cells emitted as-is, WARNING logged.
        Note: Schematron rectangular-rule will flag this as invalid. This test
        only verifies that (a) a WARNING is logged and (b) surplus cells appear
        in the output. doclang.validate() is NOT called here by design.
        """
        dto = ExtractedTableDTO(
            table_index=0,
            page_number=1,
            headers=["A", "B"],
            rows=[
                ["1", "2", "3", "4"],  # 4 columns, headers only 2 → surplus
            ],
        )

        with caplog.at_level("WARNING"):
            xml_str = serializer.serialize([dto], report_id="LONG-ROW")

        # Warning should be logged
        warning_text = caplog.text.lower()
        assert "too long" in warning_text or "surplus" in warning_text, (
            f"Expected WARNING about surplus cells, got caplog: {caplog.text}"
        )

        # Surplus cells are still present in output
        assert "<fcel/>3" in xml_str or "<fcel/>4" in xml_str, (
            "Surplus cells should be emitted in output"
        )

        # Basic well-formed XML (surplus doesn't break XML structure)
        ET.fromstring(xml_str)

    # =====================================================================
    # XML ESCAPE
    # =====================================================================

    def test_escape_xml_special_characters(self, serializer: DocLangSerializer) -> None:
        """
        Verify _escape_xml handles & < > \" ' in correct order.
        """
        dto = ExtractedTableDTO(
            table_index=0,
            page_number=1,
            headers=["A & B", "C < D", "E > F"],
            rows=[["x & y", "a < b", "c > d"]],
        )
        xml_str = serializer.serialize([dto], report_id="ESCAPE-TEST")

        assert "&amp;" in xml_str
        assert "&lt;" in xml_str
        assert "&gt;" in xml_str
        # Raw unescaped chars should not appear in cell context
        # (note: they may appear in attribute values or XML declaration but not in text)
        ET.fromstring(xml_str)

    def test_escape_xml_none_cell_coerced(self, serializer: DocLangSerializer) -> None:
        """
        Verify None cell values are coerced to empty string.
        """
        result = DocLangSerializer._escape_xml(None)  # type: ignore[arg-type]
        assert result == ""

    def test_escape_xml_non_string_coerced(self, serializer: DocLangSerializer) -> None:
        """
        Verify non-string cell values are coerced to str.
        """
        result = DocLangSerializer._escape_xml(42)  # type: ignore[arg-type]
        assert result == "42"


class TestDocLangSerializeUseCase:
    """Use case integration tests (all use NullDocLangWriteAdapter)."""

    @pytest.fixture
    def usecase(self) -> DocLangSerializeUseCase:
        """Return a DocLangSerializeUseCase with null adapter (no filesystem write)."""
        serializer = DocLangSerializer()
        null_adapter = NullDocLangWriteAdapter()
        return DocLangSerializeUseCase(serializer, null_adapter)

    def test_usecase_execute_with_response(
        self, usecase: DocLangSerializeUseCase
    ) -> None:
        """
        Test execute() with ExtractPDFResponse containing tables.

        Uses NullDocLangWriteAdapter → result is empty string.
        Verifies: execute returns str and never raises.
        """
        dto = ExtractedTableDTO(
            table_index=0, page_number=1, headers=["A"], rows=[["1"]]
        )
        response = ExtractPDFResponse(
            document_id="test-001",
            tables=[dto],
            text_content="",
            ocr_confidence=1.0,
            extraction_time_ms=100,
            status="success",
        )

        result = usecase.execute(response, report_id="test-override")
        # NullDocLangWriteAdapter returns empty string
        assert result == ""

    def test_usecase_execute_uses_document_id_fallback(
        self, usecase: DocLangSerializeUseCase
    ) -> None:
        """
        Test that execute() falls back to response.document_id when report_id is None.
        """
        dto = ExtractedTableDTO(
            table_index=0, page_number=1, headers=["X"], rows=[["v"]]
        )
        response = ExtractPDFResponse(
            document_id="doc-from-response",
            tables=[dto],
            text_content="",
            ocr_confidence=1.0,
            extraction_time_ms=50,
            status="success",
        )
        # No report_id override — use case should not raise
        result = usecase.execute(response)
        assert isinstance(result, str)

    def test_usecase_execute_empty_tables_graceful(
        self, usecase: DocLangSerializeUseCase
    ) -> None:
        """
        Test execute() with empty tables list — should not raise.
        """
        response = ExtractPDFResponse(
            document_id="empty-doc",
            tables=[],
            text_content="",
            ocr_confidence=1.0,
            extraction_time_ms=10,
            status="success",
        )
        result = usecase.execute(response)
        assert isinstance(result, str)

    def test_null_adapter_returns_empty_string(self) -> None:
        """
        Verify NullDocLangWriteAdapter.write() always returns empty string.
        """
        adapter = NullDocLangWriteAdapter()
        assert adapter.write("any-id", "<doclang/>") == ""
        assert adapter.write("", "") == ""


# =========================================================================
# Shared helper
# =========================================================================


def _validate_and_assert(xml_str: str, report_id: str) -> None:
    """
    Validate DocLang XML and assert zero XSD + zero Schematron errors.

    Skips if doclang is not available (e.g. in container environment without JRE).

    Args:
        xml_str:   XML string to validate.
        report_id: For error message context.

    Raises:
        AssertionError if validation fails.
    """
    try:
        from doclang import validate, ValidationError  # type: ignore[import]

        with tempfile.NamedTemporaryFile(
            suffix=".dclg.xml", mode="w", encoding="utf-8", delete=False
        ) as f:
            f.write(xml_str)
            tmp_path = f.name

        try:
            validate(tmp_path, allow_empty_namespace=False)
            # Success — no exception raised
        except ValidationError as e:
            xsd_errors = getattr(e, "xsd_errors", [])
            schematron_errors = getattr(e, "schematron_errors", [])
            raise AssertionError(
                f"doclang validation failed for {report_id}: "
                f"{len(xsd_errors)} XSD errors, {len(schematron_errors)} Schematron errors.\n"
                f"XSD: {xsd_errors}\n"
                f"Schematron: {schematron_errors}\n"
                f"XML:\n{xml_str}"
            )
        finally:
            os.unlink(tmp_path)

    except ImportError:
        pytest.skip("doclang not available (expected in container), skipping validation")
