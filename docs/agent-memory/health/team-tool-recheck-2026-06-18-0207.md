# Team MCP Tool Health Recheck — 2026-06-18 02:07 UTC

**Run by:** health-recheck routine (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-18 02:02–02:07 UTC (VN market OPEN)
**Prior report:** `team-tool-recheck-2026-06-18-0006.md` (2h 01min delta)
**Method:** Read-only smoke calls per tool + caller-surface grep verification. No live-state mutations.
**STEP 3c:** All prior findings re-probed this cycle before carry-forward.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| BUG | 4 | vn-bctc-fetch still UNHEALTHY (worsened), bctcQueueEnricher freeze, vn-foreign-flow health UNHEALTHY (NEW), SSC HOSE cert error (NEW) |
| ISSUE | 5 | FRED_API_KEY absent, Reuters/TE stopped, BDI 72d stale, chef.md agent_id drift, vnstockTradingStatsRefresh 67% |
| IMPROVE | 6 | Bootstrap enum deprecated names, cascade metrics 0 outcomes, task_claim TTL undocumented, bctcReparseJob threshold, HNX off-hours noise, tool-list docs ticker→code |
| RESOLVED | 0 | — |

All BUG and ISSUE findings have ≥1 confirmed affected caller.

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — last restart 2026-06-17 23:17:31 UTC (~2h 44m uptime at probe); `mcpServerStartup total_runs=50` |
| Telegram env | SET (BOT_TOKEN, MARKET, WORK, BUG all confirmed) |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe evidence | Delta |
|---|---|---|---|
| BUG-1 | vn-bctc-fetch UNHEALTHY | `get_vps_service_health` → `vn-bctc-fetch \| unhealthy \| 4m ago \| 0ms \| 1d 7h 57m` | **ONGOING, WORSENED** (+1h 55m vs 00:06 cycle) |
| BUG-2 | bctcQueueEnricher 0-URL freeze | `get_sla_status` → bctc `1761/120min CRITICAL`; `get_vps_proxy_health` → bctc `STALE, last push 2026-06-16 18:02:24, 0 pushes/24h` | **ONGOING, WORSENED** (+119min elapsed) |
| ISSUE-3 | `get_ism_subcomponents` no_data | `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)"}` | **ONGOING, UNCHANGED** |
| ISSUE-4 | Reuters RSS + Trading Economics stopped | `get_system_status` SOURCE HEALTH: Reuters RSS 29 consecutive failures / never succeeded; Trading Economics ×2 29–30 failures / never succeeded | **ONGOING, UNCHANGED** |
| ISSUE-5 | BDI 72d stale | `get_supply_chain_exposure({})` → `BDI: 1,400 (+0.0%) - 2026-04-07` | **ONGOING, UNCHANGED** |
| ISSUE-N1 | chef.md:91 `agent_id` drift | `grep -n "agent_id" docs/agents/unified-agent/flow/chef.md` → line 91: `get_cycle_bootstrap(agent_id="unified-agent")` — live schema requires `agent_name` | **ONGOING, UNCHANGED** |
| ISSUE-N2 | vnstockTradingStatsRefresh 67% | `get_cron_health` → `success_rate: 0.67 (66.7%), total_runs: 3, avg_duration: 915464ms` | **ONGOING, UNCHANGED** |
| IMPROVE-6 | bootstrap enum deprecated names | `get_cycle_bootstrap({})` error enum still includes `financial-analyst\|report-analyzer` | **ONGOING, UNCHANGED** |
| IMPROVE-7 | cascade metrics 0 outcomes | `get_cascade_metrics({})` → all 46 rules Eval=0 | **ONGOING, UNCHANGED** |
| IMPROVE-8 | task_claim min TTL undocumented | `docs/agents/tools/list/task_claim.md` line 11 — no minimum stated | **ONGOING, UNCHANGED** |
| IMPROVE-N3 | bctcReparseJob threshold | `get_cron_health` → `success_rate: 0.82 (82.0%), total_runs: 172, avg_duration: 260471ms` | **ONGOING, UNCHANGED** |
| IMPROVE-N4 | HNX/UPCOM off-hours errors | `get_system_status` → 10 unresolved errors: 4x `[ssc] HOSE fallback fetch failed`, 2x `[foreign-flow-job] all fallbacks exhausted`, 1x `[push-prices] ohlcv rows rejected by unit guard` during market hours | **ONGOING** (error character changed: now SSC cert errors and foreign-flow fallbacks during market hours — see BUG-NEW-A and BUG-NEW-C) |

---

## NEW Findings This Cycle

---

### BUG-NEW-A — vn-foreign-flow VPS health check UNHEALTHY + fallback exhaustion warnings

**Evidence:**
- `get_vps_service_health({})` → `vn-foreign-flow | unhealthy | 4m ago | 0ms | 17h uptime`
- `get_vps_service_health({})` → `vn-sbv-fetch | unhealthy | 4m ago | 0ms | 1h 14m uptime`
- `get_system_status` RECENT ERRORS: `[foreign-flow-job] fallback activated`, `[foreign-flow-job] all fallbacks exhausted` (×2 in last 5 min)

**Disambiguating evidence (important — prevents over-classification):**
- `get_vps_proxy_health` → foreign-flow: `2026-06-18 02:02:54 ok | 102 items` — data IS flowing
- `get_system_status` SOURCE HEALTH: SBV `0 consecutive failures`, sbv_fx freshness `2 min` — SBV data fresh
- `get_system_status` → `foreignFlowFetcherJob: success_rate: 1.00 (100%)` in cron health

**Classification:** ISSUE (not full BUG) — health check endpoint on VPS returns non-2xx while actual data pipeline is functional. The `0ms response` for all 5 services (including "healthy" ones) suggests the health poll mechanism may use a keepalive/ping endpoint that is down, while the push endpoint is separate and working.

**Caller-surface grep:** `grep -r "get_vps_service_health\|vn-foreign-flow" docs/agents/*/flow/*.md` — ops agent and system-auditor Tier-1 check this. Alert-commander and market-watcher do NOT gate on it. Functional impact: monitoring noise; no data gap confirmed yet.
**Affected callers: 2 (ops, system-auditor)**

**Action:** Dev to verify VPS vn-foreign-flow health endpoint (POST /health or ping route) is running alongside the data push endpoint. Fix health probe to match actual service liveness.

---

### BUG-NEW-B — SSC HOSE fallback cert error (4x/2min during market hours)

**Evidence:**
- `get_system_status` RECENT ERRORS:
  ```
  [2026-06-18 09:02:15] [ERROR] [ssc] HOSE fallback fetch failed — unknown certificate verification error
  [2026-06-18 09:02:15] [ERROR] [ssc] HOSE fallback fetch failed — unknown certificate verification error
  [2026-06-18 09:02:16] [ERROR] [ssc] HOSE fallback fetch failed — unknown certificate verification error
  [2026-06-18 09:02:18] [ERROR] [ssc] HOSE fallback fetch failed — unknown certificate verification error
  ```
- All 4 errors occurred within a 3-second window during VN market open hours (02:00–08:59 UTC)
- Circuit breaker: `ssc [OK] failures: 0` (CB not tripping — fallback errors do not increment main CB counter)

**Disambiguating evidence:**
- VPS proxy prices are flowing: `get_vps_proxy_health` → prices last push `2026-06-18 02:01:57 ok | 95 items`
- `get_market_snapshot` returns live VN-Index data (source_tier: 2 — VPS primary)
- SSC is the FALLBACK tier (tier 3) — primary VPS path is healthy

**Classification:** BUG — SSC fallback is broken due to a TLS/cert verification failure. If VPS goes down, price data will have no fallback. This is a latent resilience hole.

**Caller-surface:** `grep "ssc\|SSC" apps/mcp-server/src` → `intelligenceCycleJob`, `marketScanJob`, `vnIndexRefreshJob` all use the 3-tier fallback chain (VPS → vndirect API → SSC). SSC is tier 3. 0 callers affected NOW (primary VPS healthy), but failure becomes BUG when VPS is down.
**Affected callers: 3 (latent, active when VPS fails)**

**Action:** Investigate SSC HOSE endpoint TLS configuration. Likely expired or self-signed cert on the fallback URL. Update TLS verification config or renew cert.

---

## ACTIVE FINDINGS (all re-confirmed this cycle)

---

### BUG-1 — vn-bctc-fetch VPS service UNHEALTHY → WORSENING (ongoing from prior cycles)

| Field | Value |
|---|---|
| Re-probe | `get_vps_service_health({})` → `vn-bctc-fetch \| unhealthy \| 4m ago \| 0ms \| 1d 7h 57m` |
| Proxy evidence | `get_vps_proxy_health` → bctc: `last push 2026-06-16 18:02:24, 0 pushes/24h, YES stale` |
| SLA | `get_sla_status` → bctc `1761 min elapsed / 120 min SLA` — **CRITICAL BREACH** |
| Cumulative downtime | ~30h without BCTC push |
| Affected callers | bctc-analyst, refine_bctc_md — 2 confirmed |

**Action:** Restart `vn-bctc-fetch` on VPS. Check crash logs. Verify URL scraper post-restart.

---

### BUG-2 — bctcQueueEnricher 0-URL freeze → WORSENING (dependent on BUG-1)

| Field | Value |
|---|---|
| Re-probe | `get_sla_status` → bctc CRITICAL; bctcQueueEnricher runs every 15 min with 0 URLs found |
| Pending refine | VCB PARTIAL, HPG/GVR/HVN PENDING (frozen pipeline) |
| Earnings calendar | 10 watchlist tickers marked QUÁ HẠN (overdue) with no new PDF discovery |
| Affected callers | bctc-analyst, refine_bctc_md — 2 confirmed |

**Root cause:** Same as BUG-1. Fixing vn-bctc-fetch will allow recovery within 2-3 enricher cycles.

---

### ISSUE-3 — `get_ism_subcomponents` returns no_data (FRED_API_KEY absent)

| Field | Value |
|---|---|
| Re-probe | `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)"}` |
| Affected callers | news-scout, unified-agent, bctc-analyst tool packages (soft-degraded — optional context) — 3 confirmed |

**Action:** Configure `FRED_API_KEY` env var for macro-indicators service. Trigger `macroIndicatorRefreshJob`.

---

### ISSUE-4 — Reuters RSS + Trading Economics never succeed (persistent across all sessions)

| Field | Value |
|---|---|
| Re-probe | `get_system_status` SOURCE HEALTH: Reuters RSS — Ngưng, Chưa bao giờ, 29 consecutive failures; Trading Economics ×2 — Ngưng, Chưa bao giờ, 29–30 failures |
| Context | Reuters VPS service decommissioned 2026-04-30 (get_recent_fixes #7). Direct RSS path still registered and attempted every cycle. Trading Economics uses Chromium scrape in Docker — recurring instability. |
| Affected callers | `intelligenceCycleJob` (pollNews), news-scout via `fetch_and_analyze` — 2 confirmed |

**Action:**
- Reuters: Mark source as `disabled` in source health registry (same pattern as `newsapi`).
- Trading Economics: Investigate Chromium container health; if chromium scrape is structurally broken, disable and route to direct API fallback.

---

### ISSUE-5 — BDI Baltic Dry Index 72 days stale

| Field | Value |
|---|---|
| Re-probe | `get_supply_chain_exposure({})` → `BDI: 1,400 (+0.0%) - 2026-04-07` |
| Impact | Supply chain risk signals fed to market-watcher, unified-agent, digest-predict, tran-ngoc-bau — 4 callers |

**Action:** Investigate BDI scraper — check source URL or VPS crawler logs for fetch errors.

---

### ISSUE-N1 — `unified-agent/flow/chef.md` line 91 uses `agent_id` (wrong param)

| Field | Value |
|---|---|
| Re-probe | `grep -n "agent_id" docs/agents/unified-agent/flow/chef.md` → line 91: `get_cycle_bootstrap(agent_id="unified-agent")` |
| Live schema | `get_cycle_bootstrap({})` → validation error path `["agent_name"]` — confirms required field is `agent_name` |
| Caller-surface | `grep "agent_name.*unified-agent" docs/agents/tools/package/unified-agent.md` → correct. Only chef.md:91 has the wrong param. |
| Affected callers | 1 (unified-agent — if chef.md pseudocode is followed literally, bootstrap GATHER fails) |

**Action:** Fix `docs/agents/unified-agent/flow/chef.md` line 91: `agent_id=` → `agent_name=`.

---

### ISSUE-N2 — `vnstockTradingStatsRefresh` cron 67% success rate (below 80% threshold)

| Field | Value |
|---|---|
| Re-probe | `get_cron_health` → `vnstockTradingStatsRefresh: success_rate: 0.67 (66.7%), total_runs: 3, avg_duration: 915464ms (15.3 min avg!)` |
| Threshold | `cronHealthAlertJob` fires when success_rate < 80% — should alert |
| Affected callers | `get_financial_summary` and `get_ticker_intelligence` consumers — bctc-analyst, market-analyst — 2 confirmed |

**Action:** Check job logs for failure cause. 915s avg duration is extreme — likely OOM or timeout. Consider splitting job.

---

## IMPROVE FINDINGS (re-confirmed this cycle)

| ID | Finding | Status |
|---|---|---|
| IMPROVE-6 | `get_cycle_bootstrap` enum includes deprecated `financial-analyst` / `report-analyzer` — 0 active callers | ONGOING |
| IMPROVE-7 | `get_cascade_metrics` returns Eval=0 / WinRate=— for all 46 rules despite cron success | ONGOING |
| IMPROVE-8 | `task_claim` TTL minimum (60s) not documented in `tools/list/task_claim.md` | ONGOING |
| IMPROVE-N3 | `bctcReparseJob` at 82% threshold with 260s avg — monitor for drop below 80% | ONGOING |
| IMPROVE-N4 | HNX/UPCOM errors during off-market hours inflate unresolved error count; SSC cert errors now filling the same log | ONGOING |
| IMPROVE-NEW-A | `get_technical_indicators.md` + `get_foreign_flow.md` in `docs/agents/tools/list/` document `ticker` param but live server requires `code`. Callers (market-watcher cycle.md, fb-market-poster/main.md) already use correct `code` param — doc-only fix, 0 runtime impact. Grep: `grep -r '"ticker"' docs/agents/market-watcher/flow/cycle.md docs/agents/fb-market-poster/flow/main.md` → both use `code`. | Caller-surface verified: 0 affected callers |

---

## Tool Probe Results Matrix

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ OK | Full context returned; 13ms elapsed |
| `get_market_snapshot` | ✅ OK | VN-Index 1806.20 (-0.10%), breadth 168/129/65; source_tier 2 |
| `get_macro_snapshot` | ✅ OK | tier-2; Brent $78.51, Gold $4341.3, USD/VND 26111 |
| `get_system_status` | ⚠️ WARN | SSC cert errors (4x), foreign-flow fallback (2x), push-prices unit guard (1x) |
| `get_cron_health` | ⚠️ WARN | vnstockTradingStatsRefresh 67%, bctcReparseJob 82%, intelligenceCycleJob running |
| `get_sla_status` | ❌ BREACHED | bctc 1761/120min CRITICAL |
| `get_vps_proxy_health` | ⚠️ PARTIAL | prices/news/sbv/foreign-flow OK; bctc STALE since 2026-06-16 18:02 |
| `get_vps_service_health` | ⚠️ PARTIAL | 2 healthy (news, price), 3 unhealthy (bctc, foreign-flow, sbv) — data still flowing for sbv+ff |
| `get_pipeline_health` | ✅ OK | TA ready for 35/41 tickers; BDI/DLC/JSH/SIS/VDC/VNH sparse |
| `get_earnings_calendar` | ✅ OK | 10 tickers QUÁ HẠN (overdue) |
| `get_foreign_flow(code="VCB")` | ✅ OK | Returns daily history; `code` param required (not `ticker`) |
| `get_technical_indicators(code="VCB")` | ✅ OK | Returns RSI/MACD/BB; `code` param required (not `ticker`) |
| `get_financial_summary(actionCode="FPT")` | ✅ OK | FPT Q1-2026 confidence 81% |
| `get_ticker_intelligence(code="VCB")` | ✅ OK | Returns evidence + price data |
| `get_ism_subcomponents` | ❌ no_data | FRED_API_KEY missing (ISSUE-3) |
| `get_supply_chain_exposure` | ⚠️ STALE | BDI 72d stale (ISSUE-5) |
| `get_macro_calendar` | ❌ unavailable | `{status: "unavailable", source_tier: 4}` — macro event calendar dark |
| `get_cascade_metrics` | ⚠️ ZERO | Eval=0 for all 46 rules (IMPROVE-7) |
| `task_list_held` | ✅ OK | 9 locks (cowork-leader, published slots, bctc-analyst sprint task) |
| `get_market_context` | ✅ OK | Full watchlist prices + alerts returned |
| `get_market_foreign_flow` | ⚠️ ZEROS | Returning 0 buy/sell for all tickers today — early-session or watchlist coverage gap |
| `get_agent_signals(agent="market-watcher")` | ✅ OK | Returns empty ("Không có tín hiệu mới") — correct for this agent |
| `send_telegram` | NOT PROBED | Schema confirmed: requires `message` (not `text`); read-only check only |

---

## Server Restart Rate Trend

| Report | mcpServerStartup total_runs | Window |
|---|---|---|
| 2026-06-16 00:07 | 31 | — |
| 2026-06-18 00:06 | ~48 (estimated) | ~48h: +17 = 8.5/day |
| 2026-06-18 02:07 | 50 | +2 in 2h; daily trend ~9–10/day |

Restart rate has increased from 4.4/day (prior baseline) to ~9–10/day. No panic pattern detected in cron health (all critical jobs show success), but frequent restarts may indicate OOM pressure or watchdog instability. `mcpServerCleanShutdown total_runs=22` vs `mcpServerStartup=50` → 28 unclean restarts.

---

## RESOLVED Findings

None since the 00:06 UTC cycle.

---

## Priority Action List (dev team)

| Priority | Action | Finding |
|----------|--------|---------|
| P0 | Restart `vn-bctc-fetch` on VPS; check crash logs | BUG-1 / BUG-2 |
| P1 | Fix SSC HOSE fallback TLS cert verification error | BUG-NEW-B |
| P1 | Fix `docs/agents/unified-agent/flow/chef.md:91` `agent_id` → `agent_name` | ISSUE-N1 |
| P2 | Configure `FRED_API_KEY` env var for ISM data | ISSUE-3 |
| P2 | Mark Reuters RSS source as `disabled`; investigate Trading Economics Chromium | ISSUE-4 |
| P2 | Investigate BDI scraper URL (72d stale) | ISSUE-5 |
| P2 | Investigate `vnstockTradingStatsRefresh` crash cause (67% success, 915s avg) | ISSUE-N2 |
| P3 | Fix vn-foreign-flow / vn-sbv-fetch health check endpoint (data flowing but health=unhealthy) | BUG-NEW-A |
| P3 | Remove deprecated enum values from `get_cycle_bootstrap` | IMPROVE-6 |
| P3 | Fix `docs/agents/tools/list/get_technical_indicators.md` + `get_foreign_flow.md`: `ticker` → `code` | IMPROVE-NEW-A |
| P3 | Fix chef.md agent_id drift (1 line) | ISSUE-N1 (same as P1 above) |
