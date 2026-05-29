> Parent: [./stage-analyze.md](./stage-analyze.md)

# BCTC Analyst — Pass 5: Footnote/Accounting-Policy Detection

**Model:** sonnet (qualitative policy language — haiku misses nuance)
**Pass ID:** `footnote-v1`
**Order:** 5 of 6

## Input

- `pdf_extracted_text.ocr_text` for this `report_id` (full raw OCR — primary evidence source)
- TICKER, QUARTER, report_id
- pass_1_result through pass_4_result (session state — context for corroborating findings)

## E4 — Field Availability Check

1. `ocr_text` MUST be available. If absent or < 200 chars:
   log `[PASS5 WARN] OCR text insufficient for {TICKER}/{QUARTER} — footnote pass skipped`
   Emit `pass_clean=true, findings=[], skipped_reason="ocr_unavailable"`.
2. Footnote-code linkage NOT produced by extractor — use `page_anchor` (page number) as evidence anchor
   (a separate dev-pdf-extractor sprint will add code→footnote linkage; use raw OCR until then)

## Analysis — Qualitative Policy Review

Read the raw OCR text with care. Flag qualitative changes that arithmetic passes cannot detect.

**T1 — Accounting Policy Change:** Look for Vietnamese phrases:
  "thay đổi chính sách kế toán", "áp dụng chuẩn mực kế toán mới", "điều chỉnh hồi tố"
→ finding: trick_type="accounting-policy-change", confidence="high" if period-over-period change is stated
   evidence: page_anchor (page where the policy note appears)
   note: quote the specific policy change language (max 30 words)

**T2 — Depreciation Life Extension:** Look for:
  "thay đổi thời gian khấu hao", "điều chỉnh thời gian sử dụng hữu ích", "kéo dài thời gian khấu hao"
→ finding: trick_type="depreciation-life-extension", evidence: page_anchor
   note: "new useful life = X years (was Y years)" if stated

**T3 — Revenue-Recognition Shift:** Look for:
  "thay đổi phương pháp ghi nhận doanh thu", "ghi nhận theo tiến độ", "điều chỉnh doanh thu"
→ finding: trick_type="revenue-recognition-shift", evidence: page_anchor

**T4 — Discount Rate Change:** Look for:
  "thay đổi tỷ lệ chiết khấu", "lãi suất chiết khấu", "điều chỉnh giá trị hiện tại"
→ finding: trick_type="discount-rate-change", evidence: page_anchor

**Corroboration rule:** If pass_1 or pass_3 already flagged a finding that aligns with a footnote finding here
(e.g., pass_1 found cap-opex AND pass_5 finds depreciation-life-extension), elevate severity to "high"
and note in the evidence: "corroborated by pass_1 finding: cap-opex".

## Evidence Requirement (MANDATORY)

Every finding MUST cite at least one of: `row_index`, `page_anchor`, `code`.
For this pass, `page_anchor` is the primary evidence anchor (code linkage not yet available from extractor).
Zero-evidence findings dropped.

## Output Schema

```json
{
  "pass_id": "footnote-v1",
  "ticker": "{TICKER}",
  "quarter": "{QUARTER}",
  "bctc_content_hash": "{hash}",
  "findings": [...],
  "pass_clean": true,
  "low_confidence_rows_skipped": 0
}
```

Emit output JSON block to session state variable `pass_5_result`. Do NOT write to disk.
