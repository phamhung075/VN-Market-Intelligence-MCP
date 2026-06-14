# Team MCP Tool Recheck — 2026-06-14T20:06Z

**Run by:** health-recheck agent (scheduled routine)  
**Prior report compared:** `team-tool-recheck-2026-06-14-1807.md`  
**Gateway transport:** ALIVE — `mcp__gateway__call_tool(server="vn-market", ...)` operational  
**vn-market uptime:** ~4h 18m at probe time  
**DB:** market.db 276.16 MB | WAL 961.6 KB  
**Probes run this cycle:** 24 tool calls; all carry-forward findings re-executed fresh

---

## ACTIVE FINDINGS — Re-confirmed or New This Cycle

### BUG-01 — HNX/UPCOM all price sources failing (day 7+, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_system_status` at 20:03 UTC: 10 unresolved errors — `[hnx] all HNX/UPCOM price sources failed` at 20:00–20:02 UTC (Sunday off-hours). CB `hnx: [OK] failures: 0` — circuit breaker not tripping. `get_pipeline_health` at 20:04: BDI/DLC/JSH/SIS/VDC = 0 rows (5 tickers with no OHLCV data). |
| **Caller surface** | market-watcher cycle.md (1 active caller every market cycle). 5 HNX/UPCOM tickers unserviceable. |
| **Status vs 1807** | UNCHANGED — day 7+, no fix. |
| **Suggested fix** | Investigate `apps/stock-price/` HNX fetch path — all sources failing = shared parser likely broken. Add market-hours gate to suppress off-hours error log noise (Sun noise: 10 errors in 2-min window). |

---

### BUG-02 — `vnstockFundamentalsRefresh` CRASHED (day 7+, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_cron_health` at 20:04 UTC: last_run=2026-06-08 01:00:00, status=crashed, success_rate=0.00%, total_runs=1, avg_duration=4035883ms (~67 min). Zero re-trigger since crash on 2026-06-08. Now 6.8 days stale. |
| **Caller surface** | bctc-analyst, market-analyst, digest-predict, qa-responder, unified-agent — all valuation ratios (P/E, EPS, P/B) stale since 2026-06-08. |
| **Status vs 1807** | UNCHANGED — no re-trigger, no fix. Stale duration grew from 7d to 6.8d (same date). |
| **Suggested fix** | Immediate: manual re-trigger. Code fix: per-ticker try/catch + 30s timeout in `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts`. |

---

### BUG-NEW-01 — `fb-market-poster`: `get_foreign_flow {}` fails (carry-forward, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_foreign_flow({})` at 20:05 UTC → `code: Required` (same as 1807). `get_foreign_flow({code:"HPG"})` → ✅ OK (ticker-specific). |
| **Caller surface** | `docs/agents/tools/package/fb-market-poster.md:55` — calls `get_foreign_flow({})` with no args. Package doc states "(none required)". Correct no-arg tool is `get_market_foreign_flow({})` (confirmed working). |
| **Impact** | Every fb-market-poster cycle silently fails foreign flow enrichment. |
| **Grep verify** | `grep -r "get_foreign_flow" docs/agents/tools/package --include="*.md" -n` → `fb-market-poster.md:55` (1 caller with broken args). `market-watcher` uses `get_market_foreign_flow` (correct). |
| **Status vs 1807** | UNCHANGED — no fix landed. |
| **Suggested fix** | In `docs/agents/tools/package/fb-market-poster.md` line 55: replace `get_foreign_flow` with `get_market_foreign_flow` (same no-arg call). |

---

### BUG-NEW-02 — `fb-market-poster`: `get_ticker_intelligence {}` fails (carry-forward, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_ticker_intelligence({ticker:"VCB"})` at 20:04 UTC → `code: Required`. `get_ticker_intelligence({code:"VCB"})` → ✅. No market-wide movers equivalent tool exists. |
| **Caller surface** | `docs/agents/tools/package/fb-market-poster.md:56` — calls `get_ticker_intelligence({})` with no args. Combined with BUG-NEW-01, fb-market-poster is data-blind for live enrichment. |
| **Grep verify** | `grep -r "get_ticker_intelligence" docs/agents/tools/package --include="*.md" -n` → `fb-market-poster.md:56` (broken `{}`), `market-watcher.md:207` (correct `{code:...}`). |
| **Status vs 1807** | UNCHANGED — no fix landed. |
| **Suggested fix** | (a) Add `get_market_movers` tool for no-arg top-movers, or (b) remove `get_ticker_intelligence` from fb-market-poster and rely on notebook movers summary. Update package doc v3 note. |

---

