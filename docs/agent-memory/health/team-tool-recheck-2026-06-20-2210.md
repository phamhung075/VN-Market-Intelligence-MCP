# Team MCP Tool Recheck — 2026-06-20T22:10Z

**Run timestamp:** 2026-06-20T22:10Z  
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-20-2010.md`  
**Market status:** CLOSED (Saturday)  
**Cron cadence:** Every 2h — this is cycle 6 of the day

---

## Step 3c — Prior Finding Re-Probes

All findings from the 20:10Z report re-probed this cycle before carry-forward.

| Finding | Prior Status | Re-Probe Result | Evidence |
|---------|-------------|-----------------|---------|
| BUG-1: BCTC VPS dead | ACTIVE | **RE-CONFIRMED** | `vn-bctc-fetch: unhealthy, response_ms:0`; SLA breach 5843/2255 min CRITICAL; 0 pushes 24h; last push 2026-06-16 18:02:24 |
| BUG-2: HNX/UPCOM failures | ACTIVE | **RE-CONFIRMED** | 10/10 recent errors `[hnx] all HNX price sources failed` + `all UPCOM price sources failed` at 22:01–22:03Z |
| BUG-3: Reuters RSS dead | ACTIVE | **RE-CONFIRMED** | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 19 ⚠` (19 consecutive failures, never fetched) |
| BUG-4: TradingEconomics dead | ACTIVE | **RE-CONFIRMED** | 2× `Trading Economics \| Ngưng \| Chưa bao giờ \| 19 ⚠`; phantom values `wti_crude_usd:95.5`, `dow_jones:23750` still in DB |
| BUG-5: get_sentiment_trend requires stock_code | ACTIVE | **RE-CONFIRMED** | `get_sentiment_trend({})` → `{"error":"Error: stock_code (or symbol) is required", "source_tier":3}` |
| BUG-6 (NEW 20:10Z): get_agent_signals from_agent=null broken | NEW | **RESOLVED** | `get_agent_signals({"from_agent":null,"status":"all","hours_back":0.25})` returned 6 signals. Null key present → all-producers mode works. Prior failure was calling without the key entirely. |
| ISSUE-SBV-PARSE: sbvRatesRefreshJob crashed | ACTIVE | **RE-CONFIRMED** | `sbvRatesRefreshJob: last_status: crashed` at 20:00:29Z; policy_rates now using `"sbv_rates DB fallback (HTML parse failed)"`; `lombard_rate_pct: 0` (suspicious zero) |
| ISSUE-VNSTOCK-STATS: 85.7% success rate | ACTIVE | **RE-CONFIRMED** | `vnstockTradingStatsRefresh: success_rate: 0.86 (85.7%)` — unchanged from 20:10Z report |
| ISSUE-MACRO-CAL: get_macro_calendar unavailable | ACTIVE | **RE-CONFIRMED** | `{"status":"unavailable","events":[],"is_estimate":true,"daysRequested":60}` — all event windows empty |
| ISSUE-ISM: get_ism_subcomponents no data | ACTIVE | **RE-CONFIRMED** | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| ISSUE-LIQUIDITY: get_vn_liquidity_state null fields | ACTIVE | **RE-CONFIRMED** | `sjc_price_mn_vnd:0`, `usd_vnd_buy:0`, `usd_vnd_sell:0`, `omo.net_outstanding_bn_vnd:null`, `interbank_1w.rate_1w_pct:null` ("dttktt.sbv.gov.vn unreachable from VPS — 100% packet loss") |

**Net change vs 20:10Z:** BUG-6 RESOLVED (1 fewer active bug). All other findings carry forward unchanged.

---

## Active BUGs — 5

### BUG-1 — BCTC VPS Dead (CRITICAL — 100+ hours)

**Severity:** CRITICAL  
**Duration:** Since 2026-06-16 18:02:24 UTC (~100+ hours of gap)

| Check | Result |
|-------|--------|
| `get_vps_service_health` | `vn-bctc-fetch: unhealthy \| response_ms:0 \| uptime:4d 3h 57m` |
| `get_vps_proxy_health` | `bctc: last_push: 2026-06-16 18:02:24 \| STALE: YES \| 0 pushes 24h` |
| `get_sla_status` | `bctc: 5843/2255 min \| breached: CRITICAL` |

**Affected callers:** bctc-analyst (primary consumer), refine_bctc_md (PDF pipeline), system-auditor (SLA monitor)  
**Impact:** No BCTC financial data ingestion for 4+ days. All earnings analysis stale.

---

### BUG-2 — HNX / UPCOM Price Source Failures (Persistent)

**Severity:** HIGH  
**Pattern:** 10/10 recent errors from `[hnx]` source class

| Error | Timestamp |
|-------|-----------|
| `[hnx] all HNX price sources failed` | 22:01–22:03Z (×5) |
| `[hnx] all UPCOM price sources failed` | 22:01–22:03Z (×5) |

