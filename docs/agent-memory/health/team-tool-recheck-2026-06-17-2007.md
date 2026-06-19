# Team MCP Tool Recheck — 2026-06-17 20:07 UTC

**Cycle:** 2026-06-17 20:04–20:07 UTC
**Agent:** health-recheck (scheduled routine)
**Gateway:** vn-market reachable ✅ (confirmed via get_cycle_bootstrap at 20:04)
**Prior report:** team-tool-recheck-2026-06-17-1807.md
**Tools probed this cycle:** 32 tools smoke-called

---

## Summary

| Severity | Count |
|----------|-------|
| BUG / ISSUE (CRITICAL, re-confirmed, WORSENED) | 2 |
| ISSUE (re-confirmed, UNCHANGED) | 3 |
| RESOLVED (F-05 recovered) | 1 |
| NEW ISSUE (first detection this cycle) | 1 |
| NEW IMPROVE (first detection this cycle) | 1 |
| IMPROVE carry-forward (0 affected callers) | 1 |

---

## ACTIVE FINDINGS (re-confirmed this cycle)

### F-01 — BUG (CRITICAL): BCTC pipeline fully stalled — 218 consecutive zero-URL cycles, SLA 1402 min breached (WORSENED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Tool(s)** | `get_vps_proxy_health`, `get_sla_status`, `get_system_status`, `get_vps_service_health` |
| **Prior cycle (18:07)** | consecutive_zero_cycles=204, SLA breach 1283 min, vn-bctc-fetch uptime 44m |
| **This cycle (20:07)** | consecutive_zero_cycles=**218** (+14 cycles), SLA breach **1402 min** (23.4h) vs 360 min threshold |
| **Re-probe evidence** | `get_vps_proxy_health` → `bctc: stale YES, last push 2026-06-16 18:02:24, 24h_pushes=0` |
| | `get_sla_status` → `bctc: 1402/360 min — CRITICAL breached` |
| | `get_system_status` → `bctcQueueEnricher: consecutive_zero_cycles=218; "0 URLs populated across all 9 item(s) — all sources may be unavailable or geo-blocked"` |
| | `get_vps_service_health` → `vn-bctc-fetch: unhealthy \| response_ms=0 \| uptime=1d 1h 57m` |
| | `get_cron_health` → `bctcQueueEnricherJob: last_run 2026-06-17 20:00:01, success_rate=99.7%` — job runs but produces 0 URLs every cycle |
| **Masking note** | bctcQueueEnricherJob still reports "success" in cron health (zero-URL result logged as WARN but does not fail job). cronHealthAlertJob cannot detect this silently degraded state. |
| **Affected earnings calendar** | 11 Q1-2026 tickers still QUÁ HẠN: BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA — no PDF will arrive until BCTC pipeline restored |
| **Caller surface** | `docs/agents/bctc-analyst/flow/cycle.md` (all BCTC passes blocked); `docs/agents/refine_bctc_md/flow/main.md` (refine units blocked); system-auditor B-13/C-16 |
| **Caller count** | 2 agents directly blocked; 11 tickers without Q1-2026 BCTC data |
| **Delta from prior** | WORSENED — +14 zero cycles since 18:07; SLA breach grew +119 min; no recovery in 5+ hours |
| **Suggested fix** | `dev-vps-crawls`: diagnose VPS `/proxy/bctc-discover/:ticker` — vn-bctc-fetch service has been running 1d+ but pushes 0 items. Root cause likely ssc.gov.vn BCTC URL structure changed (H2-2026 season), geo-block change, or VPS scraper parsing broken. `dev-mcp-server`: make bctcQueueEnricherJob return `error` (not `success`) when consecutive_zero_cycles ≥ 10 so cronHealthAlertJob auto-detects. |

---

