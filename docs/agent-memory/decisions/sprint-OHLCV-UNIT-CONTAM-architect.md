# Decision Journal — Sprint OHLCV-UNIT-CONTAM · architect

**Sprint goal:** Eliminate OHLCV split-scale contamination in daily_ohlcv (385 rows, all watchlist tickers)
**Agent:** architect
**Started:** 2026-06-12T00:00Z

---

### STEP architect-S1 · architect · 2026-06-12T08:15Z
**task-id:** OHLCV-UNIT-CONTAM-ARCH-1
**what-done:** Full brownfield scan of all 5 daily_ohlcv writers; identified contamination mechanism; authored repair + detection design.
**what-considered:**
- Option A: Reject contaminated push at HTTP level (400) → ruled out: VPS exponential backoff risk (FIX-1274 lesson)
- Option B: Skip row + log.error at guard boundary → chosen: non-destructive, VPS gets 200, contamination fails loud
- Repair: backfill script vs. recompute-from-ticks → recompute-from-ticks for recent rows (≤24h), SQL multiply-heuristic for older rows (per memory lesson: derived-column fix needs corpus re-flow)
- Detection: inline guard only vs. separate sanity cron → both: inline for fail-loud at write time, cron for periodic scan of surviving contamination
**why-decision:** Guard must be additive and non-breaking for VPS feed; domain service placement ensures DRY + DDD compliance; repair sequenced after fix to prevent re-contamination during repair window.
**why-change:** no change from plan — design derived from PO-confirmed root cause, no spec revision needed.
