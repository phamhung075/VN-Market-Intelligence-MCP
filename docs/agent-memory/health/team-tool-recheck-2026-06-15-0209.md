# Team MCP Tool Health Recheck — 2026-06-15 02:09 UTC

**Run by:** health-recheck-agent (cloud session)  
**Gateway:** `vn-market` via `mcp__gateway__call_tool` — REACHABLE ✅  
**Probed:** 2026-06-15 02:04–02:09 UTC (VN market OPEN window)

---

## ACTIVE FINDINGS (re-confirmed this cycle)

### BUGS

| # | Tool | Class | Evidence (this cycle) | Caller count | Suggested fix |
|---|------|-------|-----------------------|--------------|---------------|
| B1 | `get_technical_indicators` | BUG | Returns ALL N/A (RSI/MACD/BB/MA) for every tested ticker (VCB, HPG, FPT) at `source_tier:3`. Pipeline health simultaneously shows VCB rows=38 RSI14=43.8, HPG rows=38 RSI14=24.6 — data EXISTS in TA service but MCP tool silently falls to empty tier-3 response. Tool doc SSOT says `ticker` param; live tool requires `code` (callers correctly use `code`). | **1 direct caller:** `market-watcher/flow/cycle.md:77` uses `get_technical_indicators(code)` for every watchlist ticker at Step 1 — entire TA step is blind | dev-technical-analysis: investigate why MCP→TA service call returns no data when `/pipeline` health endpoint confirms rows and RSI. Likely a routing/endpoint mismatch between `get_technical_indicators` MCP handler and the daily_ohlcv table path. Also fix tool doc param name: `ticker` → `code`. |
| B2 | `get_foreign_flow` | BUG | `get_foreign_flow({})` → MCP error -32602: "Required" for `code`. Live tool requires `code: string` (per-ticker). Two agent flows call with no args: `fb-market-poster/flow/main.md:78` and `unified-agent/flow/market-analysis.md:30`. Market-wide equivalent `get_market_foreign_flow({})` works and likely matches intent. | **2 callers broken:** fb-market-poster main.md:78 (`arguments={}`); unified-agent market-analysis.md:30 (`get_foreign_flow()`). fb-market-poster.md package:55 also documents wrong call pattern. | dev-mcp-server: fix callers to use `get_market_foreign_flow({})` for market-wide flow (no params). Per-ticker flow requires `code`. Update `fb-market-poster/flow/main.md`, `unified-agent/flow/market-analysis.md`, `fb-market-poster.md` tool package. Also fix tool doc: `get_foreign_flow.md` says `ticker`, live requires `code`. |

### ISSUES

