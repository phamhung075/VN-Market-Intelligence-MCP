# Team MCP Tool Recheck — 2026-06-15T06:08Z

**Run by:** health-recheck agent (scheduled)
**Gateway:** vn-market confirmed reachable (call_tool probe success)
**Market window:** VN market OPEN (02:00–08:59 UTC) at probe time (~06:04–06:08 UTC)
**Prior report:** `docs/agent-memory/health/team-tool-recheck-2026-06-15-0408.md`

---

## Tool Probe Summary — This Cycle

| Tool | Status | Notes |
|------|--------|-------|
| `get_system_status` | ✅ OK | Active WARN: Reuters/TE dead, foreign-flow noise |
| `get_cycle_bootstrap` | ✅ OK | Valid enum agent_name required |
| `get_week_period` | ✅ OK | W25, periodKey 2026-06-15/2026-06-21 |
| `get_market_snapshot` | ✅ OK | VN-Index 1792.40, source_tier 2 |
| `get_macro_snapshot` | ✅ OK | All signals present, live data |
| `get_cron_health` | ✅ OK | bctcReparseJob 79.9% borderline; see ISSUE-1 |
| `get_pipeline_health` | ✅ OK | 5 tickers 0-row; see ISSUE-5 |
| `get_sla_status` | ✅ OK | BCTC SLA 1447min CRITICAL; see ISSUE-1 |
| `get_vps_proxy_health` | ✅ OK | BCTC VPS stale since 2026-06-13 23:45 |
| `get_alerts` | ✅ OK | 20 alerts; false WARNING alerts confirmed (BUG-3/4) |
| `get_foreign_flow` (empty args) | ❌ FAIL | "code Required" — BUG-1 re-confirmed |
| `get_ticker_intelligence` (empty args) | ❌ FAIL | "code Required" — BUG-2 re-confirmed |
| `task_claim` | ✅ OK | Returns `{"claimed":true}` |
| `task_release` | ✅ OK | Returns `{"ok":true}` |
| `get_recent_fixes` | ✅ OK | No fix for any active finding (newest fix 2026-05-12) |

---

## ACTIVE Findings — Re-confirmed This Cycle

### BUG-1 — `get_foreign_flow` empty-args crash (fb-market-poster)

| Field | Detail |
|-------|--------|
| **Class** | BUG |
| **Status** | UNCHANGED from 04:08 report |
| **Tool** | `get_foreign_flow` |
| **Re-probe** | `get_foreign_flow({})` → `MCP error -32602: path["code"] "Required"` (06:05 UTC) |
| **Caller-surface grep** | `grep -r "get_foreign_flow" docs/agents --include="*.md" -l` → 4 files; broken callers: `docs/agents/fb-market-poster/flow/main.md:78` (`arguments={}`), `docs/agents/tools/package/fb-market-poster.md:55` (`arguments={}`) |
| **Caller count** | **2 affected callers** |
| **Root cause** | fb-market-poster package doc marks param as "(none required)" — incorrect. Live schema requires `code: string`. Also `docs/agents/tools/list/get_foreign_flow.md` names it `ticker` (wrong); live schema is `code`. Triple mismatch: live=`code`, SSOT doc=`ticker`, callers=`{}` (none). |
| **Suggested fix** | (1) Fix `docs/agents/tools/list/get_foreign_flow.md`: rename `ticker`→`code`. (2) Fix `fb-market-poster.md` package + `flow/main.md:78`: either use `get_market_foreign_flow` (no args, market-wide) or call per-ticker with `arguments={"code": "<ticker>"}`. |

---

### BUG-2 — `get_ticker_intelligence` empty-args crash (fb-market-poster)

| Field | Detail |
|-------|--------|
| **Class** | BUG |
| **Status** | UNCHANGED from 04:08 report |
| **Tool** | `get_ticker_intelligence` |
| **Re-probe** | `get_ticker_intelligence({})` → `MCP error -32602: path["code"] "Required"` (06:05 UTC) |
| **Caller-surface grep** | `grep -r "get_ticker_intelligence" docs/agents --include="*.md"` → broken callers: `docs/agents/fb-market-poster/flow/main.md:81` (`arguments={}`), `docs/agents/tools/package/fb-market-poster.md:56` (`arguments={}`) |
| **Caller count** | **2 affected callers** |
| **Root cause** | fb-market-poster package doc authored with wrong assumption that `get_ticker_intelligence` is market-wide (no args). It is per-ticker only. market-watcher correctly uses `code: string` (confirmed working). |
| **Suggested fix** | Replace with `get_market_snapshot` + `get_market_foreign_flow` for market-wide movers, or loop per watchlist ticker with `arguments={"code": ticker}`. Update both package doc and flow/main.md. |

