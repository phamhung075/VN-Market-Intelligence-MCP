# Team MCP Tool Health Recheck — 2026-06-21T20:07Z

**Cycle:** 2026-06-21T20:07Z (UTC Sunday, market closed)
**Prior report:** `team-tool-recheck-2026-06-21-1806.md`
**Delta window:** ~2h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server restart context:** `mcpServerStartup` last at 10:29:26 UTC; uptime ~9h 33m at probe time.

---

## Probe Table — Tools Tested This Cycle

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_cycle_bootstrap` | `{agent_name:"news-scout"}` | OK — market context, 1 alert (NKG LOW), 10 recent analyses | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | OK — VN-Index 1824.53 (-0.32%), breadth 81/203/66, source VnDirect | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | OK — oil $80.59, gold $4172.9, USD/VND 26120; deltas null (TE dead, unchanged) | ✅ REACHABLE (data gap) |
| `get_system_status` | `{}` | 10 unresolved errors, 49 open warnings; Reuters+TE 99 ⚠; vn-bctc-fetch uptime=5d 1h 57m | ✅ REACHABLE |
| `get_vps_service_health` | `{}` | vn-bctc-fetch: **unhealthy** (5d 1h 57m); vn-sbv-fetch: **healthy** (recovered since 18:06) | ✅ REACHABLE |
| `get_vps_proxy_health` | `{}` | bctc: last_push=2026-06-16T18:02:24Z, STALE=YES; news/sbv: ok | ✅ REACHABLE |
| `get_sla_status` | `{}` | bctc: 7165/360min — CRITICAL; price/news/sbv_fx/foreign_flow: ok | ✅ REACHABLE |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows..."}` | ❌ BUG-4 |
| `get_cron_health` | `{}` | intelligenceCycleJob 99.7%; vnstockTradingStatsRefresh 85.7% / 649s; sbvRatesRefreshJob 98.2% | ✅ REACHABLE |
| `get_macro_calendar` | `{days:60}` | `{"events":[],"status":"unavailable"}` — unchanged | ❌ ISSUE-7 |
| `get_rate_limit_status` | `{}` | tradingeconomics.com: Chua goi; reuters not registered; vndirect/hnx/cafef ok | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | BDI/DAG/DLC/JSH/SIS/VDC/VNH TA not ready (rows=0) — unchanged | ⚠ ISSUE-4 |
| `get_earnings_calendar` | `{}` | 41 tickers; 12 QUÁ HẠN — unchanged | ✅ HEALTHY |
| `task_list_held` | `{}` | 6 locks; `esc-datacov:FPT:Q1-2026:ESC-3` **no longer present** | ✅ BUG-5 RESOLVED |
| `get_agent_signals` | `{from_agent:null,"status":"all","hours_back":0.25}` (no agent) | **Error: `agent` is required when using inbox mode** — all-producers path broken | ❌ BUG-6 NEW |
| `get_agent_signals` | `{agent:"market-watcher","from_agent":null,...}` | OK — returns signals (inbox+explicit agent works) | ✅ HEALTHY |
| `get_agent_signals` | `{from_agent:"market-watcher","status":"all","hours_back":0.25}` | OK — "Không có tín hiệu mới" (sender-history mode works) | ✅ HEALTHY |
| `get_technical_indicators` | `{code:"VNM"}` | OK — MA/RSI/MACD/BB returned; param is `code`, not `ticker` | ✅ HEALTHY |
| `get_foreign_flow` | `{code:"HPG"}` | OK — neutral signal, 10d history; param is `code`, not `ticker` | ✅ HEALTHY |
| `get_vn_macro_indicators` | `{}` | OK — IIP data: manufacturing +103.39% YoY | ✅ HEALTHY |
| `emit_pressure_state` | `{agent:"health-recheck",pressure:"green",note:"health probe"}` | OK — emitted, stale_warning=true (no cycle snapshot, expected for health probe) | ✅ HEALTHY |
| `get_system_status` (source health) | — | CafeF/VnEconomy/VnExpress: 1-error degraded (transient); bloomberg/nld: ok | ⚠ TRANSIENT |

---

## STEP 3c — Prior Findings Re-Probed This Cycle

All prior active bugs/issues re-probed from scratch. Commands and outputs cited inline.

