# Team MCP Tool Recheck — 2026-06-14T18:07Z

**Run by:** health-recheck agent (scheduled routine)  
**Prior report compared:** `team-tool-recheck-2026-06-14-1607.md`  
**Gateway transport:** ALIVE — `mcp__gateway__call_tool(server="vn-market", ...)` operational  
**vn-market uptime:** ~2h 18m at probe time  
**DB:** market.db 276.16 MB | WAL 3.94 MB  
**Probes run this cycle:** 20 tool calls; all carry-forward findings re-executed fresh

---

## ACTIVE FINDINGS — Re-confirmed or New This Cycle

### BUG-01 — HNX/UPCOM all price sources failing (day 7+, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_system_status` at 18:02 UTC: 6× `[hnx] all HNX/UPCOM price sources failed` at 18:01–18:02 UTC (off-hours Sunday). 10 unresolved errors. CB `hnx` shows [OK] 0 failures — CB passes but fetch still fails. `get_pipeline_health`: BDI/DLC/JSH/SIS/VDC = 0 rows. |
| **Caller surface** | market-watcher cycle.md (1 active caller). 5 tickers unserviceable. |
| **Status vs 1607** | UNCHANGED — day 7+, no fix landed. |
| **Suggested fix** | Investigate `apps/stock-price/` HNX fetch path — all sources failing = shared parser likely broken. Add market-hours gate to cut off-hours noise (see also IMPROVE-04 in 1607). |

---

### BUG-02 — `vnstockFundamentalsRefresh` CRASHED (day 7+, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_cron_health` at 18:03 UTC: last_run=2026-06-08 01:00:00, status=crashed, success_rate=0.00%, 1 total run, avg_duration=4035883ms (~67 min). ZERO re-trigger since crash. |
| **Caller surface** | bctc-analyst, market-analyst, digest-predict, qa-responder, unified-agent — all valuation ratios (P/E, EPS, P/B) stale since 2026-06-08. |
| **Status vs 1607** | UNCHANGED — no re-trigger, no fix. Now 7 days stale. |
| **Suggested fix** | Immediate: manual re-trigger by dev. Code fix: per-ticker try/catch + 30s timeout in `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts`. |

---

### BUG-NEW-01 — `fb-market-poster`: `get_foreign_flow {}` fails (NEW this cycle)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_foreign_flow({})` → `code: Required`. `get_foreign_flow({ticker:"HPG"})` → `code: Required`. `get_foreign_flow({code:"HPG"})` → ✅ OK (ticker-specific). |
| **Caller surface** | `docs/agents/tools/package/fb-market-poster.md:55` — calls `get_foreign_flow({})` with no args. Package doc states "(none required)". The correct no-arg market-wide tool is `get_market_foreign_flow({})` (confirmed working this cycle). |
| **Impact** | Every fb-market-poster cycle silently fails foreign flow enrichment; falls back to notebook data only. |
| **Grep verify** | `grep -r "get_foreign_flow" docs/agents/tools/package --include="*.md" -n` → `fb-market-poster.md:55` (1 caller with broken args). `market-analyst` and `market-watcher` use `get_market_foreign_flow` (correct) or `get_foreign_flow({code:...})` (correct). |
| **Suggested fix** | In `docs/agents/tools/package/fb-market-poster.md` line 48+55: replace `get_foreign_flow` with `get_market_foreign_flow` (same no-arg call, returns market-wide buy/sell summary). |

---

### BUG-NEW-02 — `fb-market-poster`: `get_ticker_intelligence {}` fails (NEW this cycle)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_ticker_intelligence({})` → `code: Required`. `get_ticker_intelligence({code:"HPG"})` → ✅ OK (ticker-specific brief). |
| **Caller surface** | `docs/agents/tools/package/fb-market-poster.md:56` — calls `get_ticker_intelligence({})` with no args. Package doc states "(none required)". Tool is ticker-specific; no market-wide movers equivalent is documented. The v3 note (2026-06-07) says this replaced phantom `get_top_movers` — the replacement is itself broken. |
| **Impact** | Every fb-market-poster cycle silently fails ticker intelligence enrichment; falls back to notebook data only. Combined with BUG-NEW-01, fb-market-poster runs fully data-blind for live market enrichment. |
| **Grep verify** | `grep -r "get_ticker_intelligence" docs/agents/tools/package --include="*.md" -n` → `fb-market-poster.md:56` (`{}`), `market-watcher.md:207` (`{code:...}` — correct). |
| **Suggested fix** | Either (a) add a no-arg `get_market_movers` tool that returns top gainers/losers, or (b) remove `get_ticker_intelligence` from fb-market-poster and rely on notebook movers summary. Update package doc v3 note. |

