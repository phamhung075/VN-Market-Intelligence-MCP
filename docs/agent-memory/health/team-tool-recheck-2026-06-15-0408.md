# Team MCP Tool Recheck — 2026-06-15T04:08Z

**Run by:** health-recheck agent (scheduled)
**Gateway:** vn-market confirmed reachable at run start
**Market window:** VN market OPEN (02:00–08:59 UTC) at probe time

---

## Probe Summary — All Tools Tested This Cycle

| Tool | Reachable | Result |
|------|-----------|--------|
| `get_cycle_bootstrap` | ✅ | OK — requires `agent_name` param |
| `get_system_status` | ✅ | OK — exposes active issues (see below) |
| `get_watchlist` | ✅ | OK — 41 tickers |
| `get_market_snapshot` | ✅ | OK — source_tier 2 |
| `get_macro_snapshot` | ✅ | OK — all signals present |
| `get_earnings_calendar` | ✅ | OK — 41 entries |
| `get_cron_health` | ✅ | OK — see bctcReparseJob below |
| `get_market_foreign_flow` | ✅ | OK — no args required |
| `get_foreign_flow` (with `code`) | ✅ | OK — `code` param required |
| `get_foreign_flow` (empty args) | ❌ | FAIL — "code Required" |
| `emit_pressure_state` | ✅ | OK |
| `task_claim` | ✅ | OK — enum: cowork-slot/sprint-task/dashboard-row/commit-mutex |
| `task_heartbeat` | ✅ | OK |
| `task_release` | ✅ | OK |
| `get_bctc_refined` | ✅ | OK — returns empty gracefully |
| `get_bctc_pending_refine` | ✅ | OK — 3 PDFs pending (VCB/HPG/GVR) |
| `get_pipeline_health` | ✅ | OK — 5 tickers 0-row TA gap |
| `get_market_context` | ✅ | OK |
| `get_sla_status` | ✅ | BCTC SLA BREACHED (1327min vs 120min) |
| `get_vps_proxy_health` | ✅ | BCTC proxy STALE |
| `get_vps_service_health` | ✅ | All 5 services healthy |
| `get_ticker_intelligence` (empty args) | ❌ | FAIL — "code Required" |
| `get_ticker_intelligence` (with `code`) | ✅ | OK per market-watcher pattern |
| `get_news` | ❌ | FAIL — "Tool get_news not found" |
| `post_agent_signal` | ✅ | OK — strict enum on signal_type |
| `log_agent_work` | ✅ | OK — requires `agent_name` + `status` |

---

## ACTIVE Findings (re-confirmed this cycle)

### BUG-1 — `get_foreign_flow`: fb-market-poster calls with empty args → runtime crash

| Field | Detail |
|-------|--------|
| **Class** | BUG |
| **Tool** | `get_foreign_flow` |
| **Evidence** | Probe `get_foreign_flow({})` → `MCP error -32602: "code": "Required"`. Probe `get_foreign_flow({"code": "VCB"})` → success. Grep: `grep "get_foreign_flow.*arguments.*{}" docs/agents/**/*.md` → 2 callers. |
| **Caller count** | **2 affected callers** (both fb-market-poster): `docs/agents/fb-market-poster/flow/main.md:78` and `docs/agents/tools/package/fb-market-poster.md:55` |
| **Root cause** | fb-market-poster package doc (`fb-market-poster.md:48`) says param is "(none required)" — incorrect. Live schema requires `code: string`. Additionally, canonical SSOT doc `docs/agents/tools/list/get_foreign_flow.md` names the param `ticker` (wrong — live schema is `code`). Triple mismatch: live=`code`, SSOT doc=`ticker`, callers=none. |
| **Suggested fix** | (1) Fix `docs/agents/tools/list/get_foreign_flow.md`: rename param `ticker` → `code`. (2) Fix `docs/agents/tools/package/fb-market-poster.md:48-55`: mark `code` required, change usage pattern to `arguments={"code": "<ticker>"}` or route to `get_market_foreign_flow` instead (no args required, returns market-wide summary). (3) Fix `docs/agents/fb-market-poster/flow/main.md:78` accordingly. |

---

### BUG-2 — `get_ticker_intelligence`: fb-market-poster calls with empty args → runtime crash