| Prior Item | Re-probe Command | This Cycle Result | Delta |
|-----------|-----------------|-------------------|-------|
| BUG-1 BCTC dead | `get_vps_service_health`, `get_sla_status`, `get_vps_proxy_health` | Unhealthy 5d 1h 57m; SLA 7165/360min (+123min); last_push unchanged | WORSENING Day 7 |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS | Ngưng | Chưa bao giờ | 99 ⚠` | UNCHANGED (79→99) |
| BUG-3 TE dead | `get_system_status`, `get_rate_limit_status` | `Trading Economics | Ngưng | 99 ⚠`; tradingeconomics.com: Chua goi | UNCHANGED (79→99) |
| BUG-4 ISM no data | `get_ism_subcomponents({})` | `{"error":"no_data",...}` — no FRED_API_KEY | UNCHANGED |
| BUG-5 FPT orphaned lock | `task_list_held({})` | Lock `esc-datacov:FPT:Q1-2026:ESC-3` **absent** (6 locks returned, none = FPT) | **RESOLVED** |
| ISSUE-1 SBV crash loop | `get_vps_service_health`, system errors | vn-sbv-fetch: healthy (recovered); 5× REJECTED errors still in system log | PARTIAL — service recovered, errors continue |
| ISSUE-2 49 warnings | `get_system_status` DB Audit | `pending_feedback: 67`, `open_warnings: 49` — identical | UNCHANGED |
| ISSUE-3 cycle stalls | `get_system_status` recent errors | 2 stalls at 17:15 + 18:00 UTC; avg_duration 27848ms | UNCHANGED |
| ISSUE-4 TA not ready | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 rows | UNCHANGED |
| ISSUE-5 deltas null | `get_macro_snapshot` | `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` | UNCHANGED |
| ISSUE-6 vnstock 85.7% | `get_cron_health` | success_rate=0.86, avg_duration=649220ms, total_runs=7 | UNCHANGED |
| ISSUE-7 macro-calendar | `get_macro_calendar({days:60})` | `{"events":[],"status":"unavailable"}` | UNCHANGED |
| ISSUE-8 windowPartitioner | `get_system_status` recent errors | Not observed in 18:02–20:02 UTC window | MONITORING — not reproduced |
| ISSUE-9 weatherCheckJob | `get_system_status`, `get_cron_health` | Not observed this cycle; cron_health shows 100% success | MONITORING — single prior occurrence |

---

## ACTIVE BUGS — 5 (BUG-5 RESOLVED, BUG-6 NEW)

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 7

**Delta vs 18:06:** +123 min SLA breach; service still unrecovered.

| Signal | 18:06 | 20:07 | Delta |
|--------|-------|-------|-------|
| vn-bctc-fetch status | unhealthy, 4d 23h 57m | unhealthy, 5d 1h 57m | +2h |
| SLA breach (actual/SLA) | 7042/360min | 7165/360min | +123 actual min |
| Last BCTC push | 2026-06-16 18:02:24 | 2026-06-16 18:02:24 | No change — Day 7 |
| BCTC data freshness | ~117h | ~119h | Still worsening |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 0ms, uptime=5d 1h 57m`
- `get_sla_status`: `bctc: 7165/360min — CRITICAL`
- `get_vps_proxy_health`: `bctc: last_push=2026-06-16T18:02:24Z, 24h_pushes=0, STALE=YES`
- `get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — 7 tickers TA not ready

**Callers confirmed (2 agent flows + 3 cron jobs):** bctc-analyst, market-analyst, bctcPdfPullJob, bctcQueueEnricherJob, bctcReparseJob

**Blast radius: Day 7 CRITICAL. 12 Q1 tickers losing earnings ingestion window. 2 agent flows stalled.**

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify via `get_vps_service_health` → `trigger_bctc_vps_fetch` to backfill.

---

### BUG-2 — HIGH — UNCHANGED — Reuters RSS Dead (99 consecutive errors)

**Delta vs 18:06:** Counter 79 → 99 (+20, ~10/h rate continuing).

**Re-probe evidence (this cycle):**
- `get_system_status` source health: `Reuters RSS | Ngưng | Chưa bao giờ | 99 ⚠`
- `get_rate_limit_status`: reuters.com not in rate-limit table (CB layer never reached — pre-CB failure)

**Callers confirmed:** news-scout, unified-agent
**Blast radius: 2 agent flows — news coverage degraded (missing Reuters source)**

**Fix:** Disable Reuters RSS source record in MCP DB/config (`vn-reuters-fetch.service` decommissioned per fix #7, 2026-04-30). Source record is still active, logging ~10 failures/hour.

---

### BUG-3 — HIGH — UNCHANGED — Trading Economics 2× Dead (99 consecutive errors each)

**Delta vs 18:06:** Counter 79 → 99 each (+20, ~10/h rate).

**Re-probe evidence (this cycle):**
- `get_system_status` source health: `Trading Economics | Ngưng | Chưa bao giờ | 99 ⚠` (both TE entries)
- `get_rate_limit_status`: `tradingeconomics.com | Chua goi` — still never called post-restart 10:29 UTC
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` — commodity deltas remain null