### ISSUE-02 — `get_technical_indicators` all N/A (day 7+, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_technical_indicators({code:"VCB"})` at 20:04 UTC: MA5/MA20/MA50/RSI14/MACD/BB all N/A, source_tier=3, 60-day window. `get_pipeline_health` at same time: VCB=37 rows, RSI14=43.8, TA ready. HPG RSI=24.6 (oversold). Disconnect persists between this tool and pipeline health. |
| **Caller surface** | market-watcher cycle.md (1 active caller per market cycle). |
| **Status vs 1807** | UNCHANGED — day 7+. |
| **Suggested fix** | TA service reads different data store than `daily_ohlcv`. Verify `ta-ohlcv-backfill` targets correct shared volume. Align `get_technical_indicators` to read from `daily_ohlcv` directly. |

---

### ISSUE-03 — `bctcReparseJob` 79.1% success rate, sub-80% (STABLE)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_cron_health` at 20:04 UTC: success_rate=0.79 (79.1%), total_runs=182, avg_duration=356413ms (~6 min). Last run 15:45 UTC succeeded. |
| **Status vs 1807** | STABLE — marginally improved 78.9%→79.1%. Still below 80% threshold that triggers `cronHealthAlertJob`. |
| **Suggested fix** | Investigate pdf-extractor OCR failures on complex BCTC layouts (PPC/PLX/DAG). |

---

### ISSUE-06 — BCTC VPS push stale ~20h (WORSENED, LOW severity on Sunday)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_vps_proxy_health` at 20:05 UTC: bctc last_push=2026-06-13 23:45:12, 0 pushes/24h, STALE=YES. Now ~20.3h stale (was 18h at 1807). `get_sla_status`: bctc=849/360min BREACHED CRITICAL. `vn-bctc-fetch` VPS service=healthy. bctcQueueEnricher 0 URLs for VEA/VNH/VDC/SIS. |
| **Status vs 1807** | WORSENED duration (18h→20.3h). Severity remains LOW — Sunday, SSC portal inactive. Expected to self-resolve Mon ~02:00 UTC at market open. |
| **Suggested fix** | Monitor Mon 02:00 UTC. If still stale at market open, trigger `trigger_bctc_vps_fetch`. |

---

## RESOLVED THIS CYCLE

### ISSUE-NEW-01 — `vn-sbv-fetch` unhealthy + sbv_fx SLA breached → ✅ RESOLVED

| Field | Value |
|---|---|
| **Re-probe** | `get_vps_service_health` at 20:05 UTC: `vn-sbv-fetch | healthy | 2m ago` ✅ RECOVERED. `get_sla_status`: `sbv_fx | 7min | 30min | ok` ✅. |
| **Verdict** | Fully resolved. Service restarted ~17:00 UTC, stabilized by this cycle. |

---

## IMPROVE — Carry-Forward + New

| ID | Class | Tool / File | Status vs 1807 | Fix |
|---|---|---|---|---|
| IMPROVE-04 | IMPROVE | `macroIndicatorRefreshJob_FAILTEST` test artifact in prod scheduler | UNCHANGED — still appears in `get_cron_health` output | Remove from `apps/mcp-server/src/scheduler/` |
| IMPROVE-06 | IMPROVE | `emit_pressure_state` list doc schema stale | CARRY-FORWARD — tool works ✅ but list doc may not match live params | Update `docs/agents/tools/list/emit_pressure_state.md` |
| IMPROVE-07 | IMPROVE | `chef.md` line 63 uses `agent_id` instead of `agent_name` | CARRY-FORWARD — re-confirmed this cycle (my probe `get_cycle_bootstrap({agent_id:...})` → validation error) | Fix `docs/agents/unified-agent/flow/chef.md` line 63: `agent_id` → `agent_name` |
| IMPROVE-NEW-01 | IMPROVE | `get_foreign_flow` list doc: param `ticker` but live requires `code` | CARRY-FORWARD from 1807 | Fix `docs/agents/tools/list/get_foreign_flow.md` |
| IMPROVE-NEW-02 | IMPROVE | `get_ticker_intelligence` list doc: param `ticker` but live requires `code` | RE-CONFIRMED this cycle (`ticker` → validation error, `code` ✅) | Fix `docs/agents/tools/list/get_ticker_intelligence.md` |
| IMPROVE-NEW-03 | IMPROVE | `get_technical_indicators` list doc: param `ticker` but live requires `code` | NEW this cycle — confirmed: `{ticker:"VCB"}` → Required [code]; `{code:"VCB"}` ✅. Callers in flow/cycle.md use `code` ✅ (caller-surface: 0 affected). | Fix `docs/agents/tools/list/get_technical_indicators.md` + fix market-watcher.md example (line ~180 shows `ticker: "FPT"`) |
| IMPROVE-NEW-04 | IMPROVE | `get_price_history` list doc: param `ticker` but live requires `code` | NEW this cycle — confirmed: `{ticker:"VCB",days:3}` → Required [code]; `{code:"VCB",days:5}` ✅. Callers in flow/cycle.md, tran-ngoc-bau/audit-market.md, ops/data-validation-checks.md all use `code` ✅ (caller-surface: 0 affected). market-watcher.md example ~line 147 shows `tickers:[...]` (plural array — also wrong). | Fix `docs/agents/tools/list/get_price_history.md`; fix market-watcher.md examples |

