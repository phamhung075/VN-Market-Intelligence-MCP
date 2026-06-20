# Team MCP Tool Health Recheck — 2026-06-19T12:07Z

**Run type:** Scheduled recheck (delta vs 2026-06-19T06:05Z)
**Gateway:** vn-market reachable ✅
**Scope:** All cowork + dev agent tool dependencies

---

## ACTIVE BUGS — Re-confirmed this cycle

### BUG-1/2 BCTC P0 — WORSENING 🔴
| Field | Value |
|-------|-------|
| Tool | `get_bctc_full`, `get_bctc_ocf`, `get_cash_flow` |
| Class | BUG — P0 Critical |
| Evidence | `get_sla_status` → bctc: 3802 min elapsed / 360 min SLA (CRITICAL). `get_vps_proxy_health` → `vn-bctc-fetch` STALE, 0 pushes in last 24h, last push 2026-06-16 18:02:24 UTC. `get_vps_service_health` → `vn-bctc-fetch: unhealthy`. Duration: **63.4 h** (up from 57.4h at 06:05Z run — worsening) |
| Caller count | ≥5 (bctc-analyst, refine_bctc_md, unified-agent, digest-predict, system-auditor) |
| Blast radius | P0 fleet-wide. bctc-analyst flow blocked (E2 guard gate), BCTC MCP tool returns stale data, no new filings ingested since 2026-06-16 |
| Fix | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart service; verify push arrives within 15 min; check `get_vps_proxy_health` clears STALE flag |

### BUG-SENTIMENT-TREND P1 — CARRY-FORWARD 🟠
| Field | Value |
|-------|-------|
| Tool | `get_sentiment_trend` |
| Class | BUG — P1 High |
| Evidence | `get_sentiment_trend({})` → `stock_code required` (Input validation error). First confirmed at 06:05Z run. `docs/agents/fb-market-poster/flow/main.md:118` calls the tool with empty `arguments: {}` — always errors |
| Caller count | 1 (`fb-market-poster` flow line 118) |
| Blast radius | fb-market-poster cycle always errors on sentiment step; post quality degraded |
| Fix | In `docs/agents/fb-market-poster/flow/main.md` line 118: change `arguments: {}` → `arguments: { "stock_code": ticker, "window_days": 7 }` where `ticker` iterates watchlist |

---

## ACTIVE ISSUES — Re-confirmed this cycle

