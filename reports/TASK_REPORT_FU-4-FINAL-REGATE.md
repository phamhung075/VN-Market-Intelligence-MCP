# Task Report: FU-4 FINAL RE-GATE — FU-TRUST-REFRESH
date: 2026-05-31
sprint: FU-TRUST-REFRESH
task: FU-4 FINAL RE-GATE (after FU-6d bank-path fix + FU-6-redo-3 re-finalize)
method: direct in-container bun:sqlite + local source code inspection
outcome: CHANGES_REQUESTED — 1 new blocking (DT-2 ACB gross_profit not null)

---

## VERIFICATION 1: Raw in-container bun:sqlite reads

### FPT — e8ea3df5-3f32-413d-a3eb-c71634c0438d (FULL SCALAR ROW)

```
id:                 e8ea3df5-3f32-413d-a3eb-c71634c0438d
action_code:        FPT
period_type:        Q1 / 2026
net_revenue:        12,479,997.206775  (M VND)
gross_profit:        4,244,889.890688
profit_before_tax:   2,803,844.281676
net_profit:          2,476,789.833481
total_assets:       68,586,094.785217
total_liabilities:  28,464,058.214856
equity_total:       40,122,036.570361
gross_margin_pct:   34.01%
net_margin_pct:     19.85%
refine_status:      DONE
confirm_status:     PENDING
bctc_table_rows:    145 rows
refined_units:      15 units, latest_refined_at = 2026-05-31 11:19:09
```

### ACB — fea19bae-2b7a-4954-b3e0-e09d7bfc7390 (FULL SCALAR ROW)

```
id:                 fea19bae-2b7a-4954-b3e0-e09d7bfc7390
action_code:        ACB
period_type:        Q1 / 2026
net_revenue:         6,989,162  (M VND)
gross_profit:        6,989,162  ← EQUAL TO net_revenue (should be NULL for bank)
profit_before_tax:   5,368,138
net_profit:          4,320,388
total_assets:    1,030,900,741
total_liabilities:  932,149,689
equity_total:       98,751,052
gross_margin_pct:   100.00%  ← WRONG (derived from gross_profit = net_revenue)
net_margin_pct:     61.82%
refine_status:      DONE
confirm_status:     PENDING
bctc_table_rows:    106 rows
refined_units:      27 units, latest_refined_at = 2026-05-31 11:21:12
```

---

## VERIFICATION 2: Prior BLOCK-A / BLOCK-B / BLOCK-C Resolution

### BLOCK-A — ACB equity_total (prior: stale 1,030,900,741 = total_assets)

Current stored value: **98,751,052** (RESOLVED)
- Expected: ≈98,751,052
- Prior wrong value: 1,030,900,741 (= total_assets)
- Status: PASS — BLOCK-A RESOLVED

### BLOCK-B — ACB profit_before_tax and net_profit (prior: wrong row picks)

Current stored values:
- profit_before_tax: **5,368,138** (RESOLVED — was 147,029,433)
- net_profit: **4,320,388** (RESOLVED — was 74,311)
- Status: PASS — BLOCK-B RESOLVED

### BLOCK-C — enforceBalanceIdentity fail-loud on null required scalar

Source inspection confirms fix at `bctcScalarAggregator.ts` lines 330-365:
```typescript
// FU-6d BLOCK-C: if any one is non-null but another is null → VIOLATION (not silent skip)
const allAbsent = total_assets === null && total_liabilities === null && equity_total === null;
if (allAbsent) return null;  // structurally absent — skip
if (total_assets === null || total_liabilities === null || equity_total === null) {
  const missing = [...].filter(...).join(", ");
  return `REQUIRED SCALARS UNRESOLVED: ${missing} — balance identity cannot be verified`;
}
```
- Status: PASS — BLOCK-C RESOLVED (fail-loud confirmed in source)

---

## VERIFICATION 3: FPT Regression Confirm

Checklist against expected values:
- total_assets = 68,586,094.785217 (expected ≈68,586,094): PASS
- equity_total = 40,122,036.570361 (expected ≈40,122,037): PASS
- gross_profit = 4,244,889.890688 (expected ≈4,244,890): PASS
- net_profit = 2,476,789.833481 (expected ≈2,476,790): PASS
- Balance: 28,464,058.214856 + 40,122,036.570361 = 68,586,094.785217 = total_assets → 0.0000% deviation: PASS
- DT-2 gross ≠ net: 4,244,890 ≠ 12,479,997 (34% margin): PASS
- confirm_status = PENDING: PASS
- bctc_table_rows = 145: PASS

