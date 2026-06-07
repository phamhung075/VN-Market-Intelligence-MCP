# Architecture Brief — BCTC-EXTRACT-QUALITY Re-scope

**Sprint:** BCTC-EXTRACT-QUALITY Phase-2 re-scope (post dry-run halt)
**Zone:** apps/mcp-server/ (all items)
**Date:** 2026-06-02 | **Author:** agents-architect
**Mode:** PLAN-ONLY — no production code written, no DB mutations

---

## 1. Why the Sprint Was Halted

The router ran `backfill_bctc_scalars(dry_run=true)` on 2026-06-02 09:04 UTC and verified
the dry-run output against the live DB. The sprint's core premise — "legacy tickers already
have complete bctc_table_rows, just need aggregation" — was false for the most critical tickers.

### Raw evidence (in-container bun:sqlite, NOT relayed badges)

**backfill_bctc_scalars dry_run=true output:**
- 6 tickers returned status "DONE" but `updated_cols` was empty for SHB/VNM/EIB/DHG and
  only balance-sheet scalars for FPT/VEA.
- NONE of the 9 BEQ-3 fields (operating_profit/ebitda/eps/operating_cf/investing_cf/
  financing_cf/capex/free_cash_flow) populated for ANY ticker.
- HPG: `BALANCE_VIOLATION` (total_assets unresolved).
- VNM and DHG: received the `notApplicable=["gross_profit","current_assets","gross_margin_pct"]`
  bank null-clear despite being corporates.

**Direct bctc_table_rows read:**
- FPT-2025Q4: 79 rows, every row `statement_section='balance_sheet'`. ZERO income_statement,
  ZERO cash_flow rows.
- VNM: 143 rows, every row `statement_section='balance_sheet'`. All codes EMPTY.
- DHG: 329 rows, 259/329 empty codes, all `statement_section='balance_sheet'`.

**Conclusion:** The legacy pdf-parse geometry extractor produced balance-sheet-only fragments for
these tickers — it failed to produce sectioned rows for income statement and cash flow. The
`operating_profit`, `ebitda`, CF, and EPS fields are **structurally unobtainable** from these rows.

**OCR text is recoverable:** VNM (61 pages, 116K chars, "doanh thu thuần" and "lưu chuyển tiền"
confirmed present) and FPT (46 pages, 104K chars, both sections confirmed) contain all three
statement sections in `pdf_extracted_text`. DHG has OCR rows but keyed by filename not
action_code — coverage requires separate confirmation per below.

### Why a false-DONE would be catastrophic

`backfill_bctc_scalars` line 249 sets `refine_status='DONE'` even when `updates.length === 0`
("No scalars resolved — still mark DONE"). This is the landmine:

1. BEQ-4a guard (commit 0523b435) returns `net_profit=NULL` for `refine_status=PENDING`.
   After a false-DONE it would serve a stale/garbage value as if authoritative.
2. BEQ-4b guard (commit 2c3f7529) withholds QoQ/YoY only for PENDING prior periods.
   After a false-DONE on FPT-2025Q4, the absurd +12,000% YoY delta would be served again.
3. `isBankPath = findByCode(rows, "10") === null` — for balance-sheet-only corporate rows
   that have no income statement, code "10" is absent. The aggregator classifies the report
   as a bank (false positive) and null-clears `gross_profit`, `current_assets`,
   `gross_margin_pct` — wiping any future correct values written by the agentic refine path.

Running `dry_run=false` without addressing these three failure modes would poison the corpus
in a way that survives the eventual agentic refine, because the null-clears are explicit SET NULL
operations that the finalize tool's "skip non-null" logic would not restore.

---

## 2. Root Cause Summary

| Failure mode | Location | Consequence if backfill runs |
|---|---|---|
| Balance-sheet-only rows for FPT/VNM/EIB/DHG/HPG/SHB/VEA | Legacy pdf-parse geometry extractor (bctc_page_grouper.py) | operating_profit/CF/EPS stay 0; scalars never populated |
| false-DONE on 0-update reports | `backfillBctcScalarsTool.ts:249` — unconditional DONE when updates+nullClear both empty | Poison the BEQ-4a/4b guards; serve garbage as authoritative |
| Bank misclassification for balance-sheet-only corporates | `aggregateScalars` line 578: `isBankPath = findByCode(rows,"10")===null` | null-clears gross_profit/current_assets/gross_margin_pct on FPT, VNM, DHG — irreversible until agentic refine overwrites them |
| notApplicable null-clear executed BEFORE section completeness check | `backfillBctcScalarsTool.ts` calls `aggregateScalars` without any section-presence gate | Stale legacy values wiped pre-emptively |

