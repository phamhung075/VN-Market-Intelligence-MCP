# Team MCP Tool Health Recheck — 2026-06-16 08:07 UTC

**Run by:** health-recheck agent (scheduled)
**Gateway:** `claude.ai gateway → vn-market`
**Probe window:** 2026-06-16 08:03–08:07 UTC (VN market OPEN — 02:00–08:59 UTC)
**Prior report:** `team-tool-recheck-2026-06-16-0611.md` (1h 56min delta)
**Method:** Read-only smoke calls per tool + caller-surface verification per STEP 3b/3c. No live-state mutations.

---

## Gateway Reachability

| Check | Result |
|---|---|
| Gateway transport | **REACHABLE** — `mcp__gateway__call_tool` schema loaded |
| vn-market server | **UP** — uptime ~1h 1m at probe start (restarted 07:01:54 UTC); `mcpServerStartup total_runs=36` |
| VN trading window | **OPEN** (02:00–08:59 UTC) |

---

## STEP 3c — Prior-Report Delta (all re-probed this cycle)

| Prior ID | Finding | Re-probe evidence this cycle | Delta |
|---|---|---|---|
| BUG-1 | `vnstockTradingStatsRefresh` crash 50% | `get_cron_health`: `last_status=crashed`, `success_rate=0.50`, `total_runs=2`, `avg_duration=2,754,485ms` — identical; no new run | **ONGOING, UNCHANGED** |
| BUG-2 | BCTC VPS push dead | `get_vps_proxy_health`: bctc `STALE, last push 2026-06-13 23:45:12, 0 pushes/24h`; `get_sla_status`: bctc **732min/120min CRITICAL** (was 614/120 at 06:11 — +118min in 1h56m) | **ONGOING, WORSENED** (>60h dead, +118min) |
| BUG-3 | `post_agent_signal` schema drift | `post_agent_signal({type:"test_probe"})` → MCP -32602 Required: `from_agent`, `to_agent`, `signal_type`, `payload` — re-confirmed this cycle | **ONGOING, UNCHANGED** |
| BUG-NEW-3 | `bctcReparseJob` at alert threshold | `get_cron_health`: `success_rate=0.81 (80.7%)`, `total_runs=176`, `last_run=2026-06-16 07:02:24 success` — +1 run, rate stable | **ONGOING, UNCHANGED** |
| BUG-NEW-4 | `get_foreign_flow` no-args fail | `call_tool("get_foreign_flow", {})` → MCP -32602 Required: `code (string)` — re-confirmed; fb-market-poster flow L78 unchanged | **ONGOING, UNCHANGED** |
| BUG-NEW-5 | `get_ticker_intelligence` no-args fail | `call_tool("get_ticker_intelligence", {})` → MCP -32602 Required: `code (string)` — re-confirmed; fb-market-poster flow L81 unchanged | **ONGOING, UNCHANGED** |
| BUG-NEW-6 | TA alert contamination at market open | `get_cycle_bootstrap` open alerts: VRE `ta_bb_breakout_down "giá 0"` + `ta_oversold RSI=9.8` still in DB since 02:15 UTC; `get_pipeline_health`: `DAG RSI=0.0 signal=oversold` (physically impossible); `get_technical_indicators(HPG)` RSI=42.6 — normal tickers unaffected | **ONGOING, UNCHANGED** (false alerts persist in DB; DAG contamination confirmed) |
| ISSUE-1 | Server restart rate | `get_cron_health`: `mcpServerStartup total_runs=36` (was 35 at 06:11 — +1 in 1h56m); last restart 07:01:54 UTC | **WORSENED** (+1 in 1h56m; 36/7d = 5.1/day) |
| ISSUE-2 | WTI crude inverted vs Brent | `get_system_status`: `wti_crude_usd=95.5`, `brent_crude_usd=82.07` — $13.43 inversion (was $12.75 at 06:11; Brent drifted -0.82%) | **ONGOING, UNCHANGED** |
| ISSUE-3 | Reuters RSS + Trading Economics never succeed | `get_system_status`: Reuters RSS **11 failures/never**; TE ×2 **11 failures/never** | **ONGOING, UNCHANGED** |
| ISSUE-6 | `foreign-flow-job` internal fallback exhaustion | `get_system_status` 08:01–08:03: `[foreign-flow-job] fallback activated` + `all fallbacks exhausted` × 2 consecutive minutes; `get_sla_status`: **foreign_flow 353min/10min CRITICAL** (was 235/10min at 06:11 — +118min in 1h56m); VPS push pipeline healthy (102 items/min) | **ONGOING, WORSENED** (+118min SLA breach) |
| ISSUE-7 | `get_ism_subcomponents` FRED_API_KEY not configured | Not re-probed this cycle — assumed unchanged (no deploy since 06:11) | **ASSUMED UNCHANGED** |
| ISSUE-8 | `get_sector_rotation` 5d N/A | Not re-probed this cycle — assumed unchanged | **ASSUMED UNCHANGED** |
| ISSUE-9 | BDI data 70+ days stale | Not re-probed this cycle — assumed unchanged (BDI source not on any refresh job) | **ASSUMED UNCHANGED** |
| IMPROVE-1..7 | All 7 improvements | No deploy since 06:11 — all assumed unchanged | **ASSUMED UNCHANGED** |

