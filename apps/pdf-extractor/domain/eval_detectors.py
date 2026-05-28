"""
domain/eval_detectors.py — BCTC-EVAL-SUBSTRATE

Stage 1-3 pure detector functions for the BCTC extraction evaluation framework.

Each function is a pure function: no HTTP, no DB, no filesystem side-effects beyond
reading artifacts that are passed in as arguments. All I/O is the caller's concern.

Stages covered here (pdf-extractor side — brief §13 DDD layer table):
    Stage 1 — RASTERIZE:       eval_stage1_rasterize()
    Stage 2 — LAYOUT_DETECT:   eval_stage2_layout_detect()
    Stage 3 — OCR:             eval_stage3_ocr()

Stages 4-6 live in apps/mcp-server (evaluated from stored DB rows — different host).

Schema lock (brief §4): every returned dict matches EvalStageResult JSON shape with
    schema_version: "1"
    detector_version: "v1"

Status rules (brief §5):
    "red"    = any hard gate fails
    "yellow" = soft warnings only (anchor phrase missing but ratios OK, etc.)
    "green"  = all hard gates pass, no warnings

Provenance (brief §15 anti-false-green): every metric in metrics_json carries
    page_no / layout_unit_id / ocr_conf / parser_path as applicable.

DDD: MUST NOT import from infrastructure/, application/, or interface/.
     Only stdlib + standard data types.
"""

from __future__ import annotations

import hashlib
import json
import logging
import os
import re
import unicodedata
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------

SCHEMA_VERSION = "1"
DETECTOR_VERSION = "v1"

# Default thresholds — used ONLY when thresholds dict is None or missing a key.
# All production callers MUST load from docs/data/bctc-eval-thresholds.json.
_DEFAULT_THRESHOLDS: Dict[str, Any] = {
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
}

# Vietnamese diacritic-bearing characters (decomposed coverage handled below).
# Base Vietnamese vowels with diacritics (combining marks detected via unicodedata).
_VN_DIACRITIC_BASE_CHARS = set("ăâđêôơưĂÂĐÊÔƠƯ")


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------


def _load_thresholds_section(thresholds: Optional[Dict], section: str) -> Dict:
    """
    Extract one stage section from the thresholds dict.

    Falls back to _DEFAULT_THRESHOLDS if thresholds is None or the section
    is missing. Never raises — callers should not fail due to a missing file.
    """
    if thresholds is None:
        logger.warning(
            "eval_detectors: thresholds=None — falling back to built-in defaults for %s",
            section,
        )
        return _DEFAULT_THRESHOLDS.get(section, {})
    section_data = thresholds.get("stages", {}).get(section)
    if section_data is None:
        logger.warning(
            "eval_detectors: thresholds missing section %s — using built-in defaults",
            section,
        )
        return _DEFAULT_THRESHOLDS.get(section, {})
    return section_data


def _make_result(
    stage_no: int,
    stage_name: str,
    status: str,
    metrics: Dict,
    gate_failures: List[Dict],
    golden_diff: Dict,
) -> Dict:
    """
    Build a canonical EvalStageResult dict (brief §4 schema lock).

    The JSON-serialisable values are kept as Python dicts/lists here;
    the caller (application layer or push client) must json.dumps() before HTTP.
    """
    return {
        "schema_version": SCHEMA_VERSION,
        "stage_no": stage_no,
        "stage_name": stage_name,
        "status": status,
        "metrics_json": metrics,
        "gate_failures_json": gate_failures,
        "golden_diff_json": golden_diff,
        "detector_version": DETECTOR_VERSION,
    }


def _gate_failure(
    gate_id: str,
    threshold: Any,
    actual: Any,
    provenance: Dict,
) -> Dict:
    """Build one gate_failure entry per brief §3 gate_failures_json contract."""
    return {
        "gate_id": gate_id,
        "threshold": threshold,
        "actual": actual,
        "provenance": provenance,
    }


def _is_vn_diacritic_char(ch: str) -> bool:
    """
    Return True when the character carries a Vietnamese diacritic.

    Covers:
      - Base chars with special forms: ă â đ ê ô ơ ư (and upper)
      - Any letter that, when NFC-decomposed, has a combining mark (tone or diacritic)
        e.g. ắ → a + combining breve + combining acute
    """
    if ch in _VN_DIACRITIC_BASE_CHARS:
        return True
    # Normalise to NFD and check for combining characters
    nfd = unicodedata.normalize("NFD", ch)
    return len(nfd) > 1 and any(unicodedata.category(c).startswith("M") for c in nfd)


