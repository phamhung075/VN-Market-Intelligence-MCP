> Parent: [./stage-analyze.md](./stage-analyze.md)

# BCTC Analyst — Pass 2: P&L Trick Detection

**Model:** haiku (revenue/cost pattern detection on structured rows)
**Pass ID:** `pl-v1`
**Order:** 2 of 6

## Input

- `bctc_table_rows` WHERE `statement_section = "income_statement"` for this `report_id`
- TICKER, QUARTER, report_id

## E4 — Field Availability Check

1. Verify `statement_section = "income_statement"` rows exist. If count = 0:
   log `[PASS2 WARN] income_statement section missing or empty for {TICKER}/{QUARTER} — skipping P&L pass`
   Emit `pass_clean=true, findings=[]` with note `skipped_reason="section_missing"`.
2. Proxy for missing `confidence_score`: skip rows where `value_current IS NULL`

## Analysis — Tricks to Detect

**T1 — Revenue-Recognition Timing:** Revenue (code 01/10/11) QoQ jump > 40% with no corresponding gross-profit improvement
→ finding: trick_type="revenue-recognition-timing", evidence: row_index + code

**T2 — One-Off Gain Dressing:** Financial income (code 22/23) or other income (code 31) > 20% of net profit
→ finding: trick_type="one-off-gain-dressing", evidence: row_index + code + note "item {pct}% of net profit"

**T3 — Cost Reclass:** COGS (code 11/21) decreased YoY while selling expenses (code 24/25) or G&A (code 26/27) increased by similar magnitude
→ finding: trick_type="cost-reclass", evidence: row_index for both rows + codes + note delta amounts

**T4 — Segment Margin Inconsistency:** If multiple revenue lines present, one segment margin <0 while total margin positive
→ finding: trick_type="segment-margin-inconsistency", evidence: row_index for losing segment row + code

## Evidence Requirement (MANDATORY)

Every finding MUST cite at least one of: `row_index`, `page_anchor`, `code`. Zero-evidence findings dropped.

## Output Schema

```json
{
  "pass_id": "pl-v1",
  "ticker": "{TICKER}",
  "quarter": "{QUARTER}",
  "bctc_content_hash": "{hash}",
  "findings": [...],
  "pass_clean": true,
  "low_confidence_rows_skipped": 0
}
```

Emit output JSON block to session state variable `pass_2_result`. Do NOT write to disk.
