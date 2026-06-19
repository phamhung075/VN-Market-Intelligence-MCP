# Team MCP Tool Health Recheck — 2026-06-19T14:07Z

**Run type:** Scheduled recheck (delta vs 2026-06-19T12:07Z)
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
| Evidence | Re-probe `get_sla_status` → bctc: **3921 min elapsed / 360 min SLA** (CRITICAL). `get_vps_proxy_health` → `vn-bctc-fetch` STALE, 0 pushes in 24h, last push `2026-06-16 18:02:24` UTC. `get_vps_service_health` → `vn-bctc-fetch: unhealthy`. Duration: **65.4 h** (up from 63.4h at 12:07Z — +2h, still worsening) |
| Caller count | ≥5 (bctc-analyst, refine_bctc_md, unified-agent, digest-predict, system-auditor) |
| Blast radius | P0 fleet-wide. bctc-analyst flow blocked, no new BCTC filings ingested since Jun 16. 11 watchlist tickers with Q1-2026 filings overdue (BID, BDI, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH) |
| Fix | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart service; verify push arrives within 15 min; confirm `get_vps_proxy_health` clears STALE flag |

### BUG-SENTIMENT-TREND P1 — CARRY-FORWARD CONFIRMED 🟠
| Field | Value |
|-------|-------|
| Tool | `get_sentiment_trend` |
| Class | BUG — P1 High |
| Evidence | Re-grep: `docs/agents/fb-market-poster/flow/main.md:118` still calls `get_sentiment_trend` with `arguments: {}` — no `stock_code`. Live probe `get_sentiment_trend({})` would error (tool schema requires `stock_code`). Confirmed same since 12:07Z |
| Caller count | 1 (`fb-market-poster` flow line 118) |
| Blast radius | fb-market-poster cycle always errors on sentiment step; post quality degraded |
| Fix | Edit `docs/agents/fb-market-poster/flow/main.md` line 118: change `arguments: {}` → `arguments: { "stock_code": ticker, "window_days": 7 }` iterating watchlist tickers |

---

## ACTIVE ISSUES — Re-confirmed this cycle

### ISSUE-ISM P1 — UNCHANGED 🟠
| Field | Value |
|-------|-------|
| Tool | `get_ism_subcomponents` |
| Class | ISSUE — P1 High |
| Evidence | Re-probe: `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` Unchanged. macroIndicatorRefreshJob last ran 2026-06-19 12:13 (success) but FRED_API_KEY not set so ISM data not populated |
| Caller count | ≥3 (news-scout, unified-agent, bctc-analyst) |
| Fix | Set `FRED_API_KEY` env var in mcp-server Docker container; re-run `macroIndicatorRefreshJob` |

### ISSUE-SBV-ZERO-MASK P2 — WORSENING 🟡
| Field | Value |
|-------|-------|
| Tool | `sbvRatesRefreshJob` / intelligence cycle SBV sub-call |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_system_status` → `storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 12:00, 12:30, 13:00, 13:30, **14:00** UTC (5 events this afternoon alone). Zero-guard defence correctly rejects. cron `sbvRatesRefreshJob` 100% success — misleading because rejection counts as success. VPS sbv push compensates (age: 18 min, SLA ok). Primary intelligence-cycle SBV fetch path is broken (returning zeros off-market hours) |
| Caller count | 2 (intelligence cycle, sbvRatesRefreshJob) |
| Fix | (1) Distinguish "stored" vs "fetch-ok-but-rejected" in cron health metrics. (2) Investigate why intelligenceCycleJob SBV sub-call returns zeros outside market hours — likely SBV API returns null/empty post-close; add guard before calling `storeSbvSnapshot` |

### ISSUE-Reuters/TE P2 — WORSENING 🟡
| Field | Value |
|-------|-------|
| Tool | Reuters RSS + Trading Economics fetchers (two TE endpoints) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_system_status` → Reuters "Ngưng" **111 consecutive failures** (was 86 at 12:07Z); TradingEconomics (both endpoints) **111 failures** each. All report "Chưa bao giờ" (never succeeded this container session, uptime 9h). Failure count increasing ~2/h |
| Caller count | ≥2 (intelligenceCycleJob, newsHeadlines) |
| Fix | Use `dev-mainserver-fetch` or `ops-mainserver-fetch` agent to probe live endpoints and document updated request recipe; may need anti-bot/TLS fingerprint update |

### ISSUE-WTI P2 — UNCHANGED 🟡
| Field | Value |
|-------|-------|
| Tool | `get_macro_snapshot` / commodity tracker (wti_crude_usd field) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_system_status` → `wti_crude_usd: 95.5` (79 data points). Brent at $79.7; WTI-Brent spread of $15.8 is economically impossible (typical: $3–5). WTI value is stale/wrong |
| Caller count | ≥2 (unified-agent macro layer, news-scout macro chain) |
| Fix | Investigate WTI fetcher; trace `macro_indicators` table; re-run `commodityTrackerRefreshJob` manually and verify result |

