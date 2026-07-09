# size-justification: 456L — Tier 2 (LF-EXTRACT) unit OCR: ocr_unit() (302L) is one
# linear per-page-in-unit loop (rasterize -> Tesseract -> word records -> per-row-band
# cell extraction -> stitch into one markdown pipe-table) that cannot be usefully
# split without threading 6+ accumulator variables (all_header_cells, all_data_rows,
# page_row_spans, rows_for_gate, current_row_idx, col_count) across new function
# boundaries — same risk profile the task's approach flags for extractor.py's
# _process_page. FACTORY-PDF-split-generic-md-table Stage 7/8.
"""
infrastructure/generic_md_table/unit_ocr.py — LF-EXTRACT Tier 2 (Stage 7/8)

Tier 2: ocr_unit() OCRs each page of a logical unit into the known column grid
(from Tier 1 zoning), then stitches all pages into one markdown pipe-table. For
prose units, concatenates stored OCR text directly (no new Tesseract pass —
AC-LFE-6: exactly ONE Tesseract image_to_data call per page, only here).

    ocr_unit(unit, zones_by_page, ...)   — public entry point (injected into
                                           ExtractLayoutFirstUseCase at the
                                           composition root, main.py).
    _tesseract_image_to_data(...)        — module-level Tesseract wrapper with
                                           SIGTERM retry (BPE-DEV-5); exposed at
                                           module level so tests can patch it.
    _build_word_records / _band_has_numeric_content / _extract_cell_text —
                                           per-page OCR-result geometry helpers.
    _empty_unit_result(...)              — shared empty-result fallback.

DDD layer: infrastructure (Tesseract subprocess + PIL — impure I/O).

See docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md for the
split approach (FACTORY-PDF-split-generic-md-table).
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Dict, List, Optional

from infrastructure.generic_md_table.constants import (
    MAX_TESSERACT_RETRIES,
    _TESSERACT_RETRY_SLEEP_S,
    _VALUE_TOKEN_RE,
)

logger = logging.getLogger(__name__)


def _tesseract_image_to_data(
    page_img: Any,
    lang: str,
    config: str,
) -> Dict:
    """
    Module-level wrapper around pytesseract.image_to_data with retry logic.

    Retries up to MAX_TESSERACT_RETRIES times on any exception (including
    SIGTERM signal -15 which appears as RuntimeError/TesseractError).

    Exposed at module level so tests can patch it without injecting pytesseract
    as a dependency.  ocr_unit() calls this wrapper instead of calling
    pytesseract directly.

    Args:
        page_img: PIL Image to OCR.
        lang:     Tesseract language string (e.g. "vie+eng").
        config:   Tesseract config string (e.g. "--psm 6").

    Returns:
        pytesseract image_to_data output dict (DICT output type).

    Raises:
        Exception: The last exception raised if all attempts are exhausted.
    """
    import time
    import pytesseract  # type: ignore

    last_exc: Optional[Exception] = None
    for attempt in range(MAX_TESSERACT_RETRIES + 1):
        try:
            return pytesseract.image_to_data(
                page_img,
                lang=lang,
                config=config,
                output_type=pytesseract.Output.DICT,
            )
        except Exception as exc:
            last_exc = exc
            if attempt < MAX_TESSERACT_RETRIES:
                logger.warning(
                    "_tesseract_image_to_data: attempt %d/%d failed: %s — retrying in %.1fs",
                    attempt + 1,
                    MAX_TESSERACT_RETRIES + 1,
                    exc,
                    _TESSERACT_RETRY_SLEEP_S,
                )
                time.sleep(_TESSERACT_RETRY_SLEEP_S)
            else:
                logger.warning(
                    "_tesseract_image_to_data: all %d attempts failed for page: %s",
                    MAX_TESSERACT_RETRIES + 1,
                    exc,
                )
    raise last_exc  # type: ignore[misc]


def ocr_unit(
    unit: Dict,
    zones_by_page: Dict[int, Dict],
    pdf_path: str,
    tmp_dir: str,
    ocr_pages: Optional[List[Dict]] = None,
) -> Dict:
    """
    Tier 2: OCR each page of a logical unit into the known column grid, then
    stitch all pages into a single markdown pipe-table.

    ONE image_to_data call per page (AC-LFE-6 — one Tesseract pass per page).
    Cell text is derived by filtering the resulting word dictionary by bbox
    intersection with the cell region.

    For table units:
        - Schema-page: detect header row (first row band with no numeric tokens).
          Emit header once.
        - Continuation pages: skip header detection. Append data rows directly.
        - Stitch: concatenate pages in reading order (page ASC, row_band_idx ASC).

    For prose units:
        - Concatenate stored OCR text (from ocr_pages) across page breaks as
          plain paragraph text. No new Tesseract pass (AC-LFE-6 compliance).
        - ocr_pages: per-page stored OCR text fetched at Step 0 in the use case.
          Each dict: {"page_number": int, "text": str} (dual-key fallback applied).
        - If ocr_pages is None or all pages have empty text, returns
          stitched_markdown="" with _prose_no_text=True for observability.

    Args:
        unit:          Logical unit dict from DocumentMap.units.
        zones_by_page: Dict[page_number → PageZones] from Tier 1.
        pdf_path:      Absolute path to PDF.
        tmp_dir:       Temporary directory for intermediate PNGs.
        ocr_pages:     Optional list of stored per-page OCR dicts (prose path only).

    Returns:
        UnitOcrResult dict:
        {
            "unit_id":         "<uuid>",
            "page_numbers":    [3, 4, 5, 6],
            "stitched_markdown": "| col_0 | col_1 | ...",
            "row_count":       42,
            "page_row_spans":  [{"page": 3, "row_start": 0, "row_end": 14}, ...],
            "rows_for_gate":   [{"code": str, "label": str, "values": [...], "page": N}, ...],
            "_prose_no_text":  True   # (prose units only, when all pages blank)
        }
    """
    try:
        import pytesseract  # type: ignore
        from pdf2image import convert_from_path  # type: ignore
    except ImportError as exc:
        raise RuntimeError(f"ocr_unit: missing dependency: {exc}")

    unit_id = unit.get("unit_id", str(uuid.uuid4()))
    pages_in_unit: List[int] = unit.get("pages", [])
    unit_page_type: str = unit.get("page_type", "table")

    if not pages_in_unit:
        return _empty_unit_result(unit_id, [])

    # ------------------------------------------------------------------
    # Prose units: concatenate stored OCR text (no new Tesseract pass)
    # Tier 2 for prose = no table structure, just text concatenation.
    #
    # RISK-1 mitigation: dual-key fallback on "text" / "text_content"
    # matches the existing pattern in _eval_push_stage3 (L881-882).
    # ------------------------------------------------------------------
    if unit_page_type != "table":
        prose_lines: List[str] = []

        # Build a lookup from page_number → text from the stored OCR list
        ocr_page_map: Dict[int, str] = {}
        if ocr_pages:
            for page_rec in ocr_pages:
                page_num_key = page_rec.get("page_number") or page_rec.get("page_no")
                if page_num_key is None:
                    continue
                # Dual-key fallback: "text" is canonical; "text_content" is legacy alias
                page_text: str = page_rec.get("text") or page_rec.get("text_content") or ""
                ocr_page_map[int(page_num_key)] = page_text

        for page_num in sorted(pages_in_unit):
            page_text = ocr_page_map.get(page_num, "").strip()
            if page_text:
                prose_lines.append(page_text)

        all_blank = len(prose_lines) == 0
        stitched = "\n".join(prose_lines)
        non_empty_line_count = sum(1 for line in stitched.splitlines() if line.strip())

        result: Dict = {
            "unit_id": unit_id,
            "page_numbers": pages_in_unit,
            "stitched_markdown": stitched,
            "row_count": non_empty_line_count,
            "page_row_spans": [],
            "rows_for_gate": [],
        }
        if all_blank:
            result["_prose_no_text"] = True
        return result

    # ------------------------------------------------------------------
    # Table units: OCR into the column grid, then stitch
    # ------------------------------------------------------------------
    schema_page_num = unit.get("schema_page", pages_in_unit[0])
    all_header_cells: List[str] = []
    all_data_rows: List[List[str]] = []
    page_row_spans: List[Dict] = []
    rows_for_gate: List[Dict] = []
    current_row_idx = 0
    col_count = 0

    for page_num in sorted(pages_in_unit):
        page_zones_entry = zones_by_page.get(page_num)
        if page_zones_entry is None:
            logger.warning("ocr_unit: no zone data for page %d — skipping", page_num)
            continue

        zones = page_zones_entry.get("zones", {})
        column_gutters: List[Dict] = zones.get("column_gutters", [])
        row_bands: List[Dict] = zones.get("row_bands", [])
        header_band: Dict = zones.get("header_band", {"y_min": 0, "y_max": 0})
        footer_band: Dict = zones.get("footer_band", {"y_min": 99999, "y_max": 99999})

        is_schema = (page_num == schema_page_num)

        if not column_gutters or not row_bands:
            logger.debug(
                "ocr_unit: page %d has no column_gutters or row_bands — skipping",
                page_num,
            )
            continue

        # Set col_count from first page with column data
        if col_count == 0:
            col_count = len(column_gutters)

        # Rasterize page at 200 DPI for OCR
        try:
            images = convert_from_path(
                pdf_path,
                dpi=200,
                first_page=page_num,
                last_page=page_num,
                fmt="png",
            )
            if not images:
                logger.warning("ocr_unit: no image for page %d", page_num)
                continue
            page_img = images[0]
        except Exception as exc:
            logger.warning("ocr_unit: rasterize failed for page %d: %s", page_num, exc)
            continue

        try:
            img_width, img_height = page_img.size

            # ONE Tesseract pass per page (AC-LFE-6).
            # BPE-DEV-5: call via _tesseract_image_to_data wrapper which
            # retries up to MAX_TESSERACT_RETRIES times on SIGTERM / load spike.
            try:
                ocr_data = _tesseract_image_to_data(
                    page_img=page_img,
                    lang="vie+eng",
                    config="--psm 6",
                )
            except Exception as exc:
                logger.warning(
                    "ocr_unit: Tesseract failed for page %d after %d attempts: %s — skipping page",
                    page_num,
                    MAX_TESSERACT_RETRIES + 1,
                    exc,
                )
                page_img.close()
                continue

            # Build word records from OCR data
            word_records = _build_word_records(ocr_data)

            # Skip header row detection if this is a continuation page
            page_rows: List[List[str]] = []

            row_span_start = current_row_idx

            for band_idx, band in enumerate(row_bands):
                band_y_min = band.get("y_min", 0)
                band_y_max = band.get("y_max", img_height)

                # Classify as header row (first band on schema-page with no numeric content)
                is_header_band = (
                    is_schema
                    and band_idx == 0
                    and not _band_has_numeric_content(word_records, band_y_min, band_y_max)
                )

                # Extract cell text for each column in this row band
                row_cells: List[str] = []
                for col in column_gutters:
                    col_x_min = col.get("x_min", 0)
                    col_x_max = col.get("x_max", img_width)
                    cell_text = _extract_cell_text(
                        word_records=word_records,
                        x_min=col_x_min,
                        x_max=col_x_max,
                        y_min=band_y_min,
                        y_max=band_y_max,
                    )
                    row_cells.append(cell_text)

                if is_header_band:
                    if not all_header_cells:
                        all_header_cells = row_cells
                else:
                    # Data row
                    if any(c.strip() for c in row_cells):
                        page_rows.append(row_cells)

                        # Build rows_for_gate entry from TEXT columns only
                        # (gutter columns are whitespace separators — skip them).
                        # Mapping for text columns (non-gutter, in order):
                        #   text_col_0 → label  (leftmost: contains descriptive text + code)
                        #   text_col_1+ → values (remaining columns: monetary amounts)
                        # Note: code extraction is omitted — code values may be embedded
                        # within the label column in scrambled OCR order. Treating the
                        # full leftmost text column as "label" ensures _has_label() fires
                        # correctly when there is real textual content in that column.
                        code_val: Optional[str] = None  # No code extraction in layout-first path
                        label_val: Optional[str] = None
                        value_cells: List[Optional[str]] = []
                        text_col_idx = 0

                        for c_idx, cell in enumerate(row_cells):
                            col_meta = column_gutters[c_idx] if c_idx < len(column_gutters) else {}
                            if col_meta.get("is_gutter", False):
                                continue  # Skip whitespace separator columns
                            if text_col_idx == 0:
                                label_val = cell.strip() or None
                            else:
                                value_cells.append(cell.strip() or None)
                            text_col_idx += 1

                        rows_for_gate.append({
                            "code": code_val,
                            "label": label_val,
                            "values": value_cells,
                            "page": page_num,
                        })

            all_data_rows.extend(page_rows)

            row_span_end = current_row_idx + len(page_rows) - 1
            if page_rows:
                page_row_spans.append({
                    "page": page_num,
                    "row_start": row_span_start,
                    "row_end": row_span_end,
                })
                current_row_idx += len(page_rows)

        finally:
            page_img.close()

    # ------------------------------------------------------------------
    # Stitch into markdown pipe-table
    # ------------------------------------------------------------------
    if not col_count and all_data_rows:
        col_count = max(len(r) for r in all_data_rows)
    if not col_count and all_header_cells:
        col_count = len(all_header_cells)

    if col_count == 0:
        return _empty_unit_result(unit_id, pages_in_unit)

    # Pad/truncate rows to uniform column count
    if not all_header_cells:
        all_header_cells = [f"col_{i}" for i in range(col_count)]

    header_cells = (all_header_cells + [""] * col_count)[:col_count]
    data_rows_padded = [
        (row + [""] * col_count)[:col_count]
        for row in all_data_rows
    ]

    # Build GFM pipe-table
    header_line = "| " + " | ".join(header_cells) + " |"
    separator_line = "| " + " | ".join(["---"] * col_count) + " |"
    data_lines = [
        "| " + " | ".join(row) + " |"
        for row in data_rows_padded
    ]
    stitched = "\n".join([header_line, separator_line] + data_lines)

    return {
        "unit_id": unit_id,
        "page_numbers": pages_in_unit,
        "stitched_markdown": stitched,
        "row_count": len(all_data_rows),
        "page_row_spans": page_row_spans,
        "rows_for_gate": rows_for_gate,
    }


def _build_word_records(ocr_data: Dict) -> List[Dict]:
    """
    Convert pytesseract image_to_data output dict to a list of word record dicts.

    Filters out words with conf <= 0 or empty text.

    Returns: [{text, left, top, width, height, conf}, ...]
    """
    records: List[Dict] = []
    n = len(ocr_data.get("text", []))
    for i in range(n):
        text = str(ocr_data["text"][i]).strip()
        conf = int(ocr_data["conf"][i])
        if not text or conf <= 0:
            continue
        records.append({
            "text": text,
            "left": int(ocr_data["left"][i]),
            "top": int(ocr_data["top"][i]),
            "width": int(ocr_data["width"][i]),
            "height": int(ocr_data["height"][i]),
            "conf": conf,
        })
    return records


def _band_has_numeric_content(
    word_records: List[Dict],
    y_min: int,
    y_max: int,
) -> bool:
    """
    Return True if any word in the given y-band contains a numeric value token.

    Used to detect header rows (no numeric content = column-name row).
    AC-0: uses _VALUE_TOKEN_RE (generic financial number pattern).
    """
    for w in word_records:
        top = w.get("top", 0)
        bottom = top + w.get("height", 0)
        # Word overlaps with band
        if top < y_max and bottom > y_min:
            if _VALUE_TOKEN_RE.match(w.get("text", "")):
                return True
    return False


def _extract_cell_text(
    word_records: List[Dict],
    x_min: int,
    x_max: int,
    y_min: int,
    y_max: int,
) -> str:
    """
    Extract and concatenate OCR text from words that fall within the cell region.

    A word is included if its center x falls within [x_min, x_max] AND
    its center y falls within [y_min, y_max].

    Sorts matched words by (top, left) for natural reading order.

    AC-0: positional filtering only — no BCTC semantic matching.
    """
    cell_words: List[Dict] = []
    for w in word_records:
        left = w.get("left", 0)
        top = w.get("top", 0)
        w_width = w.get("width", 0)
        w_height = w.get("height", 0)
        center_x = left + w_width // 2
        center_y = top + w_height // 2
        if x_min <= center_x <= x_max and y_min <= center_y <= y_max:
            cell_words.append(w)

    if not cell_words:
        return ""

    # Sort by (top, left) for reading order
    cell_words.sort(key=lambda w: (w.get("top", 0), w.get("left", 0)))
    return " ".join(w.get("text", "") for w in cell_words).strip()


def _empty_unit_result(unit_id: str, page_numbers: List[int]) -> Dict:
    """Return an empty UnitOcrResult for units with no extractable content."""
    return {
        "unit_id": unit_id,
        "page_numbers": page_numbers,
        "stitched_markdown": "",
        "row_count": 0,
        "page_row_spans": [],
        "rows_for_gate": [],
    }