**Affected callers:** market-watcher, alert-commander, stock-price service (HNX/UPCOM listed stocks)  
**Note:** Market is closed Saturday — fetcher still attempts and fails on every cron tick.

---

### BUG-3 — Reuters RSS Dead (Never Fetched)

**Severity:** HIGH  
**Evidence:** `Reuters RSS \| Ngưng \| Chưa bao giờ \| 19 ⚠`

Reuters RSS has never successfully fetched. 19 consecutive failures. Anti-bot / geo-block likely.  
**Affected callers:** news-scout (`fetch_and_analyze` news sources), market intelligence pipeline

---

### BUG-4 — TradingEconomics Dead + Phantom Stale Values (HIGH RISK)

**Severity:** HIGH  
**Evidence:** 2× `Trading Economics \| Ngưng \| Chưa bao giờ \| 19 ⚠`

Compounded risk: dead source but stale values remain in DB and are returned as live data:
- `wti_crude_usd: 95.5` (79 data points — stale phantom)
- `dow_jones: 23750` (49 data points — stale phantom)
- `get_macro_snapshot`: `oilUsdDelta: null, goldUsdDelta: null, usdVndDelta: null`

**Affected callers:** bctc-analyst (macro context), news-scout (macro regime), market-watcher (macro overlay), unified-agent (macro narrative)  
**Risk:** Agents consuming macro data may act on phantom stale values with no freshness warning.

---

### BUG-5 — get_sentiment_trend Requires Undocumented stock_code

**Severity:** MEDIUM  
**Evidence:** `get_sentiment_trend({})` → `{"error":"Error: stock_code (or symbol) is required","source_tier":3}`

Tool is documented as accepting no required parameters in some references, but live tool throws on bare call.  
**Affected callers:** Any agent calling `get_sentiment_trend` without a ticker. Verify against callers in `docs/agents/*/flow/`.

---

## Active ISSUEs — 5

### ISSUE-SBV-PARSE — SBV HTML Parse Failing (Intermittent)

| Field | Value |
|-------|-------|
| Job | `sbvRatesRefreshJob` |
| `last_status` | `crashed` |
| `last_run` | 2026-06-20T20:00:29Z |
| `policy_rates.source` | `"sbv_rates DB fallback (HTML parse failed)"` |
| `lombard_rate_pct` | `0` (suspicious zero — expect ~4.5%) |
| VPS push | Still arriving (last push 22:02Z) — VPS path healthy |

Job crashes on HTML parse; falls to DB fallback. Data eventually stale if HTML stays broken.

---

### ISSUE-VNSTOCK-STATS — 85.7% Success Rate

`vnstockTradingStatsRefresh: success_rate: 0.86` — 14.3% failure rate. Intermittent VNstock API failures. Not critical but indicates circuit instability.

---

### ISSUE-MACRO-CAL — get_macro_calendar Unavailable

`get_macro_calendar({"days_ahead":14})` returns `{"status":"unavailable","events":[],"is_estimate":true,"daysRequested":60}`. Note: `daysRequested:60` ignores the input param — schema may not pass through `days_ahead`. Calendar data has never been populated. Affects macro event scheduling in digest-predict and unified-agent.

---

### ISSUE-ISM — ISM Sub-components Missing (No FRED_API_KEY)

`get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`. FRED API key not configured — ISM PMI sub-components (new orders, employment, prices paid) unavailable. Affects macro regime classification in news-scout and bctc-analyst.

---

### ISSUE-LIQUIDITY — get_vn_liquidity_state Multiple Null/Estimate Fields

Multiple sub-components blocked or estimated:

| Sub-component | Status | Reason |
|---------------|--------|--------|
| `sjc_gold_gap.sjc_price_mn_vnd` | `0` (estimate) | No SJC crawler row in DB |
| `fx_coupling.usd_vnd_buy/sell` | `0` (estimate) | Buy/sell rates absent |
| `omo.net_outstanding_bn_vnd` | `null` (estimate) | HTML parse: no add/absorb rows |
| `interbank_1w.rate_1w_pct` | `null` (estimate) | `dttktt.sbv.gov.vn` unreachable from VPS (100% packet loss) |
| `irs` | `is_estimate:true` | HNX OTC IRS "not machine-readable (DD-6, permanent)" |

Only `fx_coupling.usd_vnd_center` and `dxy` are non-estimate.

---

## Resolved This Cycle — 1

| Finding | Was | Now | Proof |
|---------|-----|-----|-------|
| BUG-6: get_agent_signals from_agent=null broken | NEW BUG (20:10Z) | **RESOLVED** | `get_agent_signals({"from_agent":null,"status":"all","hours_back":0.25})` returned 6 signals at 22:10Z. JSON key present with null value → all-producers mode works correctly. |

