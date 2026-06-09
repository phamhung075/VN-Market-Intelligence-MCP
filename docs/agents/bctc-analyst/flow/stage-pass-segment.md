> Parent: [./stage-analyze.md](./stage-analyze.md)

# BCTC Analyst — Pass 6: Segment-Disclosure Detection

**Model:** sonnet (cross-segment subsidy detection requires context)
**Pass ID:** `segment-v1`
**Order:** 6 of 6

## Input

- `bctc_table_rows` (all sections) for this `report_id`
- `bctc_layout_units.stitched_markdown` (if available — BCTC-LAYOUT-FIRST sprint)
- `pdf_extracted_text.ocr_text` for this `report_id`
- TICKER, QUARTER, report_id
- pass_1_result through pass_4_result (session state — for cross-referencing)

## Gate-Vision Check (BEFORE any code-keyed lookup)

Apply skill `.claude/skills/bctc-gate-vision/SKILL.md` §Gate check.
Read `needs_vision_verify` + `vision_verify_markers` for this extraction unit.
This pass reads all bctc_table_rows sections — if any code used in corroboration or
segment lookup appears in `flagged_codes`, anchor by label+position or escalate to vision
per skill protocol before using the value.

## E4 — Field Availability Check

1. `bctc_layout_units.stitched_markdown` is OPTIONAL — only available if BCTC-LAYOUT-FIRST sprint deployed.
   If unavailable: fall back to structured `bctc_table_rows` + raw OCR.
2. Proxy for missing `confidence_score`: skip rows where `value_current IS NULL`

## Analysis — Segment-Disclosure Tricks

**T1 — Cross-Segment Subsidy:** If segment breakdown is present in OCR or stitched_markdown:
  Search for Vietnamese: "phân khúc", "mảng kinh doanh", "đơn vị kinh doanh"
  If one segment shows negative operating income while consolidated income is positive:
→ finding: trick_type="cross-segment-subsidy", confidence="high" if two segments clearly named
   evidence: page_anchor (page with segment table) OR row_index if structured rows available
   note: "Segment A profitable {value}, Segment B loss {value}, hides weak vertical"

**T2 — Weak-Vertical Concealment:** One business line consistently losing money but disclosure is minimal or aggregate:
  Search OCR for: "thua lỗ", "lỗ từ hoạt động", "lỗ phân khúc"
→ finding: trick_type="weak-vertical-concealment", evidence: page_anchor
   note: quote the segment identifier and loss figure if stated

**T3 — Segment Reclassification:** Prior-period restatement of segment allocations without adequate disclosure:
  Search: "điều chỉnh phân bổ", "phân loại lại phân khúc", "cơ cấu lại"
→ finding: trick_type="segment-reclass", evidence: page_anchor

**T4 — Stitched-Table Anomaly (LAYOUT-FIRST only):** If stitched_markdown available and `quarantined=1`:
  Log the quarantine_reason as a finding with severity=medium (structural anomaly in the extracted table)
→ finding: trick_type="stitched-table-quarantine", evidence: page_anchor (from bctc_layout_units)
   note: quarantine_reason verbatim

**Corroboration rule:** If pass_2 flagged segment-margin-inconsistency and pass_6 finds cross-segment-subsidy
on the same ticker, elevate both to severity="high".

## Evidence Requirement (MANDATORY)

Every finding MUST cite at least one of: `row_index`, `page_anchor`, `code`. Zero-evidence findings dropped.

## Output Schema

```json
{
  "pass_id": "segment-v1",
  "ticker": "{TICKER}",
  "quarter": "{QUARTER}",
  "bctc_content_hash": "{hash}",
  "findings": [...],
  "pass_clean": true,
  "low_confidence_rows_skipped": 0
}
```

Emit output JSON block to session state variable `pass_6_result`. Do NOT write to disk.
