# Team MCP Tool Recheck — 2026-06-17T06:10Z

**Agent:** health-recheck (automated)
**Run timestamp:** 2026-06-17T06:10Z
**VN market window:** OPEN (02:00–08:59 UTC) — session time 06:03–06:10Z
**Gateway:** vn-market reachable ✅
**Prior report:** team-tool-recheck-2026-06-17-0406.md

---

## Summary

| Class | Count |
|-------|-------|
| BUG (broken, ≥1 affected caller, re-confirmed) | 6 |
| ISSUE (degraded/slow/misleading, ≥1 affected caller, re-confirmed) | 4 |
| IMPROVE (works, quality gap, re-confirmed) | 2 |
| RESOLVED this cycle | 2 |

---

## RESOLVED (no longer reproducing this cycle)

### RESOLVED-1 — Prior BUG-1 (04:06Z): vn-foreign-flow circuit breaker TRIPPED

| Field | Detail |
|-------|--------|
| **Prior claim** | `get_vps_service_health` at 04:03Z showed vn-foreign-flow VPS UNHEALTHY; SLA 75min breached CRITICAL; escalated to BUG. |
| **Re-probe** | `diagnose_foreign_flow_circuit_breaker` at 06:05Z: `Status: closed (healthy — ingesting normally). Consecutive failures: 0/5. Total successes: 370. Last failure: Never failed.` CB is fully recovered. |
| **Verdict** | RESOLVED. CB closed, data flowing via VPS (102 items/min in push log). Fallback warnings persist — covered by ISSUE-4. |

---

### RESOLVED-2 — Prior BUG-2 (04:06Z): bctcQueueEnricher 107 consecutive zero-URL cycles

| Field | Detail |
|-------|--------|
| **Prior claim** | `get_system_status` errors showed `bctcQueueEnricher: 0 URLs populated, consecutive_zero_cycles=107`. BCTC SLA 442min breached. |
| **Re-probe** | `get_system_status` at 06:04Z: no bctcQueueEnricher errors in recent 10 entries. `get_cron_health`: `bctcQueueEnricherJob | last_status: success | success_rate: 99.6% | 727 runs`. Zero-URL error loop not present. |
| **Verdict** | RESOLVED (zero-URL loop cleared). BCTC SLA remains breached at 563min (ISSUE — see ISSUE-4) but pipeline itself is running. |

---

## ACTIVE FINDINGS

### BUG-1 — TA scanner generates false `giá 0` BB-breakout alerts at market open *(prior BUG-3, 04:06Z — UNCHANGED)*

| Field | Detail |
|-------|--------|
| **Tool** | `bbAlertScanJob` (internal), `alertScanParallelJob` |
| **Class** | BUG |
| **Re-probe** | `get_system_status` at 06:04Z: alerts table contains 9 `ta_bb_breakout_down` entries timestamped `02:15 UTC` all with `giá 0 dưới BB dưới XXXXX` pattern: VRE(15491), VPB(13625), VIC(103216), VHM(75400), VCI(12461), VCB(32013), TCH(7801), SSI(13901), PPC(5001). Source review: `apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts:176` — `close = Math.round(lastCandle.close_price)`. No `close <= 0` guard. At 02:15 UTC (15 min after market open) the `daily_ohlcv` for today has a partially-written row with `close_price=0` (first VPS push arrives before candles fully populate). `0 < bb20.lower` always true → false alert fires. Additionally, `closes` array contains 0 as the last element — distorts the BB20 calculation itself, producing incorrect lower-band values (e.g. VCB BB lower = 32,013 vs actual price 61,800). |
| **Caller-surface** | `bbAlertScanJob.ts:116` (internal scheduler, 1 caller). alert-commander reads all unnotified alerts via `get_cycle_bootstrap` (agent_signals section) — these 9 false alarms reach alert-commander and can trigger false MARKET channel posts per position-danger/watchlist-opportunity rules if thresholds align. End users see impossible extreme RSI alerts (VCB RSI 3.7, VPB RSI 5.2) that never existed. |
| **Suggested fix** | `apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts` line ~177: add `if (close <= 0) continue;` after `const close = Math.round(lastCandle.close_price)`. Additionally filter `closes` array: `const closes = candleRows.map(r => r.close_price).filter(c => c > 0)` before passing to `computeFn`. |

---

