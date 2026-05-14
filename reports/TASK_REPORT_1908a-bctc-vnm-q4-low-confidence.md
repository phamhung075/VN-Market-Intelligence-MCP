# TASK_REPORT 1908a — BCTC VNM Q4 2025 Low Confidence Triage

**Spike date:** 2026-05-14
**Reporter:** dev-pdf-extractor
**Mode:** spike (timebox 90min)
**Telegram event:** Report 2878 — `[BCTC-1345b] Low financial confidence (composite=0.00, financial=0.00) VNM 2025-Q4`

---

## 1. Root Cause Category

**Category: (c) Extractor schema drift — balance sheet positional extraction error (totalAssets regex captured wrong row).**

Not OCR corruption, not PDF source corruption, not threshold misfire.

---

## 2. DB Row Inspection

```
action_code:          VNM
period:               2025-Q4
parsed_at:            2026-05-14T00:18:49.646Z
extraction_method:    pdf-parse
ocr_confidence:       0.75
confidence_financial: 0.00   ← hard fail
validation_status:    low_confidence
```

Extracted figures from `balance_sheet_json`:

| Field | Extracted | Expected (L+E) |
|---|---|---|
| totalAssets | 957,073 triệu (~957 tỷ) | ~53,312,371 triệu (~53,312 tỷ) |
| currentAssets.total | 36,261,181 triệu | correct |
| nonCurrentAssets.total | 17,051,190 triệu | correct |
| totalLiabilities | 18,829,355 triệu | correct |
| equity.total | 18,520,286 triệu | correct |
| totalLiabilitiesAndEquity | 15,063 triệu | wrong (another sub-total) |

---

## 3. Failure Chain

### Step A — Wrong row captured for `totalAssets`

PDF page 6 (non-current assets page) contains a value `957.072.946.110` VND which is the `Tài sản dài hạn khác` (Other Long-term Assets) sub-category row. The `extractSplitBlockAll` split-block parser mapped code "270" (TONG TAI SAN) to this value instead of the correct grand total (~53.3 trillion VND).

The correct total can be derived as `currentAssets.total + nonCurrentAssets.total = 36,261,181 + 17,051,190 = 53,312,371 triệu`. The fallback at line 714 (`if totalAssets === 0: totalAssets = currentAssets + nonCurrentAssets`) would fix this — but it never fires because `totalAssets = 957,073` (non-zero wrong value).

### Step B — BCTC-VAL-07 hard fail

With `totalAssets = 957,073` and `totalLiabilities = 18,829,355`:

```
liabilities / assets = 18,829,355 / 957,073 = 19.7x   → exceeds threshold 5x
BCTC-VAL-07: totalLiabilities > totalAssets * 5 → hard fail → confidence_financial = 0.0
```

### Step C — BCTC-VAL-01-POSITION guard NOT sufficient

The POSITION guard (committed 2026-05-02 in task 1815) addresses VAL-01 (assets < equity). It correctly detects that `netRevenue (63.6M) > totalAssets (957k) * 30` and applies a soft penalty instead of hard-failing VAL-01. However it does NOT protect against VAL-07 (liabilities > assets * 5), which fires independently and produces its own hard fail.

### Why it fired now

The VNM Q4 PDF was pulled and parsed at `2026-05-14T00:18Z`. The container at that point was an earlier build (container was restarted at `2026-05-14T04:26Z`). However, even the current container (with 1815 POSITION guard) would return `confidence_financial = 0.0` because VAL-07 hard-fails the record independently.

---

## 4. Systemic vs Single-Ticker

Q4 2025 survey shows two other tickers with `confidence_financial = 0.0`:

| Ticker | Cause | Pattern |
|---|---|---|
| VNM | VAL-07: liab/assets = 19.7x (totalAssets = wrong sub-total row) | Positional extraction error |
| BSR | VAL-01-SCALE: equity/assets = 876M× (raw VND vs triệu mismatch) | Unit mismatch (soft penalty should apply, but also VAL-08 probably fires due to zero revenue) |
| DIG | VAL-07: liab/assets = 28,460× (assets = wrong sub-total, equity in raw VND) | Combined positional + unit error |

