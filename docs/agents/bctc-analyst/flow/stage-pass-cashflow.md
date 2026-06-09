> Parent: [./stage-analyze.md](./stage-analyze.md)

# BCTC Analyst — Pass 3: Cashflow Trick Detection

**Model:** haiku (CF-vs-NI divergence is arithmetic)
**Pass ID:** `cashflow-v1`
**Order:** 3 of 6

## Input

- `bctc_table_rows` WHERE `statement_section = "cash_flow"` for this `report_id`
- `bctc_table_rows` WHERE `statement_section = "income_statement"` for this `report_id` (for NI comparison)
- TICKER, QUARTER, report_id

## Gate-Vision Check (BEFORE any code-keyed lookup)

Apply skill `.claude/skills/bctc-gate-vision/SKILL.md` §Gate check.
Read `needs_vision_verify` + `vision_verify_markers` for this extraction unit.
Codes T1–T3 below are all code-keyed — if any target code appears in `flagged_codes`,
anchor by label+position or escalate to vision per skill protocol before using the value.

## E4 — Field Availability Check

1. Verify `statement_section = "cash_flow"` rows exist. If count = 0:
   log `[PASS3 WARN] cash_flow section missing for {TICKER}/{QUARTER} — skipping cashflow pass`
   Emit `pass_clean=true, findings=[], skipped_reason="section_missing"`.
2. Proxy for missing `confidence_score`: skip rows where `value_current IS NULL`

## Analysis — Tricks to Detect

**T1 — Operating CF vs Net Income Divergence:** OCF row (code 20) and Net Income from income_statement:
- Compute `ocf_ni_ratio = OCF / NI` (skip if NI = 0)
- If `ocf_ni_ratio < 0` (OCF negative, NI positive): HIGH severity finding
- If `ocf_ni_ratio < 0.5` (OCF << NI for 2+ quarters): MEDIUM severity
→ finding: trick_type="ocf-ni-divergence", evidence: row_index (OCF row) + code "20"
   note: "OCF={value}, NI={ni_value}, ratio={ratio:.2f}"

**T2 — Working-Capital Release:** Large decrease in receivables (operating section) in same quarter revenue surged
→ finding: trick_type="wc-release", evidence: row_index (receivables change row) + code

**T3 — Interest-Classification Swap:** Interest paid classified under investing activities instead of operating
→ Pattern: check if interest line (code 24/25 in cashflow) appears in investing section rows
→ finding: trick_type="interest-classification-swap", evidence: row_index + page_anchor if found

## Evidence Requirement (MANDATORY)

Every finding MUST cite at least one of: `row_index`, `page_anchor`, `code`. Zero-evidence findings dropped.

## Output Schema

```json
{
  "pass_id": "cashflow-v1",
  "ticker": "{TICKER}",
  "quarter": "{QUARTER}",
  "bctc_content_hash": "{hash}",
  "findings": [...],
  "pass_clean": true,
  "low_confidence_rows_skipped": 0
}
```

Emit output JSON block to session state variable `pass_3_result`. Do NOT write to disk.
