# dev-mcp-server -- Notebook

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

## 2026-06-15 · FIX-SIGNAL-CONFIDENCE-DEFAULT-50

**Task:** FIX-SIGNAL-CONFIDENCE-DEFAULT-50 | Priority: P1 | Zone: apps/mcp-server/

**Root cause confirmed (recon-first):** 4 external postSignal call sites omitted confidence_score; `_postSignalInner` destructures with default 50 and all callers used the placeholder.

**Call site audit (4 external + 3 internal pass-through via ...input):**
1. `agentSignalTools.ts:317` — MCP tool post_agent_signal; finding_data.confidence (0-1) available but NOT wired into signalInput.
2. `intelligenceCycleJob.ts:1290` — `verified_chain` with `chain.conviction >= 0.7` in scope but confidence_score absent.
3. `askQueueCheckJob.ts:63` — `pending_questions`; no confidence signal at all.
4. `freshnessSlaMonitorJob.ts:461` — SLA breach `urgent_news`; severity known but confidence_score absent.

**Fix (generic, no allowlist, no hardcode):**
- `agentSignalTools.ts`: rawConfidence = findingDataRecord["confidence"] if number → Math.round(*100), spread into signalInput when present; omit when absent (column DEFAULT 50 = honest for genuinely absent).
- `intelligenceCycleJob.ts`: `confidence_score: Math.min(100, Math.max(0, Math.round(chain.conviction * 100)))` on verified_chain post.
- `askQueueCheckJob.ts`: `confidence_score: Math.min(100, count * 10)` — pending count derivation.
- `freshnessSlaMonitorJob.ts`: `confidence_score: severity === "CRITICAL" ? 90 : 70`.
- `postSignalWithCriticGate` (3 internal calls): passes `...input` through — inherits from callers, no change needed.

**Live verify (named-volume market.db, keinos/sqlite3 sidecar):**
ids 6216-6219: verified_chain=85, urgent_news=90, chain_catalyst=78, pending_questions=30 — SPREAD, none 50.

**Commit:** 4f5192c5 | **Image:** 2f080303023e (built 2026-06-15 18:23:48 CEST)
**Tests:** 22 new / 0 fail | Full suite: 13009 pass / 52 fail (52 = pre-existing timeouts) | tsc clean
**Tools:** 164 (unchanged) | Sched: 3 (unchanged)

Zone health: bun test 13009 pass (52 pre-existing fails unchanged), tsc clean, 164 tools, real confidence spread live | HEALTHY