| # | Tool / System | Class | Evidence (this cycle) | Caller count | Suggested fix |
|---|--------------|-------|-----------------------|--------------|---------------|
| I1 | BCTC VPS pipeline | ISSUE | `get_sla_status`: bctc = 1206 min vs 120 min SLA → CRITICAL alert active. `get_vps_proxy_health`: bctc STALE=YES, last push 2026-06-13 23:45:12 (~26h ago). `get_vps_service_health`: vn-bctc-fetch reports healthy. Data is stuck between VPS service and push endpoint. | bctc-analyst, system-auditor, refine_bctc_md depend on fresh BCTC data | ops/dev-vps-crawls: diagnose why vn-bctc-fetch service is healthy but not pushing. Check VPS-side BCTC queue and push log. Trigger `trigger_bctc_vps_fetch` if safe. |
| I2 | Reuters RSS | ISSUE | `get_system_status` source health: "Ngưng" (stopped), 38 consecutive errors, "Chưa bao giờ" (never fetched). Already decommissioned (fix #7 removed vn-reuters-fetch.service) but still generating error entries. | news-scout, unified-agent (news context) | dev-mcp-server: remove or disable Reuters RSS circuit breaker to stop spurious error logging. If the source is intentionally decommissioned, drop from the circuit breaker registry. |
| I3 | Trading Economics | ISSUE | `get_system_status` source health: 2× "Trading Economics" both "Ngưng", 38–39 consecutive errors, never fetched successfully. Affects macro indicator refresh (macroIndicatorRefreshJob). | macro-indicators refresh, unified-agent macro context | dev-mainserver-crawls / dev-macro-indicators: diagnose Trading Economics fetch failure. Check if auth/cookie/anti-bot changed. Recent fix history shows Chromium-based scraping; confirm mcp-server Chromium is available and working. |
| I4 | `get_macro_calendar` | ISSUE | Probe: `get_macro_calendar({})` → `{"status":"unavailable","source_tier":4,"is_estimate":true,"events":[]}`. No macro calendar events returned. | bctc-analyst (macro context), unified-agent | dev-mcp-server / dev-macro-indicators: trace why macro calendar data source returns unavailable. Check upstream feed (Trading Economics likely root cause for I3). |
| I5 | Foreign flow fallback | ISSUE | `get_system_status` errors every cycle: `[foreign-flow-job] fallback activated` + `[foreign-flow-job] all fallbacks exhausted`. VPS push IS flowing (get_vps_proxy_health: foreign-flow ok, 4 pushes/24h). Data quality not impacted but log noise is high. | market-watcher (get_foreign_flow per ticker indirect), all agents reading logs | dev-mcp-server: investigate why `foreignFlowFetcherJob` fallback path fires every minute even though VPS push succeeds. Likely the "primary endpoint" (direct HTTP) fails and VPS is the actual data source — the error is expected but should be INFO not WARN. |
| I6 | `pushPrices` zero_ohlc | ISSUE | `get_system_status` errors every open-market cycle: unit guard rejected ACB, ASM, BID, BSR, BVH, CMG, VND, VNM, VOS, VPB, VRE, VTP with `zero_ohlc: field=high`. Guard is CORRECTLY protecting DB. VPS sends `high=0` for some tickers at session-open tick before first trades. | Price data consumers (market-watcher Step 1, alert-engine) see no price for these tickers on the first push | dev-vps-crawls: add a retry/skip guard on the VPS side — skip emitting prices when `high==0 && low==0` at tick=first (i.e. trading has not started yet). Alternatively, MCP server: suppress the ERROR log to WARN for zero_ohlc rejections (guard is working; spam is the problem). |

---

## IMPROVE (works but needs cleanup)

| # | Item | Evidence | Fix |
|---|------|----------|-----|
| M1 | `get_technical_indicators` tool doc | `docs/agents/tools/list/get_technical_indicators.md:7` says `ticker` param. Live tool and all callers use `code`. Zero runtime impact (callers already correct). | Fix tool doc: rename param from `ticker` to `code`. |
| M2 | `get_foreign_flow` tool doc | `docs/agents/tools/list/get_foreign_flow.md:7` says `ticker` param. Live tool requires `code`. Root of B2 confusion. | Fix tool doc: rename `ticker` → `code`. Update caller fix per B2. |
| M3 | `bctcReparseJob` success rate | `get_cron_health`: `bctcReparseJob` at 80.1% (176 runs), avg_duration 349,852ms (~6 min/run). Just above the 80% alert threshold. | Monitor — if drops below 80% the cronHealthAlertJob fires. Consider investigating reparse failures. |
| M4 | `vnstockFundamentalsRefresh` duration | avg_duration 665,597ms (~11 min). Runs with success but very slow. | dev-mcp-server: profile and optimize or split into smaller batches. |

---

## RESOLVED (findings that no longer reproduce)

_No prior cycle report to carry forward. All findings above are first-detected this cycle._

---

## Tool Probe Summary

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ PASS (36ms) | All sub-calls healthy |
| `get_system_status` | ✅ PASS | See I2, I3, I5, I6 |
| `get_market_snapshot` | ✅ PASS (source_tier:2) | VN-Index 1800.83 +0.51% |
| `get_macro_snapshot` | ✅ PASS (source_tier:2) | Gold $4337, Brent $83.9, USDVND 26123 |
| `get_cron_health` | ✅ PASS | 63 jobs tracked; see M3 |
| `get_pipeline_health` | ✅ PASS | 38 rows most tickers; 5 tickers with 0 rows (BDI/DLC/JSH/SIS/VDC) |
| `get_vps_proxy_health` | ⚠️ STALE | bctc stale (see I1); prices/news/sbv/foreign-flow ok |
| `get_watchlist` | ✅ PASS | 41 tickers returned |
| `get_earnings_calendar` | ✅ PASS | 41 tickers, 11 QUÁ HẠN (overdue, no system error) |
| `get_sla_status` | ⚠️ BREACHED | bctc CRITICAL (see I1); others ok |
| `get_rate_limit_status` | ✅ PASS | 14 sources, 0 rate-limited |
| `get_agent_signals` | ✅ PASS | Returns correctly (no signals for market-watcher = expected) |
| `task_list_held` | ✅ PASS | 0 locks held, clean state |
| `get_vps_service_health` | ✅ PASS | All 5 VPS services healthy |
| `get_alerts` | ✅ PASS | Alerts returned correctly |
| `get_price_history` | ✅ PASS (code param) | VCB 4 rows for 5 days |
| `get_technical_indicators` | ❌ BUG | ALL N/A for VCB/HPG/FPT (see B1) |
| `get_foreign_flow({})` | ❌ BUG | Required `code` param missing (see B2) |
| `get_foreign_flow({code})` | ✅ PASS | Works when code provided |
| `get_market_foreign_flow` | ✅ PASS | Market-wide flow works correctly |
| `get_open_chain_findings` | ✅ PASS | 0 findings (expected early cycle) |
| `get_macro_calendar` | ⚠️ ISSUE | status:unavailable, source_tier:4 (see I4) |
| `get_crisis_early_warning` | ✅ PASS | GAS/PLX/VNM low credibility noted |
| `fetch_and_analyze` | ✅ PASS | 20 news items analyzed |
| `get_recent_fixes` | ✅ PASS | 10 fixes returned |
| `emit_pressure_state` | ℹ️ SCHEMA OK | Write tool — not live-called; schema verified: `state` string param |
| `send_telegram` | ℹ️ SCHEMA OK | Write tool — schema verified per system-map channels |
| `log_agent_work` | ℹ️ SCHEMA OK | Write tool — schema verified per package docs |
| `post_agent_signal` | ℹ️ SCHEMA OK | Write tool — not probed to avoid state mutation |

---

## Priority Action Items

1. **[URGENT] B1 — `get_technical_indicators` fleet-wide blind**: market-watcher TA step completely non-functional. Assign to `dev-technical-analysis`. Likely a TA service endpoint routing bug.
2. **[HIGH] B2 — `get_foreign_flow` broken callers**: fb-market-poster + unified-agent fail at foreign flow step. Fix both flows to use `get_market_foreign_flow({})`. Assign to `dev-mcp-server`.
3. **[HIGH] I1 — BCTC pipeline stalled 26h**: BCTC SLA in CRITICAL state. Assign to `ops` / `dev-vps-crawls`.
4. **[MEDIUM] I3 — Trading Economics dead**: macro indicator refresh blind. Assign to `dev-mainserver-crawls`.
5. **[LOW] I2 — Reuters dead log noise**: Decommissioned but still logging errors. Cleanup only.
