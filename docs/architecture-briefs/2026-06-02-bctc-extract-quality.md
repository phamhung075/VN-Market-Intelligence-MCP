# Architecture Brief — BCTC-EXTRACT-QUALITY Diagnostic Spike

**Task:** BEQ-1 | **Sprint:** BCTC-EXTRACT-QUALITY
**Zone:** apps/mcp-server/
**Date:** 2026-06-02 | **Author:** agents-architect
**Mode:** PLAN-ONLY — no production code written, no DB mutations

---

## Executive Summary

All four symptoms share one root: the BCTC pipeline has two distinct write-paths for
`financial_reports` scalars, and the refine-path (the correct one) is blocked or never
triggered for most of the corpus. The `/docs` listing scalar and `get_bctc_full` both
read the same `financial_reports` table, so they share the same stale values. Secondary
columns (operating_profit, ebitda, cash, EPS) are never written by the refine path at
all — they permanently retain whatever the original OCR parser wrote, which for most
tickers is 0 or a wrong placeholder.

---

## Symptom A — EMPTY refine: CTG/VCB return "Chưa có dữ liệu BCTC"

### Root cause: refine-never-ran (PUB-1 gate blocks on refine_status = PENDING, 0 bctc_refined_units)

**Evidence (live DB read):**

```
CTG 2026-Q1: refine_status=PENDING, table_rows=0, units_total=0, units_done=null
VCB 2025-Q4: refine_status=PENDING, table_rows=0, units_total=0, units_done=null
VCB 2025-Q1: refine_status=PENDING, table_rows=0, units_total=0, units_done=null
```

`get_bctc_full` calls `checkPublishability` (bctcFullTools.ts:399-514). PUB-1 gate:
```typescript
if (!report || !["DONE", "PARTIAL"].includes(report.refine_status)) {
  return { publishable: false, reason: "Chưa có dữ liệu BCTC" };
}
```
This fires for all three reports because `refine_status = PENDING`.

**Why PENDING?** Zero `bctc_refined_units` rows exist for CTG and VCB. The agentic
refine pipeline (which calls `push_bctc_refined_unit` + `finalize_bctc_refine`) was
never dispatched for these tickers. The `bctcRefineJob` scheduler
(`apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts`) triggers refine
only for reports that meet its eligibility criteria — CTG/VCB were not processed.

**Additional CTG blocker (confirmed):** CTG's fetched PDF is a cover-letter-only
document (2 pages: HĐQT letter + "Công bố thông tin" header). OCR extracted only
2 pages with no financial tables. Even if the refine job ran, there is no table content
to parse. This is the pre-existing backlog item `BCTC-CTG-ATTACHMENT-FETCH`.

**Layer:** Refine-trigger layer (scheduler). Not a parser failure. Not a DB-wedge.

---

## Symptom B — Zeroed secondary lines: FPT+ACB show correct headlines but Operating Profit=0, EBITDA=0, Cash=0, EPS garbage

### Root cause: bctcScalarAggregator does NOT write operating_profit / ebitda / cash / EPS; finalize only backfills the 10 columns in ScalarAggregate; the remaining columns retain the legacy OCR-parser placeholder values (0 or 1)

**Evidence (live DB):**

```
FPT 2026-Q1 (refine_status=DONE, 145 table_rows):
  financial_reports: operating_profit=0, ebitda=0, cash=0.000001, eps=1
  bctc_table_rows: code=30 label="Lợi nhuận thuần từ hoạt động kinh doanh" value_current=2,747,763,827,050
                   code=20 label="Lợi nhuận gộp" value_current=4,244,889,890,688

ACB 2026-Q1 (refine_status=DONE, 106 table_rows):
  financial_reports: operating_profit=0, ebitda=0, cash=0, eps=0
```

`bctcScalarAggregator.ts` (domain/services/financial-reports) defines `ScalarAggregate`
(lines 76-87) with exactly 10 fields:
```
net_revenue, gross_profit, profit_before_tax, net_profit,
total_assets, current_assets, total_liabilities, equity_total,
gross_margin_pct, net_margin_pct
```

