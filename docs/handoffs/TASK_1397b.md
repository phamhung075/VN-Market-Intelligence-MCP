# TASK_1397b — Register vnIndexRefreshJob cron in jobs.ts

**Sprint:** 1397
**Type:** feature
**Layer:** interface/scheduler
**Estimate:** ~30min
**Baseline:** 7915 pass / 0 fail
**Depends on:** TASK_1397a (vnIndexRefreshJob.ts must exist and export runVnIndexRefreshJob)
**Blocks:** nothing

---

## Goal

Wire `runVnIndexRefreshJob` into `apps/mcp-server/src/scheduler/jobs.ts`:
- Add `vnIndexRefresh` key to the `CRONS` constant
- Add import at top of file
- Register the cron block inside `startScheduler()`
- Update the top-of-file JSDoc comment block listing registered jobs

---

## File to Modify

**Path:** `apps/mcp-server/src/scheduler/jobs.ts`

### Step A — Add import (after existing market-data imports, e.g. after the `runVpsHealthPolling` import line)

```typescript
import { runVnIndexRefreshJob } from './market-data/vnIndexRefreshJob.js'
```

### Step B — Add to CRONS constant (after the `vpsServiceHealth` entry)

```typescript
/** vnIndexRefresh — VNINDEX upsert every 5 min during VN market hours — task 1397 */
vnIndexRefresh: Bun.env.CRON_VN_INDEX_REFRESH ?? '*/5 2-8 * * 1-5',
```

### Step C — Register cron inside startScheduler() (after the vpsServiceHealth block, before the freshnessSlaMonitor block)

```typescript
// Every 5 min during VN market hours (02:00-08:59 UTC, Mon-Fri) — VN-Index refresh — task 1397
// Fetches VNINDEX directly from VnDirect vnmarket_prices API (not via VPS).
// Ensures market_prices.VNINDEX stays fresh regardless of VPS push payload.
cron.schedule(CRONS.vnIndexRefresh, async () => {
  await recordJobRun(getDb(), 'vnIndexRefreshJob', async () => {
    const result = await runVnIndexRefreshJob()
    return { rowsWritten: result.stored }
  })
}, { timezone: 'UTC' })
```

### Step D — Update the top-of-file JSDoc registered jobs list

Add to the list of registered jobs in the block comment at the top:
```
 *   vnIndexRefresh        every 5 min VN market hours  (task 1397) ✓
```

---

## Acceptance Criteria

- [ ] `CRONS.vnIndexRefresh` key exists and defaults to `'*/5 2-8 * * 1-5'`
- [ ] `CRON_VN_INDEX_REFRESH` env var overrides the default
- [ ] Import resolves: `runVnIndexRefreshJob` imported from `./market-data/vnIndexRefreshJob.js`
- [ ] Cron block registered in `startScheduler()` with `recordJobRun` wrapping
- [ ] `Object.keys(CRONS).length` now includes `vnIndexRefresh` (auto-increments log line)
- [ ] No TypeScript errors (`bun run tsc --noEmit`)
- [ ] `bun test` passes at >= 7915