### F-02 — ISSUE: 6 tickers with 0 OHLCV rows — TA pipeline blind spots (UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_pipeline_health` |
| **Prior cycle (18:07)** | BDI=0, DAG=1, DLC=0, JSH=0, SIS=0, VDC=0 |
| **This cycle (20:07)** | `get_pipeline_health` → BDI rows=0, DAG rows=1, DLC rows=0, JSH rows=0, SIS rows=0, VDC rows=0 — UNCHANGED |
| **Re-probe evidence** | `get_pipeline_health` called this cycle — all 6 tickers still ≤1 rows, "TA not ready" |
| **Caller surface** | `docs/agents/market-watcher/flow/cycle.md` → TA signals; 6 watchlist tickers unavailable for TA analysis |
| **Caller count** | 1 agent (market-watcher); 6 tickers out of 41 watchlist unavailable |
| **Delta from prior** | UNCHANGED — persistent multi-day gap |
| **Suggested fix** | `dev-mainserver-crawls` or `dev-stock-price`: restore OHLCV for BDI (HNX), DAG (thin HOSE, rows=1), DLC (UPCOM), JSH (HNX), SIS (HOSE), VDC (UPCOM). HNX/UPCOM tickers may need alternate price source (VNDirect API). |

---

### F-03 — ISSUE: Reuters RSS + Trading Economics dead — 71 consecutive errors, never succeeded (WORSENED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_system_status` |
| **Prior cycle (18:07)** | 49 consecutive errors each (Ngưng) |
| **This cycle (20:07)** | `Reuters RSS: Ngưng, 71 errors, chưa bao giờ thành công`; `Trading Economics (×2): Ngưng, 71 errors, never succeeded` |
| **Re-probe evidence** | `get_system_status` source health table this cycle — all 3 instances at 71 errors |
| **Context** | Server uptime ~6h41m (restarted 13:22 UTC). ~71 errors at ~5-6 min poll = continuous failure since server restart. These sources have **never** succeeded in the current server session. |
| **Caller surface** | `news-scout/flow/cycle.md` → `fetch_and_analyze()` uses news feeds; macro callers use trading-economics. `fetch_and_analyze` still works via cafef/vnexpress but Reuters and TradingEconomics coverage is fully absent. |
| **Caller count** | 2 agents degraded (news-scout, unified-agent); no crash but reduced coverage |
| **Delta from prior** | WORSENED — 49→71 errors; no recovery since server restart 13:22 UTC (6h+ gap) |
| **Suggested fix** | `dev-mainserver-crawls`: probe Reuters RSS URL directly from main server (`/feeds.reuters.com/` path may have rotated). Investigate TradingEconomics — check if `TRADING_ECONOMICS_API_KEY` env var is set or if direct scrape path changed post-server restart. |

---

### F-04 — ISSUE: bctcReparseJob 82% success rate — OCR timeout risk (UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_cron_health` |
| **Prior cycle (18:07)** | 82.0%, 172 runs, avg_duration=263s |
| **This cycle (20:07)** | `bctcReparseJob: success_rate=0.82 (82.0%), total_runs=172, avg_duration=263463ms (~4.4 min)` — no new run since 14:00:01 |
| **Re-probe evidence** | `get_cron_health` called this cycle — last_run 2026-06-17 14:00:01 (no new invocation between 18:07 and 20:07) |
| **Caller surface** | BCTC PDF extraction pipeline → bctc-analyst + refine_bctc_md |
| **Caller count** | 2 agents |
| **Delta from prior** | UNCHANGED — same 82% rate across 172 runs |
| **Suggested fix** | `dev-pdf-extractor`: add per-PDF exception boundary so one corrupt/oversized PDF doesn't abort full batch. avg_duration 4.4 min suggests OCR timeout on large PDFs. Add per-file timeout guard (e.g. 120s). |

---

