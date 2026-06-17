# Team MCP Tool Recheck — 2026-06-17 14:08 UTC

**Cycle:** 2026-06-17 14:04–14:08 UTC
**Agent:** health-recheck (scheduled routine)
**Gateway:** vn-market reachable ✅ (schema validation confirmed)
**Prior report:** team-tool-recheck-2026-06-17-1207.md
**Tools probed this cycle:** 21 tools smoke-called

---

## Summary

| Severity | Count |
|----------|-------|
| BUG / ISSUE (CRITICAL, re-confirmed) | 1 |
| ISSUE (re-confirmed, worsened) | 1 |
| ISSUE (re-confirmed, unchanged) | 2 |
| RESOLVED (no longer reproduces) | 1 |
| IMPROVE (doc drift, 0 affected callers) | 1 |

---

## ACTIVE FINDINGS (re-confirmed this cycle)

### F-01 — BUG (CRITICAL): BCTC pipeline fully stalled — 176 consecutive zero-URL cycles, SLA 1043 min breached

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Tool(s)** | `get_vps_proxy_health`, `get_sla_status`, `get_system_status` |
| **Prior cycle (12:07)** | consecutive_zero_cycles=162, SLA breach 923 min |
| **This cycle (14:08)** | consecutive_zero_cycles=**176** (+14 cycles), SLA breach **1043 min** (17.4h) vs 360 min threshold |
| **Re-probe evidence** | `get_vps_proxy_health` → `bctc: stale YES, last push 2026-06-16 18:02:24, 24h pushes=0` |
| | `get_sla_status` → `bctc: 1043/360 min — CRITICAL` |
| | `get_system_status` → `bctcQueueEnricher: consecutive_zero_cycles=176; "0 URLs populated across all 9 items — all sources may be unavailable or geo-blocked"` |
| | `get_cron_health` → `bctcQueueEnricherJob: last_run 2026-06-17 14:00:01 (success)` — job runs but produces zero URLs |
| **Caller surface** | `docs/agents/bctc-analyst/flow/cycle.md` (all BCTC analysis passes); `docs/agents/refine_bctc_md/flow/main.md` (refine units) |
| **Caller count** | 2 agents directly blocked; system-auditor B-13/C-16 checks also affected |
| **Delta from prior** | WORSENED — 14 additional zero cycles since 12:07; SLA breach grew 120 min |
| **Suggested fix** | `dev-vps-crawls`: diagnose VPS BCTC URL scraper — `vn-bctc-fetch` service reports "healthy" but pushes 0 items. Likely the source URL structure changed (e.g. ssc.gov.vn or cafef BCTC section). Investigate `bctcQueueEnricher` source list vs live page structure. |

---

### F-02 — ISSUE: BDI (Baltic Dry Index) data stale 70+ days

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_pipeline_health` |
| **Prior cycle (12:07)** | BDI rows=0, TA not ready |
| **This cycle (14:08)** | `get_pipeline_health` → `BDI: rows=0 \| TA not ready` — UNCHANGED |
| **Re-probe evidence** | `get_pipeline_health` (this cycle) → BDI rows=0 confirmed. Also DLC, DAG, JSH, SIS, VDC all rows=0 or rows=1 |
| **Caller surface** | `docs/agents/market-watcher/flow/cycle.md` → `get_supply_chain_exposure()` called each market cycle |
| **Caller count** | 1 agent (market-watcher) |
| **Delta from prior** | UNCHANGED — 70+ days stale |
| **Suggested fix** | `dev-mainserver-crawls` or `dev-vps-crawls`: restore BDI feed. Verify source endpoint (Investing.com / Baltic Exchange). Also fix DAG/DLC/JSH/SIS/VDC gaps — these watchlist tickers have 0–1 OHLCV rows. |

---

### F-03 — ISSUE: Reuters RSS + Trading Economics stopped — 7 consecutive errors each (WORSENED from prior I-02)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_system_status` |
| **Prior cycle (12:07)** | Both were "Suy giảm" (degraded) — 1 error each (classified as I-02 IMPROVE) |
| **This cycle (14:08)** | `Reuters RSS: Ngưng (stopped), 7 consecutive errors` |
| | `Trading Economics: Ngưng (stopped), 7 consecutive errors (×2 entries)` |
| **Re-probe evidence** | `get_system_status` source health table (this cycle) — Reuters: "Ngưng, chưa bao giờ thành công" (never succeeded this session); Trading Economics: same |
| **Caller surface** | `news-scout/flow/cycle.md` → `fetch_and_analyze()` sources from news feeds including Reuters; `market-watcher` uses macro context |
| **Caller count** | 2 agents; news volume may be reduced |
| **Delta from prior** | WORSENED — escalated from 1 degraded error to 7 stopped errors |
| **Suggested fix** | `dev-mainserver-crawls`: investigate Reuters RSS endpoint and TradingEconomics fetch — possible auth change, URL rotation, or geo-block since last session. Circuit breaker tripped at 7 failures. |

