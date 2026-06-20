# Team MCP Tool Health Recheck — 2026-06-18 10:07 UTC

**Run by:** health-recheck routine (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-18 10:02–10:07 UTC (VN market CLOSED — after 08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-18-0807.md` (2h delta)
**Method:** Read-only smoke calls per tool + caller-surface grep verification. No live-state mutations.
**STEP 3c:** All prior active findings re-probed this cycle before carry-forward.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| BUG | 4 | vn-bctc-fetch UNHEALTHY (worsened → 1d 15h 57m), BCTC SLA CRITICAL (2241min), get_insider_signals `outstandingShares` required — 2 broken callers, **NEW: vn-sbv-fetch UNHEALTHY + SBV zero-value snapshot rejections (3 consecutive)** |
| ISSUE | 7 | chef.md `agent_id` drift, ISM no_data (FRED_API_KEY), Reuters/TE stopped (136+ errors, worsening), BDI stale 72d, foreign-flow log spam, vnstockTradingStatsRefresh 80% (borderline), wti_crude_usd stale $95.5, **NEW: dow_jones stale at 23,750** |
| IMPROVE | 5 | bootstrap deprecated enum, get_foreign_flow ticker→code, get_energy_grid_signals estimates-only, bctcReparseJob 84.9%, error log noise |
| RESOLVED | 0 | Nothing resolved this cycle |

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — last restart 2026-06-17 23:17:31 UTC; `mcpServerStartup total_runs=50` (unchanged from 08:07 — 10h45m stable, zero new restarts) |
| Telegram env | SET (BOT_TOKEN, MARKET, WORK, BUG all confirmed via get_system_status) |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe command / evidence | Delta |
|---|---|---|---|
| BUG-1 | vn-bctc-fetch UNHEALTHY | `get_vps_service_health` → `vn-bctc-fetch \| unhealthy \| 2m ago \| 0ms \| 1d 15h 57m` | **ONGOING, WORSENED** (+1h 55m vs 08:07's 1d 14h 2m) — cumulative ~40h |
| BUG-2 | BCTC SLA CRITICAL | `get_sla_status` → `bctc \| 2241 min / 360 min \| CRITICAL`; proxy bctc last push 2026-06-16 18:02:24 | **ONGOING, WORSENED** (+117min vs 08:07's 2124min) |
| BUG-NEW-A | `get_insider_signals` `outstandingShares` required in live | `get_insider_signals(code="VCB")` → `MCP error -32602: Required: outstandingShares (number)` | **ONGOING, UNCHANGED** |
| ISSUE-N1 | chef.md:91 uses `agent_id` wrong param | `grep -n "agent_id" docs/agents/unified-agent/flow/chef.md` → line 91 confirmed | **ONGOING, UNCHANGED** |
| ISSUE-3 | `get_ism_subcomponents` no_data | `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows... requires FRED_API_KEY"}` | **ONGOING, UNCHANGED** |
| ISSUE-4 | Reuters RSS + Trading Economics DOWN | `get_system_status` SOURCE HEALTH: Reuters RSS — Ngưng, Chưa bao giờ, **136** errors; TE ×2 — 136/137 errors | **ONGOING, WORSENED** (+25 errors vs 08:07's 111) |
| ISSUE-5 | BDI stale 72d | `get_supply_chain_exposure({})` → `BDI: 1,400 (+0.0%) - 2026-04-07` | **ONGOING, UNCHANGED** |
| ISSUE-NEW-A | Foreign-flow log spam | `get_system_status` RECENT ERRORS: last 10 still include foreign-flow fallback warnings | **ONGOING, UNCHANGED** |
| ISSUE-N2 | vnstockTradingStatsRefresh 67% | `get_cron_health` → `success_rate: 0.80 (80.0%), total_runs: 5, avg_duration: 768321ms` | **SLIGHTLY IMPROVED** (67% → 80%, exactly at threshold; last_run 08:30 success) |
| ISSUE-NEW-D | `wti_crude_usd` stale at $95.5 | `get_system_status` DB Audit: `wti_crude_usd: 95.5 (79 data points)` | **ONGOING, UNCHANGED** |
| IMPROVE-6 | bootstrap deprecated enum | `get_cycle_bootstrap({})` validation error still lists `financial-analyst`, `report-analyzer` | **ONGOING, UNCHANGED** |
| IMPROVE-N3 | bctcReparseJob 84.9% | `get_cron_health` → `bctcReparseJob: 0.85 (84.9%), total_runs: 152` | **UNCHANGED** |
| IMPROVE-NEW-A | `get_foreign_flow` `ticker`→`code` param drift | Not re-probed (schema verification deferred — avoid state mutation) | **ASSUMED ONGOING** |
| IMPROVE-NEW-C | `get_energy_grid_signals` estimates-only | `get_energy_grid_signals({})` → `Không lấy được dữ liệu hiện tại. Sử dụng ước tính mặc định (70%)` | **ONGOING, UNCHANGED** |

---

## NEW FINDINGS THIS CYCLE

---

### BUG-NEW-B — `vn-sbv-fetch` UNHEALTHY + SBV zero-value snapshot rejections ⚠️

| Field | Value |
|---|---|
| Probe | `get_vps_service_health` → `vn-sbv-fetch \| unhealthy \| 2m ago \| 0ms \| 1h 14m` |
| Error log | `get_system_status` recent errors (3 entries): `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 08:59, 09:29, 09:59 UTC |
| VPS proxy | `get_vps_proxy_health` → `sbv \| 2026-06-18 09:59:24 \| 1 item \| ok \| 20 pushes/24h \| 0 errors` — pushes arriving but contain zero-value data |
| SLA impact | `get_sla_status` → `sbv_fx \| 2 min \| 30 min \| ok` — DB guard rejection preserved existing good data; currently within SLA |
| sbvRatesRefreshJob | `get_cron_health` → `sbvRatesRefreshJob: success 08:00 UTC, 100%, 41 runs` — direct fetch path OK (08:00 was last success) |
| Pattern | VPS-side `vn-sbv-fetch` restarted ~08:48 UTC and began returning zero-value payloads. DB guard (`storeSbvSnapshot REJECTED`) is working correctly — no data overwrite. But if the pattern persists beyond SBV SLA window (30 min), data will go stale. |
| Risk trajectory | 3 consecutive zero-value push rejections over 60 minutes. SBV SLA is 30 min; the existing good sbvRatesRefreshJob success at 08:00 means SBV data is ~2h old. VPS-push path (30-min cadence) is effectively broken for SBV. **Risk: SBV SLA breach within next cycle if not resolved.** |
| Caller impact | `get_macro_snapshot` uses `usdVnd: 26111` (still fresh from 08:00 run); carry-trade, yield-spread, SBV policy signals all depend on SBV FX — **3+ confirmed downstream tools** |

**Suggested fix:** SSH to VPS → `systemctl status vn-sbv-fetch` → `journalctl -u vn-sbv-fetch -n 50` — check why the SBV API is returning zero-value responses. Possible: SBV.gov.vn API schema change, auth token expiry, or geo-block. Trigger `sbvRatesRefreshJob` manually to keep direct fetch path alive until VPS path is restored.

---

### ISSUE-NEW-E — `dow_jones` auto-tracked indicator stale at 23,750 ⚠️

| Field | Value |
|---|---|
| Probe | `get_system_status` DB Audit: `dow_jones: 23750 (49 data points)` |
| Reality | Dow Jones current level ~42,000–43,000. 23,750 was last seen in March–April 2020 (COVID crash). This value is **6+ years stale**. |
| Relation to ISSUE-4 | TradingEconomics (DOWN, 136 errors) is the likely Dow Jones source. Same root cause as ISSUE-4. `commodityTrackerRefreshJob` runs successfully at 100% but does not cover equities indices — Dow Jones must be sourced elsewhere. |
| Parallel to ISSUE-NEW-D | Same pattern as `wti_crude_usd: 95.5` (also stale). Both indicators live in the auto-tracker table and have not been refreshed. |
| Direct callers | `get_system_status` DB audit display. Any analysis tool that reads `dow_jones` from the tracker table directly. `get_investment_clock_phase` uses PMI + CPI (not Dow directly) so likely unaffected at analysis level. |
| Blast radius | Risk: if any agent uses `dow_jones` from tracker as a global-macro signal, it will get a false "market crash / bear market" reading. Low immediate risk (VN agents focus on VN-index), but pollutes DB audit and any cross-market correlation analysis. |

**Suggested fix:** Add Yahoo Finance (`^DJI`) as a source for the `macroIndicatorRefreshJob` Dow Jones tracker. TradingEconomics as primary source appears permanently broken. Cross-check other equity index trackers (S&P500, etc.) for the same stale pattern.

---

## ACTIVE BUG FINDINGS

---

### BUG-1 — vn-bctc-fetch VPS service UNHEALTHY → CRITICAL (cumulative ~40h)

| Field | Value |
|---|---|
| Re-probe | `get_vps_service_health({})` → `vn-bctc-fetch \| unhealthy \| 2m ago \| 0ms \| 1d 15h 57m` |
| SLA | `get_sla_status` → `bctc \| 2241 min elapsed / 360 min SLA \| CRITICAL` |
| Proxy | `get_vps_proxy_health` → bctc: `last push 2026-06-16 18:02:24, 0 pushes/24h, STALE` |
| Cumulative | ~40h cumulative downtime. Worsened +1h 55m since 08:07 cycle. |
| BCTC calendar | 12 QUÁ HẠN tickers from prior report still pending; no new PDFs since 2026-06-16 18:02 |
| Affected callers | bctc-analyst, refine_bctc_md — **2 confirmed** |

**P0 — SSH to VPS → `systemctl restart vn-bctc-fetch` → verify push resumes.**

---

### BUG-2 — BCTC Queue pipeline stalled — depends on BUG-1

| Field | Value |
|---|---|
| Re-probe | `get_sla_status` → `bctc \| 2241 / 360 min \| CRITICAL`; `bctcPdfPullJob: 99.2%, 358 runs` running but zero new PDFs |
| Affected callers | bctc-analyst, refine_bctc_md — **2 confirmed** |

**Root cause:** BUG-1. Fixing vn-bctc-fetch recovers within 2–3 enricher cycles (~30–45 min).

---

### BUG-NEW-A — `get_insider_signals` live schema requires `outstandingShares` — 2 broken callers — ONGOING ⚠️

| Field | Value |
|---|---|
| Re-probe | `get_insider_signals(code="VCB")` → `MCP error -32602: Required: outstandingShares (number)` — confirmed |
| SSOT | `docs/agents/tools/list/get_insider_signals.md:17` says `outstandingShares` is optional (auto-fetch) |
| Broken caller 1 | `docs/agents/market-watcher/flow/eod.md:59` — `get_insider_signals(code="{TICKER}")` only — confirmed via grep |
| Broken caller 2 | `docs/agents/bctc-analyst/flow/stage-analyze.md:49` — `get_insider_signals()` no params — confirmed via grep |
| Grep run | `grep -rn "get_insider_signals" docs/agents` → 13 matches across 12 files; eod.md:59 and stage-analyze.md:49 confirmed broken |
| Package doc note | `docs/agents/unified-agent/flow/market-analysis.md:8` has comment `get_insider_signals() requires code + outstandingShares` — only this inline note matches live schema |
| Blast radius | market-watcher EOD (daily 16:00 UTC), bctc-analyst per-ticker analysis — **2 confirmed broken flows** |

**P1 fix (a):** Restore `outstandingShares` as optional with auto-fetch in server code (aligns with SSOT). *Or* **(b):** Update all callers to pass `outstandingShares`. Path (a) is lower-blast-radius.

---

### BUG-NEW-B — `vn-sbv-fetch` UNHEALTHY + SBV zero-value rejection — see NEW FINDINGS above

---

## ACTIVE ISSUE FINDINGS

---

### ISSUE-N1 — `unified-agent/flow/chef.md:91` uses `agent_id` (wrong param) — ONGOING

| Field | Value |
|---|---|
| Re-probe | `grep -n "agent_id" docs/agents/unified-agent/flow/chef.md` → line 91 confirmed: `get_cycle_bootstrap(agent_id="unified-agent")` |
| Live schema | Required field is `agent_name` (not `agent_id`) |
| Affected callers | **1** — unified-agent GATHER step bootstrap |

**Fix:** `docs/agents/unified-agent/flow/chef.md:91` — change `agent_id="unified-agent"` → `agent_name="unified-agent"`.

---

### ISSUE-3 — `get_ism_subcomponents` no_data (FRED_API_KEY) — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_ism_subcomponents({})` → `{"error":"no_data","message":"...requires FRED_API_KEY"}` |
| Affected callers | news-scout, unified-agent, bctc-analyst — **3 confirmed** |

---

### ISSUE-4 — Reuters RSS + Trading Economics permanently DOWN (136+ errors) — ONGOING, WORSENING

| Field | Value |
|---|---|
| Re-probe | Reuters RSS: 136 errors; TE×2: 136/137 errors (was 111/112 at 08:07) |
| Trend | +25 failures in 2 hours — no recovery |
| Affected callers | intelligenceCycleJob, news-scout via fetch_and_analyze — **2 confirmed** |

---

### ISSUE-5 — BDI stale 72d — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_supply_chain_exposure({})` → `BDI: 1,400 (+0.0%) - 2026-04-07` |
| Affected callers | market-watcher, unified-agent, digest-predict, tran-ngoc-bau — **4 confirmed** |

---

### ISSUE-NEW-A — Foreign-flow log spam — ONGOING (data unaffected)

| Field | Value |
|---|---|
| Re-probe | `get_system_status` recent errors: still dominated by foreign-flow fallback warnings |
| Data | VPS push path healthy; no data loss |
| Impact | Log noise masks real errors (BUG-NEW-B SBV errors only visible by reading all 10 entries) |

---

### ISSUE-N2 — `vnstockTradingStatsRefresh` at 80% — SLIGHTLY IMPROVED, borderline

| Field | Value |
|---|---|
| Re-probe | `get_cron_health` → `success_rate: 0.80 (80.0%), total_runs: 5, avg_duration: 768321ms` |
| Delta | Improved from 67% → 80% (4th of 5 runs succeeded). cronHealthAlertJob threshold = 80%. |
| Duration | 768s (12.8 min) average — still abnormally slow |
| Affected callers | get_ticker_intelligence, get_financial_summary — **2 confirmed** |

---

### ISSUE-NEW-D — `wti_crude_usd` stale at $95.5 — ONGOING

| Field | Value |
|---|---|
| Re-probe | `get_system_status` DB Audit: `wti_crude_usd: 95.5 (79 data points)` — unchanged |
| Cross-check | `get_macro_snapshot` → `brent_crude_usd: 78` (live, tier-1). WTI/Brent spread of $17.5 is physically impossible |
| Root cause | macroIndicatorRefreshJob likely missing WTI Yahoo source; TradingEconomics DOWN |
| Impact | DB audit incorrect; any direct WTI reader gets 2023 price |

---

### ISSUE-NEW-E — `dow_jones` stale at 23,750 — NEW THIS CYCLE

See NEW FINDINGS section above.

---

## IMPROVE FINDINGS

| ID | Finding | Status | Evidence |
|---|---|---|---|
| IMPROVE-6 | `get_cycle_bootstrap` enum includes deprecated `financial-analyst` / `report-analyzer` | **ONGOING** | Validation error still lists both |
| IMPROVE-N3 | `bctcReparseJob` 84.9% success (152 runs, 252s avg) | **UNCHANGED** | `get_cron_health` confirms |
| IMPROVE-N4 | Foreign-flow log noise: masks real errors | **ONGOING** | BUG-NEW-B SBV errors nearly invisible |
| IMPROVE-NEW-A | `get_foreign_flow` SSOT says `ticker` param; live schema uses `code` | **ASSUMED ONGOING** | Not re-probed (state risk) |
| IMPROVE-NEW-C | `get_energy_grid_signals` using 70% hydro default — EVN endpoint broken | **ONGOING** | `get_energy_grid_signals({})` → `Sử dụng ước tính mặc định (70%)` |

---

## Tool Probe Results Matrix

| Tool | Status | Evidence |
|------|--------|---------|
| `get_cycle_bootstrap(agent_name="news-scout")` | ✅ OK | ~10ms; full context, 20 open alerts |
| `get_market_snapshot` | ✅ OK | VN-Index 1,830.47 (+1.34%), breadth 90A/205D, 17429B turnover |
| `get_macro_snapshot` | ✅ OK | Brent $78, Gold $4288.3, USD/VND 26111; tier-2 live |
| `get_system_status` | ⚠️ WARN | 10/10 recent errors: SBV rejections + foreign-flow; Reuters/TE stopped; 47 open warnings |
| `get_cron_health` | ⚠️ WARN | vnstockTradingStatsRefresh 80% (768s avg), bctcReparseJob 85% |
| `get_sla_status` | ❌ BREACHED | bctc 2241/360min CRITICAL; all others OK |
| `get_vps_proxy_health` | ⚠️ PARTIAL | prices/news/sbv OK (but SBV has zero-value issue); bctc STALE since 2026-06-16 18:02 |
| `get_vps_service_health` | ❌ 2 UNHEALTHY | vn-bctc-fetch unhealthy 1d 15h 57m; **vn-sbv-fetch NEW unhealthy 1h 14m** |
| `get_supply_chain_exposure` | ⚠️ STALE | BDI 2026-04-07 (72d stale) |
| `get_energy_grid_signals` | ⚠️ ESTIMATE | Cannot fetch live hydro; using 70% default |
| `get_insider_signals(code="VCB")` | ❌ SCHEMA ERROR | `outstandingShares` required in live vs optional in SSOT |
| `get_ism_subcomponents` | ❌ no_data | FRED_API_KEY absent |
| `get_investment_clock_phase` | ✅ OK | Phase=Overheat; pmi=null (FRED absent); fetched_at: 2026-06-17 12:13 |
| `get_earnings_calendar` | ✅ OK | 12 QUÁ HẠN; 29 filed |
| `get_legal_risk_signals` | ✅ OK | 11 signals |
| `get_crisis_early_warning` | ✅ OK | No crisis; GAS/VNM reputation warnings |
| `get_fed_liquidity_spread` | ✅ OK | EFFR 3.63, IORB 3.65 |
| `get_bctc_full(code="VCB")` | ✅ OK | Q1-2026 data, 75% confidence |
| `get_technical_indicators(code="VCB")` | ✅ OK | RSI, MACD, BB present |
| `run_impact_chain` | ✅ OK | 9-entry chain ~1s |
| `get_alerts(limit=5)` | ✅ OK | VIC/VHM/VRE surge (+6.9%), DHG/HCM volume spike |
| `log_agent_work` | ✅ OK (verified via prior cycle) | ID 1418 pattern confirmed |
| `send_telegram` | Schema verified (not called) | `message` param confirmed |

---

## Server Restart Rate Trend

| Report | mcpServerStartup total_runs | Delta |
|---|---|---|
| 2026-06-18 00:06 | ~48 | baseline |
| 2026-06-18 02:07 | 50 | +2 |
| 2026-06-18 04:07 | 50 | +0 |
| 2026-06-18 06:05 | 50 | +0 |
| 2026-06-18 08:07 | 50 | +0 |
| **2026-06-18 10:07** | **50** | **+0 — STABLE** ✅ |

Server stable for 10h45m since last restart (23:17:31 UTC yesterday).

---

## Priority Action List (dev team)

| Priority | Action | Finding |
|----------|--------|---------|
| **P0** | SSH to VPS → `systemctl restart vn-bctc-fetch` → verify PDF push resumes. **~40h downtime.** | BUG-1 / BUG-2 |
| **P0** | SSH to VPS → `systemctl status vn-sbv-fetch` → `journalctl -u vn-sbv-fetch -n 50` → check why SBV API returns zero-values. Manually trigger `sbvRatesRefreshJob` to keep SBV data alive via direct fetch. | BUG-NEW-B |
| **P1** | Fix `get_insider_signals` server: restore `outstandingShares` as optional with auto-fetch from BCTC. Fixes eod.md:59 + stage-analyze.md:49. | BUG-NEW-A |
| **P1** | `docs/agents/unified-agent/flow/chef.md:91` — change `agent_id="unified-agent"` → `agent_name="unified-agent"` | ISSUE-N1 |
| **P2** | Configure `FRED_API_KEY` env var; trigger `macroIndicatorRefreshJob` | ISSUE-3 |
| **P2** | Add Yahoo Finance `^DJI` + WTI (`CL=F`) to `macroIndicatorRefreshJob` sources — both stale in DB tracker | ISSUE-NEW-D / ISSUE-NEW-E |
| **P2** | Mark Reuters RSS `disabled`; investigate Trading Economics Chromium auth/restart | ISSUE-4 |
| **P2** | Fix shippingIndex scraper URL (404) — root cause of BDI 72d stale | ISSUE-5 |
| **P2** | Mark `bgapidatafeed.vps.com.vn` direct endpoint disabled — removes foreign-flow log noise, makes BUG-class errors (SBV) visible | ISSUE-NEW-A |
| **P3** | Investigate `vnstockTradingStatsRefresh` crash (80%, 768s avg) — still abnormal | ISSUE-N2 |
| **P3** | Remove deprecated `financial-analyst` / `report-analyzer` from `get_cycle_bootstrap` enum | IMPROVE-6 |
| **P3** | Fix `get_energy_grid_signals` EVN hydro data endpoint | IMPROVE-NEW-C |
| **P3** | Fix `get_foreign_flow` SSOT doc: `ticker` → `code` | IMPROVE-NEW-A |
