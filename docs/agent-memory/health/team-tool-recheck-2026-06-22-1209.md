# Team MCP Tool Health Recheck — 2026-06-22T12:09Z

**Cycle:** 2026-06-22T12:09Z (UTC — VN market CLOSED post-session)
**Prior report:** `team-tool-recheck-2026-06-22-0610.md`
**Delta window:** ~6h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server uptime at probe:** ~10h 7m (restarted ~2026-06-22T01:56:20Z)
**DB:** market.db 289.51 MB, WAL 0 B
**Probe scope:** 18 tools probed live; full Step 3c re-probe of all 5 BUGs + 8 ISSUEs from prior report

---

## STEP 3c — Prior Findings Re-Probed This Cycle

| Prior Item | Re-probe Command | This Cycle Result | Delta |
|---|---|---|---|
| BUG-1 BCTC dead | `get_sla_status`, `get_vps_service_health`, `get_vps_proxy_health` | vn-bctc-fetch: unhealthy, SLA 8124/360min CRITICAL, last push 2026-06-16T18:02:24Z | **WORSENING +360 min** |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 120 ⚠` | UNCHANGED (55→120) |
| BUG-3 TE dead | `get_system_status`, `get_macro_snapshot` | TE both entries: 120 failures; deltas null | UNCHANGED (55→120) |
| BUG-4 ISM no FRED | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM..."}` | UNCHANGED |
| BUG-5 fb-market-poster sentiment_trend | `grep get_sentiment_trend docs/agents/fb-market-poster/flow/main.md` | Line 118: `call_tool(..."get_sentiment_trend", arguments={})` — no stock_code | UNCHANGED |
| ISSUE-2 warning backlog | `get_system_status` DB Audit | `open_warnings: 49, pending_feedback: 67` | UNCHANGED |
| ISSUE-3 cycle stalls | `get_system_status` errors | `[intelligence-cycle] previous cycle still running — skipped` at 11:15 UTC | **WORSENED — 1 stall this cycle** |
| ISSUE-4 7 TA tickers | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows | UNCHANGED |
| ISSUE-5 commodity deltas null | `get_macro_snapshot` | `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` | UNCHANGED (linked BUG-3) |
| ISSUE-6 vnstock 85.7% | `get_cron_health` | `vnstockTradingStatsRefresh: 1.00 (100.0%), avg=708371ms, total_runs=7` | **IMPROVED — 85.7%→100% in 7d window** |
| ISSUE-7 macro-calendar empty | `get_macro_snapshot`→`get_macro_calendar` implied | Deltas null; TE still dead | UNCHANGED (linked BUG-3) |
| ISSUE-11 fundamentals 845s | `get_cron_health` | `vnstockFundamentalsRefresh: 100%, avg=845851ms, total_runs=2` | UNCHANGED (still 14.1 min avg) |
| ISSUE-NEW-1 foreignFlow noise | `get_system_status` errors | sbv zero-value rejections every 30 min + TE errors visible | UNCHANGED |
| IMPROVE-1 SBV zero-value | `get_system_status`, `get_vps_service_health`, `get_vn_liquidity_state` | vn-sbv-fetch unhealthy 44m uptime; all VPS pushes returning zeros; policy_rates in DB fallback; buy/sell rates = 0 | **ELEVATED → ISSUE-12 MEDIUM** |

---

## STEP 2 — Full Probe Table (This Cycle)

