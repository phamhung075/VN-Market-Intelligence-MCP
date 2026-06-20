# Team MCP Tool Health Recheck — 2026-06-18T12:08Z

**Cycle:** 2026-06-18T12:08Z (second cycle today; first was 10:07Z)
**Agent:** health-recheck routine
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)` — REACHABLE ✅
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-18-1007.md`

---

## Executive Summary

**2 re-confirmed P0 BUGs** (worsened since 10:07 cycle):
- BCTC VPS pipeline has been down **~41+ hours** (vn-bctc-fetch UNHEALTHY), now at 2363 min SLA breach (was 2241 at 10:07). Affects ≥5 callers.
- SBV zero-value injections still recurring after service restart; data guard protecting DB but root cause not resolved.

**1 new BUG assumed ongoing (BUG-NEW-A):** `get_insider_signals` live schema demands `outstandingShares: number` (required), contradicting docs — breaks market-watcher + bctc-analyst.

**9 active ISSUEs and 5 IMPROVEs** documented below.

---

## STEP 3c — Prior-Finding Delta (Re-probe This Cycle)

| Finding ID | Prior Class | Status | Evidence |
|-----------|-------------|--------|----------|
| BUG-1 | BUG | **WORSENED** | vn-bctc-fetch: unhealthy | uptime 1d 17h 57m (was 1d 15h 57m at 10:07); 41h+ outage |
| BUG-2 | BUG | **WORSENED** | bctc SLA: 2363 min elapsed / 360 min threshold (was 2241 at 10:07) |
| BUG-NEW-A | BUG | **ASSUMED ONGOING** | get_insider_signals schema not re-probed (write-side risk); doc says optional, live requires outstandingShares |
| BUG-NEW-B (SBV) | BUG | **DOWNGRADED → ISSUE** | vn-sbv-fetch restarted ~11:22 UTC; 24 pushes/24h OK; but zero-value rejections still at 11:59:29 |
| ISSUE-N1 | ISSUE | **ONGOING** | chef.md:91 `agent_id="unified-agent"` (wrong); correct: `agent_name` |
| ISSUE-3 (ISM) | ISSUE | **ONGOING** | get_ism_subcomponents → no_data; macroIndicatorRefreshJob ran 2026-06-17 (100% success) but ISM rows empty |
| ISSUE-4 (Reuters/TE) | ISSUE | **WORSENED** | Reuters: 157 errors (was 136); TE×2: 157/158 (was 136/137); all "Ngưng", never connected |
| ISSUE-5 (BDI) | ISSUE | **ONGOING** | BDI stale 72d (last data 2026-04-07) |
| ISSUE-NEW-D (WTI) | ISSUE | **ONGOING** | wti_crude_usd stale at $95.5 (live Brent $78.46 — impossible divergence) |
| ISSUE-NEW-E (DJIA) | ISSUE | **ONGOING** | dow_jones stale at 23,750 (COVID 2020-era value; real ~42,000) |
| ISSUE-N2 (vnstock) | ISSUE | **ONGOING** | vnstockTradingStatsRefresh 80% success rate, 768s avg duration |
| IMPROVE-6 | IMPROVE | **ONGOING** | get_cycle_bootstrap enum includes deprecated agent names `financial-analyst`, `report-analyzer` |
| IMPROVE-N3 | IMPROVE | **SLIGHTLY IMPROVED** | bctcReparseJob 87.7% success (was 84.9% prior cycle) |
| IMPROVE-EVN | IMPROVE | **ONGOING** | get_energy_grid_signals returns estimate (70% renewables default) — EVN endpoint broken |
| IMPROVE-FF | IMPROVE | **ONGOING** | get_foreign_flow param drift (docs vs live schema) |
| ISSUE-NEW-A (FX log) | ISSUE | **ROTATED OUT** | Foreign-flow log spam no longer in top-10 errors; replaced by Telegram delete spam |

**NEW FINDING this cycle:**
| Finding ID | Class | Evidence |
|-----------|-------|----------|
| IMPROVE-NEW-F (TG delete) | IMPROVE | 9× `deleteTelegramBug ok=false` at 11:39:27–34 UTC; bot lacks delete-message permission on bug channel; masks real errors in error log |

---

## Active BUG Findings

