# Bank-Aware BCTC Architecture Brief

**Sprint:** BANK-AWARE-BCTC | **Task:** BANK-ARCH (hard gate)
**Date:** 2026-05-31
**Zone:** apps/mcp-server/ only
**Author:** architect
**Implementor:** dev-mcp-server
**Predecessor brief:** `docs/architecture-briefs/2026-05-31-bctc-scalar-aggregator-root-cause.md`

---

## 1. Problem Statement

ACB's `get_bctc_full` is still blocked post FU-TRUST-REFRESH EXIT-with-caveat. The scalar
data is now correct (balance identity 0.000%, equity=98,751,052M, total_assets=1,030,900,741M)
but the SERVING layer refuses to publish it. This is the fourth time a bank-vs-corporate
mismatch has been patched as a one-off point fix (FU-6c/FU-6d/FU-6f B-1/FU-6f B-3).
Per `feedback_recurring_bug_escalation`, point-fixing is stopped. One exhaustive pass
designs bank-aware handling for EVERY consumer in a single coherent change set.

The root cause of every recurrence: the entire pipeline was written assuming corporate
Mẫu B01-DN structure. Bank Mẫu B02-TCTD differs in three structural ways:
1. No gross_profit / COGS concept.
2. No current_assets concept (no code 100 sub-division).
3. Roman-numeral codes (I, VIII, IX…) that collide with numeric section codes (100–440)
   and appear in BOTH balance sheet and income statement (no exclusive code domain).

---

## 2. Discriminator Design

**Chosen discriminator: `domain` column on `financial_reports` read at each consumer call site.**

### Rationale

The `financial_reports.domain` column already exists (TEXT NOT NULL, DDL in `bctc-schema.ts`
line 732, indexed via `idx_fr_domain`). It is populated by `parseBctcReport`/`storeReport`
at ingest time from the sector classification (e.g. "banking" for VCB, ACB, BID, TCB, MBB,
VPB, STB, HDB, MSB, TPB). The `computeBctcEval` application layer already reads this field
for Stage 6 golden anchors (FU-6f B-1 fix). The aggregator uses the same signal as an in-
memory computed flag (`isBankPath = findByCode(rows,"10") === null`).

**Single discriminator expression** (used identically at every consumer):

```typescript
function isBankForm(domain: string | null): boolean {
  return /bank/i.test(domain ?? "");
}
```

This must be the ONE authoritative function used at all call sites. Zero independent
re-implementations. Computed from the `domain` column, not from code-presence heuristics
(those are only available in `bctcScalarAggregator` which already has full row access).

### Where it is computed vs propagated

| Site | How discriminator arrives |
|------|--------------------------|
| `bctcFullTools.ts` (PUB-3 + summary display) | DB query: `SELECT domain FROM financial_reports WHERE id = ?` — already in the latestRow query; add `domain` to `ReportRow` interface |
| `computeBctcEval.ts` Stage 6 | Already reads `domain` from `FinancialReportDb` (line 151 in `SELECT`); isBankDomain regex already correct |
| `bctcMagnitudeValidator.ts` DT-2a | Caller (`finalizeBctcRefineTool.ts`) reads `domain` from report row and passes `isBankForm` as parameter |
| `bctcValidator.ts` | Caller must pass `isBankForm` as a field on `ValidatableReport` |
| `bctcScalarAggregator.ts` | Already uses in-memory `isBankPath` (code "10" absence) — this is structurally equivalent and remains DRY for domain-layer pure function; NO change needed here |

### Canonical utility location

New file: `apps/mcp-server/src/domain/services/financial-reports/bctcFormType.ts`

```typescript
/**
 * isBankForm — canonical bank-form discriminator.
 * Returns true when the financial_reports.domain value indicates a banking entity.
 * ACB, VCB, BID, TCB, MBB, VPB, STB, HDB, MSB, TPB all have domain="banking".
 */
export function isBankForm(domain: string | null | undefined): boolean {
  return /bank/i.test(domain ?? "");
}
```

All consumers import from this single location. Zero duplication. This enforces the
fail-loud-first / silent-swallow discipline: if the regex changes, it changes everywhere.

---

## 3. Consumer Enumeration (Exhaustive)

**Total bank-unaware consumers found: 7** (across 6 files)

