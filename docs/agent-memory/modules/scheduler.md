---
agents: developer, ops, architect
trigger: writing-scheduler, health-check, post-merge-review
---

# Module Analysis: apps/mcp-server/src/scheduler/

> ⚠️ **Path updated 2026-04-26**: Old path `src/infrastructure/scheduler/` was deleted in modular monolith refactor (sprints 209-220). Jobs now live in `apps/mcp-server/src/scheduler/` with subdirs: `alerts/`, `audits/`, `briefings/`, `financial-reports/`, `macro/`, `market-data/`, `news-analysis/`, `portfolio/`, `system/`.

**Last analyzed**: 2026-04-21 (paths updated 2026-04-26) | **By**: Dev Team | **Status**: ✅ Mostly healthy, ⚠️ Timezone gaps

---

## Verification Status

| Area | Status | Evidence | Next Action |
|------|--------|----------|------------|
| Signal handlers | ✅ Complete | SIGTERM + SIGINT both call `checkpoint()` | Monitor for new jobs |
| WAL checkpoint | ✅ Integrated | Daily job + shutdown handler active | None |
| Error handling | ✅ Verified | All jobs have try/catch + logging | None |
| Timezone handling | ⚠️ Partial | 3 crons still use naive `new Date()` | Fix by 2026-04-25 |

---

## Jobs scanned

### `market-data/ohlcvDailyAggregatorJob.ts`
- ✅ Non-null guards added (ff55779)
- ✅ Signal handler verified
- ⚠️ Uses naive `new Date()` at line 42 → should be explicit UTC

### `market-data/foreignFlowFetcherJob.ts` *(was `foreignFlowPollerJob.ts`)*
- ✅ Rate limiter enforced per exchange
- ✅ Timezone: UTC (`moment.utc()`)
- ✅ No WAL concerns (read-only fetches)

### `walCheckpointAlert.ts`
- ✅ WAL checkpoint + signal handler confirmed
- ✅ Timestamp logging: explicit UTC

### `vpsProxyWatchdogJob.ts`
- ⚠️ Naive `new Date()` at line 28 → should be explicit UTC

> ℹ️ `newsSourcePollerJob.ts`, `dailyMaintenanceJob.ts`, `priceHistoryBackfillJob.ts` — **no longer exist** at these names. Functionality likely absorbed into `news-analysis/` or `market-data/` subdirs. Verify before referencing.

---

## Known issues (what to check before modifying)

1. **Timezone offsets** — jobs still using naive dates
   - File: `market-data/ohlcvDailyAggregatorJob.ts` (line 42)
   - File: `vpsProxyWatchdogJob.ts` (line 28)
   - **Fix**: Replace `new Date()` → `new Date().toISOString().split('T')[0]` or moment.utc()

2. **Signal handler coverage** — new jobs must add SIGTERM handling
   - Check: All job files import from `src/infrastructure/db/checkpoint.ts` (verify path post-refactor)
   - Test: `kill -SIGTERM` and verify `.db-wal` is clean

3. **Rate limiter not documented** — foreign flow job limits per exchange, but not obvious in code
   - Location: `market-data/foreignFlowFetcherJob.ts`
   - Comment needed: `// Rate limit per exchange prevents IP ban`

---

## Patterns discovered (apply when extending)

**Pattern 1**: Always wrap external API calls
```typescript
const data = await circuitBreakerRegistry.execute('host', async () => {
  return fetch(...);
});
```

**Pattern 2**: Check rate limiter before host fetch
```typescript
await rateLimiter.checkAndWait('vn-price.example.com');
const data = await fetch(...);
```

**Pattern 3**: Log with UTC explicitly
```typescript
const now = new Date().toISOString(); // Always ISO string
logger.info(`Job started: ${now}`);
```

---

## Next analysis tasks

- [ ] Replace 3 naive dates with explicit UTC (priority: medium, 2026-04-25)
- [ ] Add rate limiter documentation (priority: low, 2026-04-28)
- [ ] Add new job template to codebase (priority: high, 2026-04-23)

---

**Related files**:
- `apps/mcp-server/src/scheduler/` (all job definitions — 50 files across 8 subdirs)
- `docs/agent-memory/issues/WAL-checkpoint.md` (signal handler context)
- `.claude/knowledge/cron-jobs.md` (scheduler architecture)