### BUG-1 + BUG-2 — BCTC VPS Pipeline CRITICAL (P0)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P0 — Critical |
| **Uptime at probe** | 1d 17h 57m (vn-bctc-fetch UNHEALTHY on VPS) |
| **SLA breach** | 2363 min elapsed / 360 min SLA — CRITICAL |
| **Last push** | 2026-06-16 18:02:24 UTC (41h ago) |
| **24h pushes** | 0 |
| **Callers affected** | bctc-analyst, unified-agent (chef), digest-predict, market-analyst, refine_bctc_md, ops — **≥5 callers** |
| **Grep evidence** | `get_bctc_full\|get_bctc_ocf\|push_bctc_refined_unit` → 23 files |
| **Fix** | SSH to VPS → `systemctl restart vn-bctc-fetch`; check logs for root cause; monitor push count recovery |
| **Risk if unresolved** | bctc-analyst cannot run stage-analyze; unified-agent BCTC layer blind; digest-predict weekly report incomplete |

### BUG-NEW-A — `get_insider_signals` Schema Mismatch (P1)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P1 |
| **Evidence** | Live schema requires `outstandingShares: number`; `docs/agents/tools/list/get_insider_signals.md` marks it optional (auto-fetch from DB) |
| **Callers affected** | market-watcher `eod.md:59`, bctc-analyst `stage-analyze.md:49` — **2 callers** |
| **Fix** | Option A: make outstandingShares truly optional in live schema (restore auto-fetch). Option B: update all callers to pass outstandingShares. Option A preferred (minimal blast radius). |

---

## Active ISSUE Findings

### ISSUE-SBV — SBV Zero-Value Injections Recurring (P1, downgraded from BUG)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Evidence** | vn-sbv-fetch restarted ~11:22 UTC; pushes/24h = 24 (OK); BUT zero-value rejection still at 11:59:29 UTC: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` |
| **Data quality** | DB guard protecting data; no corruption |
| **Callers affected** | get_macro_snapshot, get_fed_liquidity_spread (uses SBV FX) — **~2 callers** |
| **Fix** | Investigate vn-sbv-fetch source: why does the response parse to zeros? Likely empty/malformed page response from SBV website. Check VPS proxy `/proxy/sbv` response body. |

### ISSUE-ISM — get_ism_subcomponents Returns no_data (P1)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Evidence** | `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| **Contradiction** | macroIndicatorRefreshJob ran 2026-06-17 12:13 UTC with 100% success rate |
| **Callers affected** | news-scout, unified-agent, bctc-analyst — **3 callers** |
| **Fix** | Verify FRED_API_KEY is set in mcp-server env. Check macroIndicatorRefreshJob logs — does it skip ISM series? Confirm ISM series IDs (NAPM, NMFCI) are included in job config. |

### ISSUE-N1 — chef.md:91 agent_id Drift (P1)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Evidence** | `docs/agents/unified-agent/flow/chef.md:91` uses `agent_id="unified-agent"` (wrong); correct param is `agent_name` per `get_cycle_bootstrap` schema |
| **Callers affected** | unified-agent (chef) — **1 caller** |
| **Fix** | Change `agent_id` → `agent_name` at chef.md:91 |

### ISSUE-Reuters — Reuters RSS + Trading Economics Never Connected (P2)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Evidence** | Reuters RSS: 157 consecutive errors; TE×2: 157/158 errors; all "Ngưng", never connected since tracking began |
| **Callers affected** | No direct agent flow files reference Reuters/TE; `fetch_and_analyze` works (20 VN articles) — **0 critical callers** |
| **Note** | Low priority; international sources optional for current cowork flows |
| **Fix** | Verify Reuters RSS URL still valid; check if geo-blocking or feed deprecation; consider removing from source list |

### ISSUE-BDI — Baltic Dry Index Stale 72 Days (P2)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Evidence** | BDI last data: 2026-04-07; 72d stale |
| **Callers affected** | get_supply_chain_exposure (uses BDI as freight proxy) — **1 caller** |
| **Fix** | Investigate BDI fetch source; update fetcher or data source |

### ISSUE-WTI — WTI Crude Stale at $95.5 (P2)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Evidence** | wti_crude_usd = $95.5 (impossible; live Brent = $78.46; WTI typically $2–5 below Brent) |
| **Callers affected** | get_macro_snapshot, get_energy_grid_signals — **~2 callers** |
| **Fix** | Force-refresh wti_crude_usd from commodity feed; check fetcher URL/parsing |

