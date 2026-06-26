# Team MCP Tool Health Recheck — 2026-06-22T18:05 UTC

**Run type:** Scheduled health-recheck (cloud agent)
**Gateway:** vn-market reachable ✅ (get_system_status returned in <100ms)
**Probe scope:** 21 tools probed across cowork + dev agent dependency graph
**Methodology:** STEP 3b caller-surface verification + STEP 3c re-probe (fresh this cycle, no carry-forward)

---

## ACTIVE FINDINGS

| # | Tool / Component | Class | Evidence | Callers Affected | Suggested Fix |
|---|---|---|---|---|---|
| F1 | `vn-bctc-fetch` VPS service | **BUG** | `get_vps_service_health`: status=unhealthy, response_time=0ms, uptime=0. `get_vps_proxy_health`: bctc last push 2026-06-16T18:02 (6 days ago), 0 pushes/24h. `get_sla_status`: BCTC SLA CRITICAL — 8482/360 min. | `bctc-analyst` (cycle uses `get_bctc_full`, `get_bctc_series`, `push_bctc_refined_unit`); `refine_bctc_md` (push pipeline); 11 watchlist tickers overdue per `get_earnings_calendar` (BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH) | SSH into Vinahost VPS; restart `vn-bctc-fetch.service`; check `journalctl -u vn-bctc-fetch` for crash cause. Prior: StartLimitHit pattern (see fix #2 2026-05-02). |
| F2 | SBV `storeSbvSnapshot` zero-value REJECTED | **BUG** | `get_system_status` recent errors: 6 occurrences in last 2h at 15:03/15:33/16:03/16:33/17:03/17:33 UTC — `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row`. `get_sla_status`: sbv_fx breached HIGH at 34/30 min. `sbvRatesRefreshJob` success_rate 98.1% (54 runs). VPS proxy shows sbv HEALTHY with 37 pushes/24h (0 errors) — VPS is pushing but mcp-server rejects zero values. | All agents consuming `get_macro_snapshot` that rely on fresh USD/VND rates: `market-watcher`, `unified-agent` (chef.md), `news-scout` (stage-bootstrap), `system-auditor`, `fb-market-poster`. Macro data is currently readable but sbv_fx is ~34 min stale (threshold 30 min). | Investigate SBV VPS scraper output: are rates parsed as 0 intermittently? Check `vps-scripts/vn-sbv-fetch.sh` parsing logic. The guard prevents overwrite (good), but the root cause — why SBV API returns zero rows intermittently — needs diagnosis. |
| F3 | Reuters RSS + Trading Economics STOPPED | **ISSUE** | `get_system_status` source health: `Reuters RSS | Ngưng | Chưa bao giờ | 175 ⚠` and `Trading Economics (x2) | Ngưng | Chưa bao giờ | 175 ⚠`. "Chưa bao giờ" = never succeeded. Circuit breakers for `reuters` and `tradingEconomics` show 0 failures (CB OK). | News pipeline quality (less diverse source coverage). `pollNews` callers and news-scout get news from other sources. Reuters was decommissioned per fix #7 (2026-04-30). Trading Economics chromium-based, may require separate setup. | **Verify intent**: if Reuters and Trading Economics are intentionally decommissioned/disabled, remove them from the source health registry to stop spurious 175-failure entries. If they should work, investigate. |
| F4 | ISM subcomponents empty (FRED_API_KEY) | **ISSUE** | `get_ism_subcomponents` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`. System logged `[WARN] [get_ism_subcomponents] no ISM data in fred_series_daily` at 16:05:58. `imfIndicatorPollerJob` 100% success rate (38 runs) — IMF works, but FRED ISM path is separate. | `system-auditor` (macro sweep), any agent reading ISM context in `get_macro_snapshot`. Non-fatal but macro analysis loses ISM sub-component signal. | Verify `FRED_API_KEY` is set in mcp-server environment. If key is missing, add it and trigger `macroIndicatorRefreshJob` manually. |
| F5 | `intelligence-cycle` overlap (cycle runs >15min) | **ISSUE** | `get_system_status` recent: `[WARN] [intelligence-cycle] previous cycle still running — skipped` at 16:15 UTC. `intelligenceCycleJob`: success_rate 99.8%, avg_duration 28,010ms (28s avg). | `intelligenceCycleJob` consumers (news pipeline, price alerts). A 28s avg with occasional overlap at the 15-min boundary means some cycles run 15+ min. Not data-loss, but cycle-skip wastes a polling window. | Investigate why some cycles take >15min. Consider adding timeout or adjusting cron to `*/20 min` if 28s average occasionally spikes 10–30x. |
| F6 | `get_technical_indicators` example in package doc uses wrong param | **IMPROVE** | `docs/agents/tools/package/market-watcher.md:177` shows `arguments: { ticker: "FPT" }` — server requires `code`, not `ticker`. Probe confirmed: calling with `ticker` → `invalid_type, path: ["code"], received: undefined`. | **Caller-surface verified: 0 affected callers in flow files.** Grep shows flow files correctly use `code` (fb-market-poster:109 uses `"code": ticker`; market-watcher/cycle.md:77 uses functional notation `get_technical_indicators(code)`; canonical tool doc `tools/list/get_technical_indicators.md:16` correct). ONLY the example code in package/market-watcher.md is wrong. | Update `docs/agents/tools/package/market-watcher.md:177` example to use `code: "FPT"` not `ticker: "FPT"`. |

---

## PROBED TOOLS — FULL RESULTS

| Tool | Status | Latency/Note |
|---|---|---|
| `get_system_status` | ✅ OK | ~100ms; exposes F1/F2/F3/F5 symptoms |
| `get_cycle_bootstrap` (agent_name required) | ✅ OK | Works with `{"agent_name":"news-scout"}` — flow files are correct |
| `get_macro_snapshot` | ✅ OK | vnIndex 1857.91, gold 4207.5, usdVnd 26122 — live data |
| `get_market_snapshot` | ✅ OK | VN-Index 1857.91 +1.83%; breadth 128/180; tier 1 source |
| `get_agent_signals` (from_agent: null) | ✅ OK | Returns 86 signals — flow's `from_agent: null` pattern works |
| `get_agent_signals` (from_agent: "news-scout") | ✅ OK | Returns 0 signals (no recent news-scout run) |
| `get_watchlist` | ✅ OK | 41 tickers, prices populated from last session |
| `get_week_period` | ✅ OK | 2026-W26, periodKey correct |
| `get_cron_health` | ✅ OK | All crons ≥98% success. sbvRatesRefreshJob 98.1% (F2 symptom) |
| `get_pipeline_health` | ✅ OK | 35/41 tickers TA-ready. BDI/DAG/DLC/JSH/SIS/VDC/VNH = 0 rows |
| `get_vps_proxy_health` | ✅ OK (partial) | prices/news/sbv healthy; **bctc STALE 6d** (F1) |
| `get_vps_service_health` | ✅ OK (partial) | news/sbv healthy; **vn-bctc-fetch UNHEALTHY** (F1) |
| `get_rate_limit_status` | ✅ OK | 14 sources, 12 ready, 2 waiting |
| `get_sla_status` | ✅ OK | **bctc CRITICAL (8482/360), sbv_fx HIGH (34/30)** |
| `get_ism_subcomponents` | ⚠️ ISSUE | no_data — FRED_API_KEY missing or macroIndicatorRefreshJob not populated (F4) |
| `get_alerts` | ✅ OK | 20 alerts (7d), all expected VIC/VHM/EIB news_mention + TA signals |
| `get_market_context` | ✅ OK | Full watchlist prices + macro + alerts |
| `get_technical_indicators` | ✅ schema confirmed | Requires `code` param (not `ticker`). Flow files correct. Package doc drift (F6). |
| `task_list_held` | ✅ OK | 6 active locks: unified-agent (chef-morning/eod), cowork-leader-lock, digest-predict slots. Normal. |
| `get_recent_fixes` | ✅ OK | 20 fixes returned; F1/F2 not present — both are new unresolved issues |
| `get_earnings_calendar` | ✅ OK | 41 tickers; 11 QUÁ HẠN (overdue) — consistent with BCTC pipeline down |

---

## RESOLVED FROM PRIOR CYCLES

_(None carried — this is a fresh baseline run with no prior report to compare against.)_

---

## SYSTEM HEALTH SUMMARY

**Green (no action):** Core MCP tools, coordination (task_claim/release/heartbeat), market data (price/news/macro), alert pipeline, all cowork slot coordination, cron fleet (67 jobs 100% success), TA pipeline, circuit breakers all OK.

**Red (action needed):**
- `vn-bctc-fetch` VPS service is DOWN — BCTC pipeline frozen for 6+ days. Watchlist has 11 overdue BCTC filings that cannot be ingested.
- SBV FX data intermittently rejected due to zero-value API responses — hourly SLA breach pattern.

**Yellow (monitor):**
- Reuters RSS + Trading Economics showing 175 failures — likely decommissioned/unconfigured; clean up if so.
- ISM subcomponents empty — FRED_API_KEY dependency.
- intelligence-cycle occasional overlap (28s avg, some spikes >15min).

---

*Generated: 2026-06-22T18:05 UTC | Run by: health-recheck scheduled agent*