---

## 3. Decision (A) — Guard: block false-DONE on section-incomplete row sets

### Requirement

Neither `backfill_bctc_scalars` NOR the agentic `finalize_bctc_refine` tool may set
`refine_status='DONE'` when the row set is a balance-sheet-only fragment (missing both
`income_statement` AND `cash_flow` sections). Such reports must remain `PENDING` or be
promoted only to `PARTIAL`.

### Proposed status semantics (tighten existing enum)

```
PENDING   — no bctc_table_rows yet, or row set has not been evaluated
PARTIAL   — row set present BUT section-incomplete: has balance_sheet ONLY (missing
            income_statement AND cash_flow)
DONE      — row set contains rows from ALL three sections (balance_sheet + income_statement
            + cash_flow) AND aggregation passed the balance-identity invariant
FAILED    — aggregation attempted, hard error or REJECTED_SANITY
```

`PARTIAL` already exists in the `refine_status` enum (schema-financial-reports.ts line 431).
The BEQ-4a/4b guards already treat `DONE`/`PARTIAL` as publishable-with-caveats — this
tightens `DONE` to require section completeness without changing downstream guards.

### Implementation (zone: dev-mcp-server)

**File 1:** `apps/mcp-server/src/domain/services/financial-reports/bctcSectionCompleteness.ts` (NEW)
- DDD layer: domain (pure function, zero I/O)
- Export: `checkSectionCompleteness(rows: AggregatorRow[]): SectionCompletenessResult`
- `SectionCompletenessResult`: `{ hasBalanceSheet: boolean; hasIncomeStatement: boolean;
  hasCashFlow: boolean; isComplete: boolean }`
- `isComplete = hasBalanceSheet && hasIncomeStatement && hasCashFlow`
- Detection: `rows.some(r => r.statement_section === 'income_statement')` etc.
- Empty rows → all false.
- This is a domain function; no DB access.

**File 2:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/backfillBctcScalarsTool.ts`
- After fetching `tableRows` (current line 156), add section completeness check BEFORE
  calling `aggregateScalars`.
- If `!completeness.isComplete`:
  - If `completeness.hasBalanceSheet && !completeness.hasIncomeStatement && !completeness.hasCashFlow`:
    → set `refine_status='PARTIAL'` (not DONE); add reason to result.
  - Never call `aggregateScalars` on a section-incomplete set (prevents false bank classification).
  - Return status "SKIPPED" (not "DONE") with reason including section breakdown.
- Remove or guard line 249 (`"No scalars resolved — still mark DONE"`): this path must also
  check completeness first. If incomplete → PARTIAL, not DONE.

**File 3:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`
- In the finalize path (after parsing markdown → rows), add the same section completeness
  check before setting `refine_status='DONE'`.
- If parsed rows are section-incomplete (e.g. only balance_sheet units were DONE, income/CF
  windows are still FAILED), set `report_status='PARTIAL'` not 'DONE'.
- Note: the caller already passes `report_status` as input to finalize_bctc_refine; the
  agentic fleet decides the value. The guard here is a server-side safety net that overrides
  a caller-supplied 'DONE' when sections are missing.

**Tests:** `apps/mcp-server/src/__tests__/BEQ-SECTION-GUARD.test.ts`
- DV-GUARD-1: balance-sheet-only rows → status PARTIAL, never DONE.
- DV-GUARD-2: all three sections present → status DONE passes through.
- DV-GUARD-3: finalize with income-only rows → overrides caller DONE to PARTIAL.
- DV-GUARD-4: re-run backfill after agentic refine produces complete rows → DONE allowed.

---

## 4. Decision (B) — Fix bank misclassification for balance-sheet-only corporates

### Root cause

`aggregateScalars` uses `isBankPath = findByCode(rows, "10") === null` as its internal bank
discriminator. This was documented as a DRY reuse of the fallback chain, but it introduces
a false-positive: when income statement rows are simply ABSENT (balance-sheet-only extract),
code "10" is absent — not because the entity is a bank, but because the geometry extractor
never produced income rows. The result: VNM, DHG, FPT-2025Q4 are classified as banks and
receive the bank `notApplicable` null-clear.

