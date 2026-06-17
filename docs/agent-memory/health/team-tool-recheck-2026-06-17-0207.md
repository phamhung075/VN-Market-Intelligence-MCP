# Team MCP Tool Recheck — 2026-06-17T02:07Z

**Agent:** health-recheck (automated)
**Run timestamp:** 2026-06-17T02:07:01Z
**VN market window:** OPEN (02:00–08:59 UTC)
**Gateway:** vn-market reachable ✅

---

## Summary

| Class | Count |
|-------|-------|
| BUG (broken, ≥1 affected caller) | 3 |
| ISSUE (degraded/misleading, ≥1 affected caller) | 4 |
| IMPROVE (works, quality gap) | 2 |
| RESOLVED (not reproduced this cycle) | 0 |

---

## ACTIVE FINDINGS

### BUG-1 — fb-market-poster tool package instructs get_cycle_bootstrap with invalid agent_name

| Field | Detail |
|-------|--------|
| **Tool** | `get_cycle_bootstrap` |
| **Class** | BUG |
| **Evidence** | `docs/agents/tools/package/fb-market-poster.md:26` documents `get_cycle_bootstrap(agent_name: "fb-market-poster")`. Live schema rejects with `invalid_enum_value` — valid set is: news-scout, financial-analyst, market-watcher, alert-commander, digest-predict, qa-responder, unified-agent, report-analyzer, bctc-analyst. Probe this cycle: `MCP error -32602: Invalid arguments … received 'health-recheck'` (same pattern). |
| **Caller-surface grep** | `grep "get_cycle_bootstrap" docs/agents/tools/package/fb-market-poster.md` → line 26 confirms `agent_name: "fb-market-poster"`. Test `apps/mcp-server/src/__tests__/1975-bootstrap-enum-bctc-analyst-guard.test.ts:74-75` explicitly lists fb-market-poster in `NON_BOOTSTRAP_COWORK` set with comment "fb-market-poster does not call get_cycle_bootstrap per skill manifest". **Contradiction: tool package doc says to call it; code+test says not to.** |
| **Affected callers** | 1 (fb-market-poster agent, when it follows its tool package doc) |
| **Suggested fix** | Remove `get_cycle_bootstrap` from `docs/agents/tools/package/fb-market-poster.md` bootstrap table. Replace with `get_market_snapshot` + `get_market_context` (already in its Live Market Read Tools section). The test is the SSOT — the doc must align with it. |

---

### BUG-2 — push-prices ohlcv rows rejected by unit guard (recurring, market-hours)

| Field | Detail |
|-------|--------|
| **Tool / Path** | `pushPricesHandler.ts` (internal VPS push endpoint) |
| **Class** | BUG |
| **Evidence** | `get_system_status` at 02:03Z shows recurring `[ERROR] push-prices: ohlcv rows rejected by unit guard` at 02:01, 02:02, 02:03 UTC (every minute during market open). Source: `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts:214-218` — fires when `ohlcvResult.rejected.length > 0`. VPS proxy delivers 86–92 price rows per push (confirmed via `get_vps_proxy_health`) but some rows are failing `validateOhlcvUnit`. |
| **Caller-surface grep** | `grep "unit.guard\|unitGuard\|rejected" apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts` → line 214-218 confirmed. Tests: `apps/mcp-server/src/__tests__/unit/ohlcvUnitGuard.test.ts`, `1987-contam2-push-prices-ohlcv-guard.test.ts`. |
| **Affected callers** | All agents reading intraday prices: `get_market_snapshot`, `get_price_history`, `get_technical_indicators` — market-watcher, news-scout, unified-agent, alert-commander. Actual observable price data shows live (market_context has prices at 02:04), but rejected rows represent gaps in the intraday OHLCV series. |
| **Suggested fix** | Inspect `ohlcvResult.rejected` samples (first 3 are logged at ERROR level in mcp-server logs). Common causes from test suite: price=0, volume=0, future date, duplicate intraday bar. If the VPS consistently sends invalid rows, fix the VPS-side normalizer or tighten the unit guard error to capture ticker+value for triage. |

---

### BUG-3 — get_cycle_bootstrap tool SSOT doc missing `bctc-analyst` from enum

