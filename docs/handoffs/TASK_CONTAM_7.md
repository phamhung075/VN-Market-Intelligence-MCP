---
agent: dev-mcp-server
task_id: CONTAM_7
sprint: OHLCV-UNIT-CONTAM
status: ASSIGNED
assigned_at: 2026-06-12T11:00:00Z
sequence: 7 (detection job + integration test suite, after CONTAM-1..6)
depends_on: CONTAM_1, CONTAM_2, CONTAM_3, CONTAM_4, CONTAM_5
---

# TASK CONTAM-7: Create detection job + integration test suite

## Summary

**Part A:** Create `ohlcvSanityCheckJob.ts` — a lightweight post-aggregation detection job that runs after Writer C and flags any unit contamination in the past 7 days.

**Part B:** Create comprehensive integration test suite `__tests__/NNNN-ohlcv-unit-contam.test.ts` covering all five writers + repair script.

## Context

From architect brief § Decision 4 (Detection Guard):
- Add post-aggregation sanity scan to catch contamination within hours instead of days
- Detection job is observation-only (no write, no fix)
- Fires `log.error` + sends Telegram WORK message on hits
- Can be wired into existing `ohlcvStalenessCheckJob.ts` or as standalone cron entry

## Part A: Create `ohlcvSanityCheckJob.ts`

### Files to Create
- `apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts`

### Implementation

**Detection query (runs post-aggregation):**
```sql
SELECT 
  code, 
  date, 
  open, 
  high, 
  low, 
  close,
  CASE 
    WHEN open < 100 THEN 'open_too_low'
    WHEN low  < 100 THEN 'low_too_low'
    WHEN high > 10000000 THEN 'high_too_high'
    WHEN high / NULLIF(low, 0) > 5 THEN 'hilo_ratio_extreme'
    ELSE 'ok'
  END AS unit_flag
FROM daily_ohlcv
WHERE code IN (SELECT code FROM watchlist)
  AND date >= date('now', '-7 days')
  AND (open < 100 OR low < 100 OR high > 10000000 OR high / NULLIF(low, 0) > 5);
```

**Output on any hits:**
```
[ohlcv-sanity] unit contamination detected:
  VNH 2026-06-12 open=0.9 high=1000 low=0.9 close=1000 [open_too_low]
  FPT 2026-06-11 open=90 high=90000 low=88 close=89000 [low_too_low]
```

**Channels:**
- `log.error("[ohlcv-sanity] ...")` — always
- `sendTelegramWork("[ohlcv-sanity] unit contamination in daily_ohlcv (7-day window)...", {...rows})` — on any hits
- Telegram message includes code + date + unit_flag so analyst can triage

### Scheduling

**Integration:** Can be:
1. Inline in `ohlcvStalenessCheckJob.ts` (simple: add query at end of existing job)
2. Standalone cron entry in scheduler (more observable)

**Recommended:** Standalone, fires 5 minutes after `ohlcvDailyAggregatorJob` completes (end-of-day + buffer for ticks to settle).

## Part B: Create Integration Test Suite

### Files to Create
- `apps/mcp-server/src/__tests__/unit/ohlcvUnitContam.test.ts` (if integrated) OR
- `apps/mcp-server/src/__tests__/integration/ohlcvUnitContam.test.ts` (recommended: in-memory DB)

### Test Cases

#### Test 1: validateOhlcvUnit boundary cases
```
- Stock [100, 10M] → valid
- Stock 99.9 → invalid (thousand-VND leakage)
- Stock 10M+1 → invalid
- Index 1200 → valid (no range check)
- Zero open → invalid
- High/Low ratio 6 (>5) → invalid
- All eight ground-truth cases from CONTAM-1 unit tests
```

#### Test 2: Writer A (pushPricesHandler) contamination + self-heal
```
- In-memory DB: first push with type=null (isStock=false)
  → open=0.9 (thousand-VND), guard rejects, log.error("unit guard rejected"), skip upsert
  → table is empty
- In-memory DB: second push with type="stock" (isStock=true)
  → open=80000 (correct full-VND), guard passes, upsert proceeds
  → ON CONFLICT CASE clause sets open=80000 (healed)
  → row in table: open=80000, close=80000, [correct]
```

#### Test 3: Writer B (server.ts /api/push-ohlcv-history) guard
```
- Mock TCBS push with one bar: open=0.9 (thousand-VND)
  → guard rejects, bar skipped, table empty
- Mock TCBS push with valid bar: open=80000
  → guard passes, bar inserted, table has 1 row [correct]
```