The proven discriminator from BANK-AWARE-BCTC
(`apps/mcp-server/src/domain/services/financial-reports/bctcFormType.ts`,
`isBankFormFromRows`) uses the HYBRID signal: anchored Roman-numeral/section codes as
positive evidence AND absence of 3-digit corporate codes as veto. Empty rows or
balance-sheet-only corporate rows return `false` (corporate), not `true` (bank).

### Implementation (zone: dev-mcp-server)

**File:** `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts`

Replace the internal `isBankPath` detection at line 578:

```typescript
// BEFORE (broken for balance-sheet-only corporates):
const isBankPath = findByCode(rows, "10") === null;

// AFTER — use the proven BANK-AWARE-BCTC discriminator:
import { isBankFormFromRows } from "./bctcFormType.js";
const isBankPath = isBankFormFromRows(rows);
```

`isBankFormFromRows` requires positive Roman-numeral evidence AND absence of 3-digit codes.
Balance-sheet-only corporates (FPT rows: codes "100","280","300","400") have 3-digit codes →
`hasCorpBalance=true` → `isBankFormFromRows` returns `false` → corporate path. Bank path
requires Roman numerals (I, II, XIII, etc.) that no corporate BCTC uses.

Consequence: the `notApplicable=["gross_profit","current_assets","gross_margin_pct"]` null-clear
is now only emitted for actual banks (ACB, SHB confirmed bank form) not for corporates
with partial row sets. This eliminates the pre-emptive null-clear landmine.

**DRY compliance:** `isBankFormFromRows` is already imported by `finalizeBctcRefineTool.ts`
(line 38) and is the authoritative discriminator across the codebase. Making
`aggregateScalars` use it directly (instead of a local proxy) eliminates the divergence.

**Tests:** extend `apps/mcp-server/src/__tests__/FU-6-scalar-correctness.test.ts`
(or add `BEQ-BANK-DISCRIM.test.ts`):
- DV-BANK-1: balance-sheet-only corporate rows (FPT codes 100/280/300/400) →
  `isBankPath=false`, `notApplicable=[]`.
- DV-BANK-2: bank rows (ACB Roman codes I/II/XIII/A/B) → `isBankPath=true`,
  `notApplicable=["gross_profit","current_assets","gross_margin_pct"]`.
- DV-BANK-3: empty rows → `isBankPath=false` (fail-safe from `isBankFormFromRows`).

---

## 5. Decision (C) — Real remediation path: agentic refine for recoverable corpus

### Which tickers are recoverable by agentic refine

The agentic refine pipeline (`refine_bctc_md`, BCTC-AGENTIC-REFINE sprint plan at
`/Users/admin/.claude/plans/magical-cooking-cocoa.md`) reads `pdf_extracted_text` (OCR text)
and page images, produces sectioned markdown, parses to complete `bctc_table_rows`, then
aggregates scalars. This path is the only reliable route for tickers whose legacy rows
are balance-sheet-only fragments.

**Recoverable by agentic refine (OCR text confirmed present with all three sections):**

| Ticker | Evidence | Blocker |
|---|---|---|
| VNM | 61 pages, 116K chars, "doanh thu thuần" + "lưu chuyển tiền" confirmed in OCR text | None — proceed directly |
| FPT (2025-Q4) | 46 pages, 104K chars, income + CF sections confirmed | None — proceed directly |
| DHG | 329 rows exist but 259/329 empty codes, all balance_sheet | Coverage TBD — verify `pdf_extracted_text` row count and section terms before dispatching |
| EIB | 0 meaningful income rows, `refine_status=PENDING` | Verify OCR text completeness (EIB PDF structure must be confirmed before dispatch) |
| HPG | BALANCE_VIOLATION on backfill (total_assets unresolved) | OCR text present — dispatch refine; balance check after new rows produced |
| SHB | Bank form, 0 income rows from legacy extractor | Bank path — dispatch refine; isBankFormFromRows will correctly classify after sectioned rows exist |
| VEA | Balance-sheet-only from legacy extractor | Verify OCR text completeness first |

**Not recoverable by agentic refine alone (require re-fetch):**

| Ticker | Status | Path |
|---|---|---|
| CTG | Cover-letter-only PDF (2 pages, no financial tables) | BCTC-CTG-ATTACHMENT-FETCH (pre-existing backlog item) — fetch real attachment first, then refine |
| VCB | 0 `bctc_table_rows`; OCR rows exist in `pdf_extracted_text` (72+54 pages) | Refine may succeed — OCR text IS present (72 pages for 2025-Q4). Re-classify VCB to "recoverable pending verification" — check OCR text for section terms before dispatch |
| DGC | 0 rows, no OCR text confirmed | Re-fetch required |
| DIG | 0 rows, no OCR text confirmed | Re-fetch required |

