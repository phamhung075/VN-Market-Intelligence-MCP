# Team MCP Tool Health Recheck — 2026-06-18 04:07 UTC

**Run by:** health-recheck routine (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-18 03:58–04:07 UTC (VN market OPEN — 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-18-0207.md` (2h 00min delta)
**Method:** Read-only smoke calls per tool + caller-surface grep verification. No live-state mutations.
**STEP 3c:** All prior findings re-probed this cycle before carry-forward.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| BUG | 2 | vn-bctc-fetch UNHEALTHY (worsened +2h), bctcQueueEnricher frozen (co-dependent) |
| ISSUE | 6 | Foreign-flow direct-fetch log-spam, FRED_API_KEY absent, Reuters/TE stopped, BDI 72d stale, chef.md agent_id drift, vnstockTradingStatsRefresh 67% |
| IMPROVE | 7 | bootstrap deprecated enum, cascade metrics Eval=0, task_claim TTL doc, bctcReparseJob 82%, error log noise, tool-list ticker→code doc, task_list_held expired locks |
| RESOLVED | 1 | BUG-NEW-A: vn-foreign-flow VPS health check — now HEALTHY |
| UNVERIFIED | 1 | BUG-NEW-B: SSC HOSE cert error — not in current error window, status unknown |

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — last restart 2026-06-17 23:17:31 UTC; `mcpServerStartup total_runs=50` (unchanged from 02:07 — stable 2h, no new restarts) |
| Telegram env | SET (BOT_TOKEN, MARKET, WORK, BUG all confirmed) |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe command/evidence | Delta |
|---|---|---|---|
| BUG-1 | vn-bctc-fetch UNHEALTHY | `get_vps_service_health` → `vn-bctc-fetch \| unhealthy \| 4m ago \| 0ms \| 1d 9h 57m` | **ONGOING, WORSENED** (+2h vs 02:07 cycle's 1d 7h 57m) |
| BUG-2 | bctcQueueEnricher 0-URL freeze | `get_sla_status` → bctc `1882/120min CRITICAL`; `get_vps_proxy_health` → bctc `STALE, last push 2026-06-16 18:02:24` | **ONGOING, WORSENED** (+121min elapsed vs prior cycle) |
| BUG-NEW-A | vn-foreign-flow VPS health UNHEALTHY | `get_vps_service_health` → `vn-foreign-flow \| healthy \| 4m ago` | **RESOLVED** ✅ |
| BUG-NEW-B | SSC HOSE fallback cert error | `get_system_status` RECENT ERRORS: only foreign-flow errors in top-10 window; SSC errors absent | **UNVERIFIED** (cannot confirm from current window — foreign-flow log noise displacing SSC entries) |
| ISSUE-3 | `get_ism_subcomponents` no_data | `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` | **ONGOING, UNCHANGED** |
| ISSUE-4 | Reuters RSS + Trading Economics stopped | `get_system_status` SOURCE HEALTH: Reuters RSS — Ngưng, Chưa bao giờ, 59 consecutive failures; Trading Economics ×2 — Ngưng, Chưa bao giờ, 59–60 failures | **ONGOING, UNCHANGED** |
| ISSUE-5 | BDI 72d stale | `get_supply_chain_exposure({})` → `BDI: 1,400 (+0.0%) - 2026-04-07` | **ONGOING, UNCHANGED** |
| ISSUE-N1 | chef.md:91 `agent_id` drift | `grep -n "agent_id" docs/agents/unified-agent/flow/chef.md` → line 91: `get_cycle_bootstrap(agent_id="unified-agent")` — live schema requires `agent_name` | **ONGOING, UNCHANGED** |
| ISSUE-N2 | vnstockTradingStatsRefresh 67% | `get_cron_health` → `success_rate: 0.67 (66.7%), total_runs: 3, avg_duration: 915464ms` | **ONGOING, UNCHANGED** |
| IMPROVE-6 | bootstrap deprecated enum names | `get_cycle_bootstrap({})` validation error still lists `financial-analyst\|report-analyzer` in enum | **ONGOING, UNCHANGED** |
| IMPROVE-7 | cascade metrics Eval=0 | `get_cascade_metrics({})` → all 46 rules Eval=0 / WinRate=— | **ONGOING, UNCHANGED** |
| IMPROVE-8 | task_claim TTL undocumented | Not re-probed (doc fix) | **ASSUMED ONGOING** |
| IMPROVE-N3 | bctcReparseJob 82% | `get_cron_health` → `success_rate: 0.82 (82.0%), total_runs: 172, avg_duration: 260471ms` | **ONGOING, UNCHANGED** |
| IMPROVE-N4 | Off-hours error log noise | `get_system_status` RECENT ERRORS: now 8/10 are foreign-flow direct-fetch fallback errors (market open) | **ONGOING, CHARACTER CHANGED** |
| IMPROVE-NEW-A | tool docs `ticker`→`code` | `get_foreign_flow(ticker=VHM)` → schema error (code required); callers already use correct `code` — doc-only fix | **ONGOING, UNCHANGED** (0 runtime callers affected) |

---

## RESOLVED THIS CYCLE

### BUG-NEW-A — vn-foreign-flow VPS health check — RESOLVED ✅

**Prior evidence (02:07):** `get_vps_service_health` → `vn-foreign-flow | unhealthy | 4m ago | 0ms`
**This cycle:** `get_vps_service_health` → `vn-foreign-flow | healthy | 4m ago`; also `vn-sbv-fetch | healthy`

Both services are now healthy. Data has been continuously flowing (VPS push: 102 items every ~30s). The health endpoint appears to have recovered on its own or after a service restart. **Dropping from active BUG tally.**

---

## ACTIVE BUG FINDINGS

---

### BUG-1 — vn-bctc-fetch VPS service UNHEALTHY → WORSENING (34h+ cumulative)

| Field | Value |
|---|---|
| Re-probe | `get_vps_service_health({})` → `vn-bctc-fetch \| unhealthy \| 4m ago \| 0ms \| 1d 9h 57m` |
| Proxy evidence | `get_vps_proxy_health` → bctc: `last push 2026-06-16 18:02:24, 0 pushes/24h, STALE` |
| SLA | `get_sla_status` → bctc `1882 min elapsed / 120 min SLA` — **CRITICAL BREACH** |
| Cumulative downtime | ~34h without any BCTC PDF push |
| BCTC calendar | 10 watchlist tickers QUÁ HẠN (overdue) — BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH (12 total per alert) |
| Affected callers | bctc-analyst, refine_bctc_md — **2 confirmed** |
| Caller-surface grep | `grep -r "bctc\|get_bctc\|push_bctc" docs/agents/bctc-analyst/flow/main.md docs/agents/refine_bctc_md/flow/main.md` — confirmed callers |

**Suggested fix:** SSH to VPS, `systemctl restart vn-bctc-fetch.service`, check journal logs (`journalctl -u vn-bctc-fetch -n 50`). Verify URL scraper post-restart. This has been ongoing >34h — escalation warranted.

---

### BUG-2 — bctcQueueEnricher 0-URL freeze → WORSENING (dependent on BUG-1)

| Field | Value |
|---|---|
| Re-probe | `get_sla_status` → bctc CRITICAL; `bctcQueueEnricherJob` runs every 15 min, 100% success rate but 0 new URLs since VPS stopped |
| BCTC pipeline | bctcPdfPullJob: 99.1% success (341 runs) but pulling 0 new PDFs |
| Earnings calendar | 10 QUÁ HẠN tickers with no new BCTC PDF discovery |
| Pending BCTC | Q1-2026 reports not arriving for overdue tickers |
| Affected callers | bctc-analyst, refine_bctc_md — **2 confirmed** |

**Root cause:** Same as BUG-1. Fixing vn-bctc-fetch recovers within 2–3 enricher cycles (~30–45 min).

---

## ACTIVE ISSUE FINDINGS

---

### ISSUE-NEW-A — Foreign-flow direct-fetch path: all fallbacks exhausted every minute (new this cycle)

| Field | Value |
|---|---|
| Evidence | `get_system_status` RECENT ERRORS: `[foreign-flow-job] fallback activated` + `[foreign-flow-job] all fallbacks exhausted` — 2 events per minute, consistently during market hours |
| Disambiguating evidence | `get_vps_proxy_health` → foreign-flow: `2026-06-18 04:03:30 ok \| 102 items` (data flowing); `get_sla_status` → foreign_flow `0 min \| ok`; `foreignFlowFetcherJob` cron: `100% success, 1976 runs` |
| Classification | **ISSUE** (not full BUG) — direct bgapidatafeed.vps.com.vn fetch path is broken; VPS push compensating; no data gap |
| Caller-surface | Direct-fetch fallback is internal to `foreignFlowFetcherJob`; data consumers (`get_market_foreign_flow`, `get_foreign_flow`) are unaffected. Affected callers: 0 (data path healthy); monitoring noise: affects ops + system-auditor error log readings |
| Grep | `grep -r "foreign-flow-job\|bgapidatafeed" apps/mcp-server/src` → internal cron job, not called by cowork agents directly |

**Suggested fix:** Investigate `bgapidatafeed.vps.com.vn` direct endpoint — likely blocked by IP/geo restriction from main server. If direct fetch is permanently unavailable, suppress fallback log noise by marking the primary endpoint as disabled and relying solely on VPS push.

---

### ISSUE-3 — `get_ism_subcomponents` returns no_data (FRED_API_KEY absent) — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_ism_subcomponents({})` → `{"error":"no_data","message":"... requires FRED_API_KEY"}` |
| Affected callers | news-scout, unified-agent, bctc-analyst tool packages (soft-degraded — optional ISM context) — **3 confirmed** |

**Suggested fix:** Configure `FRED_API_KEY` env var in mcp-server container. Trigger `macroIndicatorRefreshJob`.

---

### ISSUE-4 — Reuters RSS + Trading Economics never succeed (60 consecutive failures) — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_system_status` SOURCE HEALTH: Reuters RSS — Ngưng, Chưa bao giờ, 59 consecutive failures; Trading Economics ×2 — Ngưng, 59–60 consecutive failures |
| Context | Reuters VPS service decommissioned 2026-04-30 per get_recent_fixes #7. Direct RSS path still registered. Trading Economics Chromium scrape broken (Docker container). |
| Impact | Overall news freshness OK (4 min) via cafef/vnexpress/nld. International context degraded. |
| Affected callers | `intelligenceCycleJob` (pollNews), news-scout via `fetch_and_analyze` — **2 confirmed** |

**Suggested fix:**
- Reuters: Mark source as `disabled` in source health registry (same pattern as newsapi — it shows "disabled").
- Trading Economics: Investigate Chromium container. Last fix (#6, 2026-04-30): Chromium was installed. If scrape is structurally broken post-rebuild, disable and route to direct API or alternative.

---

### ISSUE-5 — BDI Baltic Dry Index 72 days stale — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_supply_chain_exposure({})` → `BDI: 1,400 (+0.0%) - 2026-04-07` |
| Impact | Supply chain risk signals fed to market-watcher, unified-agent, digest-predict, tran-ngoc-bau — **4 callers** |

**Suggested fix:** Check BDI scraper source URL and VPS crawler logs. BDI data source may have changed format or URL.

---

### ISSUE-N1 — `unified-agent/flow/chef.md` line 91 uses `agent_id` (wrong param) — ONGOING

| Field | Value |
|---|---|
| Re-probe | `grep -n "agent_id" docs/agents/unified-agent/flow/chef.md` → **line 91**: `get_cycle_bootstrap(agent_id="unified-agent")` |
| Live schema | `get_cycle_bootstrap({})` → validation error path `["agent_name"]` — required field is `agent_name` |
| Caller-surface | `grep "agent_name" docs/agents/tools/package/unified-agent.md` → correct in tool-package docs. Only chef.md:91 has the wrong param. |
| Affected callers | **1** (unified-agent — GATHER step bootstrap fails if pseudocode is followed literally) |

**Suggested fix:** One-line fix: `docs/agents/unified-agent/flow/chef.md:91`: change `agent_id="unified-agent"` → `agent_name="unified-agent"`.

---

### ISSUE-N2 — `vnstockTradingStatsRefresh` cron at 67% success rate (below 80% threshold) — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_cron_health` → `vnstockTradingStatsRefresh: success_rate: 0.67 (66.7%), total_runs: 3, avg_duration: 915464ms` |
| Threshold | cronHealthAlertJob fires at < 80% — this should have triggered an alert |
| Duration | 915s (15.3 min) average — extreme, likely OOM or API timeout |
| Affected callers | `get_financial_summary`, `get_ticker_intelligence` consumers: bctc-analyst, market-analyst — **2 confirmed** |

**Suggested fix:** Pull job logs for failure cause. 915s avg duration suggests OOM or vnstock API timeout. Split job into per-ticker tasks with TTL guard.

---

## IMPROVE FINDINGS

| ID | Finding | Status | Action |
|---|---|---|---|
| IMPROVE-6 | `get_cycle_bootstrap` enum includes deprecated `financial-analyst` / `report-analyzer` — 0 active callers | ONGOING | Remove stale enum values from tool schema |
| IMPROVE-7 | `get_cascade_metrics` returns Eval=0 / WinRate=— for all 46 rules (758 hits on pharma_neutral, 0 evaluated) | ONGOING | Wire cascade backtest outcome resolution; 46 rules are firing but no outcome is being assessed |
| IMPROVE-8 | `task_claim` TTL minimum (60s) not documented in `docs/agents/tools/list/task_claim.md` | ONGOING | Add minimum TTL note to doc |
| IMPROVE-N3 | `bctcReparseJob` at 82.0% success (172 runs, 260s avg) — 1 tick above 80% alert threshold | ONGOING | Monitor closely; avg 260s per run may timeout under load |
| IMPROVE-N4 | Error log noise: 8/10 recent unresolved errors are foreign-flow direct-fetch fallbacks; makes critical errors harder to spot | ONGOING | Suppress or downgrade direct-fetch fallback log level if primary VPS push is healthy |
| IMPROVE-NEW-A | `docs/agents/tools/list/get_technical_indicators.md` + `get_foreign_flow.md` document `ticker` param; live schema requires `code` — doc-only drift | ONGOING | Update docs to match live schema; 0 runtime callers affected (callers already use `code`) |
| IMPROVE-NEW-B | `task_list_held` returns locks with `expires_at` in the past (cowork-leader expired 03:51 UTC, still in list at 04:03) | NEW | Document that `task_list_held` shows all locks including expired-pending-cleanup. Or: add server-side filter to exclude obviously-expired entries. |

---

## Tool Probe Results Matrix

| Tool | Status | Latency / Notes |
|------|--------|----------------|
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ OK | 8ms; full context returned |
| `get_market_snapshot` | ✅ OK | VN-Index 1,834.76 (+1.58%), breadth 96/163/71; source_tier 2 |
| `get_macro_snapshot` | ✅ OK | tier-2; Brent $78.25, Gold $4337.9, USD/VND 26111 |
| `get_system_status` | ⚠️ WARN | Foreign-flow fallback errors (8/10 recent); Reuters/TE stopped; 47 open warnings |
| `get_cron_health` | ⚠️ WARN | vnstockTradingStatsRefresh 67%, bctcReparseJob 82% |
| `get_sla_status` | ❌ BREACHED | bctc 1882/120min CRITICAL; price/news/sbv/foreign_flow OK |
| `get_vps_proxy_health` | ⚠️ PARTIAL | prices/news/sbv/foreign-flow OK; bctc STALE since 2026-06-16 18:02 |
| `get_vps_service_health` | ⚠️ 1 UNHEALTHY | vn-bctc-fetch unhealthy (1d 9h 57m); 4 others healthy |
| `get_pipeline_health` | ✅ OK | TA ready for 35/41 tickers; BDI/DLC/JSH/SIS/VDC/VNH sparse (rows=0) |
| `get_earnings_calendar` | ✅ OK | 10 QUÁ HẠN tickers (BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH) |
| `get_technical_indicators(code="VCB")` | ✅ OK | source_tier 3; RSI 48.6 neutral; full MACD/BB returned |
| `get_financial_summary(actionCode="FPT")` | ✅ OK | FPT Q1-2026 confidence 81%; requires `actionCode` not `ticker` |
| `get_ism_subcomponents` | ❌ no_data | FRED_API_KEY missing (ISSUE-3) |
| `get_supply_chain_exposure` | ⚠️ STALE | BDI 72d stale (ISSUE-5) |
| `get_macro_calendar` | ❌ unavailable | `{status: "unavailable", source_tier: 4}` |
| `get_cascade_metrics` | ⚠️ ZERO | Eval=0 for all 46 rules (IMPROVE-7) |
| `task_list_held` | ✅ OK (9 locks) | cowork-leader expired 03:51 UTC but still listed (IMPROVE-NEW-B) |
| `get_foreign_flow(ticker=VHM)` | ❌ SCHEMA ERROR | Requires `code` not `ticker` — doc drift, callers already correct |
| `get_agent_signals` | ❌ SCHEMA ERROR (expected) | Requires `agent` param — not a no-arg tool |
| `get_financial_summary(ticker="FPT")` | ❌ SCHEMA ERROR (expected) | Requires `actionCode` not `ticker` — callers already correct |
| `send_telegram` | NOT PROBED | Schema confirmed: requires `message` (not `text`); read-only check only |

---

## Server Restart Rate Trend

| Report | mcpServerStartup total_runs | Delta |
|---|---|---|
| 2026-06-16 00:07 | 31 | baseline |
| 2026-06-18 00:06 | ~48 | ~17 in 48h (~8.5/day) |
| 2026-06-18 02:07 | 50 | +2 in 2h |
| **2026-06-18 04:07** | **50** | **+0 in 2h — STABLE** ✅ |

No new restarts in the last 2 hours. Server uptime stable. `mcpServerCleanShutdown total_runs=22` vs `mcpServerStartup=50` → 28 unclean restarts historically (ratio unchanged — no new crashes).

---

## Priority Action List (dev team)

| Priority | Action | Finding |
|----------|--------|---------|
| **P0** | Restart `vn-bctc-fetch` on VPS; check crash logs; verify PDF scraper post-restart | BUG-1 / BUG-2 |
| **P1** | Fix `docs/agents/unified-agent/flow/chef.md:91` `agent_id=` → `agent_name=` (1-line fix) | ISSUE-N1 |
| **P2** | Configure `FRED_API_KEY` env var for ISM data | ISSUE-3 |
| **P2** | Mark Reuters RSS source as `disabled`; investigate Trading Economics Chromium container | ISSUE-4 |
| **P2** | Investigate BDI scraper (72d stale) | ISSUE-5 |
| **P2** | Investigate `vnstockTradingStatsRefresh` crash/OOM cause (67% success, 915s avg) | ISSUE-N2 |
| **P3** | Investigate `bgapidatafeed.vps.com.vn` direct endpoint availability; suppress fallback log noise if permanently unavailable | ISSUE-NEW-A |
| **P3** | Re-verify SSC HOSE TLS cert fix status (BUG-NEW-B from prior cycle — unverified this cycle) | BUG-NEW-B |
| **P3** | Remove deprecated `financial-analyst` / `report-analyzer` from `get_cycle_bootstrap` enum | IMPROVE-6 |
| **P3** | Wire cascade backtest outcome resolution (all 46 rules Eval=0) | IMPROVE-7 |
| **P3** | Fix `docs/agents/tools/list/get_technical_indicators.md` + `get_foreign_flow.md`: `ticker` → `code` | IMPROVE-NEW-A |
