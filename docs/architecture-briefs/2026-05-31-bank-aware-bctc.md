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

---

## BANK-ARCH-2 — Discriminator Signal Correction

**Date:** 2026-05-31 (QA escalation — discriminator fails on live ACB)
**Amendment author:** architect
**Gate status:** BLOCKING BANK-DEV-2. BANK-DEV-1 code is partially implemented but
non-functional because the discriminator input is wrong.

---

### Verified Facts (Raw DB Read — not relayed from sub-agent)

Direct in-container `bun:sqlite` queries on `/app/data/market.db` produced:

```
ACB financial_reports.domain = "other"          ← NOT "banking"
VCB financial_reports.domain = "other"
SHB financial_reports.domain = "other"
EIB financial_reports.domain = "other"
FPT financial_reports.domain = "other"          ← ALL 12 tickers = "other"
```

**All 12 tickers in the live DB have `domain="other"`.** The `domain` column is universally
mis-populated at ingest time — it is not a gap limited to ACB. The `storeReport` ingest path
never maps sector classification to the `domain` column with the value "banking"; it writes
"other" for all reports. This is a permanent data-quality gap, not a one-off mis-tag.

**Consequence:** `isBankForm("other") = /bank/i.test("other") = false` → `bankForm = false`
for ACB at every consumer → entire BANK-DEV-1 implementation is bypassed → ACB fails PUB-3
with "balance sheet has no decomposition — forced-zero pass suspected".

**Secondary finding — aggregator's `findByCode(rows,"10") === null` also unreliable as
global signal:** Code "10" (corporate net_revenue row) is absent from `bctc_table_rows` for
FPT (corporate) as well. FPT has 79 balance-sheet-section rows (codes 100-440) but zero
income-statement-section rows — the section classifier currently mislabels all FPT rows as
`statement_section="balance_sheet"`. So `findByCode(rows,"10") === null` is TRUE for FPT
too. The aggregator's bank detection works for ACB by coincidence: the fallback chain
correctly reaches code "I" → Roman-numeral path because the code "10" absence does NOT
imply corporate (and the absence of code "100" is the true discriminator).

**Ground truth structural signal — measured across all tickers:**

| Ticker | Type | 3-digit codes (100-440) present | code "10" | Roman codes (I..XIII) |
|--------|------|---------------------------------|-----------|-----------------------|
| FPT    | corporate | 79 rows | 0 | 0 |
| HPG    | corporate | 26 rows | 0 | 0 |
| DHG    | corporate | 62 rows | 0 | 0 |
| ACB    | bank      |  0 rows | 0 | 33 |
| SHB    | bank      |  0 rows | 0 |  0 (extraction gap) |
| EIB    | bank      |  0 rows | 0 |  0 (extraction gap) |

**3-digit numeric codes in 100-440 range are present for all corporate tickers with
extracted data, and absent for all bank tickers.** This is the correct structural boundary.

ACB's code distribution (confirmed): null, 01-09, 1-9, A, B, I, II, III … XIII — entirely
Roman numerals and single/double digit codes. Zero 3-digit codes. The Mẫu B02-TCTD balance
sheet uses section codes A/B (assets/liabilities sections) and Roman-numeral sub-codes (I
through XIII), not the 3-digit 100-440 scheme of Mẫu B01-DN.

---

### Decision: Canonical Bank-Form Signal

**Chosen signal: structural — presence of at least one 3-digit numeric code (≥ 100) in
the report's `bctc_table_rows` set.**

**Rationale (one paragraph):** The `domain` column is a dead signal: all 12 live tickers
have `domain="other"`, and the aggregator's existing `findByCode(rows,"10")===null` is
unreliable because code "10" is also absent from FPT due to the section-classifier gap.
The 3-digit numeric code signal (presence of any code matching `/^[0-9]{3}/`) cleanly
discriminates: corporates always have codes 100-440 extracted (asset, liability, equity
parent sections) while banks use Roman numerals (I–XIII) and short alphabetic codes (A, B)
exclusively. This signal is already load-bearing inside `bctcScalarAggregator.ts`: the
aggregator's first-attempt code "100" lookup (current_assets) returns null for banks and
non-null for corporates — the code-100 absence already silently enforces the structural
boundary for current_assets. Structural is correct because it needs no data backfill, is
observable from rows already in DB, and cannot be defeated by ingest-time mis-tagging.
The `findByLabelExcluding` / label-hint machinery already treats `code "10" absent` as the
bank fallthrough — the corrected signal simply makes this explicit and consistent.