### Sprint decision: BCTC-EXTRACT-QUALITY Phase-2 vs new sprint

Decision: extend BCTC-EXTRACT-QUALITY as Phase-2 rather than opening a new sprint. Rationale:
- The guard (A) and bank-fix (B) are XS/S scope changes fully within the existing sprint zone.
- The agentic refine dispatch is the natural continuation of what the sprint intended to close.
- A new sprint would require a new sprint goal, new PO sign-off, and add handoff latency
  for changes that are in-scope of the existing "BCTC extraction quality" goal.

**Phase-2 task sequence** (for PM decomposition):

| Task | Description | Zone | Size | Prerequisite |
|---|---|---|---|---|
| BEQ-5 | bctcSectionCompleteness domain function + tests | dev-mcp-server | XS | BEQ-3 shipped |
| BEQ-6 | Apply section guard in backfillBctcScalarsTool | dev-mcp-server | XS | BEQ-5 |
| BEQ-7 | Apply section guard in finalizeBctcRefineTool | dev-mcp-server | XS | BEQ-5 |
| BEQ-8 | Fix isBankPath discriminator in aggregateScalars | dev-mcp-server | XS | BEQ-5 |
| BEQ-9 | Dispatch agentic refine for recoverable tickers (VNM, FPT-Q4, HPG, SHB) | bctc-analyst | S | BEQ-5+BEQ-6+BEQ-7+BEQ-8 all green |
| BEQ-10 | Verify DHG/EIB/VEA/VCB OCR coverage, dispatch refine if confirmed | bctc-analyst | S | BEQ-9 complete |

BEQ-5 through BEQ-8 must ship and image rebuilt before ANY agentic refine dispatch.
Running refine without the guards risks a repeat of the false-DONE scenario.

---

## 6. Decision (D) — Honest residual list (cannot be fixed by agentic refine alone)

These tickers require action outside the `apps/mcp-server` zone:

| Ticker | Problem | Required path | Backlog item |
|---|---|---|---|
| CTG | PDF is a cover letter (2 pages, "Thông báo" header only, no tables) | Fetch the actual BCTC attachment from CafeF/HNX/SSC and ingest it | BCTC-CTG-ATTACHMENT-FETCH (pre-existing) |
| DGC | 0 rows, OCR text not confirmed present | Re-fetch PDF from VPS, re-run OCR extraction | BCTC-REFETCH-ZERO-ROW (new backlog, zone: dev-vps-crawls) |
| DIG | 0 rows, OCR text not confirmed present | Re-fetch PDF from VPS, re-run OCR extraction | BCTC-REFETCH-ZERO-ROW (same backlog item — add DIG/DGC) |

**VCB re-classification:** VCB has 0 `bctc_table_rows` but OCR text IS present (72 pages
confirmed for 2025-Q4, 54 pages for 2025-Q1). VCB is recoverable by agentic refine if
section terms are confirmed in `pdf_extracted_text`. Assign to BEQ-10 verification pass,
not to the hard-blocked residual list. If OCR text is incomplete or bank-form sections are
absent, escalate to BCTC-REFETCH-ZERO-ROW.

---

## 7. Verified Paths and DDD Layer Assignments

| File | Action | DDD Layer | Notes |
|---|---|---|---|
| `apps/mcp-server/src/domain/services/financial-reports/bctcSectionCompleteness.ts` | CREATE | domain | Pure function; no infrastructure imports |
| `apps/mcp-server/src/domain/services/financial-reports/bctcScalarAggregator.ts` | MODIFY | domain | Line 578: replace `findByCode(rows,"10")===null` with `isBankFormFromRows(rows)` |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/backfillBctcScalarsTool.ts` | MODIFY | interface | Add section completeness gate after tableRows fetch; guard line 249 |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` | MODIFY | interface | Add section completeness server-side safety net before writing DONE |
| `apps/mcp-server/src/__tests__/BEQ-SECTION-GUARD.test.ts` | CREATE | test | DV-GUARD-1..4 |
| `apps/mcp-server/src/__tests__/BEQ-BANK-DISCRIM.test.ts` | CREATE | test | DV-BANK-1..3 |

No pdf-extractor changes. No schema changes (PARTIAL already in enum). No new DB tables.
All changes are scoped to `apps/mcp-server/`.

---

