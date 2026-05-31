# BCTC Scalar Aggregator — Holistic Root-Cause Brief

**Sprint:** FU-TRUST-REFRESH | **Task:** FU-6-redo (architect escalation)
**Date:** 2026-05-31
**Zone:** apps/mcp-server/ only
**Author:** architect
**Implementor:** dev-mcp-server

---

## Executive Verdict

The bug is aggregator-only. Upstream OCR / refine / parse is correct. The rows in
`bctc_table_rows` contain the right label/value pairs. The aggregator's hardcoded code
assumptions do not match the actual data.

---

## 1. Evidence: What the Actual Rows Contain

### FPT (report e8ea3df5, Q1-2026, corporate Mẫu B01-DN)

Observed from direct `bctc_table_rows` query (all 145 rows, statement_section distribution:
`general` 88, `income_statement` 23, `cash_flow` 34 — zero `balance_sheet` rows):

| code | label | value_current (raw VND) |
|------|-------|------------------------|
| 280 | TỔNG CỘNG TÀI SẢN (280 = 100 + 200) | 68,586,094,785,217 |
| 440 | TỔNG CỘNG NGUỒN VỐN (440 = 300 + 400) | 68,586,094,785,217 |
| 270 | **V. Tài sản dài hạn khác** | 3,399,067,564,489 |
| 300 | C. NỢ PHẢI TRẢ | 28,464,058,214,856 |
| 400 | D. VỐN CHỦ SỞ HỮU | 40,122,036,570,361 |
| 100 | A. TÀI SẢN NGẮN HẠN | 41,527,873,060,120 |

**Finding — Q1 (Root cause of FPT wrong total_assets):**

FPT's Mẫu B01-DN uses code 280 for "TỔNG CỘNG TÀI SẢN" (total assets) and code 440
for "TỔNG CỘNG NGUỒN VỐN" (total sources = total assets from the equity side). This is
FPT's non-standard but valid layout: the Ministry of Finance B01-DN template defines code
270 as the grand-total on some older versions; FPT's consolidated BCTC uses 280 instead.

The OCR/refine step correctly assigned code 270 to "V. Tài sản dài hạn khác" (section V:
other long-term assets) because that is what FPT printed at code position 270 in their
report. The refine agent did NOT mis-label anything — it faithfully reproduced the FPT
balance sheet structure where 270 is a sub-section code, not the grand total.

The aggregator then searched for code "270" and found "Tài sản dài hạn khác"
(3.4T VND) instead of total assets (68.6T VND). This produced the wrong backfill
value (3,399,067M instead of 68,586,095M).

**Statement-section anomaly:** All FPT balance sheet rows landed in `statement_section =
"general"` rather than "balance_sheet". The section-header detector in
`refinedMarkdownParser.ts` (SECTION_HEADERS array, pattern `BẢNG CÂN ĐỐI KẾ TOÁN`) did
not fire, presumably because the FPT refine output for balance sheet pages did not include
the canonical section header on the same page-window. This is a known gap (BCTC-LAYOUT-FIRST
territory) and is NOT the cause of the scalar bug — the aggregator falls back to
`findByLabel(rows, "general", ...)` for the bank path but not for corporate code-based
lookup, so the section mismatch exposed the wrong-code assumption faster.

### ACB (report fea19bae, Q1-2026, bank Mẫu B02-TCTD)

Observed rows (95 `general` rows, 11 `cash_flow` rows, zero `income_statement` rows):

**Balance sheet grand totals (with `is_summary_row = 1`):**

| code | label | value_current (million VND) |
|------|-------|---------------------------|
| null | TỔNG TÀI SẢN | 1,030,900,741 |
| null | TỔNG NỢ PHẢI TRẢ | 932,149,689 |
| null | TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU | 1,030,900,741 |
| VIII | VỐN CHỦ SỞ HỮU | 98,751,052 |

**Income statement (no separate `income_statement` section — all in `general`):**

| code | label | value_current |
|------|-------|---------------|
| I | Thu nhập lãi thuần | 6,989,162 |
| XIII | Lợi nhuận sau thuế | 4,320,388 |
| XI | Tổng lợi nhuận trước thuế | 5,368,138 |

**Finding — ACB wrong equity_total:**

The aggregator's bank equity label-pattern search (`P_BANK_EQUITY = /v[oố]n\s+ch[uủ]\s+s[oở]\s+h[uữ]u/i`)
matches the first row containing "vốn chủ sở hữu" in section "balance_sheet". But ACB has
zero rows in `statement_section = "balance_sheet"` — all rows are in `"general"`. The
aggregator falls back to `findByLabel(rows, "general", P_BANK_EQUITY)`.

