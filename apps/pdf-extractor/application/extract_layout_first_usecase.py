"""
application/extract_layout_first_usecase.py — LF-EXTRACT

ExtractLayoutFirstUseCase: Tier 0→1→2→3 layout-first extraction orchestrator.

Replaces the per-page column-guessing algorithm of ExtractMdTablesUseCase with
the document-structure-first pipeline:

    Tier 0 — Document map: group pages into logical units by geometric fingerprint.
             Reads stored OCR text from pdf_extracted_text (CHEAP — no new Tesseract).
             Uses low-DPI (50 DPI) PIL rasters for projection profiles.

    Tier 1 — Per-page layout zoning: header/footer bands + column gutter detection.
             Continuation pages INHERIT the schema-page column schema.
             This is the NAMED FIX for the FPT Q1 page-5 missing-header scramble.

    Tier 2 — OCR into known grid + cross-page stitch:
             image_to_data psm 6 (ONE call per page, 200 DPI).
             Rows ordered by (page, Y). One markdown table per logical unit.

    Tier 3 — Per-unit invariant gate:
             balance identity / codes monotonic / no orphan rows.
             Failed units stored with quarantined=1 (not silently dropped).

    Push — LayoutFirstPushClientPort → POST /api/push-bctc-layout on mcp-server.

AC-0 compliance: ZERO BCTC semantic strings in any zone-boundary or column-grid
    decision path. Geometry is the spine. Anchors are hints in metadata only.

Application layer rules (DDD):
    - Imports ONLY from domain/ (ports) and the standard library.
    - ZERO imports from infrastructure/, interface/ — all concrete adapters are
      injected at the composition root (main.py).
    - No HTTP or DB knowledge here — only orchestration via port calls.

Ports injected:
    - LayoutFirstPushClientPort   (concrete: infrastructure.layout_first_push_client)
    - OcrPagesFetchClientPort     (concrete: infrastructure.ocr_text_fetch_client)

The PDF rasterization (pdf2image) and Tesseract calls are handled by the
infrastructure-layer functions imported via the composition root injection
(build_document_map, zone_page, ocr_unit imported from infra at call sites —
see note below).

NOTE on infra function injection:
    The heavy processing functions (build_document_map, zone_page, ocr_unit) are
    infrastructure-layer functions living in generic_md_table_extractor.py.
    They are injected via a simple callable protocol — the composition root
    (main.py) passes them as callables. This keeps the application layer clean
    of infrastructure imports per DDD rules.

Privacy: local pdf2image + local Tesseract only. No external API. No cloud OCR.
    Temporary files cleaned up automatically.

Host safety:
    - ONE Tesseract pass per page (Tier 2 only).
    - Tier 0 uses only PIL pixel ops + stored OCR text (no new Tesseract calls).
    - Sequential single-doc processing. No parallel extraction.
    - run_bctc_batch_sweep NOT invoked anywhere in this path.
"""

from __future__ import annotations

import logging
import uuid
from typing import Any, Callable, Dict, List, Optional, Tuple

from domain.modules.financial_reports.ports import (
    LayoutFirstPushClientPort,
    OcrPagesFetchClientPort,
)
from domain.primitives.layout_invariants.primitive import (
    check_balance_identity,
    check_codes_monotonic,
    check_no_orphan_rows,
)

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Use case
# ---------------------------------------------------------------------------


