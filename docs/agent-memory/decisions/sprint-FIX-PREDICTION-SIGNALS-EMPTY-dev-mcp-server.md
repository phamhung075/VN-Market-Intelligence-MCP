# Decision Journal — Sprint FIX-PREDICTION-SIGNALS-EMPTY · dev-mcp-server

**Sprint goal:** Fix green-but-empty prediction_signals pipeline (frozen since 2026-04-27, ~87 days as of 2026-07-23) despite predictionMarketPollJob reporting status=success every cycle.
**Agent:** dev-mcp-server
**Started:** 2026-07-23T20:45:41Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-23T20:45:41Z
**task-id:** FIX-PREDICTION-SIGNALS-EMPTY
**what-done:** RAW-verified root cause at source (live docker exec against market.db + container logs), ruled out DS-DEGRADE-01-class (table-not-created) explicitly, then reordered `runPredictionMarketPoll()`'s staleness guard (Step 5b) to run BEFORE the `currentMarkets.length === 0` early return in `apps/mcp-server/src/scheduler/macro/predictionMarketJob.ts`.
**what-considered:**
- (c) table never registered in initDatabase() — checked `schema.ts` imports `initMacroTables` from `schema-macro.ts` which IS called inside `initDatabase()`; live DB has both tables with correct columns → ruled out.
- (d) write/read table mismatch — `storePredictionSignals()` writes `prediction_signals`, `get_prediction_markets` reads the same table/columns → ruled out.
- (a)/(e) upstream empty+swallowed: live `docker exec` + `curl -v` from inside `vn-market-intelligence-mcp-mcp-server-1` proved `gamma-api.polymarket.com` resolves to 145.239.225.117 which serves cert `CN=*.anj.fr` (network-level block, not app bug) → `ERR_TLS_CERT_ALTNAME_INVALID` on every cycle; CLOB already known 403 geo-blocked. `fetchPolymarkets()` is documented "never throws" — swallows both and resolves `[]`.
**why-decision:** Because the fetch never throws, Step 3's catch-fallback never fires, and the OLD Step 5 early-return (`currentMarkets.length===0`) sat before Step 5b's staleness/Telegram-alert guard — making that guard structurally unreachable for the entire outage (live-confirmed via `cron_job_runs`: status=success, rows_written=null, every ~30min). This is the exact DS-DEGRADE-01/DS-OBS-01 "success path disconnected from output" class the task named. Minimal, non-fabricating fix: reorder so staleness detection always runs; do not touch the TLS/geo-block itself (external network condition, outside apps/mcp-server code ownership — flagged as a secondary follow-up, not fixed here).
**why-change:** No plan deviation — investigation confirmed candidate (e) from the task brief (source blocked/empty, missing staleness escalation) as the fixable root cause; candidates (c) and (d) were explicitly checked and ruled out per the task's NO-FABRICATION guard.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-23T20:45:41Z
**task-id:** FIX-PREDICTION-SIGNALS-EMPTY
**what-done:** Added `FIX-PREDICTION-SIGNALS-EMPTY-staleness-guard-unreachable.test.ts` (3 TCs) through the REAL `initDatabase()`/`getDb()` singleton path (`DB_PATH=":memory:"`, DS-DEGRADE-01-FIX precedent) — NOT an isolated hand-rolled fixture. Full `bun test` (14698 pass/42 fail, all 42 pre-existing on clean tree via `git stash` A/B check, none touch prediction-market code), `bun tsc --noEmit` clean, server boot smoke-test clean (toolCount=184, 90 CRONS keys).
**what-considered:**
- Fix `167-prediction-market-job.test.ts`'s existing hand-rolled fixture DB instead — rejected: task explicitly forbids isolated `:memory:` fixtures for the proof test (same masking pattern that hid DS-DEGRADE-01 6 weeks).
- Only assert on log lines — rejected: weaker than asserting on the actual Telegram alert side-effect + signal-detector-skip behavior.
**why-decision:** New TCs directly reproduce the live bug shape (fetchFn resolves `[]`, never throws) and prove the alert now fires when `prediction_markets` is stale, while TC-2 proves no regression on the legitimate "nothing new this cycle, data still fresh" path.
**why-change:** none.
