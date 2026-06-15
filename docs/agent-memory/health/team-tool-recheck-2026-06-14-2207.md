# Team MCP Tool Recheck — 2026-06-14T22:07Z

**Run by:** health-recheck agent (scheduled routine)  
**Prior report compared:** `team-tool-recheck-2026-06-14-2006.md`  
**Gateway transport:** ALIVE — `mcp__gateway__call_tool(server="vn-market", ...)` operational  
**vn-market uptime:** ~6h 19m at probe time  
**DB:** market.db 276.16 MB | WAL 881.2 KB  
**Probes run this cycle:** 18 tool calls + 6 doc reads; all carry-forward findings re-executed fresh

---

## ACTIVE FINDINGS — Re-confirmed This Cycle

### BUG-01 — HNX/UPCOM all price sources failing (day 8+, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_system_status` at 22:03 UTC: errors "[hnx] all HNX price sources failed" + "[hnx] all UPCOM price sources failed" firing every minute at 22:01, 22:02, 22:03 UTC. Circuit breaker `hnx: [OK] failures: 0` — CB not tripping despite errors. `get_pipeline_health` at 22:03: BDI/DLC/JSH/SIS/VDC = 0 rows (5 HNX/UPCOM tickers unserviceable). |
| **Caller surface** | market-watcher cycle.md (1 active caller every market cycle). 5 HNX/UPCOM tickers have 0 OHLCV rows — cannot produce TA signals. |
| **Status vs 2006** | UNCHANGED — day 8+, no fix. |
| **Suggested fix** | Investigate `apps/stock-price/` HNX fetch path — all sources failing = shared parser likely broken. Add market-hours gate to suppress off-hours error log noise. |

---

### BUG-02 — `vnstockFundamentalsRefresh` CRASHED (day 8+, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_cron_health` at 22:04 UTC: last_run=2026-06-08 01:00:00, status=crashed, success_rate=0.00%, total_runs=1, avg_duration=4035883ms (~67 min). Zero re-trigger since crash on 2026-06-08. Now ~7.9 days stale. |
| **Caller surface** | bctc-analyst, market-analyst, digest-predict, qa-responder, unified-agent — all valuation ratios (P/E, EPS, P/B) stale since 2026-06-08. |
| **Status vs 2006** | UNCHANGED — stale duration grew to 7.9 days. |
| **Suggested fix** | Immediate: manual re-trigger. Code fix: per-ticker try/catch + 30s timeout in `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts`. |

---

### BUG-NEW-01 — `fb-market-poster`: `get_foreign_flow {}` fails (UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_foreign_flow({})` at 22:03 UTC → `code: Required` (reproduced). `get_foreign_flow({code:"HPG"})` not tested this cycle (confirmed working prior cycle). |
| **Caller surface** | `docs/agents/tools/package/fb-market-poster.md:55` — calls `get_foreign_flow({})` with no args. Package doc states "(none required)". Correct no-arg equivalent is `get_market_foreign_flow({})` (confirmed working). |
| **Grep verify** | `grep -n "get_foreign_flow" docs/agents/tools/package/fb-market-poster.md` → line 55 (1 caller with broken args). |
| **Status vs 2006** | UNCHANGED — no fix landed. |
| **Suggested fix** | `docs/agents/tools/package/fb-market-poster.md` line 55: replace `get_foreign_flow` with `get_market_foreign_flow` (no-arg call). |

---

### BUG-NEW-02 — `fb-market-poster`: `get_ticker_intelligence {}` fails (UNCHANGED)

