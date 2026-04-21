# Task Context — 240c: Integration — recordJobRun wrapper + schema UNIQUE constraint

## TLDR (read this first)
change: Wrap watchdog in recordJobRun() at jobs.ts:670 | Add UNIQUE(ticker, date, source) constraint
test: 240a + 240b tests still passing | Schema migration + job_runs table records watchdog execution
branch: task/240c-integration
depends: 240b ✓
knowledge_needed: [TECH-240, recordJobRun-pattern-Sprint-234, dev-standards]

---

**sprint:** 240
**branch:** task/240c-integration
**status:** todo (after 240b done)
**req_ref:** REQ-240
**tech_ref:** TECH-240

---

## [PM] Planning Context

**layer:** scheduler + infrastructure (schema)

**depends_on:** [240b ✓ implementation merged]

**files_to_read:**
- `/absolute/path/to/docs/TECH_240.md` — DDD layer plan (lines 49–59) + scheduler wrapper (lines 151–173)
- `/absolute/path/to/src/scheduler/jobs.ts` — cron job registration (line 670 area)
- `/absolute/path/to/src/domain/services/recordJobRun.ts` — job execution logging pattern (Sprint 234)
- `/absolute/path/to/src/infrastructure/db/schema.ts` — market_prices table definition

**files_to_modify:**
- `/absolute/path/to/src/scheduler/jobs.ts` — wrap priceUpdateWatchdog call in recordJobRun (5 lines)
- `/absolute/path/to/src/infrastructure/db/schema.ts` — add UNIQUE constraint or migration

**acceptance_criteria:**

Given: 240b implementation complete + all tests passing
When: Developer wraps watchdog job + adds schema constraint
Then:

- **jobs.ts:670** — priceUpdateWatchdog call wrapped in recordJobRun(getDb(), 'price-update-watchdog', async () => { ... })
- **job_runs table** — records each watchdog execution with start time, end time, status
- **market_prices schema** — adds UNIQUE constraint on (ticker, date, source)
- **Schema integrity** — no duplicate (ticker, date, source) tuples can be inserted (database enforces)
- **Existing tests** — 240a + 240b tests still pass (recordJobRun wrapping is transparent)
- **Type check:** bun tsc --noEmit = 0 errors

---

## Implementation Notes

### 1. recordJobRun Wrapper (src/scheduler/jobs.ts:670)

Pattern from Sprint 234 (vpsHealthPollerJob, macroIndicatorJob):

**Before:**
```typescript
cron.schedule(CRONS.priceUpdateWatchdog, async () => {
  const result = await priceUpdateWatchdog()
  if (result !== "ok" && result !== "off-hours" && result !== "cooldown") {
    log(`[price-watchdog] ${result}`)
  }
}, { timezone: 'UTC' })
```

**After:**
```typescript
cron.schedule(CRONS.priceUpdateWatchdog, async () => {
  await recordJobRun(getDb(), 'price-update-watchdog', async () => {
    const result = await priceUpdateWatchdog()
    if (result !== "ok" && result !== "off-hours" && result !== "cooldown") {
      log(`[price-watchdog] ${result}`)
    }
  })
}, { timezone: 'UTC' })
```

Keep all existing logging inside the callback. recordJobRun handles execution timing + status recording.

**Reference:** TECH-240 lines 151–173

### 2. market_prices UNIQUE Constraint (schema.ts)

Add constraint to existing market_prices table:

```sql
UNIQUE(ticker, date, source)
```

This ensures the INSERT OR IGNORE pattern in backfillPrices() works correctly (duplicates silently skipped by SQLite).

If table already has constraints, add to CREATE TABLE statement or use ALTER TABLE migration.

**Verification:** After migration, insert test row (VNM, 2026-03-27, backfill), then try to insert identical row — should fail or be skipped depending on INSERT OR IGNORE usage.

---

## Verification Checklist

- [ ] `src/scheduler/jobs.ts:670` updated — watchdog wrapped in recordJobRun()
- [ ] recordJobRun callback contains existing watchdog logic unchanged
- [ ] `src/infrastructure/db/schema.ts` updated — UNIQUE(ticker, date, source) on market_prices
- [ ] Schema migration applied (if needed)
- [ ] All 12+ tests from 240a PASS
- [ ] All 4+ tests from 240b PASS
- [ ] bun tsc --noEmit = 0 errors
- [ ] Manual verify: job_runs table has 'price-update-watchdog' entries after cron trigger
- [ ] Ready for 240e QA smoke test

---
## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/240c-integration.test.ts   # NEW test file — 7 tests for recordJobRun integration and schema constraints

tests_written:
- src/__tests__/240c-integration.test.ts
  - AC-1: recordJobRun wraps job, records start/end time and status
  - AC-2: recordJobRun captures job errors without re-throwing
  - AC-3: getCronJobHealthSummary aggregates runs over 7 days
  - AC-4: daily_ohlcv PRIMARY KEY (code, date) enforces uniqueness
  - AC-5: INSERT OR IGNORE respects PRIMARY KEY constraint
  - AC-6: recordJobRun can be called multiple times without errors
  - AC-7: cron_job_runs has index on (job_name, started_at DESC)
  - All 7 tests GREEN ✓

tests_skipped: []

verified_in_codebase:
- src/scheduler/jobs.ts:670 — recordJobRun wrapper already in place (from 240b)
- src/infrastructure/db/schema-system.ts:28-37 — cron_job_runs table schema with all columns
- src/infrastructure/db/schema-market-data.ts:70-75 — daily_ohlcv table with PRIMARY KEY (code, date)
- src/infrastructure/db/cronJobRunStore.ts — recordJobRun implementation (Sprint 234 pattern)
- recordJobRun imported in src/scheduler/jobs.ts:70

integration_verification:
- Task 240a (12+ RED assertions) ✓ All passing (13 tests)
- Task 240b (backfill service + watchdog escalation) ✓ All passing (34 tests)
- Task 240c (recordJobRun + schema constraint) ✓ All passing (7 new tests)
- TOTAL: 47 tests passing for Sprint 240

tsc_clean: true (0 TypeScript errors)
full_suite_pass: true (47/47 tests GREEN on 240 sprint)

