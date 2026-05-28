"""
Unit tests — domain/eval_detectors.py (BCTC-EVAL-SUBSTRATE)

Tests for stage 1-3 detector pure functions:
    eval_stage1_rasterize()
    eval_stage2_layout_detect()
    eval_stage3_ocr()

All tests use synthetic in-memory fixtures. ZERO real OCR, ZERO real images,
ZERO DB access, ZERO HTTP calls.

Covers:
    - Happy path: all gates pass → green
    - Hard gate failures → red
    - Soft warnings only → yellow
    - Deliberate-violation smoke for stage 3 (§15 G2 requirement):
        ASCII-only text (no diacritics) → vn_diacritic_ratio < 0.30 → red
    - First-run SHA stability (stage 1)
    - Stage 3 anchor phrase scenarios (both/one/none missing)
    - Stage 2 abandon rate and median conf gates

DDD compliance: imports only from domain layer, never from infrastructure.
"""

from __future__ import annotations

import json
import os
import sys
import tempfile

import pytest

# Allow direct import without package install
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))

from domain.eval_detectors import (
    DETECTOR_VERSION,
    SCHEMA_VERSION,
    _vn_diacritic_ratio,
    _is_vn_diacritic_char,
    eval_stage1_rasterize,
    eval_stage2_layout_detect,
    eval_stage3_ocr,
)


# ---------------------------------------------------------------------------
# Fixtures / helpers
# ---------------------------------------------------------------------------

CANONICAL_THRESHOLDS = {
    "schema_version": "1",
    "detector_version": "v1",
    "stages": {
        "1_RASTERIZE": {
            "page_count_tolerance": 0,
            "sha_stability_required": True,
        },
        "2_LAYOUT_DETECT": {
            "golden_table_count_exact": True,
            "abandon_rate_max": 0.20,
            "median_conf_min": 0.70,
        },
        "3_OCR": {
            "vn_diacritic_ratio_min": 0.30,
            "numeric_ratio_in_tables_min": 0.40,
            "required_anchor_phrases": [
                "TỔNG CỘNG TÀI SẢN",
                "LỢI NHUẬN SAU THUẾ",
            ],
        },
    },
    "status_rules": {
        "red": "any hard gate fails",
        "yellow": "soft warnings only",
        "green": "all hard gates pass, no warnings",
    },
}


def _make_layout_unit(
    unit_id: str = "u1",
    page_type: str = "table",
    pages: list = None,
    quarantined: bool = False,
    median_conf: float = None,
) -> dict:
    return {
        "unit_id": unit_id,
        "page_type": page_type,
        "pages": pages or [1],
        "quarantined": quarantined,
        "median_conf": median_conf,
    }


# ---------------------------------------------------------------------------
# Shared invariants — every result must carry schema_version and detector_version
# ---------------------------------------------------------------------------