### ISSUE-DJIA — Dow Jones Stale at 23,750 (P2)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Evidence** | dow_jones = 23,750 (COVID 2020-era value; real Dow ~42,000 as of 2026) |
| **Callers affected** | get_macro_snapshot — **1 caller** |
| **Fix** | Force-refresh DJIA from Yahoo Finance or equivalent; check fetcher |

### ISSUE-vnstock — vnstockTradingStatsRefresh 80% Success (P2)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Evidence** | 80% success rate, 768s avg duration (borderline at cronHealthAlertJob threshold) |
| **Callers affected** | get_market_snapshot, get_pipeline_health — **~2 callers** |
| **Fix** | Review failure reasons; consider extending timeout or fixing partial failures |

---

## Active IMPROVE Findings

### IMPROVE-NEW-F — deleteTelegramBug Bot Permission (NEW)

| Field | Value |
|-------|-------|
| **Class** | IMPROVE |
| **Evidence** | 9× `[telegram] deleteTelegramBug: Telegram API returned ok=false` at 11:39:27–34 UTC |
| **Source** | `apps/mcp-server/src/infrastructure/notifiers/telegram.ts` `deleteTelegramBug()` |
| **Impact** | Pollutes error log; masks real errors (SBV rejection at 11:59 was near-invisible) |
| **Fix** | Option A: Grant bot delete-message admin on bug channel. Option B: Suppress WARN when `ok=false` for delete (expected if bot lacks permission). Option C: Remove auto-delete logic. |

### IMPROVE-6 — Bootstrap Deprecated Agent Enum Names

| Field | Value |
|-------|-------|
| **Class** | IMPROVE |
| **Evidence** | `get_cycle_bootstrap` enum still accepts `financial-analyst`, `report-analyzer` (deprecated agent names) |
| **Fix** | Prune deprecated enum values from bootstrap schema |

### IMPROVE-N3 — bctcReparseJob 87.7% Success Rate

| Field | Value |
|-------|-------|
| **Class** | IMPROVE |
| **Evidence** | 87.7% success (slightly improved from 84.9%); remaining 12.3% failures uninvestigated |
| **Fix** | Review reparse failure logs; categorize failure modes |

### IMPROVE-EVN — Energy Grid Using Estimate

| Field | Value |
|-------|-------|
| **Class** | IMPROVE |
| **Evidence** | `get_energy_grid_signals` returns `using_estimate: true, renewables_pct: 70` (EVN endpoint broken) |
| **Fix** | Investigate EVN endpoint URL; check if page structure changed |

### IMPROVE-FF — get_foreign_flow Param Drift

| Field | Value |
|-------|-------|
| **Class** | IMPROVE |
| **Evidence** | Documented params differ from live schema |
| **Fix** | Sync `docs/agents/tools/list/get_foreign_flow.md` with live schema |

---

## Full Probe Results Matrix