## 8. Risk Flags

**R-1 (HIGH): Line 249 unconditional DONE.**
`backfillBctcScalarsTool.ts` line 249 sets DONE when `updates.length === 0 && nullClearCols.length === 0`.
For a balance-sheet-only corporate with the bank-fix applied (notApplicable=[] now), this path
fires and promotes to DONE on a zero-update pass. MUST be guarded by the section completeness
check. Fix in BEQ-6.

**R-2 (HIGH): notApplicable null-clear is irreversible.**
The finalize tool's SET NULL for notApplicable columns is a destructive write. Once
`gross_profit=NULL` is written for a corporate that was mis-classified as a bank, the
agentic refine must produce a new row that triggers a non-null write to restore it. The
section guard (A) and bank-fix (B) must both ship before the agentic refine dispatch so
that the null-clear never fires on a corporate.

**R-3 (MEDIUM): BEQ-4a/4b guards key on refine_status.**
After BEQ-5..8 ship, tickers that were PENDING will either stay PENDING (0 rows), become
PARTIAL (balance-sheet-only), or become DONE (full sections). The BEQ-4a guard (commit
0523b435) returns null for PENDING. It must also return null for PARTIAL net_profit (the
legacy value is still garbage). Verify that the guard condition is `refine_status IN ('DONE')`
not `IN ('DONE','PARTIAL')` for net_profit display, or add PARTIAL-specific null logic.
This is a one-line check; flag for dev-mcp-server to verify during BEQ-6.

**R-4 (LOW): DHG OCR rows keyed by filename not action_code.**
Confirmed in raw finding: DHG OCR rows are addressable by filename but the refine pipeline
uses action_code for ticker routing. Before dispatching DHG refine, verify that the refine
tool's eligibility query can locate the correct OCR text rows for DHG.

**R-5 (LOW): SHB is a bank (Roman codes expected).**
If SHB was extracted with balance-sheet-only rows AND has no Roman-numeral codes, it will
be classified as a corporate by `isBankFormFromRows` (no Roman evidence). After agentic
refine produces Roman-code bank rows, the discriminator will correctly re-classify. No code
change needed — verify the refine output before aggregating.

---

## 9. Constraints and Scope

- All five implementation files are in `apps/mcp-server/` — single zone, no cross-zone splits.
- No db schema changes — `PARTIAL` is already a valid `refine_status` enum value.
- No pdf-extractor changes — the legacy extractor's output is the INPUT; we guard against it.
- No new MCP tools — the existing `backfill_bctc_scalars` is modified in-place (same tool name,
  same endpoint, no toolCount change).
- backfill_bctc_scalars MUST NOT be run (even dry_run=false) until BEQ-5+6+7+8 are shipped
  and the image rebuilt. The dry-run mode is safe to re-run for verification only.
- All changes on `main` branch — no feature branches per project policy.
- The BCTC-AGENTIC-REFINE sprint (full replacement of geometry extractor with agentic refine
  pipeline) remains the long-term durable fix. Phase-2 guards are a prerequisite layer that
  makes the current agentic pipeline safe to run on the legacy corpus. They do not duplicate
  or replace BCTC-AGENTIC-REFINE design.

---

## 10. Build Standard

```
BUILD-STANDARD: lean
BUILD-STANDARD-REF: docs/standards/microservice-build-standard.md
NOTE: apps/mcp-server/ already exists; dev-mcp-server drives end-to-end; no relay required.
```

---

## 11. Implementation Handoff

Route all implementation tasks to **dev-mcp-server** zone via agent-father per the
dispatch chain.

PM must split into per-task handoffs (BEQ-5 through BEQ-10) and sequence BEQ-5..8 strictly
before BEQ-9 dispatch. QA must re-run the dry-run dry_run=true after each guard ships and
verify the result changes from the original broken output before promoting to dry_run=false.

ops MUST REBUILD the mcp-server image after BEQ-5..8 merge before ANY agentic refine
dispatch: `docker compose build --no-cache mcp-server && docker compose up -d --no-deps
--force-recreate mcp-server`.

---

## RETURN

```
DONE: Architecture brief written — BCTC-EXTRACT-QUALITY Phase-2 re-scope.
ZONE: apps/mcp-server/
NEXT: pm | break BEQ-5..BEQ-10 into per-task developer handoffs; sequence BEQ-5..8 before BEQ-9
HANDOFF: docs/architecture-briefs/2026-06-02-bctc-extract-quality-rescope.md
PIPELINE: continue
```