---

## STEP 3c — Resolved Findings

None new this cycle. ISSUE-4 and ISSUE-5 remain resolved (confirmed via VPS proxy health + system status showing no zero_ohlc errors).

---

## NEW Findings This Cycle

### ISSUE-10 (NEW) — `signal_quality_audit` SLA breach: 15,077min/2,880min (10.5 days stale)

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_agent_signals(agent="alert-commander", hours_back=1)`: signal [6284] from `freshness-sla-monitor`: `SLA BREACH: signal_quality_audit source stale — Data age: 15077 minutes (threshold: 2880 min)` |
| Computed age | 15,077 min = 251.3h = 10.47 days; last quality audit ran ~2026-06-05 (10.5 days ago) |
| SLA threshold | 2,880 min = 48h |
| Cron | `monthlySignalQualityAudit` schedule: `0 0 1 * *` (monthly 1st) — June 1 was the expected run; gap vs signal age suggests missed run or different cron identity |
| Caller-surface | `get_sla_status` does NOT surface this metric (only tracks price/bctc/news/sbv_fx/foreign_flow) — the breach is only visible via agent signals bus |
| Impact | Signal quality scoring likely stale; `get_signal_effectiveness` / `get_label_accuracy_report` may return outdated accuracy stats used by alert-commander for threshold calibration |
| Fix | Investigate why `monthlySignalQualityAudit` (or whichever job writes `signal_quality_audit`) has not run since ~June 5; add `signal_quality_audit` to `get_sla_status` metric set for direct visibility |

---

### ISSUE-11 (NEW) — `DAG` RSI=0.0 in pipeline health: zero-OHLCV contamination persists

| Field | Value |
|---|---|
| Class | **ISSUE** |
| Evidence | `get_pipeline_health`: `DAG: rows=26 | TA ready | signal=oversold | RSI14=0.0` — RSI of 0.0 is physically impossible for a traded stock |
| Cross-check | `get_cycle_bootstrap` OPEN ALERTS shows `[WARNING] 2026-06-16 06:15 DAG (ta_bb_breakout_down) DAG: giá 0 dưới BB dưới 720 — bứt phá giảm` — price=0 BB breakout alert persists |
| Root cause | Same mechanism as BUG-NEW-6: zero-OHLCV rows were processed by TA scanner, producing RSI=0.0 + BB price=0 alert; the false TA scan result is now stored in `pipeline_health` table |
| Affected ticker | DAG (26 OHLCV rows, HNX market — off-hours price fetches may inject 0-volume rows) |
| Impact | `taAlertScanJob` emitted false DAG oversold signal which is now in OPEN ALERTS visible to all cowork agents; alert-commander may route it to MARKET channel |
| Fix | Part of BUG-NEW-6 fix: add price > 0 guard to TA scan before computing RSI/BB; retroactively delete zero-price TA alerts from DB |

---

## ACTIVE FINDINGS (re-confirmed this cycle unless noted ASSUMED)

### BUG-1 (ONGOING) — `vnstockTradingStatsRefresh` crashed: 50% success, 45.9-min avg runtime

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `last_status=crashed`, `success_rate=0.50`, `total_runs=2`, `avg_duration=2,754,485ms` |
| Last run | 2026-06-15 08:30:01 UTC (crashed). Next fire Mon 08:30 UTC |
| Downstream | `vnstock_trading_stats` table stale; `get_sector_comparison`, `get_market_cap`, `get_company_profile` degraded |
| Fix | Add `AbortSignal.timeout(60_000)` per-ticker + job-level 600s hard cap; investigate which ticker causes crash |

---

### BUG-2 (ONGOING, WORSENED) — BCTC VPS push dead: 732/120min SLA CRITICAL (>60h since last push)

| Field | Value |
|---|---|
| VPS evidence | `get_vps_proxy_health`: `bctc | 2026-06-13 23:45:12 | 0 pushes/24h | STALE YES` |
| SLA | `get_sla_status`: `bctc 732min / 120min → CRITICAL BREACHED` (+118min vs 06:11 cycle) |
| Earnings impact | `get_earnings_calendar`: 13 tickers QUÁ HẠN with no BCTC data since 2026-06-13 |
| Caller-surface | bctc-analyst every cycle; refine_bctc_md; bctcQueueEnricherJob |
| Fix | Run `trigger_bctc_vps_fetch`; SSH-probe VPS `curl /proxy/bctc-discover/<ticker>` — likely scraper format change or geo-block on cafef.vn BCTC PDF links |

---

### BUG-3 (ONGOING) — `post_agent_signal` schema drift: system-auditor 3 emit sites broken

| Field | Value |
|---|---|
| Live schema | Required: `from_agent (string)`, `to_agent (string)`, `signal_type (enum: urgent_news|price_anomaly|...)`, `payload (object)` |
| Re-probe proof | `post_agent_signal({type:"test_probe"})` → MCP -32602 Required: from_agent, to_agent, signal_type, payload — confirmed this cycle |
| Flow mismatch | `docs/agents/system-auditor/flow/main.md` L193 (`type:"data_stale"`), L482 (`type:"db_integrity_breach"`), L509 (`type:"system_health_report"`) — wrong schema |
| Impact | All infrastructure anomaly signals from system-auditor fail silently; signal_queue never populated by infra events |
| Fix | Rewrite 3 emit blocks: `{from_agent:"system-auditor", to_agent:"po", signal_type:"chain_catalyst", payload:{title:"...", detail:"..."}}` |

---

### BUG-NEW-3 (ONGOING) — `bctcReparseJob` at alert threshold: 80.7%

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `success_rate=0.81 (80.7%)`, `total_runs=176`, `last_run=2026-06-16 07:02:24 success` |
| Note | One more failure would drop below 80% → `cronHealthAlertJob` fires BUG Telegram |

---

### BUG-NEW-4 (ONGOING) — `get_foreign_flow` no-args: fb-market-poster L78 fails every cycle

| Field | Value |
|---|---|
| Re-probe proof | `call_tool("get_foreign_flow", {})` → MCP -32602 Required: `code (string)` — confirmed this cycle |
| Caller | `docs/agents/fb-market-poster/flow/main.md:78` → `arguments={}` — **1 confirmed broken caller** |
| Note | Tool list doc (`get_foreign_flow.md`) says param `ticker`; live schema says `code`; package doc says no params required — 3-way mismatch |
| Fix | Replace L78 with `get_market_foreign_flow(arguments={})` (no required args, returns market-wide net flow) |

---

### BUG-NEW-5 (ONGOING) — `get_ticker_intelligence` no-args: fb-market-poster L81 fails every cycle

| Field | Value |
|---|---|
| Re-probe proof | `call_tool("get_ticker_intelligence", {})` → MCP -32602 Required: `code (string)` — confirmed this cycle |
| Caller | `docs/agents/fb-market-poster/flow/main.md:81` → `arguments={}` — **1 confirmed broken caller** |
| Fix | Replace L81 with `get_market_snapshot(arguments={})` for market-wide movers, or per-ticker loop |

---

### BUG-NEW-6 (ONGOING) — TA alert contamination at market open + DAG RSI=0.0

| Field | Value |
|---|---|
| Evidence | Open alerts (02:15 UTC): VRE `ta_bb_breakout_down "giá 0"` + `ta_oversold RSI=9.8` still DB-live; `get_pipeline_health` DAG `RSI14=0.0 signal=oversold`; BB alert `DAG: giá 0 dưới BB dưới 720` in open alerts |
| Cross-check | `get_technical_indicators(HPG)` at 08:05 UTC: RSI=42.6, MA5=23,730 — normal; confirms 02:15 values were zero-OHLCV artifacts |
| Scope | 2+ tickers with false alerts in DB (VRE, DAG); potentially more from 02:15 UTC batch |
| Impact | 6+ cowork agents reading `get_cycle_bootstrap` see false WARNING alerts; alert-commander may route to MARKET channel |
| Fix | Add `price > 0` guard in `alertScanParallelJob` before RSI/BB compute; add 5-min market-open grace period (skip scan 02:00–02:05 UTC); retroactively delete alerts where `price_trigger=0` |

---

## Issues (degraded, not broken)

### ISSUE-1 (WORSENED) — Server restart rate: 36 in 7 days (5.1/day)

| Field | Value |
|---|---|
| Evidence | `get_cron_health`: `mcpServerStartup total_runs=36` (was 35 at 06:11 — +1 restart in 1h56m) |
| Note | Each restart resets circuit-breaker failure counters; foreign-flow/Reuters failure counts reset to 0 per session, masking true cumulative rate |

---

### ISSUE-2 (ONGOING) — WTI crude price stale: $95.5 vs live Brent $82.07 — $13.43 inversion

| Field | Value |
|---|---|
| Evidence | `get_system_status`: `wti_crude_usd=95.5 (79 data points)`, `brent_crude_usd=82.07` |
| Impact | WTI series stale/wrong; macro agents may see $95.5 WTI as anomalously elevated; real spread is Brent-WTI ~$3–5 (not $13) |

---

### ISSUE-3 (ONGOING) — Reuters RSS + Trading Economics: 11+ consecutive failures, never succeeded

| Field | Value |
|---|---|
| Evidence | `get_system_status`: Reuters RSS `Ngưng | Chưa bao giờ | 11 ⚠`; Trading Economics ×2 `Ngưng | Chưa bao giờ | 11 ⚠` |
| Rate | ~11 failures/hour per source since at least 2026-06-13; counter resets per server restart but source always immediately fails |
| Impact | Missing international news feed; missing TE macro indicators (CPI/GDP forecasts, commodity curves) |

---

### ISSUE-6 (WORSENED) — `foreign-flow-job` internal fallback exhaustion + SLA CRITICAL

| Field | Value |
|---|---|
| Evidence | `get_system_status` 08:01–08:03: `[foreign-flow-job] fallback activated` + `all fallbacks exhausted` × 2 min |
| SLA breach | `get_sla_status`: `foreign_flow 353min / 10min CRITICAL` (+118min since 06:11 cycle) |
| Disambiguation | VPS push pipeline healthy (102 items/min active per `get_vps_proxy_health`); per-ticker `get_foreign_flow(code=HPG)` returns data from DB; the SLA measures the internal direct-poll path, not DB data age |
| Fix | Retire the internal `foreign-flow-job` direct poll; rely exclusively on VPS push pipeline; remap `get_sla_status` foreign_flow metric to measure DB row age |

---

### ISSUE-7 (ONGOING, ASSUMED) — `get_ism_subcomponents` silent data gap: FRED_API_KEY not configured

| Field | Value |
|---|---|
| Prior evidence | `get_ism_subcomponents({})` → `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows..."}` |
| Caller-surface | news-scout, bctc-analyst, unified-agent package docs — 3 affected agents |

