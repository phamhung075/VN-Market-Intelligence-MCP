# dev-mcp-server -- Notebook

## 2026-06-15 · VMT-7 Zone-B wave — 5 VN macro data MCP tools added

**Task:** VMT-7a–e + VMT-7-REGISTER (VN-MACRO-TOOLING Zone-B bundled wave)
**Commit:** (see below)

5 new MCP proxy tools wired into macro-indicators:5004 Zone-A endpoints:
- get_vn_trade_balance (POST /trade-balance) — tradeBalanceTools.ts; bloc_split.fdi/domestic.is_estimate=true PERMANENT (ARCH Decision A)
- get_vn_bop (POST /bop) — bopTools.ts; offshore_parked.is_estimate=true PERMANENT; fx_incidence.is_estimate=false; errors_omissions BPM6 sign
- get_vn_macro_indicators (POST /macro-indicators) — macroIndicatorsVnTools.ts; 4 IIP sectors; is_estimate=false (primary source)
- get_cpi_components (POST /cpi-components) — cpiComponentsTools.ts; weight_pct=null ALL baskets + headline; weights_is_estimate=true PERMANENT; do NOT coerce null→0
- get_vn_liquidity_state (POST /liquidity-state) — liquidityStateTools.ts; irs.is_estimate=true PERMANENT (DD-6); interbank_1w.is_estimate=true PERMANENT + rate_1w_pct=null + blocked_reason (Decision B); omo.is_estimate reflects parse success

VMT-7-REGISTER: wired all 5 into http-proxy/index.ts barrel + registry.ts (imports + toolRegistry array entries #164–#168).

Base URL mechanism: MACRO_INDICATORS_URL env var → http://localhost:5004 (via getMacroBaseUrl() from macroHttpClient.ts — identical to all existing macro HTTP-proxy tools).

**Gate results:** tsc --noEmit exit 0. bun test 13037 tests / 0 failures. Tool registrations +5 = 181 server.tool() calls. Scheduler count unchanged (no scheduler files touched).

Zone health: bun test 0 fail, 181 tool registrations (+5 from VMT-7), scheduler count unchanged | HEALTHY

---

## Archive: Earlier Sessions (2026-06-13 and prior)

Pre-2026-06-15 tasks (VMT-6, T3-ARCH-CRON-WATCHDOG, T1-ARCH-CRON-T4-DEDUP-GUARDS, FIX-MCP-CRASH-LOOP tasks, FIX-FUNDAMENTALS-REFRESH-CRON-DEAD, FIX-BCTC-VPS-QUEUE-SYNC, TSU-DEV-U5/U1, FIX-EXTRACTION-CONFIDENCE-NO-RECOMPUTE): See git history commits c35db4fc...829931b3 (2026-06-13 and prior).

---

---

## Archive

Pre-2026-06-10 tasks (FIX-PENDING-REFINE-LIMIT-CHECKKIND, CI-RED-b7b84d9b-FIX, etc.): See git history commits a7c2f4f–897877ec (2026-06-13 and prior)

## 2026-06-14 · FIX-MCP-500-SYMBOL-TO-STRING — WebStandardStreamableHTTPServerTransport — REVIEW

**Task:** FIX-MCP-500-SYMBOL-TO-STRING | Priority: P0 | Zone: apps/mcp-server/
**Root cause:** `StreamableHTTPServerTransport` (SDK 1.29.0) bridges Node.js HTTP through `@hono/node-server` which defines 13 Symbol-keyed prototype properties (`urlKey`, `headersKey`, `incomingKey`, `wrapBodyStream`, ...). Under Bun 1.3.13 JIT corruption (triggered ~80 min after startup during heavy `ohlcvBackfill` processing of 1608 tickers), accessing these Symbol keys attempts `Symbol→string` coercion and throws `TypeError: Cannot convert a symbol to a string` on every `/mcp` request — total cowork fleet outage.
**Fix:** Replaced `StreamableHTTPServerTransport` with `WebStandardStreamableHTTPServerTransport` in `apps/mcp-server/src/interface/mcp/server.ts`. Added `incomingToWebRequest()` + `pipeWebResponseToNode()` helpers to bridge `Node.js IncomingMessage/ServerResponse` ↔ Web Standard `Request/Response` using `Readable.toWeb()` — no @hono/node-server dependency, no Symbol-keyed property access on the `/mcp` hot path.
**Files:** apps/mcp-server/src/interface/mcp/server.ts (+100 lines, -5 lines)
**Commit:** e69b354f
**Tests:** tsc 0 errors. bun test 12847 pass, 0 new failures (53 pre-existing deprecated-test failures unchanged).
**Local verify:** /vn-market/mcp POST → event:message 200; /vn-market/sse → event:endpoint 200; /health → 200 toolCount:157.
**Next:** ops rebuild --no-cache mcp-server + force-recreate → live proof via call_tool get_market_snapshot.
Zone health: tsc clean, 157 tools intact, 79 cron.schedule, Symbol-TypeError eliminated | REVIEW

## 2026-06-14 · FIX-REFINE-LOCK-TTL-RECLAIM — owner_agent fix + TTL increase + T1-T5 tests

**Task:** FIX-REFINE-LOCK-TTL-RECLAIM (P1, recurring [Lock orphaned by rebuild])
**Root cause:** refine_bctc_md flow called task_heartbeat/task_release WITHOUT owner_agent → legacy owner_session path → zombie after every mcp-server rebuild → lock never deleted → all future refine fires blocked.
**Fix A:** Added owner_agent:"refine-orchestrator" to task_heartbeat (~L82), happy-path task_release (~L97), and error-boundary task_release (~L101) in docs/agents/refine_bctc_md/flow/main.md.
**Fix C:** Increased ttl_seconds from 1000 to 1800 in task_claim call (~L38) — gives 30-min window for 7-window chunks.
**coordinationStore.ts:** No change — claimTask Step 2 stale-steal and heartbeatTask/releaseTask owner_agent paths were already correct.
**Tests:** apps/mcp-server/src/__tests__/FIX-REFINE-LOCK-TTL-RECLAIM.test.ts — T1 (expired steal) + T2 (live no-steal) + T3 (heartbeat rebuild-sim) + T4 (release rebuild-sim) + T5 (push idempotency). 5/5 pass.
**Gates:** tsc exit 0, bun test 5/5 green.
**Note:** Flow fix takes effect on next cron fire (no rebuild needed). New test file lives in apps/mcp-server so ops needs targeted rebuild for qa LIVE container gate. ops clears orphan bctc-refine:bdcfa5e0 after green.
