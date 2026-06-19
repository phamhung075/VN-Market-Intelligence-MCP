# Team MCP Tool Health Recheck — 2026-06-18T14:10Z

**Cycle:** 2026-06-18T14:10Z
**Agent:** health-recheck routine
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)` — REACHABLE ✅
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-18-1208.md`

---

## Executive Summary

**2 P0 BUGs ongoing** (BCTC VPS now 2485 min SLA breach — worsened from 2363 at 12:08).
**1 P1 BUG ongoing** (`get_insider_signals` requires both `code` + `outstandingShares`, breaking 2 callers).
**1 P1 BUG confirmed new** (`get_agent_signals` from_agent=null pattern missing required `agent` — 3 non-fatal call sites).
**1 RESOLVED** since 12:08: `chef.md:91` `agent_id` → `agent_name` fix is live.
SBV zero-value rejections, ISM no_data, Reuters/TE stopped, WTI/DJIA stale, vnstock 80% — all ongoing.

---

## STEP 3c — Prior-Finding Delta (All Re-probed This Cycle)

| Finding ID | Prior Class | Delta | Evidence |
|-----------|-------------|-------|----------|
| BUG-1/BUG-2 | BUG P0 | **WORSENED** | bctc SLA: 2485 min elapsed (was 2363 at 12:08); last push still 2026-06-16 18:02 |
| BUG-NEW-A | BUG P1 | **ONGOING** | Re-probed: `get_insider_signals({ticker:"VCB"})` → required `code` + `outstandingShares` both missing |
| ISSUE-SBV | ISSUE P1 | **ONGOING** | System errors: 4 rejections today at 12:29, 12:59, 13:29, 13:59 UTC |
| ISSUE-N1 | ISSUE P1 | **✅ RESOLVED** | `grep agent_id chef.md:91` → now `agent_name="unified-agent"` (fix is live) |
| ISSUE-ISM | ISSUE P1 | **ONGOING** | Re-probed: `get_ism_subcomponents` → `{"error":"no_data"}` confirmed |
| ISSUE-Reuters | ISSUE P2 | **ONGOING** | Reuters: 178 failures; TE×2: 178/179 — all "Ngưng", never connected |
| ISSUE-BDI | ISSUE P2 | **ONGOING** | System status: BDI last data 2026-04-07 (structural stale) |
| ISSUE-WTI | ISSUE P2 | **ONGOING** | System status: `wti_crude_usd 95.5` (vs live Brent $77.81 — impossible) |
| ISSUE-DJIA | ISSUE P2 | **ONGOING** | System status: `dow_jones 23750` (COVID 2020-era value) |
| ISSUE-vnstock | ISSUE P2 | **ONGOING** | `get_cron_health`: vnstockTradingStatsRefresh 80.0% success, 5 runs, avg 768s |
| IMPROVE-NEW-F (TG delete) | IMPROVE | **NOT IN TOP-10** | deleteTelegramBug absent from current 10-error window; unconfirmed resolved |
| IMPROVE-6 | IMPROVE | **ONGOING** | No code change detected; bootstrap enum unchanged |
| IMPROVE-N3 | IMPROVE | **ONGOING** | bctcReparseJob: 87.0% success rate (131 runs) — stable |
| IMPROVE-EVN | IMPROVE | **ONGOING** | Not re-probed this cycle; no fix landed |
| IMPROVE-FF | IMPROVE | **ONGOING** | get_foreign_flow doc shows `code` required — matches live schema; doc drift is minor |

---

## Active BUG Findings

### BUG-1/BUG-2 — BCTC VPS Pipeline CRITICAL (P0, WORSENED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P0 — Critical |
| **SLA breach** | 2485 min elapsed / 360 min threshold (WORSENED from 2363 at 12:08) |
| **Last push** | 2026-06-16 18:02:24 UTC (≈44h ago) |
| **24h pushes** | 0 |
| **VPS health** | `bctc` service: STALE; `get_sla_status` → `breached CRITICAL` |
| **Callers** | bctc-analyst, unified-agent, digest-predict, market-analyst, refine_bctc_md, ops — ≥5 callers |
| **Fix** | SSH to VPS → `systemctl status vn-bctc-fetch` / `journalctl -u vn-bctc-fetch -n 50`; restart + monitor 24h push recovery |

### BUG-NEW-A — `get_insider_signals` Schema Mismatch (P1, ONGOING)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P1 |
| **Re-probe** | `get_insider_signals({ticker:"VCB"})` → requires `code` (not `ticker`) AND `outstandingShares: number` |
| **Doc contract** | `docs/agents/tools/list/get_insider_signals.md` marks `outstandingShares` optional (auto-fetch from DB) |
| **Callers** | market-watcher `eod.md`, bctc-analyst `stage-analyze.md` — **2 callers** |
| **Grep** | `grep -rn "get_insider_signals" docs/agents/*/flow/*.md` → 2 files |
| **Fix** | Option A (preferred): restore auto-fetch in live schema (make `outstandingShares` optional). Option B: update callers to pass `outstandingShares`. |

