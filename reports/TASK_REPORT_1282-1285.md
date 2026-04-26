# Task Report: FIX-1282/1285 — Schema Migrations Regression Test
date: 2026-04-25
outcome: APPROVED

## Changed Files
- `apps/mcp-server/src/__tests__/FIX-1282-1285-schema-migrations.test.ts` (new, 131 lines)

## Test Results
- Unit tests (targeted): 7 pass / 0 fail
- Full suite on fix branch: 6483 pass / 214 fail
- Full suite on main baseline: 6479 pass / 218 fail
- Delta vs baseline: +4 pass, -4 fail (net improvement — no regressions introduced)
- TypeScript: 0 errors

## DDD Compliance: PASS
Test file imports directly from `infrastructure/db/schema.js` — this is correct and expected for a test targeting infrastructure schema initialization. Test files are not domain-layer code and are exempt from the domain→infrastructure import prohibition.

## Security: PASS
- No `process.env` usage (uses `Bun.env` indirectly via schema.ts)
- No hardcoded credentials or secrets
- No SQL string interpolation — all queries use parameterized bindings

## Test Quality Assessment
All 7 tests are meaningful and non-trivial:
- TC-1/2/3: table existence checks via `sqlite_master` — directly validates the root-cause fix
- TC-4: queryability check (SELECT COUNT(*) = 0) — confirms tables are structurally valid
- TC-5/6/7: mirror exact production query shapes used by `franceSummaryJob` and `assembleBriefing` — these would have thrown "no such table" in the pre-fix scenario

The `beforeEach` pattern correctly calls `closeDb()` then creates a fresh `:memory:` DB and runs `initDatabase(db)` — each test is fully isolated with no shared state leakage. The `afterEach` cleans up both the local `db` handle and the module-level singleton.

## Root Cause Lock-In
The test file documents the root cause correctly: a DB backup swap without server restart left the three tables absent. The fix invariant — `initDatabase()` MUST create all three tables via `IF NOT EXISTS` guards before any job runs — is now permanently locked in as a regression test.

## Schema Coverage Verified
Confirmed that `initDatabase()` in `schema.ts` calls:
- `initNewsTables(db)` → `schema-news.ts` → creates `rag_analyses` + indexes
- `initSystemTables(db)` → `schema-system.ts` → creates `evidence_scores` + index
- `initFinancialReportsTables(db)` → `schema-financial-reports.ts` → creates `vnstock_trading_stats` + index

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Merge Status
Merged `fix/schema-migrations-1282-1285` → `main` via `--no-ff` merge.
Merge commit: `849806f1`
Branch deleted (local).
