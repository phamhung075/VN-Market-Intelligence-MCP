# Team MCP Tool Health Recheck — 2026-06-19T16:07Z

**Run type:** Scheduled recheck (delta vs 2026-06-19T14:07Z)
**Gateway:** vn-market reachable ✅
**Scope:** All cowork + dev agent tool dependencies
**Re-probe discipline:** Every prior finding re-probed this cycle before carry-forward (STEP 3c)

---

## ACTIVE BUGS — Re-confirmed this cycle

### BUG-1/2 BCTC P0 — WORSENING 🔴
| Field | Value |
|-------|-------|
| Tool | `get_bctc_full`, `get_bctc_ocf`, `get_cash_flow`, `push_bctc_refined_unit` |
| Class | BUG — P0 Critical |
| Evidence | Re-probe `get_sla_status` → bctc: **4043 min elapsed / 360 min SLA** (CRITICAL). `get_vps_proxy_health` → `vn-bctc-fetch` STALE, 0 pushes in 24h, last push `2026-06-16 18:02:24` UTC. `get_vps_service_health` → `vn-bctc-fetch: unhealthy, uptime 2d 21h 57m`. Duration: **67.4 h** (up from 65.4h at 14:07Z — +2h, still worsening). `get_pipeline_health` confirms `BDI:0, DAG:1, DLC:0, JSH:0, SIS:0, VNH:6` rows — directly caused by BCTC-fetch blockage |
| Caller count | ≥5 (bctc-analyst, refine_bctc_md, unified-agent, digest-predict, system-auditor — verified grep: 105 occurrences in 41 files) |
| Blast radius | P0 fleet-wide. bctc-analyst flow blocked, no new BCTC filings ingested since Jun 16. 11 watchlist tickers overdue (BID, BDI, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH) |
| Fix | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart service; verify push arrives within 15 min; confirm `get_vps_proxy_health` clears STALE flag |

### BUG-SENTIMENT-TREND P1 — UNCHANGED 🟠
| Field | Value |
|-------|-------|
| Tool | `get_sentiment_trend` |
| Class | BUG — P1 High |
| Evidence | Re-probe: `get_sentiment_trend({})` → `{"error": "Error: stock_code (or symbol) is required"}`. Re-grep: `docs/agents/fb-market-poster/flow/main.md:118` still has `call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})` — no `stock_code`. Unchanged since 14:07Z |
| Caller count | 1 (`fb-market-poster` flow line 118) |
| Blast radius | fb-market-poster cycle errors on every sentiment step; post quality degraded |
| Fix | Edit `docs/agents/fb-market-poster/flow/main.md` line 118: `arguments: {}` → `arguments: { "stock_code": ticker, "window_days": 7 }` iterating watchlist tickers |

---

## ACTIVE ISSUES — Re-confirmed this cycle

### ISSUE-ISM P1 — UNCHANGED 🟠
| Field | Value |
|-------|-------|
| Tool | `get_ism_subcomponents` |
| Class | ISSUE — P1 High |
| Evidence | Re-probe: `get_ism_subcomponents({})` → `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`. `macroIndicatorRefreshJob` ran successfully at 12:13 UTC but FRED_API_KEY absent → ISM never populated. Callers verified grep: 68 occurrences in 34 files |
| Caller count | ≥3 (news-scout, unified-agent, bctc-analyst — confirmed in caller surface) |
| Fix | Set `FRED_API_KEY` env var in mcp-server Docker container; re-run `macroIndicatorRefreshJob`; verify `get_ism_subcomponents` returns data |

