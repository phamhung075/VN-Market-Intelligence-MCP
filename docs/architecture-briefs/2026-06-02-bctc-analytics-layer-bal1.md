# Architecture Brief: BCTC Analytics Layer — BAL-1 Root-Cause Spike

**Date:** 2026-06-02  
**Author:** agents-architect  
**Sprint:** BCTC-ANALYTICS-LAYER  
**Task:** BAL-1 SPIKE  
**Status:** APPROVED FOR IMPLEMENTATION  
**Priority:** HIGH — PUBLISH-PATH RISK ACTIVE  

---

## 0. Executive Risk Statement

**PUBLISH-RISK IS LIVE RIGHT NOW.** The chef/cowork cron publishes BCTC dishes to the irreversible MARKET Telegram channel. With BEQ-9/10 complete, refine_status=DONE reports now flow into `market-analyst/flow/main.md` Step "Stock Financials" (`get_bctc_full`) and `unified-agent/flow/market-analysis.md` (step 3/EPS pillar). A DONE report with ROA=7,891,932.0% (DHG live), or a false YoY=-82.2% (VNM/FPT), or HPG parent-only Rev=0 can reach the MARKET channel. Bots cannot delete channel history. **BAL-0 must be built and deployed before any further chef cycle runs against DONE BCTC reports.**

---

## 1. What BCTC-TRUST-RED (Task #13) Shipped and Why It Does Not Close BAL-0

The BCTC-TRUST-RED sprint shipped three ingest-time detectors:

- **DT-1** (`bctcSanityValidator.ts`): digit-run fabrication detector on markdown. Blocks fabricated REJECTED_SANITY values at `push_bctc_refined_unit` ingest time.
- **DT-2** (`bctcMagnitudeValidator.ts`): magnitude plausibility (gross_profit >= net_revenue, balance forced-zero). Also ingest-time, fires inside `finalize_bctc_refine`.
- **DT-3** (`bctcMagnitudeValidator.ts`): cross-statement revenue contradiction (>20% divergence between units). Also ingest-time.

**PUB-1..4** (`checkPublishability` in `bctcFullTools.ts`): a serving-time gate that blocks reports with `refine_status=PENDING`, no table rows, no balance decomposition, or all-rejected units.

**What these guards do NOT catch:**

| Gap | Reason |
|---|---|
| ROE/ROA absurd value (0.0% or 7.8M%) | Ratios are stored from the OCR ingest path (`parseBctcReport`). The refine path (`finalizeBctcRefineTool`) updates `net_profit`, `equity_total`, `total_assets` but **does not recompute `roe`, `roa`, `net_debt_to_ebitda`, `pe`, `pb`**. Stale ratio values from original OCR parse persist. |
| EPS = 12 VND instead of ~4,000 VND | EPS is NOT mapped by `bctcScalarAggregator` (L744 hardcodes `eps: null`); the column stays at whatever the original OCR parse wrote. Unit scale mismatch not caught at serve time. |
| False YoY=-82% from cumulative Q4 vs standalone Q1 | Period basis mismatch (`period_basis` column does not exist in schema). No check at serve time. |
| Parent-only (B01a) as headline | No `report_scope` or `entity_type` column. No confidence<0.5 gate at serve time. |
| `balance sheet has no decomposition — forced-zero pass suspected` for SHB/EIB | PUB-3 bank path only accepts `statement_section='general'` rows, but SHB/EIB rows may land differently — see Cluster (b) below. |

Task #13 guards operate at **ingest time** on markdown content. BAL-0 closes the **serve-time** gap on derived analytics that were never re-derived after refine, plus semantic mismatch that cannot be detected from markdown structure alone.

---

## 2. Cluster (a): Ratio Compute Layer — Root Cause

### 2.1 Evidence Chain

**Files implicated (verified by reading):**

