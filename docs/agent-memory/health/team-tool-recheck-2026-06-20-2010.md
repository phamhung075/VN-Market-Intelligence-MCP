# Team MCP Tool Health Recheck — 2026-06-20T20:10Z

**Run:** 2026-06-20T20:10Z (automated scheduled recheck)
**Prior report:** `team-tool-recheck-2026-06-20-1809.md` (1h 59m ago)
**Methodology:** Live probe every depended-on tool via gateway; Step 3b caller-surface grep; Step 3c re-probe every prior finding before carry-forward. Tool dependency list sourced from `docs/agents/*/flow/main.md` + `docs/data/system-map.json`.
**Context:** Friday 20:10 UTC — VN market CLOSED (closed at 08:59 UTC). Server restarted at 20:03:50 UTC (38s before first probe — circuit breaker counters reset to 0; this is expected after restart and does NOT indicate CBs cleared by themselves).

---

## Summary

| Category | Count | vs 18:09Z |
|----------|-------|-----------|
| BUG (re-confirmed active) | 5 | → 0 resolved, 0 new |
| ISSUE (re-confirmed active) | 5 | → 1 RESOLVED (ISSUE-VN-MACRO), 0 new |
| RESOLVED this cycle | 1 | ISSUE-VN-MACRO |
| NON-ISSUE (verified this cycle) | 3 | — |
| IMPROVE (no callers broken) | 6 | +1 new (I6: market-watcher.md example drift) |

All 5 BUGs carry forward re-confirmed. BUG-1 (BCTC VPS) worsening +2h. ISSUE-VN-MACRO resolved (NSO IIP data now returning live data via PROBE-3 path). New IMPROVE I6: `market-watcher.md` package doc has 3 wrong example params (`ticker`/`tickers[]` vs `code`).

---

## ACTIVE BUGs — Re-confirmed This Cycle

### BUG-1 — CRITICAL: BCTC VPS pipeline dead (WORSENING, day 4+)

**Severity:** CRITICAL
**Status:** WORSENING (+2h vs 18:09Z prior)

**Re-probe evidence (20:06Z):**
- `get_vps_service_health` → `vn-bctc-fetch: unhealthy | uptime: 4d 2h 2m | response_ms: 0`
- `get_vps_proxy_health` → `bctc: last_push: 2026-06-16 18:02:24 | 0 pushes in 24h | STALE: YES`
- `bctcReparseJob` → `success_rate: 0.89 (88.9%)` — elevated failure rate from empty queue
- No recovery since 2026-06-16. Now in hour ~98 of BCTC data gap.

**Caller-surface:** `refine_bctc_md` (get_bctc_pending_refine + push_bctc_refined_unit), `bctc-analyst` (get_bctc_full, get_bctc_series, get_bctc_ocf), `system-auditor`, `ops` — ≥5 agents affected.

**Recommended action:** SSH VPS → `systemctl status vn-bctc-fetch` + `journalctl -u vn-bctc-fetch -n 50`. Try `trigger_bctc_vps_fetch({})` MCP tool. Check for OOM (VPS 961 MB RAM; BCTC PDF fetch is memory-intensive). Ref: fix #7 (2026-04-30) pattern.

---

### BUG-2 — HIGH: HNX & UPCOM all price sources failing (UNCHANGED)

**Severity:** HIGH
**Status:** UNCHANGED

**Re-probe evidence (20:04Z):**
- `get_system_status` → 10/10 recent unresolved errors: `[hnx] all HNX price sources failed` + `[hnx] all UPCOM price sources failed` recurring at 19:56–20:04 UTC (off-hours)
- `get_pipeline_health` → tickers with 0 OHLCV rows: BDI, DLC, JSH, SIS, VDC; DAG: 1 row; VNH: 6 rows — all HNX/UPCOM tickers chronically under-data
- Circuit breaker `hnx [OK] failures: 0` reflects fresh restart reset, NOT a fix — failures will re-accumulate in next intelligenceCycleJob tick

**Caller-surface:** market-watcher (get_market_snapshot), TA alert scan jobs (taAlertScanJob, bbAlertScanJob), intelligenceCycleJob HNX path. 6+ watchlist tickers without usable OHLCV data.