**Rejected alternatives:**

1. **`domain` regex fix / backfill:** `domain="other"` for all 12 tickers — the root cause
   is that `storeReport` never maps sector to "banking". Backfilling requires knowing which
   tickers are banks (hardcoded list, fragile) and a migration script (operational risk).
   Even after backfill, new ingests would revert to "other". This approach re-introduces
   the original discriminator failure on every new bank report ingested.

2. **Refined-markdown form marker (`Mẫu B02a/TCTD-HN`):** ACB unit-0000 markdown contains
   "NGÂN HÀNG THƯƠNG MẠI CỔ PHẦN Á CHÂU (ACB)" but unit-0001 onward would need to be
   parsed for "B02a/TCTD" string. This requires querying `bctc_refined_units.markdown`,
   adding a text search across potentially multiple units, and is fragile to OCR quality
   (the form marker text may be garbled). The structural signal requires only a COUNT query
   on `bctc_table_rows.code`.

3. **`findByCode(rows,"10")===null` (aggregator's current):** Fails on FPT (false-positive
   bank classification possible) as shown above. The aggregator relies on the fallback
   chain to self-correct, but a consumer that received `isBankPath=true` for FPT would
   suppress gross_profit display for a corporate ticker — wrong.

---

### New `bctcFormType.ts` Function Signature

The current `isBankForm(domain: string|null|undefined)` must be replaced. The function
needs rows to apply the structural signal. Two new exports replace it:

```typescript
/**
 * bctcFormType — canonical bank-form discriminator (BANK-ARCH-2 revision).
 *
 * CORRECTED SIGNAL: structural (3-digit code presence), NOT domain string.
 * Reason: financial_reports.domain = "other" for ALL tickers in live DB.
 * The domain column is mis-populated at ingest and cannot be used as discriminator.
 *
 * @module domain/services/financial-reports/bctcFormType
 */

/**
 * Row shape required for structural bank detection.
 * Subset of bctc_table_rows columns — only `code` is needed.
 */
export interface BctcCodeRow {
  code: string | null;
}

/**
 * isBankFormFromRows — canonical bank-form discriminator.
 *
 * Returns true when the row set contains NO 3-digit numeric codes in the
 * Mẫu B01-DN corporate range (codes matching /^[0-9]{3}/). Bank reports
 * (Mẫu B02-TCTD) use Roman-numeral codes (I–XIII) and short alphabetic
 * codes (A, B) exclusively. Corporate reports always have codes 100-440
 * (current_assets=100, total_assets=270/280, equity=400, etc.).
 *
 * Fail-loud contract: if rows is empty, returns false (assumes corporate
 * until evidence proves otherwise — no silent bank promotion on empty data).
 *
 * @param rows   All bctc_table_rows for the report (full set or code-only projection).
 * @returns true if the report follows Mẫu B02-TCTD (bank form); false for corporate.
 */
export function isBankFormFromRows(rows: BctcCodeRow[]): boolean {
  if (rows.length === 0) return false;           // fail-safe: no rows → assume corporate
  return !rows.some(r => /^[0-9]{3}/.test(r.code ?? ""));
}

/**
 * isBankFormFromDb — convenience wrapper for consumers that have a DB handle
 * and a report_id but not a pre-loaded row set.
 *
 * Issues a minimal SELECT code FROM bctc_table_rows WHERE report_id = ?
 * query and delegates to isBankFormFromRows. Consumers that already have
 * rows loaded MUST use isBankFormFromRows directly to avoid a second query.
 *
 * @param db        Bun SQLite Database instance.
 * @param reportId  financial_reports.id (UUID).
 */
export function isBankFormFromDb(
  db: import("bun:sqlite").Database,
  reportId: string,
): boolean {
  const rows = db
    .query<BctcCodeRow, [string]>(
      "SELECT code FROM bctc_table_rows WHERE report_id = ?",
    )
    .all(reportId);
  return isBankFormFromRows(rows);
}
```