#### Test 4: Writer D & E (backfill) guard
```
- In-memory DB: upsert with open=0.9 (thousand-VND from simulated anomalous VNDIRECT)
  → guard rejects, skip, table empty
- Valid VNDIRECT record: open=80000
  → guard passes, upsert proceeds, row inserted [correct]
- Existing contaminated row (open=0.9, close=1000) + second upsert with correct VNDIRECT data
  → guard passes on second upsert, ON CONFLICT overwrites, open normalized to 80000 [self-heal]
```

#### Test 5: Writer C (ohlcvDailyAggregatorJob) guard
```
- Pre-seed market_prices_history with full-VND ticks (100, 101, 102, 103, 104)
- Run aggregator, derive OHLCV: open=100, high=104, low=100, close=104
  → guard passes, upsert proceeds, row inserted [correct]
- Pre-seed with anomalous ticks (0.9, 0.95, 1, 1.05, 1.1)
  → aggregator derives open=0.9, high=1.1, low=0.9, close=1.1
  → guard rejects, skip upsert, table empty [contamination prevented]
```

#### Test 6: Repair script dry-run
```
- Seed DB with 10 known-contaminated rows
- Run repair script with --dry-run
- Verify: dry-run identifies exactly 10 rows, prints sample, makes NO DB changes
```

#### Test 7: Repair script live-run
```
- Seed DB with 10 known-contaminated rows
- Run repair script with --live (non-interactive for test)
- Verify: UPDATE executes, post-query shows all open/low values * 1000, table count unchanged at 10
```

#### Test 8: ohlcvSanityCheckJob detection
```
- Seed DB with 5 contaminated rows + 10 valid rows (watchlist tickers, date >= now-7d)
- Run sanity check job
- Verify: query returns 5 rows, log.error called 5 times, sendTelegramWork called once with 5 rows
```

### Test File Structure
```typescript
describe('OHLCV Unit Contamination Suite', () => {
  let db: Database;

  beforeEach(() => {
    // Create in-memory DB with daily_ohlcv + market_prices_history + watchlist schema
  });

  afterEach(() => {
    db.close();
  });

  describe('validateOhlcvUnit', () => {
    test('stock in range [100, 10M] → valid');
    test('stock < 100 → invalid');
    // ... 6 more tests from CONTAM-1
  });

  describe('Writer A pushPricesHandler', () => {
    test('first push type=null → reject + skip + empty table');
    test('second push type=stock → passes guard + heals open via CASE clause');
  });

  describe('Writer B server.ts /api/push-ohlcv-history', () => {
    test('bar with open=0.9 → guard rejects');
    test('valid bar → inserted');
  });

  describe('Writer D taOhlcvBackfillJob', () => {
    test('record with open=0.9 → guard rejects');
    test('existing contaminated row + valid upsert → overwrites + heals');
  });

  describe('Writer E ohlcvBackfill', () => {
    test('record with open=0.9 → guard rejects');
    test('valid record → inserted via INSERT OR IGNORE');
  });

  describe('Writer C ohlcvDailyAggregatorJob', () => {
    test('valid ticks → aggregator derives valid OHLCV + guard passes');
    test('anomalous ticks → aggregator derives invalid OHLCV + guard rejects + skip');
  });

  describe('Repair script', () => {
    test('dry-run: identifies 10 contaminated rows, makes no DB changes');
    test('live-run: updates 10 rows, open/low normalized by * 1000');
  });

  describe('ohlcvSanityCheckJob detection', () => {
    test('detects 5 contaminated rows in 7-day window + sends Telegram');
  });
});
```

## Acceptance Criteria

### Part A: Detection Job
- [ ] `ohlcvSanityCheckJob.ts` file created
- [ ] Runs post-Writer C (fires 5min after aggregation)
- [ ] Query returns contaminated rows (open<100, low<100, high>10M, hilo>5)
- [ ] On any hits: `log.error` + `sendTelegramWork` with row details
- [ ] Can be integrated into `ohlcvStalenessCheckJob.ts` or standalone
- [ ] Cron wiring documented (where it fits in scheduler)