### Consumer C-1: `bctcFullTools.ts` — PUB-3 corporate code range check

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`
**Lines:** 393–414 (`checkPublishability` function)

**Problem:** PUB-3 broadened for layout-section mismatch (FU-6f B-3), but the fallback
path for `general` rows uses `CAST(code AS INTEGER) BETWEEN 100 AND 440`. Bank balance
sheet rows have Roman-numeral codes (e.g. "I", "VIII") which CAST to NULL, failing the
BETWEEN predicate. ACB has ZERO rows passing PUB-3 → `publishable: false` → `get_bctc_full`
returns "balance sheet has no decomposition — forced-zero pass suspected" → blocked.

**Correct behaviour for banks:**
- Bank balance sheet rows in `general` section use Roman numeral codes and null codes.
  PUB-3 intent is "real data exists, not forced-zero". For banks, the presence of any
  non-summary row in `general` section whose label matches known balance-sheet patterns
  (TỔNG TÀI SẢN / VỐN CHỦ SỞ HỮU / TỔNG NỢ) suffices.
- Alternative: for banks, relax PUB-3 to accept any non-summary `general` row with
  `value_current IS NOT NULL`. Bank BSTCs have all rows in `general` (confirmed from
  ACB live data: 95 `general` rows, 0 `balance_sheet` rows).

**Fix:**

```sql
-- Corporate path (unchanged):
AND (
  statement_section = 'balance_sheet'
  OR (
    statement_section = 'general'
    AND code IS NOT NULL
    AND CAST(code AS INTEGER) BETWEEN 100 AND 440
  )
)

-- Bank path (NEW — when isBankForm(domain)):
AND (
  statement_section = 'general'
  AND value_current IS NOT NULL
  AND is_summary_row = 0
)
```

`checkPublishability` receives `isBankForm` as a boolean parameter (caller reads
`domain` from `latestRow`).

### Consumer C-2: `bctcFullTools.ts` — `buildSummarySection` gross_profit display

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`
**Lines:** 158–159 (`buildSummarySection` function)

**Problem:** Summary always renders `Gross Profit : 0.0 tỷ VND (N/A)` for banks because
`gross_profit` is SET NULL by the aggregator's `notApplicable` path. This line:
```typescript
`Gross Profit     : ${fmtBillions(row.gross_profit)}  (${fmtPct(row.gross_margin_pct)})`,
```
calls `fmtBillions(null)` which renders `0.0 tỷ VND` (null defaults to 0 inside
`fmtBillions` — it calls `millionVnd / 1000` with the JS nullish number coercing to 0).
This is misleading: a bank has no gross profit concept, not zero gross profit.

**Fix:** Bank-specific summary line substitution. `buildSummarySection` takes an `isBankForm`
boolean param (caller passes from `latestRow.domain`):

```typescript
// Bank: no COGS concept — omit Gross Profit line entirely; show NIM / net interest income instead
const grossProfitLine = isBankForm
  ? `Net Interest Income: ${fmtBillions(row.net_revenue)}  (net interest income maps to net_revenue)`
  : `Gross Profit     : ${fmtBillions(row.gross_profit)}  (${fmtPct(row.gross_margin_pct)})`;
```

Note: `row.current_ratio` (derived from `current_assets / short_term_debt`) will also be
misleading for banks. The Ratios block should omit `Current Ratio` for bank forms and
optionally show NPL/NIM if available. This is a display enhancement; the load-bearing
correctness fix is the gross_profit line.

