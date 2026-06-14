"""
Infrastructure — DocLang XML serializer and write adapters.

Sprint: DOCLANG-SERIALIZE Phase 1

Classes:
    DocLangSerializer          — pure transform, stdlib-only, no I/O
    FilesystemDocLangWriteAdapter — production write adapter (implements DocLangWritePort)
    NullDocLangWriteAdapter    — test no-op adapter (implements DocLangWritePort)

DDD note: This file lives in infrastructure/ because FilesystemDocLangWriteAdapter performs
I/O. DocLangSerializer itself is a pure transform but co-located here for cohesion.
"""

import logging
import os
from typing import Callable, List, Optional, Tuple

from application.dtos import ExtractedTableDTO

logger = logging.getLogger(__name__)

DOCLANG_NS = "https://www.doclang.ai/ns/v0"
DOCLANG_VERSION = "0.6"


class DocLangSerializer:
    """
    Pure DocLang XML serializer for financial report tables.

    Input: list of ExtractedTableDTO objects (from application/dtos.py)
    Output: Complete, well-formed DocLang XML string (version 0.6)

    Transformation rules:
    - Group DTOs by table_index
    - Single-DTO group → emit one <table>
    - Multi-DTO group (same table_index, different page_numbers) → emit paired <table>
      with <thread> + <page_break>
    - Rectangular rule: pad short rows to len(headers), warn on surplus cells
    - XML escape all cell content: & < > " '

    Threading (cross-page continuation):
    - When multiple ExtractedTableDTO objects share the same table_index but differ in
      page_number, they represent a logical table split across pages. Emit as paired
      <table> elements with matching <thread thread_id="{table_index + 1}"/> (XSD requires
      xs:positiveInteger, so table_index is shifted by +1) and separated by <page_break/>.
    - This handles both upstream shapes: single stitched DTO (no threading) and multiple
      DTOs per logical table (threading).

    XSD constraint: thread_id must be xs:positiveInteger (>= 1). table_index values start
    at 0, so the emitted thread_id = table_index + 1. This is a serialization detail only;
    the DTO table_index is preserved unchanged.

    PROMOTE source: scripts/spike-doclang-otsl-overlap.py:225-275
    """

    def __init__(
        self,
        bbox_provider: Optional[Callable[[int, int], Tuple[int, int, int, int]]] = None,
    ) -> None:
        """
        Initialize the serializer.

        Args:
            bbox_provider: Optional hook for Phase 2. When provided, called as
                          bbox_provider(table_index, page_number) -> (x, y, w, h).
                          In Phase 1, always None; <location> is omitted.
        """
        self._bbox_provider = bbox_provider

    def serialize(
        self, tables: List[ExtractedTableDTO], report_id: str = "unknown"
    ) -> str:
        """
        Serialize a list of ExtractedTableDTO objects to a DocLang XML string.

        Args:
            tables:    List of ExtractedTableDTO, each with table_index, headers,
                       rows, page_number.
            report_id: Document identifier for metadata (default: "unknown").

        Returns:
            Well-formed DocLang XML string (UTF-8), ready to write to disk.
            Returns a valid empty-body doclang document when tables is empty.
            Never raises.
        """
        # --- 1. Group DTOs by table_index, skip empty tables ---
        groups_dict: dict[int, List[ExtractedTableDTO]] = {}
        for dto in tables:
            if not dto.headers:
                logger.warning(
                    "DocLangSerializer: skipping empty table (table_index=%d, page_number=%d)",
                    dto.table_index,
                    dto.page_number,
                )
                continue
            if dto.table_index not in groups_dict:
                groups_dict[dto.table_index] = []
            groups_dict[dto.table_index].append(dto)

        # --- 2. Sort groups by table_index and serialize each group ---
        table_parts: List[str] = []
        for table_idx in sorted(groups_dict.keys()):
            group = groups_dict[table_idx]
            # Sort by page_number within group
            group.sort(key=lambda d: d.page_number)
            # thread_id in XML = table_index + 1 (XSD xs:positiveInteger constraint)
            xml_thread_id = table_idx + 1
            table_parts.extend(
                self._serialize_group(group, thread_id=xml_thread_id)
            )

        # --- 3. Wrap in root element ---
        lines: List[str] = [
            '<?xml version="1.0" encoding="UTF-8"?>',
            f'<doclang xmlns="{DOCLANG_NS}" version="{DOCLANG_VERSION}">',
            f"  <head><meta>report_id={self._escape_xml(report_id)}</meta></head>",
        ]
        for part in table_parts:
            # Indent each line of the table/page_break part by 2 spaces
            for line in part.split("\n"):
                lines.append(f"  {line}")
        lines.append("</doclang>")

        return "\n".join(lines)

    @staticmethod
    def _escape_xml(text: str) -> str:
        """
        Escape XML special characters: & < > " '

        PROMOTED verbatim from: scripts/spike-doclang-otsl-overlap.py:225-227
        Reference: https://www.w3.org/TR/xml/#syntax

        Escaping order matters: & MUST be first.

        Args:
            text: Raw cell value (may be None or non-string).

        Returns:
            XML-escaped string. UTF-8 Vietnamese diacritics pass through unescaped.
        """
        if text is None:
            logger.debug(
                "DocLangSerializer._escape_xml: None cell, coercing to empty string"
            )
            return ""
        if not isinstance(text, str):
            logger.debug(
                "DocLangSerializer._escape_xml: non-string cell %r, coercing to str",
                type(text),
            )
            text = str(text)
        # Order: & first, then others
        text = text.replace("&", "&amp;")
        text = text.replace("<", "&lt;")
        text = text.replace(">", "&gt;")
        text = text.replace('"', "&quot;")
        text = text.replace("'", "&apos;")
        return text

    def _serialize_group(
        self,
        group: List[ExtractedTableDTO],
        thread_id: int,
    ) -> List[str]:
        """
        Serialize one table-index group into one or more <table> elements.

        Args:
            group:     List of ExtractedTableDTO with identical table_index, sorted
                       by ascending page_number.
            thread_id: XSD-compliant thread id (table_index + 1). Used only when
                       len(group) > 1.

        Returns:
            List of XML strings: one per <table> element plus <page_break/> between them.
            For single-DTO groups: [single_table_str]
            For multi-DTO groups:  [table1_str, "<page_break/>", table2_str, ...]
        """
        if len(group) == 1:
            return [self._table_element(group[0], thread_id=None)]

        result: List[str] = []
        for i, dto in enumerate(group):
            result.append(self._table_element(dto, thread_id=thread_id))
            if i < len(group) - 1:
                result.append("<page_break/>")
        return result

    def _table_element(
        self,
        dto: ExtractedTableDTO,
        thread_id: Optional[int] = None,
    ) -> str:
        """
        Emit a single <table>...</table> element for one ExtractedTableDTO.

        Args:
            dto:       One ExtractedTableDTO with headers, rows, table_index, page_number.
            thread_id: If set, emit <thread thread_id="{thread_id}"/> as first child
                       (XSD element_head position). Must be >= 1 (xs:positiveInteger).

        Returns:
            Complete <table>...</table> XML string.
        """
        lines: List[str] = ["<table>"]

        # element_head: thread marker (must precede cell tokens per XSD/Schematron)
        if thread_id is not None:
            lines.append(f'<thread thread_id="{thread_id}"/>')

        # Header row: <ched/>header1<ched/>header2...<nl/>
        header_cells = "".join(
            f"<ched/>{self._escape_xml(str(h))}" for h in dto.headers
        )
        lines.append(f"{header_cells}<nl/>")

        n_cols = len(dto.headers)

        # Data rows with rectangular-rule enforcement
        for row_idx, row in enumerate(dto.rows):
            actual_cols = len(row)

            if actual_cols < n_cols:
                # Pad short row with empty cells
                row_padded = list(row) + [""] * (n_cols - actual_cols)
            elif actual_cols > n_cols:
                # Surplus cells: emit as-is, log WARNING
                row_padded = list(row)
                logger.warning(
                    "DocLangSerializer: row %d too long (table_index=%d, page_number=%d, "
                    "expected_cols=%d, actual_cols=%d) — surplus cells emitted",
                    row_idx,
                    dto.table_index,
                    dto.page_number,
                    n_cols,
                    actual_cols,
                )
            else:
                row_padded = list(row)

            cell_str = "".join(
                f"<fcel/>{self._escape_xml(c)}" for c in row_padded
            )
            lines.append(f"{cell_str}<nl/>")

        lines.append("</table>")
        return "\n".join(lines)