### Part B: Integration Test Suite
- [ ] `__tests__/NNNN-ohlcv-unit-contam.test.ts` file created
- [ ] All 8 test cases (validateOhlcvUnit + 5 writers + repair + sanity job) pass
- [ ] Test DB uses in-memory SQLite for speed
- [ ] No real DB access during test
- [ ] tsc passes
- [ ] 100% of guard logic covered by tests

### Code Quality
- [ ] All imports correct (validateOhlcvUnit, DB, etc.)
- [ ] No hardcoded magic numbers (use constants from guard)
- [ ] Error handling: test both valid and invalid paths
- [ ] Logging assertions: verify log.error is called on guard failures

## Definition of Done

- [ ] `ohlcvSanityCheckJob.ts` created, integrated into scheduler
- [ ] `__tests__/NNNN-ohlcv-unit-contam.test.ts` created, all tests green
- [ ] Cron entry added to scheduler config (if standalone job)
- [ ] Test coverage report: confirm all Writer A/B/C/D/E paths covered
- [ ] Commit message: `test(scheduler/tests): ohlcvSanityCheckJob + integration test suite (CONTAM-7)`
- [ ] Ready for deployment

## Zone & DDD Layer
- **Zone:** `apps/mcp-server/src/scheduler/market-data/` (job) + `apps/mcp-server/src/__tests__/` (tests)
- **DDD:** Scheduler layer + Test layer

## Related Architecture Brief
- `docs/architecture-briefs/2026-06-12-ohlcv-unit-contam-arch-1.md` § Decision 4, Test Strategy

## Blockers
- Depends on CONTAM-1..6 all being committed (so all classes are available to import)

## Dispatch Notes
- Size: M (medium — 8 test cases + detection job + cron integration)
- Final task of the sprint
- Completes both detection (ongoing) and validation (historical sweep) of the fix

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Files created:**
  - `apps/mcp-server/src/__tests__/CONTAM-7-ohlcv-unit-contam-integration.test.ts` — 44 tests covering all 5 writers + repair + sanity job
- **Files modified:**
  - `docs/data/orch/orch-state.json` — CONTAM-7 ASSIGNED → IN_PROGRESS → REVIEW
  - `docs/handoffs/TASK_CONTAM_7.md` — this record
- **Note (Part A):** `ohlcvSanityCheckJob.ts` was already created in CONTAM-5 (not CONTAM-7). The job is wired in `startScheduler.ts` (cron 15:05 UTC Mon-Fri, `ohlcvSanityCheck` entry). CONTAM-7 scope = integration test suite.
- **Tests written:** `apps/mcp-server/src/__tests__/CONTAM-7-ohlcv-unit-contam-integration.test.ts` — 44 assertions (110 expect calls), GREEN
  - T1: validateOhlcvUnit boundary cases (13 tests) — CONTAM-1 guard
  - T2: Writer A pushPricesHandler contamination + self-heal (5 tests) — CONTAM-2
  - T3: Writer B /api/push-ohlcv-history guard (4 tests) — CONTAM-3
  - T4: Writer D taOhlcvBackfillJob normalize-then-guard (4 tests) — CONTAM-4
  - T5: Writer E ohlcvBackfill normalize + INSERT OR IGNORE (3 tests) — CONTAM-4
  - T6: Writer C ohlcvDailyAggregatorJob tick aggregation (3 tests) — CONTAM-5
  - T7: Repair script dry-run + live-run (5 tests) — CONTAM-6
  - T8: ohlcvSanityCheckJob 7-day detection (8 tests) — CONTAM-5
- **Git commits:** [pending]
- **Type check:** clean (bun tsc --noEmit — 0 errors)
- **bun test (targeted):** 84 pass / 0 fail (CONTAM-7 + CONTAM-5 + CONTAM-4 + 1987 + unit/ohlcvUnitGuard)
- **bun test (full suite):** 12861 pass / 0 fail (exit 0) — Bun runtime crash AFTER completion is known Mode B OOM, not a test failure
- **Tool count:** 157 tools — matches pre-task baseline
- **Scheduler count:** 79 cron.schedule entries — matches pre-task baseline
- **Docs updated:** NONE (ohlcvSanityCheckJob already documented in CONTAM-5)
- **Graphify:** skipped (no docs impacted)

### G12 Evidence

| Gate | Result |
|------|--------|
| bun test (targeted) | 84 pass / 0 fail |
| bun test (full suite exit code) | 0 (12861 tests) |
| tsc --noEmit | 0 errors |
| Tool count | 157 (matches baseline) |
| Scheduler count | 79 (matches baseline) |