---

### ISSUE-8 (ONGOING, ASSUMED) — `get_sector_rotation` 5d trend: N/A for all 16 sectors

| Field | Value |
|---|---|
| Prior evidence | All 16 sectors show `"N/A / 5d"`; only 1-day data available |
| Caller-surface | market-watcher cycle Step 2 |

---

### ISSUE-9 (ONGOING, ASSUMED) — BDI data 70+ days stale

| Field | Value |
|---|---|
| Prior evidence | `get_supply_chain_exposure({})` → `"BDI: 1,400 (+0.0%) - 2026-04-07"` |
| Caller-surface | market-watcher cycle Step 2 |

---

### ISSUE-10 (NEW) — `signal_quality_audit` SLA breach: 15,077min/2,880min (10.5 days stale)

See NEW Findings section above.

---

### ISSUE-11 (NEW) — `DAG` RSI=0.0 in pipeline health (zero-OHLCV TA contamination)

See NEW Findings section above (related to BUG-NEW-6).

---

## Improvements (non-blocking, assumed unchanged from 06:11)

| ID | Finding | Fix |
|---|---|---|
| IMPROVE-1 | `get_cycle_bootstrap` enum has dead values: `financial-analyst`, `report-analyzer` (0 callers) | Remove from Zod enum |
| IMPROVE-2 | 5 watchlist tickers with 0 OHLCV rows: BDI/DLC/JSH/SIS/VDC (`get_pipeline_health` confirmed) | Trigger OHLCV backfill or remove from watchlist |
| IMPROVE-3 | `macroIndicatorRefreshJob` schedule doc drift: system-map says `"19:13 UTC"`, cron last run 12:13 UTC | Fix system-map schedule field |
| IMPROVE-4 | `get_sla_status` BCTC threshold 120min vs system-map 168h (out-of-window default) | Align SLA threshold to system-map |
| IMPROVE-5 | Tool docs `get_foreign_flow.md` says param `ticker`; live API says `code`; package doc says no params — 3-way mismatch | Fix param in tool list doc + package doc |
| IMPROVE-6 | VEA (`active=false` in system-map) still processed by bctcQueueEnricher → WARN every cycle | Add `active=false` filter to enricher query |
| IMPROVE-7 | Off-hours HNX/UPCOM price fetch generates ERROR log entries per 15-min cycle | Add market-hours gate or downgrade to DEBUG |