| Field | Detail |
|-------|--------|
| **Class** | BUG |
| **Tool** | `get_ticker_intelligence` |
| **Evidence** | Probe `get_ticker_intelligence({})` → `MCP error -32602: "code": "Required"`. market-watcher flow correctly calls with `code` param. Grep callers: `docs/agents/tools/package/market-watcher.md:39` → `code: string` (correct); `docs/agents/tools/package/fb-market-poster.md:49` → "(none required)" (wrong); `docs/agents/fb-market-poster/flow/main.md:81` → `arguments={}` (wrong). |
| **Caller count** | **2 affected callers** (fb-market-poster): `docs/agents/fb-market-poster/flow/main.md:81` and `docs/agents/tools/package/fb-market-poster.md:56` |
| **Root cause** | fb-market-poster package doc authored with incorrect assumption that `get_ticker_intelligence` is market-wide (no args). It is per-ticker only. market-watcher correctly documents and uses `code: string`. |
| **Suggested fix** | fb-market-poster likely wants a market-wide mover summary. Options: (a) replace with `get_market_snapshot` + `get_market_foreign_flow` for the movers context, or (b) call `get_ticker_intelligence(code=ticker)` per watchlist ticker in a loop. Update both `fb-market-poster.md` package doc and `flow/main.md`. |

---

### BUG-3 — `ta_bb_breakout_down` alerts firing with `giá 0` at market open

| Field | Detail |
|-------|--------|
| **Class** | BUG |
| **Tool** | `get_alerts` (consumer) / `bbAlertScanJob` (producer at `apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts`) |
| **Evidence** | `get_system_status` and `get_market_context` both show active alerts at 02:15 UTC (market open) with zero price: `VRE: giá 0 dưới BB dưới 15751`, `MWG: giá 0 dưới BB dưới 40058`, `MBB: giá 0 dưới BB dưới 12795`, `GAS: giá 0 dưới BB dưới 43069`. Also `VIC: giá 196 dưới BB dưới 61095` (BB lower band 61,095 vs actual price ~192,700 VND — implausible scale). All fired exactly at 02:15 UTC (3rd scan after open). |
| **Caller count** | alert-commander reads `get_alerts()` every cycle and processes these false signals → potential false Telegram posts to MARKET channel |
| **Root cause** | `bbAlertScanJob` fires at market open before price data is populated (race condition). When price is 0 or stale, the BB lower band comparison succeeds spuriously. The VIC case may be a unit-scale mismatch (raw VND vs thousands). Test file exists: `apps/mcp-server/src/__tests__/1309-bb-alert-scan-job.test.ts`. |
| **Suggested fix** | In `bbAlertScanJob.ts`: guard `if (price === 0 \|\| price === null) skip_alert`. For the VIC scale issue: verify that BB band computation uses the same price unit as the comparison price. Consider a warm-up delay: skip BB breakout alerts in first 5 minutes of market open. |

---

### ISSUE-1 — BCTC SLA breached CRITICAL + VPS BCTC proxy stale 40+ hours

| Field | Detail |
|-------|--------|
| **Class** | ISSUE |
| **Evidence** | `get_sla_status` → `bctc: age=1327min, SLA=120min, status=BREACHED, severity=CRITICAL`. `get_vps_proxy_health` → `bctc: last push 2026-06-13 23:45:12, 24h pushes=0, STALE`. `get_pipeline_health` → `bctcReparseJob success_rate=79.7%` (below 90% threshold), avg_duration=345s. `get_bctc_pending_refine` → 3 PDFs stuck in PENDING: VCB Q1-2025 (54 pages), HPG Q4-2025 (24 pages), GVR Q1-2026 (80 pages). VPS service `vn-bctc-fetch` reports "healthy" but has pushed 0 items in 24h — contradiction. |
| **Caller count** | bctc-analyst, refine_bctc_md (3 PDFs blocked), system-auditor |
| **Suggested fix** | (1) Investigate why `vn-bctc-fetch` VPS service is "healthy" but not pushing — may be a silent job-level failure inside the service. SSH or restart `vn-bctc-fetch`. (2) Investigate `bctcReparseJob` 79.7% failure rate — check error logs. (3) If VPS push resumes, 3 pending BCTC PDFs should automatically flow through refine pipeline. |

---

### ISSUE-2 — Reuters RSS dead: 66 consecutive failures, never succeeded

| Field | Detail |
|-------|--------|
| **Class** | ISSUE |
| **Evidence** | `get_system_status` source health → `Reuters RSS: Ngưng (stopped), 66 consecutive failures, last success: never`. Circuit breaker shows `reuters: OK failures:0` — indicating CB is not tripping despite RSS failures (different endpoint tracked). |
| **Caller count** | news-scout (Reuters is a news feed source), market-watcher |
| **Suggested fix** | Check Reuters RSS URL validity/format change. If endpoint is permanently unavailable, remove from source list to clean up error noise. |

