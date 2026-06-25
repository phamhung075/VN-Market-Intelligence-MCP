# Team MCP Tool Health Recheck — 2026-06-23T10:08Z

**Cycle:** 2026-06-23T10:08Z (UTC Monday, post-market)
**Prior report:** `team-tool-recheck-2026-06-22-2215.md`
**Delta window:** ~11.9h since last report
**Gateway:** REACHABLE — all probes executed via `mcp__gateway__call_tool(server="vn-market", ...)`
**Server context:** mcp-server uptime 13h 59m at probe time

---

## Probe Table — Tools Tested This Cycle

| Tool | Call Pattern | Result | Status |
|------|-------------|--------|--------|
| `get_system_status` | `{}` | Uptime 13h 59m; 16 circuit breakers OK; 10 unresolved errors; Reuters+TE dead (162⚠); SBV 2× REJECTED (09:04, 09:34); intelligence-cycle skip 10:00 | ✅ REACHABLE |
| `get_cycle_bootstrap` | `{agent_name:"market-watcher"}` | OK — 41 watchlist prices, 20 open alerts, 10 analyses, elapsed 24ms | ✅ HEALTHY |
| `get_market_snapshot` | `{}` | VN-Index 1869.04 (+0.60%), breadth 95↑/208↓, turnover 30989 tỷ (+112.3%), source VnDirect tier2 | ✅ HEALTHY |
| `get_macro_snapshot` | `{}` | oil $77.48, gold $4135, USD/VND 26128; deltas still null (BUG-3) | ✅ REACHABLE |
| `get_market_breadth` | `{}` | 95/208/61 A/D/NC, 30989 tỷ, fresh 10:05 | ✅ HEALTHY |
| `get_technical_indicators` | `{code:"VCB"}` | RSI 42.3, MACD bearish, BB normal — HEALTHY | ✅ HEALTHY |
| `get_technical_indicators` | `{ticker:"VCB"}` | Validation error: `code` required, `ticker` undefined | ❌ schema-drift (doc only — see IMPROVE-2) |
| `get_ticker_intelligence` | `{code:"VCB"}` | Price, evidence score, insider, foreign flow, BCTC, predictions — HEALTHY | ✅ HEALTHY |
| `get_ticker_intelligence` | `{ticker:"VCB"}` | Validation error: `code` required | ❌ schema-drift (doc only — see IMPROVE-2) |
| `get_price_history` | `{code:"VCB",days:5}` | 4 rows returned, HEALTHY | ✅ HEALTHY |
| `get_price_history` | `{tickers:["VCB","FPT"],days:3}` | Validation error: `code` required, `tickers` undefined | ❌ schema-drift (doc only — see IMPROVE-3) |
| `get_foreign_flow` | `{code:"VCB"}` | 10-day history, neutral signal, holding ratio 20.22% | ✅ HEALTHY |
| `get_market_foreign_flow` | `{}` | 99 tickers, net sell -3.14M; VIC top buyer; HPG top seller | ✅ HEALTHY |
| `get_sector_rotation` | `{}` | 16 sectors analysed; all ỔN ĐỊNH (1-day only; <5 sessions available) | ✅ HEALTHY |
| `get_watchlist` | `{}` | 41 tickers, prices fresh (post-market) | ✅ HEALTHY |
| `get_supply_chain_exposure` | `{}` | BDI 1,400 dated **2026-04-07** (77 days stale) | ⚠ ISSUE-4 (BDI) |
| `get_earnings_calendar` | `{}` | 12 QUÁ HẠN: BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH | ⚠ BUG-1 |
| `get_vps_service_health` | `{}` | vn-bctc-fetch: **unhealthy 6d 16h 2m**; sbv/news healthy; price/ff idle | ⚠ BUG-1 |
| `get_vps_proxy_health` | `{}` | bctc: STALE=YES, last_push=2026-06-16 18:02:24 (unchanged since Day 1); sbv/news/prices OK | ⚠ BUG-1 |
| `get_sla_status` | `{}` | bctc: **9445/360min CRITICAL**; sbv_fx 7/30 ok; news 1/30 ok; price 7/98 ok | ⚠ BUG-1 |
| `get_cron_health` | `{}` | sbvRatesRefreshJob 98.2%; intelligenceCycleJob 99.9% avg 28141ms; vnstockTradingStats 733069ms | ✅ REACHABLE |
| `get_pipeline_health` | `{}` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — unchanged from prior | ⚠ ISSUE-4 |
| `get_ism_subcomponents` | `{}` | `{"error":"no_data","message":"...requires FRED_API_KEY"}` | ❌ BUG-4 |
| `get_macro_calendar` | `{}` | `{"events":[],"status":"unavailable","source_tier":4}` | ⚠ ISSUE-7 |
| `get_vn_macro_indicators` | `{}` | `status:"degraded"`, `iip:[]`, NSO Excel unreachable via VPS proxy (context deadline exceeded) | ⚠ **NEW-ISSUE-8** |
| `emit_pressure_state` | `{}` | `{success:true, cycle_snapshot_promoted:false}` | ✅ HEALTHY |
| `get_agent_signals` | `{agent:"market-watcher",hours_back:1}` | Returns cleanly (no signals in window) | ✅ HEALTHY |
| `post_agent_signal` | `{from_agent,to_agent,signal_type:"price_anomaly",...}` | Schema validates; enum enforcement working | ✅ HEALTHY |
| `task_claim` | `{task_id,task_kind:"sprint-task",owner_agent,ttl_seconds:60}` | `{claimed:true}` | ✅ HEALTHY |
| `task_release` | `{task_id}` | `{ok:true}` | ✅ HEALTHY |
| `log_agent_work` | Call-1 `{status:"running"}` → `{id:1421}` | Both calls (start+complete) working | ✅ HEALTHY |
| `get_bctc_pending_refine` | `{limit:3}` | 3 PDFs returned (VCB PARTIAL, HPG PENDING, GVR PENDING) | ✅ HEALTHY |
| `get_cycle_bootstrap` | `{}` (no agent_name) | Validation error: `agent_name` required | ✅ EXPECTED (correct schema guard) |
| `get_market_foreign_flow` | `{}` | OK | ✅ HEALTHY |
| `get_patterns` | `{stockCode:"VCB",eventKeyword:"breakout"}` | No precedents — returns cleanly (expected off-market) | ✅ HEALTHY |