### BUG-NEW-C — `get_agent_signals` from_agent=null Pattern Broken (P2, NEW)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Severity** | P2 — Degraded functionality (non-fatal paths) |
| **Re-probe** | `get_agent_signals({"from_agent":null,"status":"all","hours_back":0.25})` → validation error: `agent` required |
| **Affected callers** | 3 call sites in 2 files — all non-fatal |
| **Grep** | `grep -rn "from_agent.*null" docs/agents/**/*.md` → `market-watcher/flow/main.md:54`, `news-scout/flow/stage-bootstrap.md:57` |
| **Details** | (1) `market-watcher/flow/main.md:53-57` — sibling gateway corroboration (non-fatal; falls back to single-probe result). (2) `news-scout/flow/stage-bootstrap.md:43-47` — `SELF_SIGNALS_CACHE` with `from_agent:"news-scout"` but no `agent` (non-fatal; feedback tuning disabled). (3) `news-scout/flow/stage-bootstrap.md:56-60` — `SIBLING_WINDOW_CACHE` with `from_agent:null` (non-fatal; cross-sibling dedup disabled). |
| **Impact** | Gateway corroboration guard partially blind; news-scout sibling dedup always falls to default thresholds; feedback acceptance-rate tuning never runs. Core signal reads use correct `agent:` param and are unaffected. |
| **Fix** | For sibling-window calls: add `agent: "<calling_agent>"` param (tool reads `from_agent` as sender filter, ignores `agent` for read-mark when `from_agent` set). Or: request server-side option for "all-receiver" query when only `from_agent` and `hours_back` provided. |

---

## Active ISSUE Findings

### ISSUE-SBV — SBV Zero-Value Injections Recurring (P1)

| Field | Value |
|-------|-------|
| **Evidence** | 4 rejections today: 12:29, 12:59, 13:29, 13:59 UTC — pattern is every 30 min |
| **Data guard** | Working correctly — DB not corrupted |
| **get_vn_liquidity_state** | sbv_rates: `"source":"sbv_rates DB fallback (HTML parse failed)"`, omo: `"blocked_reason":"OMO HTML parse: no add/absorb rows found"`, interbank: `100% packet loss on VPS` — multiple SBV sub-sources failing |
| **Callers** | get_macro_snapshot, get_vn_liquidity_state — **~2 callers** |
| **Fix** | Check VPS `/proxy/sbv` response body; likely SBV website HTML structure changed |

### ISSUE-ISM — get_ism_subcomponents Returns no_data (P1)

| Field | Value |
|-------|-------|
| **Evidence** | `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows"}` |
| **System errors** | `fredIsmSubcomponents: all 3 retries exhausted for NAPMBI — HTTP 400 Bad Request` |
| **Root cause** | FRED API NAPMBI series returning HTTP 400 — series ID may have changed or API key scope issue |
| **Callers** | news-scout (US monetary chain step), unified-agent — **2 callers** |
| **Fix** | Verify FRED_API_KEY env. Check NAPMBI series ID validity at fred.stlouisfed.org. May need series rename to ISM/NAPM equivalent. |

### ISSUE-Reuters — Reuters RSS + Trading Economics Never Connected (P2)

| Field | Value |
|-------|-------|
| **Evidence** | Reuters RSS: 178 consecutive errors, "Chưa bao giờ" last success; TE×2: 178/179 errors |
| **Caller blast radius** | `fetch_and_analyze` still returns 20 VN articles (VnExpress, CafeF active) — **0 critical cowork callers blocked** |
| **Fix** | Verify Reuters RSS URL (feed may have been deprecated); investigate TE geo-blocking or API key expiry |

### ISSUE-BDI — Baltic Dry Index Stale (P2)

| Field | Value |
|-------|-------|
| **Evidence** | System status: BDI last data 2026-04-07 (72d+ stale) |
| **Callers** | get_supply_chain_exposure — **1 caller** |
| **Fix** | Investigate BDI fetcher source; update endpoint or data provider |

### ISSUE-WTI — WTI Crude Stale at $95.5 (P2)

| Field | Value |
|-------|-------|
| **Evidence** | System status: `wti_crude_usd 95.5`; live Brent = $77.81 (WTI at $95.5 is physically impossible — $17+ premium) |
| **Callers** | get_macro_snapshot, get_energy_grid_signals — **~2 callers** |
| **Fix** | Force-refresh WTI from commodity feed; check fetcher parsing |