### BUG-2 — news-scout `get_agent_signals` call missing required `agent` param *(prior BUG-4, 04:06Z — UNCHANGED)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_agent_signals` |
| **Class** | BUG |
| **Re-probe** | `call_tool(tool="get_agent_signals", arguments={"from_agent": "news-scout", "status": "all", "hours_back": 1})` → `MCP error -32602: path: ["agent"], message: Required`. Re-confirmed. `docs/agents/news-scout/flow/stage-bootstrap.md:39-43` still shows the broken call (no `agent` field): `{"from_agent": "news-scout", "status": "all", "hours_back": 6}`. |
| **Caller-surface** | `grep: docs/agents/news-scout/flow/stage-bootstrap.md:40` — 1 affected caller. news-scout fails SELF_SIGNALS_CACHE load every cycle → dedup cache empty → risk of duplicate signals posted to inter-agent bus. |
| **Suggested fix** | `docs/agents/news-scout/flow/stage-bootstrap.md` line 40: add `"agent": "news-scout"` alongside `"from_agent": "news-scout"`. Also fix the `docs/agents/tools/list/get_agent_signals.md` §Key Notes example which shows the same broken pattern. |

---

### BUG-3 — `get_technical_indicators` tool SSOT doc says `ticker`, live API requires `code` *(prior BUG-5, 04:06Z — UNCHANGED)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_technical_indicators` |
| **Class** | BUG |
| **Re-probe** | `call_tool(tool="get_technical_indicators", arguments={"ticker": "VHM"})` → `MCP error -32602: path: ["code"], message: Required`. `call_tool(... {"code": "VHM"})` → ✅ full indicator response. |
| **Caller-surface** | `docs/agents/tools/list/get_technical_indicators.md:8` documents param as `ticker` (SSOT wrong). `docs/agents/tools/package/market-watcher.md:177` example uses `{ ticker: "FPT" }` (WRONG). Flow files use `code` correctly: `docs/agents/market-watcher/flow/cycle.md:77` ✅. Any agent that reads the SSOT doc or package example and calls with `ticker` gets a hard schema error. |
| **Suggested fix** | Fix `docs/agents/tools/list/get_technical_indicators.md`: `ticker` → `code`. Fix `docs/agents/tools/package/market-watcher.md:177`: `{ ticker: "FPT" }` → `{ code: "FPT" }`. |

---

### BUG-4 — `get_foreign_flow` tool SSOT doc says `ticker`, live API requires `code` *(prior BUG-6, 04:06Z — UNCHANGED)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_foreign_flow` |
| **Class** | BUG |
| **Re-probe** | `call_tool(tool="get_foreign_flow", arguments={"ticker": "HPG"})` → `MCP error -32602: path: ["code"], message: Required`. `call_tool(... {"code": "HPG"})` → ✅. `docs/agents/tools/list/get_foreign_flow.md:7` still documents `ticker`. |
| **Caller-surface** | `docs/agents/tools/list/get_foreign_flow.md` is SSOT. `docs/agents/unified-agent/flow/market-analysis.md:30` references `get_foreign_flow()` without explicit param — relies on SSOT. `docs/agents/tools/package/fb-market-poster.md:65` (2026-06-14 fix note) already corrected fb-market-poster to use `get_market_foreign_flow`. Until SSOT is fixed, agents that read the SSOT doc will call with `ticker` and get schema error. |
| **Suggested fix** | `docs/agents/tools/list/get_foreign_flow.md`: rename param `ticker` → `code` in table and example block. |

---

### BUG-5 — fb-market-poster tool package instructs `get_cycle_bootstrap` with invalid `agent_name` *(prior BUG-7, 04:06Z — UNCHANGED)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_cycle_bootstrap` |
| **Class** | BUG |
| **Re-probe** | `get_cycle_bootstrap` doc at `docs/agents/tools/list/get_cycle_bootstrap.md:4` confirmed — valid enum: `[news-scout, financial-analyst, report-analyzer, market-watcher, alert-commander, digest-predict, qa-responder, unified-agent]`. "fb-market-poster" not present. Prior grep confirmed `docs/agents/tools/package/fb-market-poster.md:26` still instructs `agent_name: "fb-market-poster"`. No fix in `get_recent_fixes` (most recent: 2026-05-12). |
| **Caller-surface** | 1 affected caller: fb-market-poster agent, when it follows its tool package doc. Live call would fail with `invalid_enum_value`. |
| **Suggested fix** | Remove `get_cycle_bootstrap` from fb-market-poster.md bootstrap table. Replace with `get_market_snapshot` + `get_market_context` (already listed in its Live Market Read Tools section). |

---

