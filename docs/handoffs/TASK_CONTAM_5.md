---
agent: dev-mcp-server
task_id: CONTAM_5
sprint: OHLCV-UNIT-CONTAM
status: ASSIGNED
assigned_at: 2026-06-12T11:00:00Z
sequence: 5 (parallel after CONTAM-1)
depends_on: CONTAM_1
---

# TASK CONTAM-5: Add unit guard to `ohlcvDailyAggregatorJob.ts` (Writer C)

## Summary

Writer C (`ohlcvDailyAggregatorJob.ts`) aggregates OHLCV from `market_prices_history` ticks at end-of-day. Add unit validation on derived OHLC values before upsert to defensively reject any corrupted aggregates and ensure clean output.

## Context

From architect brief § Writer C:
- Reads from `market_prices_history` (ticks in full-VND, written by Writer A)
- Derives open/high/low/close from tick MIN/MAX/first/last
- Uses full-overwrite upsert: `ON CONFLICT DO UPDATE SET open/high/low/close`
- Guard ensures aggregator cannot propagate latent tick corruption
- Writer C can heal contaminated rows if it runs after corruption occurs (mechanism b)

## Files to Modify

### Primary
- `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts`

### Dependencies
- Import: `validateOhlcvUnit` from `domain/services/ohlcvUnitGuard` (CONTAM-1)

## Changes Required

### Add Unit Guard on Derived OHLCV

**Location:** Before the upsert statement at L124-134 (approx)

**Code pattern:**
```typescript
import { validateOhlcvUnit } from '../../domain/services/ohlcvUnitGuard';

// After deriving open/high/low/close from ticks (around L120-123):
const open = /* first tick of day */;
const high = /* MAX of ticks */;
const low  = /* MIN of ticks */;
const close = /* last tick of day */;

// NEW: Guard before upsert
const guardResult = validateOhlcvUnit(
  code,
  isIndex(code) ? "index" : "stock",  // Helper function
  open,
  high,
  low,
  close
);

if (!guardResult.valid) {
  log.error(`[ohlcvDailyAggregator] unit guard rejected ${code} ${date}: ${guardResult.reason}`);
  continue; // Skip this row
}

// Proceed to upsert (L124-134 block)
db.prepare(UPSERT_SQL).run(code, date, open, high, low, close, volume, updated_at);
```

**Rationale:** Even though ticks from Writer A should be clean (after CONTAM-2 guard is deployed), the aggregation itself could produce edge-case values. Guard is defensive; it ensures the aggregator's output is valid before committing to DB.

## Acceptance Criteria

### Functional
- [ ] Guard is called for EVERY daily aggregate before upsert
- [ ] Rejected aggregates are logged with code + date + reason
- [ ] Rejected aggregates are skipped (no update)
- [ ] Valid aggregates proceed to upsert normally
- [ ] Index ticker classification is correct (helper function or hardcoded list)

### Code Quality
- [ ] Guard import at file top
- [ ] Guard call wrapped in try/catch
- [ ] No changes to aggregation logic (pure guard addition)
- [ ] tsc passes

### Test Coverage
- [ ] Integration test (CONTAM-7): seed `market_prices_history` with edge-case ticks; run aggregator; verify guard rejects invalid derived OHLCV

## Definition of Done

- [ ] `ohlcvDailyAggregatorJob.ts` modified, guard added before upsert
- [ ] Code compiles (tsc check)
- [ ] Commit message: `fix(scheduler): Writer C — add ohlcv unit guard on aggregated values`
- [ ] Ready for integration test

## Zone & DDD Layer
- **Zone:** `apps/mcp-server/src/scheduler/market-data/`
- **DDD:** Scheduler layer (uses domain service)

## Related Architecture Brief
- `docs/architecture-briefs/2026-06-12-ohlcv-unit-contam-arch-1.md` § Writer C, Decision 2

## Blockers
- Blocked until CONTAM-1 is committed

## Dispatch Notes
- Size: S (small)
- Parallelizable with CONTAM-2, CONTAM-3, CONTAM-4 after CONTAM-1
- Lower priority than CONTAM-2 (primary fix) but completes defense-in-depth

---

## [Developer] Implementation Record

- **Service:** mcp-server
- **Zone:** apps/mcp-server/
- **Scope note:** Handoff title was mis-assigned (Writer C guard); po_amendment + arch brief + dispatch CONTEXT all specify CONTAM-5 = ohlcvSanityCheckJob sanity-check cron. Implemented per authoritative spec.
- **Files created:**
  - `apps/mcp-server/src/scheduler/market-data/ohlcvSanityCheckJob.ts` — full-table scan, sends BUG Telegram on any contaminated row, tolerates all-zero rows (BACKLOG_CONTAM_8)
  - `apps/mcp-server/src/__tests__/CONTAM-5-ohlcv-sanity-check.test.ts` — 10 TCs, all GREEN
- **Files modified:**
  - `apps/mcp-server/src/scheduler/cronConfig.ts` — added `ohlcvSanityCheck` entry (15:05 UTC Mon-Fri, env-overridable)
  - `apps/mcp-server/src/scheduler/startScheduler.ts` — import + cron registration after ohlcvDailyAggregator
  - `docs/data/project-stats.json` — cronJobCount 76→79 (gen-project-stats run; CONTAM-4 + CONTAM-5 added 2 new crons, FIX-VNSTOCK also added 1)
  - `docs/data/orch/orch-state.json` — CONTAM-5 status ASSIGNED→REVIEW
- **Tests written:** `apps/mcp-server/src/__tests__/CONTAM-5-ohlcv-sanity-check.test.ts` — 10 TCs, GREEN
  - AC-1: clean rows → no hit, no BUG
  - AC-2: contaminated stock row (open=0.9) → hitCount=1, sentBug=true
  - AC-3: all-zero rows → skippedAllZero=2, hitCount=0, no BUG spam
  - AC-4: 8-day-old contaminated row → not in window, not detected
  - AC-5/5b: index ticker VNINDEX and low-price stock DAG — both valid, no hit
  - AC-6: 3 contaminated rows → hitCount=3, one BUG message
  - AC-7: sendBugFn throws → sentBug=false, no crash
  - AC-8: empty watchlist → early return
  - AC-9: H/L ratio > 5 → flagged as contamination
- **Git commits:** [pending commit]
- **Type check:** clean (bun tsc --noEmit exit 0)
- **bun test (targeted):** 10 pass / 0 fail
- **bun test (full suite):** pending — running in background
- **Tool count:** 157 — matches pre-task baseline (no tool changes)
- **Scheduler count:** 79 cron.schedule entries (baseline 78 + 1 new ohlcvSanityCheck)
- **Docs updated:** NONE (no microservice architecture docs changed)
- **Graphify:** skipped (no docs impacted)

**Gate 2 evidence:**
- tsc exit 0 (clean)
- Tool count: 157 (gen-project-stats --dry-run verified)
- Scheduler count: 79 (grep -rc cron.schedule | awk sum = 79)
- cronJobCount in project-stats.json: 79 (gen-project-stats written)

Zone health: bun test 10 pass 0 fail (CONTAM-5 targeted), tsc clean, 157 tools intact, 79 cron.schedule | HEALTHY