# ---------------------------------------------------------------------------
# Write adapters (implement DocLangWritePort domain port)
# ---------------------------------------------------------------------------


class FilesystemDocLangWriteAdapter:
    """
    Production adapter for DocLangWritePort — writes XML to filesystem.

    Implements: domain.modules.financial_reports.ports.DocLangWritePort

    Usage:
        adapter = FilesystemDocLangWriteAdapter(output_dir="/app/data/doclang")
        path = adapter.write(report_id="abc-123", xml_str="<doclang>...</doclang>")
        # Output: /app/data/doclang/abc-123.dclg.xml
    """

    def __init__(self, output_dir: str) -> None:
        """
        Initialize the adapter.

        Args:
            output_dir: Directory path for writing .dclg.xml files.
        """
        self._output_dir = output_dir

    def write(self, report_id: str, xml_str: str) -> str:
        """
        Write the XML string to a file on disk.

        Args:
            report_id: UUID or document ID (becomes filename stem).
            xml_str:   Complete well-formed DocLang XML string.

        Returns:
            Absolute path to the written file on success.
            Empty string on I/O error (never raises).

        Contract:
            - Thread-safe: each call writes to a unique path (report_id stem).
            - Creates output_dir if it does not exist.
            - Never modifies bctc_table_rows or any DB table.
        """
        try:
            os.makedirs(self._output_dir, exist_ok=True)
            filename = f"{report_id}.dclg.xml"
            filepath = os.path.join(self._output_dir, filename)
            with open(filepath, "w", encoding="utf-8") as f:
                f.write(xml_str)
            logger.info(
                "DocLangWriteAdapter: wrote report_id=%s path=%s", report_id, filepath
            )
            return filepath
        except IOError as exc:
            logger.error(
                "DocLangWriteAdapter: IOError writing report_id=%s error=%s",
                report_id,
                exc,
            )
            return ""
        except Exception as exc:
            logger.error(
                "DocLangWriteAdapter: unexpected error report_id=%s error=%s",
                report_id,
                exc,
            )
            return ""


class NullDocLangWriteAdapter:
    """
    Test adapter for DocLangWritePort — no-op, returns empty string.

    Implements: domain.modules.financial_reports.ports.DocLangWritePort

    Usage in tests: pass to DocLangSerializeUseCase constructor instead of
    FilesystemDocLangWriteAdapter. Ensures tests do not write to disk.
    """

    def write(self, report_id: str, xml_str: str) -> str:
        """
        No-op write (test-only).

        Args:
            report_id: (ignored)
            xml_str:   (ignored)

        Returns:
            Empty string (no file written).
        """
        return ""