**Migration note:** The old `isBankForm(domain)` export is deleted. Any surviving import
causes a TypeScript compile error — this is the desired fail-loud property. Dev must fix all
import sites in the same commit.

---

### Per-Consumer Call-Site Adjustments (C-1 through C-7)

**C-1: `bctcFullTools.ts` — `checkPublishability(db, reportId, bankForm)`**

Currently: `const bankForm = isBankForm(latestRow.domain)` → always false.

Fix: replace the call site at line 593 of `bctcFullTools.ts`:
```typescript
// BEFORE (broken — domain="other" fleet-wide):
const bankForm = isBankForm(latestRow.domain);

// AFTER (structural signal from rows already in DB):
const bankForm = isBankFormFromDb(db, latestRow.id);
```
`checkPublishability`, `buildSummarySection`, `buildComparisonSection`, `rowToMetrics` all
receive `bankForm` as a boolean downstream — their signatures do NOT change. Only the
derivation of `bankForm` at the call site changes.

**C-2: `bctcFullTools.ts` — `buildSummarySection`**

No signature change. The `bankForm` parameter is already defined correctly; it just receives
the wrong value today. Once C-1's call-site fix lands, C-2 self-corrects.

**C-3: `bctcFullTools.ts` — `rowToMetrics` / `buildComparisonSection`**

Same as C-2: no signature change, self-corrects when `bankForm` is computed correctly.

**C-4: `bctcMagnitudeValidator.ts` — `detectMagnitudeViolations(rows, isBankForm)`**

Caller is `finalizeBctcRefineTool.ts`. The `finalRows` array is already loaded at the call
site. Change:
```typescript
// BEFORE:
const bankForm = isBankForm(domain);   // domain queried separately, always "other"

// AFTER:
const bankForm = isBankFormFromRows(finalRows);   // use already-loaded rows
```
No parameter change to `detectMagnitudeViolations` itself — `isBankForm: boolean` param
signature stays. Only the computation in the caller changes.

**C-5: `bctcValidator.ts` — `validateFinancialReport(ValidatableReport)`**

The `ValidatableReport` interface carries `isBankForm?: boolean`. The caller
(`finalizeBctcRefineTool.ts` or `parseBctcReport`/`storeReport` legacy path) must set this
field. Change at caller:
```typescript
// BEFORE:
isBankForm: isBankForm(domain)   // domain="other" → false

// AFTER:
isBankForm: isBankFormFromRows(finalRows)   // structural from loaded rows
```
`validateFinancialReport` signature unchanged. Self-corrects when field is set correctly.

**C-6: `computeBctcEval.ts` — Stage 6 defensive fallback**

Original brief specified: if `domain=""`, use gross_profit null + net_revenue non-null as
fallback bank inference. This fallback remains valid and should be EXTENDED to handle
`domain="other"`:

```typescript
// BEFORE (original brief):
const isBankDomain = /bank/i.test(reportDomain) ||
  (reportDomain === "" && frRow?.gross_profit === null && frRow?.net_revenue !== null);

// AFTER (BANK-ARCH-2 — domain="other" is also a mis-tag):
// Primary: structural query on bctc_table_rows for this report
const isBankDomain = isBankFormFromDb(db, reportId) ||
  // Belt-and-suspenders: if DB query fails or rows absent, use scalar signals
  (frRow?.gross_profit === null && frRow?.net_revenue !== null &&
   frRow?.total_assets !== null && frRow?.total_assets > 1e9);
   // total_assets > 1T VND distinguishes banks (ACB=1,030B; VCB>>1T) from
   // small corporates where gross_profit=null might be an extraction gap.
```

Note: `computeBctcEval.ts` needs a `db` handle injected (or available in scope) to call
`isBankFormFromDb`. If the use case already has a DB reference, pass it through. If not,
fall back to the belt-and-suspenders scalar heuristic only (acceptable because Stage 6 eval
is a diagnostic layer, not the serving gate — the PUB-3 fix in C-1 is the load-bearing
gate).

**C-7: `bctcValidator.ts` — `assetDecomposition`**

No input change. Self-corrects once C-5's `isBankForm` field is set correctly at the caller.