| Tool | Status | Latency | Notes |
|------|--------|---------|-------|
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ PASS | ~12ms | Full context returned |
| `get_market_snapshot` | ✅ PASS | fast | VN-Index 1830.47 +1.34%, source_tier:2 |
| `get_macro_snapshot` | ✅ PASS | fast | Live data, source_tier:2; wti/djia stale values present |
| `get_watchlist` | ✅ PASS | fast | 41 tickers |
| `get_week_period` | ✅ PASS | fast | W25 (2026-06-15/2026-06-21) |
| `get_earnings_calendar` | ✅ PASS | fast | 12 overdue, 29 filed |
| `get_alerts` | ✅ PASS | fast | 20 alerts; VIC/VHM/VRE +6.9% surge |
| `get_cron_health` | ✅ PASS | fast | Most jobs 99-100%; 2 borderline |
| `task_list_held` | ✅ PASS | fast | 10 locks, coordination healthy |
| `get_pipeline_health` | ✅ PASS | fast | 41 tickers TA-ready, 6 not ready |
| `get_agent_signals(agent="market-watcher")` | ✅ PASS | fast | No new signals |
| `get_technical_indicators(code="VCB")` | ✅ PASS | fast | source_tier:3 |
| `get_price_history(code="VCB", days=7)` | ✅ PASS | fast | 6 rows |
| `get_sla_status` | ⚠️ PARTIAL | fast | 4/5 OK; bctc CRITICAL (2363 min) |
| `get_fed_liquidity_spread` | ✅ PASS | fast | source_tier:1, EFFR 3.63 |
| `get_crisis_early_warning` | ✅ PASS | fast | No crisis signals |
| `get_legal_risk_signals` | ✅ PASS | fast | 11 signals |
| `get_market_hexagram` | ✅ PASS | fast | Hexagram 36 |
| `fetch_and_analyze` | ✅ PASS | fast | 20 VN articles (Reuters/TE skipped) |
| `get_market_context` | ✅ PASS | fast | — |
| `get_sector_rotation` | ✅ PASS | fast | 1-day data only |
| `get_recent_fixes` | ✅ PASS | fast | Last fix 2026-05-12 |
| `get_ism_subcomponents` | ❌ FAIL | fast | no_data (FRED_API_KEY or job config issue) |
| `get_system_status` | ⚠️ DEGRADED | fast | vn-bctc-fetch UNHEALTHY; deleteTelegramBug errors in top logs |
| `get_vps_proxy_health` | ⚠️ DEGRADED | fast | bctc: 0 pushes/24h STALE; sbv: 24 pushes OK but zero-value pattern |

---

## Priority Action List

| Priority | Action | Owner | Finding |
|----------|--------|-------|---------|
| **P0** | SSH to VPS → `systemctl restart vn-bctc-fetch` | ops / dev-vps-crawls | BUG-1/2 |
| **P0** | Investigate SBV zero-value parse issue on VPS `/proxy/sbv` response | dev-vps-crawls | ISSUE-SBV |
| **P1** | Fix `get_insider_signals` — restore outstandingShares as optional (auto-fetch) | dev-mcp-server | BUG-NEW-A |
| **P1** | Fix chef.md:91: `agent_id` → `agent_name` | agent-father | ISSUE-N1 |
| **P1** | Investigate FRED_API_KEY / macroIndicatorRefreshJob ISM series config | dev-macro-indicators | ISSUE-ISM |
| **P2** | Grant bot delete-message permission on bug channel OR suppress ok=false WARN | dev-mcp-server | IMPROVE-NEW-F |
| **P2** | Force-refresh WTI crude and DJIA data | dev-macro-indicators | ISSUE-WTI, ISSUE-DJIA |
| **P2** | Investigate Reuters RSS URL validity; TE connection failures | dev-mainserver-crawls | ISSUE-Reuters |
| **P2** | Investigate BDI fetcher (72d stale) | dev-mainserver-crawls | ISSUE-BDI |
| **P3** | Prune deprecated enum values from get_cycle_bootstrap schema | dev-mcp-server | IMPROVE-6 |
| **P3** | Investigate bctcReparseJob 12.3% failure modes | dev-pdf-extractor | IMPROVE-N3 |
| **P3** | Fix EVN endpoint for energy grid signals | dev-mainserver-crawls | IMPROVE-EVN |
| **P3** | Sync get_foreign_flow docs with live schema | cowork-refactory-expert | IMPROVE-FF |

---

## Server Restart Trend

| Metric | Value |
|--------|-------|
| Total server starts | 50 |
| Starts since 23:17:31 yesterday | 0 (stable) |
| Last restart | 2026-06-17 23:17:31 UTC |
| vn-bctc-fetch | UNHEALTHY (1d 17h 57m) |
| vn-sbv-fetch | Restarted ~11:22 UTC; now ~44m uptime at 12:04 probe |

---

## Report Metadata

| Field | Value |
|-------|-------|
| Report path | `docs/agent-memory/health/team-tool-recheck-2026-06-18-1208.md` |
| Prior report | `docs/agent-memory/health/team-tool-recheck-2026-06-18-1007.md` |
| Probes run | 25 tools |
| PASS | 20 |
| FAIL/DEGRADED | 5 |
| Active BUGs | 3 (BUG-1, BUG-2, BUG-NEW-A) |
| Active ISSUEs | 8 |
| Active IMPROVEs | 5 |
| Resolved since 10:07 | 1 (ISSUE-NEW-A foreign-flow log spam rotated out) |
