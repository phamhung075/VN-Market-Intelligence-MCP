# dev-macro-indicators — Notebook

Zone: `apps/macro-indicators/` | Stack: TS/Bun | DB: market.db (read)

## Working Memory

### Session 2026-05-13 — FRED timeout regression fix

**Task:** Parallelize `fetchAllMacro()` in `fred-macro.ts` to resolve 8-12s sequential latency exceeding the 8s per-source budget.

**Root cause:** Sequential `for...of` loop with `await fetchSeries()` + `sleepMs(600-1000)` between each of 8 series calls.

**Fix:** Replace with `Promise.all(entries.map(([, seriesId]) => this.fetchSeries(seriesId)))`. Removed dead `sleepMs` helper. FRED public rate limit (120 req/min) easily accommodates 8 concurrent calls.

**Tests added (3 new in fred-macro.test.ts):**
- all-series-ok: returns 8 non-null results
- one-series-fails: VIXCLS returns null, 7 others non-null
- parallel-timing: all 8 fetch calls dispatched within 30ms window

**Result:** 90 pass / 0 fail (was 87). Test suite runs in ~600ms. Parallel test itself: 83ms total.

**Branch:** `task/fred-parallelize-fetch-all-macro` — pushed, QA notified.

**Follow-up identified:** `WorldBankMacroAdapter.fetchVnMacroBatch()` has identical sequential loop (1.5-2.5s sleep x7 = 10-17s). Currently exceeds 8s budget. Not fixed here — separate branch needed.

Zone health: FRED adapter unblocked; 3 new tests covering parallel dispatch; WorldBank sequential loop known issue | HEALTHY