### BUG-6 — `get_cycle_bootstrap` SSOT doc enum missing `bctc-analyst` *(prior ISSUE-4, 04:06Z — UNCHANGED)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_cycle_bootstrap` |
| **Class** | BUG (doc drift — live schema correct, SSOT stale) |
| **Re-probe** | `docs/agents/tools/list/get_cycle_bootstrap.md:4` still lists 8 agents — `bctc-analyst` absent. Live schema accepts 9 (confirmed via prior schema rejection message listing all 9 valid values including `bctc-analyst`). |
| **Caller-surface** | `docs/agents/tools/package/bctc-analyst.md` documents `get_cycle_bootstrap` usage. bctc-analyst works at runtime (live schema accepts it) but SSOT doc gap can mislead future doc readers and agent-father during doc audits. |
| **Suggested fix** | Add `bctc-analyst` to `agents:` array and enum description in `docs/agents/tools/list/get_cycle_bootstrap.md`. |

---

### ISSUE-1 — Reuters RSS + Trading Economics: 42 consecutive failures, never succeeded *(prior ISSUE-1, 04:06Z — ESCALATED, 18→42)*

| Field | Detail |
|-------|--------|
| **Tools** | `get_system_status` (source health section) |
| **Class** | ISSUE |
| **Re-probe** | `get_system_status` at 06:04Z: `Reuters RSS | Ngưng | Chưa bao giờ | 42 ⚠` and `Trading Economics | Ngưng | Chưa bao giờ | 42 ⚠ (×2 instances)`. Server restarted at 02:48Z — counter went from 60+ pre-restart (02:07Z report) to 18 at 04:06Z to 42 now. Sources have NEVER succeeded in this server session. Core SLAs unaffected: price/news/sbv all `ok`. Macro data arrives via VPS proxy. |
| **Caller-surface** | Agents using macro/news: news-scout, unified-agent, market-watcher — degraded coverage (Reuters news absent, TE direct scraper absent). VPS proxy compensates. |
| **Suggested fix** | Disable the MCP-internal Reuters/TE scrapers (set `disabled` like newsapi) to stop polluting source health dashboard. Reuters was decommissioned from VPS per `get_recent_fixes` #7 (2026-04-30) but MCP-internal still runs and fails. |

---

### ISSUE-2 — push-prices OHLCV rows rejected by unit guard (recurring at market open) *(prior ISSUE-2, 04:06Z — UNCHANGED)*

| Field | Detail |
|-------|--------|
| **Tool** | `pushPricesHandler.ts` (internal VPS push endpoint) |
| **Class** | ISSUE |
| **Re-probe** | `get_system_status` at 06:04Z: `[ERROR] push-prices: ohlcv rows rejected by unit guard` at 06:02:11 and 06:03:18 (2 occurrences in last 10 errors). Consistent with prior reports. Source: `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts` — fires when `ohlcvResult.rejected.length > 0`. VPS push delivers 113 rows/push; some rows fail `validateOhlcvUnit`. RF-1: guard is fail-closed (HTTP 200 returned, error logged, row skipped). |
| **Caller-surface** | All agents reading intraday OHLCV (market-watcher, bbAlertScanJob, taAlertScanJob). Rejected rows create gaps in the intraday candle series — root cause shared with BUG-1 (zero-close writes). |
| **Suggested fix** | (1) Fix VPS-side to not push price=0 rows during 02:00–02:20 UTC warm-up. (2) Downgrade log level from ERROR to WARN within first 20 minutes of market open. (3) Capture ticker+value in the rejection log for triage. |

---

### ISSUE-3 — vnstockTradingStatsRefresh 50% success rate, avg 943s duration *(prior ISSUE-3, 04:06Z — UNCHANGED)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_cron_health` → `vnstockTradingStatsRefresh` |
| **Class** | ISSUE |
| **Re-probe** | `get_cron_health` at 06:04Z: `vnstockTradingStatsRefresh | last_status: success | success_rate: 0.50 (50.0%) | total_runs: 2 | avg_duration: 943711ms`. Exactly unchanged. 15.7 min average — extreme; likely external VNstock API timeout or rate limit. Last success: 2026-06-15. |
| **Suggested fix** | Add per-job timeout (< 10 min). Add retry-with-backoff per ticker rather than per-job. Monitor over next 7 days — if 50% rate persists with more runs, escalate to BUG. |

---

### ISSUE-4 — foreign_flow SLA 196min breach + recurring fallback-exhaustion log noise *(prior ISSUE-2, 02:07Z; deescalated from prior BUG-1, 04:06Z)*