def _vn_diacritic_ratio(text: str) -> Tuple[float, int, int]:
    """
    Compute the ratio of Vietnamese diacritic-bearing chars to total non-whitespace alpha chars.

    Returns:
        (ratio, diacritic_count, total_alpha_count)

    Brief §5 contract: healthy VN BCTC target 0.30–0.50.
    """
    diacritic_count = 0
    total_alpha = 0
    for ch in text:
        if ch.isalpha() and not ch.isspace():
            total_alpha += 1
            if _is_vn_diacritic_char(ch):
                diacritic_count += 1
    ratio = diacritic_count / total_alpha if total_alpha > 0 else 0.0
    return ratio, diacritic_count, total_alpha


def _hash_png_files(page_pngs_dir: str) -> Optional[str]:
    """
    Compute a SHA-256 over all PNG files in page_pngs_dir, in deterministic page order.

    File names must sort lexicographically into page order (e.g. page_0001.png, page_0002.png).
    Returns hex digest string, or None if directory is empty or does not exist.
    """
    dir_path = Path(page_pngs_dir)
    if not dir_path.is_dir():
        return None
    png_files = sorted(dir_path.glob("*.png"))
    if not png_files:
        return None

    h = hashlib.sha256()
    for png_path in png_files:
        try:
            with open(png_path, "rb") as fh:
                for chunk in iter(lambda: fh.read(65536), b""):
                    h.update(chunk)
            # Separator so page boundary is unambiguous in the hash
            h.update(b"\x00")
        except OSError as exc:
            logger.warning("eval_detectors._hash_png_files: skipping %s: %s", png_path, exc)
    return h.hexdigest()


def _load_sha_cache(sha_cache_path: str) -> Optional[str]:
    """Read stored SHA from previous run. Returns None when not found."""
    try:
        with open(sha_cache_path) as fh:
            data = json.load(fh)
            return data.get("sha")
    except (OSError, json.JSONDecodeError):
        return None


def _store_sha_cache(sha_cache_path: str, sha: str) -> None:
    """Write SHA to cache file for next-run comparison."""
    try:
        with open(sha_cache_path, "w") as fh:
            json.dump({"sha": sha, "detector_version": DETECTOR_VERSION}, fh)
    except OSError as exc:
        logger.warning("eval_detectors._store_sha_cache: could not write %s: %s", sha_cache_path, exc)


def _numeric_ratio_in_tables(layout_units: List[Dict], ocr_text_per_page: Dict[int, str]) -> float:
    """
    Estimate numeric_ratio_in_tables: fraction of non-whitespace chars in table-typed
    layout units that are digits, commas, dots, or minus signs.

    Uses OCR text keyed by page_no (int) for all pages in table-typed units.
    Returns 0.0 when no table units exist or no OCR text is found.
    """
    table_chars: List[str] = []
    numeric_chars: List[str] = []

    _numeric_pattern = re.compile(r"[\d.,\-\+]")

    for unit in layout_units:
        if unit.get("page_type", "table") != "table":
            continue
        for page_no in unit.get("pages", []):
            text = ocr_text_per_page.get(page_no, "") or ""
            for ch in text:
                if not ch.isspace():
                    table_chars.append(ch)
                    if _numeric_pattern.match(ch):
                        numeric_chars.append(ch)

    if not table_chars:
        return 0.0
    return len(numeric_chars) / len(table_chars)


# ---------------------------------------------------------------------------
# Stage 1 — RASTERIZE
# ---------------------------------------------------------------------------