---

## IMPROVEs — 6 (Unchanged)

| ID | Finding | Recommendation |
|----|---------|----------------|
| IMP-1 | `get_cycle_bootstrap` enum includes legacy `financial-analyst` + `report-analyzer` (merged into `bctc-analyst` 2026-05-29) | Remove stale enum values; update tool doc |
| IMP-2 | SBV HTML parse fragility (OMO + policy rates both fall back to DB when HTML changes) | Add structured API fallback or HTML parse monitoring alert |
| IMP-3 | `get_macro_calendar` returns `unavailable` with no ETA/reason | Document when calendar data becomes available; add `blocked_reason` field |
| IMP-4 | `get_vn_liquidity_state` IRS flag `"permanent"` but no callers informed | Add IRS as known-permanent-gap to system-map.json DD notes |
| IMP-5 | Phantom stale macro values (wti_crude:95.5, dow:23750) returned without freshness warning | Add `stale_since` or `is_estimate:true` flag when TradingEconomics source dead |
| IMP-6 | `dttktt.sbv.gov.vn` 100% packet loss from VPS — interbank 1w permanently null | Investigate alternative source for 1-week interbank rate |

---

## Tools Verified Healthy This Cycle

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ Healthy | Returns agent_signals + market_context + system_status |
| `get_system_status` | ✅ Healthy | Full source table returned |
| `get_market_context` | ✅ Healthy | `trading_window: closed` (Saturday expected) |
| `get_market_snapshot` | ✅ Healthy | Prices labeled [STALE] — expected weekend |
| `get_watchlist` | ✅ Healthy | 41 tickers returned |
| `get_alerts` | ✅ Healthy | Alert tables returned |
| `get_agent_signals` | ✅ Healthy | Inbox + all-producers modes both working |
| `get_cron_health` | ✅ Healthy | 70+ crons tracked |
| `get_pipeline_health` | ✅ Healthy | Pipeline status returned |
| `get_vps_proxy_health` | ✅ Healthy | Per-source push timing visible |
| `get_vps_service_health` | ✅ Healthy | Per-container health visible |
| `get_sla_status` | ✅ Healthy | Breach thresholds tracked |
| `get_rate_limit_status` | ✅ Healthy | 11 sources, all ready/uncontacted |
| `get_earnings_calendar` | ✅ Healthy | Filing deadlines returned |
| `get_recent_signals` | ✅ Healthy | Signal history returned |
| `get_recent_fixes` | ✅ Healthy | Fix history returned |
| `get_macro_snapshot` | ✅ Reachable | Partial data (TradingEconomics dead — see BUG-4) |
| `get_vn_liquidity_state` | ✅ Reachable | Multiple null sub-fields (see ISSUE-LIQUIDITY) |
| `task_claim/release/list_held` | ✅ Healthy | No orphaned locks |
| `post_agent_signal` | ✅ Schema valid | Not called live (write-tool) |
| `send_telegram` | ✅ Schema valid | Not called live (write-tool, reserved for cycle end) |

---

## Priority Action Queue

1. **[CRITICAL] BUG-1** — Restore BCTC VPS service immediately. `vn-bctc-fetch` container has been dead 100+ hours. SSH to Vinahost VPS, `docker ps`, restart container, verify pushes resume. Dispatch: `dev-vps-crawls` agent.

2. **[HIGH] BUG-4** — Fix TradingEconomics crawler + add stale-value guard. 19 consecutive failures + phantom values mislead downstream agents. Dispatch: `dev-mainserver-crawls` agent + `dev-mcp-server` for staleness guard.

3. **[HIGH] BUG-3** — Fix Reuters RSS (19 failures, never fetched). Likely geo-block / anti-bot. Consider VPS proxy routing or alternative feed. Dispatch: `dev-mainserver-crawls` + `dev-vps-crawls` agents.

4. **[HIGH] BUG-2** — Investigate HNX/UPCOM price source failures. All fetches fail. May be VPS routing or source API change. Dispatch: `dev-vps-crawls` + `dev-stock-price` agents.

5. **[MEDIUM] ISSUE-ISM** — Configure `FRED_API_KEY` in environment. ISM PMI sub-components are a macro regime signal used by 3 agents. Dispatch: `ops` or `pm` for credential configuration.

6. **[MEDIUM] BUG-5** — Fix `get_sentiment_trend` to accept no-arg call OR document required `stock_code` in tool package docs. Dispatch: `dev-mcp-server` agent.

7. **[MEDIUM] ISSUE-SBV-PARSE** — Fix SBV HTML parse for OMO and policy rates. `lombard_rate_pct:0` is a data integrity risk. Dispatch: `dev-vps-crawls` agent.

---

*Generated by health-recheck routine at 2026-06-20T22:10Z*