---

## Full Tool Probe Summary (this cycle)

| Tool | Status | Notes |
|---|---|---|
| `get_system_status` | ✅ OK (issues logged) | CBs all 0; foreign-flow-job fallback 2/min; Reuters/TE 11 failures/never |
| `get_cycle_bootstrap` | ✅ OK (stale alerts) | agent_name= required; false TA alerts (VRE price=0) still in OPEN ALERTS |
| `get_market_snapshot` | ✅ OK | VN-Index 1807.94, source_tier=2 |
| `get_macro_snapshot` | ✅ OK | NEUTRAL carry, CHEAP yield (spread 2.05pp), source_tier=1–2 |
| `get_price_history` | ✅ OK | VNM 7-day history returned correctly |
| `get_technical_indicators` | ✅ OK | HPG RSI=42.6, MA5/MA20 present |
| `get_foreign_flow` (no args) | ❌ BROKEN | MCP -32602 Required: `code` — BUG-NEW-4 |
| `get_foreign_flow` (with code) | ✅ OK | HPG data returned; VPS push healthy |
| `get_market_foreign_flow` | ✅ OK | Market-wide net buy +46.8k; 102 tickers |
| `get_ticker_intelligence` (no args) | ❌ BROKEN | MCP -32602 Required: `code` — BUG-NEW-5 |
| `get_earnings_calendar` | ✅ OK | 28 ĐÃ NỘP, 13 QUÁ HẠN |
| `get_cron_health` | ✅ OK (2 bugs) | `vnstockTradingStatsRefresh` crashed 50%; `bctcReparseJob` 80.7% |
| `get_vps_proxy_health` | ✅ OK (BCTC stale) | prices/news/sbv/foreign-flow active; bctc STALE since 2026-06-13 |
| `get_sla_status` | ❌ CRITICAL ×2 | bctc 732/120min; foreign_flow 353/10min |
| `get_agent_signals` | ✅ OK (agent= required) | Returns correctly with `agent` param; 3 SLA breach signals in bus |
| `get_open_chain_findings` | ✅ OK | 0 findings in last 30min |
| `get_pipeline_health` | ✅ OK (DAG anomaly) | 5 dark tickers confirmed; DAG RSI=0.0 (zero-OHLCV) |
| `get_vn_liquidity_state` | ⚠️ DEGRADED | OMO parse failing (null); SJC crawler absent; interbank 1w unreachable |
| `task_claim` / `task_release` | ✅ OK | Claimed and released probe lock |
| `post_agent_signal` | ❌ wrong schema | MCP -32602 Required: from_agent, to_agent, signal_type, payload — BUG-3 |