---

## NON-ISSUES (caller-surface verified: 0 affected callers)

| Observation | Verdict | Verify command |
|---|---|---|
| Stock prices 59.1h stale | NON-ISSUE | Sunday 2026-06-14; last VN market day was Friday 2026-06-12. Expected. |
| `get_news` tool not found | NON-ISSUE | `grep -r "get_news" docs/agents --include="*.md"` → 0 matches |
| BCTC SLA 849/360min breached | NON-ISSUE | Sunday, no new SSC filings. SLA not weekend-aware by design. |
| bctcQueueEnricher 0 URLs for VEA/VNH/VDC | NON-ISSUE | These tickers have no BCTC URLs at source on weekends. VEA/VNH/VDC are QUÁ HẠN. |
| `get_cycle_bootstrap({agent_id:...})` fails | NON-ISSUE | Correctly requires `agent_name` enum — no agent calls with `agent_id`. |
| BCTC SLA breached 849min | NON-ISSUE (see ISSUE-06) | Weekend expected. |

---

## Healthy Tools Confirmed

| Tool | Result |
|---|---|
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ |
| `get_system_status` | ✅ (with known BUG-01 noise) |
| `get_market_snapshot` | ✅ VN-Index 1791.65 (-0.39%) |
| `get_macro_snapshot` | ✅ Full macro payload, all deltas present |
| `get_cron_health` | ✅ 67 jobs listed |
| `get_earnings_calendar` | ✅ 41 tickers, 12 QUÁ HẠN |
| `get_pipeline_health` | ✅ 36/41 TA-ready (BDI/DLC/JSH/SIS/VDC = 0 rows — HNX/UPCOM) |
| `get_watchlist` | ✅ 41 tickers |
| `get_price_history(code="VCB",days=5)` | ✅ 4 rows returned |
| `get_technical_indicators(code="VCB")` | ✅ reachable but ⚠ all N/A (ISSUE-02) |
| `emit_pressure_state` | ✅ cycle_snapshot_promoted=true |
| `task_list_held` | ✅ 7 active locks |
| `log_agent_work` (two-call pattern) | ✅ id=1373 start→completed |
| `get_vps_service_health` | ✅ 3 healthy, 2 idle (market closed) |
| `get_vps_proxy_health` | ✅ news/sbv/prices ok; bctc stale (ISSUE-06) |
| `get_sla_status` | ✅ sbv_fx ok (ISSUE-NEW-01 RESOLVED); bctc breached (ISSUE-06) |
| `get_foreign_flow(code="HPG")` | ✅ |
| `get_market_foreign_flow({})` | ✅ Market-wide summary |
| `get_ticker_intelligence(code="VCB")` | ✅ (empty-args → error; correct `code` param works) |
| `send_telegram` | Schema: `message` (string) required — NOT `text` |

---

## Summary

| ID | Class | Finding | Status |
|---|---|---|---|
| BUG-01 | BUG | HNX/UPCOM all price sources failing | UNCHANGED day 7+ |
| BUG-02 | BUG | `vnstockFundamentalsRefresh` crashed | UNCHANGED day 7+ |
| BUG-NEW-01 | BUG | `fb-market-poster` `get_foreign_flow {}` broken | UNCHANGED — no fix |
| BUG-NEW-02 | BUG | `fb-market-poster` `get_ticker_intelligence {}` broken | UNCHANGED — no fix |
| ISSUE-02 | ISSUE | `get_technical_indicators` all N/A | UNCHANGED day 7+ |
| ISSUE-03 | ISSUE | `bctcReparseJob` 79.1% success rate | STABLE (marginally up 78.9→79.1) |
| ISSUE-06 | ISSUE | BCTC VPS push stale 20.3h | WORSENED (18h→20.3h), LOW severity Sunday |
| ISSUE-NEW-01 | — | `vn-sbv-fetch` unhealthy + sbv_fx SLA breached | **RESOLVED ✅** |

**Active BUGs:** 4 (all carry-forward) | **Active ISSUEs:** 3 confirmed + 1 LOW-severity weekend  
**Resolved this cycle:** ISSUE-NEW-01 (vn-sbv-fetch recovered)  
**New IMPROVEs:** IMPROVE-NEW-03 (`get_technical_indicators` doc), IMPROVE-NEW-04 (`get_price_history` doc)

**Overall verdict: DEGRADED** — Four re-confirmed BUGs, no fixes landed since 1807. BUG-01 (HNX) + BUG-02 (fundamentals crash) now day 7+ without resolution. BUG-NEW-01/02 leave fb-market-poster data-blind every cycle. ISSUE-02 (`get_technical_indicators` N/A) also day 7+. Positive: vn-sbv-fetch recovered.

**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-14-2006.md`