---

### Fail-Loud: Future Mis-Tag Cannot Silently Revert

The structural signal is self-proving: if a new bank report is ingested and `bctc_table_rows`
receives any 3-digit code (e.g., OCR misreads Roman "I" as "1" but not as "100"), the signal
could flip. Two safeguards:

1. **DV-BANK-1 test already seeds bank rows with Roman/null codes.** If a future change
   causes 3-digit codes to appear in bank rows, the test fixture would no longer match the
   production data pattern — test would need to be updated explicitly (not silently).

2. **Add a NEW test DV-BANK-7** in `BANK-AWARE-1-consumer-audit.test.ts`:
   ```
   DV-BANK-7 — isBankFormFromRows discriminator regression:
   Seed 1: rows with codes ["100","200","300","400"] → isBankFormFromRows = false (corporate)
   Seed 2: rows with codes ["I","II","VIII","IX", null] → isBankFormFromRows = true (bank)
   Seed 3: empty rows → isBankFormFromRows = false (fail-safe: no promotion without evidence)
   Seed 4: rows with codes ["01","02","I","B"] (no 3-digit) → isBankFormFromRows = true (bank)
   Assert all 4 pass. This test MUST run in CI before any `bctcFormType.ts` change is merged.
   ```

3. **Delete `isBankForm(domain)` entirely.** TypeScript compile errors at any surviving
   `isBankForm(something)` call site are the fleet-wide safety net.

---

### BANK-DEV-2 Task Specification

**Task:** BANK-DEV-2
**Zone:** `apps/mcp-server/`
**Assignee:** dev-mcp-server
**Blocker:** BANK-DEV-1 code exists but is non-functional (discriminator input wrong)
**Prerequisite:** No new dev work required before starting — BANK-DEV-1 code is already
on main; BANK-DEV-2 is an in-place amendment to correct it.

**Scope:**

1. **Replace `bctcFormType.ts` entirely** with the two-export version above
   (`isBankFormFromRows` + `isBankFormFromDb`). Delete the old `isBankForm(domain)` export.
   Zero other structural changes to the file.

2. **Fix call site in `bctcFullTools.ts`** (line ~593): replace
   `isBankForm(latestRow.domain)` with `isBankFormFromDb(db, latestRow.id)`.
   Import: replace `import { isBankForm }` with `import { isBankFormFromDb }`.

3. **Fix call site in `finalizeBctcRefineTool.ts`** (wherever `detectMagnitudeViolations`
   and `validateFinancialReport` are called): replace `isBankForm(domain)` with
   `isBankFormFromRows(finalRows)`. Import: replace `import { isBankForm }` with
   `import { isBankFormFromRows }`.

4. **Extend `computeBctcEval.ts` Stage 6** as specified in C-6 above. If `db` is already
   in scope, use `isBankFormFromDb(db, reportId)` as primary. Otherwise use scalar
   belt-and-suspenders only.

5. **Add DV-BANK-7** to `BANK-AWARE-1-consumer-audit.test.ts` (4-seed discriminator
   regression as specified above).

6. **Verify DV-BANK-1 through DV-BANK-6 still pass** with the new structural signal.
   The test fixtures use bank rows with Roman codes → `isBankFormFromRows` correctly
   returns true → all bank-path branches fire. No fixture changes expected.

**Acceptance criteria:**
- `bun test apps/mcp-server/src/__tests__/BANK-AWARE-1-consumer-audit.test.ts` → all
  DV-BANK-1..7 PASS.
- `get_bctc_full(code="ACB")` via gateway returns full financial summary (NOT the
  "balance sheet has no decomposition" refusal).
- `get_bctc_full(code="FPT")` still returns correct corporate data (regression gate).
- TypeScript compile: `bun tsc --noEmit` → 0 errors (deleted `isBankForm` forces
  compile-time verification of all import sites).

**Do NOT touch:**
- HCM-DISAMBIG test file.
- PDF-Extract-Kit subtree.
- `text_table_extractor.py`.
- `bctcScalarAggregator.ts` — its `isBankPath = findByCode(rows,"10")===null` internal
  heuristic is a separate in-memory computation that works correctly for its purpose (the
  aggregator has full row access and the fallback chain self-corrects). It does NOT need to
  import `isBankFormFromRows`. The two are structurally consistent: both conclude bank when
  3-digit codes are absent; the aggregator's check is an internal shortcut, not a SSOT.

