# Team MCP Tool Health Recheck — 2026-06-22T04:10Z

**Cycle:** 2026-06-22T04:10Z (UTC — VN market OPEN 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-22-0207.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server uptime at probe:** ~2h 9m (restarted ~2026-06-22T01:56:20Z)

---

## STEP 3c — Prior Findings Re-Probed This Cycle

All active bugs/issues from prior report re-probed from scratch. Commands and outputs cited inline.

| Prior Item | Re-probe Command | This Cycle Result | Delta |
|-----------|-----------------|-------------------|-------|
| BUG-1 BCTC dead | `get_vps_service_health`, `get_sla_status`, `get_vps_proxy_health` | unhealthy 5d 10h 2m; SLA 7645/120min; last_push 2026-06-16T18:02:24Z | **WORSENING** — +123 min |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 29` | UNCHANGED |
| BUG-3 TE dead | `get_system_status`, `get_macro_snapshot`, `get_macro_calendar` | TE both entries: 29 failures, never succeeded; deltas null; calendar `{"events":[],"status":"unavailable"}` | UNCHANGED |
| BUG-4 ISM no FRED_API_KEY | `get_ism_subcomponents({})` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows..."}` | UNCHANGED |
| ISSUE-1 SBV crash loop | `get_vps_service_health` | vn-sbv-fetch: **healthy** 2m ago | **RESOLVED** |
| ISSUE-2 warnings backlog | `get_system_status` DB Audit | open_warnings: 49, pending_feedback: 67 | UNCHANGED |
| ISSUE-3 cycle stalls | `get_cron_health` | intelligenceCycleJob: last_status=success, last_run=2026-06-22T04:00:00Z, avg=27700ms | IMPROVED — not stalling this cycle |
| ISSUE-4 TA not ready 7 tickers | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 | UNCHANGED |
| ISSUE-5 commodity deltas null | `get_macro_snapshot` | `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` | UNCHANGED (linked to BUG-3) |
| ISSUE-6 vnstock 85.7% | `get_cron_health` | `vnstockTradingStatsRefresh: 0.86 (85.7%), avg=649220ms, total_runs=7` | UNCHANGED |
| ISSUE-7 macro-calendar empty | `get_macro_calendar({})` | `{"events":[],"status":"unavailable","source_tier":4}` | UNCHANGED (linked to BUG-3) |
| ISSUE-10 VPS health 4/5 unhealthy | `get_vps_service_health` | Only vn-bctc-fetch unhealthy; all others healthy | **LARGELY RESOLVED** |
| ISSUE-11 vnstockFundamentalsRefresh 845s | `get_cron_health` | `avg_duration=845851ms, total_runs=2` | UNCHANGED |

---

## STEP 2 — Full Probe Table (This Cycle)

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_cycle_bootstrap` | `{agent_name:"market-watcher"}` | OK — agent_signals, market_context, system_status returned in 20ms | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1851.13 +1.46%, breadth 84/182/69, source_tier=2 | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $79.29, gold $4195.3, USD/VND 26122; deltas null (BUG-3) | ✅ REACHABLE (data gap) |
| `get_system_status` | `{}` | Recurring errors: vn_index_cache schema, foreign-flow exhausted; Reuters/TE degraded 29× | ✅ REACHABLE |
| `get_cron_health` | `{}` | 75 jobs — all ≥98% except vnstockTradingStatsRefresh (85.7%); intelligenceCycleJob OK | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | 7 tickers TA not ready; 6 oversold signals; BDI/DLC/JSH/SIS/VDC=0 rows | ⚠ ISSUE-4 |
| `get_vps_proxy_health` | `{}` | prices/news/sbv: ok; bctc: STALE since 2026-06-16T18:02:24Z | ⚠ BUG-1 |
| `get_vps_service_health` | `{}` | vn-bctc-fetch: unhealthy; 4 others: healthy | ⚠ BUG-1 |
| `get_rate_limit_status` | `{}` | 11 hosts — all ready, no waits | ✅ HEALTHY |
| `get_sla_status` | `{}` | bctc: 7645/120min CRITICAL; price/news/sbv_fx/foreign_flow: ok | ⚠ BUG-1 |
| `get_alerts` | `{}` | 20 alerts (7d); 4 CRITICAL macro deviations; 4 MEDIUM price_surge; 12 unread | ✅ HEALTHY |
| `get_week_period` | `{}` | W26 (2026-06-22→2026-06-28), periodKey correct | ✅ HEALTHY |
| `get_earnings_calendar` | `{}` | 41 tickers; 11 QUÁ HẠN; 30 ĐÃ NỘP — June not earnings window (triggers: Jan/Apr/Jul/Oct) | ✅ HEALTHY |
| `get_agent_signals` | `{from_agent:"market-watcher",limit:5}` | "Không có tín hiệu mới" — empty (valid at open) | ✅ HEALTHY |
| `task_list_held` | `{}` | 6 locks — cowork-leader-lock + 5 cowork-slots (2 digest slots expiring today) | ✅ HEALTHY |
| `get_market_context` | `{}` | 42 tickers with prices, 10 analysis items, 12 alerts, macro — full data | ✅ HEALTHY |
| `get_market_foreign_flow` | `{}` | 95-ticker market aggregate; net −3.2k (NET SELL); data live | ✅ HEALTHY |
| `get_legal_risk_signals` | `{}` | 8 signals; JSH chairman arrested; DIG forced liquidation; CMG penalty | ✅ HEALTHY |
| `get_watchlist` | `{}` | 41 tickers with live prices and thresholds | ✅ HEALTHY |
| `get_technical_indicators` | `{code:"FPT"}` | OK — RSI=38.6, MACD=-572, BB returned | ✅ HEALTHY |
| `get_ticker_intelligence` | `{code:"FPT"}` | OK — price, evidence, predictions, insider | ✅ HEALTHY |
| `get_sentiment_trend` | `{stock_code:"FPT"}` | OK (empty data for FPT — valid) | ✅ HEALTHY |
| `get_sentiment_trend` | `{}` (no stock_code) | ERROR: "stock_code (or symbol) is required" source_tier=3 | ❌ BUG-NEW-2 |
| `get_foreign_flow` | `{code:"FPT"}` | OK — neutral signal, 10-day history | ✅ HEALTHY |
| `get_market_foreign_flow` | `{}` | OK — 95 tickers, live net flow | ✅ HEALTHY |
| `get_market_breadth` | `{}` | OK — advances 81, declines 182, volume 180M | ✅ HEALTHY |
| `get_imf_signals` | `{}` | OK — 3 indicators, GDP/inflation/current-account, imf_bearish | ✅ HEALTHY |
| `get_investment_clock_phase` | `{}` | OK — phase: Overheat, CPI 5.46%, fetched_at correct | ✅ HEALTHY |
| `get_vn_macro_indicators` | `{}` | OK — IIP data for June 2026, source_tier=1 | ✅ HEALTHY |
| `get_ism_subcomponents` | `{}` | ERROR: no_data — FRED_API_KEY missing | ❌ BUG-4 |
| `get_macro_calendar` | `{}` | `{"events":[],"status":"unavailable","source_tier":4}` | ❌ ISSUE-7 |
| `post_agent_signal` | `{}` (schema probe) | Schema error — required: from_agent, to_agent, signal_type, payload → REACHABLE | ✅ REACHABLE |
| `task_claim` | `{}` (schema probe) | Schema error — required: task_id, task_kind, owner_agent → REACHABLE | ✅ REACHABLE |

---

## STEP 3c — RESOLVED THIS CYCLE

| Item | Prior Status | This Cycle | Evidence |
|------|-------------|------------|---------|
| ISSUE-1 SBV crash loop | HIGH — vn-sbv-fetch unhealthy crash loop | **RESOLVED** — vn-sbv-fetch: healthy | `get_vps_service_health`: `vn-sbv-fetch \| healthy \| 2m ago` |
| ISSUE-10 VPS health 4/5 unhealthy | MEDIUM — false-alarm fatigue | **LARGELY RESOLVED** — only bctc genuinely unhealthy | `get_vps_service_health`: 4 healthy, 1 unhealthy |

---

## ACTIVE BUGS — 6 (4 carry-forward + 2 NEW)

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 6+

| Signal | 02:07 UTC | 04:10 UTC | Delta |
|--------|-----------|-----------|-------|
| vn-bctc-fetch uptime | 5d 7h 57m | **5d 10h 2m** | +2h 5m |
| SLA breach (actual/SLA) | 7522/120min | **7645/120min** | +123 min |
| Last BCTC VPS push | 2026-06-16T18:02:24Z | 2026-06-16T18:02:24Z | Unchanged |
| 24h pushes | 0 | 0 | Unchanged |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 0ms, uptime=5d 10h 2m`
- `get_sla_status`: `bctc: 7645/120min — CRITICAL`
- `get_vps_proxy_health`: `bctc: last_push=2026-06-16T18:02:24Z, 24h_pushes=0, STALE=YES`

**Caller surface:** bctc-analyst, refine_bctc_md, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob, market-analyst (via get_financial_summary/BCTC path)

**Blast radius: CRITICAL. 6+ days without BCTC ingestion. 11 Q1 watchlist tickers overdue. June is NOT an earnings window (next window starts July), so 168h policy threshold applies — but service being dead for 6 days is still a critical reliability failure.**

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify via `get_vps_service_health` → `trigger_bctc_vps_fetch` to backfill.

---

### BUG-2 — HIGH — UNCHANGED — Reuters RSS Dead

**Re-probe evidence (this cycle):**
- `get_system_status` source health: `Reuters RSS | Ngưng | Chưa bao giờ | 29 ⚠`
- Counter grew from 4 (at 02:07 UTC) to 29 (at 04:10 UTC) — confirms continuous failure

**Caller surface grep:** `grep -rE "reuters" docs/agents/*/flow/*.md` → news-scout/flow/cycle.md, unified-agent/flow/chef.md
**Callers: 2 agent flows affected.**

**Fix:** Disable the Reuters RSS source record in MCP DB/config. Source was decommissioned per fix #7 (2026-04-30 "decommissioned vn-reuters-fetch.service") but the circuit-breaker record still fires, generating errors on every poll cycle.

---

### BUG-3 — HIGH — UNCHANGED — Trading Economics 2× Dead

**Re-probe evidence (this cycle):**
- `get_system_status` source health: `Trading Economics | Ngưng | Chưa bao giờ | 29 ⚠` (both entries)
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`
- `get_macro_calendar({})`: `{"events":[],"status":"unavailable","source_tier":4}`

**Caller surface:** market-watcher, unified-agent, news-scout, digest-predict, alert-commander (5 flows impacted)

**Blast radius: Commodity deltas null system-wide. macro-calendar empty (ISSUE-7 linked). 5 agent flows degraded.**

**Fix:** Diagnose TE fetcher path in mcp-server container. Chromium scraper added in fix #6 (2026-04-30) — confirm it is still running in container. Check `tradingEconomicsChromium.ts` path and Chromium availability.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED_API_KEY absent)

**Re-probe evidence (this cycle):**
- `get_ism_subcomponents({})`: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`

**Caller surface:** bctc-analyst/flow/cycle.md, news-scout/flow/cycle.md, unified-agent/flow/chef.md (3 flows)

**Fix:** Set `FRED_API_KEY` env var (free registration: fred.stlouisfed.org) → re-run macroIndicatorRefreshJob.

---

### BUG-NEW-1 — MEDIUM — NEW — `vn_index_cache` Schema Bug: Missing `code` Column

**Discovery (this cycle):** `get_system_status` recent errors show recurring WARN every 5 minutes:
```
[vn-index-refresh] vn_index_cache upsert failed (non-fatal) — table vn_index_cache has no column named code
```
Seen at 04:05:01, 04:05:01, 04:06:00 (multiple entries per minute). Not in prior report — server was 6m old at 02:07 UTC probe; now confirmed as persistent with 2h+ uptime.

**Root cause:** A schema migration added a `code` column INSERT into `vnIndexRefreshJob.ts` but the matching SQLite `ALTER TABLE vn_index_cache ADD COLUMN code TEXT` migration was not executed (or migration order is wrong). The cron reports `success` because the error is caught as non-fatal, masking the failure from `get_cron_health`.

**Caller surface:**
- `grep -rE "vn_index_cache" apps/mcp-server/src/` → vnIndexRefreshJob (direct DB write, every 5 min market hours)
- `get_market_snapshot` and `get_cycle_bootstrap` appear unaffected (return live VN-Index data from separate price feed)
- vn_index_cache may be used by time-series lookups or historical comparisons — impact scope unclear without code inspection

**Suggested fix:** Run missing migration: `ALTER TABLE vn_index_cache ADD COLUMN code TEXT;` — then verify vnIndexRefreshJob completes without WARN. Zone: `apps/mcp-server` → dev-mcp-server.

---

### BUG-NEW-2 — LOW — NEW — `fb-market-poster` Flow Calls `get_sentiment_trend` Without Required `stock_code`

**Discovery (this cycle):**
- Live probe: `call_tool("get_sentiment_trend", {})` → `{"error":"stock_code (or symbol) is required","source_tier":3}`
- Caller grep: `docs/agents/fb-market-poster/flow/main.md:118`: `sentiment = call_tool(server="vn-market", tool="get_sentiment_trend", arguments={})`

**Caller-surface verification:**
```
grep -rE "get_sentiment_trend" docs/agents/*/flow/*.md
```
- `docs/agents/fb-market-poster/flow/main.md:118` — calls with `arguments={}` ← **BROKEN**
- `docs/agents/unified-agent/flow/market-analysis.md:7` — "Skip here; call per-ticker only on event trigger" ← correctly skipped
- `docs/agents/tools/package/unified-agent.md:177` — shows correct `stock_code: string (req)` usage

**Caller count: 1 affected caller (fb-market-poster daily flow). 0 false positives — other callers correctly use required param or explicitly skip.**

**Impact:** fb-market-poster gets an error response for the `sentiment` call on every cycle; sentiment data is absent from daily Facebook posts. Flow likely proceeds without sentiment (line 132 reads: "Sentiment trend: 7-day slope from `sentiment`") but with degraded output quality.

**Fix:** Change `docs/agents/fb-market-poster/flow/main.md:118` to call per watchlist ticker inside the loop, matching the pattern at `docs/agents/tools/package/unified-agent.md:177`. Or remove the call if aggregate sentiment is not needed. Zone: agent-father.

---

## ACTIVE ISSUES — 7 (2 resolved, 2 new)

### ISSUE-2 — HIGH — UNCHANGED — Warning/Feedback Backlog

`get_system_status`: `open_warnings: 49 high/critical, pending_feedback: 67 new items`
Partially auto-resolves when BUG-1/BUG-3 fixed.

---

### ISSUE-3 — MEDIUM — IMPROVED (not stalling this cycle)

`get_cron_health`: `intelligenceCycleJob: last_status=success, last_run=2026-06-22T04:00:00Z, avg_duration=27700ms`
No stall observed. Keep monitoring — prior cycles showed occasional overrun into next slot.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready

`get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows.
**Fix:** BDI ticker source broken (`^BDI` Yahoo); others likely UPCOM/HNX feed gaps.

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Deltas Null (linked to BUG-3)

`get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`. Auto-resolves with BUG-3.

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh 85.7% / 649s Runtime

`get_cron_health`: `success_rate=0.86 (85.7%), avg_duration=649220ms (10.8min), total_runs=7`.
**Fix:** Per-ticker timeout + error isolation. Consider off-peak schedule.

---

### ISSUE-7 — LOW — UNCHANGED — get_macro_calendar Empty (linked to BUG-3)

`get_macro_calendar({})`: `{"events":[],"status":"unavailable","source_tier":4}`. Auto-resolves with BUG-3.

---

### ISSUE-11 — LOW — UNCHANGED — vnstockFundamentalsRefresh Extremely Slow (845s avg)

`get_cron_health`: `avg_duration=845851ms (14.1 min), total_runs=2`. Risks conflicting with 15-min cycle slot.
**Fix:** Per-ticker 30s timeout + isolation. Off-peak schedule (03:00 UTC).

---

### ISSUE-NEW-1 — LOW — NEW — foreignFlowFetcherJob Error Noise (primary endpoint fails every minute)

**Discovery:** `get_system_status` shows every minute:
```
[fallback] primary endpoint failed — Unable to connect
[fallback] all fallback sources exhausted, returning empty
[foreign-flow-job] fallback activated
[foreign-flow-job] all fallbacks exhausted
```
BUT `get_vps_proxy_health` shows foreign-flow pushing every minute (101–103 items, status=ok), and `get_market_foreign_flow` returns live data (95 tickers, net −3.2k).

**Analysis:** The `foreignFlowFetcherJob` has a *direct HTTP fetch* path that's failing (different from the VPS push pipeline that delivers data separately). The data is available — the error is in a redundant fallback fetcher. Creates noise in `get_system_status` error list (every minute, blocking view of real errors).

**Caller-surface impact:** LOW — foreign flow data is healthy via VPS push. Error noise is the main concern.

**Fix:** Suppress `foreignFlowFetcherJob` error logging when VPS push data was received in the last N minutes, OR disable the redundant direct-fetch path since VPS push is the primary pipeline.

---

### ISSUE-NEW-2 — LOW — NEW — Bidirectional Extreme Macro Alerts (Gold/Oil baseline noise)

**Discovery:** `get_alerts` shows within 24h:
- Gold: `+5.14σ EXTREME HIGH` at 01:00 UTC AND `−5.41σ EXTREME LOW` at 22:30 prior day  
- Oil: `+5.3σ EXTREME HIGH` AND `−3.27σ EXTREME LOW` within hours (same day)

Both assets are moving within plausible ranges (gold ~$4169–$4200, oil ~$79–$82). A 2-day rolling σ window would produce extreme readings from normal volatility. High alert noise risks desensitizing alert-commander and users.

**Fix:** Increase rolling σ window from 2-day to 7-day minimum, OR add cooldown: if a CRITICAL macro alert fired in the last 4h, require a 3σ minimum movement to re-trigger.

---

## NON-ISSUES — Caller-Surface Verified This Cycle

| Item | My Probe Result | Verification | Verdict |
|------|----------------|--------------|---------|
| `get_cycle_bootstrap({})` (no agent_name) | Validation error | Tool requires `agent_name`; all flow files call with explicit name | NON-ISSUE — probe error only |
| `get_technical_indicators({ticker:"FPT"})` | Validation error | Tool requires `code`, not `ticker`; all caller docs use `code` (verified: docs/agents/tools/package/market-watcher.md:176, fb-market-poster/flow/main.md:109) | NON-ISSUE — probe error |
| `get_ticker_intelligence({ticker:"FPT"})` | Validation error | Tool requires `code`; callers use `code` (docs/agents/fb-market-poster/flow/main.md:101) | NON-ISSUE — probe error |
| `get_bctc_refined({ticker:"FPT"})` | Missing `report_id` | Tool requires `report_id`; callers use `report_id` (bctc-analyst/flow/main.md:65, refine_bctc_md/flow/main.md:44) | NON-ISSUE — probe error |
| `get_financial_summary({ticker:"FPT"})` | Missing `actionCode` | Tool requires `actionCode`; callers documented correctly (tools/package/market-analyst.md:154: "NOT code or ticker") | NON-ISSUE — probe error |
| `get_agent_signals({limit:5})` | "agent required" | Tool requires `from_agent` or `agent`; all callers use correct params per flow files | NON-ISSUE — probe error |
| newsapi: disabled | 0 fetches | Intentional by design | NON-ISSUE — by design |
| Macro delta null | `oilUsdDelta:null` | Linked to BUG-3 (TE dead) — upstream cause | NON-ISSUE — symptom of BUG-3 |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 6+ (WORSENING: 7645/120min SLA, 11 QUÁ HẠN) |
| BUG HIGH | 2 | BUG-2 Reuters RSS dead (29×), BUG-3 Trading Economics 2× dead (29×) |
| BUG MEDIUM | 2 | BUG-4 ISM no FRED_API_KEY, **BUG-NEW-1** vn_index_cache missing `code` column (every 5 min) |
| BUG LOW | 1 | **BUG-NEW-2** fb-market-poster calls get_sentiment_trend without stock_code (1 affected caller) |
| ISSUE HIGH | 1 | ISSUE-2 49 warnings / 67 feedback backlog |
| ISSUE MEDIUM | 1 | ISSUE-3 intelligence-cycle occasional stalls (OK this cycle) |
| ISSUE LOW | 5 | ISSUE-4 7 TA tickers dead, ISSUE-5 deltas null, ISSUE-6 vnstock 85.7%, ISSUE-7 macro-cal empty, ISSUE-11 vnstockFundamentals 845s |
| ISSUE LOW NEW | 2 | **ISSUE-NEW-1** foreignFlow primary endpoint noise, **ISSUE-NEW-2** gold/oil bidirectional extreme alerts |
| RESOLVED | 2 | ISSUE-1 SBV crash loop ✅, ISSUE-10 VPS health 4/5 unhealthy ✅ |
| NON-ISSUE | 8 | Probe param errors, by-design, symptom of upstream bugs |

---

## Recommended Actions (priority order)

1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1 CRITICAL, Day 6+. Then `trigger_bctc_vps_fetch`.
2. **Run SQLite migration: `ALTER TABLE vn_index_cache ADD COLUMN code TEXT`** — BUG-NEW-1, silent schema failure every 5 min market hours.
3. **Set `FRED_API_KEY` env var** — BUG-4 free API, unblocks ISM for 3 agent flows.
4. **Disable Reuters RSS source record** — BUG-2, ~15 errors/hour from dead decommissioned source.
5. **Diagnose TE Chromium path in mcp-server container** — BUG-3, unblocks deltas + macro-calendar for 5 flows.
6. **Fix fb-market-poster/flow/main.md:118** — BUG-NEW-2, add `stock_code` to get_sentiment_trend call or move to per-ticker loop.
7. **Suppress foreignFlowFetcherJob error logging** — ISSUE-NEW-1, reduce error noise from redundant fetcher.
8. **Add 7-day σ window or cooldown to macro deviation alerts** — ISSUE-NEW-2.
9. **Per-ticker timeout for vnstockTradingStatsRefresh + vnstockFundamentalsRefresh** — ISSUE-6/11.