---

## Active Finding Tally

| Class | Count | Items |
|---|---|---|
| **BUG** | **7** | BUG-1 `vnstockTradingStatsRefresh` crash; BUG-2 BCTC VPS dead >60h SLA 732/120min CRITICAL; BUG-3 `post_agent_signal` schema drift (3 system-auditor sites); BUG-NEW-3 `bctcReparseJob` 80.7%; BUG-NEW-4 `get_foreign_flow` no-args (fb-market-poster L78); BUG-NEW-5 `get_ticker_intelligence` no-args (fb-market-poster L81); BUG-NEW-6 TA alert contamination at open (price=0 false RSI/BB, DAG+VRE affected, 6+ agents reading false alerts) |
| **ISSUE** | **9** | ISSUE-1 server restarts 36/7d (5.1/day); ISSUE-2 WTI crude inverted $13.43; ISSUE-3 Reuters/TE persistent failures; ISSUE-6 foreign-flow-job internal exhaustion SLA 353/10min CRITICAL; ISSUE-7 `get_ism_subcomponents` no data (3 agents); ISSUE-8 `get_sector_rotation` 5d N/A; ISSUE-9 BDI 70+ days stale; **ISSUE-10 signal_quality_audit 15,077/2,880min (10.5 days stale)**; **ISSUE-11 DAG RSI=0.0 false pipeline signal** |
| **IMPROVE** | **7** | IMPROVE-1..7 (see table above) |
| **RESOLVED** | **2** | ISSUE-4 pushPrices zero_ohlc market-open edge case; ISSUE-5 VPS health endpoint false unhealthy |