**Assessment: SINGLE-TICKER pattern for the specific VAL-07+totalAssets mis-extraction, but the underlying root cause (wrong row positional capture in split-block parser) also affects DIG and likely the banking cohort PDFs arriving 2026-05-15 (which share VNM's multi-page label+value column layout).**

VCB Q4 2025 passes with `confidence_financial = 1.0` and `validation_status = passed`. FPT Q4 2025 also passes. The two failing cases (VNM, DIG) both have their `totalAssets` captured as a sub-item value rather than the grand total.

---

## 5. Fix Diagnosis

Two mitigations possible:

### Option A — VAL-07 positional guard (mirrors VAL-01-POSITION)

When `totalLiabilities > totalAssets * 5` AND `currentAssets.total + nonCurrentAssets.total > totalAssets * 5` (meaning sub-totals are self-consistent but totalAssets is a sub-value), apply soft penalty (BCTC-VAL-07-POSITION) instead of hard fail.

Detection condition:
```
totalLiabilities > totalAssets * 5
AND (currentAssets.total + nonCurrentAssets.total) > totalAssets * 5
AND (currentAssets.total + nonCurrentAssets.total) is within 5% of (totalLiabilities + equity.total)
```

This is safe to ship: it only fires when the self-computed sum from sub-totals contradicts the claimed totalAssets AND the sub-totals are internally consistent.

### Option B — Improve `extractBalanceSheet` fallback

Add a plausibility check after `totalAssets = fv(...)`: if the extracted `totalAssets` is implausibly small compared to either `currentAssets.total`, `nonCurrentAssets.total`, or `totalLiabilities + equity.total` (ratio > 5), discard it and recompute from sub-totals.

```typescript
const computedFromSubtotals = currentAssets.total + nonCurrentAssets.total;
if (totalAssets > 0 && computedFromSubtotals > 0 && computedFromSubtotals / totalAssets > 5) {
  totalAssets = computedFromSubtotals;  // override with reliable sum
}
```

**Option B is simpler, upstream fix, and prevents bad data entering the validator.** Option A is a downstream safety net. Both can coexist.

---

## 6. Recommended Next Step

**Action: spawn FIX task for `extractBalanceSheet` totalAssets plausibility override (Option B).**

Rationale:
- Option B eliminates the bad input before validation — cleaner than teaching the validator to tolerate structurally corrupt inputs
- The fix is testable: use VNM Q4 2025 OCR text as the test fixture
- After fix, reparse VNM by deleting the current row and triggering disk-scan
- Banking cohort arrives 2026-05-15 — fix should land before then to prevent the same false-zero on similar multi-page PDFs

**Reparse command (after fix deployed):**
```bash
docker exec vn-market-intelligence-mcp-mcp-server-1 python3 -c "
import sqlite3; conn = sqlite3.connect('/app/data/market.db'); cur = conn.cursor()
cur.execute(\"DELETE FROM financial_reports WHERE action_code='VNM' AND period_year=2025 AND period_quarter=4\")
conn.commit(); print('Deleted VNM Q4 2025 row. Run bctcReparseJob to reparse.')
"
```

**VNM is currently blocked for downstream FA tools** (`get_cash_flow`, `get_financial_report`, conviction signals). Flag as P1 given VN30 membership and banking cohort filing window.

---

## 7. Summary

| Dimension | Finding |
|---|---|
| Root cause category | (c) Extractor schema drift — positional extraction error |
| Specific rule | BCTC-VAL-07 hard fail (liab > assets * 5 = 19.7x) |
| Trigger | `extractSplitBlockAll` mapped code "270" (TONG TAI SAN) to wrong sub-item value `Tài sản dài hạn khác` |
| OCR quality | Good (confidence 0.8 per page, pdf-parse not OCR) |
| PDF source | Valid (all other fields extracted correctly) |
| Threshold misfire | No — the 0.0 is technically correct given the wrong totalAssets input |
| Systemic risk | Medium — DIG has same pattern; banking cohort (2026-05-15) may trigger same |
| Reparse needed | Yes — after fix for totalAssets plausibility |
| Priority | P1 (VN30 ticker + VNM downstream FA tools blocked + banking window tomorrow) |