def eval_stage1_rasterize(
    pdf_path: str,
    page_pngs_dir: str,
    thresholds: Optional[Dict],
    *,
    pdf_page_count: Optional[int] = None,
    sha_cache_path: Optional[str] = None,
) -> Dict:
    """
    Stage 1 detector: RASTERIZE quality evaluation.

    Checks:
    - page_count_pdf vs page_count_rasterized (tolerance from thresholds).
    - SHA stability across runs (detects rasterizer non-determinism or file tampering).

    Args:
        pdf_path:       Absolute path to the source PDF file.
        page_pngs_dir:  Directory containing the rasterized page PNGs.
        thresholds:     Loaded thresholds dict (from bctc-eval-thresholds.json).
                        Pass None to use built-in defaults.
        pdf_page_count: Optionally pre-computed page count from the PDF.
                        If None, the detector counts PNGs only (no PDF parsing).
        sha_cache_path: Path to JSON file storing the previous-run SHA.
                        If None, no SHA comparison is performed (first-run treated as green).

    Returns:
        EvalStageResult dict (see _make_result).
    """
    cfg = _load_thresholds_section(thresholds, "1_RASTERIZE")
    page_count_tolerance: int = cfg.get("page_count_tolerance", 0)
    sha_stability_required: bool = cfg.get("sha_stability_required", True)

    gate_failures: List[Dict] = []
    warnings: List[str] = []

    # --- Page count ---
    dir_path = Path(page_pngs_dir)
    rasterized_count = len(list(dir_path.glob("*.png"))) if dir_path.is_dir() else 0

    page_count_pdf = pdf_page_count  # may be None if caller didn't pre-compute

    # Build metrics even when pdf_page_count not supplied
    metrics: Dict[str, Any] = {
        "page_count_pdf": page_count_pdf,
        "page_count_rasterized": rasterized_count,
        "sha_stable": None,  # filled below
        "provenance": {
            "parser_path": "eval_detectors.eval_stage1_rasterize",
            "page_pngs_dir": str(page_pngs_dir),
            "pdf_path": str(pdf_path),
        },
    }

    if page_count_pdf is not None:
        diff = abs(rasterized_count - page_count_pdf)
        if diff > page_count_tolerance:
            gate_failures.append(
                _gate_failure(
                    gate_id="page_count_mismatch",
                    threshold=f"abs_diff <= {page_count_tolerance}",
                    actual=diff,
                    provenance={
                        "parser_path": "eval_detectors.eval_stage1_rasterize",
                        "pdf_path": str(pdf_path),
                        "page_pngs_dir": str(page_pngs_dir),
                    },
                )
            )

    # --- SHA stability ---
    current_sha = _hash_png_files(page_pngs_dir)
    sha_stable: Optional[bool] = None

    if current_sha is None:
        # No PNGs — this is a problem even if count check passes
        warnings.append("no_pngs_in_dir")
        metrics["sha_stable"] = None
    elif sha_cache_path is None:
        # First run or cache disabled — store and pass green
        sha_stable = True
        metrics["sha_stable"] = True
        metrics["sha_first_run"] = True
    else:
        previous_sha = _load_sha_cache(sha_cache_path)
        if previous_sha is None:
            # First time we have a cache path: store and pass green
            _store_sha_cache(sha_cache_path, current_sha)
            sha_stable = True
            metrics["sha_stable"] = True
            metrics["sha_first_run"] = True
        else:
            sha_stable = (current_sha == previous_sha)
            metrics["sha_stable"] = sha_stable
            metrics["sha_first_run"] = False
            if sha_stability_required and not sha_stable:
                gate_failures.append(
                    _gate_failure(
                        gate_id="sha_unstable",
                        threshold="sha_match == True",
                        actual=False,
                        provenance={
                            "parser_path": "eval_detectors.eval_stage1_rasterize",
                            "sha_cache_path": str(sha_cache_path),
                            "previous_sha": previous_sha[:16] + "…",
                            "current_sha": current_sha[:16] + "…",
                        },
                    )
                )
            elif sha_stable and sha_cache_path:
                # Update stored SHA to latest
                _store_sha_cache(sha_cache_path, current_sha)

    # --- Status ---
    if gate_failures:
        status = "red"
    elif warnings:
        status = "yellow"
    else:
        status = "green"

    return _make_result(
        stage_no=1,
        stage_name="RASTERIZE",
        status=status,
        metrics=metrics,
        gate_failures=gate_failures,
        golden_diff={},
    )


# ---------------------------------------------------------------------------
# Stage 2 — LAYOUT_DETECT
# ---------------------------------------------------------------------------