---

## STEP 3c — Prior Findings Re-Probed This Cycle

| Prior Item | Re-probe Command | This Cycle Result | Delta |
|-----------|-----------------|-------------------|-------|
| BUG-1 BCTC dead | `get_vps_service_health`, `get_sla_status`, `get_vps_proxy_health`, `get_earnings_calendar` | unhealthy 6d 16h 2m; 9445/360min; last_push unchanged; 12 QUÁ HẠN | WORSENING — Day 9, +12h since prior |
| BUG-2 Reuters dead | `get_system_status` source health | `Reuters RSS \| Ngưng \| Chưa bao giờ \| 162 ⚠` | WORSENING — 162 vs 19 in prior (×8.5×) |
| BUG-3 TE dead | `get_system_status` source health + `get_macro_snapshot` | `Trading Economics \| Ngưng \| Chưa bao giờ \| 162–163 ⚠` (×2); deltas still null | WORSENING — 162-163 vs 19 in prior |
| BUG-4 ISM no data | `get_ism_subcomponents({})` | `{"error":"no_data","message":"...requires FRED_API_KEY"}` | UNCHANGED |
| ISSUE-1 SBV zero-value | `get_system_status` errors, `get_sla_status` | 2× REJECTED (09:04, 09:34); sbv_fx SLA ok (7/30min); vn-sbv-fetch healthy | UNCHANGED — still recurring |
| ISSUE-2 open_warnings | `get_system_status` | `open_warnings: 50`, `pending_feedback: 67` | UNCHANGED |
| ISSUE-3 cycle stalls | `get_system_status`, `get_cron_health` | 1 stall at 10:00 UTC; avg 28141ms | UNCHANGED |
| ISSUE-4 TA not ready | `get_pipeline_health` | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 | UNCHANGED |
| ISSUE-5 deltas null | `get_macro_snapshot` | `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null` | UNCHANGED (BUG-3 linked) |
| ISSUE-6 vnstock slow | `get_cron_health` | avg_duration=733069ms (12.2 min) — was 845851ms (14.1 min) | SLIGHTLY IMPROVED (−13%) |
| ISSUE-7 macro-calendar | `get_macro_calendar({})` | `{"events":[],"status":"unavailable"}` | UNCHANGED |
| IMPROVE-1 dual timezone | `get_system_status` | UTC in "Recent System Errors", UTC+7 in "RECENT ERRORS" | UNCHANGED |

