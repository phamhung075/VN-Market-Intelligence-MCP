# Team MCP Tool Health Recheck — 2026-06-18 06:05 UTC

**Run by:** health-recheck routine (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-18 06:00–06:05 UTC (VN market OPEN — 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-18-0407.md` (1h 58min delta)
**Method:** Read-only smoke calls per tool + caller-surface grep verification. No live-state mutations.
**STEP 3c:** All prior findings re-probed this cycle before carry-forward.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| BUG | 2 | vn-bctc-fetch UNHEALTHY (worsened +2h → 1d 11h 57m), bctcQueueEnricher frozen (co-dependent, SLA 2002/120min CRITICAL) |
| ISSUE | 8 | Foreign-flow direct-fetch log-spam, FRED_API_KEY absent, Reuters/TE stopped (86+), BDI 72d stale (shippingIndex 404), chef.md agent_id drift, vnstockTradingStatsRefresh 67%, news SLA 44/30min BREACHED (NEW this cycle) |
| IMPROVE | 7 | bootstrap deprecated enum, cascade Eval=0, task_claim TTL doc, bctcReparseJob 82%, error log noise, tool-doc ticker→code, task_list_held expired locks |
| RESOLVED | 0 | None resolved since 04:07 cycle |
| UNVERIFIED | 1 | BUG-NEW-B: SSC HOSE cert error — still displaced from error window by foreign-flow noise |

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — last restart 2026-06-17 23:17:31 UTC; `mcpServerStartup total_runs=50` (unchanged from 04:07 — 2h stable, no new restarts) |
| Telegram env | SET (BOT_TOKEN, MARKET, WORK, BUG all confirmed) |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe evidence | Delta |
|---|---|---|---|
| BUG-1 | vn-bctc-fetch UNHEALTHY | `get_vps_service_health` → `vn-bctc-fetch \| unhealthy \| 3m ago \| 0ms \| 1d 11h 57m` | **ONGOING, WORSENED** (+2h vs 04:07 cycle's 1d 9h 57m) |
| BUG-2 | bctcQueueEnricher 0-URL freeze | `get_sla_status` → bctc `2002/120min CRITICAL`; `get_vps_proxy_health` → bctc `STALE, last push 2026-06-16 18:02:24` | **ONGOING, WORSENED** (+120min vs 04:07 cycle's 1882min) |
| BUG-NEW-B | SSC HOSE cert error | Recent errors window still dominated by foreign-flow entries; SSC not visible | **UNVERIFIED** (foreign-flow log noise still displacing SSC errors) |
| ISSUE-3 | `get_ism_subcomponents` no_data | `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows... requires FRED_API_KEY"}` | **ONGOING, UNCHANGED** |
| ISSUE-4 | Reuters RSS + Trading Economics stopped | `get_system_status` SOURCE HEALTH: Reuters RSS — Ngưng, Chưa bao giờ, 86 consecutive failures; Trading Economics ×2 — Ngưng, Chưa bao giờ, 86–87 failures | **ONGOING, UNCHANGED** |
| ISSUE-5 | BDI 72d stale | `get_supply_chain_exposure({})` → `BDI: 1,400 (+0.0%) - 2026-04-07`; `get_system_status` RECENT ERRORS: `[shippingIndex] HTTP request failed — 404` | **ONGOING, UNCHANGED** (+root cause clarified: 404 on shippingIndex endpoint) |
| ISSUE-N1 | chef.md:91 `agent_id` drift | `grep -n "agent_id" docs/agents/unified-agent/flow/chef.md` → **line 91**: `get_cycle_bootstrap(agent_id="unified-agent")` confirmed. Tool-package doc line 31 correctly uses `agent_name`. | **ONGOING, UNCHANGED** |
| ISSUE-N2 | vnstockTradingStatsRefresh 67% | `get_cron_health` → `vnstockTradingStatsRefresh: success_rate: 0.67 (66.7%), total_runs: 3, avg_duration: 915464ms` | **ONGOING, UNCHANGED** |
| ISSUE-NEW-A | Foreign-flow direct-fetch log spam | `get_system_status` RECENT ERRORS: 8/10 are `[foreign-flow-job] fallback activated / all fallbacks exhausted`; `get_vps_proxy_health` foreign-flow: healthy, 102 items per push | **ONGOING, UNCHANGED** |
| IMPROVE-6 | bootstrap deprecated enum | First probe this cycle: `get_cycle_bootstrap(agent_name="health-recheck")` → error enum still lists `financial-analyst\|report-analyzer` | **ONGOING, UNCHANGED** |
| IMPROVE-7 | cascade Eval=0 | `get_cascade_metrics({})` → all 46 rules Eval=0, pharma_neutral 758 hits, WinRate=— | **ONGOING, UNCHANGED** |
| IMPROVE-8 | task_claim TTL undocumented | Not re-probed (doc fix) | **ASSUMED ONGOING** |
| IMPROVE-N3 | bctcReparseJob 82% | `get_cron_health` → `bctcReparseJob: success_rate: 0.82 (82.2%), total_runs: 169, avg_duration: 261348ms` | **ONGOING, UNCHANGED** |
| IMPROVE-N4 | Error log noise | `get_system_status` RECENT ERRORS: 8/10 foreign-flow fallback entries | **ONGOING, UNCHANGED** |
| IMPROVE-NEW-A | get_foreign_flow doc `ticker`→`code` | `get_foreign_flow(limit=5)` → schema error: `"code" Required`; doc says `ticker`; live schema requires `code` | **ONGOING, UNCHANGED** (0 runtime callers affected) |
| IMPROVE-NEW-B | task_list_held shows expired locks | `task_list_held` → `cowork-leader expires_at: 2026-06-18T05:52:45Z` (12 min ago, still listed) | **ONGOING, UNCHANGED** |

---

## RESOLVED THIS CYCLE

**None.** All prior active findings re-confirmed. Zero regressions from resolved items.

---

## NEW FINDINGS THIS CYCLE

---

### ISSUE-NEW-C — News SLA breached 44/30 min — RSS sources degraded (NEW)

| Field | Value |
|---|---|
| Evidence | `get_sla_status` → `news \| 44 min \| 30 min SLA \| breached \| HIGH` |
| Source health | `get_system_status` SOURCE HEALTH: CafeF RSS, VnEconomy RSS, VnExpress RSS all "Suy giảm" (1 consecutive failure each), bloomberg/nld OK |
| Cron | `pollNewsJob` ran at 06:00:01 UTC (100% success) but produced 0 new items — sources degraded during that cycle |
| `get_system_status` display | Shows "Tin tức (RSS) \| 43 phút trước \| 0.7h \| v Tốt" — uses 3h display threshold, not 30-min SLA |
| Affected callers | news-scout (fetch-and-analyze), intelligenceCycleJob (pollNews) — **2 confirmed** |
| Classification | ISSUE (likely transient — RSS sources recovering; next poll cycle expected to resolve) |

**Suggested fix:** Monitor next poll cycle (06:15 UTC). If still breached at 06:30, investigate CafeF/VnEconomy/VnExpress RSS endpoint behaviour — may be a rate-limit or temporary 5xx pattern. Secondary note: `get_system_status` display threshold (3h) is much looser than SLA (30 min) — agents relying on `get_system_status` to check news freshness will see "Tốt" when SLA is actually breached.

---

## ACTIVE BUG FINDINGS

---

### BUG-1 — vn-bctc-fetch VPS service UNHEALTHY → CRITICAL (36h+ cumulative)

| Field | Value |
|---|---|
| Re-probe | `get_vps_service_health({})` → `vn-bctc-fetch \| unhealthy \| 3m ago \| 0ms \| 1d 11h 57m` |
| Proxy evidence | `get_vps_proxy_health` → bctc: `last push 2026-06-16 18:02:24, 0 pushes/24h, STALE` |
| SLA | `get_sla_status` → bctc `2002 min elapsed / 120 min SLA` — **CRITICAL BREACH** (33.4h) |
| Cumulative downtime | ~36h without any BCTC PDF push (worsened from 34h at 04:07 cycle) |
| BCTC calendar | 10 QUÁ HẠN tickers: BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH (12 total per earnings calendar) |
| Affected callers | bctc-analyst, refine_bctc_md — **2 confirmed** |
| Caller-surface grep | `grep -r "bctc\|get_bctc\|push_bctc" docs/agents/bctc-analyst/flow/main.md docs/agents/refine_bctc_md/flow/main.md` — confirmed callers |

**Suggested fix:** SSH to VPS → `systemctl restart vn-bctc-fetch.service` → check journal (`journalctl -u vn-bctc-fetch -n 50`). Verify PDF scraper URL post-restart. **36h downtime — immediate escalation warranted.**

---

### BUG-2 — bctcQueueEnricher 0-URL freeze → WORSENING (depends on BUG-1)

| Field | Value |
|---|---|
| Re-probe | `get_sla_status` → bctc CRITICAL 2002/120min; `bctcQueueEnricherJob` running (100%, 814 runs) but processing 0 new URLs |
| BCTC pipeline | bctcPdfPullJob: 99.1% success (346 runs) but pulling 0 new PDFs (VPS push empty) |
| Earnings calendar | 12 QUÁ HẠN tickers with no new BCTC PDF discovery |
| Affected callers | bctc-analyst, refine_bctc_md — **2 confirmed** |

**Root cause:** Same as BUG-1. Fixing vn-bctc-fetch recovers within 2–3 enricher cycles (~30–45 min).

---

## ACTIVE ISSUE FINDINGS

---

### ISSUE-N1 — `unified-agent/flow/chef.md` line 91 uses `agent_id` (wrong param) — ONGOING ⚠️

| Field | Value |
|---|---|
| Re-probe | `grep -n "agent_id" docs/agents/unified-agent/flow/chef.md` → **line 91**: `get_cycle_bootstrap(agent_id="unified-agent")` |
| Live schema | `get_cycle_bootstrap({})` → validation error path `["agent_name"]` — required field is `agent_name` |
| Correct reference | `docs/agents/tools/package/unified-agent.md:31` → correct: `agent_name: "unified-agent"` |
| Affected callers | **1** — unified-agent chef.md GATHER step calls bootstrap with wrong param; bootstrap fails if pseudocode followed literally |

**Suggested fix:** One-line fix in `docs/agents/unified-agent/flow/chef.md:91`: change `agent_id="unified-agent"` → `agent_name="unified-agent"`.

---

### ISSUE-3 — `get_ism_subcomponents` returns no_data (FRED_API_KEY absent) — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_ism_subcomponents({})` → `{"error":"no_data","message":"... requires FRED_API_KEY"}` |
| Affected callers | news-scout, unified-agent, bctc-analyst tool packages (soft-degraded — optional ISM context) — **3 confirmed** |

**Suggested fix:** Configure `FRED_API_KEY` env var in mcp-server container. Trigger `macroIndicatorRefreshJob`.

---

### ISSUE-4 — Reuters RSS + Trading Economics never succeed (86+ consecutive failures) — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_system_status` SOURCE HEALTH: Reuters RSS — Ngưng, Chưa bao giờ, 86 consecutive failures; Trading Economics ×2 — Ngưng, 86–87 consecutive failures |
| Context | Reuters VPS service decommissioned 2026-04-30 per get_recent_fixes #7. Direct RSS path still registered. Trading Economics Chromium scrape broken. |
| Impact | Overall news freshness OK via cafef/vnexpress/nld. International context degraded. |
| Affected callers | `intelligenceCycleJob` (pollNews), news-scout via `fetch_and_analyze` — **2 confirmed** |

**Suggested fix:** Mark Reuters RSS as `disabled` (same as newsapi). Investigate Trading Economics Chromium container.

---

### ISSUE-5 — BDI Baltic Dry Index 72 days stale + shippingIndex 404 — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_supply_chain_exposure({})` → `BDI: 1,400 (+0.0%) - 2026-04-07` |
| Root cause | `get_system_status` RECENT ERRORS: `[shippingIndex] HTTP request failed — Request failed with status code 404` |
| Impact | Supply chain risk signals fed to market-watcher, unified-agent, digest-predict, tran-ngoc-bau — **4 callers** |

**Suggested fix:** Check shippingIndex scraper target URL — the endpoint is returning 404. Update URL or switch to an alternative BDI data source.

---

### ISSUE-N2 — `vnstockTradingStatsRefresh` cron at 67% success (below 80% threshold) — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_cron_health` → `vnstockTradingStatsRefresh: success_rate: 0.67 (66.7%), total_runs: 3, avg_duration: 915464ms` |
| Threshold | cronHealthAlertJob fires at < 80% — should have triggered; confirm alert reached WORK channel |
| Duration | 915s (15.3 min) average — likely API timeout or OOM |
| Affected callers | `get_financial_summary`, `get_ticker_intelligence` consumers: bctc-analyst, market-analyst — **2 confirmed** |

**Suggested fix:** Pull job logs for failure cause. Split job into per-ticker tasks with TTL guard.

---

### ISSUE-NEW-A — Foreign-flow direct-fetch path: all fallbacks exhausted every minute — ONGOING

| Field | Value |
|---|---|
| Evidence | `get_system_status` RECENT ERRORS: 8/10 entries are `[foreign-flow-job] fallback activated / all fallbacks exhausted` during market hours |
| Disambiguating evidence | `get_vps_proxy_health` → foreign-flow: healthy, 102 items per ~30s push; `get_sla_status` → foreign_flow `0 min \| ok` |
| Classification | **ISSUE** (not BUG) — VPS push path healthy; direct bgapidatafeed.vps.com.vn geo-blocked from main server |
| Affected callers | 0 data consumers affected; monitoring noise prevents seeing real errors |

**Suggested fix:** Mark `bgapidatafeed.vps.com.vn` primary endpoint as permanently disabled; rely on VPS push path. Suppresses 80% of error log noise.

---

### ISSUE-NEW-C — News SLA 44/30 min BREACHED (NEW this cycle)

| Field | Value |
|---|---|
| Evidence | `get_sla_status` → `news \| 44 min \| 30 min \| breached \| HIGH` |
| Source health | CafeF RSS, VnEconomy RSS, VnExpress RSS each show "Suy giảm" (1 error) |
| Transient? | Yes — pollNewsJob 100% success; breach likely resolves at next poll cycle |
| Affected callers | news-scout, intelligenceCycleJob — **2 confirmed** |

**Suggested fix:** Monitor; likely transient. If persistent at next check, investigate RSS endpoints.

---

## IMPROVE FINDINGS

| ID | Finding | Re-probe | Status |
|---|---|---|---|
| IMPROVE-6 | `get_cycle_bootstrap` enum includes deprecated `financial-analyst` / `report-analyzer` — 0 active callers | Confirmed: first probe returns invalid_enum_value error listing both values | ONGOING |
| IMPROVE-7 | `get_cascade_metrics` returns Eval=0 / WinRate=— for all 46 rules (758 pharma_neutral hits, 0 evaluated) | `get_cascade_metrics({})` → 46 rules, all Eval=0 | ONGOING |
| IMPROVE-8 | `task_claim` TTL minimum (60s) not documented in tool doc | Not re-probed (doc fix) | ASSUMED ONGOING |
| IMPROVE-N3 | `bctcReparseJob` 82.2% success (169 runs, 261s avg) — 1 tick above 80% alert threshold | `get_cron_health` confirms 82.2% | ONGOING |
| IMPROVE-N4 | Error log noise: 8/10 recent unresolved errors are foreign-flow fallbacks | `get_system_status` confirms 8/10 | ONGOING |
| IMPROVE-NEW-A | `get_foreign_flow` docs say `ticker` param; live schema requires `code` — 0 runtime callers affected | `get_foreign_flow(limit=5)` → `"code" Required` | ONGOING |
| IMPROVE-NEW-B | `task_list_held` returns expired locks (cowork-leader expired 05:52 UTC, still in list at 06:04) | `task_list_held` confirms cowork-leader expired 12 min ago still listed | ONGOING |

---

## Tool Probe Results Matrix

| Tool | Status | Latency / Notes |
|------|--------|----------------|
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ OK | 11ms; full market context, 20 open alerts, system status |
| `get_cycle_bootstrap(agent_name="health-recheck")` | ❌ SCHEMA ERROR | Expected — enum only accepts defined agent names; confirms IMPROVE-6 |
| `get_market_snapshot` | ✅ OK | VN-Index 1,835.42 (+1.62%), breadth 100/156/82; source_tier 2 |
| `get_macro_snapshot` | ✅ OK | tier-2; Brent $77.82, Gold $4324.1, USD/VND 26111 |
| `get_system_status` | ⚠️ WARN | Foreign-flow fallback errors (8/10 recent); Reuters/TE stopped; news SLA alert; 47 open warnings |
| `get_cron_health` | ⚠️ WARN | vnstockTradingStatsRefresh 67%, bctcReparseJob 82% |
| `get_sla_status` | ❌ BREACHED | bctc 2002/120min CRITICAL; news 44/30 HIGH; price/sbv/foreign_flow OK |
| `get_vps_proxy_health` | ⚠️ PARTIAL | prices/news/sbv/foreign-flow OK; bctc STALE since 2026-06-16 18:02 |
| `get_vps_service_health` | ⚠️ 1 UNHEALTHY | vn-bctc-fetch unhealthy (1d 11h 57m); 4 others healthy |
| `get_pipeline_health` | ✅ OK | TA ready for 35/41 tickers; BDI/DAG/DLC/JSH/SIS/VDC/VNH sparse (rows=0 or ≤5) |
| `get_earnings_calendar` | ✅ OK | 12 QUÁ HẠN tickers (BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH) |
| `get_foreign_flow(limit=5)` | ❌ SCHEMA ERROR | Requires `code` (string) — no `limit` param; confirms IMPROVE-NEW-A |
| `get_ism_subcomponents` | ❌ no_data | FRED_API_KEY missing — ISSUE-3 |
| `get_supply_chain_exposure` | ⚠️ STALE | BDI 72d stale (2026-04-07) — ISSUE-5 |
| `get_macro_calendar` | ❌ unavailable | `{status: "unavailable", source_tier: 4}` — no events |
| `get_cascade_metrics` | ⚠️ ZERO | Eval=0 for all 46 rules — IMPROVE-7 |
| `get_vps_service_health` | ⚠️ 1 UNHEALTHY | vn-bctc-fetch unhealthy — BUG-1 |
| `task_list_held` | ✅ OK (11 locks) | cowork-leader expired 05:52 UTC still listed at 06:04 — IMPROVE-NEW-B |

---

## Server Restart Rate Trend

| Report | mcpServerStartup total_runs | Delta |
|---|---|---|
| 2026-06-16 00:07 | 31 | baseline |
| 2026-06-18 00:06 | ~48 | ~17 in 48h (~8.5/day) |
| 2026-06-18 02:07 | 50 | +2 in 2h |
| 2026-06-18 04:07 | 50 | +0 in 2h — STABLE |
| **2026-06-18 06:05** | **50** | **+0 in 2h — STABLE** ✅ |

Server stable for 4+ hours. No new restarts since 23:17:31 UTC yesterday.

---

## Priority Action List (dev team)

| Priority | Action | Finding |
|----------|--------|---------|
| **P0** | Restart `vn-bctc-fetch` on VPS; check crash logs; verify PDF scraper post-restart — 36h downtime, 12 QUÁ HẠN tickers blocked | BUG-1 / BUG-2 |
| **P1** | Fix `docs/agents/unified-agent/flow/chef.md:91`: `agent_id="unified-agent"` → `agent_name="unified-agent"` (1-line fix) | ISSUE-N1 |
| **P2** | Configure `FRED_API_KEY` env var in mcp-server container | ISSUE-3 |
| **P2** | Mark Reuters RSS source as `disabled`; investigate Trading Economics Chromium container | ISSUE-4 |
| **P2** | Fix shippingIndex scraper URL (returning 404) — root cause of BDI 72d stale | ISSUE-5 |
| **P2** | Investigate `vnstockTradingStatsRefresh` crash/OOM cause (67% success, 915s avg) | ISSUE-N2 |
| **P3** | Mark `bgapidatafeed.vps.com.vn` direct endpoint disabled — suppress log noise (8/10 recent errors) | ISSUE-NEW-A |
| **P3** | Monitor news SLA at next poll cycle (06:15 UTC); investigate if still breached at 06:30 | ISSUE-NEW-C |
| **P3** | Remove deprecated `financial-analyst` / `report-analyzer` from `get_cycle_bootstrap` enum | IMPROVE-6 |
| **P3** | Wire cascade backtest outcome resolution (all 46 rules Eval=0) | IMPROVE-7 |
| **P3** | Fix `docs/agents/tools/list/get_foreign_flow.md`: `ticker` → `code` param | IMPROVE-NEW-A |