**Sequencing:** BANK-DEV-2 → BANK-OPS-1 (rebuild) → BANK-QA-1 (live verify). BANK-OPS-1
and BANK-QA-1 task specs are unchanged from the original brief (Sections 7 and 8).

---

## BANK-ARCH-3 — Discriminator Edge-Case Ruling (QA escalation from BANK-QA-2)

**Date:** 2026-05-31
**Gate status:** BLOCKING BANK-DEV-3. Architect-ruled per recurring-bug-escalation policy
(bctcFormType.ts has now received 2 fix commits: BANK-DEV-1 domain-keyed → BANK-DEV-2
structural 3-digit-absence; next touch requires architect gate before any dev point-fix).

---

### Edge Case Surfaced (DV-FU6F-B1-3)

Test `DV-FU6F-B1-3` at `apps/mcp-server/src/__tests__/FU-6f-eval-blob-blockers.test.ts:374`
expects `stage_statuses[6] === "red"` for a VNM (corporate, consumer_goods) fixture where
`gross_profit=null`. It received `"yellow"` after BANK-DEV-2.

Root cause: the VNM fixture seeds ONLY 2-digit income codes `("10","60")`. Neither matches
`/^[0-9]{3}/` → `isBankFormFromRows` finds no 3-digit code → returns `true` (bank path) →
`goldenAnchors = ["net_revenue","net_profit"]` (gross_profit dropped) → 2/2 = 1.0 →
stage-6 not red. A CORPORATE income-only extraction is therefore indistinguishable from a
bank report by the absence-of-3-digit-codes signal alone.

---

### Production Reachability — Option B Forbidden