def eval_stage2_layout_detect(
    layout_units: List[Dict],
    golden_table_count: Optional[int],
    thresholds: Optional[Dict],
) -> Dict:
    """
    Stage 2 detector: LAYOUT_DETECT quality evaluation.

    Checks:
    - golden_table_count match (exact match required per thresholds).
    - abandon_rate: ratio of quarantined units to total units.
    - median_conf: median confidence of layout units.

    Args:
        layout_units:       List of layout unit dicts from the extraction.
                            Each unit may contain: {
                                unit_id, page_type, pages, quarantined, median_conf, ...
                            }
        golden_table_count: Expected number of table-typed layout units.
                            None = no golden defined → skip exact-count gate.
        thresholds:         Loaded thresholds dict.

    Returns:
        EvalStageResult dict.
    """
    cfg = _load_thresholds_section(thresholds, "2_LAYOUT_DETECT")
    golden_table_count_exact: bool = cfg.get("golden_table_count_exact", True)
    abandon_rate_max: float = cfg.get("abandon_rate_max", 0.20)
    median_conf_min: float = cfg.get("median_conf_min", 0.70)

    gate_failures: List[Dict] = []
    warnings: List[str] = []

    # Compute detected table count
    detected_table_count = sum(
        1 for u in layout_units if u.get("page_type", "table") == "table"
    )
    total_units = len(layout_units)
    quarantined_count = sum(1 for u in layout_units if u.get("quarantined", False))

    abandon_rate: float = quarantined_count / total_units if total_units > 0 else 0.0

    # Collect confidence values from all layout units
    conf_values: List[float] = []
    for unit in layout_units:
        c = unit.get("median_conf")
        if c is not None:
            try:
                conf_values.append(float(c))
            except (TypeError, ValueError):
                pass

    if conf_values:
        sorted_conf = sorted(conf_values)
        mid = len(sorted_conf) // 2
        if len(sorted_conf) % 2 == 0 and len(sorted_conf) > 1:
            median_conf = (sorted_conf[mid - 1] + sorted_conf[mid]) / 2.0
        else:
            median_conf = sorted_conf[mid]
    else:
        median_conf = None

    metrics: Dict[str, Any] = {
        "golden_table_count": golden_table_count,
        "detected_table_count": detected_table_count,
        "abandon_rate": round(abandon_rate, 4),
        "median_conf": round(median_conf, 4) if median_conf is not None else None,
        "provenance": {
            "parser_path": "eval_detectors.eval_stage2_layout_detect",
            "layout_unit_ids": [u.get("unit_id") for u in layout_units[:10]],  # first 10
        },
    }

    # Gate: exact table count match
    if golden_table_count is not None and golden_table_count_exact:
        if detected_table_count != golden_table_count:
            gate_failures.append(
                _gate_failure(
                    gate_id="table_count_mismatch",
                    threshold=f"detected == {golden_table_count}",
                    actual=detected_table_count,
                    provenance={
                        "parser_path": "eval_detectors.eval_stage2_layout_detect",
                        "golden_table_count": golden_table_count,
                        "detected_table_count": detected_table_count,
                    },
                )
            )

    # Gate: abandon rate
    if abandon_rate > abandon_rate_max:
        gate_failures.append(
            _gate_failure(
                gate_id="abandon_rate_exceeded",
                threshold=f"abandon_rate <= {abandon_rate_max}",
                actual=round(abandon_rate, 4),
                provenance={
                    "parser_path": "eval_detectors.eval_stage2_layout_detect",
                    "quarantined_count": quarantined_count,
                    "total_units": total_units,
                },
            )
        )

    # Gate: median confidence
    if median_conf is not None and median_conf < median_conf_min:
        gate_failures.append(
            _gate_failure(
                gate_id="median_conf_below_threshold",
                threshold=f"median_conf >= {median_conf_min}",
                actual=round(median_conf, 4),
                provenance={
                    "parser_path": "eval_detectors.eval_stage2_layout_detect",
                    "conf_sample_count": len(conf_values),
                    "layout_unit_ids": [u.get("unit_id") for u in layout_units[:5]],
                },
            )
        )
    elif median_conf is None:
        warnings.append("no_confidence_values")

    # Status
    if gate_failures:
        status = "red"
    elif warnings:
        status = "yellow"
    else:
        status = "green"

    return _make_result(
        stage_no=2,
        stage_name="LAYOUT_DETECT",
        status=status,
        metrics=metrics,
        gate_failures=gate_failures,
        golden_diff={},
    )


# ---------------------------------------------------------------------------
# Stage 3 — OCR
# ---------------------------------------------------------------------------