---

## VERIFICATION 4: DT-1 and DT-2 Scans

### DT-1 — Digit-run scan (both reports)

Scanned: net_revenue, gross_profit, profit_before_tax, net_profit, equity_total, total_assets
- FPT: CLEAN — no pattern matching /12345|23456|11111|22222/ found
- ACB: CLEAN — no pattern matching found (5,368,138 / 4,320,388 / 98,751,052 / 1,030,900,741 all real)

### DT-2 — gross = net check

- FPT: gross_profit (4,244,890) ≠ net_revenue (12,479,997): PASS
- ACB gross_profit = net_revenue = 6,989,162: **FAIL**
  - code "20" does NOT exist in ACB bctc_table_rows (confirmed by direct DB query: 0 rows)
  - aggregateScalars() returns gross_profit=null for ACB (correct: bank has no gross profit concept)
  - finalizeBctcRefineTool.ts line 423: `if (agg.gross_profit !== null)` → null-skip fires → stale 6,989,162 persists
  - ops notebook confirms: ACB FU-6d re-finalize updated_cols = [net_revenue, profit_before_tax, net_profit, total_assets, total_liabilities, equity_total, net_margin_pct] — gross_profit is ABSENT from updated list
  - The legacy pdf-parse extraction value (6,989,162 = net_interest_income) was never cleared
  - income_stmt_json.grossProfit = 6,989,162 (json also stale)
  - ACB gross_profit SHOULD be NULL: **FAIL**

---

## VERIFICATION 5: get_bctc_full serving layer

`get_bctc_full` reads directly from financial_reports columns via `buildSummarySection()`:
```
Net Revenue      : row.net_revenue
Gross Profit     : row.gross_profit  (fmtBillions + gross_margin_pct)
Net Profit       : row.net_profit
Equity           : row.equity_total
Total Assets     : row.total_assets
```

What get_bctc_full would serve for each report (derived from raw row values):

**FPT:**
```
Net Revenue      : 12.480,0 tỷ VND
Gross Profit     : 4.244,9 tỷ VND  (34.0%)
Net Profit       : 2.476,8 tỷ VND  (19.8%)
Total Assets     : 68.586,1 tỷ VND
Equity           : 40.122,0 tỷ VND
Total Liab.      : 28.464,1 tỷ VND
```
Status: CORRECT — real, balanced scalars.

**ACB:**
```
Net Revenue      : 6.989,2 tỷ VND   (correct — net interest income)
Gross Profit     : 6.989,2 tỷ VND  (100.0%)  ← WRONG: equals net_revenue; should be null/N/A for bank
Profit Bef Tax   : 5.368,1 tỷ VND   (CORRECT — was 147,029,433)
Net Profit       : 4.320,4 tỷ VND   (CORRECT — was 74,311)
Total Assets     : 1.030.900,7 tỷ VND  (CORRECT)
Equity           : 98.751,1 tỷ VND   (CORRECT — was 1,030,900,741)
Total Liab.      : 932.149,7 tỷ VND   (CORRECT)
```
Status: MOSTLY CORRECT — 5 of 7 key scalars now real. gross_profit still wrong (100% margin).

---

## VERIFICATION 6: bctc_eval, refined_at, confirm_status, row counts

### FPT
- bctc_eval overall_status: yellow (stages 1-3 backfill placeholder; stage 4 green; stages 5-6 yellow)
- bctc_eval stage-4 TABLE_RECONSTRUCT: green, label_coverage=1, code_coverage=1, exact_dup_count=0, total_rows=145, computed_at=2026-05-31 13:44:27 (FRESH TODAY)
- refine_status: DONE
- confirm_status: PENDING
- bctc_table_rows: 145 (retained)
- refined_units: 15 units, latest_refined_at=2026-05-31 11:19:09

### ACB
- bctc_eval overall_status: yellow (stages 1-3 backfill placeholder; stage 4 green; stages 5-6 yellow)
- bctc_eval stage-4 TABLE_RECONSTRUCT: green, label_coverage=1, code_coverage=0.943, exact_dup_count=0, total_rows=106, computed_at=2026-05-31 13:44:24 (FRESH TODAY)
- refine_status: DONE
- confirm_status: PENDING
- bctc_table_rows: 106 (retained)
- refined_units: 27 units, latest_refined_at=2026-05-31 11:21:12

