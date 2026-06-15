# Team MCP Tool Recheck — 2026-06-14 16:07 UTC

**Run by:** health-recheck agent (scheduled routine)
**Gateway:** `mcp__gateway__call_tool(server="vn-market", ...)`
**vn-market reachable:** YES (get_system_status OK, uptime ~18m at probe time)
**DB:** market.db 276.16 MB | WAL 3.69 MB
**Probes completed:** 16 tools probed; all prior findings re-executed fresh this cycle
**Prior report compared:** team-tool-recheck-2026-06-14-1408.md

---

## Tool Coverage — Probed This Cycle

| Tool | Probe Result | Notes |
|---|---|---|
| `get_system_status` | ✅ OK | BUG-01 re-confirmed (HNX/UPCOM errors every ~60s at 16:01–16:03 UTC) |
| `get_cycle_bootstrap` | ✅ OK | Requires `agent_name` (enum-validated); probe with `agent_name="news-scout"` succeeded |
| `get_market_snapshot` | ✅ OK | VN-Index 1791.65 (-0.39%), source_tier=2 |
| `get_macro_snapshot` | ✅ OK | Oil $87.33, Gold $4238.8, USD/VND 26122, carry spread NEUTRAL |
| `get_pipeline_health` | ✅ OK | BDI/DLC/JSH/SIS/VDC=0 rows (HNX/UPCOM tickers); all HOSE tickers 35–37 rows |
| `get_cron_health` | ✅ OK | BUG-02 re-confirmed; ISSUE-03 stable; IMPROVE-04 unchanged |
| `get_technical_indicators` | ⚠️ N/A | FPT: all indicators N/A (source_tier=3) — ISSUE-02 re-confirmed |
| `get_vps_proxy_health` | ✅ OK | bctc stale 16.5h (ISSUE-06 worsened, service healthy) |
| `get_vps_service_health` | ✅ OK | 3 healthy, 2 idle (market closed — expected) |
| `get_sla_status` | ✅ OK | 4 ok, 1 off-hours (news: design, market closed) — ISSUE-01 STILL RESOLVED |
| `task_claim` / `task_release` | ✅ OK | Claimed and released test lock cleanly |
| `task_list_held` | ✅ OK | 0 locks — ISSUE-05 STILL RESOLVED |
| `get_earnings_calendar` | ✅ OK | 41 tickers; 13 QUÁ HẠN, 28 ĐÃ NỘP |
| `get_alerts` | ✅ OK | 10 alerts; QA probe artifact still unread HIGH (IMPROVE-05 unchanged) |
| `get_rate_limit_status` | ✅ OK | 11/11 sources ready, 0 waiting |
| `emit_pressure_state` | ✅ OK (but doc stale) | Tool works; doc schema wrong — NEW IMPROVE-06 |

---

## ACTIVE Findings — Re-confirmed This Cycle

### BUG-01 — HNX/UPCOM all price sources failing (day 7+, unchanged)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Tool / Source** | `get_system_status` errors + `get_pipeline_health` 5 tickers 0 rows |
| **Re-probe this cycle** | `get_system_status` at 16:03 UTC: 10/10 unresolved errors = `[hnx] all HNX price sources failed` / `[hnx] all UPCOM price sources failed`, firing at 16:01, 16:02, 16:03 UTC (every ~60s). Circuit breaker `hnx` shows [OK] 0 failures — CB passes but fetches still fail. `get_pipeline_health` at 16:04: BDI/DLC/JSH/SIS/VDC = 0 rows, TA not ready. `get_vps_proxy_health`: prices last push 2026-06-12 08:59 (55h stale). |
| **Caller surface** | `grep -r "HNX\|UPCOM\|get_technical_indicators" docs/agents --include="*.md" -l` → `docs/agents/market-watcher/flow/cycle.md` (1 active caller). 5 tickers (BDI, DLC, JSH, SIS, VDC) unserviceable. |
| **Blast radius** | market-watcher: 5 tickers N/A every cycle. Error log polluted ~60 errors/hour. |
| **Status vs 1408** | UNCHANGED — same error pattern, same 5 tickers dead, same CB-misleading pattern. Day 7+ with no fix. |
| **Suggested fix** | Investigate `apps/stock-price/` HNX fetch path — API response format likely changed (all sources failing = shared parser, not single source). Add market-hours gate to skip HNX polling outside 02:00–09:00 UTC Mon–Fri to cut off-hours error noise. |