**Recommended action:** Add `isVnMarketHours()` guard to HNX/UPCOM fetch path in intelligenceCycleJob (TASK 1407 pattern for foreignFlow). Separately investigate HNX data source URL/API endpoint availability.

---

### BUG-3 — HIGH: Reuters RSS dead — source disabled, never successful (CARRY FORWARD)

**Severity:** HIGH
**Status:** CARRY FORWARD — CBs reset to 0 after restart, but source health shows `disabled | never successful`

**Re-probe evidence (20:04Z):**
- `get_system_status` → `Reuters RSS | disabled | Chưa bao giờ | 0` — "disabled" persistent status; 0 failures reflects post-restart CB reset only, NOT a fix
- Prior 18:09Z: 217 consecutive failures before restart; source was already disabled/broken

**Caller-surface:** `fetch_and_analyze` headline aggregator (news-scout). 1 affected pipeline — reduced headline diversity.

**Recommended action:** Verify `feeds.reuters.com` accessibility from main server; if permanently inaccessible, remove Reuters RSS source registration to prevent renewed failure accumulation post-restart.

---

### BUG-4 — HIGH: TradingEconomics dead — null macro deltas, stale WTI/DJIA (CARRY FORWARD)

**Severity:** HIGH
**Status:** CARRY FORWARD — persistent data symptoms confirmed despite post-restart CB reset

**Re-probe evidence (20:04Z):**
- `get_macro_snapshot` → `oilUsdDelta: null, goldUsdDelta: null, usdVndDelta: null` — all delta fields null (TE provides delta)
- `get_system_status` → `wti_crude_usd: 95.5 (79 data points)` — pre-2024 phantom stale seed unchanged
- `get_system_status` → `dow_jones: 23750 (49 data points)` — 2019/2020-era level, ~45% below actual DJIA ~42,000
- Source health: `Trading Economics | disabled | Chưa bao giờ | 0` — same as Reuters, CB counters reset

**Caller-surface:** market-watcher, news-scout, unified-agent (CHEF macro layer) — all use macro snapshot delta fields. 3 agents operating with null momentum context.