`operating_profit`, `ebitda`, `cash`, `eps`, `diluted_eps`, `operating_cf`,
`investing_cf`, `financing_cf`, `capex`, `free_cash_flow` are **absent from
ScalarAggregate**. `finalizeBctcRefineTool.ts` (lines 446-456) only issues SET
clauses for the 10 resolved scalars. The remaining columns are never touched after
the initial `storeReport` call in `parseBctcReport.ts`.

`parseBctcReport.ts:storeReport` writes these via regex-based OCR extractors
(`extractIncomeStatement`, `extractCashFlow`, `extractBalanceSheet`). For most tickers
these return 0 when the regex pattern fails on OCR text — which it frequently does for
modern PDFs with complex table layouts. The refine pipeline replaces only the 10
mapped scalars; the 0-placeholders from the initial OCR parse persist forever.

For **EPS specifically**: `storeReport` L328 binds `$eps: report.incomeStatement.eps`.
FPT shows eps=1. The income statement extractor likely parsed a single digit from OCR
noise. ACB shows eps=0 — bank income statement extractor found nothing.

**Layer:** Projection/mapping layer. The `bctcScalarAggregator` has a scope gap: it
maps 10/~20 income+balance columns and leaves the rest to the stale OCR parse.

---

## Symptom C — Garbage /docs net_profit scalars (CTG=5, EIB=1, VNM=5.1e-05, DIG=18)

### Root cause: net_profit in the /docs listing is read directly from financial_reports.net_profit, which for refine_status=PENDING tickers is the legacy OCR-parse value written by parseBctcReport; the OCR extractors produce near-zero or wrong values for PDF types they cannot parse

**Evidence (live DB):**

```
CTG 2026-Q1:  refine_status=PENDING, extraction_method=pdf-parse, net_profit=5
EIB 2026-Q1:  refine_status=PENDING, extraction_method=pdf-parse, net_profit=1
VNM 2025-Q4:  refine_status=PENDING, extraction_method=pdf-parse, net_profit=0.000051
              net_revenue=63,645,887 million VND (correct order), bctc_table_rows=143 rows but all value_current=NULL
DIG 2025-Q4:  refine_status=PENDING, extraction_method=pdf-parse, net_profit=18
```

The `/docs` listing handler (`bctcInspectHandler.ts:handleBctcInspectDocs`, lines
162-245) runs `LIST_SQL` (lines 119-131) which reads `net_profit` directly from
`financial_reports` with no refine-status filter:
```sql
SELECT ... net_profit ... FROM financial_reports
WHERE action_code NOT LIKE '%example%' ...
```

For PENDING tickers, `net_profit` was written by `parseBctcReport/storeReport`
via `extractIncomeStatement`. The legacy regex extractor produces broken values when:
- OCR confidence is low (CTG=0.0625, BSR=0.125 — cover letter / degraded scan)
- The PDF uses a format the regex does not recognize (VNM multiline, DIG table variant)
- The value is extracted in raw VND and then divided by the wrong scale factor

**VNM=5.1e-05 pattern**: `parseBctcReport` has a unit-scale detection heuristic
(see commit `7628c166` — "FPT unit scale"). For VNM Q4-2025 the 143 table_rows
all have `value_current=NULL` (the refine pipeline was never called, the table rows
were populated by a different legacy path that produced nulls). `net_profit=0.000051`
million VND = 51 VND in absolute terms — this is a near-zero OCR garbage value.
`net_profit_api_bridge=2,840,370` million VND is the correct API reference (2.84 tỷ).
`isDecimalShiftAnomaly` (bctcInspectHandler.ts:64-79) would flag this as anomaly=true
(ratio >> 10), which means the `/docs` viewer already marks it as anomalous — but
the garbage value is still displayed.

**Same source as get_bctc_full:** Both the `/docs` listing and `get_bctc_full` read
from `financial_reports.net_profit`. For DONE tickers (FPT, ACB), the refine pipeline
has already overwritten the correct value. For PENDING tickers, both surfaces serve
the broken OCR-parse value. There is NO divergence between the two consumers.

**Layer:** Scalar-projection + OCR-extractor layer. The /docs listing faithfully
reflects what is in financial_reports; the garbage is upstream in the storeReport write.

---