---

### BUG-02 — `vnstockFundamentalsRefresh` CRASHED (7 days unresolved, no re-trigger)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Cron** | `vnstockFundamentalsRefresh` |
| **Re-probe this cycle** | `get_cron_health` at 16:03 UTC: last_run=2026-06-08 01:00:00, last_status=`crashed`, success_rate=0.00 (0.0%), total_runs=1, avg_duration=4035883ms (~67 min). ZERO re-trigger attempts since crash. |
| **Caller surface** | Multiple callers: `bctc-analyst/flow/stage-analyze.md`, `market-analyst/flow/main.md`, `digest-predict/flow/monday.md`, `digest-predict/flow/monthly.md`, `qa-responder/flow/cycle.md`, `unified-agent` (via get_bctc_full). P/E, EPS, P/B stale for all 41 tickers since 2026-06-08. |
| **Blast radius** | bctc-analyst, market-analyst, digest-predict, qa-responder, unified-agent — all valuation ratio analyses degraded. ~5 active callers. |
| **Status vs 1408** | UNCHANGED — no re-trigger, no fix. Now 7 days since crash. |
| **Suggested fix** | Immediate: manually re-trigger `vnstockFundamentalsRefresh` via dev. Code fix: add per-ticker try/catch + 30s timeout in `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts`. Confirm ANSI escape-sequence sanitization applied before JSON parse. |

---

## ISSUE Findings — Active This Cycle

### ISSUE-02 — `get_technical_indicators` returns N/A for all indicators (TA service disconnect)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool** | `get_technical_indicators` |
| **Re-probe this cycle** | `get_technical_indicators(code="FPT")` at 16:06 UTC: MA5/MA20/MA50/RSI14/MACD/BB20 all N/A, source_tier=3, "cần tối thiểu 15/20/34/50 nến". `get_pipeline_health` at 16:04: FPT=37 rows, RSI14=48.0, TA ready. Disconnect confirmed for 7+ days. |
| **Caller surface** | 1 active caller: `docs/agents/market-watcher/flow/cycle.md` (every market cycle). |
| **Blast radius** | market-watcher: zero TA confirmation signals every cycle. RSI/MACD/BB anomaly detection blind during all market hours. |
| **Status vs 1408** | UNCHANGED |
| **Suggested fix** | TA service (port 5003) reads different OHLCV store than `daily_ohlcv`. Confirm `ta-ohlcv-backfill` targets correct shared volume path. Interim fix: when source_tier=3 AND `get_pipeline_health` rows≥15, compute RSI14 client-side from `get_price_history`. |

---

### ISSUE-03 — `bctcReparseJob` success rate below 80% threshold

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Cron** | `bctcReparseJob` |
| **Re-probe this cycle** | `get_cron_health` at 16:03 UTC: success_rate=0.79 (78.9%), total_runs=185. Prior 1408: 78.8%, 184 runs. Delta: 1 new run at 15:45 UTC (succeeded). Rate ticked 78.8%→78.9%. avg_duration=362892ms (~6 min). |
| **Caller surface** | `bctc-analyst/flow/main.md` (ESC-5 gate), `refine_bctc_md/flow/main.md`, `ops/flow/bctc.md`. Multiple active callers. |
| **Blast radius** | bctc-analyst ESC-5 gate returns false negatives when reparse fails. refine_bctc_md starved. |
| **Status vs 1408** | SLIGHTLY IMPROVED (78.8%→78.9%, last 3 runs 100%). Still below 80% threshold. |
| **Suggested fix** | Root cause: PDF extraction quality. Investigate pdf-extractor container for PPC/PLX/DAG OCR failures. Confirm `cronHealthAlertJob` threshold covers bctcReparseJob. |

---