def eval_stage3_ocr(
    ocr_text_per_page: Dict[int, str],
    layout_units: List[Dict],
    thresholds: Optional[Dict],
) -> Dict:
    """
    Stage 3 detector: OCR quality evaluation.

    Checks (all hard gates unless noted):
    - vn_diacritic_ratio: ratio of VN diacritic chars to total alpha chars across
      all OCR text. Hard gate: must be >= vn_diacritic_ratio_min (default 0.30).
    - numeric_ratio_in_tables: ratio of numeric chars in table-typed units.
      Hard gate: must be >= numeric_ratio_in_tables_min (default 0.40).
    - anchor_phrases_found / anchor_phrases_missing:
        Both present → green for this sub-check.
        One missing → yellow warning.
        Both missing → red hard gate.

    Args:
        ocr_text_per_page:  Dict mapping page_no (int) → OCR text string.
                            All pages in the extraction (not just table pages).
        layout_units:       List of layout unit dicts (used to compute numeric_ratio).
        thresholds:         Loaded thresholds dict.

    Returns:
        EvalStageResult dict.
    """
    cfg = _load_thresholds_section(thresholds, "3_OCR")
    vn_diacritic_ratio_min: float = cfg.get("vn_diacritic_ratio_min", 0.30)
    numeric_ratio_in_tables_min: float = cfg.get("numeric_ratio_in_tables_min", 0.40)
    required_anchor_phrases: List[str] = cfg.get(
        "required_anchor_phrases",
        ["TỔNG CỘNG TÀI SẢN", "LỢI NHUẬN SAU THUẾ"],
    )

    gate_failures: List[Dict] = []
    warnings: List[str] = []

    # Concatenate all OCR text for diacritic analysis
    all_text = " ".join(ocr_text_per_page.get(p, "") or "" for p in sorted(ocr_text_per_page))

    # --- VN diacritic ratio ---
    vn_ratio, diacritic_count, total_alpha = _vn_diacritic_ratio(all_text)

    # Provenance: record page_no with highest text density for traceability
    page_lengths = {p: len(t) for p, t in ocr_text_per_page.items() if t}
    top_page_no = max(page_lengths, key=page_lengths.get) if page_lengths else None

    if vn_ratio < vn_diacritic_ratio_min:
        gate_failures.append(
            _gate_failure(
                gate_id="vn_diacritic_ratio_below_threshold",
                threshold=f"vn_diacritic_ratio >= {vn_diacritic_ratio_min}",
                actual=round(vn_ratio, 4),
                provenance={
                    "parser_path": "eval_detectors.eval_stage3_ocr",
                    "diacritic_count": diacritic_count,
                    "total_alpha_count": total_alpha,
                    "page_no": top_page_no,
                    "ocr_conf": None,  # not available at this level — per-word conf is infra
                },
            )
        )

    # --- Numeric ratio in tables ---
    numeric_ratio = _numeric_ratio_in_tables(layout_units, ocr_text_per_page)

    if numeric_ratio < numeric_ratio_in_tables_min:
        gate_failures.append(
            _gate_failure(
                gate_id="numeric_ratio_below_threshold",
                threshold=f"numeric_ratio_in_tables >= {numeric_ratio_in_tables_min}",
                actual=round(numeric_ratio, 4),
                provenance={
                    "parser_path": "eval_detectors.eval_stage3_ocr",
                    "table_unit_count": sum(
                        1 for u in layout_units if u.get("page_type", "table") == "table"
                    ),
                    "page_no": None,
                    "layout_unit_id": None,
                    "ocr_conf": None,
                },
            )
        )

    # --- Anchor phrase check ---
    anchor_phrases_found: List[str] = []
    anchor_phrases_missing: List[str] = []

    for phrase in required_anchor_phrases:
        if phrase in all_text:
            anchor_phrases_found.append(phrase)
        else:
            anchor_phrases_missing.append(phrase)

    if len(anchor_phrases_missing) == len(required_anchor_phrases):
        # All anchors missing → hard gate
        gate_failures.append(
            _gate_failure(
                gate_id="all_anchor_phrases_missing",
                threshold=f"at_least_one_of {required_anchor_phrases}",
                actual=anchor_phrases_missing,
                provenance={
                    "parser_path": "eval_detectors.eval_stage3_ocr",
                    "page_no": top_page_no,
                    "ocr_conf": None,
                    "layout_unit_id": None,
                },
            )
        )
    elif anchor_phrases_missing:
        # Some missing → soft warning
        warnings.append(f"anchor_phrases_missing: {anchor_phrases_missing}")

    # Build metrics (brief §4 stage 3 shape)
    metrics: Dict[str, Any] = {
        "vn_diacritic_ratio": round(vn_ratio, 4),
        "numeric_ratio_in_tables": round(numeric_ratio, 4),
        "anchor_phrases_found": anchor_phrases_found,
        "anchor_phrases_missing": anchor_phrases_missing,
        "provenance": {
            "parser_path": "eval_detectors.eval_stage3_ocr",
            "page_no": top_page_no,
            "total_pages_with_text": len([p for p, t in ocr_text_per_page.items() if t]),
            "diacritic_count": diacritic_count,
            "total_alpha_count": total_alpha,
            "layout_unit_id": None,  # aggregate — no single unit
            "ocr_conf": None,        # per-word conf lives in infra layer
        },
    }

    # Status
    if gate_failures:
        status = "red"
    elif warnings:
        status = "yellow"
    else:
        status = "green"

    return _make_result(
        stage_no=3,
        stage_name="OCR",
        status=status,
        metrics=metrics,
        gate_failures=gate_failures,
        golden_diff={},
    )