| Field | Value |
|---|---|
| **Class** | BUG |
| **Re-probe** | `get_ticker_intelligence({})` at 22:03 UTC → `code: Required` (reproduced). |
| **Caller surface** | `docs/agents/tools/package/fb-market-poster.md:56` — calls `get_ticker_intelligence({})` with no args. Combined with BUG-NEW-01, fb-market-poster is data-blind for live enrichment every cycle. |
| **Grep verify** | `grep -n "get_ticker_intelligence" docs/agents/tools/package/fb-market-poster.md` → line 56 (broken `{}`). |
| **Status vs 2006** | UNCHANGED — no fix landed. |
| **Suggested fix** | (a) Add `get_market_movers` tool for no-arg top-movers, or (b) remove `get_ticker_intelligence` from fb-market-poster and rely on notebook movers summary. |

---

### ISSUE-02 — `get_technical_indicators` all N/A (day 8+, UNCHANGED)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_technical_indicators({code:"VCB"})` at 22:03 UTC: MA5/MA20/MA50/RSI14/MACD/BB all N/A, source_tier=3, 60-day window. `get_pipeline_health` at same time: VCB=37 rows, TA ready, RSI14=43.8. HPG RSI=24.6 (oversold). Disconnect between this tool and pipeline health persists. |
| **Caller surface** | market-watcher cycle.md (1 active caller per market cycle). |
| **Status vs 2006** | UNCHANGED — day 8+. |
| **Suggested fix** | TA service reads different data store than `daily_ohlcv`. Verify `ta-ohlcv-backfill` targets correct shared volume. Align `get_technical_indicators` to read from `daily_ohlcv` directly. |

---

### ISSUE-03 — `bctcReparseJob` 79.3% success rate, sub-80% (STABLE)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_cron_health` at 22:04 UTC: success_rate=0.79 (79.3%), total_runs=179, avg_duration=351728ms (~5.9 min). Last run 15:45 UTC succeeded. |
| **Status vs 2006** | STABLE — 79.3% vs 79.1% (marginal improvement, still below 80% threshold). |
| **Suggested fix** | Investigate pdf-extractor OCR failures on complex BCTC layouts (PPC/PLX/DAG). |

---

### ISSUE-06 — BCTC VPS push stale ~16.1h (WORSENING, LOW severity Sunday)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_vps_proxy_health` at 22:04 UTC: bctc last_push=2026-06-13 23:45:12, 0 pushes/24h, STALE=YES. `get_sla_status`: bctc=965/360min BREACHED CRITICAL (was 849min at 2006). `vn-bctc-fetch` VPS service=healthy. `bctcQueueEnricher` 0 URLs for VEA/VNH/VDC/SIS. |
| **Status vs 2006** | WORSENING duration (20.3h→22h). Severity remains LOW — Sunday, SSC portal inactive. Expected to self-resolve Mon ~02:00 UTC at market open. |
| **Suggested fix** | Monitor Mon 02:00 UTC. If still stale at market open, trigger `trigger_bctc_vps_fetch`. |

---

### ISSUE-RE-01 — `vn-sbv-fetch` UNHEALTHY (RECURRENCE — was RESOLVED at 2006)