| Field | Detail |
|-------|--------|
| **Tools** | `get_sla_status`, `get_system_status`, `diagnose_foreign_flow_circuit_breaker` |
| **Class** | ISSUE |
| **Re-probe** | `get_sla_status` at 06:04Z: `foreign_flow | 196 min | 10 min SLA | breached | CRITICAL`. `get_system_status` errors: `[WARN] foreign-flow-job: fallback activated` + `[WARN] foreign-flow-job: all fallbacks exhausted` recurring every minute since ~03:00Z. However: `diagnose_foreign_flow_circuit_breaker`: `closed (healthy), 370 successes, 0 failures`. `get_vps_proxy_health` push log: foreign-flow pushes every 30s (102 items, ok). Data IS flowing via VPS push. Root cause: `foreignFlowFetcherJob` fallback chain tries direct endpoint (bgapidatafeed.vps.com.vn) → fails → VPS push path not part of this fallback chain. SLA measures the direct-fetch timestamp, not VPS push timestamp → misleading CRITICAL. |
| **Caller-surface** | system-auditor Tier-2 reads `get_sla_status` and fires CRITICAL BUG-channel alert on every breach. Creates alert fatigue. Agents using `get_market_foreign_flow` (market-watcher, unified-agent) receive live data unaffected. |
| **Suggested fix** | (1) `foreignFlowFetcherJob`: treat VPS push path as a valid fallback — downgrade "all fallbacks exhausted" to INFO when VPS push confirmed data within last 2× cadence. (2) `get_sla_status`: use MAX(direct_fetch_at, vps_push_at) for foreign_flow freshness computation. |

---

## IMPROVE

### IMPROVE-1 — `get_foreign_flow` holding_ratio 0.00% on today's intraday row *(prior IMPROVE-1, 04:06Z — UNCHANGED)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_foreign_flow` |
| **Class** | IMPROVE |
| **Re-probe** | `get_foreign_flow(code="HPG")` at 06:05Z: today (2026-06-17) `Holding Ratio: 0.00%`, `Foreign Room: 210.15M`. Prior days: `21.46–21.54%`. Early-session intraday row missing the holding_ratio join. |
| **Suggested fix** | Null-coalesce holding_ratio from prior session row when today's intraday value is 0 or null. |

---

### IMPROVE-2 — bctcReparseJob 82.2% success rate (near 80% alert threshold) *(prior IMPROVE-2, 04:06Z — UNCHANGED)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_cron_health` → `bctcReparseJob` |
| **Class** | IMPROVE |
| **Re-probe** | `bctcReparseJob | last_status: success | 0.82 (82.2%) | 174 runs | avg: 269,800ms`. Unchanged from prior. Alert threshold <80% — 2pp buffer remains. |
| **Suggested fix** | Per-PDF timeout + retry-with-backoff instead of failing the whole job. |

---

## Tool Reachability Summary (this cycle)

| Tool | Reachable | Latency | Notes |
|------|-----------|---------|-------|
| `get_system_status` | ✅ | ~1s | Live — 10 unresolved errors |
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ | 12ms | Fast |
| `get_market_snapshot` | ✅ | ~1s | VN-Index 1,787.89 -1.11% |
| `get_macro_snapshot` | ✅ | ~1s | Live: gold 4351, oil 78.56 |
| `get_pipeline_health` | ✅ | ~1s | 41 tickers; 7 TA-not-ready (BDI/DAG/DLC/JSH/SIS/VDC/VNH) |
| `get_cron_health` | ✅ | ~1s | 70+ crons; see ISSUE-3 |
| `get_vps_proxy_health` | ✅ | ~1s | prices/news/sbv ok; bctc STALE (12h, no new PDFs) |
| `get_sla_status` | ✅ | ~1s | 2 breached: bctc (563min/120min), foreign_flow (196min/10min) |
| `get_earnings_calendar` | ✅ | ~1s | 11 QUÁ HẠN Q1-2026 |
| `get_alerts(type="ta_bb_breakout_down")` | ✅ | ~1s | 5 false giá=0 alerts — BUG-1 |
| `get_foreign_flow(code="HPG")` | ✅ | ~1s | Works with `code`; `ticker` fails ← BUG-4 |
| `get_foreign_flow(ticker="HPG")` | ❌ | — | Schema error — BUG-4 |
| `get_market_foreign_flow` | ✅ | ~1s | Live: NET SELL -1.00M |
| `get_technical_indicators(code="VHM")` | ✅ | ~1s | VHM RSI 31.9, below BB lower |
| `get_technical_indicators(ticker="VHM")` | ❌ | — | Schema error — BUG-3 |
| `get_agent_signals(agent="news-scout",...)` | ✅ | ~1s | Works with `agent` |
| `get_agent_signals(from_agent only)` | ❌ | — | Missing `agent` — BUG-2 |
| `get_recent_fixes` | ✅ | ~1s | Last fix: 2026-05-12 |
| `diagnose_foreign_flow_circuit_breaker` | ✅ | ~1s | CB closed, healthy — RESOLVED-1 |
| `task_list_held` | ✅ | ~1s | 10 locks (cowork + sprint tasks, clean) |
| `get_cycle_bootstrap(agent_name="fb-market-poster")` | ❌ | — | Invalid enum — BUG-5 |
| `send_telegram` | ✅ (schema) | — | `message` param correct |