---

## ACTIVE BUGS — 4

### BUG-1 — CRITICAL — WORSENING — BCTC Pipeline Dead Day 9

| Signal | Prior (22:15 Jun 22) | This Cycle (10:08 Jun 23) | Delta |
|--------|----------|-------|-------|
| vn-bctc-fetch status | unhealthy 6d 3h 57m | unhealthy **6d 16h 2m** | +12h |
| SLA breach (actual/SLA) | 8722/360min | **9445/360min** (26.2×) | +723 min |
| Last BCTC push | 2026-06-16 18:02:24 | 2026-06-16 18:02:24 | No change — Day 9 stale |
| QUÁ HẠN tickers | 12 | 12: BDI/BID/DAG/DLC/GAS/JSH/PLX/PPC/SIS/VDC/VEA/VNH | Unchanged |
| 24h pushes | 0 | 0 | No recovery |

**Re-probe evidence (this cycle):**
- `get_vps_service_health`: `vn-bctc-fetch: unhealthy, 2m ago, 0ms, VPS uptime 6d 16h 2m`
- `get_sla_status`: `bctc: 9445/360min — CRITICAL BREACHED`
- `get_vps_proxy_health`: `bctc: last_push=2026-06-16T18:02:24Z, 24h_pushes=0, STALE=YES`
- `get_earnings_calendar`: 12 QUÁ HẠN including BID (major bank)

**Caller-surface verified:**
```
grep -rl "bctc" docs/agents/*/flow/ --include="*.md"
→ bctc-analyst, market-analyst, ops, system-auditor, refine_bctc_md — 5 agent flows
```
**Blast radius: Day 9 CRITICAL. 26× SLA. 12 Q1 tickers losing earnings ingestion. bctc-analyst aborted for all overdue tickers. refine_bctc_md idle (no new PDFs from VPS).**

**Fix:** SSH VPS → `sudo systemctl restart vn-bctc-fetch.service` → verify via `get_vps_service_health` → `trigger_bctc_vps_fetch` to backfill.

---

### BUG-2 — HIGH — WORSENING — Reuters RSS Dead (162 consecutive failures)

**Re-probe evidence:**
- `get_system_status`: `Reuters RSS | Ngưng | Chưa bao giờ | 162 ⚠`
- 162 errors at ~7.5-min poll interval = ~20h of continuous failure since last server restart
- Source has NEVER succeeded (`Chưa bao giờ`)

**Caller-surface verified:**
```
grep -l "Reuters\|reuters" docs/agents/tools/package/*.md
→ docs/agents/tools/package/news-scout.md, docs/agents/tools/package/unified-agent.md
```
**2 agent flows affected** — news coverage degraded; ~8 errors/hour accumulating in log.

**Fix:** Disable Reuters RSS source record from DB/config. Source decommissioned per fix #7 (2026-04-30) — stale registry entry still active and polling.

---

### BUG-3 — HIGH — WORSENING — Trading Economics 2× Dead (162-163 consecutive failures)

**Re-probe evidence:**
- `get_system_status`: `Trading Economics | Ngưng | Chưa bao giờ | 162 ⚠` (×2 entries, 162 and 163)
- `get_macro_snapshot`: `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`
- `get_macro_calendar({})`: `{"events":[],"status":"unavailable","source_tier":4}`

**Caller-surface verified:**
```
grep -l "get_macro_snapshot\|tradingEconomics" docs/agents/tools/package/*.md
→ market-watcher.md, unified-agent.md, news-scout.md
```
**3 agent flows affected** — commodity/macro deltas null; macro-calendar empty (ISSUE-7 linked).