| Field | Detail |
|-------|--------|
| **Tool** | `get_cycle_bootstrap` |
| **Class** | BUG (doc drift — live schema is correct, doc is stale) |
| **Evidence** | `docs/agents/tools/list/get_cycle_bootstrap.md:4` lists 8 agents in `agents:` array — `bctc-analyst` absent. Live Zod schema accepts 9: includes `bctc-analyst`. Live probe this cycle with `agent_name: "market-watcher"` succeeded ✅. `bctc-analyst` uses this tool per `docs/agents/tools/package/bctc-analyst.md`. |
| **Caller-surface grep** | `grep "get_cycle_bootstrap" docs/agents/tools/package/bctc-analyst.md` — file is in the grep result set (17 files). |
| **Affected callers** | bctc-analyst (uses the tool successfully via live schema, but the SSOT doc omits it — future doc readers/agents may be confused). |
| **Suggested fix** | Add `bctc-analyst` to `agents:` array and parameter enum description in `docs/agents/tools/list/get_cycle_bootstrap.md`. |

---

### ISSUE-1 — Reuters RSS + Trading Economics persistent source failures (60+ consecutive errors)

| Field | Detail |
|-------|--------|
| **Tools** | `get_system_status` (source health section) |
| **Class** | ISSUE (degraded data quality) |
| **Evidence** | `get_system_status` at 02:03Z: `Reuters RSS | Ngưng | Chưa bao giờ | 60 ⚠` and `Trading Economics | Ngưng | Chưa bao giờ | 60-61 ⚠` — never successfully fetched, 60+ failures each. Core SLAs are NOT broken: `get_sla_status` shows price/news/sbv_fx/foreign_flow all OK. `get_macro_snapshot` returns live data (gold, oil, USD/VND). Circuit breakers: `tradingEconomics [OK]` (0 failures). Macro data IS arriving via VPS proxy and other paths. |
| **Caller-surface grep** | Agents using macro/news data: news-scout, unified-agent (chef), market-watcher. Core pipelines unaffected per SLA status. |
| **Affected callers** | Degraded coverage: Reuters news absent; TE direct scraper absent (VPS macro proxy compensates). |
| **Suggested fix** | These scrapers appear chronically broken (history in `get_recent_fixes` #7: Reuters was "decommissioned" 2026-04-30 from VPS but MCP-internal Reuters RSS still runs+fails). Either: (a) Disable the MCP-internal Reuters/TE scrapers that consistently fail (set them to disabled like newsapi) to stop polluting source health dashboard; or (b) fix the underlying fetch URLs. |

---

### ISSUE-2 — foreign-flow fallback "all exhausted" errors during market hours (false-error)

| Field | Detail |
|-------|--------|
| **Tools** | `get_system_status` (recent errors), `get_vps_proxy_health` |
| **Class** | ISSUE (misleading error logging — no actual data loss) |
| **Evidence** | `get_system_status` at 02:02Z, 02:03Z: `[WARN] foreign-flow-job: all fallbacks exhausted` and `[WARN] fallback: primary endpoint failed`. Yet `get_vps_proxy_health` at 02:03Z shows `foreign-flow | ok | 102 items`. `get_sla_status` shows `foreign_flow | 3 min | 10 min SLA | ok`. Data IS arriving — the fallback chain's primary (non-VPS) endpoint fails, causing misleading "exhausted" logs even though the VPS path succeeds. |
| **Affected callers** | system-auditor reads `get_system_status` errors — this creates false CRITICAL triggers when the auditor sees "all fallbacks exhausted" and counts it as a hard failure. Also adds noise to the 47 open warning count. |
| **Suggested fix** | Fix the fallback logger to distinguish "all paths exhausted including VPS" from "primary failed, VPS succeeded". The log message should be downgraded to INFO (or suppressed) when the VPS push confirms data arrived. |

---

### ISSUE-3 — BCTC SLA threshold mismatch: get_sla_status CRITICAL vs get_system_status normal

| Field | Detail |
|-------|--------|
| **Tools** | `get_sla_status`, `get_system_status` |
| **Class** | ISSUE (conflicting status signals confuse system-auditor) |
| **Evidence** | `get_sla_status` at 02:03Z: `bctc | 322 min | 120 min | breached | CRITICAL`. `get_system_status` data freshness: `BCTC | 5.4h | Bình thường (Normal)`. `bctcPdfPullJob` cron: 99% success rate, 30-min schedule, last run 02:00Z. `bctcQueueEnricherJob`: 99.6% success rate. BCTC data pipeline is healthy — the 120 min SLA threshold in `get_sla_status` is too tight for BCTC which has a 30-min pull cadence and only significant updates during earnings windows (June 17 is outside the Q1 earnings window: trigger_months=[1,4,7,10], D=17 > window_days=14). |
| **Affected callers** | system-auditor Tier-2 reads `get_sla_status` and would fire a CRITICAL BUG-channel alert for BCTC. Real operators seeing this alert would investigate a non-existent outage. |
| **Suggested fix** | `get_sla_status` BCTC threshold should match the same SLA resolver logic used by system-auditor: out-of-earnings-window = 168h threshold (from system-map.json), not 120 min. The two tools need to share the same SLA config source. |

---

### ISSUE-4 — get_vps_service_health false-positive "unhealthy" for price-fetch and foreign-flow

| Field | Detail |
|-------|--------|
| **Tools** | `get_vps_service_health` |
| **Class** | ISSUE (misleading status — no data loss) |
| **Evidence** | `get_vps_service_health` at 02:04Z: `vn-foreign-flow: unhealthy (uptime 10h 57m)`, `vn-price-fetch: unhealthy (uptime 29m)`. Simultaneously `get_vps_proxy_health` shows both delivering data: prices at 02:03Z (92 items), foreign-flow at 02:03Z (102 items). The VPS fetch services are cron-like (start→run→push→exit), so "process not running" ≠ "service unhealthy". Short uptime (29m) just means the service restarted recently — normal for a job-runner pattern. |
| **Affected callers** | system-auditor Tier-2 calls `get_vps_service_health` and interprets "unhealthy" as a CRITICAL signal (ISSUE-3 in `docs/agents/tools/package/system-auditor.md`). Results in false-positive BUG channel alerts. Known recurring pattern (per `get_recent_fixes` #8/#9 — VPS "unhealthy" while data flows). |
| **Suggested fix** | `get_vps_service_health` should cross-reference recent push timestamps from `get_vps_proxy_health`. If a service is "process-down" but pushed data within last 2× expected cadence, status should be `idle` or `ok`, not `unhealthy`. System-auditor should preferentially use `get_vps_proxy_health` for data-flow validation. |

---

### IMPROVE-1 — market-watcher log_agent_work: null summary/findings in off-hours cycles

| Field | Detail |
|-------|--------|
| **Tool** | `log_agent_work` |
| **Class** | IMPROVE |
| **Evidence** | `get_agent_work_log(agent_name="market-watcher", limit=5)`: ids 1395 (2026-06-16 00:08, 4s), 1398 (2026-06-16 00:11, 4s), 1404 (2026-06-16 16:25, 112s) all show `summary: null, findings: null, actions_json: null`. Only id 1387 (EOD cycle, 2 min) has full fields. Off-hours cycles exit quickly and skip summary population. |
| **Suggested fix** | Even fast-exit cycles should write a minimal summary: `"off-hours cycle: N tickers checked, 0 anomalies"`. This improves observability with no cost — the two-call pattern already requires Call 2; just populate the `summary` field. |

---

### IMPROVE-2 — bctcReparseJob at 82.1% success rate (173 runs, worth monitoring)

| Field | Detail |
|-------|--------|
| **Tool** | `get_cron_health` → `bctcReparseJob` |
| **Class** | IMPROVE |
| **Evidence** | `bctcReparseJob` success_rate=0.82, total_runs=173, avg_duration=271,360 ms (~4.5 min). Alert threshold is <80%. Currently 82.1% — 2pp above threshold. 18% failure rate over 173 runs = ~31 failed runs. Last run: 2026-06-16 20:17 (success). |
| **Suggested fix** | Investigate the 31 failed runs — likely BCTC PDF parse timeouts (avg 4.5 min is very long). If timeout is the cause, consider raising the job timeout or adding retry-with-backoff for individual PDF failures instead of failing the whole job. |

---

## Tool Reachability Summary

| Tool | Reachable | Latency (observed) | Notes |
|------|-----------|--------------------|-------|
| `get_system_status` | ✅ | ~1s | Live |
| `get_cycle_bootstrap` (valid agent) | ✅ | 51ms | Fast parallel call |
| `get_market_snapshot` | ✅ | ~1s | VN-Index 1,806.48 |
| `get_macro_snapshot` | ✅ | ~1s | Live data |
| `get_pipeline_health` | ✅ | ~1s | 30 non-neutral TA signals |
| `get_cron_health` | ✅ | ~1s | 70+ crons healthy |
| `get_vps_proxy_health` | ✅ | ~1s | All 4 services ok |
| `get_rate_limit_status` | ✅ | ~1s | All 14 sources ready |
| `get_sla_status` | ✅ | ~1s | 1 breach (BCTC — see ISSUE-3) |
| `get_vps_service_health` | ✅ | ~1s | 2 false-unhealthy (see ISSUE-4) |
| `get_earnings_calendar` | ✅ | ~1s | 12 overdue Q1-2026 |
| `task_list_held` | ✅ | ~1s | 0 orphan locks (clean) |
| `get_watchlist` | ✅ | ~1s | 41 tickers live |
| `get_alerts` | ✅ | ~1s | Working |
| `get_market_context` | ✅ | ~1s | Live prices |
| `get_technical_indicators` | ✅ | ~1s | VCB returned |
| `get_agent_work_log` | ✅ | ~1s | Working |
| `get_recent_fixes` | ✅ | ~1s | Working |
| `send_telegram` | ✅ (schema verified) | — | param=`message` ✅ |
| `post_agent_signal` | ✅ (schema verified) | — | Working |
| `task_claim` / `task_release` | ✅ (schema verified) | — | Working |
| `get_cycle_bootstrap` (fb-market-poster) | ❌ | — | enum rejection — BUG-1 |

---

## Cron Health Highlights

- **intelligenceCycleJob**: status=`running` at probe time (normal — long-running job)
- **bctcReparseJob**: 82.1% success rate — monitor (IMPROVE-2)
- **vnstockTradingStatsRefresh**: 50.0% success rate (2 runs only — too early to classify)
- All other crons: ≥98% success rate

---

## Probe Commands Run This Cycle

```
mcp__gateway__call_tool(server="vn-market", tool="get_system_status")
mcp__gateway__call_tool(server="vn-market", tool="get_cycle_bootstrap", agent_name="market-watcher")
mcp__gateway__call_tool(server="vn-market", tool="get_market_snapshot")
mcp__gateway__call_tool(server="vn-market", tool="get_macro_snapshot")
mcp__gateway__call_tool(server="vn-market", tool="get_pipeline_health")
mcp__gateway__call_tool(server="vn-market", tool="get_cron_health")
mcp__gateway__call_tool(server="vn-market", tool="get_vps_proxy_health")
mcp__gateway__call_tool(server="vn-market", tool="get_rate_limit_status")
mcp__gateway__call_tool(server="vn-market", tool="get_sla_status")
mcp__gateway__call_tool(server="vn-market", tool="get_vps_service_health")
mcp__gateway__call_tool(server="vn-market", tool="get_earnings_calendar")
mcp__gateway__call_tool(server="vn-market", tool="task_list_held", expired=true)
mcp__gateway__call_tool(server="vn-market", tool="get_watchlist")
mcp__gateway__call_tool(server="vn-market", tool="get_alerts", limit=5)
mcp__gateway__call_tool(server="vn-market", tool="get_recent_fixes", limit=10)
mcp__gateway__call_tool(server="vn-market", tool="get_agent_work_log", agent_name="market-watcher", limit=5)
mcp__gateway__call_tool(server="vn-market", tool="get_technical_indicators", code="VCB")
mcp__gateway__call_tool(server="vn-market", tool="get_market_context")
grep "get_cycle_bootstrap" docs/agents/tools/package/fb-market-poster.md
grep "fb-market-poster" apps/mcp-server/src/__tests__/1975-bootstrap-enum-bctc-analyst-guard.test.ts
grep "unit.guard" apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts
```