**Callers confirmed (grep):** market-watcher, unified-agent, news-scout (via get_macro_snapshot)
**Blast radius: 3 agent flows — commodity/macro deltas null for all agents; get_macro_calendar also likely linked**

**Fix:** Trace why tradingeconomics.com is `Chua goi` (never called) despite CB reset at restart. Pre-CB failure likely in fetcher startup or init path. Check Chromium in mcp-server container: `docker exec <ctr> chromium --version`.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED_API_KEY absent)

**Delta vs 18:06:** macroIndicatorRefreshJob ran at 12:13 UTC (success) — still no ISM rows produced.

**Re-probe evidence (this cycle):**
- `get_ism_subcomponents({})`: `{"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`
- `get_system_status`: `[get_ism_subcomponents] no ISM data in fred_series_daily` in recent errors

**Callers confirmed (grep):** bctc-analyst, news-scout, unified-agent
**Blast radius: 3 agent flows — ISM/FRED macro signal unavailable**

**Fix:** (1) Set `FRED_API_KEY` env var (free: fred.stlouisfed.org). (2) Verify NAPMBI series ID is valid — HTTP 400 = invalid series. Try `NAPMPMI`, `ISM/MAN_PMI`, or search FRED for current Manufacturing PMI series.

---

### BUG-6 — MEDIUM — NEW — `get_agent_signals` all-producers path broken (null-stripping)

**First confirmed this cycle.** Not in prior reports.

**Root cause:** MCP JSON transport silently strips `null`-valued keys from the arguments object (converts `{"from_agent": null}` → `{}`). The handler checks `args.from_agent === null` at `agentSignalTools.ts:512` to enter all-producers mode — but since the transport strips null, `args.from_agent` is always `undefined`, never `null`. All-producers path never executes. Falls through to inbox guard at line 527 which requires `agent`.

**Re-probe evidence (this cycle):**
- Probe 1 (broken caller pattern): `call_tool("get_agent_signals", {"from_agent": null, "status": "all", "hours_back": 0.25})` → `Error: \`agent\` is required when using inbox mode (from_agent not provided).`
- Probe 2 (working): `call_tool("get_agent_signals", {"agent": "market-watcher", "from_agent": null, ...})` → OK (inbox mode works when `agent` is explicit)
- Probe 3 (working): `call_tool("get_agent_signals", {"from_agent": "market-watcher", ...})` → OK (sender-history mode works)
- Source check: `agentSignalTools.ts:473-483` — Zod schema `z.string().nullable().optional()` should accept null but transport strips it before handler receives it. Unit tests pass because they bypass MCP transport.

**Caller-surface grep:**
```
grep -r "from_agent.*null\|from_agent=null" docs/agents/ --include="*.md"
```
→ 2 affected callers:

1. `docs/agents/market-watcher/flow/main.md:54` — Step 0-GW sibling corroboration gate:
   ```
   SIBLING_RECENT = call_tool(..., {"from_agent": null, "status": "all", "hours_back": 0.25})
   ```
   Impact: When `get_system_status` fails 2× in a row, market-watcher cannot corroborate via sibling signals. The suppressor that prevents false gateway-down BUG alerts is **broken**. Result: any local transient that causes 2 probe failures will file a spurious gateway-down Telegram alert.

2. `docs/agents/news-scout/flow/stage-bootstrap.md:57` — SIBLING_WINDOW_CACHE (cross-sibling dedup):
   ```
   SIBLING_WINDOW_CACHE = call_tool(..., {"from_agent": null, "status": "all", "hours_back": 0.25})
   ```
   Impact: Non-fatal (`if tool errors, set SIBLING_WINDOW_CACHE = []`). Cross-sibling dedup is silently disabled — concurrent news-scout instances can post duplicate signals.

**Caller-surface confirmed: 2 affected callers (1 silent false-alarm risk, 1 graceful degrade).**

**Fix (server-side, `agentSignalTools.ts`):** Add explicit `all_producers` flag to Zod schema:
```typescript
all_producers: z.boolean().optional().describe("Pass true for cross-producer all-producers mode (replaces from_agent=null sentinel which is stripped by MCP transport)")
```
And update handler: `if (args.from_agent === null || args.all_producers === true)` → all-producers path.
Update callers to pass `"all_producers": true` instead of `"from_agent": null`.