---

### ISSUE-02 — `get_technical_indicators` all N/A (day 7+, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_technical_indicators({code:"FPT"})` at 18:09 UTC: MA5/MA20/MA50/RSI14/MACD/BB all N/A, source_tier=3. `get_pipeline_health` at 18:04: FPT=37 rows, RSI14=48.0, TA ready. Disconnect persists. |
| **Caller surface** | market-watcher cycle.md (1 caller, every market cycle). |
| **Status vs 1607** | UNCHANGED. |
| **Suggested fix** | TA service (port 5003) reads different store than `daily_ohlcv`. Confirm `ta-ohlcv-backfill` targets correct shared volume path. |

---

### ISSUE-03 — `bctcReparseJob` success rate 78.9% (sub-80%, STABLE)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_cron_health` at 18:03 UTC: success_rate=0.79 (78.9%), 185 total runs. Run at 15:45 UTC succeeded. Same as 1607 cycle. |
| **Status vs 1607** | STABLE (unchanged at 78.9%). Last 3 runs succeeded — may be recovering. |
| **Suggested fix** | Investigate pdf-extractor for OCR failures on complex BCTC layouts (PPC/PLX/DAG). |

---

### ISSUE-06 — BCTC VPS push stale (duration grown, weekend — LOW severity)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_vps_proxy_health` at 18:04 UTC: bctc last_push=2026-06-13 23:45:12, 0 pushes 24h, STALE. Now ~18h (was 16.5h at 1607). `vn-bctc-fetch` service: healthy. bctcQueueEnricher: 0 URLs for VEA/VNH/VDC/SIS. |
| **Status vs 1607** | Duration WORSENED (16.5h→18h). Severity LOW — Sunday, SSC portal inactive. Expected to self-resolve Mon 02:00 UTC. |
| **Suggested fix** | Monitor Mon 02:00 UTC. Trigger `trigger_bctc_vps_fetch` if still 0 at market open. |

---

### ISSUE-NEW-01 — `vn-sbv-fetch` VPS service UNHEALTHY + sbv_fx SLA breached (NEW this cycle)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_vps_service_health` at 18:04 UTC: `vn-sbv-fetch | unhealthy | 5s ago | 0ms | 1h 4m`. `get_sla_status`: `sbv_fx | 65min | 30min | breached | CRITICAL`. However `get_vps_proxy_health`: sbv last_push=2026-06-14 17:56:39 (recent, 36 pushes/24h). Service uptime 1h 4m suggests a restart ~17:00 UTC. |
| **Status vs 1607** | NEW — 1607 showed 3 healthy, 2 idle (no unhealthy). Service degraded since ~17:00 UTC. |
| **Blast radius** | SBV FX rate feed. Recent push at 17:56 suggests partial recovery after restart. sbv_fx SLA shows breached but VPS push is current — SLA may be reading from a stale internal field. Monitor next cycle. |
| **Suggested fix** | Check VPS `vn-sbv-fetch` systemd restart reason (likely OOM or crash). Apply same StartLimitBurst=0 fix documented in fix #3 (2026-05-02) for news/reuters/TE services. |

---

## IMPROVE — Carry-Forward + New

| ID | Class | Tool / File | Status vs 1607 | Fix |
|---|---|---|---|---|
| IMPROVE-04 | IMPROVE | `macroIndicatorRefreshJob_FAILTEST` test artifact in prod scheduler | UNCHANGED | Remove from `apps/mcp-server/src/scheduler/` |
| IMPROVE-05 | IMPROVE | QA test alert artifact unread HIGH in prod (id: `qa-gate3-probe-1781337593868`) | UNCHANGED | QA agent should mark probes read on completion |
| IMPROVE-06 | IMPROVE | `emit_pressure_state` list doc schema stale (params mismatch) | CARRY-FORWARD | Update `docs/agents/tools/list/emit_pressure_state.md` with actual params |
| IMPROVE-07 | IMPROVE | `chef.md` line 63 uses `agent_id` instead of `agent_name` | CARRY-FORWARD | Update `docs/agents/unified-agent/flow/chef.md` line 63 |
| IMPROVE-NEW-01 | IMPROVE | `get_foreign_flow` list doc: param `ticker` but live requires `code` | NEW | `docs/agents/tools/list/get_foreign_flow.md`: rename param `ticker`→`code` |
| IMPROVE-NEW-02 | IMPROVE | `get_ticker_intelligence` list doc: param `ticker` but live requires `code` | NEW | `docs/agents/tools/list/get_ticker_intelligence.md`: rename param `ticker`→`code` |