## Symptom D — Contamination: FPT YoY "20.2 tỷ" net profit (revenue mislabeled as profit)

### Root cause: FPT Q4-2025 is a legacy pdf-parse row where gross_profit=net_revenue (same value); refine was never run for this period; get_bctc_full buildComparisonSection uses this row as the prior period, producing a nonsense YoY

**Evidence (live DB):**

```
FPT 2025-Q4 (prior period for YoY comparison):
  extraction_method=pdf-parse  (NOT the refine pipeline)
  refine_status=PENDING
  bctc_refined_units=0
  net_profit=20,225 million VND
  net_revenue=20,225,450 million VND
  gross_profit=20,225,450 million VND  (= net_revenue: parser wrote revenue into gross_profit)
  bctc_table_rows=79 rows, ALL in statement_section='balance_sheet', ZERO income_statement rows
```

`net_revenue / net_profit = 1000.02` — net_profit is exactly `net_revenue ÷ 1000`.
This is the legacy unit-scale bug: `extractIncomeStatement` parsed FPT's Q4-2025 revenue
in billions VND (20,225 tỷ) while all other fields were in millions VND. The result was
stored as 20,225 million VND for net_profit (matching the billions-unit parse of revenue)
while net_revenue was stored in the correct millions unit (20,225,450 million = 20.2 tỷ).

`buildComparisonSection` (bctcFullTools.ts:229-300) auto-selects the latest prior period
row. For FPT's most recent report (2026-Q1), the prior is 2025-Q4. It calls `rowToMetrics`
which maps `row.net_profit` directly. Since 2025-Q4 `net_profit=20,225` is a legacy
placeholder (not the true 2,000+ tỷ profit), the YoY comparison produces:
- `net_profit: 2025-Q4=20,225M → 2026-Q1=2,476,790M → +12146%`

This is NOT a new parser mislabel in the current refine path. It is the legacy OCR
placeholder from `parseBctcReport` for 2025-Q4, which was never overwritten by the
refine pipeline. The contamination is fully explained by `FU-TRUST-REFRESH` residue:
prior-period rows with `refine_status=PENDING` are silently used as comparison
baselines in `buildComparisonSection` without any PENDING guard.

**Layer:** Application layer — `buildComparisonSection` has no `refine_status` guard
on the prior row. Combined with the incomplete refine coverage (most periods PENDING).

---

## Fix Plan — Ordered by Impact

### FIX-1: Trigger refine for the corpus (all PENDING tickers with OCR present but 0 units)

**Owner:** dev-mcp-server
**Priority:** Immediate (unblocks everything downstream)
**Scope:** `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts`

The `bctcRefineJob` must be audited to understand why VCB, FPT Q4-2025, VNM, EIB,
DIG, SHB have `refine_status=PENDING` with zero `bctc_refined_units`. Either the
eligibility filter is too narrow, or the job is not running for these tickers.
A one-time backfill trigger (or broadening the eligibility condition) will move
PENDING→DONE for tickers with OCR text, overwriting the garbage scalars.

**Exclusion:** CTG cannot be fixed by refine alone — it needs `BCTC-CTG-ATTACHMENT-FETCH`
first (the real financial PDF must be fetched before the refine pipeline can extract tables).

### FIX-2: Extend bctcScalarAggregator to cover operating_profit, ebitda, cash, EPS

**Owner:** dev-mcp-server
**Priority:** High (closes the permanent-zero secondary lines)
**Scope:**
- `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`

Add to `ScalarAggregate`:
- `operating_profit` — corporate code "30" (Lợi nhuận thuần từ hoạt động kinh doanh)
- `cash` — corporate code "110" (Tiền và các khoản tương đương tiền) or balance label
- `eps` — derive from `net_profit / shares_outstanding` if shares is stored, or
  parse from the BCTC footnote label pattern; currently always 0 because the
  regex extractor fails and the aggregator never overwrites it
- `ebitda` — cannot be directly mapped from BCTC codes (derived metric); compute
  as `operating_profit + depreciation_amortization_from_cash_flow` if both resolved
- `operating_cf`, `investing_cf`, `financing_cf` — cash flow codes "20", "30", "40"