**Fix:** Diagnose why `tradingeconomics.com` never initializes after restart. Confirm Chromium available in mcp-server container; check pre-CB failure path in fetcher init.

---

### BUG-4 — MEDIUM — UNCHANGED — ISM Sub-components No Data (FRED_API_KEY absent)

**Re-probe evidence:**
- `get_ism_subcomponents({})`: `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}`

**Caller-surface verified:**
```
grep -l "get_ism_subcomponents" docs/agents/tools/package/*.md
→ bctc-analyst.md, news-scout.md, unified-agent.md
```
**3 agent flows affected** — ISM manufacturing PMI unavailable to CHEF layer.

**Fix:** (1) Set `FRED_API_KEY` env var (free: fred.stlouisfed.org). (2) Run `macroIndicatorRefreshJob` to backfill.

---

## ACTIVE ISSUES — 8 (ISSUE-8 NEW; ISSUE-6 SLIGHTLY IMPROVED)

### ISSUE-1 — MEDIUM — UNCHANGED — SBV Zero-value Push Rejections

**Re-probe evidence:**
- `get_system_status` errors: `[sbv] storeSbvSnapshot REJECTED — zero-value would overwrite good prior row` at 09:04 and 09:34 UTC today
- `get_vps_service_health`: `vn-sbv-fetch: healthy` (service up)
- `get_sla_status`: `sbv_fx: 7/30min ok` (SLA not breached — guard working)
- `get_cron_health`: `sbvRatesRefreshJob: success_rate=0.982, avg_duration=4119ms`

**Status:** Service running but intermittently fetching zero-value rates. The guard correctly blocks zero overwrites, but underlying SBV source is returning bad data ~2× per morning window.

**Fix:** Add startup zero-guard in vn-sbv-fetch: skip push when `fetched_rate == 0`. Investigate root cause via `journalctl -u vn-sbv-fetch`.

---

### ISSUE-2 — LOW — UNCHANGED — Open Warnings / Pending Feedback Backlog

**Re-probe:** `get_system_status` → `open_warnings: 50 high/critical items`, `pending_feedback: 67 new items`. Unchanged from prior cycle. No drainage.

---

### ISSUE-3 — MEDIUM — UNCHANGED — Intelligence Cycle Concurrency Stalls

**Re-probe evidence:**
- `get_system_status`: `[intelligence-cycle] previous cycle still running — skipped` at 10:00:01 UTC (1 stall today)
- `get_cron_health`: `intelligenceCycleJob: avg_duration=28141ms (~28s), success_rate=99.9%`

**Analysis:** Cycle normally completes in ~28s. Occasional stalls push duration past 15-min slot, triggering skip. No data loss confirmed, but frequency is 1–3 stalls/day from prior reports.

**Fix:** Add hard 12-min timeout in `intelligenceCycleJob.ts` to kill runaway cycles before next 15-min slot.

---

### ISSUE-4 — LOW — UNCHANGED — 7 Tickers TA Not Ready + BDI Stale in Supply Chain

**Re-probe evidence:**
- `get_pipeline_health`: BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0, VNH=6 — unchanged
- `get_supply_chain_exposure`: BDI 1,400 dated **2026-04-07** (77 days stale)

**Analysis:** BDI price data missing from OHLCV store (rows=0), and the supply chain tool is serving a 77-day-old cached BDI figure. 6 other tickers also TA-not-ready due to low trading volume / data gaps.

---

### ISSUE-5 — LOW — UNCHANGED — Commodity Price Deltas Null (linked BUG-3)

**Re-probe:** `get_macro_snapshot` → `oilUsdDelta:null, goldUsdDelta:null, usdVndDelta:null`. Auto-resolves with BUG-3.

---

### ISSUE-6 — LOW — SLIGHTLY IMPROVED — vnstockTradingStatsRefresh Slow

**Re-probe:** `get_cron_health` → `vnstockTradingStatsRefresh: avg_duration=733069ms (12.2 min)`. Was 845851ms (14.1 min) in prior cycle. Improving but still dangerously close to the 15-min cron slot.

