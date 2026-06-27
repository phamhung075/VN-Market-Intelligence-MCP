# Team MCP Tool Recheck — 2026-06-17T10:07Z

**Agent:** health-recheck (automated)
**Run timestamp:** 2026-06-17T10:07Z
**VN market window:** CLOSED (outside 02:00–08:59 UTC) — market session ended ~08:59Z
**Gateway:** vn-market reachable ✅
**Prior report:** team-tool-recheck-2026-06-17-0610.md

---

## Summary

| Class | Count |
|-------|-------|
| BUG (broken, ≥1 affected caller, re-confirmed) | 7 |
| ISSUE (degraded/slow/misleading, ≥1 affected caller) | 4 |
| IMPROVE (works, quality gap) | 4 |
| FALSE RESOLUTION from prior report | 1 |
| RESOLVED this cycle | 0 |

---

## FALSE RESOLUTION NOTE — Prior RESOLVED-2 (06:10Z) was incorrect

**Prior claim (06:10Z):** bctcQueueEnricher zero-URL loop cleared — "no bctcQueueEnricher errors in recent 10 entries."

**Correction this cycle:** The "recent 10 errors" metric is not a reliable resolution signal. The consecutive_zero_cycles counter has been incrementing continuously: 107 at 04:06Z → 148 at 10:04Z, a delta of +41 over ~6h (consistent with ~15-min cadence). The errors simply fell off the rolling top-10 window due to other transient errors occupying it. The underlying pipeline failure was NEVER resolved.

**Impact:** RESOLVED-2 from 06:10Z is reclassified as a false negative. BUG-7 below reflects current confirmed state.

---

## ACTIVE FINDINGS

### BUG-1 — TA scanner generates false `giá 0` BB-breakout alerts at market open *(unchanged from 06:10Z BUG-1)*

| Field | Detail |
|-------|--------|
| **Tool** | `bbAlertScanJob` (internal), `alertScanParallelJob` |
| **Class** | BUG |
| **Re-probe** | Market closed at probe time (10:07Z) — cannot directly observe false alerts. Prior confirmed at 06:10Z: 9 false `ta_bb_breakout_down` alerts timestamped 02:15 UTC with `giá 0` price, impossible RSI values (VCB 3.7, VPB 5.2). Pattern: `bbAlertScanJob.ts:176` `close = Math.round(lastCandle.close_price)` — no `close <= 0` guard. At 02:15 UTC (first scan after open) partial VPS push leaves `close_price=0` in daily_ohlcv. Carries forward as UNCHANGED per prior confirmed evidence. |
| **Caller-surface** | `bbAlertScanJob.ts:116` (1 caller). alert-commander reads all unnotified alerts via `get_cycle_bootstrap` — false alarms pollute signal bus, risk spurious MARKET channel posts. |
| **Suggested fix** | `apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts` line ~177: add `if (close <= 0) continue;` after `const close = Math.round(lastCandle.close_price)`. Filter `closes` array: `closes.filter(c => c > 0)` before BB20 computation. |

---

### BUG-2 — news-scout `get_agent_signals` missing required `agent` param *(unchanged from 06:10Z BUG-2)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_agent_signals` |
| **Class** | BUG |
| **Re-probe** | `call_tool(tool="get_agent_signals", arguments={"limit": 5})` at 10:04Z → `MCP error -32602: path: ["agent"], message: Required`. CONFIRMED. `docs/agents/news-scout/flow/stage-bootstrap.md:40` still calls `{from_agent: "news-scout", status: "all", hours_back: 6}` — no `agent` field. |
| **Caller-surface** | `grep: docs/agents/news-scout/flow/stage-bootstrap.md:40` — 1 affected caller. SELF_SIGNALS_CACHE load fails every cycle → dedup cache empty → risk of duplicate signals on inter-agent bus. |
| **Suggested fix** | `docs/agents/news-scout/flow/stage-bootstrap.md` line 40: add `"agent": "news-scout"`. Also fix `docs/agents/tools/list/get_agent_signals.md` §Key Notes example (same broken pattern without `agent`). |

---