---

## Caller-Surface Verification (STEP 3b — this cycle)

```
# BUG-NEW-4 get_foreign_flow (re-probed):
call_tool("get_foreign_flow", {}) → MCP -32602 Required: code — CONFIRMED
grep docs/agents → fb-market-poster/flow/main.md:78 still uses arguments={} → 1 broken caller

# BUG-NEW-5 get_ticker_intelligence (re-probed):
call_tool("get_ticker_intelligence", {}) → MCP -32602 Required: code — CONFIRMED
fb-market-poster/flow/main.md:81 still uses arguments={} → 1 broken caller

# BUG-3 post_agent_signal (re-probed):
call_tool("post_agent_signal", {type:"test_probe"}) → MCP -32602 Required: from_agent, to_agent, signal_type, payload — CONFIRMED
system-auditor flow L193/L482/L509 not fixed (no deploy since 06:11)

# BUG-2 BCTC (re-probed):
get_vps_proxy_health → bctc STALE: 2026-06-13 23:45:12, 0 pushes/24h — CONFIRMED
get_sla_status → bctc 732/120 CRITICAL WORSENED

# BUG-1 vnstockTradingStatsRefresh (re-probed):
get_cron_health → last_status=crashed, 50%, total_runs=2, avg_duration=2,754,485ms — CONFIRMED UNCHANGED

# ISSUE-6 foreign-flow-job (re-probed):
get_system_status → [foreign-flow-job] all fallbacks exhausted at 08:01–08:03 — ONGOING
get_sla_status → foreign_flow 353/10min CRITICAL — WORSENED

# ISSUE-10 signal_quality_audit (new):
get_agent_signals(agent="alert-commander") → [6284] freshness-sla-monitor: "signal_quality_audit stale 15077min (threshold: 2880)" — NEW
get_sla_status → NOT in SLA table (blind spot) — NEW visibility gap

# BUG-NEW-6 + ISSUE-11 TA contamination (re-confirmed):
get_pipeline_health → DAG RSI14=0.0, signal=oversold — physically impossible → CONFIRMED
get_cycle_bootstrap open alerts → DAG "giá 0 dưới BB dưới 720" at 06:15 UTC; VRE "giá 0" at 02:15 UTC — still in DB CONFIRMED
get_technical_indicators(HPG) → RSI=42.6 normal → confirms 0.0 is contamination artifact
```