The state "corporate report, rows present, zero 3-digit codes" IS reachable in production:
`computeBctcEval` is a diagnostic layer called at any time, including before finalization
completes. A partial extraction where OCR captured income-statement rows but balance-sheet
rows failed would produce exactly this row set. Income statement codes in Mẫu B01-DN are
2-digit numeric (10, 11, 20, 21, 30, 40, 50, 60) — none are 3-digit. Option B ("fixture is
unrealistic — seed a 3-digit code") is therefore FORBIDDEN: it papers over a real production
state with a stronger fixture, hiding the discriminator defect. The DV-FU6F-B1-3 test must
end GREEN by being CORRECT, not by being made easier.

---

### Decision: Option C — Positive Bank Evidence Required

**Ruling:** Replace the NEGATIVE corporate signal (absence of 3-digit codes) in
`isBankFormFromRows` with a POSITIVE bank signal: at least one code in the row set must
contain a letter character (`/[A-Za-z]/`). This is Option C — a structurally tighter
discriminator not listed in the original option set.

**Rationale (one paragraph):** The absence-of-3-digit-codes signal is necessary but not
sufficient: it correctly identifies banks when the full row set is present (ACB always has
Roman/alpha codes; corporates always have 3-digit balance codes) but breaks on partial
extractions where only 2-digit income codes landed. The positive bank signal — presence of
at least one code containing a letter — is both necessary and sufficient: every real bank
report (Mẫu B02-TCTD) uses Roman numeral codes (I, II, III, …, XIII) and section headers
(A, B) which contain letters; no corporate report code in the Mẫu B01-DN scheme (10, 11,
20, 100-440) ever contains a letter. A corporate income-only extraction (`["10","60"]`) has
zero letter-containing codes → correctly returns `false` (corporate). ACB's actual live
codes (`["01","02","I","A","B","I.1"]`) contain letters → correctly returns `true` (bank).
The empty-rows fail-safe (`rows.length === 0 → false`) is unchanged. This change requires
no belt-and-suspenders scalar fallback in the SSOT function itself; the discriminator is
self-contained and context-free. The `computeBctcEval` scalar fallback (C-6,
`total_assets > 1e9`) is retained as belt-and-suspenders for the case where rows are
genuinely absent at eval time (pre-finalization), but it no longer needs to compensate for
a weak structural signal.

**Rejected alternatives:**

- **Option A (tighten discriminator with scalar inside SSOT):** Scalar signals (`total_assets`,
  `gross_profit`) belong to the application layer, not the domain layer. Injecting them into
  `isBankFormFromRows` (a domain-layer pure function operating only on code strings) would
  violate DDD layer separation. The scalar fallback stays in `computeBctcEval.ts` only.

- **Option B (fixture must seed 3-digit code):** Forbidden — production state is reachable
  (see above). The DV-FU6F-B1-3 test is a correct GREEN guard; it must pass as written.

- **The current BANK-DEV-2 signal (absence of 3-digit codes):** Correct for full row sets,
  broken for partial extractions. Not sufficient as the SSOT.

---

### New `isBankFormFromRows` Specification

**Signal:** `true` when at least one code in the row set matches `/[A-Za-z]/` (contains a
letter). `false` otherwise, including when rows is empty.

```typescript
/**
 * isBankFormFromRows — canonical bank-form discriminator.
 *
 * BANK-ARCH-3 revision: POSITIVE bank evidence required.
 * Returns true when the row set contains at least one code with a letter
 * character (Roman numerals I–XIII, section headers A/B, sub-codes I.1/I.2
 * used exclusively by Mẫu B02-TCTD bank reports). Corporate Mẫu B01-DN codes
 * (10-60 income; 100-440 balance) are entirely numeric — no letters.
 *
 * WHY positive evidence: absence of 3-digit codes is necessary but not
 * sufficient — a partial corporate extraction with income-only 2-digit rows
 * (code "10","60") also has zero 3-digit codes, breaking the prior signal.
 * A letter-containing code is ONLY produced by Mẫu B02-TCTD. Never by B01-DN.
 *
 * Fail-loud contract: if rows is empty, returns false (fail-safe: no bank
 * promotion without positive evidence). Consistent with BANK-DEV-2.
 *
 * @param rows   All bctc_table_rows for the report (full set or code-only projection).
 * @returns true if the report follows Mẫu B02-TCTD (bank form); false for corporate.
 */
export function isBankFormFromRows(rows: BctcCodeRow[]): boolean {
  if (rows.length === 0) return false; // fail-safe: no rows → assume corporate
  return rows.some(r => /[A-Za-z]/.test(r.code ?? ""));
}
```

`isBankFormFromDb` is unchanged — it queries, then delegates to `isBankFormFromRows`. No
signature change. Zero call-site changes in any consumer (C-1 through C-7) — they all call
`isBankFormFromDb` or `isBankFormFromRows` with the same arguments.

---

### DV-BANK-7 Test Updates Required

`DV-BANK-7` in `BANK-AWARE-1-consumer-audit.test.ts` (lines 232–303) currently has two
seeds whose expected values change under the new signal, and one whose comment must update:

**Seed 4 (`["01","02","I","B"]`):** Expected `true`. Result under new signal: "I" and "B"
contain letters → `true`. UNCHANGED. Comment must update: reason is now "contains letter
codes (I, B)" not "no 3-digit code".

**Edge case `["99"]` (line 280):** Currently expects `true` (no 3-digit code = bank). Under
new signal: "99" has no letters → `false` (not bank evidence). Expected value MUST CHANGE
to `false`. This is correct: code "99" is not a real bank code; it is an orphaned 2-digit
numeric that should be treated as corporate/ambiguous.

**Edge case `["1000"]` (line 285):** Currently expects `false`. Under new signal: "1000"
has no letters → `false`. UNCHANGED.

**Mixed case `["I","II","100",null]` (line 293):** Currently expects `false` (3-digit code
present = corporate wins). Under new signal: "I" and "II" contain letters → `true`. Expected
value MUST CHANGE to `true`. Rationale: a single 3-digit code alongside Roman-numeral codes
is more likely an OCR misread of a Roman numeral than a corporate form marker. The positive
bank signal (presence of letter codes) is stronger evidence than presence of one ambiguous
numeric code. If a developer disagrees: the test comment must document this explicitly and the
ruling here stands unless BANK-ARCH-4 overrides. Note: in practice, any real corporate
report has MANY 3-digit codes (100, 200, 300, 400 minimum); a single "100" among Romans
is an extraction artifact, not a corporate marker.

**Add Seed 5 (new):** `["10","60"]` (income-only corporate, 2-digit numeric) → expected
`false`. This is the exact VNM fixture scenario; the test must name it explicitly as the
regression guard for DV-FU6F-B1-3.

---

### BANK-DEV-3 Task Specification

**Task:** BANK-DEV-3
**Zone:** `apps/mcp-server/`
**Assignee:** dev-mcp-server
**Gate:** Architect-ruled (BANK-ARCH-3). No dev touch of bctcFormType.ts without this ruling.
**Blocker resolved by:** this section.

**Scope (minimal — single function body change):**

1. **Modify `isBankFormFromRows` in `bctcFormType.ts`** (line 50):
   Replace: `return !rows.some((r) => /^[0-9]{3}/.test(r.code ?? ""));`
   With:    `return rows.some((r) => /[A-Za-z]/.test(r.code ?? ""));`
   Update the JSDoc above the function to describe the positive-evidence rationale
   (copy the spec above verbatim). No other changes to the file.

2. **Update DV-BANK-7 in `BANK-AWARE-1-consumer-audit.test.ts`:**
   - Seed 4 comment: update reason ("contains letter code I, B" not "no 3-digit code").
     Expected value stays `true`.
   - Edge `["99"]`: change expected from `true` to `false`. Update description to
     "2-digit numeric, no letter → false (not bank evidence)".
   - Mixed `["I","II","100",null]`: change expected from `false` to `true`. Update
     description to "Roman codes with one 3-digit — letter evidence wins; 3-digit alone
     does not override positive bank signal".
   - Add Seed 5: `["10","60"]` → `false`. Description: "Income-only corporate (2-digit
     numeric, no letter) → false — the DV-FU6F-B1-3 regression guard".