### ISSUE-DJIA — Dow Jones Stale at 23,750 (P2)

| Field | Value |
|-------|-------|
| **Evidence** | System status: `dow_jones 23750` (COVID 2020-era value; real ~42,000 in 2026) |
| **Callers** | get_macro_snapshot — **1 caller** |
| **Fix** | Force-refresh DJIA from Yahoo Finance or equivalent |

### ISSUE-vnstock — vnstockTradingStatsRefresh 80% Success (P2)

| Field | Value |
|-------|-------|
| **Evidence** | 80.0% success rate (5 runs), avg duration 768,321 ms (12.8 min) |
| **Callers** | get_market_snapshot, get_pipeline_health — **~2 callers** |
| **Fix** | Review failure logs; consider extending job timeout |

### ISSUE-BCTC-PAYLOAD — get_bctc_pending_refine Oversized Response (P2, NEW)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Evidence** | Response = 235,355 chars / 11,948 lines — exceeds MCP inline limit, auto-saved to temp file |
| **Callers** | refine_bctc_md agent, bctc-analyst — **~2 callers** |
| **Impact** | Agents that call this naively will get a file path instead of inline data; without offset/limit handling they read nothing |
| **Fix** | Add `limit` param to `get_bctc_pending_refine` (e.g. max 50 items per call); or paginate. Alternatively, update refine_bctc_md flow to use offset/limit loop. |

---

## Active IMPROVE Findings

### IMPROVE-6 — Bootstrap Deprecated Agent Enum

| Field | Value |
|-------|-------|
| **Evidence** | `get_cycle_bootstrap` enum still includes `financial-analyst`, `report-analyzer` (deprecated agents) |
| **Fix** | Prune deprecated values from bootstrap schema |

### IMPROVE-N3 — bctcReparseJob 87% Success Rate

| Field | Value |
|-------|-------|
| **Evidence** | 87.0% success (131 runs) — stable, 13% uninvestigated failures |
| **Fix** | Review reparse failure logs; categorize modes |

### IMPROVE-EVN — Energy Grid Using Estimate

| Field | Value |
|-------|-------|
| **Evidence** | `get_energy_grid_signals` returns `using_estimate: true, renewables_pct: 70` (EVN endpoint broken) |
| **Fix** | Investigate EVN endpoint URL; check for page structure change |

### IMPROVE-NEW-F — deleteTelegramBug Errors (Monitoring)

| Field | Value |
|-------|-------|
| **Evidence** | Absent from current 10-error window (was 9× at 11:39 UTC in 12:08 cycle) |
| **Status** | Possibly resolved or rotated out; not confirmed either way |

---

## RESOLVED Since Prior Cycle (12:08Z)

| Finding ID | Prior Class | Resolution |
|-----------|-------------|------------|
| ISSUE-N1 | ISSUE P1 | **RESOLVED** — `chef.md:91` now uses `agent_name="unified-agent"` (correct); `grep agent_id chef.md:91` returns no match |

---