---

### BUG-3 — `bbAlertScanJob` fires zero-price + price-scale-mismatch BB breakout alerts at market open

| Field | Detail |
|-------|--------|
| **Class** | BUG |
| **Status** | UNCHANGED — 6 new false alerts fired this morning |
| **Tool** | `get_alerts` (consumer) / `bbAlertScanJob` (producer) |
| **Re-probe** | `get_alerts({limit:20})` at 06:05 UTC confirms 6 false `ta_bb_breakout_down` alerts at 02:00-02:15 UTC today:<br>• VRE: `giá 0 dưới BB dưới 15751` (02:15)<br>• MWG: `giá 0 dưới BB dưới 40058` (02:15)<br>• MBB: `giá 0 dưới BB dưới 12795` (02:15)<br>• GAS: `giá 0 dưới BB dưới 43069` (02:15)<br>• VIC: `giá 196 dưới BB dưới 61,095` (02:00) — scale mismatch; actual price 191,800 VND at 06:08<br>• VHM: `giá 139 dưới BB dưới 45,312` (02:00) — scale mismatch; actual price 135,700 VND at 06:08 |
| **Root cause** | Race condition: `bbAlertScanJob` fires at VN market open (02:00 UTC) before price data lands. Zero-price tickers fail BB lower band comparison unconditionally. VIC/VHM show raw first-tick price in different units vs pre-computed BB bands. |
| **Caller count** | alert-commander reads `get_alerts()` every cycle; these false WARNINGs pollute the alert bus. |
| **Suggested fix** | In `bbAlertScanJob.ts`: guard `if (price === 0 \|\| price === null) skip_alert`. Verify BB bands use same VND unit as comparison price. Consider 5-min warm-up delay after 02:00 UTC open. Test: `apps/mcp-server/src/__tests__/1309-bb-alert-scan-job.test.ts` exists. |

---

### BUG-4 (NEW) — `taAlertScanJob` RSI oversold alerts with physically implausible values at market open

| Field | Detail |
|-------|--------|
| **Class** | BUG |
| **Status** | NEW this cycle (not in 04:08 report) |
| **Tool** | `get_alerts` (consumer) / `taAlertScanJob` (producer) |
| **Evidence** | `get_alerts({limit:20})` at 06:05 UTC shows 8 false `ta_oversold` alerts at 02:00-02:15 UTC today:<br>• MBB: RSI=3.7 (02:15)<br>• MWG: RSI=6.0 (02:15)<br>• VRE: RSI=10.3 (02:15)<br>• GAS: RSI=11.9 (02:15)<br>• VIC: RSI=7.4 (02:00)<br>• VHM: RSI=9.8 (02:00)<br>• VCI: RSI=29.8 (02:00)<br>• REE: RSI=24.4 (02:00)<br>`get_pipeline_health` at 06:05 UTC shows same stocks in normal range: MBB RSI=47.9, VIC RSI=34.8, VHM RSI=35.4, VRE RSI=39.5. RSI change of 40+ points in 4 hours is physically impossible for market-open data — RSI(14) cannot move that fast. |
| **Caller count** | alert-commander processes `ta_oversold` signals; 8 false WARNING alerts fired today |
| **Root cause** | Same race condition as BUG-3: `taAlertScanJob` fires at 02:00-02:15 UTC before price data populates. RSI computed on partial/stale data (e.g. all zeros = all losses = RSI→0). Separate code path from `bbAlertScanJob` but identical trigger timing. |
| **Suggested fix** | Same warm-up guard as BUG-3: in `taAlertScanJob.ts`, skip RSI evaluation if price is 0 or if `rows < N_min` at scan time. Or unify the open-guard into a shared market-open data readiness check used by both jobs. |

---

## ACTIVE Issues — Re-confirmed This Cycle

### ISSUE-1 — BCTC SLA CRITICAL + VPS BCTC stale (WORSENING)

| Field | Detail |
|-------|--------|
| **Class** | ISSUE |
| **Status** | WORSENING (1447min now vs 1327min at 04:08 report, +120min = exactly 2h gap) |
| **Re-probe** | `get_sla_status` at 06:05: `bctc: age=1447min, SLA=120min, status=breached, severity=CRITICAL`<br>`get_vps_proxy_health` at 06:05: `bctc: last push 2026-06-13 23:45:12, 24h pushes=0, STALE`<br>`get_cron_health`: `bctcReparseJob success_rate=79.9%` (borderline below 80% threshold) |
| **Caller count** | bctc-analyst, refine_bctc_md (3 PDFs stuck: VCB Q1-2025 54p, HPG Q4-2025 24p, GVR Q1-2026 80p), system-auditor |
| **Suggested fix** | Investigate `vn-bctc-fetch` VPS service silence (reports healthy but 0 pushes since Jun 13). Check VPS job logs. If service is stuck, `restart_vps_service` tool available. |