---

### ISSUE-3 — Trading Economics dead: 66-67 consecutive failures, never succeeded

| Field | Detail |
|-------|--------|
| **Class** | ISSUE |
| **Evidence** | `get_system_status` source health → `Trading Economics: Ngưng, 66 failures` and `Trading Economics: Ngưng, 67 failures` (two endpoints). Last success: never. |
| **Caller count** | macro-indicators data pipeline, market-watcher (macro data) |
| **Suggested fix** | Trading Economics may have changed API format or requires new authentication. Check scraper code in `apps/mcp-server`. Consider fallback to IMF or World Bank for macro data (both circuit breakers show OK). |

---

### ISSUE-4 — Foreign flow primary endpoint failing every minute (error noise)

| Field | Detail |
|-------|--------|
| **Class** | ISSUE |
| **Evidence** | `get_system_status` recent errors (10 unresolved): `[WARN] foreign-flow-job: [foreign-flow-job] fallback activated`, `[WARN] foreign-flow-job: [foreign-flow-job] all fallbacks exhausted` — every minute at :01, :02, :03. VPS backup IS delivering data (102 items/min per `get_vps_proxy_health`), so actual foreign flow data is OK. But primary endpoint is dead and exhausting all fallbacks, polluting the error log and masking real issues. |
| **Caller count** | foreign-flow data pipeline; error noise masks true anomalies in `get_system_status` |
| **Suggested fix** | Identify and fix or disable the dead primary foreign-flow endpoint. If VPS bridge is the canonical source, remove the now-dead primary to stop log pollution. |

---

### ISSUE-5 — 5 watchlist tickers with 0 OHLCV rows: TA not ready

| Field | Detail |
|-------|--------|
| **Class** | ISSUE |
| **Evidence** | `get_pipeline_health` → `BDI: rows=0`, `DLC: rows=0`, `JSH: rows=0`, `SIS: rows=0`, `VDC: rows=0` — all tagged "TA not ready". These tickers are in the watchlist (HNX/UPCOM exchange listed) but price fetches show "N/A". |
| **Caller count** | alert-commander (no TA alerts possible for these tickers), market-watcher, technical analysis pipeline |
| **Suggested fix** | Verify that these tickers are actively traded and correctly configured in the price fetcher. UPCOM/HNX tickers may have a different fetch path. If tickers are illiquid/delisted, remove from watchlist. |

---

## IMPROVE Findings

### IMPROVE-1 — Tool doc `get_foreign_flow.md` has wrong parameter name

- SSOT doc `docs/agents/tools/list/get_foreign_flow.md` says param name = `ticker`
- Live schema requires `code` (confirmed by error message path: `["code"]`)
- Fix: rename `ticker` → `code` in the doc
- Grep run: `grep -r "ticker" docs/agents/tools/list/get_foreign_flow.md` → confirmed mismatch

### IMPROVE-2 — `get_news` tool does not exist

- Probe: `get_news({})` → "Tool get_news not found"
- Grep: no `get_news` references in agent flow files — no callers affected
- The news pipeline uses `pollNewsJob` / `newsHeadlinesRefreshJob` internally and exposes data via `get_market_context`/`get_cycle_bootstrap`
- Classify as NON-ISSUE for callers (0 affected), but worth noting the tool name is absent if ever referenced

---

## No Prior Cycle Findings to Carry Forward

This is the first health-recheck run for this UTC date. No carry-forward items.

---

## Healthy Tools (probe passed, no issues)

`get_cycle_bootstrap` · `get_system_status` · `get_watchlist` · `get_market_snapshot` · `get_macro_snapshot` · `get_earnings_calendar` · `get_market_foreign_flow` · `emit_pressure_state` · `task_claim` · `task_heartbeat` · `task_release` · `get_bctc_refined` · `get_bctc_pending_refine` · `get_pipeline_health` · `get_market_context` · `get_sla_status` · `get_vps_proxy_health` · `get_vps_service_health` · `log_agent_work` · `post_agent_signal` · `get_cron_health`

---

## Active Finding Count

| Class | Count | With ≥1 affected caller |
|-------|-------|-------------------------|
| BUG | 3 | 3 |
| ISSUE | 5 | 5 |
| IMPROVE | 2 | 0 (IMPROVE-2: 0 callers) |

**Telegram alert sent:** yes — to `bug` channel (≥1 re-confirmed BUG + ISSUE with affected callers)