---

## RESOLVED THIS CYCLE

| Item | Prior Status | This Cycle | Evidence |
|------|-------------|------------|---------|
| BUG-5 `esc-datacov:FPT:Q1-2026:ESC-3` orphaned lock | BUG MEDIUM — held 5 days, expires 2026-06-24 | **NOT FOUND** in `task_list_held({})` (6 locks returned, none = FPT) | `task_list_held` probe this cycle — likely manually released |

---

## ACTIVE ISSUES — 9 (unchanged from prior cycle count)

### ISSUE-1 — MEDIUM — PARTIALLY IMPROVED — SBV Zero-Value Rejection Loop

**Delta vs 18:06:** vn-sbv-fetch recovered to `healthy` (was unhealthy at 18:06). Zero-value rejections continue.

**Re-probe evidence:**
- `get_vps_service_health`: `vn-sbv-fetch: healthy, 4m ago`
- `get_system_status` errors: `storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 17:32, 18:02, 18:32, 19:02, 19:32 UTC (5 occurrences, every 30min)
- `get_cron_health`: `sbvRatesRefreshJob: success_rate=0.98 (98.2%), avg_duration=4093ms`

**Fix (two-part):** (1) Add off-hours gate in SBV VPS push handler to skip pushes outside VN business hours (~00:00–10:00 UTC). (2) Investigate crash loop trigger: repeated REJECTED responses may cause VPS service restart.

---

### ISSUE-2 — HIGH — UNCHANGED — 49 Open Warnings / 67 Pending Feedback

**Re-probe:** `get_system_status` DB Audit: `pending_feedback: 67 new items`, `open_warnings: 49 high/critical` — identical to 18:06.

**Fix:** Manual triage session needed. Will partially auto-resolve when BUG-1/BUG-3 fixed.

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence Cycle Concurrency Stalls

**Delta vs 18:06:** 2 additional stalls at 17:15 + 18:00 UTC (continuing same ~1/h rate).

**Re-probe evidence:**
- `get_system_status` errors: `[intelligence-cycle] previous cycle still running — skipped` at 17:15 + 18:00 UTC
- `get_cron_health`: `intelligenceCycleJob: avg_duration=27848ms, success_rate=99.7%, total_runs=1177`

**Fix:** Add hard 12-minute timeout in `intelligenceCycleJob.ts` to kill runaway cycles before next 15-min slot.

---

### ISSUE-4 — LOW — UNCHANGED — BDI + 6 Tickers TA Not Ready

**Re-probe:** `get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — unchanged.

**Fix:** (1) BDI: Replace `^BDI` Yahoo Finance ticker (no data) with Baltic Exchange API. (2) Other 6: recover when BUG-1 BCTC pipeline restored.

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Price Deltas Null (linked to BUG-3)

**Re-probe:** `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` — unchanged. Auto-resolves with BUG-3 fix.

---

### ISSUE-6 — LOW — UNCHANGED — vnstockTradingStatsRefresh 85.7% / 649s Runtime

**Re-probe:** `get_cron_health`: `vnstockTradingStatsRefresh: success_rate=0.86, avg_duration=649220ms, total_runs=7` — identical to 18:06.

**Fix:** Add per-ticker error isolation + 15-min job timeout guard.

---

### ISSUE-7 — LOW — UNCHANGED — get_macro_calendar Returns Empty

**Re-probe:** `get_macro_calendar({days:60})`: `{"events":[],"status":"unavailable","is_estimate":true,"source_tier":4}` — unchanged.

**Callers confirmed:** `digest-predict/flow/weekly.md:30`, `alert-commander/flow/stage-bootstrap.md:14`
**Blast radius: 2 agent flows unable to detect pivot windows**

**Fix:** Trace which source/job populates `macroCalendar` table. Likely TE-dependent → auto-resolves with BUG-3. Verify independently.

---

### ISSUE-8 — LOW — MONITORING — windowPartitioner Continuation Truncation

Not observed in 18:02–20:07 UTC window. Isolated burst on prior cycle. Continue monitoring.

---

### ISSUE-9 — LOW — MONITORING — weatherCheckJob Previous Run Blocking

Not reproduced this cycle. `weatherCheckJob: 100% success` in cron_health. Single occurrence from prior cycle. Continue monitoring.

---

## NON-ISSUES — Caller-Surface Verified This Cycle