**Note:** `operating_profit` code "30" is already present in FPT's table_rows
(`value_current=2,747,763,827,050`) but not mapped by the aggregator. This is a
pure mapping gap, not a parser gap.

**Recurring-bug flag:** `bctcScalarAggregator.ts` has had 4 fix commits in rapid
succession (FU-5, FU-6c, FU-6d, FU-6e, FU-6f). Per the recurring-bug-escalation
policy (≥2 fix commits on same module), this module is escalation-eligible. The
root cause of the repeated fixes is that the ScalarAggregate scope was defined too
narrowly at inception (10/20 columns) and each fix has added one more mapping without
reconsidering the full column set. FIX-2 should be treated as a complete column-audit
pass, not another incremental patch.

### FIX-3: Add refine_status guard on the prior-period row in buildComparisonSection

**Owner:** dev-mcp-server
**Priority:** High (closes YoY contamination without waiting for refine backfill)
**Scope:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts`

In `buildComparisonSection` (lines 229-300), after the prior row query, add:
```typescript
if (priorRow.refine_status === "PENDING") {
  return `=== QoQ/YoY COMPARISON ===\nPeriod prior (${priorRow.sort_key}) data not yet refined — comparison withheld to avoid contamination.`;
}
```
This is a 2-line guard, fully separable from the BCTC-LAYOUT-FIRST re-architecture.

### FIX-4: CTG real PDF fetch

**Owner:** dev-mcp-server / dev-vps-crawls
**Priority:** High (prerequisite for CTG to ever have real data)
**Scope:** `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts` + VPS crawler

CTG 2026-Q1 PDF is a 2-page cover letter. The real BCTC attachment must be fetched
separately. The page count / file size sanity gate described in `BCTC-CTG-ATTACHMENT-FETCH`
should block the cover letter from entering the pipeline.

---

## BCTC-LAYOUT-FIRST Subsumption Ruling

**Ruling: SEPARABLE. All four fixes are worth doing now.**

BCTC-LAYOUT-FIRST (LF-EXTRACT / LF-OVERLAY, status=TODO) is a re-architecture of
the extraction input layer — it replaces the regex OCR text extractor with a layout-
aware extractor using PEK bounding boxes. It does NOT:
- Change the ScalarAggregate column scope (FIX-2 gap)
- Add a refine_status guard to buildComparisonSection (FIX-3)
- Fix the refine-trigger coverage gap (FIX-1)
- Fetch the correct CTG PDF (FIX-4)

FIX-2 (extend ScalarAggregate) IS relevant to LAYOUT-FIRST in that the final
column-mapping code will be refactored in that sprint. However, adding the missing
10 columns now is a pure domain-layer addition that will be preserved or trivially
migrated when LAYOUT-FIRST ships. It provides immediate value (zero secondary lines
is blocking the analyst) and takes < 1 dev-day. The balance-identity invariant already
catches wrong picks, making the domain layer safe to extend.

**Exception:** If the team decides to start BCTC-LAYOUT-FIRST within the current
sprint window (i.e., within 2 weeks), FIX-2 could be deferred to avoid a merge
conflict on bctcScalarAggregator.ts. FIX-1 and FIX-3 have zero LAYOUT-FIRST overlap
and should always ship first.

---

## FIX-5: BEQ-EXTRACT-RESIDUAL — Layered Quality Gate for Post-Backfill Scalar Garbage

**Added:** 2026-06-02 | **Escalation trigger:** ≥6 fix commits on bctcScalarAggregator.ts |
**Scope:** dev-mcp-server | **Task:** BEQ-6 (M-L)

### Root Cause Analysis (recurring-bug contract review)

The BEQ-2 backfill (executed 2026-06-02 09:10Z, 6 reports refined) exposed four
garbage values that **survived the existing balance-identity gate:**

| Ticker | Field | Observed value | Expected magnitude |
|---|---|---|---|
| DHG-Q1 | total_assets | 4 (million VND) | ~3,700,000 (3.7 tỷ) |
| SHB-Q4 | total_assets | 11 (million VND) | ~700,000,000+ (bank) |
| EIB-Q1 | total_assets | 0 | ~200,000,000+ (bank) |
| VEA-Q4 | operating_cf | 255,973,471,388 M VND | ~1,000 (industrial scale) |

Additionally: HPG-Q4 balance_violation (total_assets unresolved) remained in
`BALANCE_VIOLATION` state — not garbage-passed, but also not caught early enough to
redirect to re-extract. Three zero-table-row reports (VCB×2, DGC, DIG) need
re-fetch/re-extraction but have no actionable gate in the current pipeline.

**Root cause 1 — Bank misclassification allows balance-identity bypass (DHG, SHB, EIB):**

The `isBankPath` discriminator in `aggregateScalars` (bctcScalarAggregator.ts:578) uses
`findByCode(rows, "10") === null` as a proxy for bank form. This is the same flaw
identified in the 2026-06-02 09:09Z rescope brief (§2, design decision B):
balance-sheet-only corporate reports (DHG industrial, VEA industrial) also have no
code "10" row → classified as banks → `notApplicable = ["gross_profit", "current_assets",
"gross_margin_pct"]` → bank label paths fire → wrong picks → near-zero garbage.

For EIB and SHB (genuine banks): the bank label paths fail to resolve `total_assets`
because the bank label patterns (`P_BANK_TOTAL_ASSETS`) do not match the specific OCR
rendering in those PDFs → `total_assets = null` → balance identity fires
"REQUIRED SCALARS UNRESOLVED" → balance violation → the finalize tool CORRECTLY skips
the scalar write. But the backfill tool (backfillBctcScalarsTool.ts:249) marks these
DONE on a zero-update pass — the false-DONE landmine produces `total_assets=0` in the
DB from the legacy `storeReport` write (not from the aggregator). The balance gate
stopped the aggregator from writing the wrong value; it did NOT prevent the legacy
zero from persisting as visible output.

For DHG-Q1 and VEA-Q4: the aggregator ran (not blocked by balance gate) but wrote
near-zero or astronomically-wrong values. DHG total_assets=4 means a corporate row with
code matching total_assets pattern was found but had `value_current=4` (a section header
or degenerate row). VEA operating_cf=255,973,471,388 is the raw-VND threshold detection
failure: `detectDivisor` computed divisor=1 (max value < 1e11 in the majority of rows)
but the CF row itself was stored in raw VND — unit-scale heterogeneity within one report.

**Root cause 2 — balance_pass is not a sufficient quality gate (5 false-greens confirmed,
per project_bctc_ocr_psm_drift):**

The `enforceBalanceIdentity` check only detects cases where all three balance-sheet
scalars are resolved AND their arithmetic is inconsistent. It does NOT catch:
- A single correct pick with two wrong picks that still sum to ≈ total_assets (rare
  but possible with coincidentally-matching wrong rows).
- A genuine zero `total_assets` case where the `if (total_assets === 0) return null`
  guard silently passes an invalid state.
- Scale detection failure where divisor=1 is chosen but some rows are in raw VND —
  the balance check passes if all three scalars happen to share the same wrong scale.
- Scalar garbage in columns NOT part of the balance-identity triple (operating_cf,
  operating_profit, cash) — the gate simply does not check these.

The balance gate is a NECESSARY but NOT SUFFICIENT quality gate. It catches the worst
structural inconsistencies but is blind to plausibility, scale coherence, and
cross-field ratio anomalies.

**Root cause 3 — Zero-table-row reports have no actionable pipeline gate:**

VCB×2, DGC, DIG have `table_row_count=0` after OCR extraction. The pipeline treats these
as extraction failures (refine_status=PENDING or FAILED) and stops. There is no automated
escalation path to trigger re-fetch or re-OCR. These reports are silently stranded.

---

### Proposed Fix — Layered Quality Gate (NOT another code-mapping patch)

This fix addresses the ARCHITECTURE of quality assurance, not individual mapping rules.
It adds three layers beyond the existing balance-identity check.

#### Layer A — Magnitude / Sector-Peer Plausibility Bounds (domain, pure)

**Location:** `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`
or a new peer file `bctcPlausibilityGate.ts` (preferred — separation of concerns).

**Principle:** each resolved scalar must fall within a sector-appropriate magnitude
envelope. Violations are classified as WARN or BLOCK depending on the deviation severity.

**Bounds table (million VND, approximate sector-peer ranges from watchlist corpus):**

| Scalar | Plausibility floor | Plausibility ceiling | Notes |
|---|---|---|---|
| total_assets | 1,000 | 20,000,000,000 | 1B VND floor (smallest micro-cap) |
| net_revenue | 0 | 200,000,000 | 200 tỷ VND ceiling (very large corp) |
| net_profit | -500,000 | 50,000,000 | negative = loss, acceptable |
| operating_cf | -1,000,000 | 5,000,000 | absolute bounds |
| cash | 0 | 2,000,000,000 | bank-safe ceiling |

For bank-form reports: `total_assets` floor = 1,000,000 (1 tỷ VND — banks are large
by definition); ceiling = 20,000,000,000 (ACB 2026-Q1 ≈ 1,000,000,000, SHB larger).

DHG-Q1 total_assets=4 is **below the 1,000 floor** → BLOCK.
VEA-Q4 operating_cf=255,973,471,388 is **above the 5,000,000 ceiling by 50,000x** → BLOCK.

**Implementation contract:**
```typescript
// New function in bctcPlausibilityGate.ts (domain layer, pure)
export function checkPlausibilityBounds(
  scalars: ScalarAggregate,
  isBankForm: boolean,
): SanityViolation[]
```

Called from `aggregateScalars` AFTER the balance-identity check, OR from
`finalizeBctcRefineTool` alongside `detectMagnitudeViolations` (preferred — keeps
aggregator pure).

BLOCK violations from Layer A must be treated the same as balance violations: the
aggregator returns them in `ScalarAggregateResult` and the finalize tool skips the
scalar UPDATE.

#### Layer B — Cross-Field Consistency (scalar-level, post-aggregation)

**Location:** `bctcPlausibilityGate.ts` (same file as Layer A) or added to
`bctcMagnitudeValidator.ts` as a new exported function.

**Checks:**

1. `operating_cf / total_assets` ratio: if `total_assets > 0` and
   `abs(operating_cf) / total_assets > 10`, the CF is implausibly large relative to
   asset base → BLOCK. Catches VEA-Q4 (operating_cf ≈ 255 trillion vs total_assets=20M).

2. `net_profit / total_assets` (ROA): if `abs(net_profit) > total_assets * 2` → BLOCK
   (profit cannot exceed twice asset base by accounting identity).

3. `net_revenue / total_assets`: if > 50 for non-bank (asset-light threshold guard) →
   WARN (unusual, flag for human review).

4. `total_assets = 0` explicit check: `enforceBalanceIdentity` has a silent pass for
   `total_assets === 0` (division guard). Add an explicit check: `total_assets === 0`
   with non-zero liabilities or equity → BLOCK. `total_assets === 0` with all three
   zero → WARN (probably a section-only row set; trigger re-extract signal).

**Implementation contract:**
```typescript
export function checkCrossFieldConsistency(
  scalars: ScalarAggregate,
  isBankForm: boolean,
): SanityViolation[]
```

#### Layer C — Scale Coherence Detection (per-column, post-divisor)

**Problem:** `detectDivisor` computes a single divisor from the max absolute value
across ALL rows. If the cash flow statement uses raw VND but the income + balance
statements use million VND, the max picks the CF raw-VND value and applies 1e6 to
EVERYTHING — scaling down the already-million-VND income values by 1e6 (turning 5 tỷ
profit into 5 VND).

Conversely if the CF section has lower magnitudes than the balance sheet, the divisor
is set to 1 (million VND) but the CF row is in raw VND — CF is then 1e6× too large
(the VEA-Q4 pattern).

**Fix:** After applying the unit divisor, add a within-section scale sanity check:
```
For cash_flow section rows after scaling:
  If any single operating_cf / investing_cf / financing_cf value exceeds
  the total_assets of the same report by a factor of 1000 →
  the CF section likely had a different unit scale → flag SCALE_MISMATCH WARN
  and set operating_cf / investing_cf / financing_cf to null (not garbage)
  rather than persisting the wrong value.