---

## RESOLVED — Re-probed, Still Not Reproducing

| ID | Re-probe | Status |
|---|---|---|
| ISSUE-01 (news SLA breach) | `get_sla_status` news=ok | STILL RESOLVED ✅ |
| ISSUE-05 (orphaned task lock) | `task_list_held`: 0 locks | STILL RESOLVED ✅ |

---

## NON-ISSUES (caller-surface verified: 0 affected callers)

| Observation | Verdict | Verify command |
|---|---|---|
| `get_news` tool not found | NON-ISSUE | `grep -r "get_news" docs/agents --include="*.md"` → 0 matches |
| Stock prices 57.1h stale | NON-ISSUE | Sunday 2026-06-14; last VN market day was Friday 2026-06-12. Expected. |
| BCTC SLA 726/360min breached | NON-ISSUE | Sunday, no new filings. SLA not weekend-aware by design. |
| `bctcQueueEnricher` 0 URLs VEA/VNH/VDC | NON-ISSUE | These tickers are QUÁ HẠN with no URLs at source; VEA removed from active watchlist (sprint-054). |
| `get_cycle_bootstrap {}` fails | NON-ISSUE | Correctly requires `agent_name` enum; no agent calls without it. |

---

## Healthy Tools Confirmed

| Tool | Result |
|---|---|
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ |
| `get_market_snapshot` | ✅ VN-Index 1791.65 |
| `get_macro_snapshot` | ✅ Full macro payload |
| `get_system_status` | ✅ (with known BUG-01 noise) |
| `get_cron_health` | ✅ 67 jobs listed |
| `get_earnings_calendar` | ✅ 41 tickers |
| `get_pipeline_health` | ✅ 37/41 TA-ready |
| `get_sla_status` | ⚠ sbv_fx breached (ISSUE-NEW-01) |
| `get_vps_proxy_health` | ✅ news/sbv/prices ok |
| `get_vps_service_health` | ⚠ vn-sbv-fetch unhealthy |
| `task_claim` / `task_release` | ✅ |
| `get_foreign_flow(code="HPG")` | ✅ |
| `get_market_foreign_flow({})` | ✅ Market-wide summary |
| `get_financial_summary(actionCode="FPT")` | ✅ Q1-2026 data |
| `get_ticker_intelligence(code="HPG")` | ✅ |
| `get_agent_signals` | ✅ |
| `get_recent_fixes` | ✅ |
| `send_telegram` | Schema: `message` (string) required — NOT `text` |

---

## Summary

| ID | Class | Finding | Status |
|---|---|---|---|
| BUG-01 | BUG | HNX/UPCOM all price sources failing | UNCHANGED day 7+ |
| BUG-02 | BUG | `vnstockFundamentalsRefresh` crashed | UNCHANGED day 7+ |
| BUG-NEW-01 | BUG | `fb-market-poster` `get_foreign_flow {}` broken | NEW this cycle |
| BUG-NEW-02 | BUG | `fb-market-poster` `get_ticker_intelligence {}` broken | NEW this cycle |
| ISSUE-02 | ISSUE | `get_technical_indicators` all N/A | UNCHANGED day 7+ |
| ISSUE-03 | ISSUE | `bctcReparseJob` 78.9% success rate | STABLE (last 3 runs ok) |
| ISSUE-06 | ISSUE | BCTC VPS push stale 18h | WORSENED (16.5h→18h), LOW severity weekend |
| ISSUE-NEW-01 | ISSUE | `vn-sbv-fetch` unhealthy + sbv_fx SLA breached | NEW this cycle |
| ISSUE-01, ISSUE-05 | — | News SLA, orphaned lock | STILL RESOLVED ✅ |

**Active BUGs:** 4 (2 carry-forward + 2 new) | **Active ISSUEs:** 4 (3 carry-forward + 1 new) | **New this cycle:** BUG-NEW-01, BUG-NEW-02, ISSUE-NEW-01, IMPROVE-NEW-01, IMPROVE-NEW-02

**Overall verdict: DEGRADED** — Two new BUGs break fb-market-poster live enrichment completely (silent fail to notebook fallback). Three day-7+ unresolved items (BUG-01, BUG-02, ISSUE-02) remain without fix. `vn-sbv-fetch` restarted ~17:00 UTC — monitor recovery.

**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-14-1807.md`