| Tool | Call Pattern | Result | Status |
|---|---|---|---|
| `get_system_status` | `{}` | Reachable; 10 unresolved errors in log; Reuters/TE 120×; sbv rejections every 30 min | ✅ REACHABLE |
| `get_cycle_bootstrap` | `{agent_name:"market-watcher"}` | OK — agent_signals 3 items, market_context populated, system_status in 20ms | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1857.91 +1.83%, breadth 128/180, source_tier=2 | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $78.98, gold $4227.6, USD/VND 26122; deltas null (BUG-3) | ✅ REACHABLE (data gap) |
| `get_cron_health` | `{}` | 75 jobs; sbvRatesRefreshJob 98.2%; all others ≥99.8% | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | 7 tickers TA not ready; 4 oversold signals (D2D/DPM/NKG/NVL) | ⚠ ISSUE-4 |
| `get_vps_proxy_health` | `{}` | prices/news/sbv: ok; bctc: STALE since 2026-06-16T18:02:24Z | ⚠ BUG-1 |
| `get_vps_service_health` | `{}` | vn-bctc-fetch: **unhealthy** 0ms; vn-sbv-fetch: **unhealthy** 44m; 1 healthy, 2 idle | ⚠ BUG-1 + ISSUE-12 |
| `get_sla_status` | `{}` | bctc: **8124/360min CRITICAL**; price/news/sbv_fx/foreign_flow: ok | ⚠ BUG-1 |
| `get_earnings_calendar` | `{}` | 41 tickers; 11 QUÁ HẠN; current date is Q2 window (July Q2 filings start soon) | ✅ HEALTHY |
| `get_agent_signals` | `{from_agent:null,status:"all",hours_back:0.25}` | 84 signals from alert-engine (all-producers mode, correct call pattern) | ✅ HEALTHY |
| `get_vn_macro_indicators` | `{}` | OK — IIP June 2026, source_tier=1, not estimate | ✅ HEALTHY |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"fred_series_daily has no ISM rows..."}` | ❌ BUG-4 |
| `get_vn_liquidity_state` | `{}` | policy_rates is_estimate=true (HTML parse failed); sjc_gap=0; usd_vnd_buy/sell=0; OMO blocked; interbank blocked | ⚠ ISSUE-12 |
| `get_technical_indicators` | `{code:"VCB"}` | OK — RSI=42.3, MACD histogram -176, BB lower at 60,392; source_tier=3 | ✅ HEALTHY |
| `get_week_period` | `{}` | `{weekLabel:"2026-W26", periodKey:"2026-06-22/2026-06-28"}` | ✅ HEALTHY |
| `task_list_held` | `{}` | 8 locks — 2 chef slots, 2 digest slots, 1 cowork-leader-lock (heartbeating) | ✅ HEALTHY |
| `get_recent_fixes` | `{limit:20}` | 20 fixes available; no BCTC/Reuters/TE/FRED fix landed since prior report | ✅ REACHABLE |

---

## RESOLVED — None New This Cycle

No findings from prior report were resolved between 06:10 UTC and 12:09 UTC.

---

## ACTIVE BUGS — 5 (all re-confirmed)

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 6+

| Signal | 06:10 UTC | 12:09 UTC | Delta |
|---|---|---|---|
| SLA breach | 7764/360min | **8124/360min** | +360 min |
| Last VPS push | 2026-06-16T18:02:24Z | 2026-06-16T18:02:24Z | Unchanged |
| vn-bctc-fetch uptime | 5d 12h 2m | 5d 17h 57m | STILL unhealthy |
| 24h pushes | 0 | 0 | Unchanged |

**Re-probe evidence:**
- `get_sla_status`: `bctc: 8124/360min — CRITICAL`
- `get_vps_proxy_health`: `bctc: STALE=YES, 24h_pushes=0`
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 0ms response`

**Caller surface:** bctc-analyst, refine_bctc_md, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob, market-analyst (BCTC path)

**Blast radius: CRITICAL.** Day 6+ without new BCTC ingestion. 11 watchlist tickers QUÁ HẠN Q1-2026. Q2-2026 earnings window opens July. If pipeline not restored before July, Q2 filings will be missed from day one.

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify via `get_vps_service_health` → `trigger_bctc_vps_fetch` to backfill.

---

### BUG-2 — HIGH — UNCHANGED — Reuters RSS Dead (120 consecutive failures, never successful)