| Item | My Probe Result | Caller Contract / Evidence | Verdict |
|------|----------------|--------------------------|---------|
| Stock prices 59h stale | STALE | VN market closed since 2026-06-19 Thu; price SLA ok (51/3577min) | NON-ISSUE — expected weekend |
| CafeF/VnEconomy/VnExpress RSS 1-error degraded | `Suy giảm | 2 phút trước | 1` each | Transient per-cycle blip; 24h stats show ok; news SLA ok | NON-ISSUE — transient |
| newsapi: disabled | 0 errors, `disabled | Chưa bao giờ | 0` | Intentional by design | NON-ISSUE — by design |
| ragInsert timeout `non-fatal` | 1 occurrence at 17:08 UTC | Non-fatal fallback; single event; news pipeline unaffected | NON-ISSUE — monitor only |
| digest-predict 3 overlapping publish-slot locks | 3 locks for W24/W25/Jun08-14/Jun15-21 | Publish-slot locks are TTL-based, no heartbeat needed; overlap indicates re-run but not a bug | NON-ISSUE — by design |
| `emit_pressure_state` stale_warning=true | `cycle_snapshot_promoted: false` | Expected for health probe with no real cycle snapshot | NON-ISSUE |
| `get_technical_indicators`/`get_foreign_flow` use `code` not `ticker` | Schema validation error with `ticker` | Caller-surface grep: all flow docs use `code`; schema correct | NON-ISSUE — caller-surface verified |
| `base_rate=0` WARN for `foreign_flow_institutional/bullish/5` | Single occurrence 19:07 UTC | Defaulting to 1.0 is correct fallback; not a recurring pattern this cycle | NON-ISSUE — single fallback |
| `pollNews ragInsert timeout` | 1 occurrence at 00:08 UTC | Non-fatal, single event | NON-ISSUE |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 7 (WORSENING: 7165min SLA breach, 12 QUÁ HẠN, 7 tickers TA dead) |
| BUG HIGH | 2 | BUG-2 Reuters dead (counter 99), BUG-3 Trading Economics 2× dead (counter 99) |
| BUG MEDIUM | 2 | BUG-4 ISM no FRED_API_KEY, BUG-6 (NEW) get_agent_signals all-producers path broken |
| ISSUE HIGH | 1 | ISSUE-2 49 open warnings / 67 pending feedback |
| ISSUE MEDIUM | 2 | ISSUE-1 SBV zero-value rejections (service recovered), ISSUE-3 intelligence-cycle stalls |
| ISSUE LOW | 5 | ISSUE-4 BDI+6 TA dead, ISSUE-5 commodity deltas null, ISSUE-6 vnstock 85.7%, ISSUE-7 macro-calendar empty, ISSUE-8/9 MONITORING |
| NON-ISSUE | 9 | Weekend prices, RSS transient, newsapi disabled, ragInsert non-fatal, digest locks, emit stale, code/ticker, base_rate, pollNews |
| RESOLVED | 1 | BUG-5 esc-datacov:FPT:Q1-2026:ESC-3 orphaned lock — not found in task_list_held |

---

## Recommended Immediate Actions (priority order)

1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1, Day 7 CRITICAL, 12 overdue Q1 tickers, 7 tickers TA dead
2. **Fix `get_agent_signals` null-stripping (BUG-6):** Add `all_producers: z.boolean().optional()` param to Zod schema in `agentSignalTools.ts`, handle in code, update 2 flow callers. Unblocks market-watcher false-alarm suppressor and news-scout cross-sibling dedup.
3. **Set FRED_API_KEY + fix NAPMBI series ID** — BUG-4, free API key, unblocks ISM for 3 agents
4. **Disable Reuters RSS source record** — BUG-2, kills ~240/day error log entries from dead decommissioned source
5. **Add off-hours gate to SBV VPS push handler** — ISSUE-1, stops zero-value rejection / crash loop outside VN business hours
6. **Diagnose TE fetcher pre-CB failure path** — BUG-3, `tradingeconomics.com: Chua goi` persists post-restart; unblocks commodity deltas + macro-calendar for 3 agents
7. **Add 12-min timeout to `intelligenceCycleJob.ts`** — ISSUE-3, prevents runaway cycles (2 stalls observed this cycle)
8. **Verify BUG-5 resolution** — Confirm `esc-datacov:FPT:Q1-2026:ESC-3` was intentionally released or auto-expired; re-trigger bctc-analyst for FPT Q1-2026 once BUG-1 fixed