class TestResultInvariants:
    def test_stage1_carries_schema_version(self, tmp_path):
        result = eval_stage1_rasterize(
            pdf_path="/fake/a.pdf",
            page_pngs_dir=str(tmp_path),
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["schema_version"] == SCHEMA_VERSION
        assert result["detector_version"] == DETECTOR_VERSION
        assert result["stage_no"] == 1
        assert result["stage_name"] == "RASTERIZE"

    def test_stage2_carries_schema_version(self):
        result = eval_stage2_layout_detect(
            layout_units=[_make_layout_unit(median_conf=0.85)],
            golden_table_count=None,
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["schema_version"] == SCHEMA_VERSION
        assert result["detector_version"] == DETECTOR_VERSION
        assert result["stage_no"] == 2
        assert result["stage_name"] == "LAYOUT_DETECT"

    def test_stage3_carries_schema_version(self):
        text = "TỔNG CỘNG TÀI SẢN và LỢI NHUẬN SAU THUẾ là thông tin tài chính"
        result = eval_stage3_ocr(
            ocr_text_per_page={1: text},
            layout_units=[_make_layout_unit(pages=[1])],
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["schema_version"] == SCHEMA_VERSION
        assert result["detector_version"] == DETECTOR_VERSION
        assert result["stage_no"] == 3
        assert result["stage_name"] == "OCR"


# ---------------------------------------------------------------------------
# Stage 1 — RASTERIZE
# ---------------------------------------------------------------------------

class TestStage1Rasterize:
    def test_empty_dir_first_run_yellow(self, tmp_path):
        """
        Empty dir, no sha_cache_path → no PNGs found → sha_stable=None → yellow warning.
        Status is yellow (not green) because the detector warns about empty PNG dir.
        A first-run with actual PNGs would be green (see test_sha_stability_first_run_stores_then_passes).
        """
        result = eval_stage1_rasterize(
            pdf_path="/fake/a.pdf",
            page_pngs_dir=str(tmp_path),
            thresholds=CANONICAL_THRESHOLDS,
            pdf_page_count=None,
            sha_cache_path=None,
        )
        # Empty dir → no PNGs → warns → yellow (sha_stable=None)
        assert result["status"] == "yellow"
        assert result["metrics_json"]["sha_stable"] is None

    def test_page_count_match_green(self, tmp_path):
        """PDF page count matches rasterized count → green."""
        (tmp_path / "page_0001.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
        result = eval_stage1_rasterize(
            pdf_path="/fake/a.pdf",
            page_pngs_dir=str(tmp_path),
            thresholds=CANONICAL_THRESHOLDS,
            pdf_page_count=1,
            sha_cache_path=None,
        )
        assert result["status"] == "green"
        assert result["metrics_json"]["page_count_rasterized"] == 1
        assert result["metrics_json"]["page_count_pdf"] == 1
        assert len(result["gate_failures_json"]) == 0

    def test_page_count_mismatch_red(self, tmp_path):
        """Rasterized count differs from PDF page count → page_count_mismatch gate → red."""
        (tmp_path / "page_0001.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\x00" * 100)
        result = eval_stage1_rasterize(
            pdf_path="/fake/a.pdf",
            page_pngs_dir=str(tmp_path),
            thresholds=CANONICAL_THRESHOLDS,
            pdf_page_count=5,  # expect 5, got 1
            sha_cache_path=None,
        )
        assert result["status"] == "red"
        assert any(gf["gate_id"] == "page_count_mismatch" for gf in result["gate_failures_json"])

    def test_sha_stability_first_run_stores_then_passes(self, tmp_path):
        """First run with sha_cache_path: stores SHA, status green."""
        png_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        (tmp_path / "page_0001.png").write_bytes(png_data)
        sha_cache = str(tmp_path / "sha.json")

        result = eval_stage1_rasterize(
            pdf_path="/fake/a.pdf",
            page_pngs_dir=str(tmp_path),
            thresholds=CANONICAL_THRESHOLDS,
            pdf_page_count=1,
            sha_cache_path=sha_cache,
        )
        assert result["status"] == "green"
        assert result["metrics_json"]["sha_first_run"] is True
        # Cache file should now exist
        assert os.path.exists(sha_cache)

    def test_sha_stability_second_run_same_file_green(self, tmp_path):
        """Second run with same PNG → SHA matches → green."""
        png_data = b"\x89PNG\r\n\x1a\n" + b"\x00" * 100
        (tmp_path / "page_0001.png").write_bytes(png_data)
        sha_cache = str(tmp_path / "sha.json")

        # First run — stores SHA
        eval_stage1_rasterize(
            pdf_path="/fake/a.pdf",
            page_pngs_dir=str(tmp_path),
            thresholds=CANONICAL_THRESHOLDS,
            pdf_page_count=1,
            sha_cache_path=sha_cache,
        )
        # Second run — same PNG
        result = eval_stage1_rasterize(
            pdf_path="/fake/a.pdf",
            page_pngs_dir=str(tmp_path),
            thresholds=CANONICAL_THRESHOLDS,
            pdf_page_count=1,
            sha_cache_path=sha_cache,
        )
        assert result["status"] == "green"
        assert result["metrics_json"]["sha_stable"] is True

    def test_sha_unstable_red(self, tmp_path):
        """SHA changes between runs (different PNG content) → sha_unstable gate → red."""
        sha_cache = str(tmp_path / "sha.json")

        # First run — content A
        (tmp_path / "page_0001.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\xAA" * 100)
        eval_stage1_rasterize(
            pdf_path="/fake/a.pdf",
            page_pngs_dir=str(tmp_path),
            thresholds=CANONICAL_THRESHOLDS,
            sha_cache_path=sha_cache,
        )
        # Second run — content B (different)
        (tmp_path / "page_0001.png").write_bytes(b"\x89PNG\r\n\x1a\n" + b"\xBB" * 100)
        result = eval_stage1_rasterize(
            pdf_path="/fake/a.pdf",
            page_pngs_dir=str(tmp_path),
            thresholds=CANONICAL_THRESHOLDS,
            sha_cache_path=sha_cache,
        )
        assert result["status"] == "red"
        assert any(gf["gate_id"] == "sha_unstable" for gf in result["gate_failures_json"])

    def test_none_thresholds_fallback_to_defaults(self, tmp_path):
        """Passing thresholds=None falls back to built-in defaults without error."""
        result = eval_stage1_rasterize(
            pdf_path="/fake/a.pdf",
            page_pngs_dir=str(tmp_path),
            thresholds=None,
        )
        assert result["stage_no"] == 1
        assert result["status"] in ("green", "yellow", "red")

    def test_metrics_have_provenance(self, tmp_path):
        """metrics_json always carries provenance dict with parser_path."""
        result = eval_stage1_rasterize(
            pdf_path="/fake/a.pdf",
            page_pngs_dir=str(tmp_path),
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert "provenance" in result["metrics_json"]
        assert "parser_path" in result["metrics_json"]["provenance"]


# ---------------------------------------------------------------------------
# Stage 2 — LAYOUT_DETECT
# ---------------------------------------------------------------------------

class TestStage2LayoutDetect:
    def test_green_all_gates_pass(self):
        """All units passing, count matches golden, good conf → green."""
        units = [
            _make_layout_unit("u1", "table", [1, 2], quarantined=False, median_conf=0.92),
            _make_layout_unit("u2", "table", [3], quarantined=False, median_conf=0.88),
        ]
        result = eval_stage2_layout_detect(
            layout_units=units,
            golden_table_count=2,
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["status"] == "green"
        assert result["metrics_json"]["detected_table_count"] == 2
        assert result["metrics_json"]["abandon_rate"] == 0.0
        assert len(result["gate_failures_json"]) == 0

    def test_golden_count_mismatch_red(self):
        """Detected table count differs from golden → red."""
        units = [_make_layout_unit("u1", "table", [1], median_conf=0.85)]
        result = eval_stage2_layout_detect(
            layout_units=units,
            golden_table_count=5,  # expect 5, got 1
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["status"] == "red"
        assert any(gf["gate_id"] == "table_count_mismatch" for gf in result["gate_failures_json"])

    def test_abandon_rate_exceeded_red(self):
        """Quarantined > 20% of units → abandon_rate_exceeded gate → red."""
        units = [
            _make_layout_unit("u1", "table", [1], quarantined=True, median_conf=0.85),
            _make_layout_unit("u2", "table", [2], quarantined=True, median_conf=0.85),
            _make_layout_unit("u3", "table", [3], quarantined=False, median_conf=0.85),
            _make_layout_unit("u4", "table", [4], quarantined=False, median_conf=0.85),
        ]
        # 2/4 = 50% quarantined → exceeds 20% max
        result = eval_stage2_layout_detect(
            layout_units=units,
            golden_table_count=None,
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["status"] == "red"
        assert any(gf["gate_id"] == "abandon_rate_exceeded" for gf in result["gate_failures_json"])

    def test_median_conf_below_threshold_red(self):
        """Median confidence < 0.70 → red."""
        units = [
            _make_layout_unit("u1", "table", [1], median_conf=0.50),
            _make_layout_unit("u2", "table", [2], median_conf=0.55),
        ]
        result = eval_stage2_layout_detect(
            layout_units=units,
            golden_table_count=None,
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["status"] == "red"
        assert any(
            gf["gate_id"] == "median_conf_below_threshold"
            for gf in result["gate_failures_json"]
        )

    def test_no_confidence_values_yellow(self):
        """No confidence values on any unit → soft warning → yellow."""
        units = [_make_layout_unit("u1", "table", [1], median_conf=None)]
        result = eval_stage2_layout_detect(
            layout_units=units,
            golden_table_count=None,
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["status"] == "yellow"
        assert result["metrics_json"]["median_conf"] is None

    def test_no_golden_skips_count_gate(self):
        """golden_table_count=None skips exact count gate."""
        units = [_make_layout_unit("u1", "table", [1], median_conf=0.85)]
        result = eval_stage2_layout_detect(
            layout_units=units,
            golden_table_count=None,
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert not any(
            gf["gate_id"] == "table_count_mismatch" for gf in result["gate_failures_json"]
        )

    def test_empty_units_green(self):
        """No units → no quarantine possible, abandon_rate=0.0 → green."""
        result = eval_stage2_layout_detect(
            layout_units=[],
            golden_table_count=None,
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["status"] == "yellow"  # no confidence values → yellow warning
        assert result["metrics_json"]["abandon_rate"] == 0.0

    def test_metrics_have_provenance(self):
        units = [_make_layout_unit(median_conf=0.85)]
        result = eval_stage2_layout_detect(
            layout_units=units,
            golden_table_count=None,
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert "provenance" in result["metrics_json"]
        assert "parser_path" in result["metrics_json"]["provenance"]

    def test_gate_failures_carry_provenance(self):
        """Each gate_failure entry must include a provenance key."""
        units = [_make_layout_unit("u1", "table", [1], median_conf=0.50)]
        result = eval_stage2_layout_detect(
            layout_units=units,
            golden_table_count=None,
            thresholds=CANONICAL_THRESHOLDS,
        )
        for gf in result["gate_failures_json"]:
            assert "provenance" in gf, f"gate_failure {gf['gate_id']} missing provenance"


# ---------------------------------------------------------------------------
# Stage 3 — OCR
# ---------------------------------------------------------------------------

class TestStage3Ocr:
    def test_green_healthy_vn_text(self):
        """
        Healthy VN text with anchors, good diacritic ratio, and sufficient numeric content → green.

        Uses two pages:
          page 1: VN prose (drives diacritic ratio >= 0.30 and anchor phrases)
          page 2: numeric table data (drives numeric_ratio_in_tables >= 0.40)
        """
        # Page 1: VN prose with anchor phrases and enough diacritics
        vn_prose = (
            "Tổng tài sản ngắn hạn bao gồm tiền mặt và các khoản tương đương tiền. "
            "Tiền và các khoản tương đương tiền cuối kỳ đạt mức ổn định. "
            "Phải thu ngắn hạn khách hàng tăng trưởng so với đầu kỳ. "
            "Hàng tồn kho được đánh giá theo phương pháp bình quân gia quyền. "
            "Tài sản cố định hữu hình được trình bày theo giá gốc trừ khấu hao. "
            "Đầu tư tài chính dài hạn bao gồm các khoản đầu tư vào công ty liên kết. "
            "Nợ phải trả ngắn hạn bao gồm vay ngắn hạn và phải trả nhà cung cấp. "
            "Vốn chủ sở hữu bao gồm vốn góp của chủ sở hữu và lợi nhuận giữ lại. "
            "TỔNG CỘNG TÀI SẢN bằng tổng tài sản ngắn hạn và tài sản dài hạn. "
            "LỢI NHUẬN SAU THUẾ là lợi nhuận trước thuế trừ chi phí thuế thu nhập. "
        )
        # Page 2: numeric table data (layout unit covers this page)
        table_nums = (
            "100 200 300 400 500 1,234 5,678 9,012 34,567 890,123 1,234,567 "
            "200 400 600 800 1,000 2,000 3,000 4,000 5,000 6,000 "
        )
        units = [_make_layout_unit("u1", "table", [2])]
        result = eval_stage3_ocr(
            ocr_text_per_page={1: vn_prose, 2: table_nums},
            layout_units=units,
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["status"] == "green", (
            f"Expected green, got {result['status']}. "
            f"vn_ratio={result['metrics_json']['vn_diacritic_ratio']}, "
            f"num_ratio={result['metrics_json']['numeric_ratio_in_tables']}, "
            f"gate_failures={result['gate_failures_json']}"
        )
        assert result["metrics_json"]["vn_diacritic_ratio"] >= 0.30
        assert result["metrics_json"]["numeric_ratio_in_tables"] >= 0.40
        assert "TỔNG CỘNG TÀI SẢN" in result["metrics_json"]["anchor_phrases_found"]
        assert "LỢI NHUẬN SAU THUẾ" in result["metrics_json"]["anchor_phrases_found"]
        assert len(result["metrics_json"]["anchor_phrases_missing"]) == 0

    # -----------------------------------------------------------------------
    # DELIBERATE-VIOLATION SMOKE TEST — Stage 3 (brief §15 G2 mandatory)
    # -----------------------------------------------------------------------
    def test_deliberate_violation_ascii_only_text_red(self):
        """
        G2 deliberate-violation smoke test (brief §15):
        Inject ASCII-only OCR text (no Vietnamese diacritics).
        Detector MUST emit vn_diacritic_ratio < 0.30 and status = "red".
        """
        # Pure ASCII — no Vietnamese characters at all
        ascii_only_text = (
            "Total assets of the company are reported herein. "
            "Net profit after tax is the bottom line figure. "
            "Revenue: 1,234,567 and Cost: 987,654 USD. "
            "Balance sheet items A B C D E F G H I J K L M N O P Q R S T U V W X Y Z."
        )
        units = [_make_layout_unit("u1", "table", [1])]
        result = eval_stage3_ocr(
            ocr_text_per_page={1: ascii_only_text},
            layout_units=units,
            thresholds=CANONICAL_THRESHOLDS,
        )

        # Verify: ratio must be below threshold
        assert result["metrics_json"]["vn_diacritic_ratio"] < 0.30, (
            f"Expected vn_diacritic_ratio < 0.30 for ASCII-only text, "
            f"got {result['metrics_json']['vn_diacritic_ratio']}"
        )

        # Verify: status must be red
        assert result["status"] == "red", (
            f"Expected status='red' for ASCII-only injection, got '{result['status']}'"
        )

        # Verify: the specific gate failure is present
        assert any(
            gf["gate_id"] == "vn_diacritic_ratio_below_threshold"
            for gf in result["gate_failures_json"]
        ), "Expected gate_id 'vn_diacritic_ratio_below_threshold' in gate_failures_json"

    def test_one_anchor_missing_yellow(self):
        """One anchor phrase missing → soft warning → yellow (if ratio OK)."""
        # Good diacritic ratio, but only one anchor present
        text = (
            "TỔNG CỘNG TÀI SẢN là tổng các khoản mục tài sản của công ty niêm yết. "
            "Doanh thu thuần đạt mức tăng trưởng tốt trong quý này. "
            "Số liệu: 1,234,567 và 9,876,543 tỷ đồng được ghi nhận đầy đủ."
        )
        units = [_make_layout_unit("u1", "table", [1])]
        result = eval_stage3_ocr(
            ocr_text_per_page={1: text},
            layout_units=units,
            thresholds=CANONICAL_THRESHOLDS,
        )
        # LỢI NHUẬN SAU THUẾ is missing → yellow warning if ratio is OK
        assert "LỢI NHUẬN SAU THUẾ" in result["metrics_json"]["anchor_phrases_missing"]
        # Status depends on numeric ratio too; it should be yellow or red
        assert result["status"] in ("yellow", "red")

    def test_both_anchors_missing_red(self):
        """Both anchor phrases missing → all_anchor_phrases_missing gate → red."""
        # Good Vietnamese text but no anchor phrases
        text = (
            "Báo cáo tài chính quý bốn năm hai nghìn hai mươi lăm của công ty. "
            "Doanh thu thuần đạt mức tăng trưởng tốt trong năm tài chính này. "
            "Các khoản mục được trình bày theo chuẩn mực kế toán Việt Nam hiện hành."
        )
        units = [_make_layout_unit("u1", "table", [1])]
        result = eval_stage3_ocr(
            ocr_text_per_page={1: text},
            layout_units=units,
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["status"] == "red"
        assert any(
            gf["gate_id"] == "all_anchor_phrases_missing"
            for gf in result["gate_failures_json"]
        )

    def test_empty_text_red(self):
        """Empty OCR text → diacritic_ratio=0.0 and both anchors missing → red."""
        result = eval_stage3_ocr(
            ocr_text_per_page={1: ""},
            layout_units=[],
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["status"] == "red"
        assert result["metrics_json"]["vn_diacritic_ratio"] == 0.0

    def test_multiple_pages_aggregate(self):
        """Diacritic ratio is computed across all pages combined.

        Uses VN prose on page 1 + numeric table on page 2 to satisfy both gates.
        """
        # Page 1: VN prose with both anchors and enough diacritics
        page1 = (
            "Tổng tài sản ngắn hạn bao gồm tiền mặt và các khoản tương đương tiền. "
            "Tiền và các khoản tương đương tiền cuối kỳ đạt mức ổn định. "
            "Phải thu ngắn hạn khách hàng tăng trưởng so với đầu kỳ. "
            "Hàng tồn kho được đánh giá theo phương pháp bình quân gia quyền. "
            "Tài sản cố định hữu hình được trình bày theo giá gốc trừ khấu hao. "
            "TỔNG CỘNG TÀI SẢN bằng tổng tài sản ngắn hạn và tài sản dài hạn. "
        )
        # Page 2: anchor 2 + numeric table data (layout unit covers this page)
        page2 = (
            "LỢI NHUẬN SAU THUẾ là lợi nhuận trước thuế trừ chi phí thuế thu nhập. "
            "100 200 300 400 500 1,234 5,678 9,012 34,567 890,123 1,234,567 "
            "200 400 600 800 1,000 2,000 3,000 4,000 5,000 6,000 "
        )
        # Table unit covers page 2 (where the numbers are)
        units = [_make_layout_unit("u1", "table", [2])]
        result = eval_stage3_ocr(
            ocr_text_per_page={1: page1, 2: page2},
            layout_units=units,
            thresholds=CANONICAL_THRESHOLDS,
        )
        assert result["status"] == "green", (
            f"Expected green, got {result['status']}. "
            f"vn_ratio={result['metrics_json']['vn_diacritic_ratio']}, "
            f"num_ratio={result['metrics_json']['numeric_ratio_in_tables']}, "
            f"gate_failures={result['gate_failures_json']}"
        )
        assert "TỔNG CỘNG TÀI SẢN" in result["metrics_json"]["anchor_phrases_found"]
        assert "LỢI NHUẬN SAU THUẾ" in result["metrics_json"]["anchor_phrases_found"]

    def test_metrics_shape_matches_brief_s4(self):
        """metrics_json keys must match brief §4 stage 3 shape exactly."""
        text = "TỔNG CỘNG TÀI SẢN và LỢI NHUẬN SAU THUẾ doanh thu thuần công ty việt nam"
        result = eval_stage3_ocr(
            ocr_text_per_page={1: text},
            layout_units=[],
            thresholds=CANONICAL_THRESHOLDS,
        )
        m = result["metrics_json"]
        assert "vn_diacritic_ratio" in m
        assert "numeric_ratio_in_tables" in m
        assert "anchor_phrases_found" in m
        assert "anchor_phrases_missing" in m
        assert "provenance" in m

    def test_provenance_carries_parser_path(self):
        """Every gate_failure provenance must include parser_path."""
        result = eval_stage3_ocr(
            ocr_text_per_page={1: "ASCII only text with no VN chars at all here"},
            layout_units=[],
            thresholds=CANONICAL_THRESHOLDS,
        )
        for gf in result["gate_failures_json"]:
            assert "provenance" in gf
            assert "parser_path" in gf["provenance"]


# ---------------------------------------------------------------------------
# VN diacritic ratio helper
# ---------------------------------------------------------------------------

class TestVnDiacriticRatio:
    def test_pure_ascii_ratio_zero(self):
        """Pure ASCII text has zero diacritic ratio."""
        ratio, d, t = _vn_diacritic_ratio("Hello World ABC")
        assert ratio == 0.0

    def test_vn_text_ratio_in_range(self):
        """Vietnamese financial text should yield ratio 0.30–0.50."""
        text = (
            "Tổng cộng tài sản của công ty niêm yết trên thị trường chứng khoán "
            "Việt Nam đạt mức tăng trưởng ổn định trong năm tài chính vừa qua."
        )
        ratio, d, t = _vn_diacritic_ratio(text)
        assert 0.25 <= ratio <= 0.70, f"Unexpected ratio {ratio}"

    def test_empty_string_ratio_zero(self):
        ratio, d, t = _vn_diacritic_ratio("")
        assert ratio == 0.0
        assert d == 0
        assert t == 0

    def test_only_diacritics_ratio_one(self):
        """Text of all diacritic chars → ratio 1.0."""
        ratio, d, t = _vn_diacritic_ratio("ăâđêôơư")
        assert ratio == 1.0

    def test_is_vn_diacritic_char_recognises_tone_marks(self):
        """Chars like 'ắ' (a + breve + acute) must be recognised."""
        assert _is_vn_diacritic_char("ắ")
        assert _is_vn_diacritic_char("ộ")
        assert _is_vn_diacritic_char("ề")
        assert not _is_vn_diacritic_char("a")
        assert not _is_vn_diacritic_char("z")
        assert not _is_vn_diacritic_char("1")


# ---------------------------------------------------------------------------
# Unit tests — EvalPushClient (mocked HTTP)
# ---------------------------------------------------------------------------

class TestEvalPushClient:
    """
    Unit tests for infrastructure/eval_push_client.py.

    Uses unittest.mock to avoid real HTTP calls.
    Verifies RAISE on HTTP 500 (fail-loud-first contract).
    """

    def _make_stage_result(self) -> dict:
        return {
            "schema_version": "1",
            "stage_no": 3,
            "stage_name": "OCR",
            "status": "green",
            "metrics_json": {"vn_diacritic_ratio": 0.38},
            "gate_failures_json": [],
            "golden_diff_json": {},
            "detector_version": "v1",
        }

    def test_push_stage_raises_on_http_500(self):
        """EvalPushClient.push_stage MUST raise on HTTP 500 — no bare except."""
        import asyncio
        import urllib.error
        from unittest.mock import MagicMock, patch

        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
        from infrastructure.eval_push_client import EvalPushClient

        client = EvalPushClient(mcp_server_url="http://localhost:3000")

        # Simulate HTTP 500 from urlopen
        http_error = urllib.error.HTTPError(
            url="http://localhost:3000/api/bctc-eval/push-stage",
            code=500,
            msg="Internal Server Error",
            hdrs=None,
            fp=None,
        )

        with patch("urllib.request.urlopen", side_effect=http_error):
            with pytest.raises(urllib.error.HTTPError) as exc_info:
                asyncio.get_event_loop().run_until_complete(
                    client.push_stage(
                        report_id="test-report-id",
                        stage_result=self._make_stage_result(),
                    )
                )
            assert exc_info.value.code == 500

    def test_push_stage_success_returns_ok_dict(self):
        """EvalPushClient.push_stage returns parsed JSON response on success."""
        import asyncio
        import io
        from unittest.mock import MagicMock, patch

        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
        from infrastructure.eval_push_client import EvalPushClient

        client = EvalPushClient(mcp_server_url="http://localhost:3000")

        mock_response = MagicMock()
        mock_response.read.return_value = json.dumps({"ok": True}).encode("utf-8")
        mock_response.__enter__ = lambda s: s
        mock_response.__exit__ = MagicMock(return_value=False)

        with patch("urllib.request.urlopen", return_value=mock_response):
            result = asyncio.get_event_loop().run_until_complete(
                client.push_stage(
                    report_id="test-report-id",
                    stage_result=self._make_stage_result(),
                )
            )
        assert result["ok"] is True

    def test_push_stage_raises_on_url_error(self):
        """EvalPushClient.push_stage MUST raise on network failure."""
        import asyncio
        import urllib.error
        from unittest.mock import patch

        sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", ".."))
        from infrastructure.eval_push_client import EvalPushClient

        client = EvalPushClient(mcp_server_url="http://localhost:3000")

        url_error = urllib.error.URLError(reason="Connection refused")
        with patch("urllib.request.urlopen", side_effect=url_error):
            with pytest.raises(urllib.error.URLError):
                asyncio.get_event_loop().run_until_complete(
                    client.push_stage(
                        report_id="test-report-id",
                        stage_result=self._make_stage_result(),
                    )
                )