### ISSUE-ISM P1 — UNCHANGED 🟠
| Field | Value |
|-------|-------|
| Tool | `get_ism_subcomponents` |
| Class | ISSUE — P1 High |
| Evidence | `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| Caller count | ≥3 (news-scout, unified-agent, bctc-analyst) |
| Fix | Set `FRED_API_KEY` env var in mcp-server Docker container; trigger `macroIndicatorRefreshJob` manually |

### ISSUE-SBV-ZERO-MASK P2 — NEW THIS CYCLE 🟡
| Field | Value |
|-------|-------|
| Tool | `sbvRatesRefreshJob` / `get_system_status` |
| Class | ISSUE — P2 Medium |
| Evidence | `get_cron_health` → `sbvRatesRefreshJob` 100% success (15/15). But `get_system_status` logs show repeated `storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` every ~30 min. Direct SBV fetch returns zero-value rates; zero-guard defence correctly rejects; but cron health metric counts rejection as "success" → metric is misleading. VPS sbv push compensates (last push 12:00:25) |
| Caller count | 2 (sbv-dependent: macro-indicators, system-auditor) |
| Fix | Fix cron health metric to distinguish "stored successfully" vs "fetch success but zero-guard rejected". Investigate why direct SBV fetch returns zeros. VPS push is compensating but primary fetch is broken |

### ISSUE-Reuters/TE P2 — WORSENING 🟡
| Field | Value |
|-------|-------|
| Tool | Reuters + TradingEconomics news fetchers |
| Class | ISSUE — P2 Medium |
| Evidence | `get_system_status` → Reuters "Ngưng" 86 consecutive failures; TradingEconomics (both endpoints) 86 failures each; all report "Chưa bao giờ" (never succeeded). No news from these sources since container restart |
| Caller count | ≥2 (intelligenceCycleJob, newsHeadlines) |
| Fix | Check anti-bot/TLS fingerprinting changes since last working state. Use `dev-mainserver-fetch` agent to probe live endpoints and document new request recipe |

### ISSUE-WTI P2 — UNCHANGED 🟡
| Field | Value |
|-------|-------|
| Tool | `get_macro_snapshot` / `get_system_status` (wti_crude_usd field) |
| Class | ISSUE — P2 Medium |
| Evidence | `get_system_status` → `wti_crude_usd: 95.5` (79 data points). Actual WTI ~$80 (June 2026). $95.5 is a stale/incorrect value — $16 spread vs Brent $79.89 is impossible |
| Caller count | ≥2 (unified-agent macro layer, news-scout macro chain) |
| Fix | Investigate WTI fetcher; trace macro_indicators table source; re-run commodityRefreshJob manually |

### ISSUE-DJIA P2 — UNCHANGED 🟡
| Field | Value |
|-------|-------|
| Tool | `get_macro_snapshot` / `get_system_status` (dow_jones field) |
| Class | ISSUE — P2 Medium |
| Evidence | `get_system_status` → `dow_jones: 23750` (49 data points). COVID-era value (~March 2020). Actual DJIA ~42,000+ in June 2026 |
| Caller count | ≥2 (unified-agent macro layer, news-scout macro chain) |
| Fix | Investigate DJIA fetcher source; trace `macro_indicators` table; likely stale seed data or broken fetcher |

### ISSUE-vnstock P2 — SLIGHTLY IMPROVED 🟡
| Field | Value |
|-------|-------|
| Tool | `vnstockTradingStatsRefresh` cron |
| Class | ISSUE — P2 Medium |
| Evidence | `get_cron_health` → 85.7% success (7 runs), avg 649,220ms (~10.8 min/run). Up from 80% at 06:05Z but still near 80% alert threshold. Extremely slow execution |
| Caller count | 1 (trading stats consumers) |
| Fix | Profile why job takes 10.8 min. Consider reducing scope or parallelizing per-ticker batch |

### ISSUE-PUSH-PRICES P2 — CONFIRMED ONGOING 🟡
| Field | Value |
|-------|-------|
| Tool | `get_pipeline_health` (6 tickers) |
| Class | ISSUE — P2 Medium |
| Evidence | `get_pipeline_health` → BDI:0, DAG:1, DLC:0, JSH:0, SIS:0, VNH:6 rows. 6 tickers with 0 or near-0 rows; technical analysis not ready for these tickers (OHLCV unit guard rejections) |
| Caller count | ≥2 (market-watcher get_ticker_intelligence, bctc-analyst get_bctc_full) |
| Fix | Check VPS push for these 6 tickers; inspect OHLCV unit guard rejection logs; may need to seed with historical data |

### ISSUE-FOREIGN-FLOW-PRIMARY P2 — ONGOING 🟡
| Field | Value |
|-------|-------|
| Tool | Foreign flow direct fetcher (VPS proxy compensating) |
| Class | ISSUE — P2 Medium |
| Evidence | `get_system_status` → direct-fetch WARNs every minute for foreign-flow; VPS push compensates. Primary fetch permanently degraded |
| Caller count | ≥2 (market-watcher, unified-agent) |
| Fix | Investigate direct foreign-flow endpoint; document in `dev-mainserver-fetch` probe |

### ISSUE-MACRO-CALENDAR P2 — ONGOING 🟡
| Field | Value |
|-------|-------|
| Tool | `get_market_context` (macro_calendar field) |
| Class | ISSUE — P2 Medium |
| Evidence | `get_market_context` → `events:[], source_tier:4, status:"unavailable"` |
| Caller count | ≥2 (unified-agent, news-scout) |
| Fix | Investigate macro calendar source; check if FRED_API_KEY would enable economic calendar data |

---

## ACTIVE IMPROVEMENTS

| ID | Tool | Class | Evidence | Caller count | Suggested Fix |
|----|------|-------|----------|-------------|---------------|
| IMPROVE-6 | `get_cycle_bootstrap` | IMPROVE | Deprecated agent names `financial-analyst`/`report-analyzer` still accepted in Zod enum; runtime silently maps to wrong cycle | 0 | Remove deprecated enum values; throw clear error |
| IMPROVE-N3 | `bctcReparseJob` | IMPROVE | 89.5% success (105 runs), avg 200,549ms — above 85% target but low margin | 1 | Investigate ~10 failing runs to improve reliability |
| IMPROVE-EVN | EVN energy endpoint | IMPROVE | EVN endpoint broken, `get_energy_grid_signals` returns 70% default fill | 1 (market-watcher) | Probe EVN endpoint; update scraper |
| IMPROVE-TA-DOC | `get_technical_indicators` | IMPROVE | Docs say param=`ticker` but live schema requires `code`. 0 callers affected since all callers use `code` | 0 | Update docs/agents/tools/list/get_technical_indicators.md |
| IMPROVE-INSIDER-DOC | `get_insider_signals` | IMPROVE | Docs and some tool packages still reference `ticker` param; live schema requires `code` | 0 direct broken callers | Audit all tool-package .md files for `ticker` → `code` |

---

## RESOLVED since previous cycle (2026-06-19T06:05Z)

| ID | Finding | Resolution |
|----|---------|-----------|
| BUG-NEW-C | `get_agent_signals` with `from_agent=null` errored | RESOLVED ✅ — 04:54Z restart fixed. Now returns 40 signals correctly |
| BUG-SSC-CERT | cafef SSL cert failures | RESOLVED ✅ — `get_system_status` cafef CB [OK] failures:0 |
| BUG-NEW-A-MAIN | `get_outstanding_shares` tool missing | RESOLVED ✅ — tool now present |
| BUG-NEW-A-RESIDUAL | `get_insider_signals({ticker:...})` doc uses wrong param | PARTIAL — residual doc fix pending |

---

## Summary

| Severity | Count | Delta vs 06:05Z |
|----------|-------|-----------------|
| P0 BUG | 1 | ↑ WORSENING (63.4h, was 57.4h) |
| P1 BUG | 1 | = UNCHANGED carry |
| P1 ISSUE | 1 | = UNCHANGED |
| P2 ISSUE | 7 | +1 NEW (ISSUE-SBV-ZERO-MASK) |
| IMPROVE | 5 | = UNCHANGED |
| RESOLVED | 3+ | +0 new resolutions this cycle |

**Most urgent:** BUG-1/2 BCTC is now 63.4 hours without a push. VPS `vn-bctc-fetch` service needs manual restart + investigation immediately.