### ISSUE-06 — BCTC VPS push stale (16.5h, service healthy — weekend content drought)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Tool** | `get_vps_proxy_health` |
| **Re-probe this cycle** | `get_vps_proxy_health` at 16:03 UTC: bctc last_push=2026-06-13 23:45:12, 0 pushes in 24h, Stale=YES. Duration now 16.5h (was 14.3h at 1408). `get_vps_service_health`: vn-bctc-fetch=**healthy** (responding). `get_system_status`: bctcQueueEnricher 0 URLs for VEA, VNH, VDC, SIS — `"0 URLs populated across all 9 items"`. |
| **Caller surface** | bctc-analyst pipeline → PDF pull → reparseJob → get_bctc_full/get_bctc_refined. |
| **Blast radius** | If a company files on Sunday (unusual), missed until next push. Risk LOW (weekend). |
| **Status vs 1408** | Duration WORSENED (14.3h→16.5h). Root cause unchanged: service healthy, SSC portal inactive on Sunday. Self-resolves Monday at market open. |
| **Suggested fix** | Monitor Mon 02:00 UTC — if still 0 pushes at market open, trigger `trigger_bctc_vps_fetch`. Add weekend-aware staleness annotation to `get_vps_proxy_health`. |

---

## RESOLVED Findings — Re-probed This Cycle, Still Not Reproducing

### ISSUE-01 — News SLA breach — STILL RESOLVED ✅

| Field | Value |
|---|---|
| **Re-probe** | `get_sla_status` at 16:05 UTC: news=off-hours (design, market closed Sunday), 4/4 sources ok. |
| **Status** | Remains resolved. |

### ISSUE-05 — Orphaned expired task lock — STILL RESOLVED ✅

| Field | Value |
|---|---|
| **Re-probe** | `task_list_held(expired=true)` at 16:06 UTC: `{"locks":[],"count":0}`. |
| **Status** | Remains clean. |

---

## IMPROVE (Low Priority)

### IMPROVE-04 — `macroIndicatorRefreshJob_FAILTEST` test artifact in production scheduler

| Field | Value |
|---|---|
| **Re-probe** | `get_cron_health` at 16:03 UTC: still present, last_run=2026-06-08 02:37:17, 1 run, success. |
| **Impact** | Zero operational impact. Noise in cron registry. |
| **Suggested fix** | Remove from `apps/mcp-server/src/scheduler/`. Update `docs/data/project-stats.json` cronJobCount. |

---

### IMPROVE-05 — QA test alert artifact unread HIGH in production (unchanged)

| Field | Value |
|---|---|
| **Re-probe** | `get_alerts(limit=10)` at 16:06 UTC: `[HIGH] 2026-06-13T07:59 VCB — "QA Gate-3 live co-write probe"` (id: `qa-gate3-probe-1781337593868`) still unread. |
| **Impact** | Pollutes alert history; unread HIGH could skew alert stats. |
| **Suggested fix** | QA agent should mark its probe alerts read on completion. Or filter `qa-gate3-*` prefix from production alert stats. |

---

### IMPROVE-06 — `emit_pressure_state` tool doc schema stale (NEW this cycle)

| Field | Value |
|---|---|
| **Class** | IMPROVE |
| **Tool** | `emit_pressure_state` |
| **Evidence** | `docs/agents/tools/list/emit_pressure_state.md` documents param `state` (string: "normal\|high\|critical"). Actual caller in `docs/agents/cowork-team/flow/telemetry.md` (Step 6.0, mandatory, un-skippable) passes: `{calendar_status, tick_id, fire_time, pressure_mode, last_regime, last_volatility_level}`. Probed with wrong params `{source, dry_run}` → returned `{success: true}`. Probed with `{state: "normal"}` → also `{success: true}`. Tool accepts any params; doc is outdated. |
| **Caller surface verification** | `grep -r "emit_pressure_state" docs/agents --include="*.md" -l` → `docs/agents/cowork-team/flow/telemetry.md` (1 caller, Step 6.0). Caller uses extended params (correct). Zero callers use the doc's `state` param. |
| **Impact** | Low — tool works. Doc misleads new agent authors; anyone adding an emit_pressure_state call from the doc alone would pass wrong params. |
| **Suggested fix** | Update `docs/agents/tools/list/emit_pressure_state.md` to document actual params: `calendar_status`, `tick_id`, `fire_time`, `pressure_mode`, `last_regime`, `last_volatility_level` (all optional, tool is permissive). |

