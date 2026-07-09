# size-justification: thin re-export shim (not a size-cap file — exempt by design).
# FACTORY-PDF-split-generic-md-table (docs/architecture-briefs/
# 2026-06-15-maintainability-factory-audit.md): the former 4111L god-file is now
# fully extracted into infrastructure/generic_md_table/ (constants, markdown_emit,
# grid_cleanup, ordinal_grid, document_map, page_zoning, unit_ocr, extractor). This
# shim exists so every existing caller/test import path keeps working unchanged:
# callers (main.py composition root) inject build_document_map / zone_page /
# ocr_unit as module-level callables into ExtractLayoutFirstUseCase — the shim
# re-exports those (and every other public + test-surface private symbol) from this
# module with zero import-cycle risk (thin, no logic, imports only from the
# sub-package — never the reverse).
"""
infrastructure/generic_md_table_extractor.py — MD-EXTRACT-9 (thin shim)

GenericMdTableExtractor: number-token-2D generic table detector + markdown emitter.
Implements GenericMdTableExtractorPort (domain/modules/financial_reports/ports.py).

This module is now a thin re-export shim over infrastructure/generic_md_table/:
    constants.py      — shared regex/numeric constants.
    markdown_emit.py   — ocr_text_to_markdown, _emit_markdown_table.
    grid_cleanup.py    — grid post-processing + legacy MD-EXTRACT-1..4 clustering.
    ordinal_grid.py    — MD-EXTRACT-4..9 ordinal reconstruction pipeline.
    document_map.py    — LF-EXTRACT Tier 0 (build_document_map).
    page_zoning.py     — LF-EXTRACT Tier 1 (zone_page).
    unit_ocr.py        — LF-EXTRACT Tier 2 (ocr_unit).
    extractor.py       — GenericMdTableExtractor (the public class).

Full algorithm writeup (Steps A-G, why MD-EXTRACT-1..5 failed and MD-EXTRACT-6
defeats drift>gap, dead-code notes) lives in infrastructure/generic_md_table/
extractor.py's module docstring — read there for algorithm details.

DDD layer: infrastructure (calls Tesseract subprocess, reads PIL Image — impure).
    Fence-A prohibits imports from the application or interface layers (still true
    of every sub-module — this shim only imports from infrastructure.*).

See docs/architecture-briefs/2026-06-15-maintainability-factory-audit.md for the
split approach (FACTORY-PDF-split-generic-md-table).
"""

from __future__ import annotations

# Infra-to-infra import: reuse module-level helpers (not class methods — safe).
# Re-exported for backward compatibility (the original god-file imported both
# names at module level; _norm is unused directly but kept for import parity).
from infrastructure.text_table_extractor import _norm, _is_recognized_section_header  # noqa: F401