---

### F-04 — ISSUE: bctcReparseJob 82.4% success rate (persistent, 176 runs)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_cron_health` |
| **Prior cycle (12:07)** | 82.2%, 174 runs |
| **This cycle (14:08)** | `bctcReparseJob: success_rate=0.82 (82.4%), total_runs=176, avg_duration=263733ms (~4.4 min)` |
| **Re-probe evidence** | `get_cron_health` (this cycle) — confirmed same rate, 2 additional runs both counted |
| **Caller surface** | BCTC PDF extraction pipeline; feeds `get_bctc_full`, `get_bctc_series` — used by `bctc-analyst` |
| **Caller count** | 1 agent (bctc-analyst) + refine_bctc_md |
| **Delta from prior** | UNCHANGED — same failure rate, persistent across 176 runs |
| **Suggested fix** | `dev-pdf-extractor`: isolate failing PDFs per-batch. Add exception boundary so one bad PDF doesn't abort the whole reparse run. Check for OCR timeouts or corrupt-PDF patterns. |

---

## RESOLVED THIS CYCLE

### R-01 — RESOLVED: vn-sbv-fetch VPS service now healthy

| Field | Value |
|-------|-------|
| **Prior class** | F-03 ISSUE (12:07 report) |
| **Prior evidence** | `vn-sbv-fetch: unhealthy \| 44m uptime` at 12:07 |
| **Re-probe evidence** | `get_vps_service_health` (this cycle) → `vn-sbv-fetch: healthy \| 2m ago poll` |
| **Verdict** | RESOLVED — likely recovered from restart cycle. No action needed. |

---

## IMPROVEMENTS (doc drift, 0 affected flow callers)

### I-01 — IMPROVE: `get_technical_indicators` SSOT doc uses wrong param name

| Field | Value |
|-------|-------|
| **Class** | IMPROVE |
| **Tool** | `get_technical_indicators` |
| **Evidence** | `docs/agents/tools/list/get_technical_indicators.md` → param listed as `ticker` (string) |
| | Live schema (`technicalIndicatorTools.ts:526`) → requires `code` (not `ticker`). Probe with `{ticker: "FPT"}` → validation error "code Required". Probe with `{code: "FPT"}` → full TA result returned. |
| **Caller-surface grep** | `grep -r "get_technical_indicators" docs/agents/` → `market-watcher/flow/cycle.md:77` uses `get_technical_indicators(code)` ✅; `fb-market-poster/flow/main.md:92` uses `{"code": ticker}` ✅. Market-watcher package doc TABLE correctly lists `code: string`; only the SSOT list doc and the package *example* show `ticker`. |
| **Caller count affected** | **0** — all flow files already use `code` correctly |
| **Suggested fix** | `dev-mcp-server` or agent-father: update `docs/agents/tools/list/get_technical_indicators.md` param name from `ticker` → `code`. Update the example in `docs/agents/tools/package/market-watcher.md` to match. |