3. **Verify DV-FU6F-B1-3 now passes:** The VNM fixture seeds `["10","60"]` — no letters →
   `isBankFormFromRows` returns `false` → corporate path → `goldenAnchors` includes
   `gross_profit` → 2/3 = 0.667 < 0.9 → stage-6 `red`. Test assertion `toBe("red")` passes.

4. **Verify DV-BANK-1 through DV-BANK-6 still pass:** ACB codes (`["I","A","B","I.1","01"]`)
   contain letters → `true` → bank path intact. FPT codes (`["100","110","120",...]`) have
   no letters → `false` → corporate path intact. All existing DV-BANK tests pass without
   fixture changes.

5. **No changes to any consumer call site** (C-1 through C-7). `isBankFormFromDb` signature
   and body unchanged. `computeBctcEval.ts` scalar belt-and-suspenders unchanged (still valid
   as a pre-finalization fallback when rows are genuinely absent).

6. **Do NOT touch:**
   - HCM-DISAMBIG test file.
   - PDF-Extract-Kit subtree.
   - `text_table_extractor.py`.
   - `bctcScalarAggregator.ts`.
   - `computeBctcEval.ts` (the scalar fallback is unchanged and correct).
   - Any file outside `bctcFormType.ts` and `BANK-AWARE-1-consumer-audit.test.ts`.

**Acceptance criteria:**
- `bun test apps/mcp-server/src/__tests__/BANK-AWARE-1-consumer-audit.test.ts` → all
  DV-BANK-1..7 PASS (with updated Seed expectations).
- `bun test apps/mcp-server/src/__tests__/FU-6f-eval-blob-blockers.test.ts` → all 3
  DV-FU6F-B1-* tests PASS, including DV-FU6F-B1-3 returning `"red"`.
- `bun tsc --noEmit` → 0 errors.
- `get_bctc_full(code="ACB")` via gateway after BANK-OPS container rebuild: still serves
  full financial summary (bank path still fires — ACB codes have letters).
- `get_bctc_full(code="FPT")` still returns correct corporate data (regression gate).

**RED-before-GREEN expectation for BANK-DEV-3:**
Before the one-line `isBankFormFromRows` body change:
- DV-FU6F-B1-3 → FAIL (received "yellow", expected "red").
- DV-BANK-7 Seed 5 (new) → FAIL (current code returns `true` for `["10","60"]`).
After the change: all tests GREEN.
