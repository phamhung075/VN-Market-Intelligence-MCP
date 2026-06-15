# dev-mcp-server -- Notebook

## 2026-06-15 · CI-RED-d20468c0-FIX — 8 failing tests fixed across 4 files

**Task:** CI-RED-d20468c0-FIX | Priority: HIGH | Zone: apps/mcp-server/src/__tests__/

4 root causes, all test-only (no production code changed):

1. FIX-BCTC-ENRICHER-PLACEHOLDER-URL TC-4 (×2): TC-4 was written before
   FIX-BCTC-VPS-QUEUE-SYNC G2 added the orphan-re-sync arm. Orphan arm resets
   VPS placeholder URLs to NULL in cycle-1; ARM1 enriches in cycle-2. Updated
   TC-4 to assert two-cycle contract (orphansResynced=1 in C1, enriched in C2).

2. 1138-market-portfolio-observability (×4): Block-shape regex asserted
   `cron.schedule(CRONS.X…)` but startScheduler.ts was refactored to use
   `scheduleCron()` (T2-ARCH-CRON-RECOVER-JITTER wrapper). Updated 4 regexes
   from `cron.schedule` to `scheduleCron`.

3. 1352a B-3 (×1): B-1 writes cron_job_runs success for marketScanJob:open;
   shouldSkipRecoveryReplay fires in B-3, scanCallCount stays 0. Fix: clear
   cron_job_runs in beforeEach (Group B) via getDb().exec("DELETE FROM cron_job_runs").

4. 239c AC-6 (×1): `expect(schedulerContent).toContain("cron.schedule")` false
   because startScheduler.ts uses scheduleCron exclusively. Updated to check
   "scheduleCron" and loosened cron expression check.

**Commit:** c79ce6bd | tsc clean | 31/31 pass across 4 files
**LESSON:** When schedulers refactor call-shape (cron.schedule → scheduleCron),
  structural regex tests that match the OLD call form become stale — update to
  match wrapper name. Same for test expectations on enricher cycle ordering.

Zone health: tsc clean, 163 tools intact, scheduler count unchanged | HEALTHY

---

## 2026-06-15 · VMT-7 Zone-B wave — 5 VN macro data MCP tools added

**Task:** VMT-7a–e + VMT-7-REGISTER (VN-MACRO-TOOLING Zone-B bundled wave)
**Commit:** (see below)

5 new MCP proxy tools wired into macro-indicators:5004 Zone-A endpoints:
- get_vn_trade_balance (POST /trade-balance) — tradeBalanceTools.ts
- get_vn_bop (POST /bop) — bopTools.ts
- get_vn_macro_indicators (POST /macro-indicators) — macroIndicatorsVnTools.ts
- get_cpi_components (POST /cpi-components) — cpiComponentsTools.ts
- get_vn_liquidity_state (POST /liquidity-state) — liquidityStateTools.ts

VMT-7-REGISTER: wired all 5 into http-proxy/index.ts barrel + registry.ts.

**Gate results:** tsc 0. bun test 13037 tests / 0 failures. Tool count +5 = 181. Sched unchanged.

Zone health: bun test 0 fail, 181 tool registrations (+5 from VMT-7), scheduler count unchanged | HEALTHY

---

## 2026-06-15 · FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE — clean-shutdown sentinel discriminator

**Task:** FIX-MCP-RESTART-ALERT-DEPLOY-DISCRIMINATE | Priority: P3 | Zone: apps/mcp-server/

Root cause confirmed via live recon: restartCadenceAlertJob counted ALL mcpServerStartup
rows in 4h window (deploy + crash alike). 3 deploys today (05:35, 08:02, 08:42) wrote 3
sentinels → false-positive WORK page. docker inspect: RestartCount=0, OOMKilled=false,
Health=healthy → no actual crash loop.

Fix: SIGTERM/SIGINT handler in composition-root.ts now writes mcpServerCleanShutdown
sentinel (best-effort pre-closeDb). restartCadenceAlertJob classifies each startup:
- clean-shutdown row found between prev+current startup → deploy → skip
- no clean-shutdown row → crash restart → count toward ALERT_THRESHOLD(2)

Discriminator: pure in-DB signal, generic, no per-deploy-id hardcode.
Docker RestartCount approach rejected: not accessible in-container without socket mount.

LESSON: When a monitor can't distinguish deploy from crash at the OS/Docker layer from
inside the container, model the distinction in the application's own DB lifecycle events
(graceful-shutdown sentinel = best proxy for "intentional stop by ops").

**Files:** restartCadenceAlertJob.ts, composition-root.ts, test file (+4 new cases)
**Commit:** 2d494f77 | tsc clean | 8/8 pass (4 original + 4 deploy-discrimination)
**REBUILD_REQUIRED:** YES

Zone health: tsc clean, 163 tools intact, scheduler count unchanged | HEALTHY

## 2026-06-15 · FIX-VNSTOCK-TRADINGSTATS-CRASH

**Task:** FIX-VNSTOCK-TRADINGSTATS-CRASH | Priority: P1 | Zone: apps/mcp-server/

**Root cause (recon-first):** Three missing `backoffMinutes=30` args on the trading_stats null/timeout path:
1. `syncStock()` in `syncVnstockData.ts` called `markFetched(code, "trading_stats")` with no backoff — stamped `fetched_at=now`, silencing retries for the full 2h staleness window when the Python subprocess timed out and returned null.
2. `syncStockLight()` had the same bug on all three of its null paths (trading_stats + financials + balance_sheet).
3. `runVnstockTradingStatsJobCron()` reported `rowsWritten: result.succeeded` (ticker count) instead of actual DB row delta — false-positive success when all fetches return null.

**Fix (DRY — same pattern as FIX-FUNDAMENTALS-REFRESH-CRON-DEAD + FIX-VNSTOCK-FUNDAMENTAL-RATELIMIT):**
- `syncVnstockData.ts`: `markFetched(code, "trading_stats", 30)` in `syncStock` null path; `markFetched(code, x, 30)` on all three null paths in `syncStockLight`
- `vnstockFundamentalsJob.ts`: Added `getDbFn` DI; compute `rowsWritten` from `COUNT(vnstock_trading_stats)` delta; cron returns `rowsWritten: result.rowsWritten`

**Tests:** 10 new assertions in `fix-vnstock-tradingstats-crash.test.ts` | Gate 1: 10 new + 69 related = 0 fail
**Gate 2a:** tsc clean | **Gate 2c:** 163 tools | **Gate 2d:** 78 scheduleCron calls (unchanged)
**REBUILD_REQUIRED:** YES (mcp-server ONLY, force-recreate)

Zone health: tsc clean, 163 tools intact, 78 scheduleCron unchanged | HEALTHY