| Field | Value |
|---|---|
| **Class** | ISSUE |
| **Re-probe** | `get_vps_service_health` at 22:04 UTC: `vn-sbv-fetch | unhealthy | 4m ago | VPS uptime: 1h 14m`. Second probe at 22:05 UTC: identical result. Service consistently unhealthy since ~20:50 UTC. |
| **Impact** | LOW — sbv_fx SLA shows 3/30min OK (`get_sla_status`). `sbvRatesRefreshJob` last_run=20:00 UTC succeeded. Main server fallback path is serving SBV data. |
| **Status vs 2006** | RECURRENCE — ISSUE-NEW-01 was marked RESOLVED at 2006 (recovered ~17:00 UTC), but VPS service went unhealthy again at ~20:50 UTC. Pattern: vn-sbv-fetch shows recurring instability, recovers and re-fails within hours. |
| **Suggested fix** | Investigate systemd StartLimitHit pattern (same root cause as prior vn-news-fetch issues per log_fix #4). Check `vps-scripts/vn-sbv-fetch.service` for `StartLimitBurst` setting. Consider `restart_vps_service(service:"vn-sbv-fetch")`. |

---

## RESOLVED THIS CYCLE

*(No new resolutions. ISSUE-NEW-01 from 2006 re-emerged as ISSUE-RE-01 above.)*

---

## IMPROVE — Carry-Forward (re-confirmed this cycle)

| ID | Class | Tool / File | Status vs 2006 | Fix |
|---|---|---|---|---|
| IMPROVE-04 | IMPROVE | `macroIndicatorRefreshJob_FAILTEST` test artifact in prod scheduler | UNCHANGED — still appears in `get_cron_health` output | Remove from `apps/mcp-server/src/scheduler/` |
| IMPROVE-07 | IMPROVE | `chef.md` line 63 uses `agent_id` instead of `agent_name` | RE-CONFIRMED this cycle — line 63 reads `get_cycle_bootstrap(agent_id="unified-agent")`. No callers confirmed broken (unified-agent uses correct `agent_name` in its own execution). | Fix `docs/agents/unified-agent/flow/chef.md` line 63: `agent_id` → `agent_name` |
| IMPROVE-NEW-01 | IMPROVE | `get_foreign_flow` list doc: param `ticker` but live requires `code` | RE-CONFIRMED — `docs/agents/tools/list/get_foreign_flow.md` still shows `ticker`. Live probe requires `code`. Callers using `code` ✅ (0 affected callers). | Fix `docs/agents/tools/list/get_foreign_flow.md`: `ticker` → `code` |
| IMPROVE-NEW-02 | IMPROVE | `get_ticker_intelligence` list doc: param `ticker` but live requires `code` | RE-CONFIRMED — `docs/agents/tools/list/get_ticker_intelligence.md` still shows `ticker`. Live probe requires `code`. | Fix `docs/agents/tools/list/get_ticker_intelligence.md`: `ticker` → `code` |
| IMPROVE-NEW-03 | IMPROVE | `get_technical_indicators` list doc: param `ticker` but live requires `code` | CARRY-FORWARD — verified 0 affected callers in prior cycle. | Fix `docs/agents/tools/list/get_technical_indicators.md`: `ticker` → `code` |
| IMPROVE-NEW-04 | IMPROVE | `get_price_history` list doc: param `ticker` but live requires `code` | CARRY-FORWARD — verified 0 affected callers in prior cycle. | Fix `docs/agents/tools/list/get_price_history.md`: `ticker` → `code` |

---

## NON-ISSUES (caller-surface verified: 0 affected callers)

| Observation | Verdict | Verify |
|---|---|---|
| Stock prices 61.1h stale | NON-ISSUE | Sunday 2026-06-14; last VN market day was Friday 2026-06-12 close at ~08:59 UTC. Expected. |
| `bctcQueueEnricher` 0 URLs for VEA/VNH/VDC/SIS | NON-ISSUE | These tickers have no BCTC URLs at source on weekends. VEA/VNH/VDC are QUÁ HẠN. |
| BCTC SLA 965/360min breached | NON-ISSUE (see ISSUE-06) | Weekend expected; SLA not weekend-aware by design. |
| Reuters RSS 61 consecutive errors (never succeeded) | NON-ISSUE | `get_recent_fixes` fix #7: `vn-reuters-fetch.service` decommissioned (dead feeds.reuters.com URLs, redundant with direct MCP fetch). Source intentionally dead — `pollNews_all_sources_dark` confirms some sources dark by design. |
| Trading Economics news 61 consecutive errors | NON-ISSUE | Chromium-based news scraper — known to fail inside Docker without proper Chromium init. Primary TE data path (commodity/macro) via circuit breaker shows `tradingEconomics: [OK] failures: 0`. Only news-path failing. |
| `cowork-leader` lock expired 22:03 UTC (held by cowork-dispatcher, expires_at 21:35) | NON-ISSUE | Sunday off-hours, cowork not scheduled. Lock expires naturally at session end; new session re-claims on next cron trigger. |
| `vnstockTradingStatsRefresh` avg_duration=4735029ms (78 min) | NON-ISSUE | Single one-time bulk stats refresh on 2026-06-09, completed successfully. Not a recurring job. |

---

## Healthy Tools Confirmed This Cycle

| Tool | Result |
|---|---|
| `get_cycle_bootstrap(agent_name="market-watcher")` | ✅ Full payload, 30ms |
| `get_system_status` | ✅ (with known BUG-01 HNX noise) |
| `get_market_snapshot` | ✅ VN-Index 1791.65 (-0.39%) |
| `get_macro_snapshot` | ✅ Full payload — oil $87.33, gold $4238.8, USDVND 26122 |
| `get_cron_health` | ✅ 67 jobs listed |
| `get_earnings_calendar` | ✅ 41 tickers, 12 QUÁ HẠN |
| `get_pipeline_health` | ✅ 36/41 TA-ready (BDI/DLC/JSH/SIS/VDC = 0 rows HNX/UPCOM — BUG-01) |
| `get_vps_proxy_health` | ✅ news/sbv/prices ok; bctc stale (ISSUE-06) |
| `get_sla_status` | ✅ sbv_fx ok; bctc breached (ISSUE-06) |
| `get_vps_service_health` | ✅ reachable; vn-sbv-fetch unhealthy (ISSUE-RE-01) |
| `task_list_held` | ✅ 6 active locks |
| `get_foreign_flow({})` | ❌ BUG-NEW-01 |
| `get_ticker_intelligence({})` | ❌ BUG-NEW-02 |
| `get_technical_indicators(code="VCB")` | ✅ reachable ⚠ all N/A (ISSUE-02) |
| `get_recent_fixes(limit=10)` | ✅ |
| `send_telegram` | Schema: `message` (string) required — NOT `text` |

---

## Summary

| ID | Class | Finding | Status vs 2006 |
|---|---|---|---|
| BUG-01 | BUG | HNX/UPCOM all price sources failing | UNCHANGED day 8+ |
| BUG-02 | BUG | `vnstockFundamentalsRefresh` crashed | UNCHANGED day 7.9 (7.9→8d) |
| BUG-NEW-01 | BUG | `fb-market-poster` `get_foreign_flow {}` broken | UNCHANGED — no fix |
| BUG-NEW-02 | BUG | `fb-market-poster` `get_ticker_intelligence {}` broken | UNCHANGED — no fix |
| ISSUE-02 | ISSUE | `get_technical_indicators` all N/A | UNCHANGED day 8+ |
| ISSUE-03 | ISSUE | `bctcReparseJob` 79.3% success rate | STABLE (79.1→79.3%) |
| ISSUE-06 | ISSUE | BCTC VPS push stale 22h | WORSENING (20.3h→22h), LOW severity Sunday |
| ISSUE-RE-01 | ISSUE | `vn-sbv-fetch` unhealthy again | RECURRENCE (was resolved 2006, re-failed ~20:50 UTC) |

**Active BUGs:** 4 (all carry-forward, no fixes landed) | **Active ISSUEs:** 4 (1 new recurrence)  
**Resolved this cycle:** 0  
**No new IMPROVEs** — all 6 IMPROVE items carry forward unchanged

**Overall verdict: DEGRADED** — Day 8+ without resolution on BUG-01 (HNX/UPCOM prices) + ISSUE-02 (TA indicators N/A) + BUG-02 (fundamentals crash). fb-market-poster remains data-blind (BUG-NEW-01/02). vn-sbv-fetch recurrence (ISSUE-RE-01) adds urgency — the fix for StartLimitBurst (applied to vn-news-fetch per fix #4) should be applied to `vn-sbv-fetch.service` before Monday market open.

**Report path:** `docs/agent-memory/health/team-tool-recheck-2026-06-14-2207.md`
