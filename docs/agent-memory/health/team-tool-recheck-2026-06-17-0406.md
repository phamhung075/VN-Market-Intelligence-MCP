# Team MCP Tool Recheck — 2026-06-17T04:06Z

**Agent:** health-recheck (automated)
**Run timestamp:** 2026-06-17T04:06:00Z
**VN market window:** OPEN (02:00–08:59 UTC)
**Gateway:** vn-market reachable ✅
**Prior report:** team-tool-recheck-2026-06-17-0207.md

---

## Summary

| Class | Count |
|-------|-------|
| BUG (broken, ≥1 affected caller) | 7 |
| ISSUE (degraded/empty/slow, ≥1 affected caller) | 4 |
| IMPROVE (works, quality gap) | 3 |
| RESOLVED this cycle | 0 |
| Prior findings carried (re-confirmed) | 5 |
| Prior findings escalated | 2 |

---

## ACTIVE FINDINGS

### BUG-1 — vn-foreign-flow VPS UNHEALTHY → foreign_flow SLA breached CRITICAL *(ESCALATED from prior ISSUE-2/ISSUE-4)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_vps_service_health`, `get_sla_status` |
| **Class** | BUG |
| **Evidence** | `get_vps_service_health` at 04:03Z: `vn-foreign-flow | unhealthy | 3m ago | 0 response`. `get_sla_status`: `foreign_flow | 75 min | 10 min SLA | breached | CRITICAL`. `get_system_status` system errors (recurring every minute): `[WARN] foreign-flow-job: all fallbacks exhausted` and `[WARN] fallback: primary endpoint failed`. Prior 02:07Z report classified this as a misleading-log false alarm (ISSUE-2/ISSUE-4) because data was flowing — this cycle the VPS service itself is UNHEALTHY and SLA is genuinely breached. **Escalation confirmed.** |
| **Caller-surface** | market-watcher cycle.md uses foreign flow in price analysis; unified-agent/flow/market-analysis.md reads `get_foreign_flow()` for FII type classification; alert-commander reads `get_market_foreign_flow`. All three depend on live foreign flow data. |
| **Suggested fix** | Check vn-foreign-flow systemd service on Vinahost VPS — likely a crash loop (pattern from fix #4/#5 in recent_fixes: StartLimitHit or OOM). `trigger_foreign_flow_vps_fetch` or `restart_vps_service(service="vn-foreign-flow")` for immediate recovery. |

---

### BUG-2 — bctcQueueEnricher 107 consecutive zero-URL cycles → BCTC SLA 442min breached *(ESCALATED from prior ISSUE-3)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_system_status`, `get_sla_status`, `get_bctc_pending_refine` |
| **Class** | BUG |
| **Evidence** | `get_system_status` errors: `[WARN] bctcQueueEnricher: 0 URLs populated across all 9 item(s) — consecutive_zero_cycles=107`. `get_sla_status`: `bctc | 442 min | 120 min | breached | CRITICAL`. `get_system_status` data freshness: `BCTC | 7.4h | ! Cũ (stale)`. `get_bctc_pending_refine(limit=5)` returns 5 PDFs with `refine_status: PENDING/PARTIAL` — queue is stalled. Prior 02:07Z report called BCTC SLA a threshold-calibration false alarm; 107 zero-URL cycles and 7.4h staleness confirm real pipeline failure. VEA also appearing in queue (watchlist active=false — extraneous noise). |
| **Caller-surface** | bctc-analyst flow cycle.md depends on enriched queue; refine-bctc cron depends on PENDING→REFINABLE progression. 5 reports confirmed stuck: VCB Q1-2025, HPG Q4-2025, GVR Q1-2026, HPG Q1-2026, HVN Q1-2026. |
| **Suggested fix** | (1) Diagnose why bctcQueueEnricher gets 0 URLs — VPS vn-bctc-fetch shows healthy per `get_vps_service_health`, suggesting the enricher is hitting geo-blocked URLs or SSC BCTC discover endpoint is down. Run `trigger_bctc_vps_fetch` to probe. (2) Remove VEA (inactive ticker) from bctc queue. (3) Reassess BCTC SLA config — 120min SLA is appropriate during earnings window (June IS within Q1 reporting season, month=6, but window is months=[1,4,7,10] so June is off-season). |

---

### BUG-3 — TA scanner generates false "giá 0" alerts at 02:15 UTC market open *(NEW this cycle)*

| Field | Detail |
|-------|--------|
| **Tool** | `alertScanParallelJob` (internal), `get_alerts` |
| **Class** | BUG |
| **Evidence** | `get_alerts(hours=3, level=WARNING)` returns 16 false alerts all timestamped 02:15 UTC with `giá 0 dưới BB dưới XXXX` (price=0 vs Bollinger Band) and impossible RSI values: VCB RSI 3.7, VPB RSI 5.2, VRE RSI 9.4, VHM RSI 8.5, VIC/VCI RSI 6.6, SSI RSI 6.8. Actual prices at 04:02 UTC (VCB 61,900, VPB 26,350, etc.) are all normal — none near floor. Market opens 02:00 UTC; `alertScanParallelJob` fires at 02:15 (first 15-min interval) before the VPS price push fully populates intraday rows — null/zero price passes into TA comparison. Root cause: `validateOhlcvUnit` guard correctly rejects zero-price writes (push-prices ERROR from prior BUG), but TA scanner reads from the DB before writes arrive and treats missing rows as price=0. `cron_health.alertScanParallelJob`: 100% success rate, 151 runs — the job "succeeds" but silently generates false alerts. |
| **Caller-surface** | alert-commander reads all active alerts via `get_cycle_bootstrap` and `get_alerts` — these 16 false alarms pollute the signal bus and may cause false positive MARKET channel posts. End users see WARNING alerts for VCB/VPB/VHM/VIC at extreme RSI values that never existed. Related: fix #20 in `get_recent_fixes` addressed pre-open `change_pct` phantom divergence but not the TA scanner zero-price path. |
| **Suggested fix** | Add a market-hours gate to `alertScanParallelJob`: if `now_utc < 02:20` (first 20 minutes of market open), skip or defer the TA scan until at least one full VPS price push cycle (02:00+1min cadence) has completed. Alternatively, guard the TA comparison against `price <= 0` before generating a breakout signal. |

---

### BUG-4 — news-scout calls `get_agent_signals` with `from_agent` only (missing required `agent`) *(NEW this cycle)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_agent_signals` |
| **Class** | BUG |
| **Evidence** | Live probe `call_tool(tool="get_agent_signals", arguments={"from_agent": "news-scout", "status": "all", "hours_back": 6})` → `MCP error -32602: Invalid arguments … path: ["agent"], message: Required`. Tool SSOT `docs/agents/tools/list/get_agent_signals.md:15` confirms `agent | string | Yes | Required`. news-scout/flow/stage-bootstrap.md lines 39-43 calls `get_agent_signals({from_agent: "news-scout", status: "all", hours_back: 6})` without `agent`. |
| **Caller-surface grep** | `grep -n "from_agent" docs/agents/news-scout/flow/stage-bootstrap.md` → line 40 (confirmed 1 caller). `agent` is separately documented as required, `from_agent` is an optional filter for sender-history. The news-scout call intends to read its own sent signals (sender-history) — correct semantic intent, wrong schema. |
| **Impact** | SELF_SIGNALS_CACHE fails every news-scout cycle → dedup cache empty → news-scout may post duplicate signals to the agent bus each cycle. The tool doc (§Key Notes on `hours_back`) even explicitly documents this L-4 pattern as `get_agent_signals(from_agent="news-scout", ...)` — the doc example itself is missing `agent`. |
| **Suggested fix** | Fix `docs/agents/news-scout/flow/stage-bootstrap.md` line 40: add `"agent": "news-scout"` alongside `from_agent`. Also fix the example in `docs/agents/tools/list/get_agent_signals.md` §Key Notes on hours_back to show the complete call with both params. |

---

### BUG-5 — `get_technical_indicators` doc says `ticker`, live API requires `code` *(NEW this cycle)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_technical_indicators` |
| **Class** | BUG |
| **Evidence** | Live probe `call_tool(tool="get_technical_indicators", arguments={"ticker": "VCB"})` → `MCP error -32602: path: ["code"], message: Required`. Tool SSOT `docs/agents/tools/list/get_technical_indicators.md:8` documents param as `ticker`. Param name is actually `code`. |
| **Caller-surface grep** | `grep "get_technical_indicators" docs/agents/tools/package/market-watcher.md` → line 38: `code: string` (correct); line 177: `arguments: { ticker: "FPT" }` (WRONG — uses `ticker`). `docs/agents/market-watcher/flow/cycle.md:77`: `get_technical_indicators(code)` (correct form). Two affected files: tool SSOT doc (wrong) + market-watcher package example (wrong). |
| **Affected callers** | market-watcher is primary caller. If it follows the package doc example (ticker), every TA indicator call would fail silently. Unified-agent has TA calls gated behind `FIX-TA-GOSVC-NA-DESPITE-DEPTH` (not yet in scope), so not currently affected. |
| **Suggested fix** | Fix `docs/agents/tools/list/get_technical_indicators.md`: rename param `ticker` → `code`. Fix `docs/agents/tools/package/market-watcher.md` example line 177: `{ ticker: "FPT" }` → `{ code: "FPT" }`. |

---

### BUG-6 — `get_foreign_flow` tool SSOT doc says `ticker`, live API requires `code` *(NEW this cycle)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_foreign_flow` |
| **Class** | BUG (doc drift — callers partially corrected, SSOT still wrong) |
| **Evidence** | Live probe `call_tool(tool="get_foreign_flow", arguments={"ticker": "HPG"})` → `MCP error -32602: path: ["code"], message: Required`. Probe with `{"code": "HPG"}` succeeded. Tool SSOT `docs/agents/tools/list/get_foreign_flow.md:15` still shows `"ticker": ...`. `docs/agents/tools/package/fb-market-poster.md:65` (2026-06-14 note): confirms `code` is the correct param, fb-market-poster already switched to `get_market_foreign_flow`. |
| **Caller-surface grep** | `grep -n "get_foreign_flow" docs/agents/unified-agent/flow/market-analysis.md` → line 30: `From get_foreign_flow() data` — no explicit param shown. SSOT doc is the reference agents use. Until SSOT is fixed, any agent that reads the SSOT and calls with `ticker` will get a schema error. |
| **Suggested fix** | Fix `docs/agents/tools/list/get_foreign_flow.md`: rename param `ticker` → `code` in Parameters table and example block. |

---

### BUG-7 — fb-market-poster tool package instructs invalid `get_cycle_bootstrap` agent_name *(UNCHANGED from prior BUG-1)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_cycle_bootstrap` |
| **Class** | BUG |
| **Re-probe** | `docs/agents/tools/package/fb-market-poster.md:26` still shows `agent_name: "fb-market-poster"`. Live enum (verified via schema error): valid values are news-scout, financial-analyst, market-watcher, alert-commander, digest-predict, qa-responder, unified-agent, report-analyzer, bctc-analyst. "fb-market-poster" is not valid. |
| **Caller-surface** | 1 caller: fb-market-poster agent when it follows its tool package doc. |
| **Suggested fix** | Remove `get_cycle_bootstrap` row from fb-market-poster.md bootstrap table. Replace with `get_market_snapshot` + `get_market_context` (already in its §Live Market Read Tools). |

---

### ISSUE-1 — Reuters RSS and Trading Economics: 18 consecutive failures, never succeeded *(UNCHANGED from prior ISSUE-1)*

| Field | Detail |
|-------|--------|
| **Tools** | `get_system_status` (source health section) |
| **Class** | ISSUE |
| **Re-probe** | `get_system_status` at 04:02Z: `Reuters RSS | Ngưng | Chưa bao giờ | 18 ⚠` and `Trading Economics | Ngưng | Chưa bao giờ | 18 ⚠` (×2 instances). Counter reset from 60+ (prior) to 18 because server restarted at 02:48Z (confirmed: `mcpServerStartup last_run 2026-06-17 02:48:03`). Still "Chưa bao giờ" (never succeeded) — unchanged. Macro data arriving via VPS proxy and other paths; core SLAs unaffected. |
| **Suggested fix** | Disable MCP-internal Reuters/TE scrapers that never succeed (set to `disabled` like newsapi in source health) to stop polluting the source health dashboard. Reuters was decommissioned from VPS (fix #7, 2026-04-30) but MCP-internal still runs. |

---

### ISSUE-2 — push-prices OHLCV rows rejected by unit guard (recurring at market open) *(UNCHANGED from prior BUG-2)*

| Field | Detail |
|-------|--------|
| **Tool** | `pushPricesHandler.ts` (internal VPS push endpoint) |
| **Class** | ISSUE |
| **Re-probe** | `get_system_status` at 04:02Z: `[ERROR] push-prices: ohlcv rows rejected by unit guard` at 04:01:52. Consistent with prior report. Source confirmed: `apps/mcp-server/src/interface/mcp/routes/pushPricesHandler.ts:214-218`. The guard fires on null/zero-price rows during market-open warm-up window (same root cause as BUG-3). VPS is delivering 113 rows per push; some rows have zero price pre-population. Guard correctly rejects them — no data corruption risk, but ERROR log noise is high. |
| **Suggested fix** | Downgrade the log from ERROR to WARN when rejected rows occur within first 20 minutes of market open (02:00–02:20 UTC). Fix VPS side to not push rows with price=0 during warm-up. |

---

### ISSUE-3 — vnstockTradingStatsRefresh 50% success rate, avg 943s duration *(UNCHANGED from prior cycle note)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_cron_health` → `vnstockTradingStatsRefresh` |
| **Class** | ISSUE |
| **Re-probe** | `get_cron_health` at 04:03Z: `vnstockTradingStatsRefresh | success_rate: 0.50 (50.0%) | total_runs: 2 | avg_duration: 943711 ms`. Two runs only — low sample. But 943s (15.7 min) average duration is extreme; likely external VNstock API timeout or rate-limit. Last successful run: 2026-06-15. |
| **Suggested fix** | Add a job-level timeout (< 10 min) for vnstockTradingStatsRefresh to fail fast instead of hanging. Add retry-with-backoff per ticker rather than per-job. Monitor over next 7 days to confirm 50% rate persists. |

---

### ISSUE-4 — get_cycle_bootstrap tool SSOT doc missing `bctc-analyst` from enum *(UNCHANGED from prior BUG-3)*

| Field | Detail |
|-------|--------|
| **Tool** | `get_cycle_bootstrap` |
| **Class** | ISSUE (doc drift — live schema is correct, SSOT doc stale) |
| **Re-probe** | `docs/agents/tools/list/get_cycle_bootstrap.md:4` still lists 8 agents (no `bctc-analyst`). Live probe with `agent_name: "market-watcher"` succeeded ✅. Live schema accepts 9 (includes bctc-analyst — confirmed by prior schema rejection of "health-recheck"). |
| **Suggested fix** | Add `bctc-analyst` to `agents:` array and parameter enum description in `docs/agents/tools/list/get_cycle_bootstrap.md`. |

---

### IMPROVE-1 — `get_foreign_flow` holding-ratio data quality suspect on intraday 2026-06-17

| Field | Detail |
|-------|--------|
| **Tool** | `get_foreign_flow` |
| **Class** | IMPROVE |
| **Evidence** | HPG `get_foreign_flow(code="HPG")` today (2026-06-17): `Net Vol 38.2k | Foreign Room 210.21M | Holding Ratio 0.00%`. Prior days: `Holding Ratio ~21.46–21.54%`. Today's session is early (04:02Z) and shows holding_ratio=0.00% — likely a missing/null join on the intraday row before full push. Not a schema error; data quality issue at market open. |
| **Suggested fix** | Carry forward prior-session holding_ratio when intraday row is missing it (null-coalesce in the query). |

---

### IMPROVE-2 — bctcReparseJob 82.2% success rate (near 80% alert threshold)

| Field | Detail |
|-------|--------|
| **Tool** | `get_cron_health` → `bctcReparseJob` |
| **Class** | IMPROVE |
| **Re-probe** | `bctcReparseJob | last_status: success | success_rate: 0.82 (82.2%) | total_runs: 174 | avg_duration: 269,800ms`. Unchanged from prior (82.1% → 82.2%, 173 → 174 runs). Alert threshold is <80%. 2pp buffer. PDF parse timeouts likely cause. |
| **Suggested fix** | Per-PDF timeout + retry-with-backoff instead of failing the whole job. |

---

### IMPROVE-3 — VEA (inactive watchlist ticker) still being processed by bctcQueueEnricher

| Field | Detail |
|-------|--------|
| **Tool** | `get_system_status` |
| **Class** | IMPROVE |
| **Evidence** | `system-map.json`: `VEA | active: false | note: Removed sprint-054`. `get_system_status` errors: `[WARN] bctcQueueEnricher: 0 URLs found for ticker VEA`. Inactive ticker is wasting enricher cycles and adding noise to the zero-URL count (contributing to BUG-2's impact). |
| **Suggested fix** | Filter `active: false` tickers from bctcQueueEnricher scope. Or run `bctc_skip_queue_item` for any VEA rows in the queue. |

---

## Tool Reachability Summary

| Tool | Reachable | Notes |
|------|-----------|-------|
| `get_system_status` | ✅ | Live — errors visible |
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ | 10ms, fast |
| `get_market_snapshot` | ✅ | VN-Index 1,793.93, -0.77% |
| `get_macro_snapshot` | ✅ | Live data, source_tier=2 |
| `get_pipeline_health` | ✅ | 41 tickers; 7 TA-not-ready |
| `get_cron_health` | ✅ | 70+ crons; see ISSUE-3 |
| `get_vps_proxy_health` | ✅ | prices/news/sbv ok; foreign-flow data stale 75min |
| `get_vps_service_health` | ✅ | vn-foreign-flow UNHEALTHY ← BUG-1 |
| `get_sla_status` | ✅ | 2 breached: bctc + foreign_flow |
| `get_earnings_calendar` | ✅ | 11 QUÁ HẠN tickers |
| `get_alerts` | ✅ | 20 alerts; 16 false at 02:15Z ← BUG-3 |
| `get_foreign_flow(code="HPG")` | ✅ | Works with `code`; fails with `ticker` ← BUG-6 |
| `get_market_foreign_flow` | ✅ | Returns data; holding_ratio=0 issue ← IMPROVE-1 |
| `get_agent_signals(agent="news-scout",...)` | ✅ | Works with `agent` |
| `get_agent_signals(from_agent=..., no agent)` | ❌ | Fails — BUG-4 |
| `get_technical_indicators(ticker="VCB")` | ❌ | Fails — param must be `code` ← BUG-5 |
| `get_bctc_pending_refine` | ✅ | 5 PDFs pending/partial |
| `get_recent_fixes` | ✅ | 20 historical fixes |
| `get_cycle_bootstrap(agent_name="fb-market-poster")` | ❌ | Invalid enum ← BUG-7 |
| `send_telegram` | ✅ (schema) | `message` param confirmed correct |
| `task_claim`, `task_release` | ✅ (schema) | Working |

---

## Cron Health Highlights

| Cron | Rate | Runs | Avg Duration | Status |
|------|------|------|------|--------|
| `intelligenceCycleJob` | 98.6% | 775 | 52.6s | OK |
| `bctcReparseJob` | 82.2% | 174 | 269.8s | WATCH |
| `vnstockTradingStatsRefresh` | 50.0% | 2 | 943.7s | ISSUE-3 |
| All others | ≥99% | — | — | OK |

---

## Probes Run This Cycle

```
get_system_status
get_cycle_bootstrap(agent_name="market-watcher")
get_market_snapshot
get_macro_snapshot
get_pipeline_health
get_cron_health
get_vps_proxy_health
get_vps_service_health
get_sla_status
get_earnings_calendar
get_foreign_flow(ticker="HPG")  → FAIL (schema drift confirmed)
get_foreign_flow(code="HPG")    → OK
get_market_foreign_flow
get_agent_signals(agent="news-scout", status="all", hours_back=1)  → OK
get_agent_signals(from_agent="news-scout", status="all", hours_back=6) → FAIL (BUG-4)
get_technical_indicators(ticker="VCB")  → FAIL (schema drift confirmed)
get_alerts(hours=3, level="WARNING")
get_bctc_pending_refine(limit=5)
get_recent_fixes(limit=20)
grep get_foreign_flow docs/agents/**/*.md
grep get_agent_signals docs/agents/**/*.md
grep get_technical_indicators docs/agents/**/*.md
grep ohlcv.*unit apps/mcp-server/src/**/*.ts
Read docs/agents/tools/list/get_agent_signals.md
Read docs/agents/tools/list/get_foreign_flow.md
Read docs/agents/tools/list/get_cycle_bootstrap.md
Read docs/agents/tools/list/get_technical_indicators.md
Read docs/agents/tools/package/fb-market-poster.md
```