---

### IMPROVE-07 — `chef.md` Step 0 GATHER uses `agent_id` (wrong param name, doc drift, NEW this cycle)

| Field | Value |
|---|---|
| **Class** | IMPROVE |
| **File** | `docs/agents/unified-agent/flow/chef.md` line 63 |
| **Evidence** | Line 63: "Call `get_cycle_bootstrap(agent_id="unified-agent")` first." — but `get_cycle_bootstrap` requires `agent_name` (enum-validated). Probe confirmed: `{agent_id: "unified-agent"}` → schema error `Required: agent_name`. |
| **Caller surface verification** | Step 0 (line 22) delegates to `.claude/skills/cycle-bootstrap/SKILL.md`, which correctly uses `agent_name="<agent-id>"`. The line 63 description is inline documentation in the GATHER step that contradicts the skill. No direct code call in chef.md bypasses the skill — the functional path is correct. |
| **Impact** | Low — execution path (through skill) is correct. Documentation inconsistency could mislead reviewers or agents that follow line 63 literally instead of the Step 0 skill reference. |
| **Suggested fix** | Update `chef.md` line 63: change `agent_id="unified-agent"` → `agent_name="unified-agent"` to match the live schema. |

---

## Summary Table

| ID | Class | Tool / Cron | Status | Callers Affected |
|---|---|---|---|---|
| BUG-01 | BUG | HNX/UPCOM price sources all failing | UNCHANGED (day 7+) | market-watcher (5 tickers N/A) |
| BUG-02 | BUG | `vnstockFundamentalsRefresh` crashed | UNCHANGED (day 7, no re-trigger) | bctc-analyst, market-analyst, digest-predict, qa-responder, unified-agent |
| ISSUE-01 | — | News SLA breach | **STILL RESOLVED** ✅ | — |
| ISSUE-02 | ISSUE | `get_technical_indicators` all N/A | UNCHANGED | market-watcher (all market cycles) |
| ISSUE-03 | ISSUE | `bctcReparseJob` success rate 78.9% | SLIGHTLY IMPROVED ↑ (78.8→78.9%, last 3 runs ok) | bctc-analyst, refine_bctc_md |
| ISSUE-05 | — | Orphaned task lock | **STILL RESOLVED** ✅ | — |
| ISSUE-06 | ISSUE | BCTC VPS push stale 16.5h | Duration WORSENED ↑ (14.3h→16.5h), severity LOW (weekend, service healthy) | bctc-analyst / PDF pipeline |
| IMPROVE-04 | IMPROVE | `macroIndicatorRefreshJob_FAILTEST` | UNCHANGED | cronHealthAlert noise only |
| IMPROVE-05 | IMPROVE | QA test alert artifact unread | UNCHANGED | alert stats (minor) |
| IMPROVE-06 | IMPROVE | `emit_pressure_state` doc schema stale | NEW this cycle | new agent authors (doc mislead) |
| IMPROVE-07 | IMPROVE | `chef.md` `agent_id` param drift | NEW this cycle | unified-agent review path |

**Active BUGs:** 2 | **Active ISSUEs:** 3 | **Resolved (still):** 2 | **New this cycle:** IMPROVE-06, IMPROVE-07

**Overall system verdict: DEGRADED** — BUG-01 (HNX/UPCOM) fires ~60 errors/hr with zero fix after 7 days. BUG-02 (vnstockFundamentalsRefresh crash) has degraded valuation analysis for 5 agents, now 7 days without re-trigger. ISSUE-02 (get_technical_indicators) blinds market-watcher every cycle. ISSUE-03 stabilizing (last 3 runs succeeded). ISSUE-06 expected to self-resolve at Mon 02:00 UTC market open. Two new doc-drift IMPROVE items identified.

---

## Gateway Transport Health

Gateway `mcp__gateway__call_tool` is operational. 16/16 tool probes reachable. vn-market uptime ~18m at probe time (fresh restart expected per daily cadence). Transport healthy — no BLOCKED status.