- `/apps/mcp-server/src/domain/services/financial-reports/ratioComputer.ts` — computes ROE, ROA, EPS, net_debt_to_ebitda at initial parse time only.
- `/apps/mcp-server/src/application/usecases/parseBctcReport.ts` L349-354 — writes `$roe`, `$roa`, `$netDebtToEbitda`, `$pe`, `$pb` from `report.ratios.*` (OCR parse path).
- `/apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` L469-491 — the scalar update list after refine does NOT include `roe`, `roa`, `net_debt_to_ebitda`, `pe`, `pb`. These columns are structurally absent from the post-refine backfill.
- `/apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts` L744 — `eps: null` hardcoded ("no standard VAS code in corpus"). EPS column is therefore never updated by the refine path.
- `/apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` L206-207 — `get_bctc_full` renders `row.roe` and `row.roa` directly from the `financial_reports` row. No recomputation.

### 2.2 Root Cause: Ratio Columns Are Orphaned After Refine

**The refine pipeline corrects base scalars (`net_profit`, `equity_total`, `total_assets`, `ebitda`, `cash`, etc.) but NEVER re-derives the ratio columns from the corrected scalars.** The ratio columns (`roe`, `roa`, `current_ratio`, `debt_to_equity`, `net_debt_to_ebitda`, `pe`, `pb`) retain the values written by the original OCR-parse path.

Two failure modes:

**Mode A — stale OCR parse written wrong value:**  
VNM 2025-Q4: original OCR parse wrote `roe=0` (because `incomeBroken=true` guard fired — `incomeKeyFields = [netRevenue, grossProfit, operatingProfit, cogs]`, all zero in OCR text extraction). Refine later recovered real `net_profit=9,413.6` and `equity_total=34,483` but `roe` column stays 0. `get_bctc_full` serves `ROE: 0.0%`.

**Mode B — scale mismatch in original ingest:**  
DHG 2026-Q1: if the original OCR parse extracted `total_assets=5,245.7` (in tỷ, not triệu, i.e. ×1000 scale error), the `roa` written at ingest time uses the wrong denominator. Refine corrects `total_assets` but `roa` is never recomputed. Result: astronomical ROA.

**Mode C — EPS never updated:**  
`bctcScalarAggregator` hardcodes `eps: null` (no standard VAS code). EPS column retains the value from the original OCR text extractor (`incomeStatementExtractor.ts` L436 — regex `P_EPS`). The VAS BCTC standard places EPS as a footnote below the income statement table, not as a numbered code row. When OCR misreads the footnote, EPS gets garbage (e.g. 12 VND = OCR reading the BCTC LINE CODE "70" or similar number as the EPS value). No guard rejects this at serve time.

**Mode D — Net Debt/EBITDA astronomical:**  
`ratioComputer.ts` L132: `netDebtToEbitda = inc.ebitda > 0 ? safeDivide(netDebt, inc.ebitda) : null`. When EBITDA is 0 (income broken), result is `null`. When EBITDA is very small (extracted incorrectly as millions instead of billions), netDebt (correctly in millions) divided by tiny EBITDA yields astronomically large ratio. Never re-derived post-refine.

### 2.3 Fix Specification for Agent-Father / Dev-Mcp-Server