### Consumer C-3: `bctcFullTools.ts` — `rowToMetrics` passes `grossProfit: row.gross_profit` for QoQ

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`
**Lines:** 122–141 (`rowToMetrics` function)

**Problem:** `rowToMetrics` always passes `grossProfit: row.gross_profit` to
`computePeriodDelta`. For banks this is `null` → 0 in JS, causing the QoQ gross-margin
comparison to show `0.0% -> 0.0% (+0.0 pp)` — misleading (zero, not N/A).

**Fix:** `rowToMetrics` takes an `isBankForm` boolean. Set `grossProfit` to `NaN` (or a
sentinel like `null` after `FinancialMetrics` type update) for bank forms so that
`computePeriodDelta` emits N/A instead of 0.0%.
Simpler approach: filter bank tickers out of the gross-margin QoQ line in
`buildComparisonSection` using the same `isBankForm` param.

### Consumer C-4: `bctcMagnitudeValidator.ts` — DT-2a gross_profit >= net_revenue BLOCK

**File:** `apps/mcp-server/src/domain/services/financial-reports/bctcMagnitudeValidator.ts`
**Lines:** 49–84 (`detectMagnitudeViolations` function)

**Problem:** DT-2a searches `statement_section = "income_statement"` for gross_profit and
net_revenue. For banks: income section rows land in `general` (all ACB rows in `general`),
so `incomeRows.length === 0` — DT-2a fires the LABEL_AMBIGUOUS WARN path ("Income statement
present but net_revenue or gross_profit label match ambiguous"). This is technically a safe-
degrade (WARN not BLOCK), but it produces a spurious warning and prevents the validator
from doing the net_revenue consistency check it could do.

Deeper risk: if BCTC-LAYOUT-FIRST later correctly labels ACB income rows as
`statement_section = "income_statement"`, DT-2a will then fire for banks: the net_revenue
row will be found (`incomeRows.find("doanh thu thuần")` matches "Thu nhập lãi thuần"?
No — different label pattern), but if both are not found, LABEL_AMBIGUOUS fires again. More
concerning: if somehow a gross_profit label is found in a future format, and net_revenue is
the bank "Thu nhập lãi thuần" value (6.9B), DT-2a WOULD fire MAGNITUDE_GROSS_EQ_NET
incorrectly.

**Fix:** `detectMagnitudeViolations` receives `isBankForm: boolean` parameter. When bank:
- Skip DT-2a entirely (banks have no COGS/gross_profit concept; the check is structurally
  inapplicable).
- DT-2b (forced-zero balance check) looks for `statement_section = "balance_sheet"` rows;
  banks have all rows in `general` — it will silently find nothing (zero matches) and no
  violation fires. This is actually correct behaviour (no false block), but it means
  DT-2b provides zero protection for banks. FIX: also check `general` section rows when
  bank form. Specifically: for banks, look for total_assets label in `general` section,
  and check the forced-zero guard against those rows.

### Consumer C-5: `bctcValidator.ts` — gross_profit > net_revenue error + "Net profit > gross profit" warning

**File:** `apps/mcp-server/src/domain/services/financial-reports/bctcValidator.ts`
**Lines:** 240–252 (`validateFinancialReport` function)

**Problem:** Two checks assume gross_profit is a meaningful field:
1. Line 241: `if (grossProfit > netRevenue)` → for banks, `grossProfit = 0` (null→0 via
   `?? 0`) and `netRevenue = 6,989,162M`. So `0 > 6,989,162` = false — no spurious error.
   SAFE by accident. But after SET NULL (FU-6e), `gross_profit` IS null in DB; the
   `ValidatableReport.incomeStatement.grossProfit` field will be null → `?? 0` → 0 → no
   false trigger. SAFE.
2. Line 248: `if (netProfit > grossProfit && grossProfit >= 0)` → `4,320,388 > 0 && 0 >= 0`
   → TRUE → WARNING: "Net profit exceeds gross profit (4,320,388) > (0) — possible non-
   operating income". This is a FALSE WARNING for every bank report.

**Fix:** `validateFinancialReport` takes `isBankForm: boolean` in the `ValidatableReport`
interface. When bank: skip the gross_profit comparisons (lines 241–252). The caller of
`validateFinancialReport` must pass the `isBankForm` field.

Who calls `validateFinancialReport`? Search reveals it is called from the legacy
`parseBctcReport`/`storeReport` path (pre-agentic-refine). This path still runs for
non-agentic reports. The caller must be identified and the bank flag threaded through.

### Consumer C-6: `computeBctcEval.ts` — Stage 6 golden anchors (ALREADY PARTIALLY FIXED)

**File:** `apps/mcp-server/src/application/usecases/computeBctcEval.ts`
**Lines:** 174–191

**Status:** FU-6f B-1 already introduced `isBankDomain = /bank/i.test(reportDomain)` and
domain-aware `goldenAnchors` (bank: `["net_revenue","net_profit"]`; corporate: adds
`"gross_profit"`). The regex is `const isBankDomain = /bank/i.test(reportDomain)` which is
correct.

**Residual gap:** The `reportDomain` is read with `const reportDomain = frRow?.domain ?? ""`
which produces `""` when the report has no domain or frRow is null. In that case
`isBankDomain = false` → corporate anchors assumed. For a bank report where parseBctcReport
failed to set `domain`, this falls back to corporate anchors → false-red on `gross_profit`
missing. MITIGATION: the aggregator's `notApplicable` path correctly NULL-clears
`gross_profit` for banks, so `frRow.gross_profit` will be null → golden anchor fails →
stage 6 red. This is only a problem if `domain` is unset AND the report is a bank.

**Fix:** Add a fallback bank-detection heuristic: if `domain` is empty AND `gross_profit`
is null AND `net_revenue` is non-null, infer bank form as a defensive check. This is the
belt-and-suspenders approach. The primary path is `domain`.

Note: `computeBctcEval` is correctly doing the domain read already. No structural change
needed, only the defensive fallback.

### Consumer C-7: `bctcValidator.ts` — `assetDecomposition` warning for banks

**File:** `apps/mcp-server/src/domain/services/financial-reports/bctcValidator.ts`
**Lines:** 210–215

**Problem:** `currentAssets + nonCurrentAssets ≈ totalAssets` asset decomposition check.
For banks, `current_assets` is NULL (notApplicable, SET NULL by FU-6e). The caller will
pass `currentAssets: undefined` → `?? 0`. Check: `totalAssets !== 0 && (currentAssets !== 0
|| nonCurrentAssets !== 0)`. With both 0, the condition is false → check skipped → no false
warning. SAFE by accident.

However, once `currentAssets = 0` (from null), and if `nonCurrentAssets` is separately
populated, a spurious decomposition warning could fire. In practice `nonCurrentAssets` is
also absent for banks (no structural equivalent). SAFE in current data.

**Fix:** No urgent fix needed. Add `isBankForm` guard as part of the broader bctcValidator
refactor for correctness: `if (!isBankForm && totalAssets !== 0 && ...)`.

---

## 4. Fail-Loud-First Design: Surface ALL Sites in ONE Run

The current architecture has NO bank-awareness smoke test. Each point-fix revealed one more
consumer. The fail-loud strategy must flip this: a single test run must fail for ALL
bank-unaware consumers before any fix.

**Mandatory test architecture for BANK-DEV:**

New test file: `apps/mcp-server/src/__tests__/BANK-AWARE-1-consumer-audit.test.ts`

The test seeds a bank report (ACB pattern: domain="banking", all balance rows in general
section, Roman numeral codes, null gross_profit) and asserts the desired CORRECT outcome
for each consumer. Every assertion MUST fail BEFORE the fix and pass AFTER.

**DV-BANK-1 — PUB-3 bank pass:**
Seed: report with domain="banking", 10 rows in statement_section="general" with
value_current set, is_summary_row=0, code="I"/"VIII"/null.
Assert: `checkPublishability(db, reportId).publishable === true`.
BEFORE fix: publishable=false ("balance sheet has no decomposition").

**DV-BANK-2 — Summary gross_profit display:**
Seed: same bank report in financial_reports with gross_profit=NULL, net_revenue=6989162.
Assert: `buildSummarySection` output does NOT contain "Gross Profit     : 0.0 tỷ VND".
Assert: output DOES contain "N/A" or "Net Interest Income" for the gross profit line.
BEFORE fix: output contains "0.0 tỷ VND".

**DV-BANK-3 — DT-2a bank skip:**
Seed: bank rows in statement_section="income_statement" (future-proofing for BCTC-LAYOUT-FIRST).
Confirm: `detectMagnitudeViolations(rows, true)` returns no LABEL_AMBIGUOUS WARN.
Assert: no spurious "Income statement present but net_revenue or gross_profit label match
ambiguous" violation.
BEFORE fix: WARN fires.

**DV-BANK-4 — bctcValidator bank gross_profit false warning:**
Seed: `ValidatableReport` with netRevenue=6989162, grossProfit=0 (null→0), netProfit=4320388,
isBankForm=true.
Assert: `validateFinancialReport(report).warnings` does NOT contain "Net profit exceeds
gross profit".
BEFORE fix: warning fires.

**DV-BANK-5 — Stage 6 eval bank domain defensive fallback:**
Seed: report with domain="" (unset), gross_profit=null, net_revenue=6989162.
Assert: `computeBctcEval` uses bank anchors `["net_revenue","net_profit"]` (not
`["net_revenue","net_profit","gross_profit"]`).
Assert: stage 6 status is NOT "red" when only net_revenue and net_profit are present.
BEFORE fix: red (gross_profit missing anchor fails).

**DV-BANK-6 — Full pipeline: ACB get_bctc_full serves successfully:**
This is the acceptance proof. It is the ONLY gate that proves the end-to-end serving path
works. Seed: realistic ACB report (domain="banking", 95 general rows, correct scalar values,
refine_status="DONE"). Call `get_bctc_full(code="ACB")`. Assert: response contains
total_assets=1,030,900,741 (formatted as ~1,031 tỷ) and does NOT contain the
"balance sheet has no decomposition" refusal string.

Anti-false-green rule (from `feedback_trust_verification_is_system_job`):
- QA must call `get_bctc_full` via the gateway (not mock) after BANK-OPS rebuilds the
  container and re-finalizes ACB.
- QA must read `get_bctc_refined` directly and compare total_assets / equity_total / net_profit
  values against the known correct values.
- Balance badge (PUB-1..4 "publishable: true") is FORBIDDEN as sole gate — must read raw values.
- DB verification: `bun -e "const db = new (require('bun:sqlite').Database)(...); ...COUNT(*)..."`
  in-container to prove rows exist.

---

## 5. Change List for dev-mcp-server

### NEW file: `apps/mcp-server/src/domain/services/financial-reports/bctcFormType.ts`

Canonical `isBankForm(domain)` utility. 10 lines. Zero imports.
This is the SSOT discriminator; all other files import from here.

### MODIFY: `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`

1. Add `domain: string | null` to `ReportRow` interface (already present in SELECT *).
2. Pass `isBankForm(latestRow.domain)` to `checkPublishability`, `buildSummarySection`,
   `buildComparisonSection`, `rowToMetrics`.
3. `checkPublishability(db, reportId, isBankForm)`:
   - Add `isBankForm: boolean` parameter.
   - PUB-3: branch on `isBankForm` — bank uses `general` + `value_current IS NOT NULL`
     + `is_summary_row = 0`; corporate keeps existing CAST logic.
4. `buildSummarySection(code, row, isBankForm)`:
   - Substitute gross_profit line for banks.
   - Omit or label `Current Ratio` as N/A for banks.
5. `buildComparisonSection(db, code, latest, isBankForm)`:
   - Omit gross-margin QoQ comparison line for banks.
6. `rowToMetrics(row, isBankForm)`:
   - Set `grossProfit` to a sentinel/null-safe value for banks.

### MODIFY: `apps/mcp-server/src/domain/services/financial-reports/bctcMagnitudeValidator.ts`

1. Add `isBankForm: boolean` parameter to `detectMagnitudeViolations(rows, isBankForm)`.
2. When `isBankForm`: skip DT-2a entirely.
3. When `isBankForm`: extend DT-2b to also search `general` section for balance-sheet
   rows (same label patterns as DT-2b — TỔNG TÀI SẢN / Nợ / Vốn chủ sở hữu).
4. No changes to `detectCrossStatementRevenue` — it matches doanh_thu_thuần which is
   structurally absent in banks; the function returns empty violations safely.

### MODIFY: `apps/mcp-server/src/domain/services/financial-reports/bctcValidator.ts`

1. Add `isBankForm?: boolean` to `ValidatableReport` interface.
2. Guard gross_profit comparisons (lines 241–252) with `if (!report.isBankForm)`.
3. Guard asset decomposition check (line 210) with `if (!report.isBankForm && ...)`.

### MODIFY: `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`

1. After reading `finalRows`, query `financial_reports.domain` for the report.
2. Pass `isBankForm(domain)` to `detectMagnitudeViolations(finalRows, isBankForm)`.
3. If `validateFinancialReport` is called in this file (verify), pass `isBankForm` in
   the `ValidatableReport`.

### MODIFY: `apps/mcp-server/src/application/usecases/computeBctcEval.ts`

1. Add defensive fallback in Stage 6 isBankDomain detection:
   ```typescript
   const reportDomain = frRow?.domain ?? "";
   const isBankDomain = /bank/i.test(reportDomain) ||
     // Fallback: domain unset but gross_profit null + net_revenue present = likely bank
     (reportDomain === "" && frRow?.gross_profit === null && frRow?.net_revenue !== null);
   ```
2. No other changes needed — golden anchors logic is correct.

### NEW test file: `apps/mcp-server/src/__tests__/BANK-AWARE-1-consumer-audit.test.ts`

DV-BANK-1 through DV-BANK-6 as specified in Section 4.
Must follow RED-before-GREEN protocol in the same commit: each test carries a comment
showing what the old code produces (the wrong result) and what the new code produces.

---

## 6. Database / Schema Changes

**None required.** The `domain` column already exists on `financial_reports`.
The `isBankForm` discriminator is computed at query time from an existing column.
No migration, no ALTER TABLE.

---

## 7. Sequencing (Dev→Ops→QA)

```
BANK-DEV-1:  dev-mcp-server
  Create bctcFormType.ts (utility)
  Modify bctcFullTools.ts (C-1, C-2, C-3)
  Modify bctcMagnitudeValidator.ts (C-4)
  Modify bctcValidator.ts (C-5, C-7)
  Modify computeBctcEval.ts (C-6)
  Modify finalizeBctcRefineTool.ts (thread isBankForm)
  Create BANK-AWARE-1-consumer-audit.test.ts (DV-BANK-1..5)
  All 5 tests MUST be RED before fix, GREEN after.
  bun test apps/mcp-server/src/__tests__/BANK-AWARE-1-consumer-audit.test.ts
  → PASS required before commit.

