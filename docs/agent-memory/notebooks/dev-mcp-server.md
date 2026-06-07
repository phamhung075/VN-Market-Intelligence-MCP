# dev-mcp-server -- Notebook

## c390 · 2026-06-07 (TSU-DEV-U3: 5 Deregister + 7 Integrate Description Updates) — COMMITTED

**Task:** TSU-DEV-U3 — TOOL-SURFACE-UPGRADE sprint  
**Deliverables:** 5 tools deregistered (read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context, is_trading_day) — server.tool() blocks replaced with no-ops, handlers retained. 7 tool descriptions updated (mark_alert_outcome, get_market_foreign_flow, diagnose+reset circuit breaker, get_label_accuracy_report, get_public_contracts, list_flagged_bctc_cells, submit_bctc_correction). `docs/data/tool-registry.json` + `project-stats.json` regenerated (162→157). cowork-refactory-expert signal row appended to orch-state.json signal_queue.  
**Tests:** 12 new GREEN (TSU-DEV-U3 test file). tool-registry-parity 8/8 GREEN (T-U2-5 confirmed 157). tsc: clean. tools=157, sched=76. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: bun test 12/0 (U3 suite) + 8/0 (parity), tsc clean, 157 tools (162-5 deregistered), scheduler 76 cron.schedule | HEALTHY

---

## c389 · 2026-06-07 (TSU-DEV-U5: Foreign Flow Null Holding Ratio) — COMMITTED

**Task:** TSU-DEV-U5 — TOOL-SURFACE-UPGRADE sprint  
**Deliverables:** `foreignFlowAnalyzer.ts`: added `is_holding_ratio_fabricated: boolean` to `ForeignFlowSignal`; gate holdingRatioChange5d computation + reasoning append when all holdingRatio=0. `foreignFlowTools.ts`: `formatForeignFlowOutput` gates Holding Ratio column + `Holding ratio change (5d)` line via `hasRealHoldingData = !signal.is_holding_ratio_fabricated`; tool description updated (removed "holding ratio change" mention). `companyProfileTools.ts`: `foreign_holding_ratio` emits null when `current_holding_ratio === 0` (DSI invariant).  
**Tests:** 10 new GREEN (TSU-DEV-U5 test file). tsc: clean. tools=157 (SSOT), sched=76. | **INV-GATEWAY-1:** no commit-mutex/task_claim/task_release.

Zone health: bun test 10/0 (U5 suite), 0 regression, tsc clean, 157 tools (SSOT), scheduler 76 cron.schedule | HEALTHY

### Baselines (FIX-PROJECT-STATS-GENERATED 2026-06-07)
tools=157 (post-U3), sched=76 | Generator: `bun scripts/gen-project-stats.ts` post tool/cron change
Zone: `apps/mcp-server/` | Stack: TS/Bun | DB: market.db
Archive: `docs/archive/notebooks/dev-mcp-server-2026-05-21.md`

---

## 2026-06-08 · FIX-FRED-YAHOO-WEEKEND-STALE — COMMITTED (c7a6de6c)

**Task:** FIX-FRED-YAHOO-WEEKEND-STALE — 4 bun-test null-assert failures (1423b FRED-01/FRED-06, 1922j AC-1/AC-2/AC-3, 1487 T-2) + tnb c90 F-FED-RATE-REGRESSION (weekend path serves stale 5.33%).

**Root causes fixed (5 files):**
1. `fredApi.ts`: INSERT used `data_env` (migration-added column) — fails on in-memory test schemas. Added try/catch fallback INSERT without data_env.
2. `fredEffrIorb.ts`: FRED_API_KEY guard blocked all calls including mock-client test path. Guard now conditional on `!httpClient`. Added CSV format fallback to `parseFredEffrIorbJson` so test fixtures (DATE,VALUE rows) parse correctly alongside JSON REST format.
3. `yahooFinance.ts`: `storeCommoditySnapshot` INSERT used `data_env` — same schema mismatch. Added `hasDataEnvCol` probe + dual INSERT path inside transaction.
4. `macroIndicatorRefreshJob.ts`: when FRED CSV fails (weekends / Akamai WAF), new EFFR fallback reads `fred_series_daily` MAX(EFFR) → writes to `tracked_indicators.fed_funds_rate`.
5. `startScheduler.ts`: startup bridge — if `tracked_indicators.fed_funds_rate` empty on restart + `fred_series_daily` has EFFR rows, bridge immediately so macro-indicators serves correct value.

**Evidence:**
- Tests: 4 failures → 0. 17/17 pass (1423b×6, 1922j×4, 1487×7). Confirmed in container.
- tsc: clean. scheduler cron.schedule: 76 (baseline unchanged).
- Container img=11e737901726, all 7 peers healthy.
- tracked_indicators.fed_funds_rate=3.62 (bridged from EFFR 2026-06-03, source=fred_series_daily).
- macro-indicators Go service cache=stale-5.33 (caches per internal TTL, will self-heal on next refresh/restart).

**Monday gate (tnb c91):** macroIndicatorRefreshJob runs 19:13 UTC Sunday (= Monday morning VN time). EFFR fallback will fire (CSV Akamai-blocked on weekends), write 3.62 to tracked_indicators, macro-indicators will serve 3.62 on next /snapshot call after cache expiry.

Zone health: 17/0 target tests, tsc clean, 157 tools (SSOT), 76 cron.schedule | HEALTHY