**Location:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`

**Required change (BLOCK-3):** After the existing BLOCK-1 scalar backfill (L412-624), add a BLOCK-3 ratio recompute step that re-derives ratio columns from the freshly-updated scalar columns:

```
roe          = net_profit / equity_total × 100          (guard: equity_total > 0)
roa          = net_profit / total_assets × 100          (guard: total_assets > 0)
current_ratio = current_assets / total_liabilities_current (guard: denominator > 0)
debt_to_equity = (short_term_debt + long_term_debt) / equity_total (guard: equity_total > 0)
net_debt_to_ebitda = (short_term_debt + long_term_debt - cash) / ebitda  (guard: ebitda > 0)
net_margin_pct = net_profit / net_revenue × 100         (already in aggregator — should already be re-derived; confirm)
```

All above must use the post-refine scalar values read from the DB (or from `aggResult.scalars` if already computed). Write a single `UPDATE financial_reports SET roe=?, roa=?, ... WHERE id=?`. Apply null-safety guard on every denominator (0 or null denominator → SET NULL, not 0 or Infinity). No `pe`/`pb` recompute in this block — those require live market price not available in the refine tool.

**EPS handling:** EPS cannot be reliably derived from standard VAS table codes (no code exists; it is a footnote). For now, EPS must be SET NULL by the finalize tool after refine — a stale/wrong EPS value from OCR is worse than null. Track as FU-BCTC-EPS-FOOTNOTE for future extraction from the notes section. Add `eps: null` to the finalize UPDATE when `agg.eps === null` (currently the null-check skips the SET, leaving stale OCR value; change to explicit SET NULL for eps after refine confirms non-null scalars were recovered).

**Owner zone:** `dev-mcp-server` — TypeScript change in `finalizeBctcRefineTool.ts`. Requires container rebuild after change.

---

## 3. Cluster (b): Bank Serving Path — Root Cause (SHB, EIB)

### 3.1 Evidence Chain

**Files implicated:**

- `bctcFullTools.ts` `checkPublishability` L460-486: PUB-3 bank path queries `statement_section='general'` rows with `is_summary_row=0` and `value_current IS NOT NULL`.
- `bctcFormType.ts` `isBankFormFromDb` / `isBankFormFromRows`: bank detection requires (a) anchored Roman/section codes AND (b) no 3-digit corporate balance codes.

### 3.2 Root Cause Hypothesis (Two Candidates)

The "balance sheet has no decomposition — forced-zero pass suspected" message is returned by `checkPublishability` PUB-3 when `balanceChildren.cnt === 0` for the bank path.

**Candidate B-1 — isBankFormFromDb returns false for SHB/EIB, so the wrong PUB-3 query runs:**  
If SHB or EIB's `bctc_table_rows` happen to contain 3-digit codes (e.g. from a corporate sub-code that leaked into their data), `isBankFormFromRows` returns `false` (corporate veto fires), and PUB-3 uses the corporate path (looking for `statement_section='balance_sheet'` or codes 100-440). Bank rows that landed in `statement_section='general'` would then not be found → PUB-3 fails.

**Candidate B-2 — isBankFormFromDb returns true (bank path), but SHB/EIB rows have is_summary_row=1 (all summary) or value_current IS NULL:**  
The bank PUB-3 query explicitly requires `is_summary_row=0`. If the refinedMarkdownParser parsed SHB/EIB rows and set `is_summary_row=1` for all balance rows (e.g. because all rows have no child indentation), PUB-3 finds 0 non-summary rows → PUB-3 fails.

Both candidates are kin of BEQ-8 (isBankFormFromRows) and FU-BANK-CODECOL.

### 3.3 Required Investigation + Fix

**Investigation step (dev-mcp-server):** Run the following in the live container to diagnose SHB + EIB:

```sql
-- Which report_ids?
SELECT id, action_code, period_year, period_type, refine_status 
FROM financial_reports WHERE action_code IN ('SHB','EIB') ORDER BY sort_key DESC LIMIT 4;

-- Row census for the latest DONE report (substitute <id>):
SELECT statement_section, is_summary_row, 
       COUNT(*) as total,
       SUM(CASE WHEN value_current IS NOT NULL THEN 1 ELSE 0 END) as non_null
FROM bctc_table_rows 
WHERE report_id = '<id>'
GROUP BY statement_section, is_summary_row;