class ExtractLayoutFirstUseCase:
    """
    Application use case: Tier 0-3 layout-first extraction → push to mcp-server.

    Separate from ExtractTablesUseCase and ExtractMdTablesUseCase:
        - Different trigger (POST /extract-layout-first)
        - Different infra ports (LayoutFirstPushClientPort)
        - Different mcp-server tables (bctc_layout_units + bctc_page_zones)
        - Zero collision with bctc_table_rows or bctc_balance_checks

    Wiring (composition root — main.py):
        layout_push_client = LayoutFirstPushClient(mcp_server_url=cfg.mcp_server_url)
        ocr_pages_client   = OcrTextFetchClient(mcp_server_url=cfg.mcp_server_url)
        extract_lf_usecase = ExtractLayoutFirstUseCase(
            push_client=layout_push_client,
            ocr_pages_client=ocr_pages_client,
            build_document_map_fn=build_document_map,   # from infra
            zone_page_fn=zone_page,                      # from infra
            ocr_unit_fn=ocr_unit,                        # from infra
        )
    """

    def __init__(
        self,
        push_client: LayoutFirstPushClientPort,
        ocr_pages_client: OcrPagesFetchClientPort,
        build_document_map_fn: Callable,
        zone_page_fn: Callable,
        ocr_unit_fn: Callable,
    ) -> None:
        """
        Args:
            push_client:           Injected LayoutFirstPushClientPort.
            ocr_pages_client:      Injected OcrPagesFetchClientPort.
            build_document_map_fn: Callable: build_document_map(pages, pdf_path) → DocumentMap.
                                   Injected from infrastructure layer (DDD: no direct import).
            zone_page_fn:          Callable: zone_page(page_img, unit_schema) → PageZones.
                                   Injected from infrastructure layer.
            ocr_unit_fn:           Callable: ocr_unit(unit, zones_by_page, pdf_path) → UnitOcrResult.
                                   Injected from infrastructure layer.
        """
        self._push_client = push_client
        self._ocr_pages_client = ocr_pages_client
        self._build_document_map = build_document_map_fn
        self._zone_page = zone_page_fn
        self._ocr_unit = ocr_unit_fn

    async def execute(
        self,
        report_id: str,
        pdf_path: str,
    ) -> Dict:
        """
        Run the full Tier 0→1→2→3 pipeline for one document and push results.

        AC-LFE-9 (sequential): one document per call. No batch. No concurrency.

        Args:
            report_id: UUID string matching financial_reports.id on mcp-server.
            pdf_path:  Absolute path to the PDF file on disk.

        Returns:
            dict with keys:
                units_total     (int): Total logical units found.
                units_passing   (int): Units passing all three invariants.
                units_quarantined (int): Units with quarantined=1.
                pushed          (bool): True when push_layout succeeded.
        """
        logger.info(
            "ExtractLayoutFirstUseCase.execute: report_id=%s pdf_path=%s",
            report_id,
            pdf_path,
        )

        # ------------------------------------------------------------------
        # Step 0: Fetch stored per-page OCR text (Tier 0 input — CHEAP)
        # No new Tesseract calls. Uses already-stored pdf_extracted_text.
        # ------------------------------------------------------------------
        ocr_pages: List[Dict] = []
        try:
            ocr_pages = await self._ocr_pages_client.fetch_ocr_pages(report_id)
            logger.info(
                "ExtractLayoutFirstUseCase: fetched %d stored OCR pages for report_id=%s",
                len(ocr_pages),
                report_id,
            )
        except Exception as exc:
            logger.warning(
                "ExtractLayoutFirstUseCase: OCR pages fetch failed: %s — "
                "proceeding with empty page records (geometry-only path)",
                exc,
            )

        # ------------------------------------------------------------------
        # Step 1 (Tier 0): Build document map — geometric fingerprint grouping
        # Inputs: stored OCR text pages + low-DPI PIL rasters (50 DPI).
        # No Tesseract calls in this tier (AC-LFE-6).
        # ------------------------------------------------------------------
        try:
            document_map: Dict = self._build_document_map(
                pages=ocr_pages,
                pdf_path=pdf_path,
            )
        except Exception as exc:
            logger.error(
                "ExtractLayoutFirstUseCase: Tier 0 document map failed: %s — aborting",
                exc,
            )
            return {"units_total": 0, "units_passing": 0, "units_quarantined": 0, "pushed": False}

        units_in_map: List[Dict] = document_map.get("units", [])
        logger.info(
            "ExtractLayoutFirstUseCase: Tier 0 complete — %d logical units found",
            len(units_in_map),
        )

        # ------------------------------------------------------------------
        # Step 2 (Tier 1): Zone each page in each unit.
        # Schema-page: detect column gutters from 200-DPI raster.
        # Continuation pages: INHERIT schema-page's column schema (the named fix).
        # ------------------------------------------------------------------
        zones_by_page: Dict[int, Dict] = {}
        page_zones_output: List[Dict] = []

        try:
            from pdf2image import convert_from_path  # type: ignore
        except ImportError:
            logger.error(
                "ExtractLayoutFirstUseCase: pdf2image not installed — cannot rasterize pages"
            )
            return {"units_total": 0, "units_passing": 0, "units_quarantined": 0, "pushed": False}

        import tempfile
        import os

        with tempfile.TemporaryDirectory(prefix="pdf_lf_tier1_") as tmp_dir:
            for unit in units_in_map:
                unit_id = unit.get("unit_id", str(uuid.uuid4()))
                schema_page_num = unit.get("schema_page")
                pages_in_unit: List[int] = unit.get("pages", [])
                unit_page_type = unit.get("page_type", "table")

                # Compute unit boundary (is the last page of this unit a boundary?)
                # The last page of a unit has unit_boundary_after_page=True
                unit_pages_set = set(pages_in_unit)

                # For table units: derive column schema from schema-page first
                schema_column_gutters: Optional[List[Dict]] = None
                schema_row_pitch: Optional[float] = None

                for page_num in sorted(pages_in_unit):
                    is_schema = (page_num == schema_page_num)
                    is_last_page = (page_num == max(pages_in_unit)) if pages_in_unit else False

                    # Rasterize at 200 DPI for Tier 1 zone detection
                    page_img = self._rasterize_page_200dpi(
                        pdf_path=pdf_path,
                        page_num=page_num,
                        tmp_dir=tmp_dir,
                        convert_from_path=convert_from_path,
                    )

                    if page_img is None:
                        logger.warning(
                            "ExtractLayoutFirstUseCase: could not rasterize page %d — "
                            "marking as blank",
                            page_num,
                        )
                        page_zones = self._make_blank_page_zones(
                            page_num=page_num,
                            unit_id=unit_id,
                            is_schema_page=is_schema,
                            schema_inherited_from_page=None if is_schema else schema_page_num,
                        )
                    else:
                        # Run Tier 1 zone detection (or schema inheritance)
                        inherited_schema = None
                        if not is_schema and schema_column_gutters is not None:
                            inherited_schema = {
                                "column_gutters": schema_column_gutters,
                                "row_pitch": schema_row_pitch,
                            }

                        try:
                            page_zones = self._zone_page(
                                page_img=page_img,
                                unit_schema=inherited_schema,
                                page_num=page_num,
                                unit_id=unit_id,
                                unit_page_type=unit_page_type,
                                is_schema_page=is_schema,
                                schema_inherited_from_page=(
                                    None if is_schema else schema_page_num
                                ),
                            )
                        except Exception as exc:
                            logger.warning(
                                "ExtractLayoutFirstUseCase: zone_page failed for page %d: %s",
                                page_num,
                                exc,
                            )
                            page_zones = self._make_blank_page_zones(
                                page_num=page_num,
                                unit_id=unit_id,
                                is_schema_page=is_schema,
                                schema_inherited_from_page=None if is_schema else schema_page_num,
                            )

                        # Capture schema-page column gutters for inheritance
                        if is_schema and page_zones.get("zones"):
                            schema_column_gutters = (
                                page_zones["zones"].get("column_gutters") or []
                            )
                            row_bands = page_zones["zones"].get("row_bands") or []
                            if len(row_bands) >= 2:
                                pitches = [
                                    row_bands[i + 1]["y_min"] - row_bands[i]["y_min"]
                                    for i in range(len(row_bands) - 1)
                                ]
                                schema_row_pitch = sum(pitches) / len(pitches) if pitches else None

                        # Release PIL image
                        try:
                            page_img.close()
                        except Exception:
                            pass

                    # Set unit_boundary_after_page on the last page of each unit
                    if page_zones.get("zones"):
                        page_zones["zones"]["unit_boundary_after_page"] = is_last_page

                    zones_by_page[page_num] = page_zones
                    page_zones_output.append(page_zones)

        logger.info(
            "ExtractLayoutFirstUseCase: Tier 1 complete — %d page zones produced",
            len(page_zones_output),
        )

        # ------------------------------------------------------------------
        # Step 3 (Tier 2): OCR into known grid + cross-page stitch
        # ONE image_to_data call per page (AC-LFE-6).
        # ------------------------------------------------------------------
        unit_ocr_results: List[Dict] = []

        with tempfile.TemporaryDirectory(prefix="pdf_lf_tier2_") as tmp_dir:
            for unit in units_in_map:
                unit_id = unit.get("unit_id", str(uuid.uuid4()))
                unit_page_type = unit.get("page_type", "table")

                try:
                    ocr_result: Dict = self._ocr_unit(
                        unit=unit,
                        zones_by_page=zones_by_page,
                        pdf_path=pdf_path,
                        tmp_dir=tmp_dir,
                    )
                    unit_ocr_results.append(ocr_result)
                except Exception as exc:
                    logger.warning(
                        "ExtractLayoutFirstUseCase: ocr_unit failed for unit_id=%s: %s — "
                        "storing as quarantined",
                        unit_id,
                        exc,
                    )
                    unit_ocr_results.append({
                        "unit_id": unit_id,
                        "page_numbers": unit.get("pages", []),
                        "stitched_markdown": "",
                        "row_count": 0,
                        "page_row_spans": [],
                        "rows_for_gate": [],
                        "_ocr_error": str(exc),
                    })

        logger.info(
            "ExtractLayoutFirstUseCase: Tier 2 complete — %d unit OCR results",
            len(unit_ocr_results),
        )

        # ------------------------------------------------------------------
        # Step 4 (Tier 3): Per-unit invariant gate
        # Three invariants: balance identity / codes monotonic / no orphan rows.
        # Failing units: quarantined=1 (stored, not dropped).
        # ------------------------------------------------------------------
        units_output: List[Dict] = []
        quarantine_breakdown = {
            "balance_identity_fail": 0,
            "codes_not_monotonic": 0,
            "orphan_rows": 0,
        }

        for ocr_result in unit_ocr_results:
            unit_id = ocr_result.get("unit_id", str(uuid.uuid4()))
            rows_for_gate: List[Dict] = ocr_result.get("rows_for_gate", [])
            page_row_spans: List[Dict] = ocr_result.get("page_row_spans", [])

            # Check if OCR itself errored
            if ocr_result.get("_ocr_error"):
                units_output.append({
                    "unit_id": unit_id,
                    "stitched_markdown": ocr_result.get("stitched_markdown", ""),
                    "row_count": ocr_result.get("row_count", 0),
                    "quarantined": True,
                    "quarantine_reason": f"ocr_error: {ocr_result['_ocr_error'][:100]}",
                    "page_row_spans": page_row_spans,
                })
                continue

            # Run three invariants (pure domain functions — no I/O)
            quarantine_reasons: List[str] = []

            bal_pass, bal_reason = check_balance_identity(rows_for_gate)
            if not bal_pass:
                quarantine_reasons.append(bal_reason)
                quarantine_breakdown["balance_identity_fail"] += 1

            mono_pass, mono_reason = check_codes_monotonic(rows_for_gate)
            if not mono_pass:
                quarantine_reasons.append(mono_reason)
                quarantine_breakdown["codes_not_monotonic"] += 1

            orphan_pass, orphan_reason = check_no_orphan_rows(rows_for_gate)
            if not orphan_pass:
                quarantine_reasons.append(orphan_reason)
                quarantine_breakdown["orphan_rows"] += 1

            is_quarantined = len(quarantine_reasons) > 0
            quarantine_reason_str = "; ".join(quarantine_reasons) if quarantine_reasons else None

            units_output.append({
                "unit_id": unit_id,
                "stitched_markdown": ocr_result.get("stitched_markdown", ""),
                "row_count": ocr_result.get("row_count", 0),
                "quarantined": is_quarantined,
                "quarantine_reason": quarantine_reason_str,
                "page_row_spans": page_row_spans,
            })

        units_total = len(units_output)
        units_quarantined = sum(1 for u in units_output if u["quarantined"])
        units_passing = units_total - units_quarantined

        pass_rate_report = {
            "units_total": units_total,
            "units_passing": units_passing,
            "units_quarantined": units_quarantined,
            "quarantine_breakdown": quarantine_breakdown,
        }

        logger.info(
            "ExtractLayoutFirstUseCase: Tier 3 complete — "
            "total=%d passing=%d quarantined=%d",
            units_total,
            units_passing,
            units_quarantined,
        )

        # ------------------------------------------------------------------
        # Step 5: Push to mcp-server → POST /api/push-bctc-layout
        # ------------------------------------------------------------------
        pushed = False
        try:
            push_result = await self._push_client.push_layout(
                report_id=report_id,
                document_map={
                    "total_pages": document_map.get("total_pages", 0),
                    "units": [
                        {
                            "unit_id": u.get("unit_id"),
                            "schema_page": u.get("schema_page"),
                            "pages": u.get("pages", []),
                            "page_type": u.get("page_type", "table"),
                        }
                        for u in units_in_map
                    ],
                },
                units=units_output,
                page_zones=page_zones_output,
                pass_rate_report=pass_rate_report,
            )
            pushed = bool(push_result.get("ok", False))
            logger.info(
                "ExtractLayoutFirstUseCase: push OK — units_stored=%s pages_stored=%s",
                push_result.get("units_stored"),
                push_result.get("pages_stored"),
            )
        except Exception as exc:
            logger.error(
                "ExtractLayoutFirstUseCase: push failed: %s (results not stored)", exc
            )

        logger.info(
            "ExtractLayoutFirstUseCase.execute DONE: report_id=%s "
            "units_total=%d units_passing=%d units_quarantined=%d pushed=%s",
            report_id,
            units_total,
            units_passing,
            units_quarantined,
            pushed,
        )

        return {
            "units_total": units_total,
            "units_passing": units_passing,
            "units_quarantined": units_quarantined,
            "pushed": pushed,
        }

    # ------------------------------------------------------------------
    # Private helpers
    # ------------------------------------------------------------------

    def _rasterize_page_200dpi(
        self,
        pdf_path: str,
        page_num: int,
        tmp_dir: str,
        convert_from_path: Any,
    ):
        """
        Rasterize a single PDF page to a PIL Image at 200 DPI.

        Returns PIL Image (the caller must .close() it after use) or None on failure.
        Sequential — never called in parallel (AC-LFE-9 host safety).
        """
        import os

        try:
            images = convert_from_path(
                pdf_path,
                dpi=200,
                first_page=page_num,
                last_page=page_num,
                fmt="png",
            )
            if not images:
                return None
            img = images[0]
            # Save to temp file so path-based callers can use it; also keep PIL Image
            png_path = os.path.join(tmp_dir, f"page_{page_num:04d}_200dpi.png")
            img.save(png_path, format="PNG")
            return img
        except Exception as exc:
            logger.warning(
                "ExtractLayoutFirstUseCase._rasterize_page_200dpi: page %d failed: %s",
                page_num,
                exc,
            )
            return None

    @staticmethod
    def _make_blank_page_zones(
        page_num: int,
        unit_id: str,
        is_schema_page: bool,
        schema_inherited_from_page: Optional[int],
    ) -> Dict:
        """Return a minimal blank-page PageZones dict when rasterization fails."""
        return {
            "page_number": page_num,
            "unit_id": unit_id,
            "page_type": "blank",
            "is_schema_page": is_schema_page,
            "is_continuation_page": not is_schema_page,
            "schema_inherited_from_page": schema_inherited_from_page,
            "zones": {
                "image_width_px": 0,
                "image_height_px": 0,
                "image_dpi": 200,
                "coordinate_origin": "top-left",
                "coordinate_unit": "px",
                "header_band": {"y_min": 0, "y_max": 0},
                "footer_band": {"y_min": 0, "y_max": 0},
                "column_gutters": [],
                "row_bands": [],
                "unit_hints": [],
                "unit_boundary_after_page": False,
            },
        }