### BUG-3 — `get_technical_indicators` SSOT doc says `ticker`, live API requires `code` *(unchanged from 06:10Z BUG-3)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_technical_indicators` |
| **Class** | BUG |
| **Re-probe** | `call_tool(tool="get_technical_indicators", arguments={"ticker": "VCB"})` at 10:06Z → `MCP error -32602: path: ["code"], message: Required`. CONFIRMED. |
| **Caller-surface** | `docs/agents/tools/list/get_technical_indicators.md:8` documents `ticker` (SSOT wrong). `docs/agents/tools/package/market-watcher.md:177` example uses `{ ticker: "FPT" }` (wrong). Flow `docs/agents/market-watcher/flow/cycle.md:77` uses `code` correctly. Agents reading SSOT or package example call with `ticker` → hard schema failure. |
| **Suggested fix** | Fix `docs/agents/tools/list/get_technical_indicators.md`: `ticker` → `code`. Fix `docs/agents/tools/package/market-watcher.md:177`: `{ ticker: "FPT" }` → `{ code: "FPT" }`. |

---

### BUG-4 — `get_foreign_flow` SSOT doc says `ticker`, live API requires `code` *(unchanged from 06:10Z BUG-4)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_foreign_flow` |
| **Class** | BUG |
| **Re-probe** | `call_tool(tool="get_foreign_flow", arguments={"ticker": "HPG"})` at 10:06Z → `MCP error -32602: path: ["code"], message: Required`. CONFIRMED. |
| **Caller-surface** | `docs/agents/tools/list/get_foreign_flow.md` SSOT shows `ticker`. `docs/agents/unified-agent/flow/market-analysis.md:30` refs `get_foreign_flow()` without explicit param — relies on SSOT. Any agent reading the SSOT calls with `ticker` and gets schema error. |
| **Suggested fix** | `docs/agents/tools/list/get_foreign_flow.md`: rename `ticker` → `code` in Parameters table and example. |

---