### F-06 — ISSUE: `get_ism_subcomponents` returns no_data — FRED_API_KEY not configured (UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_ism_subcomponents` |
| **Prior cycle (18:07)** | no_data — FRED_API_KEY missing |
| **This cycle (20:07)** | `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` — IDENTICAL |
| **Re-probe evidence** | Direct tool probe this cycle — same error verbatim |
| **Caller surface** | `docs/agents/tools/package/news-scout.md`; `docs/agents/tools/package/bctc-analyst.md`; `docs/agents/tools/package/unified-agent.md`. Agents handle no_data gracefully via cowork-error-boundary. |
| **Caller count** | 3 agents degraded; PMI regime signal unavailable (`get_investment_clock_phase` returns `pmi: null`) |
| **Delta from prior** | UNCHANGED |
| **Suggested fix** | Configure `FRED_API_KEY` in mcp-server `.env`. Without it, `get_ism_subcomponents`, PMI in `get_investment_clock_phase`, and ISM-driven regime signals are all dark. |

---

## RESOLVED THIS CYCLE

### R-01 (was F-05): `vn-sbv-fetch` VPS service unhealthy — RESOLVED ✅

| Field | Value |
|-------|-------|
| **Prior (18:07)** | `vn-sbv-fetch: unhealthy, response_ms=0, VPS uptime 44m` |
| **This cycle (20:07)** | `get_vps_service_health` → `vn-sbv-fetch: healthy \| last poll 4m ago \| response_ms=0` |
| **Re-probe evidence** | `get_vps_service_health` called this cycle — vn-sbv-fetch now shows "healthy" |
| **SBV proxy push** | `get_vps_proxy_health` → `sbv: last push 2026-06-17 19:58:59, 40 24h-pushes, status ok` — data flowing correctly |
| **Delta** | RESOLVED — health endpoint recovered since 18:07. Likely transient restart artifact. Monitoring warranted. |

---

## NEW FINDINGS (first detection this cycle)