```

This is a defensive null-over-garbage policy: null is visible as "not resolved" and
triggers re-extract; a wrong value is opaque and propagates downstream.

**Location:** Add to `aggregateScalars` as a post-scale nullification pass. Pure domain
function — no I/O.

#### Gate Integration Point

All three layers (A, B, C) must fire in `finalizeBctcRefineTool` at the same
`// DT-2 + DT-3` integration point (lines ~223-235), in this order:
1. Existing: `detectMagnitudeViolations` (DT-2a/DT-2b)
2. Existing: `detectCrossStatementRevenue` (DT-3)
3. **NEW Layer A:** `checkPlausibilityBounds`
4. **NEW Layer B:** `checkCrossFieldConsistency`
5. **NEW Layer C:** scale-mismatch nullification (inside `aggregateScalars` before return)

Layers A and B use the same `SanityViolation[]` + BLOCK/WARN severity model as DT-2/DT-3.
BLOCK severity from any layer → `REJECTED_SANITY` (same as today). WARN → log + proceed.

---

### Zero-Row Re-Fetch Gate (VCB×2, DGC, DIG)

**Scope:** `apps/mcp-server/src/scheduler/financial-reports/bctcRefineJob.ts`

When `bctcRefineJob` finds a report with `table_row_count=0` AND `refine_status` not
in `['DONE', 'PARTIAL', 'REJECTED_SANITY', 'FAILED_MAX_RETRIES']`:

- Set `refine_status = 'NEEDS_REFETCH'` (new status value or reuse `FAILED`).
- Emit a signal to `docs/signals/` with `type="bctc_zero_row"`, `action_code`, `ticker`,
  `report_id` — triggering the ops anomaly-task-bridge for human escalation.
- Do NOT auto-re-fetch (VPS fetch is side-effectful; human must confirm).

This closes the "silently stranded" gap. The signal follows the existing anomaly-task
bridge pattern (`docs/architecture-briefs/2026-05-31-anomaly-to-dev-task-bridge.md`).

---

### HPG-Q4 Balance Violation Re-Extract Path

HPG-Q4 is stuck in `BALANCE_VIOLATION` state. The balance gate correctly fired, but
the pipeline has no re-extract trigger. The fix:

In `finalizeBctcRefineTool`, when `balanceViolation !== null` AND the report is being
finalized for the first time (not a retry): set `refine_status = 'BALANCE_VIOLATION'`
(already exists) AND emit the same `bctc_zero_row`-style signal (`type="bctc_balance_violation"`)
so the anomaly-task-bridge can escalate for human re-extraction dispatch.

---

### isBankPath Discriminator Fix (prerequisite for all layers)

The false-bank-classification of corporate balance-sheet-only reports (DHG, VEA) must
be fixed BEFORE layers A/B are added, otherwise Layer A will apply bank-form bounds to
corporate tickers and misclassify them in the opposite direction.