In the `general` section, the pattern fires on code "VIII" / label "VỐN CHỦ SỞ HỮU"
(value 98,751,052). This is actually CORRECT for equity. The bug is elsewhere:

**ACB wrong total_assets:** `P_BANK_TOTAL_ASSETS = /t[oổ]ng\s+t[aà]i\s+s[aả]n/i` matches
`findByLabel(rows, "general", ...)`. The `general` section has TWO rows that match this
pattern:
- code null, label "TỔNG TÀI SẢN", value 1,030,900,741, is_summary_row = 1
- code null, label "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU", value 1,030,900,741, is_summary_row = 1

`findByLabel` returns the first summary match. The first match IS the correct TỔNG TÀI SẢN
(1,030,900,741M). So `total_assets` is CORRECT.

**ACB wrong equity_total (confirmed):** The `findByLabel` for equity fires on:
- code "VIII", label "VỐN CHỦ SỞ HỮU", value 98,751,052 — this IS the correct equity row.

Wait — the live DB shows `equity_total = 1,030,900,741` (same as total_assets). Re-examining:

The ACB `general` section contains an earlier row:
- code null, label "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU", value 1,030,900,741, is_summary_row = 1

This row does NOT match `P_BANK_EQUITY` (no "vốn chủ sở hữu" without "tổng nợ phải trả"
prefix? No — `P_BANK_EQUITY` is a substring match so "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ
HỮU" does contain "vốn chủ sở hữu" and the regex will match it). This is the ordering bug:
`findByLabel` returns the first summary row matching the pattern, and the first match in
`general` order is "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" (1,030,900,741) not the
section-VIII "VỐN CHỦ SỞ HỮU" (98,751,052).

**ACB wrong net_revenue:** The aggregator searches code "I" first. ACB has multiple rows
with code "I":
- code "I", label "Tiền mặt, vàng bạc, đá quý", value 8,157,465 (a balance sheet asset line)
- code "I", label "Thu nhập lãi thuần", value 6,989,162 (correct income line)

`findByCode` returns the first match for code "I" without section filter — it picks
"Tiền mặt, vàng bạc, đá quý" (8,157,465) rather than "Thu nhập lãi thuần" (6,989,162).
This is a code collision: bank balance sheet and income statement both use Roman numeral "I"
for different line items.

**Summary of confirmed bugs:**

| Ticker | Scalar | Bug Mechanism | Wrong Value | Correct Value |
|--------|--------|---------------|-------------|---------------|
| FPT | total_assets | Code "270" maps to wrong row | 3,399,067M | 68,586,095M |
| ACB | equity_total | Label pattern matches "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" first | 1,030,900,741M | 98,751,052M |
| ACB | net_revenue | Code "I" collision: balance sheet "Tiền mặt" beats income "Thu nhập lãi thuần" | 8,157,465M | 6,989,162M |

---

## 2. Root-Cause Verdict

**Cause A — FPT total_assets: wrong code assumption.** The aggregator assumes code "270"
= TỔNG CỘNG TÀI SẢN. Standard Mẫu B01-DN (Circular 200) uses code 270 in some editions;
FPT's Q1-2026 uses code 280. Code 440 (Tổng cộng nguồn vốn, equity side) IS present and
equals 68,586,094,785,217 VND. The fallback to code "440" would give the right answer —
but only if code "270" returns null first. Since code "270" IS present (as "Tài sản dài
hạn khác"), the fallback never fires.

**Cause B — ACB equity_total: label pattern too broad.** The equity label pattern matches
the composite label "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" before the pure "VỐN CHỦ SỞ
HỮU" row because the composite row appears earlier in row_order AND has is_summary_row=1.
"First summary match wins" is order-dependent and grabs the wrong row.

**Cause C — ACB net_revenue: no section filter on code lookup.** `findByCode` searches
ALL rows regardless of `statement_section`. Roman numeral code "I" appears in both the
bank balance sheet section (Tiền mặt, vàng bạc, đá quý) and the income statement
(Thu nhập lãi thuần). First occurrence in the row array wins — wrong row.

**Upstream verdict: CLEAN.** The OCR text, the refine agent output, and the
`refinedMarkdownParser` all produced correct data. The evidence is conclusive:
- FPT code 280 label is "TỔNG CỘNG TÀI SẢN (280 = 100 + 200)" — refine got it right.
- FPT code 270 label is "V. Tài sản dài hạn khác" — correct per FPT's actual BCTC.
- ACB equity code VIII label is "VỐN CHỦ SỞ HỮU", value 98,751,052 — correct.
The aggregator is the only locus. Zero upstream changes required.

---

## 3. Resolution Strategy: Hybrid Code + Label with Invariant Enforcement

**Chosen approach: LABEL-CANONICAL with code as secondary tiebreaker, plus balance-identity
invariant as the fail-loud correctness gate.**

Rationale:
- Pure code-based is fragile: codes vary by issuer (270 vs 280 for total assets) and
  collide across sections (code "I" in bank balance sheet vs income statement).
- Pure label-based is order-dependent: "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" beats
  "VỐN CHỦ SỞ HỮU" because it appears first.
- Hybrid with invariant: resolve by the most specific matching label, then validate the
  result against the accounting identity. A wrong pick fails the invariant and is rejected
  loudly rather than silently written.

### 3a. Corporate balance sheet resolution (Mẫu B01-DN)

**total_assets:** Do NOT search by code first. Search for grand-total label patterns:
- Primary: label matches `TỔNG CỘNG TÀI SẢN|TỔNG TÀI SẢN` (case-insensitive, accent-tolerant)
- Secondary: code is one of `["280", "270", "440"]` (as confirming tiebreaker only)
- If label match found but code is "440" (equity side) AND a different row matches the label
  pattern with code "280"/"270" → prefer the asset-side row.
- current_assets (code "100") and long_term_assets (code "200") are sub-totals — their sum
  should equal total_assets; use as cross-check (see Section 4).

**total_liabilities (code "300"):** Code "300" is stable across B01-DN editions. Keep
code-first lookup, but add label confirmation: the matched row's label must contain "nợ phải
trả" (case-insensitive). If code "300" exists but its label does NOT contain "nợ phải trả",
log WARN and fall back to label search.

**equity_total (code "400"):** Code "400" is stable. Same label confirmation: label must
contain "vốn chủ sở hữu". If mismatch, fall back to label.

### 3b. Bank balance sheet resolution (Mẫu B02-TCTD)

**total_assets:** Label-canonical with EXCLUSION filter. Search for the SHORTEST label
matching `tổng.*tài sản` and containing NEITHER "nợ" NOR "nguồn vốn" NOR "phải trả". This
eliminates "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" from matching. Priority: is_summary_row=1.

**total_liabilities:** Label must match `tổng.*nợ.*phải trả` and NOT contain "vốn chủ sở
hữu". The pure "TỔNG NỢ PHẢI TRẢ" row (code null, value 932,149,689) matches cleanly.

**equity_total:** Exclusion-filtered label search: match `vốn.*chủ.*sở.*hữu` but EXCLUDE
rows whose label also contains "tổng nợ phải trả" or "nguồn vốn". The section-VIII
"VỐN CHỦ SỞ HỮU" (98,751,052) is the correct match.

### 3c. Income statement — section-scoped code lookup

**Critical fix for ACB net_revenue:** `findByCode` for income statement codes (I, VIII, IX,
10, 20, 50, 60) MUST filter by `statement_section IN ("income_statement", "general")` AND
additionally prefer rows whose label semantically matches the expected meaning:
- Code "I" must match a row where label contains "thu nhập" (income) or "doanh thu"
  (revenue). A code "I" row whose label contains "tiền mặt" (cash) is a balance sheet
  asset and must be skipped.

**Implementation:** Add an optional `labelHint: RegExp` parameter to `findByCode`. When
provided, filter the matching rows to those whose label also matches the hint before
applying the summary-row preference. If no rows pass the hint, fall back to the un-hinted
result with a WARN log.

---

## 4. Fail-Loud Balance-Identity Invariant

After scalar resolution, the aggregator MUST enforce the balance sheet identity before
returning. A result that violates the identity is internally inconsistent and must not be
written silently.

**Identity (both corporate and bank):**

```
total_assets ≈ total_liabilities + equity_total
```

**Tolerance:** 1% of total_assets (VND rounding across thousands of rows).

**Enforcement logic (new private function `enforceBalanceIdentity`):**

```typescript
function enforceBalanceIdentity(
  total_assets: number | null,
  total_liabilities: number | null,
  equity_total: number | null,
  reportId: string,
): void {
  // Only enforce when all three are non-null and non-zero
  if (total_assets === null || total_liabilities === null || equity_total === null) return;
  if (total_assets === 0) return;

  const computed = total_liabilities + equity_total;
  const deviation = Math.abs(computed - total_assets) / total_assets;

  if (deviation > 0.01) {
    // FAIL LOUD: log error, throw — never write inconsistent scalars
    const msg =
      `[bctcScalarAggregator] BALANCE IDENTITY VIOLATED for ${reportId}: ` +
      `total_assets=${total_assets} ≠ liabilities(${total_liabilities}) + equity(${equity_total}) = ${computed} ` +
      `(deviation=${(deviation * 100).toFixed(2)}%)`;
    logger.error(msg);
    throw new Error(msg);
  }
}
```

The caller (`finalizeBctcRefineTool.ts`) already wraps the scalar backfill in a try/catch
that logs WARN and continues on error. The identity violation will surface in logs and block
the scalar UPDATE, leaving the columns at their pre-finalize values (stale but not silently
wrong). This is the correct degradation — ops sees the error in logs, re-finalize after fix.

**Additional cross-check for total_assets (corporate only):**

When `current_assets` (code "100") and long-term assets (code "200") are both resolved,
validate: `current_assets + long_term_assets ≈ total_assets` (1% tolerance). If violated,
log WARN (not throw — this is advisory since long_term_assets may not always resolve).

---

## 5. False-Green Explanation: Why FU-5b Audit Passed

The FU-5b "one-pass fail-loud audit" checked whether `aggregateScalars` resolved scalars
to non-null values. It did: all 8 scalar columns mapped. The audit checked mapping
EXISTENCE, not VALUE CORRECTNESS.

The test `DV-FU5-1` seeded rows with the CORRECT values (code "270" mapped to
68,586,094,785,217 VND, labeled "Tổng tài sản") in an in-memory test DB. This is not
what the LIVE DB contains — in the live DB, code "270" is "Tài sản dài hạn khác"
(3,399,067,564,489 VND). The test used idealized fixture data instead of realistic data
matching the actual refine output.

Root cause of the false-green: `DV-FU5-1` and `DV-FU5-2` assumed that code "270" and
code "I" are unambiguous in real data. They are not:
- DV-FU5-1 seeded code "270" → "Tổng tài sản" (ideal). Real FPT: code "270" → "Tài sản dài hạn khác".
- DV-FU5-6 seeded code "I" → "Thu nhập lãi thuần" (ideal). Real ACB: code "I" also appears as "Tiền mặt, vàng bạc, đá quý".

The tests verified the aggregator logic in an idealized environment where codes are unique
and correctly labeled. Real BCTC data is not idealized. The balance-identity invariant is
the natural correctness gate that would have caught both failures because:
- FPT: resolved total_assets = 3,399,067M, liabilities = 28,464,058M, equity = 40,122,037M
  → 28,464,058 + 40,122,037 = 68,586,095 ≠ 3,399,067 → deviation = 1,900% → VIOLATION THROWN
- ACB: resolved equity_total = 1,030,900,741M, liabilities = 932,149,689M, total_assets = 1,030,900,741M
  → 932,149,689 + 1,030,900,741 = 1,963,050,430 ≠ 1,030,900,741 → deviation = 90.4% → VIOLATION THROWN

**Both bugs are caught by the invariant.** The invariant is not a heuristic — it is the
definition of a correct balance sheet. No correct resolution can violate it.

---

## 6. Audit-Correctness Upgrade

The existing tests must be replaced/extended so that "resolves to a row" never again
passes as proof of correctness:

**New mandatory test cases (RED-before-GREEN):**

**DV-FU6-1 — FPT realistic rows (the actual mislabeling scenario):**
Seed rows where code "270" = "V. Tài sản dài hạn khác" (3,399,067M) AND code "280" =
"TỔNG CỘNG TÀI SẢN" (68,586,095M). Assert:
- `agg.total_assets` = 68,586,095M (NOT 3,399,067M)
- Balance identity holds: |liabilities + equity - total_assets| / total_assets < 0.01

**DV-FU6-2 — Balance identity catch (deliberate wrong-row pick):**
Seed rows where code "270" is assigned both correct and incorrect values simultaneously
(two rows with code "270", one a sub-section, one the grand total). Assert that:
- If aggregator picks the wrong row → balance identity THROWS (is_summary_row preference
  resolves the ambiguity, but if it picks wrong → invariant fires)
- This is the anti-false-green test: the test MUST fail-before-fix with the old code and
  pass-after-fix with the new label-canonical strategy + invariant.

**DV-FU6-3 — ACB realistic code collision (code "I" in two sections):**
Seed rows where code "I" appears as BOTH "Tiền mặt, vàng bạc, đá quý" (balance sheet,
value 8,157,465) AND "Thu nhập lãi thuần" (income, value 6,989,162). Assert:
- `agg.net_revenue` = 6,989,162 (income row, not balance sheet row)
- Verify the labelHint mechanism filtered the wrong row

**DV-FU6-4 — ACB equity label exclusion:**
Seed rows where "TỔNG NỢ PHẢI TRẢ VÀ VỐN CHỦ SỞ HỮU" (1,030,900,741) appears before
"VỐN CHỦ SỞ HỮU" (98,751,052) in row_order, both is_summary_row=1. Assert:
- `agg.equity_total` = 98,751,052 (NOT 1,030,900,741)
- Balance identity holds: 932,149,689 + 98,751,052 ≈ 1,030,900,741 ✓

**DV-FU6-5 — Invariant fires on deliberately wrong resolution:**
Seed: total_assets = 3,399,067M, total_liabilities = 28,464,058M, equity = 40,122,037M.
Assert: `aggregateScalars` throws (or returns with invariant violation flag) and does NOT
silently return the inconsistent scalars.

**Upgrade to existing DV-FU5-1 and DV-FU5-2:**
Replace idealized code fixtures with realistic ones matching live DB patterns. DV-FU5-1
must use code "280" for total assets (FPT realistic). DV-FU5-2 must include the code "I"
collision scenario and the equity label ordering scenario.

---

## 7. Change List for dev-mcp-server

### File: `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`

**Function `findByCode` — add optional `labelHint` parameter:**
```typescript
function findByCode(
  rows: AggregatorRow[],
  code: string,
  labelHint?: RegExp,
  statementSection?: string,
): number | null
```
When `statementSection` is provided, filter to rows in that section. When `labelHint` is
provided, further filter to rows where label matches the hint. Fall back to un-hinted if
no hinted match found (with WARN log).

**New function `findByLabelExcluding`:**
```typescript
function findByLabelExcluding(
  rows: AggregatorRow[],
  section: string,
  includePattern: RegExp,
  excludePattern: RegExp,
): number | null
```
Returns first summary-preferred match where label matches `includePattern` AND does NOT
match `excludePattern`.

**New function `findTotalAssetsCorporate`:**
Searches for the balance sheet grand-total using label-canonical strategy:
1. Look for rows where label matches `/tổng cộng tài sản|tổng tài sản/i` in any section.
2. Among matches, prefer rows where code is one of ["280", "270"] over code "440" (equity side).
3. Return the best match. If only code "440" found, use it (Tổng cộng nguồn vốn = same value).

**New private function `enforceBalanceIdentity`:** As specified in Section 4.

**Updated `aggregateScalars` — corporate total_assets resolution:**
Replace:
```typescript
let total_assets = scale(findByCode(rows, "270"));
if (total_assets === null) total_assets = scale(findByCode(rows, "440"));
```
With:
```typescript
let total_assets = scale(findTotalAssetsCorporate(rows));
```

**Updated `aggregateScalars` — bank equity resolution:**
Replace:
```typescript
equity_total = scale(
  findByLabel(rows, "balance_sheet", P_BANK_EQUITY) ??
  findByLabel(rows, "general", P_BANK_EQUITY),
);
```
With:
```typescript
equity_total = scale(
  findByLabelExcluding(rows, "balance_sheet", P_BANK_EQUITY, P_BANK_EQUITY_EXCLUDE) ??
  findByLabelExcluding(rows, "general", P_BANK_EQUITY, P_BANK_EQUITY_EXCLUDE),
);
```
Where `P_BANK_EQUITY_EXCLUDE = /tổng nợ phải trả|nguồn vốn/i`.

**Updated `aggregateScalars` — bank total_assets resolution:**
Replace `P_BANK_TOTAL_ASSETS` with exclusion-filtered search:
```typescript
total_assets = scale(
  findByLabelExcluding(rows, "balance_sheet", P_BANK_TOTAL_ASSETS, /nợ|nguồn vốn|phải trả/i) ??
  findByLabelExcluding(rows, "general",       P_BANK_TOTAL_ASSETS, /nợ|nguồn vốn|phải trả/i),
);
```

**Updated `aggregateScalars` — bank net_revenue code "I" resolution:**
Add `labelHint` to the code "I" lookup:
```typescript
let net_revenue = scale(findByCode(rows, "10"));
if (net_revenue === null) {
  // Bank code "I": must match income rows, not balance sheet assets
  net_revenue = scale(findByCode(rows, "I", /thu nhập|doanh thu/i));
}
```

**Call `enforceBalanceIdentity` at the end of `aggregateScalars`** before the return
statement:
```typescript
enforceBalanceIdentity(total_assets, total_liabilities, equity_total, "aggregation");
```
(Caller catches the throw and logs WARN; scalar columns are not updated on violation.)

**Add `logger` import to `bctcScalarAggregator.ts`** (currently zero imports). This is
the only non-pure addition. It remains in the domain layer because logging is not I/O in
the DDD sense — it is observability infrastructure. Alternatively, the invariant can
return a structured result `{ ok: boolean; violation?: string }` and the caller logs.
**Preferred:** return structured result (keeps domain layer pure, caller logs). See below.

**Alternative (PREFERRED — keeps domain pure):** `aggregateScalars` returns:
```typescript
export interface ScalarAggregateResult {
  scalars: ScalarAggregate;
  balanceViolation: string | null; // null = ok, string = violation message
}
```
The caller in `finalizeBctcRefineTool.ts` checks `balanceViolation !== null`, logs.error,
and skips the UPDATE (does NOT throw — non-fatal per existing error boundary).

### File: `apps/mcp-server/src/__tests__/FU-6-scalar-correctness.test.ts`

**New test file.** Contains DV-FU6-1 through DV-FU6-5 as specified in Section 6.
Must follow RED-before-GREEN protocol:
- Each test documents what it produces before the fix (wrong value or missing throw).
- After fix, all 5 pass.

### File: `apps/mcp-server/src/__tests__/FU-5-scalar-backfill.test.ts`

**Existing file — amend DV-FU5-1 and DV-FU5-2:**
- DV-FU5-1: Change code "270" seed from "Tổng tài sản" (ideal) to "V. Tài sản dài hạn
  khác" (realistic), add code "280" → "TỔNG CỘNG TÀI SẢN (280 = 100 + 200)". Assert
  `total_assets` resolves to code "280" value, not code "270" value.
- DV-FU5-2: Add code "I" collision scenario (two rows: balance sheet + income). Assert
  net_revenue resolves to income row.

### File: `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`

**No logic changes.** One change: update the `aggregateScalars` call site to handle the
new structured return type `ScalarAggregateResult`:
```typescript
const aggResult = aggregateScalars(scalarRows);
if (aggResult.balanceViolation) {
  logger.error("[finalize_bctc_refine] balance identity violated — scalar UPDATE skipped", {
    report_id,
    violation: aggResult.balanceViolation,
  });
  // do NOT proceed to UPDATE; existing scalars preserved (stale but not wrong)
} else {
  // existing UPDATE logic, reading from aggResult.scalars
}
```

---

## 8. Upstream Change Required?

**No upstream changes.** The refine/parse pipeline (pdf-extractor, refinedMarkdownParser,
bctcMagnitudeValidator) is clean. The rows in `bctc_table_rows` are correct. The
aggregator is the sole locus of the bugs. FPT re-refine (FU-6 ops step) is still needed
to produce real-OCR rows, but the aggregator fix is independent and must be done before
the re-finalize.

---

## 9. Sequencing

1. `dev-mcp-server` implements `FU-6-redo` changes (aggregator + tests) on main.
2. `ops` rebuilds mcp-server container.
3. `ops` re-finalizes FPT (e8ea3df5-3f32-413d-a3eb-c71634c0438d) and ACB (fea19bae-2b7a-4954-b3e0-e09d7bfc7390).
4. `qa` re-gates: reads `get_bctc_full` for both reports, verifies balance identity holds
   in the raw values (FPT total_assets ≈ 68,586,095M; ACB equity ≈ 98,751,052M).

---

## 10. Build Standard

**BUILD-STANDARD: lean** (existing zone, no new primitives beyond the structured return
type, no new DB schema, no new MCP tools).
**ZONE:** apps/mcp-server/

---

## RETURN

```
DONE: Architecture brief written — bctcScalarAggregator root-cause, resolution strategy,
      fail-loud invariant, audit upgrade, dev change list.
ZONE: apps/mcp-server/
NEXT: pm | create FU-6-redo dev task from this brief
HANDOFF: docs/architecture-briefs/2026-05-31-bctc-scalar-aggregator-root-cause.md
PIPELINE: continue
```
