#!/usr/bin/env python3
"""
SPIKE-DOCLANG-OTSL-OVERLAP — measurement script
Zone: apps/pdf-extractor/

Question: Does the DocLang reference validator catch structural table defects
that our IN-HOUSE eval gates already miss?

Method:
1. Pull N=9 real BCTC extractions from the live pipeline DB.
2. Reconstruct ExtractedTableDTO shape (headers, rows, page_number) from
   bctc_table_rows + bctc_layout_units.
3. Serialize each table to DocLang .dclg.xml (namespace https://www.doclang.ai/ns/v0)
   mapping: headers → <ched/>, rows → <fcel/>, row terminator → <nl/>.
4. Run doclang.validate() (XSD + Schematron). Capture .xsd_errors + .schematron_errors.
5. Run native gates (4_TABLE_RECONSTRUCT thresholds from bctc-eval-thresholds.json +
   layout_invariants: check_no_orphan_rows, check_codes_monotonic, check_balance_identity).
6. Compare: net-new = doclang defects NOT already flagged by native gates.

Usage:
    python3 scripts/spike-doclang-otsl-overlap.py
    python3 scripts/spike-doclang-otsl-overlap.py --db /path/to/market.db
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sqlite3
import sys
import tempfile
import xml.etree.ElementTree as ET
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------

SCRIPT_DIR = Path(__file__).parent
REPO_ROOT = SCRIPT_DIR.parent
PDF_EXTRACTOR_DIR = REPO_ROOT / "apps" / "pdf-extractor"
THRESHOLDS_JSON = REPO_ROOT / "docs" / "data" / "bctc-eval-thresholds.json"
VENV_SITE = PDF_EXTRACTOR_DIR / ".venv" / "lib"
LIVE_DB_FALLBACK = REPO_ROOT / "data" / "pdf_extractor.db"

# Add the pdf-extractor to path so we can import domain/ primitives
sys.path.insert(0, str(PDF_EXTRACTOR_DIR))

# ---------------------------------------------------------------------------
# DocLang namespace
# ---------------------------------------------------------------------------
DOCLANG_NS = "https://www.doclang.ai/ns/v0"
ET.register_namespace("", DOCLANG_NS)


# ---------------------------------------------------------------------------
# Load thresholds
# ---------------------------------------------------------------------------

def load_thresholds() -> Dict:
    """Load bctc-eval-thresholds.json from docs/data/ (SSOT)."""
    paths = [THRESHOLDS_JSON, REPO_ROOT / "apps" / "pdf-extractor" / "config" / "bctc-eval-thresholds.json"]
    for p in paths:
        if p.exists():
            with open(p) as f:
                return json.load(f)
    print(f"[WARN] Could not find bctc-eval-thresholds.json; using built-ins", file=sys.stderr)
    return {}


# ---------------------------------------------------------------------------
# Data extraction from live DB
# ---------------------------------------------------------------------------

def get_live_db_path() -> Optional[str]:
    """Try to find the live DB — either mounted host path or from docker inspect."""
    # Known mounted paths from docker-compose
    candidate = REPO_ROOT / "data" / "market.db"
    if candidate.exists() and candidate.stat().st_size > 0:
        return str(candidate)
    # Check if it's accessible from the container via host-mounted path
    # Docker named volume: vn-market-intelligence-mcp_market_data -> /app/data
    # We cannot reach this directly from host; use docker exec
    return None


def fetch_via_docker(query: str) -> Optional[str]:
    """Run a Python snippet inside the pdf-extractor container and return stdout."""
    import subprocess
    snippet = f"""
import sqlite3, json
con = sqlite3.connect('/app/data/market.db')
con.row_factory = sqlite3.Row
cur = con.cursor()
{query}
"""
    result = subprocess.run(
        ["docker", "exec", "vn-market-intelligence-mcp-pdf-extractor-1", "python3", "-c", snippet],
        capture_output=True, text=True, timeout=30
    )
    if result.returncode != 0:
        return None
    return result.stdout.strip()


def fetch_bctc_table_rows_from_docker() -> List[Dict]:
    """
    Pull the 5 most recent reports from bctc_table_rows via the container.
    Returns list of {report_id, rows[]} where rows have bctc_table_rows schema.
    """
    # Already extracted to /tmp — load it
    raw_path = Path("/tmp/bctc_raw_extractions.json")
    if raw_path.exists():
        with open(raw_path) as f:
            return json.load(f)

    query = """