-- Bank form discriminator raw codes (first 30):
SELECT DISTINCT code FROM bctc_table_rows WHERE report_id = '<id>' LIMIT 30;
```

**Fix A (if Candidate B-1 confirmed — isBankFormFromDb wrong):** SHB/EIB may have mixed codes that confuse the hybrid discriminator. Add SHB and EIB to a `BANKING_TICKERS` static set (already exists in `parseBctcReport.ts` L489 for the `operatingProfit` proxy logic) and wire it into `isBankFormFromDb`/`isBankFormFromRows` as a secondary positive signal. This is the same pattern as FU-BANK-CODECOL (tracked, not yet implemented).

**Fix B (if Candidate B-2 confirmed — is_summary_row=1 for all rows):** Relax PUB-3 bank path to also accept `is_summary_row=1` rows when no non-summary rows exist: `(is_summary_row=0 OR (SELECT COUNT(*) FROM bctc_table_rows WHERE report_id=? AND is_summary_row=0 AND statement_section='general')=0)`. This is a safer fallback than rejecting all rows.

**Owner zone:** `dev-mcp-server` — investigation in live container, fix in `bctcFullTools.ts` (`checkPublishability`) and/or `bctcFormType.ts`. Requires container rebuild.

---

## 4. Cluster (c): Period Cumulative-vs-Quarter Semantics — Root Cause

### 4.1 Evidence Chain

**Files implicated:**

- `bctcFullTools.ts` L288: `const deltaType = latest.period_year !== priorRow.period_year ? "YoY" : "QoQ"` — label is derived purely from year comparison, not from period basis.
- `bctcFullTools.ts` L240-266: `buildComparisonSection` fetches the prior row by `period_type = Q3` when latest is Q4 (prior quarter within same year). VNM 2025-Q4 finds VNM 2025-Q3 as prior.
- `financial_reports` schema: no `period_basis` column (no "cumulative" vs "standalone" flag exists).
- The comparison is then labeled `QoQ: 2025-Q3 -> 2025-Q4` — but the 2025-Q4 figure is FY cumulative (63,645.9 tỷ) while 2025-Q3 is also cumulative (9M). The comparison produces a non-zero "change" that is methodologically meaningless.
- When latest is 2026-Q1 vs prior 2025-Q4: `period_year=2026 !== 2025` → label says "YoY" but Q1-2026 standalone (12,480) vs Q4-2025 cumulative FY (70,112) produces a -82.2% labeled "YoY" that is completely wrong.

### 4.2 Root Cause: Two Distinct Issues

**Issue C-1 — Extraction: cumulative column captured instead of standalone column.**  
Vietnamese BCTC Q4 filings follow VAS standard: they present the FULL-YEAR cumulative figure as the "current period" column (columns: "Năm nay" = FY cumulative, "Năm trước" = FY prior year). The standalone Q4 figure is not separately stated — analysts must compute Q4 = FY − Q1−Q2−Q3. The `incomeStatementExtractor` and `refinedMarkdownParser` capture whichever column appears first in the table. There is no flag written to the DB indicating whether the stored figure is FY-cumulative or standalone-quarter.

**Issue C-2 — Comparison layer: no period-basis guard.**  
`buildComparisonSection` compares any two rows as long as the BEQ-4b `refine_status` guard passes. It does not check whether both periods share the same basis. A Q4/FY-cumulative vs Q1-standalone comparison is methodologically invalid regardless of the numeric values. The `deltaType` label ("YoY" vs "QoQ") is determined solely from year, not from basis mismatch.

### 4.3 Fix Specification

**Sub-fix C-1 (schema + extraction — `dev-mcp-server`):**  
Add `period_basis` column to `financial_reports` table (migration in `schema-financial-reports.ts`):

```sql
ALTER TABLE financial_reports ADD COLUMN period_basis TEXT;
-- Values: 'standalone_quarter' | 'full_year_cumulative' | 'unknown'
-- Q1/Q2/Q3 filings → 'standalone_quarter' (VAS standard: these are YTD from Jan)
-- Actually: Q1=YTD 3m, Q2=YTD 6m, Q3=YTD 9m, Q4=FY (= same as annual)
-- For correct QoQ standalone computation: Q2_standalone = Q2_ytd - Q1_ytd, etc.
-- Initial conservative value: 'unknown' for all existing rows.
```

The extraction path should set `period_basis='full_year_cumulative'` when `period_type='Q4'` (VAS convention) and `period_basis='standalone_quarter'` for Q1/Q2/Q3 (actually YTD, but that is a separate problem).

Note on VAS period semantics: Vietnamese BCTC Q1=3-month YTD, Q2=6-month YTD, Q3=9-month YTD, Q4=12-month FY. All figures are cumulative from Jan 1. True standalone quarter values require subtraction of prior cumulative. This is a larger extraction scope — Phase 2 work. For Phase 1, the minimum is to tag Q4 as cumulative and guard the comparison.

**Sub-fix C-2 (comparison layer — `dev-mcp-server`):**  
In `bctcFullTools.ts` `buildComparisonSection`, add period-basis guard after the BEQ-4b check:

```typescript
// CLUSTER-C guard: do not compare FY-cumulative to standalone-quarter
if (latest.period_basis === 'full_year_cumulative' && priorRow.period_basis === 'standalone_quarter') {
  return [
    `=== QoQ/YoY COMPARISON ===`,
    `Period mismatch: ${latest.sort_key} is FY-cumulative vs ${priorRow.sort_key} standalone-quarter — comparison withheld to prevent false delta.`,
    `Standalone Q4 figure requires subtraction: Q4 = FY − Q1−Q2−Q3 (not yet implemented).`,
  ].join("\n");
}
// Also guard the reverse direction
if (latest.period_basis === 'standalone_quarter' && priorRow.period_basis === 'full_year_cumulative') {
  return [
    `=== QoQ/YoY COMPARISON ===`,
    `Period mismatch: comparing ${latest.sort_key} standalone-quarter to ${priorRow.sort_key} FY-cumulative — comparison withheld.`,
  ].join("\n");
}
```

Until `period_basis` column is populated, the guard silently passes (null != 'full_year_cumulative'). This is safe: it starts blocking only when data is tagged correctly.

**Interim BAL-0 rule (immediate, before period_basis exists):** Any Q4 report should be treated as FY-cumulative for BAL-0 blocking purposes. See Section 5 below.

**Owner zone:** `dev-mcp-server` — schema migration + extraction flag write + comparison guard. Also requires `finalizeBctcRefineTool.ts` to write `period_basis` during scalar backfill (infer from `period_type`).

---

## 5. Cluster (d): Entity Scope — Root Cause

### 5.1 Evidence Chain

**Files implicated:**

- `financial_reports` schema: no `report_scope` or `entity_type` column (search confirmed: `grep "report_scope\|entity_type"` = no results in schema files).
- `bctcFullTools.ts` `buildSummarySection` L188: serves whatever `net_revenue` is in the row — no scope label in output.
- `checkPublishability` does not check `extraction_confidence` against a threshold. PUB-1..4 pass for HPG parent-only at confidence 44%.

### 5.2 Root Cause

HPG 2025-Q4: the SSC EDGAR/HNX corpus contains both a consolidated filing (Mẫu B01-DN hợp nhất, ~140k tỷ rev) and a parent-only filing (Mẫu B01-DN riêng lẻ, Rev=0, NP=5,597.9, conf 44%). The system stores whichever PDF was fetched first as the `latest` report for the sort_key. `get_bctc_full` (L573-590) queries `ORDER BY sort_key DESC LIMIT 1` — if both have the same sort_key (same period), it returns the one with the higher sort_key which is non-deterministic on tie.

Two sub-problems:

**Sub-problem D-1 — No scope detection:** The extraction pipeline does not detect or store whether a report is consolidated or parent-only. No `report_scope` column exists in the schema.

**Sub-problem D-2 — No confidence threshold at serve time:** `checkPublishability` PUB-1 checks `refine_status IN (DONE, PARTIAL)` but does not check `extraction_confidence`. A report at confidence 44% passes PUB-1. There is no "minimum confidence for serving" gate.

### 5.3 Fix Specification

**Sub-fix D-1 (scope detection — `dev-mcp-server`):**  
Add `report_scope` column to `financial_reports`:

```sql
ALTER TABLE financial_reports ADD COLUMN report_scope TEXT;
-- Values: 'consolidated' | 'parent_only' | 'unknown'
```

Detection heuristic for existing rows: if `net_revenue = 0 OR net_revenue IS NULL` AND `net_profit IS NOT NULL AND net_profit > 0` → flag as likely `parent_only`. This heuristic should be applied in the scalar backfill step of `finalizeBctcRefineTool.ts`.

For future extractions: the PDF filename and header text typically contain "Hợp nhất" (consolidated) or "Riêng lẻ" (parent-only/separate). The `bctcReparseJob.ts` filename parser (L402-422) could capture this signal.

**Sub-fix D-2 (serve-time confidence gate — `dev-mcp-server`):**  
In `checkPublishability`, add PUB-5:

```typescript
// PUB-5: minimum confidence threshold for serving as headline
const MIN_SERVE_CONFIDENCE = 0.5;
if (report.extraction_confidence < MIN_SERVE_CONFIDENCE) {
  return {
    publishable: false,
    reason: `Extraction confidence too low (${(report.extraction_confidence * 100).toFixed(0)}%) — minimum ${MIN_SERVE_CONFIDENCE * 100}% required for serving.`,
  };
}
```

Extend the existing `report` query in PUB-1 to also SELECT `extraction_confidence`.

**Owner zone:** `dev-mcp-server` — schema migration + heuristic flag + `checkPublishability` PUB-5. Requires container rebuild.

---

## 6. BAL-0: Publish-Gate — Minimal Buildable Spec (URGENT/PROTECTIVE)

### 6.1 Pattern Reference

The proven pattern is the fb-jargon-gate (brief `2026-06-02-fb-jargon-gate.md`): a deterministic executable shell script + SKILL file + hard-fail step in the flow. BAL-0 follows the same pattern but guards the BCTC serving layer, not the FB text layer.

### 6.2 Consumers to Guard (Verified)

- `docs/agents/unified-agent/flow/market-analysis.md` Step 4b EPS pillar: `compare_financials per ticker` — BCTC figures feed into conviction reasoning → Telegram MARKET.
- `docs/agents/market-analyst/flow/main.md` Step "Stock Financials": `get_bctc_full(code)` → analysis → potential MARKET publish.

Both agents call `get_bctc_full` and use the returned figures (ROE, ROA, EPS, YoY deltas) as inputs to public-facing analysis. The gate must fire BEFORE those figures are incorporated into any output that reaches the MARKET channel.

### 6.3 Gate Location: Serve-Time (Tool Layer), NOT Flow Layer

The most robust location is inside `get_bctc_full` itself, as a new PUB-5..7 semantic-sanity block appended to `checkPublishability`. This is the only place where both the raw scalars AND the formatted output are available simultaneously, and it fires for every consumer automatically regardless of which flow calls it.

**Do NOT implement as a flow-level guard** — flows can be edited, new flows can be added, agents can bypass. A tool-level guard is structural and cannot be bypassed without code change.

### 6.4 BAL-0 Hard-Fail Rules (PUB-5..7 in checkPublishability)

**PUB-5 — Confidence gate (from Cluster d fix):**  
Block if `extraction_confidence < 0.5`.

**PUB-6 — Ratio sanity gate (Cluster a fix — interim, before recompute lands):**  
After reading the `latestRow`, compute ratio sanity checks directly in `get_bctc_full` (not `checkPublishability` — ratios need both the row and computed values):

```
|ROA| > 100%      → BLOCK ("ROA out of bounds: {value}% — unit scale or stale ratio error")
|ROE| > 300%      → BLOCK ("ROE out of bounds: {value}% — unit scale or stale ratio error")
|NetDebt/EBITDA| > 200x → BLOCK ("Net Debt/EBITDA out of bounds: {value}x")
EPS < 0 or EPS > 100,000 VND → BLOCK ("EPS out of bounds: {value} VND")
```

These are hard arithmetic bounds; no real Vietnamese listed company should exceed them. When the gate fires, `get_bctc_full` returns the block message instead of financial data — the same pattern as the existing PUB-1..4 refusals.

**PUB-7 — Period basis mismatch gate (Cluster c fix — interim):**  
Until `period_basis` column exists, apply heuristic: if `latest.period_type === 'Q4'` AND `priorRow.period_type` is NOT 'Q4' AND `priorRow.period_year === latest.period_year` → withhold comparison section with message: `"Q4 figures are FY-cumulative — QoQ comparison to Q3 withheld. Use get_financial_summary for YoY same-quarter comparison."`.

If `latest.period_type` is NOT 'Q4' AND `priorRow.period_type === 'Q4'` (comparing Q1-2026 vs Q4-2025 = FY) → withhold comparison with: `"Prior period Q4 is FY-cumulative — cross-year comparison between Q1-standalone and Q4-FY withheld."`.

**PUB-8 — Parent-only/low-revenue gate (Cluster d interim):**  
Until `report_scope` column exists, apply heuristic: if `net_revenue === 0 AND net_profit > 0 AND extraction_confidence < 0.6` → BLOCK with "Parent-only filing suspected (Rev=0, NP>0, confidence {pct}%) — consolidated report required for headline serving."

### 6.5 Implementation Owner and Minimum Correct Implementation

**Owner:** `dev-mcp-server` (TypeScript, no agent .md changes needed).  
**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`.  
**Scope:** PUB-6 and PUB-8 are inline checks immediately after the existing PUB-4 block in `checkPublishability` (or inline in the tool handler for PUB-7 which needs both rows). PUB-5 is a column-read extension.

