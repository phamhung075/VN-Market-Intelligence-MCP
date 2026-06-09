> Parent: [./stage-analyze.md](./stage-analyze.md)

# BCTC Analyst — Pass 4: Related-Party Transaction (RPT) Detection

**Model:** haiku (volume/pricing anomaly detection on structured rows)
**Pass ID:** `rpt-v1`
**Order:** 4 of 6

## Input

- `bctc_table_rows` WHERE `statement_section = "balance_sheet"` (RPT receivables)
- `pdf_extracted_text.ocr_text` for this `report_id` (footnote search)
- TICKER, QUARTER, report_id

## Gate-Vision Check (BEFORE any code-keyed lookup)

Apply skill `.claude/skills/bctc-gate-vision/SKILL.md` §Gate check.
Read `needs_vision_verify` + `vision_verify_markers` for this extraction unit.
T1 uses balance-sheet row codes keyed by Mã-số — if any target code appears in `flagged_codes`,
anchor by label+position or escalate to vision per skill protocol before using the value.

## E4 — Field Availability Check

1. OCR text must be available. If `ocr_text IS NULL` or empty:
   log `[PASS4 WARN] OCR text unavailable for {TICKER}/{QUARTER} — RPT footnote scan skipped`
2. Proxy for missing `confidence_score`: skip balance_sheet rows where `value_current IS NULL`
3. Footnote code linkage NOT available — use raw OCR + `page_anchor` as evidence anchor per E4 fallback

## Analysis — Tricks to Detect

**T1 — RPT Volume:** Search OCR text for Vietnamese RPT keywords:
  "bên liên quan", "công ty mẹ", "công ty liên kết", "giao dịch với"
  If total RPT receivables (tagged in balance sheet rows with "liên quan" in label) > 20% of total receivables:
→ finding: trick_type="rpt-volume", evidence: row_index (RPT receivable row) + page_anchor (OCR page)

**T2 — RPT Pricing:** Search OCR for "giá thị trường", "thị giá", "giá chuyển nhượng"
  If RPT transactions mention "không theo giá thị trường" or absence of market-rate statement:
→ finding: trick_type="rpt-off-market-pricing", evidence: page_anchor from OCR

**T3 — Intra-Group Lending:** OCR mentions large loans to parent/subsidiary:
  "cho vay", "hợp đồng vay" with "bên liên quan" within 100 chars
→ finding: trick_type="intra-group-lending", evidence: page_anchor from OCR + code (if balance row found)

**T4 — Off-Market Terms:** Search for "lãi suất 0%", "không tính lãi", "miễn lãi" adjacent to "bên liên quan"
→ finding: trick_type="rpt-off-market-terms", evidence: page_anchor from OCR

## Evidence Requirement (MANDATORY)

Every finding MUST cite at least one of: `row_index`, `page_anchor`, `code`. Zero-evidence findings dropped.

## Output Schema

```json
{
  "pass_id": "rpt-v1",
  "ticker": "{TICKER}",
  "quarter": "{QUARTER}",
  "bctc_content_hash": "{hash}",
  "findings": [...],
  "pass_clean": true,
  "low_confidence_rows_skipped": 0
}
```

Emit output JSON block to session state variable `pass_4_result`. Do NOT write to disk.
