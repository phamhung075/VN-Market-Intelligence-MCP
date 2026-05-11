# TASK_1397a — Create vnIndexRefreshJob.ts

**Sprint:** 1397
**Type:** feature
**Layer:** interface/scheduler
**Estimate:** ~1h
**Baseline:** 7915 pass / 0 fail
**Depends on:** none
**Blocks:** TASK_1397b, TASK_1397c

---

## Goal

Create `apps/mcp-server/src/scheduler/market-data/vnIndexRefreshJob.ts`.

This job fetches VNINDEX from VnDirect's `vnmarket_prices` API and upserts it
into `market_prices` + `market_prices_history` via the already-existing
infrastructure functions `fetchVnIndex()` and `storeMarketPrices()` in
`apps/mcp-server/src/infrastructure/fetchers/hose.ts`.

No new domain service. No new use case. Interface-layer only.

---

## File to Create

**Path:** `apps/mcp-server/src/scheduler/market-data/vnIndexRefreshJob.ts`

```typescript
/**
 * VN-Index Refresh Job (Task 1397)
 *
 * Fetches VNINDEX (and optionally HNX-INDEX / UPCOM-INDEX) from the VnDirect
 * vnmarket_prices API and upserts into market_prices + market_prices_history.
 *
 * Called by the scheduler every 5 min during VN market hours.
 * Does NOT depend on the VPS price-push pipeline — fetches directly.
 *
 * Layer: interface/scheduler
 */

import { fetchVnIndex, storeMarketPrices } from "../../infrastructure/fetchers/hose.js";
import { logger } from "../../infrastructure/logger.js";

/** Index codes to refresh on each cycle. */
const INDEX_CODES = ["VNINDEX"];

export interface VnIndexRefreshResult {
  fetched: number;   // number of index codes successfully fetched
  stored: number;    // number of MarketPrice rows passed to storeMarketPrices
  skipped: number;   // codes that returned null (API unavailable)
}

/**
 * Fetch all INDEX_CODES and upsert into market_prices.
 * Never throws — errors are logged and counted as skipped.
 */
export async function runVnIndexRefreshJob(): Promise<VnIndexRefreshResult> {
  let fetched = 0;
  let skipped = 0;
  const prices = [];

  for (const code of INDEX_CODES) {
    try {
      const price = await fetchVnIndex(code);
      if (price === null) {
        logger.debug("[vn-index-refresh] API returned null", { code });
        skipped++;
      } else {
        prices.push(price);
        fetched++;
      }
    } catch (err) {
      logger.warn("[vn-index-refresh] fetch failed", {
        code,
        error: err instanceof Error ? err.message : String(err),
      });
      skipped++;
    }
  }

  if (prices.length > 0) {
    await storeMarketPrices(prices);
    logger.debug("[vn-index-refresh] stored", { count: prices.length });
  }

  return { fetched, stored: prices.length, skipped };
}
```

---

## Implementation Notes

- `INDEX_CODES` is a module-level constant (not exported) — developer can add
  `"HNX-INDEX"` or `"UPCOM-INDEX"` later without touching `jobs.ts`.
- `fetchVnIndex(code)` already has a 10s `AbortController` timeout and returns
  `null` on any failure. The try/catch is belt-and-suspenders.
- `storeMarketPrices` handles `INSERT OR REPLACE` into both `market_prices` and
  `market_prices_history` — no custom SQL needed.
- No trading-session guard inside the job: the cron expression in `jobs.ts`
  already constrains to VN market hours weekdays only.
- Follow coding standards: `.js` extension on imports, `Bun.env` not
  `process.env`, no `any`.

---

## Acceptance Criteria

- [ ] File exists at the exact path above
- [ ] `runVnIndexRefreshJob` is exported as a named export
- [ ] `VnIndexRefreshResult` interface is exported
- [ ] Imports use `.js` extension
- [ ] No TypeScript errors (`bun run tsc --noEmit`)
- [ ] `bun test` passes at >= 7915 (baseline maintained, no new tests yet —
  those are in TASK_1397c)
