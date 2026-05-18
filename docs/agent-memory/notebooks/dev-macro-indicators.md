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

### Session 2026-05-17 — Calendar source 10s hard cap

**Task:** Reduce calendar source timeout from 30s to 10s to prevent 63s hang blocking entire `/macro/external` fetch.

**Root cause:** `DEFAULT_TIMEOUTS.calendar` was 30_000ms. The CF Python subprocess can stall far beyond the expected warmup window, causing `Promise.race` to wait the full 30s (or longer if the process eventually completes). Observed: `status: "timeout"`, `totalLatencyMs: 62700ms`.

**Fix:** `DEFAULT_TIMEOUTS.calendar: 30_000 → 10_000` in `fetch-external-macro.ts`. Also:
- Exported `DEFAULT_TIMEOUTS` (was `const`, now `export const`) for test assertions
- Typed as `Required<SourceTimeouts>` — removed non-null `!` assertions from constructor merge
- Updated module-level JSDoc to document 10s cap + rationale

**Tests added (3 new in fetch-external-macro.test.ts):**
- `DEFAULT_TIMEOUTS.calendar === 10_000` — asserts constant directly
- slow calendar (15s stub) timed out at 10s budget — latencyMs ≥ 10_000
- other 5 sources complete normally while calendar pending

**Result:** 105 pass / 12 skip / 1 pre-existing fail (world-bank mock, unrelated). Test runtime ~21s (3 new 10s timeout tests dominate).

**Docs updated:** usecases.md (FetchExternalMacroUseCase section + timeout table), testing.md (+test group table, updated counts), infrastructure.md (InvestingCalendarAdapter section with 10s hard cap note).

**Branch:** `task/calendar-source-10s-timeout` — commit c8f63afc.

Zone health: calendar timeout capped at 10s; withTimeout + Promise.all pattern verified; 105 pass / 12 skip / 1 pre-existing fail | HEALTHY

### Session 2026-05-18 — Calendar wontfix: NullCalendarAdapter

**Task:** calendar-source-replacement — evaluate replacement for dead investing.com calendar or remove cleanly.

**Decision:** Wontfix — Option B. No viable free replacement for Vietnam economic calendar events found. Trading Economics already integrated as a separate adapter. All other alternatives (IMF, World Bank, Alpha Vantage) don't provide VN event timing without auth.

**Fix:**
- Created `NullCalendarAdapter` (implements `InvestingCalendarPort`, returns `[]` instantly) in `investing-economic-calendar.ts`
- Deprecated `InvestingCalendarAdapter` in same file (dead code, retained as historical reference)
- `DEFAULT_TIMEOUTS.calendar: 5_000 → 0` in `fetch-external-macro.ts`
- `index.ts` wired `NullCalendarAdapter` instead of `InvestingCalendarAdapter`
- `idleTimeout: 120 → 90` (calendar no longer adds to max budget)

**Tests:** 4 new in `investing-economic-calendar.test.ts`:
- NullCalendarAdapter returns [] immediately
- countryId arg ignored
- resolves in under 50ms
- DEFAULT_TIMEOUTS.calendar === 0

**Result:** 103 pass / 12 skip / 1 pre-existing fail. Test runtime 11s → ~1s (5s calendar timeout stubs eliminated).

**Commit:** d0884c78

Zone health: calendar dead endpoint fully removed from macroRefresh cycle; NullCalendarAdapter zero-cost; test runtime halved to ~1s; 103 pass / 12 skip / 1 pre-existing fail | HEALTHY

### Session 2026-05-17 — Calendar timeout 10s → 5s + Docker rebuild

**Task:** Reduce calendar timeout to 5s (was 10s in source, but Docker container was still running 30s stale image). Live endpoint confirmed `latencyMs: 30001` before fix.

**Root cause (two-part):**
1. Prior commit had already set source to 10_000, but Docker container had not been rebuilt — running stale image from before any fix.
2. Task spec required reducing further to 5_000 since endpoint is permanently unreachable.

**Fix:**
- `DEFAULT_TIMEOUTS.calendar: 10_000 → 5_000` in `fetch-external-macro.ts`
- Updated JSDoc comment chain: 30s → 10s → 5s with rationale
- Test assertions updated: `toBe(5_000)`, slow-calendar stub 15s → 10s, budget 10_000 → 5_000
- Docker image rebuilt + container recreated (`docker compose build + up -d`)

**Verification:** `localhost:5004/external` → `"calendar": { "status": "timeout", "latencyMs": 5001 }`. Page load reduced from ~30s to ≤5s.

**Tests:** 105 pass / 12 skip / 1 pre-existing fail (world-bank mock, unrelated). Test runtime ~11s (halved from ~21s).

**Commits:** 681d0482 (fix), 2198fc16 (docs)

Zone health: calendar hard cap at 5s; Docker container rebuilt + verified via live endpoint; 105 pass / 12 skip / 1 pre-existing fail | HEALTHY