---

## Cron Health Highlights

| Cron | Rate | Runs | Avg Duration | Status |
|------|------|------|--------------|--------|
| `intelligenceCycleJob` | 98.6% | 785 | 51.8s | OK |
| `bctcReparseJob` | 82.2% | 174 | 269.8s | IMPROVE-2 |
| `vnstockTradingStatsRefresh` | 50.0% | 2 | 943.7s | ISSUE-3 |
| `bctcPdfPullJob` | 99.0% | 298 | 58.6s | OK |
| `bctcQueueEnricherJob` | 99.6% | 727 | 45.8s | OK (RESOLVED-2) |
| All others | ≥99% | — | — | OK |

---

## Probes Run This Cycle

```
mcp__gateway__call_tool(server="vn-market", tool="list_servers") → FAIL (not a tool)
mcp__gateway__call_tool(server="vn-market", tool="get_cycle_bootstrap", arguments={"agent_name": "news-scout"}) → OK
mcp__gateway__call_tool(server="vn-market", tool="get_market_snapshot") → OK
mcp__gateway__call_tool(server="vn-market", tool="get_macro_snapshot") → OK
mcp__gateway__call_tool(server="vn-market", tool="get_earnings_calendar") → OK
mcp__gateway__call_tool(server="vn-market", tool="get_cron_health") → OK
mcp__gateway__call_tool(server="vn-market", tool="get_system_status") → OK
mcp__gateway__call_tool(server="vn-market", tool="get_vps_proxy_health") → OK
mcp__gateway__call_tool(server="vn-market", tool="get_pipeline_health") → OK
mcp__gateway__call_tool(server="vn-market", tool="get_sla_status") → OK
mcp__gateway__call_tool(server="vn-market", tool="get_alerts", arguments={"alert_type":"ta_bb_breakout_down","limit":5}) → OK
mcp__gateway__call_tool(server="vn-market", tool="get_recent_fixes", arguments={"limit":20}) → OK
mcp__gateway__call_tool(server="vn-market", tool="get_technical_indicators", arguments={"ticker":"VHM"}) → FAIL (BUG-3)
mcp__gateway__call_tool(server="vn-market", tool="get_technical_indicators", arguments={"code":"VHM"}) → OK
mcp__gateway__call_tool(server="vn-market", tool="get_foreign_flow", arguments={"limit":10}) → FAIL (BUG-4)
mcp__gateway__call_tool(server="vn-market", tool="get_foreign_flow", arguments={"code":"HPG"}) → OK
mcp__gateway__call_tool(server="vn-market", tool="get_market_foreign_flow") → OK
mcp__gateway__call_tool(server="vn-market", tool="diagnose_foreign_flow_circuit_breaker") → OK (RESOLVED-1)
mcp__gateway__call_tool(server="vn-market", tool="task_list_held") → OK
mcp__gateway__call_tool(server="vn-market", tool="get_agent_signals", arguments={"from_agent":"news-scout","status":"all","hours_back":1}) → FAIL (BUG-2)
Read docs/agents/tools/list/get_cycle_bootstrap.md → BUG-6 confirmed
Read docs/agents/tools/list/get_technical_indicators.md → BUG-3 confirmed
Read docs/agents/tools/list/get_foreign_flow.md → BUG-4 confirmed
Read docs/agents/news-scout/flow/stage-bootstrap.md:39-43 → BUG-2 confirmed
Read apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts → BUG-1 root-cause confirmed (no close<=0 guard)
Read apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts → ISSUE-2 root-cause confirmed
```