**Fix:** Replace `findByCode(rows, "10") === null` with `isBankFormFromRows(rows)` from
the proven BANK-AWARE-BCTC discriminator (`apps/mcp-server/src/domain/services/
financial-reports/bctcFormType.ts`). This was already identified as design decision B
in the 2026-06-02T09:09Z rescope brief. It is a prerequisite for FIX-5, not a
standalone fix — merge with BEQ-8 or require BEQ-8 to ship first.

---

### Acceptance Criteria for FIX-5

**AC-BEQ6-1 (DHG-Q1 BLOCKED):** Re-run backfill on DHG-Q1 with FIX-5 applied.
`checkPlausibilityBounds` must return BLOCK on `total_assets=4`. No write occurs.
`refine_status` reverts to `BALANCE_VIOLATION` or `REJECTED_SANITY` (not DONE).

**AC-BEQ6-2 (VEA-Q4 BLOCKED):** Re-run backfill on VEA-Q4 with FIX-5 applied.
`checkCrossFieldConsistency` operating_cf/total_assets ratio must return BLOCK.
No write occurs for operating_cf.

**AC-BEQ6-3 (scale-mismatch null-over-garbage):** Synthetic test: inject a report with
CF rows in raw VND (e.g. operating_cf_raw=255,973,471,388,000,000) alongside balance
sheet in million VND. Verify aggregator returns `operating_cf=null` (not garbage) with
a `SCALE_MISMATCH` WARN in violations.