**Fix:** Add per-ticker error isolation + 15-min job timeout guard.

---

### ISSUE-7 — LOW — UNCHANGED — Macro Calendar Empty (linked BUG-3)

**Re-probe:** `get_macro_calendar({})` → `{"events":[],"is_estimate":true,"source_tier":4,"status":"unavailable"}`. Auto-resolves with BUG-3.

**Callers confirmed:** `docs/agents/digest-predict/flow/monday.md`, `docs/agents/alert-commander/init.md`

---

### ISSUE-8 — MEDIUM — NEW THIS CYCLE — `get_vn_macro_indicators` Degraded (NSO Excel VPS Timeout)

**Evidence:**
- Prior cycle (22:15 UTC Jun 22): `get_vn_macro_indicators` → `IIP all_industry YoY 103.3%` — HEALTHY
- This cycle (10:07 UTC Jun 23): `{"status":"degraded","iip":[],"is_estimate":true,"blocked_reason":"NSO Excel unreachable via VPS proxy 125.212.251.27:3128: ... context deadline exceeded"}`

**Analysis:** The NSO macro Excel source is now failing via the VPS proxy. This is a NEW degradation since the prior report. The VPS proxy itself is up (news/sbv/prices all working), so this is specific to the NSO endpoint or proxy routing for that host.

**Caller-surface verified:**
```
grep -rl "get_vn_macro_indicators" docs/agents/tools/package/ --include="*.md"
```
Used by macro-indicators-dependent agents (dev-macro-indicators, market-analyst layer). IIP data gap affects macro regime classification.

**Fix:** Check VPS proxy connectivity to `www.nso.gov.vn`. Possible: site blocked for VPS IP, or NSO changed URL structure. Run manual probe via ops-vps-fetch agent.

---

## ACTIVE IMPROVE — 3

### IMPROVE-1 — UNCHANGED — Dual Timezone in `get_system_status` Response

**Re-confirmed:** `get_system_status` "Recent System Errors" section uses UTC; "RECENT ERRORS" section uses UTC+7 for same events. Causes apparent 7h contradiction when agents cross-reference. Normalize both to UTC with explicit `(UTC)` suffix.

---

### IMPROVE-2 — NEW — `get_ticker_intelligence` Example in market-watcher.md Uses Wrong Param

**Evidence:**
- `docs/agents/tools/package/market-watcher.md` line ~207-211: example uses `arguments: { ticker: "VCB" }` — fails with schema error
- Canonical tool doc (`docs/agents/tools/list/get_ticker_intelligence.md`): param is `code`
- Live tool: `{ticker:"VCB"}` → validation error; `{code:"VCB"}` → works

**Caller-surface verified:**
```
grep -r "get_ticker_intelligence" docs/agents/*/flow/*.md
→ docs/agents/market-watcher/flow/cycle.md:77 uses get_ticker_intelligence(code) ✅
→ docs/agents/fb-market-poster/flow/main.md uses {code: ticker} ✅
```
**0 flow callers use the broken `ticker` param.** Doc example only — no runtime impact today, but misleads future agent or human writing a new caller.

**Fix:** Update `docs/agents/tools/package/market-watcher.md` line ~207: change `ticker: "VCB"` → `code: "VCB"`.

---

### IMPROVE-3 — NEW — `get_price_history` Example in market-watcher.md Uses Wrong Param

**Evidence:**
- `docs/agents/tools/package/market-watcher.md` line 147: example uses `tickers: ["VCB", "ACB", "FPT"]` (array)
- Live tool: `{tickers:[...]}` → validation error: `code` (string) required
- Live tool: `{code:"VCB", days:5}` → works correctly

**Caller-surface verified:**
```
grep -r "get_price_history" docs/agents/*/flow/*.md
→ No matches
```
**0 flow callers use `tickers` array.** Doc example only — but would break any new caller following the example verbatim.

**Fix:** Update `docs/agents/tools/package/market-watcher.md` line ~143-153: change `tickers: ["VCB","ACB","FPT"]` → `code: "VCB"` and note that multi-ticker requires iterating calls.

