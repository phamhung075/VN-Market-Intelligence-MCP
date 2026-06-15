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

## Archive: Earlier Sessions (2026-06-13 and prior)

Pre-2026-06-15 tasks (VMT-6, T3-ARCH-CRON-WATCHDOG, T1-ARCH-CRON-T4-DEDUP-GUARDS, FIX-MCP-CRASH-LOOP tasks, FIX-FUNDAMENTALS-REFRESH-CRON-DEAD, FIX-BCTC-VPS-QUEUE-SYNC, TSU-DEV-U5/U1, FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE): See git history commits c35db4fc...829931b3 (2026-06-13 and prior).