### ISSUE-SBV-ZERO-MASK P2 — WORSENING 🟡
| Field | Value |
|-------|-------|
| Tool | `sbvRatesRefreshJob` / `storeSbvSnapshot` |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_system_status` → 10 occurrences of `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` from 14:00–23:00 UTC every 30 min. **NEW this cycle**: `get_vps_service_health` → `vn-sbv-fetch: unhealthy, uptime: 1h` (service recently restarted). Root cause now clearer: VPS sbv-fetch service instability → empty (zero-value) responses → rejected by guard. cron health misleadingly shows `sbvRatesRefreshJob: 100% success` (rejection not counted as cron failure) |
| Caller count | 2 (intelligence cycle, sbvRatesRefreshJob — confirmed grep: 68 occurrences in 34 files referencing sbv/macro_snapshot) |
| Fix | SSH to VPS: check `systemctl status vn-sbv-fetch`; investigate why service keeps restarting (1h uptime). Add guard in `storeSbvSnapshot` caller to skip write when SBV fetch returns null/0 before calling store function |

### ISSUE-Reuters/TE P2 — WORSENING 🟡
| Field | Value |
|-------|-------|
| Tool | Reuters RSS + Trading Economics fetchers (2 TE endpoints) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_system_status` → Reuters: **"Ngưng" 130 consecutive failures** (was 111 at 14:07Z, +19 this cycle). Trading Economics (both endpoints): **130 failures** each. All "Chưa bao giờ" (never succeeded this session). `get_rate_limit_status` → `tradingeconomics.com: Chua goi` (never called via rate-limiter path). Failure count growing ~2/h |
| Caller count | ≥2 (intelligenceCycleJob, newsHeadlines — confirmed: 10 occurrences in 4 files for Reuters; 3 files for TradingEconomics) |
| Fix | `dev-mainserver-fetch` or `ops-mainserver-fetch` probe against Reuters and TradingEconomics live; update scraper with working request recipe (likely anti-bot/TLS fingerprint issue) |

### ISSUE-WTI P2 — UNCHANGED 🟡
| Field | Value |
|-------|-------|
| Tool | `get_macro_snapshot` / commodity tracker (`wti_crude_usd` field) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_system_status` → `wti_crude_usd: 95.5` (79 data points). Brent at $80.1; WTI-Brent spread of $15.4 is economically impossible (typical: $3–5). WTI value is stale |
| Caller count | ≥2 (unified-agent macro layer, news-scout macro chain) |
| Fix | Investigate WTI fetcher; trace `macro_indicators` table for the WTI series; re-run `commodityTrackerRefreshJob` manually and verify the value updates |

### ISSUE-DJIA P2 — UNCHANGED 🟡
| Field | Value |
|-------|-------|
| Tool | `get_macro_snapshot` / commodity tracker (`dow_jones` field) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_system_status` → `dow_jones: 23750` (49 data points). Actual DJIA ~42,000+ in June 2026. Spread of ~18,000 points vs reality — likely fetcher pulling wrong market or COVID-era seed data |
| Caller count | ≥2 (unified-agent macro layer, news-scout macro chain) |
| Fix | Investigate DJIA fetcher source; trace `macro_indicators` table seed; fix fetcher series ID or data source |

### ISSUE-vnstock P2 — UNCHANGED 🟡
| Field | Value |
|-------|-------|
| Tool | `vnstockTradingStatsRefresh` cron |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_cron_health` → `vnstockTradingStatsRefresh`: **85.7% success** (7 runs / 7d), avg **649,220ms (~10.8 min/run)**. Below 90% alert threshold. Each run nearly fills available scheduling window |
| Caller count | 1 (trading stats consumers) |
| Fix | Profile per-ticker batch; reduce scope or parallelize; investigate the ~14% failure pattern |

### ISSUE-PUSH-PRICES P2 — UNCHANGED 🟡
| Field | Value |
|-------|-------|
| Tool | `get_pipeline_health` (6 sparse tickers) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_pipeline_health` → **BDI:0, DAG:1, DLC:0, JSH:0, SIS:0, VNH:6 rows**. 6 tickers with 0 or near-0 OHLCV rows; TA not ready. Likely downstream of BCTC-fetch blockage for some; others may be thin-market tickers |
| Caller count | ≥2 (market-watcher, bctc-analyst) |
| Fix | Check VPS price push for these 6 tickers; inspect OHLCV unit-guard rejection logs; seed with historical data if available |