**AC-BEQ6-4 (zero-row signal emitted):** For a report with `table_row_count=0`,
`bctcRefineJob` emits a `bctc_zero_row` signal file and does NOT mark DONE.

**AC-BEQ6-5 (HPG-Q4 balance-violation escalated):** When `balanceViolation !== null`
on finalize, a `bctc_balance_violation` signal is emitted. HPG-Q4 case verified via
direct DB query: `refine_status = 'BALANCE_VIOLATION'` + signal file present.

**AC-BEQ6-6 (no regression on clean corpus):** FPT-Q1 (46 income rows, resolved
scalars) must still pass through all layers without new violations. ACB-Q1 (bank form)
must pass with `isBankFormFromRows=true`.

**AC-BEQ6-7 (isBankPath uses isBankFormFromRows):** `grep -n "findByCode.*\"10\".*=== null"
bctcScalarAggregator.ts` returns zero matches. `isBankFormFromRows` is called in its place.

### Test files

- `apps/mcp-server/src/__tests__/bctcPlausibilityGate.test.ts` (new):
  DV-BEQ6-1 (AC-BEQ6-1), DV-BEQ6-2 (AC-BEQ6-2), DV-BEQ6-3 (AC-BEQ6-3),
  DV-BEQ6-6 (AC-BEQ6-6)
- `apps/mcp-server/src/__tests__/bctcMagnitudeValidator.test.ts` (extend):
  DV-BEQ6-cross-field tests
- Signal emission: integration test in `TRUST-RED-sanity-gate.test.ts` pattern

---

## Recurring-Bug Escalation Note

`bctcScalarAggregator.ts` has ≥ 6 fix commits (FU-5, FU-6c, FU-6d, FU-6e, FU-6f,
BEQ-3 column audit). Per `docs/policies/` recurring-bug-escalation rule (≥2 fix
commits on same module), **this module is flagged**.

The underlying cause pattern: each BCTC sprint adds one more mapping or fixes one
more code-collision without reconsidering the gate architecture. FIX-5 (FU-CHEF-
MARKER-INFLOW) breaks this pattern by adding structural plausibility + cross-field
layers that catch classes of garbage, not individual instances. Once FIX-5 ships,
a future garbage value should be caught at BLOCK severity and never reach the DB —
the fix count on the mapping side should drop to zero.

**Mandatory sequence for FIX-5:** BEQ-8 (isBankFormFromRows discriminator fix) MUST
ship and be in the container image BEFORE FIX-5 layers are activated in production.
Failure to do so will misclassify DHG/VEA as banks and apply wrong bounds.

---

## Zone and Build-Standard

**Zone:** `apps/mcp-server/` — single zone, all five fixes.
**BUILD-STANDARD:** lean (apps/mcp-server/ already exists)
**Dev owner:** dev-mcp-server for FIX-1, FIX-2, FIX-3, FIX-5. dev-vps-crawls for FIX-4
  VPS-side PDF size/page gate.

---

## Handoff to PM

PM should create atomic tasks for each fix:
- BEQ-2 (S): FIX-1 — audit + trigger bctcRefineJob for PENDING corpus (dev-mcp-server)
- BEQ-3 (M): FIX-2 — full column audit + extend ScalarAggregate to 20 cols (dev-mcp-server)
- BEQ-4 (XS): FIX-3 — refine_status guard on prior-period row in buildComparisonSection (dev-mcp-server)
- BEQ-5: FIX-4 — delegate to BCTC-CTG-ATTACHMENT-FETCH (already in backlog)
- BEQ-6 (M-L): FIX-5 — layered quality gate: plausibility bounds + cross-field consistency +
  scale coherence + zero-row signal + HPG balance-violation escalation (dev-mcp-server)
  **Prerequisite: BEQ-8 (isBankFormFromRows) must ship first.**

Sequence: BEQ-4 first (zero-risk, closes contamination immediately), then BEQ-8
(discriminator fix — unblocks FIX-5), then BEQ-2 (unblocks everything), then BEQ-3
+ BEQ-6 in parallel (no overlap — BEQ-3 touches ScalarAggregate fields, BEQ-6
touches the gate layer after aggregation).
