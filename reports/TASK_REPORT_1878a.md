# Task Report: 1878a — OCF Column Migration
date: 2026-05-12
outcome: APPROVED

## Scope

Add `operating_cash_flow REAL NULLABLE` to `financial_reports` via idempotent ALTER TABLE migration.
Bridge mapper `bridgeOCFToFinancialReports(db, ticker)` lifts `vnstock_cash_flow.operating_cf_bn * 1000.0`
into the new column. `backfillAllOCF(db)` covers historical tickers, wired into `initFinancialReportsTables`.
Merge SHA: `1fb5282b`. Branch `task/1878a-ocf-impl` deleted.

## Files Changed

| File | Change |
|------|--------|
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` | Idempotent ALTER TABLE + `bridgeOCFToFinancialReports` + `backfillAllOCF` exported |
| `apps/mcp-server/src/infrastructure/db/vnstockStore.ts` | `storeCashFlow()` calls bridge at end (line 874) |
| `apps/mcp-server/src/__tests__/1878a-ocf-column-migration.test.ts` | New test file — 12 tests covering T1-T7 |
| `docs/architecture/microservice/mcp-server/financial-reports.md` | OCF column + bridge documented |

## Test Results

- 1878a unit suite: 12/12 pass (165ms)
- Full suite (task branch): 9363 pass / 17 fail
- Full suite (main baseline): 9351 pass / 17 fail
- Delta introduced by 1878a: +12 pass / 0 new fail (12 new tests added)
- Failing files identical on main and task branch — all pre-existing
- TypeScript: 0 errors (`bunx tsc --noEmit`)

## DDD Compliance: PASS

- `bridgeOCFToFinancialReports` + `backfillAllOCF` in `infrastructure/db/schema-financial-reports.ts` — infrastructure layer
- `storeCashFlow` caller in `infrastructure/db/vnstockStore.ts` — infrastructure layer
- No domain imports from infrastructure (grep clean)
- Note: bridge crosses two infra tables (`vnstock_cash_flow` + `financial_reports`) — spec explicitly approves infra placement for Sprint 1878a

## Security: PASS

- Bridge SQL: parameterized (`?` with `.run(ticker)`) — no string interpolation
- No `process.env` in changed files (uses `Bun.env` pattern)
- No hardcoded secrets or credentials

## Acceptance Criteria

| AC | Status | Evidence |
|----|--------|----------|
| AC-1: `operating_cash_flow REAL` column present | PASS | T1 test + PRAGMA check |
| AC-2: VCB 4 non-NULL rows (live market.db) | DEFERRED | Requires container restart to apply migration + backfill on market.db. Covered by T4 (in-memory fixture: 4/4 non-NULL). |
| AC-3: FPT 4 non-NULL rows (live market.db) | DEFERRED | Same reason as AC-2. Covered by T6b fixture. |
| AC-4: Unit consistency (* 1000.0) | PASS | Bridge SQL `vcf.operating_cf_bn * 1000.0` confirmed (line 301). T3a/T3b assert 5.0 tỷ = 5000 triệu within < 1 triệu tolerance. |
| AC-5: Migration idempotent | PASS | T2: `initFinancialReportsTables(db)` twice — no throw, column appears exactly once |
| AC-6: Annual rows untouched (NULL) | PASS | T5a: `period_quarter IS NULL` row stays NULL after bridge |

## Container Restart Need: YES (for AC-2/AC-3 live verification)

AC-2 and AC-3 require the running Docker container to restart so that:
1. `initFinancialReportsTables` runs with new schema and adds `operating_cash_flow` column to `market.db`
2. `backfillAllOCF` populates existing VCB/FPT rows from `vnstock_cash_flow`

This is outside the scope of this QA cycle. Ops should trigger a container restart on next scheduled maintenance window. Until then, AC-2/AC-3 verified via in-memory test fixtures only.

## Key Implementation Details Verified

- `* 1000.0` multiplier: PRESENT (tỷ VND to triệu VND — mandatory per spec)
- `period_quarter IS NOT NULL` filter: PRESENT (annual rows skipped)
- `vcf.quarter BETWEEN 1 AND 4` guard: PRESENT (quarter=0 edge case handled — spec T7)
- `ORDER BY vcf.fetched_at DESC LIMIT 1`: PRESENT (latest fetch wins on duplicate source)
- `backfillAllOCF` wired into migration block: CONFIRMED (line 269 of schema file)

## Merge Status

- Merged: `1fb5282b merge: 1878a OCF column migration + bridge + backfill`
- Branch `task/1878a-ocf-impl` deleted
- `1878b` unblocked in `docs/TASKS.md` (blocked-by 1878a removed)
- `1885a` blocked-by updated (1878a removed, ARCH-1884 remains)