cur.execute('''
SELECT report_id, MAX(extracted_at) as last_at
FROM bctc_table_rows
GROUP BY report_id
ORDER BY last_at DESC
LIMIT 9
''')
report_ids = [r['report_id'] for r in cur.fetchall()]
result = []
for rid in report_ids:
    cur.execute('''
    SELECT page_number, statement_section, row_order, code, label, period_current,
           value_current, period_prior, value_prior, unit, is_summary_row
    FROM bctc_table_rows
    WHERE report_id = ?
    ORDER BY page_number, row_order
    ''', (rid,))
    rows = [dict(r) for r in cur.fetchall()]
    result.append({'report_id': rid, 'rows': rows})
print(json.dumps(result, ensure_ascii=False))
"""
    out = fetch_via_docker(query)
    if out:
        return json.loads(out)
    return []


def fetch_layout_units_from_docker() -> List[Dict]:
    """Pull bctc_layout_units (table-type) via container."""
    layout_path = Path("/tmp/bctc_layout_units.json")
    if layout_path.exists():
        with open(layout_path) as f:
            return json.load(f)
    return []


# ---------------------------------------------------------------------------
# Build ExtractedTableDTO from bctc_table_rows
# ---------------------------------------------------------------------------

def rows_to_extracted_tables(report: Dict) -> List[Dict]:
    """
    Convert bctc_table_rows for one report into a list of ExtractedTableDTO-like dicts.

    Groups by (page_number, statement_section) → one "table" per section/page group.
    headers = derived from column labels (code, label, period_current, period_prior)
    rows    = each bctc_table_row as a list of cell values

    Returns list of {table_index, headers, rows, page_number}.
    """
    # Group by page_number + statement_section
    groups: Dict[Tuple, List[Dict]] = {}
    for row in report["rows"]:
        key = (row.get("page_number", 0), row.get("statement_section") or "unknown")
        groups.setdefault(key, []).append(row)

    tables = []
    for idx, ((page_no, section), section_rows) in enumerate(sorted(groups.items())):
        # Determine headers from what fields are populated
        has_current = any(r.get("value_current") is not None for r in section_rows)
        has_prior = any(r.get("value_prior") is not None for r in section_rows)
        has_code = any(r.get("code") for r in section_rows)

        headers = []
        if has_code:
            headers.append("Mã")
        headers.append("Chỉ tiêu")
        if has_current:
            period = section_rows[0].get("period_current") or "Kỳ này"
            headers.append(str(period))
        if has_prior:
            period = section_rows[0].get("period_prior") or "Kỳ trước"
            headers.append(str(period))

        rows_out = []
        for r in section_rows:
            row_cells = []
            if has_code:
                row_cells.append(str(r.get("code") or ""))
            row_cells.append(str(r.get("label") or ""))
            if has_current:
                v = r.get("value_current")
                row_cells.append(str(v) if v is not None else "")
            if has_prior:
                v = r.get("value_prior")
                row_cells.append(str(v) if v is not None else "")
            rows_out.append(row_cells)

        tables.append({
            "table_index": idx,
            "headers": headers,
            "rows": rows_out,
            "page_number": page_no,
            "statement_section": section,
            "report_id": report["report_id"],
        })

    return tables


# ---------------------------------------------------------------------------
# Serialize ExtractedTableDTO → DocLang XML
# ---------------------------------------------------------------------------

def _escape_xml(text: str) -> str:
    """Escape XML special characters."""
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def to_doclang_xml(table: Dict) -> str:
    """
    Serialize one ExtractedTableDTO to DocLang .dclg.xml string.

    Mapping:
        headers[]   → <ched/>header_text  (one per column)
        rows[][]    → <fcel/>cell_text     (one per column)
        each row terminates with <nl/>
        rectangular rule: each row must have len(headers) cells before <nl/>

    If a row has fewer cells than headers, pad with empty <fcel/>.
    If more cells than headers (structural defect), serialize as-is (DocLang will flag it).
    """
    ns = DOCLANG_NS
    headers = table["headers"]
    rows = table["rows"]
    page_no = table.get("page_number", 0)
    n_cols = len(headers)

    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        f'<doclang xmlns="{ns}" version="0.6">',
        f'  <!-- BCTC extraction: report_id={table.get("report_id","?")} page={page_no} section={table.get("statement_section","?")} -->',
        '  <table>',
    ]

    # Header row
    header_cells = "".join(
        f"<ched/>{_escape_xml(str(h))}" for h in headers
    )
    lines.append(f"    {header_cells}<nl/>")

    # Data rows
    for row in rows:
        actual_cols = len(row)
        # Pad or trim to n_cols to produce a potentially rectangular table
        # NOTE: we do NOT force-pad here — we want to expose real defects.
        # If actual_cols != n_cols, the DocLang rectangular rule will fire.
        cell_str = "".join(
            f"<fcel/>{_escape_xml(str(c))}" for c in row
        )
        lines.append(f"    {cell_str}<nl/>")

    lines.append("  </table>")
    lines.append("</doclang>")
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Native gates (Stage 4_TABLE_RECONSTRUCT + layout_invariants)
# ---------------------------------------------------------------------------

def native_gates_check(table: Dict, thresholds: Dict) -> Dict:
    """
    Run the native eval gates equivalent for this table.

    Stage 4_TABLE_RECONSTRUCT thresholds:
        label_coverage_min: fraction of rows with non-empty label >= threshold
        code_coverage_min:  fraction of rows with non-empty code >= threshold
        exact_dup_max:      0 exact duplicate rows allowed
        value_blank_label_max: 0 rows with value but blank label (value-only orphan)

    Also runs layout_invariants from domain/primitives/layout_invariants/primitive.py:
        check_no_orphan_rows()
        check_codes_monotonic()
        check_balance_identity()

    Returns:
        {
          'native_flags': [...],    # list of detected defect strings
          'native_pass': bool,      # True = all gates pass
        }
    """
    stage4 = thresholds.get("stages", {}).get("4_TABLE_RECONSTRUCT", {})
    label_cov_min = stage4.get("label_coverage_min", 0.90)
    code_cov_min = stage4.get("code_coverage_min", 0.80)
    exact_dup_max = stage4.get("exact_dup_max", 0)
    vbl_max = stage4.get("value_blank_label_max", 0)

    headers = table["headers"]
    rows = table["rows"]
    n_cols = len(headers)
    native_flags = []

    if not rows:
        return {"native_flags": [], "native_pass": True}

    # --- label_coverage ---
    has_label_col = "Chỉ tiêu" in headers or (len(headers) >= 2)
    if has_label_col:
        label_idx = headers.index("Chỉ tiêu") if "Chỉ tiêu" in headers else (1 if "Mã" in headers else 0)
        labels_filled = sum(
            1 for r in rows if label_idx < len(r) and r[label_idx].strip()
        )
        label_cov = labels_filled / len(rows)
        if label_cov < label_cov_min:
            native_flags.append(f"label_coverage_fail: {label_cov:.3f} < {label_cov_min}")

    # --- code_coverage (only if has code column) ---
    if "Mã" in headers:
        code_idx = headers.index("Mã")
        codes_filled = sum(
            1 for r in rows if code_idx < len(r) and r[code_idx].strip()
        )
        code_cov = codes_filled / len(rows)
        if code_cov < code_cov_min:
            native_flags.append(f"code_coverage_fail: {code_cov:.3f} < {code_cov_min}")

    # --- exact duplicates ---
    row_tuples = [tuple(r) for r in rows]
    seen = set()
    dup_count = 0
    for rt in row_tuples:
        if rt in seen:
            dup_count += 1
        seen.add(rt)
    if dup_count > exact_dup_max:
        native_flags.append(f"exact_dup_fail: {dup_count} duplicates > {exact_dup_max}")

    # --- value_blank_label ---
    # Determine value columns (after label column)
    label_col_idx = 1 if "Mã" in headers else 0
    value_col_start = label_col_idx + 1
    vbl_count = 0
    for r in rows:
        label_text = r[label_col_idx].strip() if label_col_idx < len(r) else ""
        has_value = any(
            r[i].strip() for i in range(value_col_start, len(r)) if i < len(r)
        )
        if not label_text and has_value:
            vbl_count += 1
    if vbl_count > vbl_max:
        native_flags.append(f"value_blank_label_fail: {vbl_count} rows > {vbl_max}")

    # --- layout_invariants ---
    try:
        from domain.primitives.layout_invariants.primitive import (
            check_no_orphan_rows,
            check_codes_monotonic,
            check_balance_identity,
        )
        # Reconstruct row dicts for invariant checkers
        code_col_idx = headers.index("Mã") if "Mã" in headers else None
        label_col_idx_inv = 1 if code_col_idx is not None else 0
        value_col_start_inv = label_col_idx_inv + 1

        inv_rows = []
        for i, r in enumerate(rows):
            code_val = r[code_col_idx] if code_col_idx is not None and code_col_idx < len(r) else None
            label_val = r[label_col_idx_inv] if label_col_idx_inv < len(r) else None
            values = [r[j] for j in range(value_col_start_inv, len(r))]
            inv_rows.append({
                "code": code_val,
                "label": label_val,
                "values": values,
                "page": table.get("page_number", 0),
            })

        ok, reason = check_no_orphan_rows(inv_rows)
        if not ok:
            native_flags.append(f"invariant_orphan_rows: {reason}")

        ok, reason = check_codes_monotonic(inv_rows)
        if not ok:
            native_flags.append(f"invariant_codes_not_monotonic: {reason}")

        ok, reason = check_balance_identity(inv_rows)
        if not ok:
            native_flags.append(f"invariant_balance_identity: {reason}")

    except ImportError as e:
        native_flags.append(f"IMPORT_ERROR_invariants: {e}")

    return {
        "native_flags": native_flags,
        "native_pass": len(native_flags) == 0,
    }


# ---------------------------------------------------------------------------
# DocLang validation
# ---------------------------------------------------------------------------

def doclang_validate_xml(xml_str: str, label: str) -> Dict:
    """
    Write xml_str to a temp file and run doclang.validate().

    Returns:
        {
          'valid': bool,
          'xsd_errors': [...],
          'schematron_errors': [...],
          'all_errors': [...],   # combined
        }
    """
    try:
        from doclang import validate, ValidationError
    except ImportError:
        return {
            "valid": None,
            "xsd_errors": [],
            "schematron_errors": [{"error": "doclang not installed in this Python"}],
            "all_errors": [{"error": "doclang not installed"}],
        }

    with tempfile.NamedTemporaryFile(suffix=".dclg.xml", mode="w", encoding="utf-8", delete=False) as f:
        f.write(xml_str)
        tmp_path = f.name

    try:
        validate(tmp_path, allow_empty_namespace=False)
        return {"valid": True, "xsd_errors": [], "schematron_errors": [], "all_errors": []}
    except ValidationError as e:
        all_errs = [{"source": "xsd", **err} for err in e.xsd_errors] + \
                   [{"source": "schematron", **err} for err in e.schematron_errors]
        return {
            "valid": False,
            "xsd_errors": e.xsd_errors,
            "schematron_errors": e.schematron_errors,
            "all_errors": all_errs,
        }
    except Exception as exc:
        return {
            "valid": False,
            "xsd_errors": [],
            "schematron_errors": [{"error": str(exc)}],
            "all_errors": [{"source": "exception", "error": str(exc)}],
        }
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass


# ---------------------------------------------------------------------------
# Classify net-new
# ---------------------------------------------------------------------------

def classify_net_new(doclang_result: Dict, native_result: Dict) -> List[str]:
    """
    Return list of DocLang defect descriptions that are NOT already flagged
    by the native gates.

    A DocLang defect is considered "already caught" if the native gates
    already flag SOME defect for this table (any native flag present means
    the table is already quarantined / flagged). Net-new is therefore:
      doclang flagged a defect AND native gates found ZERO defects.
    This is a conservative measure: if native gates missed the table entirely
    (passed it clean) but doclang found a structural defect, that is net-new.
    """
    if doclang_result.get("valid", True):
        return []  # doclang found nothing

    if native_result["native_flags"]:
        # Native gates already caught this table — not net-new
        return []

    # Doclang caught something native gates missed
    return [f"{e.get('source','?')}: {e.get('message', e.get('error','?'))}"
            for e in doclang_result["all_errors"]]


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", help="Path to market.db (optional; uses docker exec if not given)")
    parser.add_argument("--json", action="store_true", help="Output machine-readable JSON")
    args = parser.parse_args()

    thresholds = load_thresholds()
    print(f"[INFO] Loaded thresholds: {bool(thresholds)}", file=sys.stderr)

    # Load real extraction data
    reports = fetch_bctc_table_rows_from_docker()
    if not reports:
        print("[ERROR] Could not load BCTC extraction data from docker container", file=sys.stderr)
        sys.exit(1)

    print(f"[INFO] Loaded {len(reports)} reports from live pipeline", file=sys.stderr)

    # Process
    all_results = []
    net_new_count = 0
    total_tables = 0

    for report in reports:
        tables = rows_to_extracted_tables(report)
        for table in tables:
            total_tables += 1
            table_label = f"{report['report_id'][:8]}…/p{table['page_number']}/{table.get('statement_section','?')}"

            # Build DocLang XML
            xml_str = to_doclang_xml(table)

            # DocLang validation
            dl_result = doclang_validate_xml(xml_str, table_label)

            # Native gate check
            native_result = native_gates_check(table, thresholds)

            # Net-new computation
            net_new_defects = classify_net_new(dl_result, native_result)
            if net_new_defects:
                net_new_count += 1

            result = {
                "report_id": report["report_id"],
                "table_index": table["table_index"],
                "page_number": table["page_number"],
                "statement_section": table.get("statement_section"),
                "n_headers": len(table["headers"]),
                "n_rows": len(table["rows"]),
                "doclang_valid": dl_result.get("valid"),
                "doclang_errors": dl_result["all_errors"],
                "native_flags": native_result["native_flags"],
                "native_pass": native_result["native_pass"],
                "net_new_defects": net_new_defects,
            }
            all_results.append(result)

    # Summary
    doclang_flagged = sum(1 for r in all_results if not r["doclang_valid"])
    native_flagged = sum(1 for r in all_results if not r["native_pass"])
    both_flagged = sum(1 for r in all_results if not r["doclang_valid"] and not r["native_pass"])
    only_doclang = sum(1 for r in all_results if not r["doclang_valid"] and r["native_pass"])
    only_native = sum(1 for r in all_results if r["doclang_valid"] is not False and not r["native_pass"])

    summary = {
        "total_tables": total_tables,
        "total_reports": len(reports),
        "doclang_flagged": doclang_flagged,
        "native_flagged": native_flagged,
        "both_flagged": both_flagged,
        "only_doclang_net_new": only_doclang,
        "only_native": only_native,
        "net_new_count": net_new_count,
        "verdict": "net-new > 0 → DocLang adds value" if net_new_count > 0 else "net-new = 0 → CLOSE spike: DocLang adds nothing",
    }

    if args.json:
        print(json.dumps({"summary": summary, "details": all_results}, indent=2, ensure_ascii=False))
        return

    # Human-readable report
    print("\n" + "="*70)
    print("SPIKE-DOCLANG-OTSL-OVERLAP — Results")
    print("="*70)
    print(f"  Reports processed  : {summary['total_reports']}")
    print(f"  Tables measured    : {summary['total_tables']}")
    print(f"  DocLang flagged    : {summary['doclang_flagged']}")
    print(f"  Native flagged     : {summary['native_flagged']}")
    print(f"  Both flagged       : {summary['both_flagged']}")
    print(f"  Only DocLang (NET-NEW) : {summary['only_doclang_net_new']}")
    print(f"  Only native        : {summary['only_native']}")
    print(f"\n  NET-NEW COUNT      : {net_new_count}")
    print(f"  VERDICT            : {summary['verdict']}")
    print("="*70)

    # Show net-new details
    net_new_results = [r for r in all_results if r["net_new_defects"]]
    if net_new_results:
        print("\n--- NET-NEW DEFECTS (DocLang caught, native missed) ---")
        for r in net_new_results:
            print(f"\n  Table: report={r['report_id'][:8]}… page={r['page_number']} section={r['statement_section']}")
            print(f"  n_cols={r['n_headers']} n_rows={r['n_rows']}")
            print(f"  DocLang errors:")
            for e in r["doclang_errors"]:
                msg = e.get("message", e.get("error", str(e)))
                print(f"    [{e.get('source','?')}] {msg[:200]}")
            print(f"  Native flags: {r['native_flags'] or 'NONE (passed clean)'}")

    # Show tables where native flags but doclang passes (for calibration)
    only_native_results = [r for r in all_results if r["doclang_valid"] is not False and not r["native_pass"]]
    if only_native_results:
        print(f"\n--- ONLY NATIVE FLAGGED ({len(only_native_results)} tables) ---")
        for r in only_native_results[:5]:
            print(f"  Table: report={r['report_id'][:8]}… page={r['page_number']}")
            print(f"  Native flags: {r['native_flags']}")

    print()


if __name__ == "__main__":
    main()
