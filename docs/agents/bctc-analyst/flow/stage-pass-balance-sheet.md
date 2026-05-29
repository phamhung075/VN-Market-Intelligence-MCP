> Parent: [./stage-analyze.md](./stage-analyze.md)

# BCTC Analyst — Pass 1: Balance-Sheet Trick Detection

**Model:** haiku (structured row comparison — flag arithmetic anomalies)
**Pass ID:** `balance-sheet-v1`
**Order:** 1 of 6

## Input

- `bctc_table_rows` WHERE `statement_section = "balance_sheet"` for this `report_id`
- `bctc_balance_checks` for this `report_id` (balance_pass, balance_delta)
- TICKER, QUARTER, report_id (from stage-analyze.md session state)

## E4 — Field Availability Check

Before analysis:
1. Verify `balance_pass` from `bctc_balance_checks` — if `balance_pass = 0`: log WARNING
   `[PASS1 WARN] Balance check FAILED for {TICKER}/{QUARTER} (delta={balance_delta}) — trick detection unreliable; flag all findings low-confidence`
2. Proxy for missing `confidence_score`: skip rows where `value_current IS NULL AND value_prior IS NULL`
3. `statement_section` must be `"balance_sheet"` for all rows consumed here

## Analysis — Tricks to Detect

For each balance-sheet row (code, label, value_current, value_prior, row_order, page_number):

**T1 — Cap-Opex:** Fixed asset (code 211/212/213/214/221) YoY increase >20% while revenue flat or declining
→ finding: trick_type="cap-opex", evidence: row_index + code + note "YoY increase {pct}% while revenue {direction}"

**T2 — Intangibles Inflation:** Intangible assets (code 211/215) absolute increase >10% revenue
→ finding: trick_type="intangibles-inflation", evidence: row_index + code

**T3 — A/R Receivables Stuffing:** Short-term receivables (code 131/136) growth rate > revenue growth rate
→ finding: trick_type="ar-stuffing", evidence: row_index + code + note "AR growth {pct}% vs revenue growth {pct}%"

**T4 — Inventory Provisioning Gap:** Inventory (code 151/152/153/154/155) increased while allowance for inventory (code 159) flat
→ finding: trick_type="inventory-provision-gap", evidence: row_index + code for both rows

**T5 — OBS Guarantees:** Any off-balance-sheet note in raw OCR mentioning guarantees or contingent liabilities
→ finding: trick_type="obs-guarantee", evidence: page_anchor from OCR footnote

## Evidence Requirement (MANDATORY)

Every finding MUST cite at least one of: `row_index`, `page_anchor`, `code`.
Findings with zero evidence citations are INVALID — drop before emitting output.

## Output Schema

```json
{
  "pass_id": "balance-sheet-v1",
  "ticker": "{TICKER}",
  "quarter": "{QUARTER}",
  "bctc_content_hash": "{hash}",
  "findings": [...],
  "pass_clean": true,
  "low_confidence_rows_skipped": 0
}
```

Emit output JSON block to session state variable `pass_1_result`. Do NOT write to disk.