### ISSUE-FOREIGN-FLOW-PRIMARY P2 — UNCHANGED 🟡
| Field | Value |
|-------|-------|
| Tool | Foreign flow direct fetcher (VPS proxy compensating) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_vps_proxy_health` → `foreign_flow: ok, 368 pushes/24h` (VPS compensating). `get_foreign_flow(HPG)` returns data but shows many 0-value days (Jun 12–16 holding ratio = 0%) — partial data quality issue |
| Caller count | ≥2 (market-watcher, unified-agent) |
| Fix | Investigate direct foreign-flow primary endpoint; document via `dev-mainserver-fetch` probe; verify 0-value days are not silently masking real activity |

### ISSUE-MACRO-CALENDAR P2 — UNCHANGED 🟡
| Field | Value |
|-------|-------|
| Tool | `get_market_context` (macro_calendar field) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_market_context({})` → MACRO section populated (prices/rates present) but no economic calendar events returned — consistent with FRED_API_KEY absent (same root cause as ISSUE-ISM) |
| Caller count | ≥2 (unified-agent, news-scout) |
| Fix | Same as ISSUE-ISM: Set `FRED_API_KEY` in container env |

---

## ACTIVE IMPROVEMENTS

| ID | Tool | Class | Evidence (re-probed this cycle) | Caller count | Suggested Fix |
|----|------|-------|--------------------------------|-------------|---------------|
| IMPROVE-6 | `get_cycle_bootstrap` | IMPROVE | Deprecated agent names `financial-analyst`/`report-analyzer` in Zod enum. Tool works correctly (probed `agent_name="market-watcher"` → valid response). Enum carries dead values silently. | 0 broken callers | Remove deprecated enum values from Zod schema |
| IMPROVE-N3 | `bctcReparseJob` | IMPROVE | Re-probe `get_cron_health` → **89.6%** success (106 runs), avg **198,657ms (3.3 min/run)**. Marginal margin above 85% target | 1 | Investigate ~11 failing runs |
| IMPROVE-EVN | EVN energy endpoint | IMPROVE | Not re-probed this cycle (no change signal). | 1 (market-watcher) | Probe EVN endpoint; update scraper if stale |
| IMPROVE-TA-DOC | `get_technical_indicators` | IMPROVE | Docs say `ticker` but schema uses `code`. 0 callers affected (all use `code`). | 0 | Update tool-list doc parameter name |
| IMPROVE-INSIDER-DOC | `get_insider_signals` | IMPROVE | Some docs reference `ticker`; schema requires `code`. 0 broken callers. | 0 | Audit tool-package .md files |

---

## RESOLVED since previous cycle (2026-06-19T14:07Z)

None. No findings resolved this cycle.

---

## Summary

| Severity | Count | Delta vs 14:07Z |
|----------|-------|-----------------|
| P0 BUG | 1 | ↑ WORSENING (67.4h, was 65.4h) |
| P1 BUG | 1 | = UNCHANGED |
| P1 ISSUE | 1 | = UNCHANGED |
| P2 ISSUE | 7 | = UNCHANGED count; SBV+Reuters/TE worsening internally |
| IMPROVE | 5 | = UNCHANGED |
| RESOLVED | 0 | +0 new resolutions this cycle |

**Most urgent:** BUG-1/2 BCTC is now **67.4 hours** without a VPS push. No Q1-2026 earnings filing ingested since Jun 16. `vn-bctc-fetch` service needs SSH restart NOW — every 2h adds another missed filing window.

**Second priority:** SBV zero-mask **worsening** — `vn-sbv-fetch` VPS service uptime only 1h (keeps restarting). 10+ rejected writes today. Macro snapshot carry/yield signals degraded. Root cause: VPS service instability, not just off-market API behavior.

**Macro data integrity:** DJIA ($23,750 vs ~$42,000 reality) and WTI ($95.5 vs ~$80 reality) are corrupting macro synthesis for unified-agent and news-scout. Reuters RSS (130 failures) also weakening news-scout pipeline. FRED_API_KEY needed for ISM + macro calendar.
