# Team MCP Tool Health Recheck — 2026-06-20T08:12Z

**Run type:** Scheduled recheck (delta vs 2026-06-20T06:03Z)
**Gateway:** vn-market reachable ✅
**Scope:** All cowork + dev agent tool dependencies
**Re-probe discipline:** Every prior finding re-probed this cycle before carry-forward (STEP 3c)
**Probe window:** 2026-06-20 ~08:03–08:10 UTC (VN market OPEN — active trading window)

---

## Summary

| Class | Count | Worst severity |
|-------|-------|----------------|
| BUG   | 5     | CRITICAL (BCTC pipeline dead + worsening) |
| ISSUE | 6     | HIGH (ISM/WTI/DJIA/SBV/liquidity/news-SLA) |
| IMPROVE | 0   | — (IMPROVE-1 doc drift carried from 0603 — 0 callers affected, not repeated) |
| RESOLVED | 1  | ISSUE-2 orphaned cowork-leader-lock auto-resolved |

---

## ACTIVE BUGS — Re-confirmed this cycle

### BUG-1 — CRITICAL: BCTC pipeline dead, SLA 3.5× limit — WORSENING 🔴

| Field | Value |
|-------|-------|
| Tool | `get_sla_status`, `get_vps_service_health`, `get_vps_proxy_health` |
| Class | BUG — P0 Critical |
| Evidence | Re-probe `get_sla_status` → bctc: **5006 min elapsed / 1419 min SLA → CRITICAL** (was 4883 min at 06:03Z, +123 min, still worsening). `get_vps_service_health` → `vn-bctc-fetch: unhealthy, uptime 3d 14h`. `get_vps_proxy_health` → bctc last push `2026-06-16 18:02` UTC — **4 days stale, STALE flag YES**. `get_system_status` → BCTC freshness 83.4h old (VERY STALE). `get_pipeline_health` → BDI:0, DAG:1, DLC:0, JSH:0, SIS:0 rows — TA not ready for these tickers due to missing OHLCV data that depends on BCTC flows. |
| Caller count | ≥5: bctc-analyst (flow/cycle.md), refine_bctc_md (push_bctc_refined_unit), ops, unified-agent, system-auditor — confirmed grep: 105 occurrences across 41 files |
| Blast radius | P0 fleet-wide. bctc-analyst blocked on stale data. 11 Q1-2026 watchlist tickers QUÁ HẠN per `get_earnings_calendar` (BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH). refine_bctc_md cannot push refined units. |
| Fix | SSH to VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 100`; restart service; verify push arrives in `get_vps_proxy_health` within 15 min; run `trigger_bctc_vps_fetch` after restart. |

---

### BUG-2 — HIGH: HNX & UPCOM all price sources failing — UNCHANGED 🟠

| Field | Value |
|-------|-------|
| Tool | `get_system_status` |
| Class | BUG — P1 High |
| Evidence | Re-probe `get_system_status` → 10/10 recent errors all: `[hnx] all HNX price sources failed` and `[hnx] all UPCOM price sources failed` (08:00–08:02 UTC, during active trading window). Watchlist N/A: BDI, DLC, VNH (HNX), JSH (HNX), ACV (UPCOM), SIS (HOSE — 0 rows), VDC (UPCOM). Circuit breaker `hnx: OK failures:0` — breaker not tripped despite raw source failures (tracking mismatch). |
| Caller count | market-watcher (cycle.md step 1 price probe), alert-engine (alertScanParallelJob), intelligenceCycleJob — confirmed grep |
| Blast radius | 6+ watchlist tickers have no current price data. Price-based alerts (volume_spike, price_drop) blind for HNX/UPCOM tickers during active market. |
| Fix | Investigate HNX/UPCOM fetcher in stock-price service. Likely rate-limit, IP block, or API schema change at HNX source. Check VPS proxy route for HNX/UPCOM fallback path. |

---

### BUG-3 — HIGH: Reuters RSS dead, never succeeded — WORSENING 🟠

| Field | Value |
|-------|-------|
| Tool | `get_system_status` → SOURCE HEALTH |
| Class | BUG — P1 High |
| Evidence | Re-probe `get_system_status` → `Reuters RSS \| Ngưng \| Chưa bao giờ \| 124 ⚠` (was 106 at 06:03Z, +18 this cycle). Source has **NEVER** successfully fetched in recorded history. |
| Caller count | news-scout (fetch_and_analyze pulls from news pipeline), intelligenceCycleJob — ≥2 affected agents |
| Fix | Verify `feeds.reuters.com` RSS URL still valid (Reuters changed RSS structure 2024). If decommissioned per 2026-04-30 hotfix, remove from active source registry to clear noise. |

---

### BUG-4 — HIGH: Trading Economics dead, 2 sources never succeeded — WORSENING 🟠

| Field | Value |
|-------|-------|
| Tool | `get_system_status` → SOURCE HEALTH |
| Class | BUG — P1 High |
| Evidence | Re-probe → both Trading Economics sources: `Ngưng \| Chưa bao giờ \| 124 ⚠` (was 106 each at 06:03Z, +18 this cycle). `get_macro_snapshot` probe confirms `oilUsdDelta: null`, `goldUsdDelta: null` — delta fields not computable due to TE fetch failure. |
| Caller count | ≥3: get_macro_snapshot consumers (market-watcher, news-scout, unified-agent); macro-health-read skill |
| Fix | Check Chromium binary in mcp-server Docker: `docker exec mcp-server chromium --version`. If missing, rebuild with Dockerfile fix (previous 2026-04-30 hotfix installed it but may have been lost on rebuild). |

---

### BUG-SENTIMENT-TREND — HIGH: fb-market-poster `get_sentiment_trend({})` broken — UNCHANGED + PO CLAIM DISPROVEN 🟠

| Field | Value |
|-------|-------|
| Tool | `get_sentiment_trend` |
| Class | BUG — P1 High |
| Evidence | Re-probe: `get_sentiment_trend({})` → `{"source_tier":3,"error":"Error: stock_code (or symbol) is required"}` — **confirmed broken this cycle**. Direct `Read(docs/agents/fb-market-poster/flow/main.md, lines 114-122)` → line 118 confirmed: `sentiment = call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})` — **unpatched**. |
| PO claim disproven | `docs/agent-memory/notebooks/po.md:17` (written 2026-06-20T03:37Z) claims: "ALREADY FIXED inline by cowork-refactory-expert (dev-team notebook L26). flow main.md L117-120 loops per-ticker w/ {stock_code: ticker}; ZERO bare-{} get_sentiment_trend sites repo-wide." This claim is **FALSE**. The file at line 118 reads `arguments={}` unchanged. The cowork-refactory-expert updated their notebook but did not edit the actual flow file. Grep confirms: `rg "get_sentiment_trend.*arguments=\{\}" docs/agents/fb-market-poster/` → match found. |
| Caller count | 1 (`docs/agents/fb-market-poster/flow/main.md:118`) — verified |
| Blast radius | fb-market-poster sentiment step always errors. Every cycle's social post lacks sentiment data. |
| Fix | Edit `docs/agents/fb-market-poster/flow/main.md` line 118: replace `call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})` with a per-ticker loop calling `{"stock_code": ticker, "window_days": 7}` for each watchlist ticker (pattern: `unified-agent/flow/market-analysis.md:7` — skip here / call per-ticker on trigger). Dispatch to agent-father. |

---

## ACTIVE ISSUES — Re-confirmed this cycle

### ISSUE-ISM — HIGH: FRED_API_KEY missing, ISM data always empty — UNCHANGED 🟠

| Field | Value |
|-------|-------|
| Tool | `get_ism_subcomponents` |
| Class | ISSUE — P1 High |
| Evidence | Re-probe: `get_ism_subcomponents({})` → `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` — confirmed unchanged. `get_cron_health` → `macroIndicatorRefreshJob: last_run 12:13 UTC, success` but FRED data never populates without API key. |
| Caller count | ≥3: news-scout (macro chain), unified-agent (macro layer), bctc-analyst (macro context) — confirmed grep: 68 occurrences across 34 files |
| Fix | Set `FRED_API_KEY` env var in mcp-server Docker container; restart; re-run `macroIndicatorRefreshJob`; verify `get_ism_subcomponents` returns data. |

---

### ISSUE-WTI — MEDIUM: wti_crude_usd stale at 95.5 — UNCHANGED 🟡

| Field | Value |
|-------|-------|
| Tool | `get_system_status` / `get_macro_snapshot` (auto-tracked indicators) |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_system_status` → `wti_crude_usd: 95.5 (79 data points)`. Brent at $80.59. WTI-Brent spread = **$14.91** — economically impossible (typical $3–5). WTI value is months old. `get_macro_snapshot` returns Brent correctly at 80.59 but does not surface WTI directly — the stale WTI leaks into macro chain if macro-health-read skill reads `wti_crude_usd` from auto-tracked table. |
| Caller count | ≥2: unified-agent macro layer, news-scout macro chain (commodity → CPI chain in stage-sentiment.md) |
| Fix | Investigate WTI fetcher — trace `macro_indicators` table for series `wti_crude_usd`; identify last fetch timestamp; re-run `commodityTrackerRefreshJob` and verify value updates to ~$77–79 range. |