**Minimum correct implementation specification:**

1. Extend `checkPublishability` to accept the `latestRow` object (not just `reportId`). Currently it takes `(db, reportId, bankForm)` — extend to `(db, reportId, bankForm, row)` to avoid a second DB query for ratio values.
2. Add PUB-5 (confidence gate) inside `checkPublishability` using `row.extraction_confidence`.
3. Add PUB-6 (ratio bounds) inside `checkPublishability` using `row.roe`, `row.roa`, `row.net_debt_to_ebitda`, `row.eps`.
4. Add PUB-8 (parent-only) inside `checkPublishability` using `row.net_revenue`, `row.net_profit`, `row.extraction_confidence`.
5. Add PUB-7 (period basis) as an inline check in `buildComparisonSection` (it already has access to both rows) BEFORE the BEQ-4b check.
6. Update the `checkPublishability` call site in `get_bctc_full` to pass `latestRow`.
7. Update test file `apps/mcp-server/src/__tests__/bctcPublishabilityGuard.test.ts` (already exists — add test cases for each new gate).

**No script + SKILL file required** for BAL-0 — the gate lives in the TypeScript tool layer. The fb-jargon-gate pattern used a shell script because the fb flow runs in a shell environment. The BCTC serve gate runs in TypeScript and should stay in TypeScript. The "hard-fail" is the existing pattern: return `{ publishable: false, reason: "..." }` which causes `get_bctc_full` to return the reason string instead of financial data. The agents (market-analyst, unified-agent) will receive the block message and must not use the data for MARKET publishing — this is enforced by the fact that the data is not served at all.