---

## RESOLVED THIS CYCLE

None. All prior findings re-confirmed above. BUG-1/2/3 all worsening by error count.

---

## NON-ISSUES — Verified This Cycle

| Item | Evidence | Verdict |
|------|----------|---------|
| VN market closed — prices stale since 08:59 UTC | Trading window CLOSED — expected off-market | NON-ISSUE |
| CafeF/VnEconomy/VnExpress RSS 1-error degraded | `Suy giảm | 13 phút trước | 1` each — transient RSS hiccup | NON-ISSUE — transient |
| newsapi: disabled | 0 errors, intentional | NON-ISSUE — by design |
| vn-foreign-flow, vn-price-fetch idle | Market closed — expected | NON-ISSUE |
| task_claim/task_release/log_agent_work/post_agent_signal | All healthy | NON-ISSUE |
| emit_pressure_state | `{success:true}` | NON-ISSUE |
| get_bctc_pending_refine | 3 PDFs in PARTIAL/PENDING refine state — pipeline has backlog, not blocked | NON-ISSUE (BUG-1 upstream) |
| `get_cycle_bootstrap` with no args | Correct schema guard — requires `agent_name` | NON-ISSUE — expected |
| foreign-flow fallbacks exhausted at 08:58-08:59 UTC | Market close; VPS idle = expected fallback exhaustion at session end | NON-ISSUE — expected pattern |

---

## Summary Table

| Severity | Count | Items |
|----------|-------|-------|
| BUG CRITICAL | 1 | BUG-1 BCTC dead Day 9 (9445/360min, 26× SLA, WORSENING) |
| BUG HIGH | 2 | BUG-2 Reuters dead (162⚠, WORSENING), BUG-3 Trading Economics 2× dead (162-163⚠, WORSENING) |
| BUG MEDIUM | 1 | BUG-4 ISM no FRED_API_KEY (3 agent flows, UNCHANGED) |
| ISSUE MEDIUM | 2 | ISSUE-3 intelligence-cycle stalls, ISSUE-8 get_vn_macro_indicators degraded (NEW) |
| ISSUE LOW | 6 | ISSUE-1 SBV zero-value, ISSUE-2 50 warnings, ISSUE-4 7 tickers TA+BDI stale, ISSUE-5 deltas null, ISSUE-6 vnstock 12.2min, ISSUE-7 macro-calendar empty |
| IMPROVE | 3 | IMPROVE-1 dual timezone, IMPROVE-2 ticker intelligence doc drift (NEW), IMPROVE-3 price history doc drift (NEW) |
| NON-ISSUE | 9 | Post-market prices, RSS transient, newsapi by-design, idle VPS, coordination tools healthy |
| RESOLVED | 0 | — |

---

## Recommended Immediate Actions (priority order)

1. **SSH VPS → restart `vn-bctc-fetch.service`** — BUG-1 Day 9 CRITICAL, 26× SLA breach. Every hour of delay = more overdue BCTC.
2. **Set FRED_API_KEY** — BUG-4 free API key (fred.stlouisfed.org), unblocks ISM for 3 agents instantly.
3. **Diagnose NSO Excel VPS proxy timeout** — ISSUE-8 NEW: `get_vn_macro_indicators` degraded since this morning. Check VPS proxy routing to `www.nso.gov.vn` via ops-vps-fetch agent.
4. **Disable Reuters RSS source record** — BUG-2, ~8 errors/hour from dead decommissioned source (~162 accumulated).
5. **Diagnose TE fetcher pre-CB failure** — BUG-3, both TE sources never succeed post-restart.
6. **Add startup zero-guard to vn-sbv-fetch** — ISSUE-1, prevents zero-value DB rejections.
7. **Add 12-min timeout to `intelligenceCycleJob.ts`** — ISSUE-3, kills runaway cycles.
8. **Fix doc examples in market-watcher.md** — IMPROVE-2/3: `get_ticker_intelligence` and `get_price_history` examples use wrong params (`ticker`/`tickers` instead of `code`).
