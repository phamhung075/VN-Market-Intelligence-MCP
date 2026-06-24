# Team MCP Tool Health Recheck — 2026-06-20T12:08Z

**Run type:** Scheduled recheck (delta vs 2026-06-20T10:07Z)
**Gateway:** vn-market reachable ✅
**Scope:** All cowork + dev agent tool dependencies derived from docs/data/system-map.json + docs/agents/*/flow/main.md
**Re-probe discipline:** Every prior finding re-probed this cycle before carry-forward (STEP 3c)
**Probe window:** 2026-06-20 ~12:02–12:09 UTC (VN market CLOSED — Saturday off-hours run)

---

## Summary

| Class | Count | Worst severity |
|-------|-------|----------------|
| BUG   | 5     | CRITICAL (BCTC pipeline dead, worsening) |
| ISSUE | 5     | HIGH (WTI/DJIA stale, SBV-parse, liquidity, ISM) |
| IMPROVE | 0   | — |
| RESOLVED | 0  | No new resolutions this cycle |

---

## ACTIVE BUGS — All re-confirmed this cycle

### BUG-1 — CRITICAL: BCTC VPS pipeline dead — WORSENING 🔴

| Field | Value |
|-------|-------|
| Tools probed | `get_sla_status`, `get_vps_service_health`, `get_vps_proxy_health` |
| Re-probe evidence | `get_sla_status` → bctc: **5243 min elapsed / 1656 min SLA → CRITICAL** (was 5122 min at 10:07Z, +121 min, still worsening at ~1 min/min). `get_vps_service_health` → `vn-bctc-fetch: unhealthy, uptime 3d 18h 2m, response_ms: 0`. `get_vps_proxy_health` → `bctc: last push 2026-06-16 18:02:24, STALE flag YES`. `get_system_status` → BCTC freshness 87.4h (VERY STALE). |
| Caller count | ≥5 confirmed: bctc-analyst (flow/cycle.md), refine_bctc_md (push_bctc_refined_unit), ops, unified-agent, system-auditor |
| Blast radius | P0 fleet-wide. bctc-analyst blocked on stale data. 12 tickers QUÁ HẠN per `get_earnings_calendar` (BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH, BDI). refine_bctc_md cannot receive new PDF units. |
| Delta vs 10:07Z | WORSENING: 5122→5243 min elapsed (+121 min), service still unhealthy |
| Suggested fix | SSH to VPS → `systemctl status vn-bctc-fetch; journalctl -u vn-bctc-fetch -n 100`; restart service; verify push arrives in `get_vps_proxy_health` within 15 min; run `trigger_bctc_vps_fetch` after restart. |

---

### BUG-2 — HIGH: HNX & UPCOM all price sources failing — UNCHANGED 🟠

| Field | Value |
|-------|-------|
| Tools probed | `get_system_status`, `get_pipeline_health`, `get_cycle_bootstrap` |
| Re-probe evidence | `get_system_status` → 10/10 recent errors (12:00–12:02 UTC): `[hnx] all HNX price sources failed`, `[hnx] all UPCOM price sources failed`, `[hose] all 4 price sources failed`. Circuit breaker `hnx: OK failures:0` — CB not tripped despite raw source failures (mismatch). `get_pipeline_health` → BDI: rows=0 TA-not-ready, DLC: rows=0, JSH: rows=0, SIS: rows=0, VDC: rows=0. |
| Caller count | market-watcher (cycle.md step 1), alert-engine (alertScanParallelJob), intelligenceCycleJob |
| Blast radius | 5 watchlist tickers have no current price data. Price anomaly detection blind for HNX/UPCOM tickers during active trading. Note: Saturday = market closed, failures are expected off-hours, but the same error pattern occurs during weekday trading hours per prior cycle evidence. |
| Delta vs 10:07Z | UNCHANGED — same error pattern, same tickers affected |
| Suggested fix | Investigate HNX/UPCOM fetcher chain in stock-price service. Likely rate-limit, IP block, or API schema change at source endpoint. Check VPS proxy `/proxy/ssc-iboard` fallback path for HNX/UPCOM. |

---

### BUG-3 — HIGH: Reuters RSS dead, 160 consecutive failures, never succeeded — WORSENING 🟠

| Field | Value |
|-------|-------|
| Tools probed | `get_system_status` → SOURCE HEALTH |
| Re-probe evidence | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 160 ⚠` — was 140 at 10:07Z, +20 this cycle. Source has NEVER successfully fetched in recorded history. |
| Caller count | ≥2: news-scout (fetch_and_analyze aggregates from news pipeline), intelligenceCycleJob |
| Blast radius | One international news source permanently dead. news-scout loses Reuters-first international stories (oil, Fed, geopolitics). |
| Delta vs 10:07Z | WORSENING: 140→160 failures (+20) |
| Suggested fix | Remove Reuters RSS from active source registry or verify if direct HTTP feed URL changed post-2024 Reuters RSS restructure. If decommissioned by design, update source health config to reflect decommission status (preventing noisy 160+ failure counts). |

---

### BUG-4 — HIGH: Trading Economics 2 sources dead, 160 failures each, never succeeded — WORSENING 🟠

| Field | Value |
|-------|-------|
| Tools probed | `get_system_status` → SOURCE HEALTH, `get_macro_snapshot` |
| Re-probe evidence | Both TE sources: `Trading Economics \| Ngưng \| Chưa bao giờ \| 160 ⚠` (was 140 each at 10:07Z, +20 per source). `get_macro_snapshot` → `oilUsdDelta: null`, `goldUsdDelta: null`, `usdVndDelta: null` — delta fields not computable (TE primary source down). |
| Caller count | ≥3: get_macro_snapshot consumers (market-watcher step 2, news-scout stage-bootstrap.md, unified-agent chef.md gather step) |
| Blast radius | Macro delta fields always null. Known: TRADING_ECONOMICS_API_KEY absent caps macro_indicators to 3 columns (C-09 threshold already adjusted to ≥3 in system-auditor). |
| Delta vs 10:07Z | WORSENING: 140→160 failures each (+20 per source) |
| Suggested fix | (a) Chromium path: `docker exec mcp-server chromium --version` — if missing, rebuild container with Dockerfile chromium install. (b) API path: set `TRADING_ECONOMICS_API_KEY` env var to restore full 12-col macro coverage. |

---

### BUG-SENTIMENT-TREND — HIGH: fb-market-poster `get_sentiment_trend({})` broken — UNCHANGED 🟠

| Field | Value |
|-------|-------|
| Tools probed | `get_sentiment_trend({})` |
| Re-probe evidence | `get_sentiment_trend({})` → `{"source_tier":3,"error":"Error: stock_code (or symbol) is required"}` — confirmed broken this cycle. Caller: `docs/agents/fb-market-poster/flow/main.md:118` calls `arguments={}` — still unpatched (grep confirmed at 10:07Z; not re-grepped this cycle as file-edit would show in git log). |
| Caller count | 1 confirmed: docs/agents/fb-market-poster/flow/main.md:118 |
| Blast radius | Every fb-market-poster sentiment step errors. Daily FB post lacks sentiment data. |
| Delta vs 10:07Z | UNCHANGED |
| Suggested fix | Edit `docs/agents/fb-market-poster/flow/main.md:118`: replace `arguments={}` with per-ticker loop calling `{stock_code: ticker, window_days: 7}` for each watchlist ticker. Dispatch to agent-father for commit. |

---

## ACTIVE ISSUES — All re-confirmed this cycle

### ISSUE-ISM — HIGH: FRED_API_KEY missing → ISM data always empty — UNCHANGED 🟡

| Field | Value |
|-------|-------|
| Tool probed | `get_ism_subcomponents({})` |
| Re-probe evidence | `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` — identical to 10:07Z. |
| Caller count | ≥3: news-scout (macro chain), unified-agent (macro layer), bctc-analyst (macro context) |
| Delta vs 10:07Z | UNCHANGED |
| Suggested fix | Set `FRED_API_KEY` env var in mcp-server Docker container; restart; re-run `macroIndicatorRefreshJob`; verify `get_ism_subcomponents` returns data. |

---

### ISSUE-WTI — MEDIUM: wti_crude_usd stale at $95.5 (economically impossible vs Brent $80.59) — UNCHANGED 🟡

| Field | Value |
|-------|-------|
| Tool probed | `get_system_status` → auto-tracked indicators |
| Re-probe evidence | `wti_crude_usd: 95.5 (79 data points)`. Brent: $80.59. WTI-Brent spread = **$14.91** — economically impossible (typical range $1–5). Value is months stale. |
| Caller count | ≥2: unified-agent macro layer, news-scout stage-sentiment.md commodity chain |
| Delta vs 10:07Z | UNCHANGED |
| Suggested fix | Trace `macro_indicators` table for `wti_crude_usd` series; re-run `commodityTrackerRefreshJob`; verify value updates to ~$77–79 range. |

---

### ISSUE-DJIA — MEDIUM: dow_jones stale at 23,750 (actual ~42,000+) — UNCHANGED 🟡

| Field | Value |
|-------|-------|
| Tool probed | `get_system_status` → auto-tracked indicators |
| Re-probe evidence | `dow_jones: 23750 (49 data points)`. Actual DJIA June 2026: ~42,000+. ~18,000 point deficit — fetcher likely pulling wrong series or pre-COVID seed data. |
| Caller count | ≥2: unified-agent macro layer, news-scout macro chain |
| Delta vs 10:07Z | UNCHANGED |
| Suggested fix | Trace `macro_indicators` table for `dow_jones` series ID; fix fetcher series or data source reference. |

---

### ISSUE-SBV-PARSE — MEDIUM: SBV HTML parse failing → storeSbvSnapshot REJECTED recurring — UNCHANGED 🟡

| Field | Value |
|-------|-------|
| Tools probed | `get_system_status`, `get_vn_liquidity_state` |
| Re-probe evidence | `get_system_status` → `[2026-06-20 12:01:17] [ERROR] [sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row`. `get_vn_liquidity_state` → `policy_rates.source: "sbv_rates DB fallback (HTML parse failed)", is_estimate: true`. `get_vps_proxy_health` shows SBV 25 pushes/24h (data flowing despite HTML parse issues). |
| Caller count | intelligenceCycleJob, sbvRatesRefreshJob, market-watcher (via macro context) |
| Delta vs 10:07Z | UNCHANGED — guard still firing, HTML parse still failing |
| Suggested fix | Investigate why SBV HTML scraper returns zero values. Check `vn-sbv-fetch` VPS logs for HTTP response codes. Health endpoint for vn-sbv-fetch reports 0 response_ms despite data flowing — possible health-check port misconfiguration. |

---

### ISSUE-LIQUIDITY — MEDIUM: get_vn_liquidity_state multiple null/zero fields — UNCHANGED 🟡

| Field | Value |
|-------|-------|
| Tool probed | `get_vn_liquidity_state({})` |
| Re-probe evidence | `interbank_1w.rate_1w_pct: null` (dttktt.sbv.gov.vn 100% packet loss from VPS — permanent); `sjc_price_mn_vnd: 0` (no SJC crawler row); `usd_vnd_buy: 0`, `usd_vnd_sell: 0`, `cny_vnd_rate: 0` (missing); `omo.net_outstanding_bn_vnd: null` (OMO HTML parse: no add/absorb rows found); `policy_rates: is_estimate: true` (HTML parse failed). |
| Caller count | ≥2: system-auditor (Tier-2/3), market-watcher (macro context) |
| Delta vs 10:07Z | UNCHANGED — all same null/zero fields |
| Suggested fix | (a) Interbank rate: route dttktt.sbv.gov.vn via main server instead of VPS. (b) SJC: add SJC price crawler to vn-price-fetch. (c) OMO HTML: fix SBV OMO page parser. (d) usd_vnd buy/sell/CNY: trace missing FX fields in scraper. |

---

## RESOLVED this cycle

*(No new resolutions. ISSUE-NEWS-SLA was already resolved in the 10:07Z cycle.)*

---

## Tool Probe Summary — This Cycle

| Tool | Reachable | Status | Notes |
|------|-----------|--------|-------|
| `get_system_status` | ✅ | ISSUES | 10 hnx/hose errors, Reuters/TE dead, 47 open warnings |
| `get_cycle_bootstrap` | ✅ | OK (enum-gated) | Requires `agent_name` — all callers pass it correctly |
| `get_market_snapshot` | ✅ | OK | VN-Index 1824.53, breadth 81↑/203↓ |
| `get_macro_snapshot` | ✅ | DEGRADED | Core data ok; oilDelta/goldDelta/usdVndDelta null (TE source down) |
| `get_agent_signals` (from_agent=null) | ✅ | OK | Returns all-producer signals correctly |
| `get_cron_health` | ✅ | OK | 69 jobs tracked; all ≥80% success rate |
| `get_pipeline_health` | ✅ | WARN | 5 tickers TA-not-ready (rows=0: BDI/DLC/JSH/SIS/VDC) |
| `get_vps_service_health` | ✅ | ALERT | vn-bctc-fetch unhealthy 3d 18h |
| `get_vps_proxy_health` | ✅ | ALERT | bctc STALE 4d; news/sbv ok |
| `get_sla_status` | ✅ | ALERT | bctc CRITICAL 5243/1656 min; others ok |
| `get_earnings_calendar` | ✅ | OK | 12 tickers QUÁ HẠN (data gap from BUG-1) |
| `get_sentiment_trend({})` | ❌ | FAIL | stock_code required; fb-market-poster/flow/main.md:118 unpatched |
| `get_ism_subcomponents` | ✅ | BLOCKED | no_data — FRED_API_KEY missing |
| `get_vn_liquidity_state` | ✅ | DEGRADED | interbank/SJC/buy-sell/OMO all null/zero |
| `emit_pressure_state` | ✅ | WARN | Returns stale_warning:true, cycle_snapshot_promoted:false |
| `get_rate_limit_status` | ✅ | OK | 14 sources, none at limit |
| `task_claim` | ✅ | OK | ttl_seconds minimum=60; all callers use ≥60 |
| `task_release` | ✅ | OK | |
| `get_recent_signals` | ✅ | OK | Returns signals in 15-min window correctly |
| `post_agent_signal` | ✅ | OK | TNB critic gate active; weak probes correctly rejected |

---

## NON-ISSUES verified this cycle (caller-surface confirmed)

| Finding | Probe result | Verdict |
|---------|-------------|---------|
| `get_agent_signals` inbox-mode requires `agent` | Only fails when `from_agent` fully omitted. `from_agent: null` works. All callers pass `null` explicitly. | **0 affected callers** — NON-ISSUE |
| `task_claim` ttl_seconds minimum=60 | All flow callers use ≥60 (min: 60 in slot-claim.md = 180; none use <60). | **0 affected callers** — NON-ISSUE |
| `get_news` tool not found | Tool does not exist. Grep `docs/agents/ -r "get_news"` → **0 matches** — NON-ISSUE |

---

*Generated: 2026-06-20T12:08Z | Tools probed: 20 | Active bugs: 5 | Active issues: 5 | Resolved: 0 | Non-issues verified: 3*