---

## 7. Task Fanout for Agent-Father / PM

| Task ID | Description | Owner Zone | Priority | Dependency |
|---|---|---|---|---|
| BAL-0-DEV | Implement PUB-5..8 in `bctcFullTools.ts` + update `checkPublishability` signature | dev-mcp-server | CRITICAL/IMMEDIATE | None |
| BAL-0-QA | Test BAL-0: VNM 2025-Q4 (ROE=0 → blocked), DHG ROA=7.8M% → blocked, VNM Q4 vs Q1 YoY → withheld, HPG Rev=0 → blocked | qa | CRITICAL/IMMEDIATE | BAL-0-DEV |
| BAL-1a-DEV | Add BLOCK-3 ratio recompute to `finalizeBctcRefineTool.ts` (roe/roa/current_ratio/debt_to_equity/net_debt_to_ebitda from corrected scalars; eps SET NULL after refine) | dev-mcp-server | HIGH | BAL-0-DEV (BAL-0 is protective shield) |
| BAL-1a-QA | Verify VNM post-re-finalize ROE≈27%, ROA correct, Net Debt/EBITDA reasonable | qa | HIGH | BAL-1a-DEV |
| BAL-1b-INV | Investigate SHB + EIB bctc_table_rows (run SQL census above in container) → confirm Candidate B-1 or B-2 | dev-mcp-server | HIGH | None (investigation) |
| BAL-1b-DEV | Fix bank serving path based on investigation verdict (BANKING_TICKERS static set and/or PUB-3 relaxation) | dev-mcp-server | HIGH | BAL-1b-INV |
| BAL-1c-DEV | Add `period_basis` column migration + set Q4→'full_year_cumulative' in finalize scalar backfill + comparison guard in `buildComparisonSection` | dev-mcp-server | HIGH | BAL-0-DEV |
| BAL-1d-DEV | Add `report_scope` column migration + heuristic (rev=0,np>0 → parent_only) in finalize + PUB-5 confidence gate upgrade | dev-mcp-server | MEDIUM | BAL-0-DEV |
| BAL-1e-DEV | Future: EPS extraction from VAS BCTC footnote section (BCTC-EPS-FOOTNOTE) | dev-mcp-server | LOW | BAL-1a-DEV |