BANK-OPS-1:  ops
  Rebuild mcp-server container.
  Re-finalize ACB report fea19bae-2b7a-4954-b3e0-e09d7bfc7390:
    mcp__claude_ai_gateway__call_tool(server="vn-market", tool="finalize_bctc_refine",
      arguments={report_id:"fea19bae-2b7a-4954-b3e0-e09d7bfc7390", report_status:"DONE"})
  Verify: container logs show "scalar backfill complete" with updated_cols including
    total_assets / equity_total / net_profit.
  Verify in-container: bctc_table_rows COUNT > 0 for ACB report_id.

BANK-QA-1:  qa
  Anti-false-green gate (DV-BANK-6):
  1. Call get_bctc_full(code="ACB") via gateway.
  2. Assert response does NOT contain "balance sheet has no decomposition".
  3. Assert response contains total_assets value approximately 1,030,900 tỷ VND.
  4. Read get_bctc_refined for ACB: confirm equity_total=98,751,052M, NOT 1,030,900,741M.
  5. Read get_bctc_full(code="FPT"): confirm FPT is unaffected (regression check).
  6. Balance badge FORBIDDEN as sole gate — raw values only (per feedback_router_verify_raw).
```

---

## 8. Anti-False-Green Gates

The following are FORBIDDEN as sole acceptance criteria:

- PUB-1..4 "publishable: true" badge alone.
- HTTP 200 response without reading field values.
- "rows_parsed > 0" echo from finalize_bctc_refine (this is input count, not DB COUNT).
- Stage 6 eval "green" badge alone (it was green while scalars were wrong in FU-5b).

**Mandatory acceptance proof:**
- `get_bctc_full(ACB)` returns a full financial summary (not a refusal message).
- `get_bctc_refined(ACB)` shows `equity_total = 98,751,052` (not 1,030,900,741).
- In-container SQLite `COUNT(*)` from `bctc_table_rows WHERE report_id='fea19bae...'` > 0.
- All 5 DV-BANK-* unit tests PASS in bun:test.

---

## 9. Build Standard

**BUILD-STANDARD: lean** — existing zone, no new DB schema, no new MCP tools, no new
microservices. Two new files (bctcFormType.ts + test), five modifications.

**ZONE:** apps/mcp-server/ only. dev-pdf-extractor: 0-diff. PDF-Extract-Kit subtree: pristine.
text_table_extractor.py: frozen 0-diff.

---

## RETURN

```
DONE: Architecture brief written — bank-aware BCTC, 7 consumers enumerated, one
      discriminator (isBankForm via domain column), full dev→ops→qa sequence.
ZONE: apps/mcp-server/
NEXT: pm | decompose into BANK-DEV-1 / BANK-OPS-1 / BANK-QA-1 tasks
HANDOFF: docs/architecture-briefs/2026-05-31-bank-aware-bctc.md
PIPELINE: continue
```