---

## NON-ISSUES / VERIFIED CLEAN (re-confirmed or new)

### N-01 — send_telegram `message` param — confirmed correct, 0 wrong callers
Re-verified: `docs/agents/tools/list/send_telegram.md` param = `message`. All 9 observed call sites in flow files use `message:`. SSOT consistent. No action needed.

### N-02 — post_agent_signal enum contract — verified OK
Live schema requires `signal_type` ∈ `{urgent_news, price_anomaly, cross_validate, suppress, chain_catalyst, fundamental_validation, price_confirmation, verified_chain, signal_feedback, legal_risk, verified_decision}`. All usages in flow files (system-auditor: `signal_feedback`, news-scout: `urgent_news/chain_catalyst/price_confirmation/cross_validate`, market-watcher: `price_anomaly/price_confirmation`) are valid. No drift.

### N-03 — get_cycle_bootstrap schema — verified OK
Requires `agent_name` (enum: `news-scout | financial-analyst | market-watcher | alert-commander | digest-predict | qa-responder | unified-agent | report-analyzer | bctc-analyst`). All package docs and flow files pass correct agent names.

---

## TOOLS VERIFIED HEALTHY (this cycle)

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ OK | Returns agent_signals + market_context + system_status |
| `get_market_snapshot` | ✅ OK | VN-Index 1806.2, breadth live |
| `get_macro_snapshot` | ✅ OK | Oil/gold/USD/VND all live tier-1 |
| `get_system_status` | ✅ OK | Circuit breakers all closed; errors are in F-01/F-03 |
| `get_cron_health` | ✅ OK | 65 crons; F-04 noted above |
| `get_pipeline_health` | ✅ OK | 35/41 tickers TA-ready |
| `get_vps_proxy_health` | ✅ OK (bctc stale) | prices/news/sbv routes healthy |
| `get_vps_service_health` | ✅ OK | All 5 services healthy or idle |
| `get_rate_limit_status` | ✅ OK | 11/11 sources ready |
| `get_sla_status` | ✅ OK (bctc breach) | bctc SLA breached — F-01 |
| `get_earnings_calendar` | ✅ OK | Q1-2026 calendar current |
| `get_week_period` | ✅ OK | Canonical periodKey returned |
| `get_technical_indicators` | ✅ OK (doc wrong) | Works with `code=`; SSOT doc says `ticker` — I-01 |
| `get_price_history` | ✅ OK | FPT 5d bars returned |
| `get_ticker_intelligence` | ✅ OK | FPT brief returned |
| `get_macro_snapshot` | ✅ OK | Carry/yield/oil/gold signals |
| `task_claim` / `task_release` | ✅ OK | Round-trip confirmed (claimed=true, ok=true) |
| `get_vps_service_health` | ✅ OK | vn-sbv-fetch now healthy (R-01) |
| `get_cron_health` | ✅ OK | intelligenceCycleJob 98.7% |

---

## Cron Health Highlights

| Cron | Rate | Avg Duration | Delta vs Prior | Note |
|------|------|-------------|----------------|------|
| `intelligenceCycleJob` | 98.7% | 50.2s | ≈ | OK |
| `bctcReparseJob` | 82.4% | 263.7s | ≈ (174→176 runs) | ISSUE F-04 |
| `vnstockTradingStatsRefresh` | 66.7% | 915s | ≈ (still 3 runs) | ISSUE |
| `bctcPdfPullJob` | 99.0% | 56.2s | ≈ | OK |
| `bctcQueueEnricherJob` | 99.6% | 45.2s | ≈ (runs OK, zero URLs) | BUG F-01 |
| All other crons | 99–100% | — | clean | Healthy |

---

*Report generated: 2026-06-17 14:08 UTC | Path: docs/agent-memory/health/team-tool-recheck-2026-06-17-1408.md*