**Re-probe evidence:**
- `get_system_status` source health: `Reuters RSS | Ngưng | Chưa bao giờ | 120 ⚠`
- Counter: 55 (06:10 UTC) → 120 (12:09 UTC) — ~10 failures/hour, continuous polling

**Caller-surface:** `grep -rE "reuters" docs/agents/*/flow/*.md` → 1 ops flow (ops-mainserver-fetch); core cowork flows use VnExpress/CafeF RSS which are healthy. Direct cowork impact: LOW.

**Fix:** Disable the Reuters RSS source record in DB/config. Source decommissioned (fix #7 2026-04-30 removed vn-reuters-fetch.service) but circuit-breaker record still fires ~10×/hour cluttering system error view.

---

### BUG-3 — HIGH — UNCHANGED — Trading Economics 2× Dead (120 consecutive failures each, never successful)

**Re-probe evidence:**
- `get_system_status` source health: `Trading Economics | Ngưng | Chưa bao giờ | 120 ⚠` (both TE entries)
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`

**Caller surface:** `grep -rE "get_ism_subcomponents|TradingEconomics" docs/agents/*/flow/*.md` → unified-agent (chef.md macro layer), market-watcher (macro risk), digest-predict (macro context), news-scout (macro regime) — 4 cowork flows with degraded commodity delta + macro-calendar data.

**Blast radius: HIGH.** Commodity deltas null system-wide. Macro calendar empty → agents cannot see upcoming economic events. 4 cowork flows missing TE data layer.

**Fix:** Inspect Chromium scraper path in mcp-server container (`tradingEconomicsChromium.ts`). Confirm Chromium available at `/usr/bin/chromium` and session/cookies valid. If Chromium blocked/anti-bot, evaluate alternative macro source for commodity deltas.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED_API_KEY missing)

**Re-probe evidence:**
- `get_ism_subcomponents({})`: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`

**Caller surface:** `grep -rE "get_ism_subcomponents" docs/agents/tools/package/*.md` → unified-agent, bctc-analyst, news-scout — 3 cowork flows use ISM PMI sub-components for US macro regime classification.

**Caller count: 3. All callers receive empty/error response.**

**Fix:** Set `FRED_API_KEY` env var in mcp-server container (free API: fred.stlouisfed.org/docs/api/api_key.html) → `macroIndicatorRefreshJob` auto-populates on next run.

---

### BUG-5 — LOW — UNCHANGED — fb-market-poster Calls `get_sentiment_trend({})` Without Required `stock_code`

**Re-probe evidence (this cycle):**
```
grep get_sentiment_trend docs/agents/fb-market-poster/flow/main.md
```
→ Line 118: `sentiment = call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})` ← broken (no stock_code)

**Caller count: 1 affected caller.** `docs/agents/unified-agent/flow/market-analysis.md` explicitly skips aggregate call → OK.

**Fix:** Update `docs/agents/fb-market-poster/flow/main.md:118` to call per-ticker in watchlist loop (e.g. `{stock_code: ticker}`) or remove if aggregate trend not needed. Zone: agent-father.

---

## ACTIVE ISSUES — 8

### ISSUE-2 — HIGH — UNCHANGED — Warning/Feedback Backlog

`get_system_status` DB Audit: `open_warnings: 49 high/critical, pending_feedback: 67 new items`. Partially auto-resolves when BUG-1/BUG-3 fixed.

---

### ISSUE-3 — MEDIUM — WORSENED — Intelligence-Cycle Self-Collision (1 stall this cycle)

`get_system_status` error at 11:15 UTC: `[intelligence-cycle] previous cycle still running — skipped`.
`get_cron_health`: `intelligenceCycleJob: success_rate=99.8%, last_status=success, avg_duration=27976ms`.

Prior cycle (06:10): no stall observed (IMPROVED). This cycle: 1 stall confirmed. The avg duration of ~28s is well within the 15-min window, but occasional spikes (SBV/news fetch latency) push the cycle past its slot. Low frequency (1 in 1171 runs = 0.085%), but worth watching.

**Fix:** Add per-source timeout cap (max 10s per external fetch inside intelligenceCycleJob) to prevent tail-latency spikes from causing slot collisions.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready (0 OHLCV rows)

`get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows.

Root: UPCOM/HNX scraper gaps + `^BDI` Yahoo Finance symbol broken.

**Fix:** Audit UPCOM/HNX scraper path; replace `^BDI` Yahoo symbol with direct BDI source (Baltic Exchange or Investing.com).

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Deltas Null (symptom of BUG-3)

`get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`. Auto-resolves with BUG-3.

---

### ISSUE-6 — LOW — IMPROVED — vnstockTradingStatsRefresh Slow (100% in 7d window, but avg 11.8 min)

`get_cron_health`: `vnstockTradingStatsRefresh: 1.00 (100.0%), avg=708371ms (11.8 min), total_runs=7`.
Prior cycle: 85.7% (6/7). A failed run aged out of the 7-day window and today's run succeeded → 100% now.

However, 11.8 min average duration is a structural risk: a slow run + next invocation = potential overlap with 15-min intelligenceCycleJob window.

**Fix:** Add per-ticker timeout + off-peak schedule (e.g. 03:00 UTC). Still open despite success rate improvement.

---

### ISSUE-7 — LOW — UNCHANGED — get_macro_calendar Empty (symptom of BUG-3)

`get_macro_calendar` returns `{"events":[],"status":"unavailable","source_tier":4}`. Auto-resolves with BUG-3.

---

### ISSUE-11 — LOW — UNCHANGED — vnstockFundamentalsRefresh Extremely Slow (845s avg)

`get_cron_health`: `vnstockFundamentalsRefresh: 100%, avg=845851ms (14.1 min), total_runs=2`. Risks timing overlap.

**Fix:** Per-ticker timeout + isolation; schedule off-peak (03:00 UTC).

---

### ISSUE-12 — MEDIUM — NEW ELEVATION (was IMPROVE-1) — VPS SBV Scraper Broken Post-Restart

**Evidence (re-probed this cycle):**
- `get_vps_service_health`: `vn-sbv-fetch: unhealthy, 0ms response, 44m uptime` — service restarted ~44 min ago
- `get_system_status` errors: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 10:03, 10:33, 11:03, 11:33, 12:03 (every 30 min = every VPS push)
- `get_vn_liquidity_state`: `policy_rates.source: "sbv_rates DB fallback (HTML parse failed)"`, `is_estimate:true`; `usd_vnd_buy:0, usd_vnd_sell:0`; OMO blocked ("no add/absorb rows found"); interbank_1w blocked ("dttktt.sbv.gov.vn unreachable from VPS")
- `get_cron_health`: `sbvRatesRefreshJob: 98.2% success_rate`
- `get_vps_proxy_health`: `sbv: ok, last push 12:03:37, 25 24h pushes` — pushes arriving but all zero-value

**Analysis:** The zero-value guard is correctly protecting the last good USD/VND center rate (26122). However, since the vn-sbv-fetch service restarted ~44 min ago, ALL VPS pushes have returned zero for sentinel fields. This means the HTML parser broke post-restart (likely SBV website structure change or session expiry). Consequently:
- Buy/sell FX rates = 0 (only center rate from DB available)
- OMO data unavailable
- Interbank rate unavailable
- Policy rates served from DB fallback (last good value)

The `get_macro_snapshot` still shows USD/VND 26122 (valid center rate). Agents are NOT receiving zero rates. Impact on cowork: moderate — market-watcher and unified-agent miss buy/sell spread + OMO signals.

**Caller surface:** `get_vn_liquidity_state`, `get_macro_snapshot` (SBV subfield), `get_carry_trade_signal` — 3 tools degraded.

**Fix:** SSH VPS → `sudo systemctl restart vn-sbv-fetch.service` → verify next push has non-zero sentinel fields. If restart does not fix parser, investigate SBV website structure change in `apps/mcp-server/src/infrastructure/fetchers/sbv.ts`.

---

## NON-ISSUES — Probe Errors This Cycle (caller-surface verified)

| Item | My Probe | Why Not a Bug | Verdict |
|---|---|---|---|
| `get_cycle_bootstrap({})` no agent_name | Validation error | Tool requires `agent_name`; all flow files call with explicit name | NON-ISSUE — probe error |
| `get_agent_signals({hours_back:2})` no from_agent | "agent required" | Inbox mode requires `agent`; market-watcher correctly uses `{from_agent:null, status:"all", hours_back:0.25}` | NON-ISSUE — probe error; flow contract correct |
| `get_technical_indicators({ticker:"VCB"})` | Validation error | Schema uses `code`, not `ticker`; tool doc + all callers use `{code: string}` | NON-ISSUE — probe error; tool + docs aligned |
| `get_news` tool | Tool not found | News arrives via VPS push pipeline → pollNewsJob; no direct `get_news` MCP tool by design | NON-ISSUE — by design |
| `newsapi: disabled` | 0 fetches | Intentional: no API key configured | NON-ISSUE — by design |
| Macro deltas null | `oilUsdDelta:null` | Symptom of BUG-3; not an independent tool failure | NON-ISSUE — upstream cause |
| `get_ism_subcomponents` returns error | `{"error":"no_data"}` | BUG-4 already open; tool reachable, data missing due to env var | Tracked under BUG-4 |

---

## Summary Table

| Severity | Count | Items |
|---|---|---|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 6+ WORSENING (8124/360min; July Q2 window imminent) |
| BUG HIGH | 2 | BUG-2 Reuters 120×; BUG-3 Trading Economics 120× each |
| BUG MEDIUM | 1 | BUG-4 ISM no FRED_API_KEY (3 cowork flows) |
| BUG LOW | 1 | BUG-5 fb-market-poster get_sentiment_trend({}) (1 caller) |
| ISSUE HIGH | 1 | ISSUE-2 49 warnings / 67 feedback backlog |
| ISSUE MEDIUM | 2 | ISSUE-3 cycle stall 1× at 11:15; ISSUE-12 SBV VPS parser broken post-restart |
| ISSUE LOW | 5 | ISSUE-4/5/6/7/11 |
| IMPROVED | 1 | ISSUE-6 vnstockTradingStatsRefresh 85.7%→100% in 7d window |
| RESOLVED | 0 | None new since 06:10 UTC |
| NON-ISSUE | 7 | Probe param errors, by-design, upstream causes |

---

## Recommended Actions (priority order)

1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1 CRITICAL, Day 6+. Then `trigger_bctc_vps_fetch`. July Q2 earnings window opens in ~9 days.
2. **SSH VPS → restart `vn-sbv-fetch.service`** — ISSUE-12 MEDIUM. SBV parser broken post-restart. All buy/sell rates = 0. Verify next push has non-zero sentinel fields.
3. **Set `FRED_API_KEY` env var in mcp-server container** — BUG-4. Free API, unblocks ISM for 3 cowork flows.
4. **Diagnose TE Chromium path** — BUG-3. Unblocks commodity deltas + macro-calendar for 4 cowork flows.
5. **Disable Reuters RSS source record in DB** — BUG-2. Eliminates ~10 spurious errors/hour from decommissioned source.
6. **Fix `docs/agents/fb-market-poster/flow/main.md:118`** — BUG-5. Add `stock_code` param.
7. **Per-source timeout in intelligenceCycleJob** — ISSUE-3. Prevents slot collision from tail-latency.
8. **Per-ticker timeout for vnstockTradingStatsRefresh/vnstockFundamentalsRefresh** — ISSUE-6/11.