### BUG-5 — fb-market-poster tool package instructs invalid `get_cycle_bootstrap` agent_name *(unchanged from 06:10Z BUG-5)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_cycle_bootstrap` |
| **Class** | BUG |
| **Re-probe** | `call_tool(tool="get_cycle_bootstrap", arguments={"agent_name": "fb-market-poster"})` at 10:04Z → `MCP error -32602: Invalid enum value. Expected 'news-scout' \| 'financial-analyst' \| 'market-watcher' \| 'alert-commander' \| 'digest-predict' \| 'qa-responder' \| 'unified-agent' \| 'report-analyzer' \| 'bctc-analyst', received 'fb-market-poster'`. CONFIRMED. |
| **Caller-surface** | `docs/agents/tools/package/fb-market-poster.md:26` — 1 affected caller (fb-market-poster agent). |
| **Suggested fix** | Remove `get_cycle_bootstrap` row from fb-market-poster.md bootstrap table. Replace with `get_market_snapshot` + `get_market_context` (already listed in fb-market-poster's §Live Market Read Tools section). |

---

### BUG-6 — `get_cycle_bootstrap` SSOT doc missing `bctc-analyst` from enum *(unchanged from 06:10Z BUG-6)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_cycle_bootstrap` |
| **Class** | BUG (doc drift — live schema correct, SSOT stale) |
| **Re-probe** | `call_tool(tool="get_cycle_bootstrap", arguments={"agent_name": "bctc-analyst"})` at 10:04Z → ✅ full response returned. `docs/agents/tools/list/get_cycle_bootstrap.md:4` still lists 8 agents without `bctc-analyst`. Live schema accepts 9 (confirmed via BUG-5 error message listing all 9 valid values including `bctc-analyst`). SSOT stale vs live. |
| **Caller-surface** | `docs/agents/tools/package/bctc-analyst.md:31` documents this call. bctc-analyst runs fine at runtime, but any agent-father/doc-auditor reading the SSOT would incorrectly classify this as invalid. |
| **Suggested fix** | Add `bctc-analyst` to `agents:` array and enum description in `docs/agents/tools/list/get_cycle_bootstrap.md`. |

---

### BUG-7 — bctcQueueEnricher 148 consecutive zero-URL cycles; BCTC SLA breached 802min *(FALSE RESOLUTION from 06:10Z — pipeline continuously failing)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_system_status`, `get_sla_status`, `get_vps_proxy_health` |
| **Class** | BUG |
| **Re-probe** | `get_system_status` at 10:03Z: 10/10 recent errors all bctcQueueEnricher. Pattern: `[WARN] bctcQueueEnricher: 0 URLs found for ticker VEA`, `[WARN] 0 URLs populated across all 9 item(s)`, `[WARN] zero-url-alert: consecutive_zero_cycles=148`. `get_sla_status` at 10:04Z: `bctc \| 802 min \| 360 min SLA \| breached \| CRITICAL`. `get_vps_proxy_health`: `bctc \| 2026-06-16 18:02:24 \| ok \| 0 24h pushes \| YES (stale)`. `get_vps_service_health`: `vn-bctc-fetch \| healthy` — service runs but produces nothing. Counter progression: 107 at 04:06Z → 148 at 10:04Z (+41 over ~6h at 15-min cadence). The 06:10Z RESOLVED-2 verdict was based on the misleading absence of bctcQueueEnricher errors from the top-10 rolling window — the failure was continuous. |
| **Caller-surface** | `bctc-analyst/flow/cycle.md` depends on enriched queue. `refine_bctc_md` depends on PENDING→REFINABLE progression. `bctcPdfPullJob` (99% success, 305 runs) is functioning but queue isn't being enriched with discovery URLs. Q1-2026 BCTC filings pending for BID, GAS, PLX, PPC, VEA, VNH, DAG, DLC, JSH, VDC (10 tickers marked QUÁ HẠN in `get_earnings_calendar`). |
| **Root cause hint** | `vn-bctc-fetch` VPS service status = "healthy" but 0 pushes to bctc channel in 24h. Suggests the VPS service runs but the discovery endpoint (SSC BCTC discover, system-map path `/proxy/bctc-discover/:ticker`) is down or geo-blocked. The `bctcQueueEnricher` resolves URLs via VPS proxy, not direct — if VPS can't reach SSC, enricher gets zero URLs. VEA (active=false per system-map) still included — wastes enricher cycles. |
| **Suggested fix** | (1) Ops: run `trigger_bctc_vps_fetch` to probe VPS BCTC endpoint live. (2) Dev: filter `active: false` tickers (VEA) from bctcQueueEnricher scope. (3) Dev: expose consecutive_zero_cycles metric via `get_vps_proxy_health` so health checks use this directly rather than relying on error-log presence. |

---

## ACTIVE ISSUES

### ISSUE-1 — Reuters RSS + Trading Economics: 32 consecutive failures, never succeeded *(unchanged from 06:10Z)*

| Field | Detail |
|-------|--------|
| **Tools** | `get_system_status` (source health) |
| **Class** | ISSUE |
| **Re-probe** | `get_system_status` at 10:03Z: `Reuters RSS \| Ngưng \| Chưa bao giờ \| 32 ⚠` and `Trading Economics \| Ngưng \| Chưa bao giờ \| 32 ⚠` (×2 instances). Market is closed (10:03Z) so Reuters feeds not expected to work. But "Chưa bao giờ" (never succeeded) in this server session (started 07:13Z) confirms persistent failure. Core SLAs unaffected: price/news/sbv all fresh. |
| **Caller-surface** | news-scout, unified-agent, market-watcher — reduced news source diversity. VPS proxy compensates for most coverage. |
| **Suggested fix** | Disable MCP-internal Reuters/TE scrapers (set `disabled` like newsapi) to stop polluting source health dashboard. Reuters was decommissioned from VPS (fix #7, 2026-04-30) but MCP-internal still active. |

---

### ISSUE-2 — push-prices OHLCV rows rejected by unit guard at market open *(not re-probed — market closed)*

| Field | Detail |
|-------|--------|
| **Tool** | `pushPricesHandler.ts` (internal) |
| **Class** | ISSUE |
| **Re-probe** | Market closed at 10:07Z — rejections occur only during 02:00–02:20 UTC warm-up window. Cannot re-probe. Carries from 06:10Z confirmed evidence (`apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts:214-218`). Shares root cause with BUG-1. |
| **Suggested fix** | Downgrade log from ERROR to WARN within first 20 minutes of market open. Fix VPS side to not push `price=0` rows during warm-up. |

---

### ISSUE-3 — vnstockTradingStatsRefresh 66.7% success rate, avg 915s *(unchanged — still below 80% threshold)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_cron_health` → `vnstockTradingStatsRefresh` |
| **Class** | ISSUE |
| **Re-probe** | `get_cron_health` at 10:04Z: `vnstockTradingStatsRefresh \| last_status: success \| success_rate: 0.67 (66.7%) \| total_runs: 3 \| avg_duration: 915464 ms`. Up from 50% (2 runs) to 66.7% (3 runs) — one successful run added. Still below 80% alert threshold. avg duration 915s (15.3 min) remains extreme. |
| **Suggested fix** | Add per-job timeout (< 10 min). Add per-ticker retry-with-backoff instead of full-job failure. Continue monitoring — escalate to BUG if rate stays below 80% with ≥7 runs. |

---

### ISSUE-4 (NEW) — vn-sbv-fetch VPS service UNHEALTHY but SBV data flowing via proxy

| Field | Detail |
|-------|--------|
| **Tool** | `get_vps_service_health` |
| **Class** | ISSUE |
| **Re-probe** | `get_vps_service_health` at 10:04Z: `vn-sbv-fetch \| unhealthy \| 4m ago \| 0 \| 1h 14m uptime`. BUT `get_vps_proxy_health`: `sbv \| 2026-06-17 09:58:38 \| ok \| 20 24h pushes \| no`. `get_system_status` data freshness: `Tỷ giá SBV \| 4 phút trước \| 0.1h \| v Tốt`. SBV data IS fresh and flowing. VPS service status reports as unhealthy despite successful pushes — similar false-positive pattern to ISSUE-4 from 06:10Z for foreign-flow (decoupled health reporting from actual data push). |
| **Caller-surface** | system-auditor Tier-2 reads `get_vps_service_health` and would flag this as UNHEALTHY — creates alert fatigue. Agents depending on SBV FX rates (market-watcher, macro-indicators) are unaffected (data fresh). |
| **Suggested fix** | `get_vps_service_health` should cross-reference `get_vps_proxy_health` push timestamps. If a push arrived within 2× cadence, override service health to `degraded` (not `unhealthy`). |

---

## IMPROVE

### IMPROVE-1 — chef.md prose uses wrong parameter name `agent_id` vs correct `agent_name` *(NEW this cycle)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_cycle_bootstrap` |
| **Class** | IMPROVE |
| **Re-probe** | `grep "agent_id" docs/agents/unified-agent/flow/chef.md` → line 91: `Call get_cycle_bootstrap(agent_id="unified-agent")`. Tool SSOT `docs/agents/tools/list/get_cycle_bootstrap.md:14` specifies `agent_name` (required). Tool package `docs/agents/tools/package/unified-agent.md:31` correctly shows `agent_name: "unified-agent"`. Flow prose conflicts with both SSOT and package doc. LLM agents following flow prose may call with `agent_id` → hard schema failure ("Required" on `agent_name`). |
| **Caller-surface** | `grep: docs/agents/unified-agent/flow/chef.md:91` — 1 affected file (prose only; package doc correct). Impact depends on whether LLM follows flow prose or package doc for the actual call. |
| **Suggested fix** | `docs/agents/unified-agent/flow/chef.md` line 91: replace `agent_id="unified-agent"` with `agent_name="unified-agent"`. |

---

### IMPROVE-2 — `get_foreign_flow` holding_ratio 0.00% at market open *(unchanged from 06:10Z)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_foreign_flow` |
| **Class** | IMPROVE |
| **Re-probe** | Market closed at 10:07Z — cannot observe intraday row. Carries from 06:10Z: `get_foreign_flow(code="HPG")` at 06:05Z showed `Holding Ratio: 0.00%` during session; prior days 21.46–21.54%. Null-coalesce from prior session row would fix. |
| **Suggested fix** | Carry forward prior-session holding_ratio when intraday row has 0/null. |

---

### IMPROVE-3 — bctcReparseJob 82.1% success rate near 80% alert threshold *(unchanged from 06:10Z)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_cron_health` → `bctcReparseJob` |
| **Class** | IMPROVE |
| **Re-probe** | `get_cron_health` at 10:04Z: `bctcReparseJob \| last_status: success \| 0.82 (82.1%) \| 173 runs \| avg: 268,306ms`. Slightly down from 82.2% to 82.1%, 173 runs (vs 174 at 06:10Z). Alert threshold <80%, current 2.1pp buffer. |
| **Suggested fix** | Per-PDF timeout + retry-with-backoff instead of failing the whole job. |

---

### IMPROVE-4 — VEA (inactive watchlist ticker) still processed by bctcQueueEnricher *(unchanged from prior IMPROVE-3)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_system_status` |
| **Class** | IMPROVE |
| **Re-probe** | `get_system_status` at 10:03Z: `[WARN] bctcQueueEnricher: 0 URLs found for ticker VEA` present in recent errors. `system-map.json`: `VEA \| active: false \| note: Removed sprint-054`. Inflates zero-URL error count, obscures BUG-7 signal. |
| **Suggested fix** | Filter `active: false` tickers from bctcQueueEnricher scope. Or run `bctc_skip_queue_item` for all VEA rows in queue. |

---

## Tool Reachability Summary (this cycle)

| Tool | Reachable | Latency | Notes |
|------|-----------|---------|-------|
| `get_system_status` | ✅ | ~1s | Live — bctcQueueEnricher dominating recent errors |
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ | 8ms | Fast |
| `get_cycle_bootstrap(agent_name="bctc-analyst")` | ✅ | 6ms | Works (SSOT doc wrong — BUG-6) |
| `get_cycle_bootstrap(agent_name="fb-market-poster")` | ❌ | — | Invalid enum — BUG-5 |
| `get_market_snapshot` | ✅ | ~1s | VN-Index 1,806.20, breadth 168↑/129↓ |
| `get_macro_snapshot` | ✅ | ~1s | Live: gold $4346.5, oil $78.77, USD/VND 26113 |
| `get_pipeline_health` | ✅ | ~1s | 41 tickers; 7 TA-not-ready (BDI/DAG/DLC/JSH/SIS/VDC/VNH) |
| `get_cron_health` | ✅ | ~1s | 70+ crons; vnstockTradingStatsRefresh 66.7% — ISSUE-3 |
| `get_vps_proxy_health` | ✅ | ~1s | prices/news/sbv ok; bctc STALE (0 pushes 24h) — BUG-7 |
| `get_vps_service_health` | ✅ | ~1s | vn-sbv-fetch UNHEALTHY (data still flows) — ISSUE-4 |
| `get_sla_status` | ✅ | ~1s | bctc 802min/360min CRITICAL breach — BUG-7 |
| `get_earnings_calendar` | ✅ | ~1s | 10 QUÁ HẠN tickers Q1-2026 |
| `get_rate_limit_status` | ✅ | ~1s | All 11 sources ready, 0 throttled |
| `emit_pressure_state` | ✅ | ~1s | Write tool — schema verified |
| `get_agent_signals(agent="system-auditor")` | ✅ | ~1s | Returns empty (correct) |
| `get_agent_signals({limit:5}, no agent)` | ❌ | — | Missing `agent` — BUG-2 |
| `get_technical_indicators(ticker="VCB")` | ❌ | — | Param must be `code` — BUG-3 |
| `get_foreign_flow(ticker="HPG")` | ❌ | — | Param must be `code` — BUG-4 |
| `get_recent_fixes(limit=20)` | ✅ | ~1s | Last fix: 2026-05-12 |
| `send_telegram` | ✅ (schema) | — | `message` param confirmed correct |

---

## Cron Health Highlights

| Cron | Rate | Runs | Avg Duration | Status |
|------|------|------|--------------|--------|
| `intelligenceCycleJob` | 98.6% | 803 | 51.1s | OK |
| `bctcReparseJob` | 82.1% | 173 | 268.3s | IMPROVE-3 |
| `vnstockTradingStatsRefresh` | 66.7% | 3 | 915.5s | ISSUE-3 |
| `bctcQueueEnricherJob` | 99.6% | 741 | 45.5s | BUG-7 (job runs, produces 0 URLs) |
| `bctcPdfPullJob` | 99.0% | 305 | 57.2s | OK |
| All others | ≥98% | — | — | OK |

---

## Probes Run This Cycle

```
get_system_status → OK (BUG-7 + ISSUE-1 evidence)
get_cycle_bootstrap(agent_name="market-watcher") → OK
get_cycle_bootstrap(agent_name="bctc-analyst") → OK (BUG-6 confirmed live works, SSOT stale)
get_cycle_bootstrap(agent_name="fb-market-poster") → FAIL (BUG-5 confirmed)
get_market_snapshot → OK
get_macro_snapshot → OK
get_pipeline_health → OK
get_cron_health → OK (ISSUE-3 confirmed, BUG-7 enricher counter noted)
get_vps_proxy_health → OK (bctc 0 pushes/24h — BUG-7)
get_vps_service_health → OK (vn-sbv-fetch UNHEALTHY — ISSUE-4)
get_sla_status → OK (bctc 802min CRITICAL — BUG-7)
get_earnings_calendar → OK
get_rate_limit_status → OK (all 11 sources ready)
emit_pressure_state → OK (schema verified write tool)
get_agent_signals(agent="system-auditor") → OK
get_agent_signals({limit:5}) → FAIL (BUG-2 confirmed, missing agent)
get_technical_indicators(ticker="VCB") → FAIL (BUG-3 confirmed)
get_foreign_flow(ticker="HPG") → FAIL (BUG-4 confirmed)
get_recent_fixes(limit=20) → OK
grep agent_id chef.md → IMPROVE-1 confirmed
grep get_cycle_bootstrap docs/agents/**/*.md → caller surface verified
Read prior reports (06:10Z, 04:06Z) → false resolution identified
Read docs/agents/tools/list/get_cycle_bootstrap.md → BUG-6 confirmed
Read docs/agents/unified-agent/flow/chef.md:91 → IMPROVE-1 confirmed
```