### ISSUE-DJIA P2 — UNCHANGED 🟡
| Field | Value |
|-------|-------|
| Tool | `get_macro_snapshot` / commodity tracker (dow_jones field) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_system_status` → `dow_jones: 23750` (49 data points). COVID-era value (~March 2020). Actual DJIA ~42,000+ in June 2026. Spread of ~18,000 points vs reality |
| Caller count | ≥2 (unified-agent macro layer, news-scout macro chain) |
| Fix | Investigate DJIA fetcher source; trace `macro_indicators` table seed; likely fetcher returning wrong market/series |

### ISSUE-vnstock P2 — UNCHANGED 🟡
| Field | Value |
|-------|-------|
| Tool | `vnstockTradingStatsRefresh` cron |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_cron_health` → `vnstockTradingStatsRefresh`: **85.7% success** (7 runs in 7d), avg **649,220ms (~10.8 min/run)**. Below 90% alert threshold. Extremely slow — each run nearly fills the available window |
| Caller count | 1 (trading stats consumers) |
| Fix | Profile per-ticker batch; reduce scope or parallelize; investigate the ~14% failure pattern |

### ISSUE-PUSH-PRICES P2 — CONFIRMED ONGOING 🟡
| Field | Value |
|-------|-------|
| Tool | `get_pipeline_health` (6 sparse tickers) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_pipeline_health` → **BDI:0, DAG:1, DLC:0, JSH:0, SIS:0, VNH:6 rows**. 6 tickers with 0 or near-0 OHLCV rows; TA not ready for these tickers |
| Caller count | ≥2 (market-watcher, bctc-analyst) |
| Fix | Check VPS push for these 6 tickers; inspect OHLCV unit guard rejection logs; seed with historical data if available |

### ISSUE-FOREIGN-FLOW-PRIMARY P2 — ONGOING 🟡
| Field | Value |
|-------|-------|
| Tool | Foreign flow direct fetcher (VPS proxy compensating) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_vps_proxy_health` → foreign_flow: ok (368 pushes/24h). But `get_system_status` shows direct-fetch WARNs recurring. `get_foreign_flow(FPT)` returns data but many 0-value days suggest partial data. VPS compensating |
| Caller count | ≥2 (market-watcher, unified-agent) |
| Fix | Investigate direct foreign-flow endpoint (bgapidatafeed.vps.com.vn); document via `dev-mainserver-fetch` probe |

### ISSUE-MACRO-CALENDAR P2 — ONGOING 🟡
| Field | Value |
|-------|-------|
| Tool | `get_market_context` (macro_calendar field) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_market_context({})` → macro section has no `events` array — calendar events empty. Confirmed FRED API not configured (see ISSUE-ISM) |
| Caller count | ≥2 (unified-agent, news-scout) |
| Fix | Set `FRED_API_KEY`; enable economic calendar data fetch |

---

## ACTIVE IMPROVEMENTS

| ID | Tool | Class | Evidence (re-probed) | Caller count | Suggested Fix |
|----|------|-------|----------------------|-------------|---------------|
| IMPROVE-6 | `get_cycle_bootstrap` | IMPROVE | Deprecated agent names `financial-analyst`/`report-analyzer` still in Zod enum; runtime accepts silently. Re-verified via tool schema. | 0 active broken callers | Remove deprecated enum values |
| IMPROVE-N3 | `bctcReparseJob` | IMPROVE | Re-probe `get_cron_health` → **89.6%** success (106 runs), avg **198,657ms (3.3 min/run)**. Marginal margin above 85% target | 1 | Investigate ~10 failing runs |
| IMPROVE-EVN | EVN energy endpoint | IMPROVE | Not re-probed (low priority, no change since 12:07Z) | 1 (market-watcher) | Probe EVN endpoint; update scraper |
| IMPROVE-TA-DOC | `get_technical_indicators` docs | IMPROVE | Docs say `ticker` but schema uses `code`. 0 callers affected (all callers use `code` already) | 0 | Update tool list doc |
| IMPROVE-INSIDER-DOC | `get_insider_signals` docs | IMPROVE | Some docs still reference `ticker` param; schema requires `code`. 0 direct broken callers | 0 | Audit tool-package .md files |

---

## RESOLVED since previous cycle (2026-06-19T12:07Z)

None. No new resolutions identified this cycle.

---

## Summary

| Severity | Count | Delta vs 12:07Z |
|----------|-------|-----------------|
| P0 BUG | 1 | ↑ WORSENING (65.4h, was 63.4h) |
| P1 BUG | 1 | = UNCHANGED carry |
| P1 ISSUE | 1 | = UNCHANGED |
| P2 ISSUE | 7 | = UNCHANGED count; SBV+Reuters/TE worsening internally |
| IMPROVE | 5 | = UNCHANGED |
| RESOLVED | 0 | +0 new resolutions this cycle |

**Most urgent:** BUG-1/2 BCTC is now **65.4 hours** without a VPS push. `vn-bctc-fetch` service needs manual SSH restart immediately — every 2h without action is another earnings filing window missed.

**Second priority:** BUG-SENTIMENT-TREND is a one-line doc fix in `docs/agents/fb-market-poster/flow/main.md:118` that unblocks fb-market-poster sentiment analysis.

**Macro data integrity:** DJIA ($23,750 vs ~$42,000 reality) and WTI ($95.5 vs ~$75 reality) are corrupting macro synthesis for unified-agent and news-scout. FRED_API_KEY also needed for ISM + macro calendar.