---

### ISSUE-2 — Reuters RSS dead (5 consecutive failures, never succeeded)

| Field | Detail |
|-------|--------|
| **Class** | ISSUE |
| **Status** | UNCHANGED |
| **Re-probe** | `get_system_status` at 06:04: `Reuters RSS: Ngưng, 5 consecutive failures, last success: never` |
| **Caller count** | news-scout, market-watcher (Reuters is a configured news source) |
| **Suggested fix** | Verify Reuters RSS URL validity; if endpoint is permanently changed/removed, remove from source config to eliminate error noise. |

---

### ISSUE-3 — Trading Economics dead (5 consecutive failures each, 2 endpoints, never succeeded)

| Field | Detail |
|-------|--------|
| **Class** | ISSUE |
| **Status** | UNCHANGED |
| **Re-probe** | `get_system_status` at 06:04: two `Trading Economics: Ngưng, 5 consecutive failures, Chưa bao giờ (never succeeded)` entries |
| **Caller count** | macro-indicators data pipeline; `macroIndicatorRefreshJob` |
| **Suggested fix** | Check `apps/mcp-server` TE scraper code; API format or auth may have changed. IMF/World Bank fallbacks (circuit breakers OK) can cover until TE restored. |

---

### ISSUE-4 — Foreign flow primary endpoint failing every minute (error log pollution)

| Field | Detail |
|-------|--------|
| **Class** | ISSUE |
| **Status** | UNCHANGED |
| **Re-probe** | `get_system_status` recent errors at 06:04: `[WARN] foreign-flow-job: fallback activated`, `[WARN] foreign-flow-job: all fallbacks exhausted` — every minute at :00, :01, :02, :03, :04. VPS IS delivering flow data (101-102 items/min per `get_vps_proxy_health`). |
| **Caller count** | Error noise affects `get_system_status` legibility; obscures real errors. Data is OK via VPS. |
| **Suggested fix** | Identify and remove/disable the dead primary foreign-flow endpoint so VPS fallback is promoted to primary; eliminates per-minute WARN log spam. |

---

### ISSUE-5 — 5 watchlist tickers with 0 OHLCV rows (TA not ready)

| Field | Detail |
|-------|--------|
| **Class** | ISSUE |
| **Status** | UNCHANGED |
| **Re-probe** | `get_pipeline_health` at 06:05: `BDI: rows=0`, `DLC: rows=0`, `JSH: rows=0`, `SIS: rows=0`, `VDC: rows=0` — all "TA not ready" |
| **Caller count** | alert-commander (no TA alerts for these tickers), market-watcher, technical-analysis pipeline |
| **Suggested fix** | Verify tickers are actively traded and correctly routed in price fetcher. HNX/UPCOM tickers may need separate fetch path. Remove from watchlist if illiquid/delisted. |

---

## RESOLVED Findings — None

No prior findings have been resolved this cycle. All 3 BUGs and 5 ISSUEs from the 04:08 report carry forward with fresh re-probe confirmation. The newest `get_recent_fixes` entry is 2026-05-12 (HEADLOCK clear) — no fixes for any active finding.

---

## IMPROVE Findings

### IMPROVE-1 — `get_foreign_flow.md` SSOT doc has wrong parameter name

- **Re-confirmed:** `docs/agents/tools/list/get_foreign_flow.md:7` says param `ticker`; live schema requires `code` (confirmed by error path `["code"]`)
- **Fix:** rename `ticker` → `code` in the doc

---

## Healthy Tools (no issues)

`get_system_status` · `get_cycle_bootstrap` · `get_week_period` · `get_market_snapshot` · `get_macro_snapshot` · `get_cron_health` · `get_pipeline_health` · `get_sla_status` · `get_vps_proxy_health` · `get_alerts` · `task_claim` · `task_release` · `task_heartbeat` · `get_recent_fixes` · `get_market_foreign_flow` · `get_bctc_refined` · `post_agent_signal` · `log_agent_work` · `send_telegram` (schema OK) · `get_watchlist`

---

## Active Finding Count

| Class | Count | With ≥1 affected caller |
|-------|-------|-------------------------|
| BUG | 4 | 4 |
| ISSUE | 5 | 5 |
| IMPROVE | 1 | 1 (doc-only fix) |

**Delta vs 04:08 report:** +1 new BUG (BUG-4 RSI extremes at open). All prior findings unchanged / unresolved. ISSUE-1 worsening (+120min BCTC age).