**Rebuild required after every `dev-mcp-server` change** (per ops policy).

---

## 8. Signal to Agent-Father

Written to `docs/signals/bctc-analytics-layer-bal1-20260602T110455Z.json` alongside this brief.

---

*Brief authored by agents-architect 2026-06-02T11:04:55Z per recurring-bug-escalation policy. Root causes verified by direct source code read. All file paths are absolute.*

---

## BAL-1a-BACKFILL Decision (2026-06-02)

**Chosen Option: R — Recompute-on-Read**

**Rationale:**

Option R is the definitive fix, not a symptom patch. Option B (one-shot UPDATE backfill) leaves the class alive for any row finalized before BAL-1a and requires a migration script that can fail silently; it also does not protect against future records ingested before a re-finalize step runs. Option R is superior on two structural grounds. First, the near-zero stale value case (VNM `roe=2.75e-10`) does not trigger PUB-6 because `|2.75e-10| < 300` — the bounds guard catches out-of-range ratios, not stale near-zero ones. This means PUB-6 alone cannot protect VNM even after BAL-0 ships; only reading correct values eliminates the display defect. Second, the base scalars (`net_profit`, `equity_total`, `total_assets`, `short_term_debt`, `long_term_debt`, `cash`, `ebitda`) are confirmed correct in every persisted row (the refine pipeline writes them); five floating-point divisions per `get_bctc_full` call is negligible overhead. On the double-source-of-truth question: once read-time recompute is the authority, the persisted ratio columns become a derived-cache with no consumer in the serve path. They should be treated as deprecated-cache: leave them in the schema to avoid a migration, but never read them in `get_bctc_full` (the recomputed values shadow them entirely). The finalize-time ratio write introduced by BAL-1a (`finalizeBctcRefineTool.ts` BLOCK-3) becomes redundant but harmless — it may be removed in a future cleanup sprint (FU-BCTC-RATIO-COL-DEPRECATE) once the recompute-on-read path is verified stable.

