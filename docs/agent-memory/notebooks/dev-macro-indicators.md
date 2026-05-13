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

### Session 2026-05-13 — WorldBank timeout fix

**Task:** Parallelize `fetchVnMacroBatch()` in `world-bank-macro.ts` — same sequential-loop timeout pattern as FRED.

**Root cause:** Sequential `for...of` loop with `await fetchVnIndicator()` + `sleepMs(1500-2500ms)` between each of 7 indicator calls. Total wall time 10-17s, exceeded 8s per-source budget in `FetchExternalMacroUseCase`.

**Fix:** Replace with `Promise.all(entries.map(([, code]) => this.fetchVnIndicator(code)))`. Removed dead `sleepMs` helper. World Bank public API rate limit (10 req/10s) easily accommodates 7 concurrent calls. Wall time drops to ~2-3s.

**Tests added (3 new in world-bank-macro.test.ts):**
- all-indicators-ok: returns 7 non-empty results
- one-indicator-fails: fdi_inflows returns [], 6 others non-empty
- parallel-timing: all 7 fetch calls dispatched within 30ms window

**Result:** 93 pass / 0 fail (was 90). Test suite runs in ~640ms. Parallel test itself ran in 411ms total.

**Diff budget:** 85 net lines added (under 120 limit).

**Branch:** `task/worldbank-parallelize-fetch-vn-macro-batch` — pushed, QA notified.

**Docs updated:** infrastructure.md (WorldBank adapter section), testing.md (counts + WorldBank test table).

Zone health: WorldBank adapter unblocked; parallel dispatch pattern now consistent with FRED; 93 pass / 12 skip / 0 fail | HEALTHY