---

### ISSUE-DJIA — MEDIUM: dow_jones stale at 23,750 — UNCHANGED 🟡

| Field | Value |
|-------|-------|
| Tool | `get_system_status` / auto-tracked indicators |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_system_status` → `dow_jones: 23750 (49 data points)`. Actual DJIA June 2026: ~42,000+. Spread of ~18,000 points vs reality — likely fetcher pulling COVID-era seed data or wrong series. |
| Caller count | ≥2: unified-agent macro layer, news-scout macro chain |
| Fix | Investigate DJIA fetcher source; trace `macro_indicators` table for `dow_jones` series ID; fix fetcher series or data source. |

---

### ISSUE-SBV-ZERO — MEDIUM: storeSbvSnapshot REJECTED firing — ONGOING 🟡

| Field | Value |
|-------|-------|
| Tool | `get_system_status` / `sbvRatesRefreshJob` |
| Class | ISSUE — P2 Medium |
| Evidence | Re-probe `get_system_status` → `[2026-06-20 15:01:09] [ERROR] [sbv] [sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row`. Guard protecting data integrity (working correctly), but upstream SBV fetch returning zero values for some fields. `get_vn_liquidity_state` → `policy_rates.source: "sbv_rates DB fallback (HTML parse failed)", is_estimate: true` — HTML parse failing at SBV site. `get_vps_service_health` → `vn-sbv-fetch: healthy` now (status improved from 0603Z where it was unhealthy). |
| Caller count | intelligence-cycle, sbvRatesRefreshJob — ≥2 |
| Fix | Investigate why SBV HTML parse fails (scraper receiving unexpected response format). Check `vn-sbv-fetch` logs for HTTP response codes. The guard is working; fix is to repair the HTML parser or add a secondary data source for SBV policy rates. |

---

### ISSUE-LIQUIDITY — MEDIUM: get_vn_liquidity_state multiple null/zero fields — RE-CONFIRMED 🟡

| Field | Value |
|-------|-------|
| Tool | `get_vn_liquidity_state` |
| Class | ISSUE — P2 Medium |
| Evidence | Live probe → `interbank_1w.rate_1w_pct: null` (blocked_reason: `dttktt.sbv.gov.vn unreachable from VPS — 100% packet loss` — permanent); `usd_vnd_buy: 0`, `usd_vnd_sell: 0`, `cny_vnd_rate: 0` (missing); `sjc_price_mn_vnd: 0` (note: "SJC price absent from DB — no SJC crawler row"); `omo.net_outstanding_bn_vnd: null` (blocked: "OMO HTML parse: no add/absorb rows found"); `policy_rates: is_estimate: true` (HTML parse failed, DB fallback). Most fields return `is_estimate: true` or zero. |
| Caller count | ≥2: system-auditor (Tier-2/3 checks), market-watcher (macro context step) |
| Fix | (a) Interbank rate: `dttktt.sbv.gov.vn` permanently unreachable from VPS — route via main server instead. (b) SJC price: add VN SJC crawler to vn-price-fetch. (c) OMO HTML: fix SBV OMO page parser (HTML structure may have changed). (d) usd_vnd buy/sell: trace missing fields in FX rate scraper. |

---

### ISSUE-NEWS-SLA — LOW: news SLA breached 44/30 min — TRANSIENT 🟡

| Field | Value |
|-------|-------|
| Tool | `get_sla_status` |
| Class | ISSUE — P3 Low |
| Evidence | Re-probe `get_sla_status` → `news: 44 min / 30 min SLA → breached HIGH`. Latest news in context is from 07:24 UTC (newsHeadlinesRefreshJob ran at 08:00 but fetch_and_analyze last item at 07:24). |
| Caller count | news-scout (stage-fetch.md), unified-agent (context freshness) |
| Fix | Likely transient — monitor. If persistent >2h, check pollNewsJob cadence and newsHeadlinesRefreshJob output. |

---

## RESOLVED this cycle

### ISSUE-2 (from 0603): Orphaned cowork-leader-lock — AUTO-RESOLVED ✅

| Field | Value |
|-------|-------|
| Evidence | Re-probe `task_list_held` → `cowork-leader-lock` now held by `cowork-dispatcher`, `heartbeat_at: ~08:11 UTC`, `expires_at: 2026-06-20T08:21:19Z`. The previously-expired lock was successfully re-claimed and is being actively heartbeated. System handled TTL expiry correctly. |
| Delta | Was: expired lock from 0603Z. Now: active, heartbeated, healthy. |

---

## Tool Probe Summary — This Cycle

| Tool | Reachable | Status | Notes |
|------|-----------|--------|-------|
| `get_cycle_bootstrap` | ✅ | OK (enum-gated) | Valid enum: news-scout/market-watcher/unified-agent/etc. |
| `get_macro_snapshot` | ✅ | OK | VN-Index 1824.53, Brent 80.59, Gold 4172.9, USDVND 26120 |
| `get_watchlist` | ✅ | OK | 41 tickers; 6 N/A (HNX/UPCOM down) |
| `get_system_status` | ✅ | ISSUES | 10 hnx errors, Reuters/TE dead, 47 warnings |
| `get_agent_signals` | ✅ | OK | Requires `from_agent` param (not `agent_name`) |
| `get_market_snapshot` | ✅ | OK | VN-Index + breadth data fresh |
| `get_cron_health` | ✅ | OK | Most jobs healthy; bctcReparseJob 89.5% |
| `get_pipeline_health` | ✅ | OK | 5 tickers TA-not-ready (0 rows, HNX/UPCOM fallout) |
| `get_vps_service_health` | ✅ | ALERT | vn-bctc-fetch unhealthy; others healthy/idle |
| `get_vps_proxy_health` | ✅ | ALERT | bctc STALE 4d; news/sbv flowing |
| `get_sla_status` | ✅ | ALERT | bctc CRITICAL 5006/1419 min; news 44/30 breached |
| `get_earnings_calendar` | ✅ | OK | 41 tickers tracked; 11 QUÁ HẠN |
| `task_list_held` | ✅ | OK | 7 locks held; cowork-leader-lock healthy |
| `get_week_period` | ✅ | OK | W25, 2026-06-15/2026-06-21 |
| `get_legal_risk_signals` | ✅ | OK | 8 signals (JSH arrest, DIG liquidation, CMG penalty) |
| `get_market_context` | ✅ | OK | 20 alerts + analysis returned |
| `get_market_foreign_flow` | ✅ | OK | Coverage watchlist only; MWG net buy |
| `fetch_and_analyze` | ✅ | OK | 20 items analyzed |
| `search_similar_context` | ✅ | OK | RAG returns relevant results |
| `get_vn_macro_indicators` | ✅ | OK | IIP data flowing, source tier 2 |
| `get_vn_liquidity_state` | ✅ | DEGRADED | Multiple null/zero fields (interbank, SJC, OMO) |
| `get_ism_subcomponents` | ✅ | BLOCKED | no_data — FRED_API_KEY missing |
| `get_sentiment_trend({})` | ❌ | FAIL | stock_code required; fb-market-poster:118 still broken |
| `run_impact_chain` | ✅ (schema) | OK | Requires `newsText` + `includeWatchlist` params |

---

## Key New Finding This Cycle

**PO false-claim on BUG-SENTIMENT-TREND**: The PO notebook (written 2026-06-20T03:37Z) stated "ALREADY FIXED inline by cowork-refactory-expert... ZERO bare-{} get_sentiment_trend sites repo-wide." This was verified FALSE this cycle. `Read(docs/agents/fb-market-poster/flow/main.md:118)` returns `arguments={}` unchanged. The cowork-refactory-expert updated their notebook (claim: "dev-team notebook L26") but did not commit a change to the actual flow file. BUG remains live. Recommend: agent-father to directly edit the file, commit, and push — do not rely on notebook claims of fix without verifying the target file.

---

*Generated: 2026-06-20T08:12Z | Tools probed: 24 | Active bugs: 5 | Active issues: 6 | Resolved: 1*