from infrastructure.generic_md_table.constants import (  # noqa: F401 (re-export parity)
    _ROW_GAP_FACTOR,
    _SAME_LINE_FACTOR,
    _ROW_PITCH_MULTIPLIER,
    _SECTION_GAP_FACTOR,
    _COL_GAP_FACTOR,
    _MIN_INTER_COLUMN_GAP_PX,
    _LEFT_EDGE_BIN_FACTOR,
    _MIN_WORD_CONF,
    _NUMERIC_RE,
    _MONEY_GROUP_RE,
    _MIN_MONEY_GROUPS,
    _CODE_LIKE_RE,
    _MIN_CODE_HITS,
    _MIN_MONEY_THIN,
    _DATE_HEADER_RE,
    _NUMBER_TOKEN_RE,
    SAME_LINE_TOL,
    _CODE_TOKEN_RE,
    _VALUE_TOKEN_RE,
    _COL_ASSIGN_MAX_DIST_FACTOR,
    SKIP_GAP_FACTOR,
    _MIN_WORD_CONF_ORDINAL,
    LABEL_BAND_FACTOR,
    PURE_CODE_COL_THRESHOLD,
    DENSE_COL_THRESHOLD,
    _LABEL_LINE_GAP_PX,
    _LABEL_HEADER_MARGIN_PX,
    _TIER0_DPI,
    _GUTTER_DARK_FRACTION,
    _INK_BBOX_MIN_FRACTION,
    _GUTTER_POSITION_TOLERANCE,
    _ROW_PITCH_CHANGE_TOLERANCE,
    _MIN_GUTTER_WIDTH_PX,
    _MIN_TEXT_COL_WIDTH_PX,
    _MAX_INTER_GUTTER_GAP_PX,
    _GUTTER_DARK_FRACTION_DENSE,
    _MIN_TEXT_COL_WIDTH_PX_50DPI,
    _GUTTER_DARK_FRACTION_50DPI,
    _HEADER_BAND_FRACTION,
    _FOOTER_BAND_FRACTION,
    _ROW_BAND_DARKNESS_THRESHOLD,
    _TABLE_PAGE_MIN_MONEY_GROUPS,
    _ACCOUNT_CODE_MIN_FOR_TABLE,
    _DATE_HEADER_MIN_FOR_TABLE,
    _ALLOW_PROSE_IN_TABLE_UNIT,
    _TABLE_MIN_GUTTER_COUNT,
    _TITLE_BAND_SCAN_LINES,
    _TITLE_BAND_MIN_LEN,
    _TITLE_BAND_MAX_LEN,
    _CONTINUATION_MARKERS,
    _BCTC_MONEY_GROUP_RE,
    MAX_TESSERACT_RETRIES,
    _TESSERACT_RETRY_SLEEP_S,
)
from infrastructure.generic_md_table.markdown_emit import (  # noqa: F401 (re-export parity)
    ocr_text_to_markdown,
    _emit_markdown_table,
)
from infrastructure.generic_md_table.grid_cleanup import (  # noqa: F401 (re-export parity)
    _median,
    _filter_words,
    _cluster_rows,
    _cluster_rows_by_gap,
    _collapse_empty_columns,
    _detect_column_anchors,
    _assign_columns,
    _detect_header_rows,
    _is_data_table,
    _strip_leading_header_bands,
    _coalesce_label_columns,
)
from infrastructure.generic_md_table.ordinal_grid import (  # noqa: F401 (re-export parity)
    _classify_tokens,
    _cluster_number_rows,
    _estimate_inter_row_pitch,
    _cluster_number_rows_adaptive,
    _attach_labels,
    _build_grid_from_number_rows,
    _detect_column_anchors_from_tokens,
    _assign_tokens_to_columns,
    _insert_skip_slots,
    _build_ordinal_grid,
    _attach_labels_ordinal,
    _cluster_text_into_label_lines,
    _exclude_pre_data_label_lines,
    _attach_labels_by_rank,
    _find_first_value_row_top,
    _exclude_header_tokens,
    _identify_pure_code_columns,
    _detect_table_regions,
)
from infrastructure.generic_md_table.document_map import (  # noqa: F401 (re-export parity)
    build_document_map,
    _compute_page_fingerprint_50dpi,
    _blank_fingerprint,
    _estimate_row_pitch,
    _extract_unit_hints,
    _is_title_band,
    _find_ink_bbox,
    _fingerprints_continuous,
)
from infrastructure.generic_md_table.page_zoning import (  # noqa: F401 (re-export parity)
    zone_page,
    _scan_gutter_ranges,
    _build_column_regions,
    _detect_column_gutters_200dpi,
    _detect_row_bands,
)
from infrastructure.generic_md_table.unit_ocr import (  # noqa: F401 (re-export parity)
    _tesseract_image_to_data,
    ocr_unit,
    _build_word_records,
    _band_has_numeric_content,
    _extract_cell_text,
    _empty_unit_result,
)
from infrastructure.generic_md_table.extractor import GenericMdTableExtractor  # noqa: F401 (re-export parity)