Note: bctc_eval stages 1-3 are yellow (backfill placeholders — pre-existing, non-blocking per prior QA decisions). Stage-4 green for both. No red stage. eval freshness: TODAY (2026-05-31). Non-blocking per flow definition (404/409 → non-blocking; yellow → CAUTION logged, not blocking; red → hard fail).

---

## Test Suite

Files in FU-6d commit scope:
- `apps/mcp-server/src/__tests__/FU-6d-scalar-correctness.test.ts`
- `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`

Results:
- FU-6d-scalar-correctness.test.ts: **12 pass / 0 fail** (63 expect() calls)
- bun tsc --noEmit: **0 errors**
- mock-guard: **PASS** (exit 0, no fabricated-data patterns)
- DDD: PASS (bctcScalarAggregator.ts is domain layer, zero infrastructure imports)
- Security: PASS (no process.env, no hardcoded credentials)

---

## Issues Found

### Blocking — 1 issue

**DT-2-ACB: ACB gross_profit = net_revenue (6,989,162) — should be NULL for bank**

File: `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`
Line: ~423 — `if (agg.gross_profit !== null) updates.push(...)` — null-skip does not clear stale value

Root cause: The finalize tool uses a conditional-null-skip pattern for all scalar columns:
only write the column if the aggregator resolved a non-null value. For banks, the aggregator
correctly returns `gross_profit=null` (code "20" absent). But the null-skip means the legacy
pdf-parse value (6,989,162, copied from net_interest_income) is never cleared. For corporate
reports this is usually benign (aggregator resolves real gross_profit). For banks where the
concept is structurally absent, the stale value is actively misleading (implies 100% margin).

Fix required: finalizeBctcRefineTool.ts must write `null` for gross_profit when the report is
identified as a bank (domain="banking" or by ticker-type lookup), OR the null-skip must have an
exception for legitimately-null fields where the aggregator intentionally returns null. Simplest:
add a `nullable_cols` list (e.g., `["gross_profit"]`) that may be explicitly set to null when
aggregator returns null for a bank path.

get_bctc_full impact: serves `Gross Profit: 6.989,2 tỷ VND (100%)` for ACB — not analysis-grade.

### Non-Blocking

- bctc_eval stages 1-3/5-6: yellow (backfill placeholders, pre-existing, not introduced by FU-6d)
- FPT gross_profit stored as float 4,244,889.890688 — correct value, rounding artifact, non-blocking
- ACB income_stmt_json.grossProfit = 6,989,162 (stale JSON blob) — mirrors the column issue; same root cause; fix should update both

---

## Prior Blocker Resolution Summary

| Blocker | Status | Evidence |
|---------|--------|----------|
| BLOCK-A: ACB equity_total wrong (1,030,900,741) | RESOLVED | Stored: 98,751,052 — exact match expected |
| BLOCK-B: ACB PBT wrong (147,029,433) | RESOLVED | Stored: 5,368,138 |
| BLOCK-B: ACB net_profit wrong (74,311) | RESOLVED | Stored: 4,320,388 |
| BLOCK-C: enforceBalanceIdentity fail-open | RESOLVED | Source lines 330-365 — returns violation string on null component |
| DT-2-ACB: gross_profit = net_revenue (NEW this gate) | NOT RESOLVED | Stored: 6,989,162 = net_revenue; aggregator returns null; null-skip leaves stale |

---

## Verdict: CHANGES_REQUESTED

BLOCK-A, BLOCK-B, BLOCK-C are fully resolved and confirmed by raw DB reads. The 3 original
ACB blockers are gone. FPT is a clean regression-confirm: all 5 expected scalars correct,
balance 0%, gross≠net, bctc_eval fresh, get_bctc_full serves correct figures.

ACB balance sheet identity now holds: |932,149,689 + 98,751,052 − 1,030,900,741| = 0 (0.00%).
The fail-loud invariant is proven in source and in FU-6d-scalar-correctness.test.ts (12/12).

However, DT-2 fails for ACB: gross_profit = net_revenue = 6,989,162 (stale legacy value).
Banks have no gross profit concept. The aggregator correctly returns null. The finalize
null-skip leaves the old pdf-parse value intact. get_bctc_full will serve a spurious 100%
gross margin for ACB until this is corrected.

## RETURN

```
DONE: FU-4 FINAL RE-GATE complete — 1 new blocking found
NEXT: dev-mcp-server | fix finalizeBctcRefineTool.ts null-skip to explicitly zero/null
      gross_profit for bank reports; re-finalize ACB; re-gate
PIPELINE: continue
```