## Full Probe Results Matrix (This Cycle)

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ PASS | Full context returned; 822 alerts pending; last analysis 13:37 |
| `get_market_snapshot` | ✅ PASS | VN-Index 1830.47 +1.34%; source_tier:2 |
| `get_macro_snapshot` | ✅ PASS | Live; wti_crude_usd stale at $95.5; djia stale at 23750 |
| `get_system_status` | ⚠️ DEGRADED | 10 unresolved errors; sbv rejections; intelligence-cycle skip; fredIsmSubcomponents HTTP 400 |
| `get_pipeline_health` | ✅ PASS | 41 tickers; 6 not TA-ready (BDI/DAG/DLC/JSH/SIS/VDC) |
| `get_cron_health` | ✅ PASS | Most 99-100%; vnstockTradingStatsRefresh 80% |
| `get_sla_status` | ❌ BREACHED | bctc: 2485 min / 360 threshold — CRITICAL |
| `get_vps_proxy_health` | ⚠️ DEGRADED | bctc STALE (0 pushes/24h); sbv zero-value pattern ongoing |
| `get_earnings_calendar` | ✅ PASS | 11 QUÁ HẠN, 30 ĐÃ NỘP |
| `get_watchlist` | ✅ PASS | 41 tickers |
| `get_market_breadth` | ✅ PASS | 90↑/205↓/60— ; liquidity 17,429 tỷ (-27.9%) |
| `get_vn_macro_indicators` | ✅ PASS | IIP June: +3.3% YoY |
| `get_vn_liquidity_state` | ⚠️ PARTIAL | sbv_rates: DB fallback (HTML parse failed); sjc_gap absent; OMO blocked; interbank 100% packet loss on VPS |
| `get_fed_liquidity_spread` | ✅ PASS | EFFR 3.63; spread -0.02pp; source_tier:1 |
| `get_ism_subcomponents` | ❌ FAIL | no_data — FRED NAPMBI HTTP 400 |
| `fetch_and_analyze` | ✅ PASS | 20 VN articles; CafeF/VnExpress active |
| `get_technical_indicators(code="VCB")` | ✅ PASS | source_tier:3; neutral |
| `get_market_snapshot(codes=["VCB","FPT"])` | ✅ PASS | Per-ticker prices returned |
| `get_foreign_flow(code="VCB")` | ✅ PASS | Returns signal; 5 days data; requires `code` param |
| `get_market_foreign_flow` | ✅ PASS | All zeros expected (market closed 14:04 UTC) |
| `get_agent_signals(agent="market-watcher",hours_back=1)` | ✅ PASS | No new signals |
| `get_agent_signals({from_agent:null,status:"all",hours_back:0.25})` | ❌ FAIL | `agent` required — 3 call sites in flow files broken |
| `get_insider_signals({ticker:"VCB"})` | ❌ FAIL | Requires `code` (not `ticker`) + `outstandingShares: number` |
| `task_claim` schema | ✅ SCHEMA OK | Enum: cowork-slot/sprint-task/dashboard-row/commit-mutex |
| `post_agent_signal` schema | ✅ SCHEMA OK | Required: to_agent, signal_type (enum 11 values), payload |
| `get_bctc_pending_refine` | ⚠️ OVERSIZED | 235,355 chars — exceeds inline limit; auto-saved to file |
| `get_bctc_pending_refine` was not read from file | — | File read skipped (write-side risk; this is a read-only probe run) |
| `get_earnings_calendar` | ✅ PASS | Calendar data intact |
| `get_recent_signals` | ❌ NOT FOUND | Tool does not exist in live schema; no callers reference it in docs/agents |

---

## Priority Action List

| Priority | Action | Owner | Finding |
|----------|--------|-------|---------|
| **P0** | SSH to VPS → check `vn-bctc-fetch` status/logs → restart | ops / dev-vps-crawls | BUG-1/2 |
| **P0** | Investigate SBV zero-value parse; check VPS `/proxy/sbv` response body | dev-vps-crawls | ISSUE-SBV |
| **P1** | Fix `get_insider_signals`: restore `outstandingShares` as optional (auto-fetch from DB) | dev-mcp-server | BUG-NEW-A |
| **P1** | Fix `get_agent_signals` from_agent=null calls: add `agent:"<caller>"` to 3 call sites in market-watcher/flow/main.md + news-scout/flow/stage-bootstrap.md | agent-father | BUG-NEW-C |
| **P1** | Investigate FRED NAPMBI HTTP 400: check series ID + FRED_API_KEY env | dev-macro-indicators | ISSUE-ISM |
| **P2** | Add `limit` param to `get_bctc_pending_refine` or paginate callers | dev-mcp-server | ISSUE-BCTC-PAYLOAD |
| **P2** | Force-refresh WTI crude ($95.5 stale → fix fetcher) | dev-macro-indicators | ISSUE-WTI |
| **P2** | Force-refresh DJIA (23,750 → 2020-era stale → fix fetcher) | dev-macro-indicators | ISSUE-DJIA |
| **P2** | Investigate Reuters RSS deprecation; TE connection failures | dev-mainserver-crawls | ISSUE-Reuters |
| **P2** | Investigate BDI fetcher (72d stale) | dev-mainserver-crawls | ISSUE-BDI |
| **P2** | Review vnstockTradingStatsRefresh failure modes (80% success, 12.8 min avg) | dev-stock-price | ISSUE-vnstock |
| **P3** | Prune deprecated enum from get_cycle_bootstrap (financial-analyst, report-analyzer) | dev-mcp-server | IMPROVE-6 |
| **P3** | Investigate bctcReparseJob 13% failure modes | dev-pdf-extractor | IMPROVE-N3 |
| **P3** | Fix EVN endpoint for energy grid signals | dev-mainserver-crawls | IMPROVE-EVN |

---

## Report Metadata

| Field | Value |
|-------|-------|
| Report path | `docs/agent-memory/health/team-tool-recheck-2026-06-18-1410.md` |
| Prior report | `docs/agent-memory/health/team-tool-recheck-2026-06-18-1208.md` |
| Probes run | 28 tools |
| PASS | 18 |
| FAIL/DEGRADED | 10 |
| Active P0 BUGs | 2 (BUG-1/2) |
| Active P1 BUGs | 2 (BUG-NEW-A, BUG-NEW-C) |
| Active ISSUEs | 8 |
| Active IMPROVEs | 4 |
| Resolved since 12:08 | 1 (ISSUE-N1 chef.md agent_id) |