### N-01 — ISSUE: BDI shipping index data stale 71 days — supply chain signal degraded

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_supply_chain_exposure` |
| **This cycle evidence** | `BDI: 1,400 (+0.0%) - 2026-04-07` — shipping index data is 71 days old (current date 2026-06-17) |
| **Expected cadence** | BDI is a daily market indicator; 71 days stale makes it non-actionable for supply chain analysis |
| **Caller surface** | `docs/agents/tools/package/market-watcher.md` → `get_supply_chain_exposure`; `docs/agents/tools/package/unified-agent.md` → same |
| **Caller count** | 2 agents receive stale BDI data without any staleness warning in the response |
| **Grep run** | `grep -rn "supply_chain" docs/agents/market-watcher/flow/ docs/agents/unified-agent/flow/` → both call `get_supply_chain_exposure` in cycle.md without staleness guard |
| **Suggested fix** | `dev-mcp-server` or `dev-macro-indicators`: restore BDI data feed. Add staleness guard to `get_supply_chain_exposure` — if BDI data > 7 days old, include `data_age_warning` field so callers can downgrade signal confidence. |

---

### N-02 — IMPROVE: Cascade metrics show 0 evaluated outcomes despite 2000+ rule hits — accuracy tracking not operational

| Field | Value |
|-------|-------|
| **Class** | IMPROVE |
| **Tool(s)** | `get_cascade_metrics` |
| **This cycle evidence** | All 46 cascade rules have `Eval=0` and `WinRate=—` despite combined 2000+ hits over 30 days. `Overall accuracy: — (0 evaluated)` |
| **cascade-backtest cron** | Runs daily, `success_rate=100%`, `avg_duration=1553ms` — but its output does not populate evaluation counts |
| **Impact** | No cascade rule accuracy data available to unified-agent, alert-commander, or market-watcher for confidence weighting. Agents cannot distinguish high-accuracy from noisy rules. |
| **Caller surface** | `docs/agents/tools/package/unified-agent.md` → `get_cascade_metrics`; flow files that use cascade confidence for synthesis |
| **Suggested fix** | `dev-mcp-server`: verify `record_signal_outcome` is being called with `signal_id` values that match cascade rule keys. OR wire `cascadeBacktestJob` to populate the `eval` + `win_rate` columns from historical backtest runs. Without outcome recording, cascade accuracy remains permanently unknown. |

---

## IMPROVEMENTS (carry-forward, re-confirmed)

### I-01 — IMPROVE: `get_technical_indicators` SSOT doc says `ticker`; live schema requires `code` (UNCHANGED, 0 affected callers)

| Field | Value |
|-------|-------|
| **Class** | IMPROVE |
| **Tool** | `get_technical_indicators` |
| **Re-probe evidence (this cycle)** | `call_tool(..., {"code":"VCB"})` → full TA data returned ✅ (RSI14=49.5, MACD, BB all present) |
| **Grep command run** | `grep -rn "get_technical_indicators" docs/agents --include="*.md"` — runtime flow callers use `code:` correctly; only static doc examples are wrong |
| **Caller count affected** | **0** — all runtime flow callers already use correct `code` param |
| **Historical note** | Flagged since 2026-05-12; doc not yet corrected |
| **Suggested fix** | Update `docs/agents/tools/list/get_technical_indicators.md` and `docs/agents/tools/package/market-watcher.md` example (line ~177): `ticker` → `code`. Low-priority doc fix. |

---

## TOOLS VERIFIED HEALTHY (this cycle)

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ OK | 24ms total (signals 8ms, context 16ms, status 1ms). Returns agent_signals + market_context + system_status |
| `get_system_status` | ✅ OK | DB 281.91 MB, WAL 3.37 MB, 0 open circuits, 16 CBs healthy; see F-01/F-03 for exceptions |
| `get_market_snapshot` | ✅ OK | VN-Index 1806.2 (-0.10%), source_tier=2, breadth 168A/129D/65U, source: vndirect API |
| `get_macro_snapshot` | ✅ OK | Oil $78.84, Gold $4245.9, USDVND 26113, carry/yield signals live, source_tier=2 |
| `get_cron_health` | ✅ OK | 65+ crons; all at 98-100% except F-01/F-04 items; vnstockTradingStatsRefresh 66.7% / 3 runs (monitoring) |
| `get_pipeline_health` | ✅ OK | 35/41 tickers TA-ready; see F-02 for 6 stale; Non-neutral TA signals: 2 (DPM oversold RSI14=29.2, NKG oversold RSI14=27.7) |
| `get_vps_proxy_health` | ✅ OK | prices/news/sbv healthy; bctc stale (F-01) |
| `get_vps_service_health` | ✅ OK | vn-sbv-fetch: healthy (F-05 RESOLVED); vn-bctc-fetch: unhealthy (F-01 BCTC stall) |
| `get_rate_limit_status` | ✅ OK | 14 sources; all at wait=0s, "Sẵn sàng" (ready) |
| `get_sla_status` | ✅ OK | bctc CRITICAL breach (F-01); price/news/sbv_fx/ff OK |
| `get_alerts` | ✅ OK | Returns alerts correctly; 20 open alerts in 24h, HIGH: gold macro deviation +2.76σ |
| `get_earnings_calendar` | ✅ OK | Q1-2026 calendar current; 11 QUÁ HẠN tickers |
| `get_sector_rotation` | ✅ OK | Returns 16 sectors; note: "only 1 day data — not enough for 5 sessions" (expected off-hours) |
| `get_market_context` | ✅ OK | Returns watchlist prices + macro + alerts — same as get_cycle_bootstrap.market_context |
| `get_fed_liquidity_spread` | ✅ OK | EFFR=3.63, IORB=3.65, spread=-0.02, trend=stable, samples=40, asOf=2026-06-15 |
| `get_earnings_calendar` | ✅ OK | 41 tickers; 11 overdue (F-01 related) |
| `get_bctc_full` | ✅ OK | VCB Q1-2026 returns structured data, confidence=75%; MINOR: company name field empty |
| `get_portfolio_conviction` | ✅ OK | Returns 41-ticker conviction dashboard with kinh-dich readings |
| `get_crisis_early_warning` | ✅ OK | Returns 0 crisis signals; 2 reputation warnings (GAS score=40, VNM score=47) |
| `get_legal_risk_signals` | ✅ OK | 11 active legal signals; JSH chairman arrest, DIG forced liquidation, VPB lending audit |
| `get_supply_chain_exposure` | ⚠️ N-01 | Returns data but BDI 71 days stale (see N-01) |
| `get_agent_signals` | ✅ OK | `agent` param required; "Không có tín hiệu mới" — no new signals (expected off-market) |
| `get_watchlist` | ✅ OK | 41 tickers with prices and thresholds |
| `get_cascade_metrics` | ⚠️ N-02 | Returns data but 0 evaluated outcomes (see N-02) |
| `get_technical_indicators` | ✅ OK | code="VCB" → RSI14=49.5, MACD, BB, MA all returned; source_tier=3 |
| `get_kinhdich_reading` | ✅ OK | code="VCB" → Quẻ 23 Bác, 25% confidence |
| `task_list_held` | ✅ OK | Returns `{"locks":[],"count":0}` — no orphaned locks |
| `get_prediction_markets` | ✅ OK | 1 active Polymarket contract; signal_count=0; last poll 20:00 UTC |
| `get_positions` | ✅ OK | Returns 1 position: FPT 5000 shares @ 80,300, currently -10% |
| `get_open_chain_findings` | ✅ OK | Returns empty findings (expected: no recent chain runs) |
| `get_investment_clock_phase` | ✅ OK | phase=Overheat, pmi=null (FRED_API_KEY issue F-06), cpi=5.46, source_tier=2 |
| `get_market_foreign_flow` | ✅ OK | 2026-06-17: NET SELL -3.09M; top sellers: VIC -1.15M, TCB -607K, FPT -390K |

---

## Cron Health Highlights

| Cron | Rate | Avg Duration | Delta vs 18:07 | Note |
|------|------|-------------|----------------|------|
| `intelligenceCycleJob` | 98.7% | 48.6s | ≈ | OK |
| `bctcReparseJob` | 82.0% | 263.5s | UNCHANGED (no new run) | ISSUE F-04 |
| `vnstockTradingStatsRefresh` | 66.7% | 915.5s | UNCHANGED (3 runs total) | Monitor — low sample |
| `bctcPdfPullJob` | 99.1% | 53.9s | ≈ | OK |
| `bctcQueueEnricherJob` | 99.7% | 44.9s | 218 zero-URL cycles (+14) | BUG F-01 |
| All other crons | 99–100% | — | clean | Healthy |

**`vnstockTradingStatsRefresh`:** 3 total runs, 66.7% (2 success / 1 fail). avg_duration=915s (~15 min). Still insufficient sample for ISSUE classification. Next threshold check at 10+ runs.

---

## Schema / Contract Notes (verified this cycle)

- **`send_telegram`**: param = `message` (not `text`). All flow file call sites confirmed correct. ✅
- **`get_cycle_bootstrap`**: `agent_name` enum confirmed: news-scout | market-watcher | alert-commander | digest-predict | qa-responder | unified-agent | bctc-analyst. ✅
- **`task_claim`**: `task_kind` enum = cowork-slot | sprint-task | dashboard-row | commit-mutex. task_list_held returns empty — no orphans. ✅
- **`post_agent_signal`**: schema unchanged; all agent flow usages correct. ✅
- **`get_technical_indicators`**: live schema requires `code` not `ticker` (I-01 — doc drift, 0 runtime callers affected). ✅

---

*Report generated: 2026-06-17 20:07 UTC | Path: docs/agent-memory/health/team-tool-recheck-2026-06-17-2007.md*