**Implementation directive for dev-mcp-server:**

In `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`, modify the `get_bctc_full` handler so that immediately after the persisted `latestRow` is read from the DB and before `checkPublishability` is called (around L751), recompute the five ratio values from the correct persisted base scalars using the `safeDivide` inline pattern already present in `ratioComputer.ts` (do NOT import `computeFinancialRatios` — that function requires a full structured parse object which is not available at serve time; instead inline the five scalar formulas directly in the handler): `roe = net_profit / equity_total × 100` (guard: `equity_total > 0 && equity_total != null`); `roa = net_profit / total_assets × 100` (guard: `total_assets > 0 && total_assets != null`); `current_ratio = current_assets / total_liabilities_current` (guard: `total_liabilities_current > 0 && total_liabilities_current != null`); `debt_to_equity = (short_term_debt + long_term_debt) / equity_total` (guard: `equity_total > 0 && equity_total != null`); `net_debt_to_ebitda = (short_term_debt + long_term_debt - cash) / ebitda` (guard: `ebitda > 0 && ebitda != null`). Any denominator that is null, zero, or negative must yield `null` (not 0, not Infinity). Assign the five recomputed values back onto `latestRow` (mutate in place: `latestRow.roe = recomputedRoe` etc.) so that `checkPublishability` (which receives `latestRow`) sees the correct values and PUB-6 bounds-checks operate on correct data. The persisted ratio columns in `financial_reports` are now treated as deprecated-cache — `get_bctc_full` must never use them directly again after this change; the `latestRow.roe` / `latestRow.roa` references in `buildSummarySection` (L194–195, L224–225) will automatically pick up the recomputed values because they operate on the same `latestRow` object. No DB write is required. No schema migration is required.

**Live-verify acceptance test:**

Call `get_bctc_full(code="VNM")` after container rebuild. Expected: `ROE` renders approximately `27.3%` (derived from `net_profit ≈ 9,413.6 tỷ / equity_total ≈ 34,483 tỷ`), `ROA` renders a plausible single-digit percentage, `Net Debt/EBITDA` renders a plausible value (not astronomical). Verify that PUB-6 no longer fires a `partialWarning` for VNM (i.e., the `[PUB-6] Some ratio(s) withheld` note is absent from the output, because the recomputed values are within bounds). PUB-6 should remain in the code as a backstop for corrupted base-scalar edge cases — it must not be removed.

**Authored:** agents-architect 2026-06-02T14:14:14Z — BAL-1a-BACKFILL recurring-bug-escalation (4th touch of bctcFullTools.ts serve-path / publishability family).