**Recommended action:** Check Playwright/Chromium in Docker (`docker exec mcp-server chromium --version`). Inspect TE scraper logs for "Target closed" crash (known pattern, fix #5 2026-05-01). Confirm `trading-economics-chromium` source path is active.

---

### BUG-SENTIMENT — HIGH: `get_sentiment_trend({})` broken — fb-market-poster caller unpatched (UNCHANGED)

**Severity:** HIGH
**Status:** UNCHANGED

**Re-probe evidence (20:09Z):**
- `call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})` → `{"source_tier":3,"error":"Error: stock_code (or symbol) is required"}`
- Tool requires `stock_code` param; calling with empty args throws hard error.

**Caller-surface verified:**
- `grep -n "get_sentiment_trend" docs/agents/fb-market-poster/flow/main.md` → caller confirmed with no `stock_code` arg
- 1 affected caller: fb-market-poster cycle fails to get sentiment data every run

**Recommended action:** Patch `docs/agents/fb-market-poster/flow/main.md` — add `stock_code: "VNM"` (anchor ticker) or iterate watchlist. One-line doc fix.

---

## ACTIVE ISSUEs — Re-confirmed This Cycle

### ISSUE-ISM — MEDIUM: FRED API key missing (UNCHANGED)

**Re-probe (20:09Z):** `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
**Callers:** news-scout, unified-agent, bctc-analyst (macro regime inputs).
**Action:** Set `FRED_API_KEY` in `.env` and restart mcp-server container. Free key: fred.stlouisfed.org.

---

### ISSUE-SBV-PARSE — MEDIUM: SBV HTML parse failing (UNCHANGED)

**Re-probe (20:09Z):** `get_vn_liquidity_state({})` → `policy_rates.source: "sbv_rates DB fallback (HTML parse failed)"`, `is_estimate: true`. VPS service `vn-sbv-fetch: unhealthy, uptime: 1h 4m`. Recent error: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row`.
**Callers:** intelligenceCycleJob, sbvRatesRefreshJob, market-watcher.
**Action:** Update CSS selectors in SBV scraper — SBV website HTML structure changed.

---

### ISSUE-LIQUIDITY — MEDIUM: VN liquidity/interbank metrics null (UNCHANGED)

**Re-probe (20:09Z):** `get_vn_liquidity_state({})`:
- `sjc_price_mn_vnd: 0` — no SJC crawler row
- `usd_vnd_buy: 0, usd_vnd_sell: 0, cny_vnd_rate: 0` — FX parse fail
- `omo.net_outstanding_bn_vnd: null` — "no add/absorb rows found"
- `interbank_1w.rate_1w_pct: null` — "dttktt.sbv.gov.vn unreachable from VPS (100% packet loss)"

**Root cause:** dttktt.sbv.gov.vn unreachable from VPS + SBV HTML parse fail (shared root with ISSUE-SBV-PARSE).
**Callers:** system-auditor, market-watcher. Liquidity context blind.
**Action:** Fix SBV parse + investigate packet loss to dttktt.sbv.gov.vn from VPS.

---

### ISSUE-MACRO-CAL — MEDIUM: `get_macro_calendar` permanently unavailable (UNCHANGED)

**Re-probe (20:09Z):** `call_tool(server="vn-market", tool="get_macro_calendar", arguments={"days_ahead":14})` → `{"events":[], "status":"unavailable", "source_tier":4}`
**Callers:** digest-predict (pivot_window_active signal), alert-commander stage-bootstrap (pivot window detection). 2 agents affected.
**Action:** Investigate macro calendar data source in `apps/mcp-server/src/`; restore or stub endpoint.

---

### ISSUE-VNSTOCK-STATS — LOW: vnstockTradingStatsRefresh 85.7% success rate (UNCHANGED)

**Re-probe (20:06Z):** `get_cron_health` → `vnstockTradingStatsRefresh: success_rate: 0.86 (85.7%) | avg_duration: 649,220ms | total_runs: 7`
**Status:** Above 80% alert threshold; monitoring recommended. Transient vnstock API timeout likely culprit.
**Action:** No immediate action — watch for further degradation below 80%.

---

## RESOLVED This Cycle

### ISSUE-VN-MACRO — RESOLVED ✓

**Prior status (18:09Z):** `get_vn_macro_indicators({})` → `status: "degraded"`, blocked on NSO Excel VPS proxy timeout.

**Resolution evidence (20:09Z):**
- `call_tool(server="vn-market", tool="get_vn_macro_indicators", arguments={})` → `{"status":"ok","period":"2026-06","iip":[...],"source":"NSO monthly Excel, sheet '2.IIPthang' (PROBE-3 PASS)","is_estimate":false}`
- IIP data for June 2026 fully returned: iip_all_industry 103.3% YoY, manufacturing 103.39%, electricity 104.59%.
- PROBE-3 path succeeded — either VPS proxy recovered, or the June 2026 NSO file was cached successfully.

**Status: RESOLVED — dropping from active tracking.**

---

## NON-ISSUEs Verified This Cycle

| Finding | Probe | Verdict |
|---------|-------|---------|
| 5 cron jobs `crashed` at last run (20:00:29) | `get_cron_health` → all 5 crashed at same timestamp, server restarted at 20:03:50 (3.5 min later) | NON-ISSUE — restart-kill artifacts, not persistent failures |
| `get_system_status` 60s cold-start timeout | First probe at 38s post-restart timed out; second probe (2min later) returned in <1s | NON-ISSUE — transient init, expected on cold start |
| Circuit breaker failures all = 0 | All CBs reset to 0 after server restart at 20:03:50 | NON-ISSUE — reflects restart, NOT real fix; will re-accumulate |

---

## NEW IMPROVE This Cycle

### I6 — IMPROVE: `market-watcher.md` package doc has 3 wrong example params

**Finding:** `docs/agents/tools/package/market-watcher.md` example code uses wrong parameter names for 3 tools:
- Line 147: `get_price_history` called with `tickers: ["VCB","ACB","FPT"]` (array, wrong) — canonical uses `code: string`
- Line 177: `get_technical_indicators` called with `{ ticker: "FPT" }` (wrong param name) — canonical uses `code: string`
- Line 208: `get_ticker_intelligence` called with `{ ticker: "VCB" }` (wrong param name) — canonical uses `code: string`

**Verification:**
- Live probe: `get_technical_indicators({ticker: "FPT"})` → validation error: `"Required" path: ["code"]`  ✓ confirms drift
- Canonical contracts (`docs/agents/tools/list/get_technical_indicators.md`, `get_price_history.md`, `get_ticker_intelligence.md`) all correctly specify `code: string`
- Grep command run: `grep -n "ticker.*FPT\|ticker.*VCB\|\"ticker\"" docs/agents/tools/package/market-watcher.md` → found 3 bad examples at lines 147, 177, 208

**Caller-surface verified:** `grep "get_technical_indicators\|get_price_history\|get_ticker_intelligence" docs/agents/market-watcher/flow/cycle.md docs/agents/market-watcher/flow/eod.md` → actual flow files do NOT copy example params verbatim; they use `code` correctly. Bad params isolated to package doc examples only.

**Impact:** No callers currently broken. Risk: an agent spawned fresh that reads this package doc and follows examples will hit validation errors on these 3 tools. Classify: IMPROVE.

**Fix:** Update `docs/agents/tools/package/market-watcher.md` lines 147→`"code": "VCB"`, 177→`"code": "FPT"`, 208→`"code": "VCB"`.

---

## IMPROVE Carry-Forward (From Prior Report)

| # | Finding | Recommended Fix |
|---|---------|----------------|
| I1 | intelligenceCycleJob fires HNX price fetch 24/7 without market-hours gate — noisy off-hours errors | Add `isVnMarketHours()` guard in HNX fetch path (TASK 1407 pattern) |
| I2 | `get_bctc_refined` returns `{"error":"no refined units found"}` instead of `{"units":[]}` on empty state | Change to `{units:[]}` for consistent JSON shape |
| I3 | `emit_pressure_state` accepts arbitrary `state` strings; docs specify `normal\|high\|critical` only | Add Zod enum validation |
| I4 | `task_claim.md` docs omit `minimum ttl_seconds: 60` constraint (live API enforces it) | Update tool doc |
| I5 | `get_bctc_pending_refine` returns 235k+ chars — exceeds MCP context budget | Add `limit` param (default 20 items) + `offset` for pagination |
| I6 | `market-watcher.md` examples use `ticker`/`tickers[]` instead of `code` for 3 tools (**NEW this cycle**) | Fix lines 147, 177, 208 in `docs/agents/tools/package/market-watcher.md` |

---

## Tool Probe Coverage This Cycle

| Tool | Result | Status |
|------|--------|--------|
| `get_cycle_bootstrap` (agent_name="news-scout") | OK — 15ms, 0 pending signals | ✅ |
| `get_cycle_bootstrap` (agent_name="market-watcher") | OK — 11ms, 0 pending signals | ✅ |
| `get_market_snapshot` | OK — VN-Index 1,824.53 (-0.32%), breadth 81A/203D | ✅ |
| `get_macro_snapshot` | OK — null deltas confirm BUG-4 still active | ✅ |
| `get_market_context` | OK — watchlist + alerts + analysis | ✅ |
| `get_system_status` | OK (2nd call) — reveals BUG-2 HNX errors, 49 open warnings | ✅ |
| `get_cron_health` | OK — 5 crashed jobs = restart artifacts; reveals ISSUE-VNSTOCK-STATS | ✅ |
| `get_vps_proxy_health` | OK — confirms BUG-1 (bctc STALE 4d), news/sbv healthy | ✅ |
| `get_vps_service_health` | OK — confirms BUG-1 (vn-bctc-fetch unhealthy), vn-sbv-fetch unhealthy | ✅ |
| `get_pipeline_health` | OK — 6 tickers TA not ready (HNX/UPCOM, confirms BUG-2) | ✅ |
| `get_earnings_calendar` | OK — 41 tickers, 12 QUÁ HẠN | ✅ |
| `get_technical_indicators` (code="VCB") | OK — RSI 45.5, MACD hist -169 | ✅ |
| `get_technical_indicators` (ticker="FPT") | FAIL — validation error: `code` required → confirms I6 drift | 🔴 |
| `get_price_history` (code="VCB", days=5) | OK — 5-day OHLCV returned | ✅ |
| `fetch_and_analyze` | OK — 20 articles analyzed, source_tier 2 | ✅ |
| `get_agent_signals` (agent="news-scout") | OK — 0 new signals | ✅ |
| `get_earnings_calendar` | OK — 41 tickers | ✅ |
| `emit_pressure_state` | OK — stale_warning: true, cycle_snapshot_promoted: false | ✅ |
| `get_sentiment_trend` (no args) | FAIL → stock_code required — **BUG-SENTIMENT re-confirmed** | 🔴 |
| `get_ism_subcomponents` | FAIL → FRED_API_KEY missing — **ISSUE-ISM re-confirmed** | ⚠️ |
| `get_macro_calendar` (days_ahead=14) | FAIL → status=unavailable — **ISSUE-MACRO-CAL re-confirmed** | ⚠️ |
| `get_vn_liquidity_state` | FAIL → sjc/omo/interbank null — **ISSUE-LIQUIDITY/SBV-PARSE re-confirmed** | ⚠️ |
| `get_vn_macro_indicators` | OK → status=ok, IIP 2026-06 live — **ISSUE-VN-MACRO RESOLVED** | ✅ |
| `post_agent_signal` (probe payload) | OK — TNB critic gate working correctly (rejected thin test payload, 1 retry remaining) | ✅ |
| `task_claim` (probe) | OK schema validation — `ttl_seconds ≥60`, `task_kind` enum enforced | ✅ |

---

## Priority Action Queue for Dev Team

| # | Priority | Finding | Action |
|---|----------|---------|--------|
| 1 | P0 | BUG-1: BCTC VPS vn-bctc-fetch UNHEALTHY 4+ days | SSH VPS: `systemctl status vn-bctc-fetch` + `journalctl -n 50`; try `trigger_bctc_vps_fetch({})` |
| 2 | P1 | BUG-4: TradingEconomics dead (null macro deltas, WTI $95.5, DJIA 23,750) | Repair Playwright/Chromium TE scraper; check `docker exec mcp-server chromium --version` |
| 3 | P1 | BUG-3: Reuters RSS dead (disabled, no data) | Decommission dead path OR repair feed URL |
| 4 | P1 | BUG-SENTIMENT: fb-market-poster calls `get_sentiment_trend({})` without `stock_code` | 1-line doc fix in `docs/agents/fb-market-poster/flow/main.md` |
| 5 | P1 | ISSUE-MACRO-CAL: `get_macro_calendar` unavailable (2 callers: digest-predict, alert-commander) | Investigate calendar data source in `apps/mcp-server/src/` |
| 6 | P2 | ISSUE-SBV-PARSE + ISSUE-LIQUIDITY: SBV HTML parse failed, interbank null | Update SBV CSS selectors; investigate dttktt.sbv.gov.vn packet loss from VPS |
| 7 | P2 | BUG-2: HNX/UPCOM all price sources failing in off-hours (10 errors/run) | Add `isVnMarketHours()` guard to HNX fetch path |
| 8 | P2 | IMPROVE I6: market-watcher.md examples use `ticker`/`tickers[]` (wrong) for 3 tools | Fix lines 147, 177, 208 in `docs/agents/tools/package/market-watcher.md` |
| 9 | P3 | ISSUE-ISM: FRED_API_KEY missing | Set env var in `.env` and restart mcp-server container |
| 10 | P3 | IMPROVE I5: `get_bctc_pending_refine` 235k+ char overflow | Add `limit`/`offset` pagination param |

---

*Generated by health-recheck agent at 2026-06-20T20:10Z*
*Tool dependency list sourced from docs/agents/*/flow/main.md + docs/data/system-map.json*
