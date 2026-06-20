# Team MCP Tool Recheck — 2026-06-17 16:07 UTC

**Cycle:** 2026-06-17 16:03–16:07 UTC
**Agent:** health-recheck (scheduled routine)
**Gateway:** vn-market reachable ✅ (schema validation confirmed via get_cycle_bootstrap)
**Prior report:** team-tool-recheck-2026-06-17-1408.md
**Tools probed this cycle:** 24 tools smoke-called

---

## Summary

| Severity | Count |
|----------|-------|
| BUG / ISSUE (CRITICAL, re-confirmed, worsened) | 2 |
| ISSUE (re-confirmed, unchanged) | 2 |
| ISSUE (new this cycle) | 3 |
| RESOLVED (prior R-01 reverted to recurring ISSUE) | 1 downgrade |
| IMPROVE (carry-forward, 0 affected callers) | 1 |

---

## ACTIVE FINDINGS (re-confirmed this cycle)

### F-01 — BUG (CRITICAL): BCTC pipeline fully stalled — 188 consecutive zero-URL cycles, SLA 1163 min breached

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Tool(s)** | `get_vps_proxy_health`, `get_sla_status`, `get_system_status` |
| **Prior cycle (14:08)** | consecutive_zero_cycles=176, SLA breach 1043 min |
| **This cycle (16:07)** | consecutive_zero_cycles=**188** (+12 cycles), SLA breach **1163 min** (19.4h) vs 360 min threshold |
| **Re-probe evidence** | `get_vps_proxy_health` → `bctc: stale YES, last push 2026-06-16 18:02:24, 24h_pushes=0` |
| | `get_sla_status` → `bctc: 1163/360 min — CRITICAL` |
| | `get_system_status` → `bctcQueueEnricher: consecutive_zero_cycles=188; "0 URLs populated across all 9 items — all sources may be unavailable or geo-blocked"` |
| | `get_cron_health` → `bctcQueueEnricherJob: last_run 2026-06-17 16:00:01 (success, rate 99.6%)` — job runs but produces zero URLs |
| **Caller surface** | `docs/agents/bctc-analyst/flow/cycle.md` (all BCTC analysis passes); `docs/agents/refine_bctc_md/flow/main.md` (refine units) |
| **Caller count** | 2 agents directly blocked; system-auditor B-13/C-16 checks also affected |
| **Delta from prior** | WORSENED — 12 additional zero cycles since 14:08; SLA breach grew 120 min |
| **Suggested fix** | `dev-vps-crawls`: diagnose VPS BCTC URL scraper — `vn-bctc-fetch` service reports "healthy" but pushes 0 items. Likely source URL structure changed (ssc.gov.vn or cafef BCTC section). Also note: 11 Q1-2026 filings still marked QUÁ HẠN in `get_earnings_calendar` (BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA, VNH) — URL scraper may be looking for filed PDFs that don't exist yet. Separate the two failure modes. |

---

### F-02 — ISSUE: BDI + 5 tickers have 0 OHLCV rows — TA pipeline blind spots (UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_pipeline_health` |
| **Prior cycle (14:08)** | BDI rows=0, DAG rows=1, DLC rows=0, JSH rows=0, SIS rows=0, VDC rows=0 |
| **This cycle (16:07)** | `get_pipeline_health` → BDI rows=0, DAG rows=1, DLC rows=0, JSH rows=0, SIS rows=0, VDC rows=0 — UNCHANGED |
| **Re-probe evidence** | `get_pipeline_health` (this cycle) — confirmed all 6 tickers still have ≤1 rows, TA not ready |
| **Caller surface** | `docs/agents/market-watcher/flow/cycle.md` → `get_supply_chain_exposure()` per market cycle; pipeline data drives TA signals |
| **Caller count** | 1 agent (market-watcher); 6 watchlist tickers unavailable for TA |
| **Delta from prior** | UNCHANGED — persistent multi-day gap |
| **Suggested fix** | `dev-mainserver-crawls` or `dev-stock-price`: restore OHLCV data feed for BDI (Baltic Dry Index — macro proxy), DAG, DLC, JSH, SIS, VDC. These are thin/OTC tickers on HNX/UPCOM that may need a different price source. |

---

### F-03 — ISSUE: Reuters RSS + Trading Economics dead — 29 consecutive errors each (WORSENED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_system_status` |
| **Prior cycle (14:08)** | 7 consecutive errors each (escalated from 1 in 12:07 report) |
| **This cycle (16:07)** | `Reuters RSS: Ngưng (stopped), 29 consecutive errors, chưa bao giờ thành công (never succeeded this session)` |
| | `Trading Economics (×2): Ngưng (stopped), 29 consecutive errors, chưa bao giờ thành công` |
| **Re-probe evidence** | `get_system_status` source health table (this cycle) — Reuters and TradingEconomics (2 entries) all show Ngưng/29 errors |
| **Context** | Server uptime = 2h 41m (restarted 13:22 UTC). Errors have accumulated since restart. Circuit breaker trips at ~29 cycles = consistent with ~5-min poll cadence |
| **Caller surface** | `news-scout/flow/cycle.md` → `fetch_and_analyze()` uses news feeds; `market-watcher` uses macro context from trading-economics |
| **Caller count** | 2 agents; `fetch_and_analyze` still works (returning cafef/vnexpress) but Reuters coverage lost; TradingEconomics macro data missing |
| **Delta from prior** | WORSENED — 7→29 errors; still never succeeded since server restart at 13:22 |
| **Suggested fix** | `dev-mainserver-crawls`: investigate Reuters RSS endpoint (possible URL rotation or auth change). Investigate TradingEconomics — likely geo-blocked or rate-limited; check if TRADING_ECONOMICS_API_KEY is needed. Circuit breaker will hold until failures clear. |

---

### F-04 — ISSUE: bctcReparseJob 82.4% success rate (persistent, 176 runs, UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_cron_health` |
| **Prior cycle (14:08)** | 82.4%, 176 runs |
| **This cycle (16:07)** | `bctcReparseJob: success_rate=0.82 (82.4%), total_runs=176, avg_duration=263733ms (~4.4 min)` |
| **Re-probe evidence** | `get_cron_health` (this cycle) — identical; no new runs between 14:08 and 16:07 (next scheduled: 16:00:01 may run soon) |
| **Caller surface** | BCTC PDF extraction pipeline; feeds `get_bctc_full`, `get_bctc_series` — used by `bctc-analyst` |
| **Caller count** | 1 agent (bctc-analyst) + refine_bctc_md |
| **Delta from prior** | UNCHANGED — same failure rate, persistent across 176 runs |
| **Suggested fix** | `dev-pdf-extractor`: add per-PDF exception boundary — isolate corrupt/oversized PDFs so one failure doesn't abort the full batch. avg_duration 4.4 min suggests OCR timeout on some PDFs. Add timeout-per-file guard. |

---

### F-05 — ISSUE (NEW / RECURRING): vn-sbv-fetch VPS service UNHEALTHY again

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_vps_service_health` |
| **Prior cycle (14:08)** | Marked RESOLVED (R-01): vn-sbv-fetch healthy at 14:08 |
| **This cycle (16:07)** | `vn-sbv-fetch: unhealthy \| last poll 4m ago \| response_ms=0 \| uptime 1h 14m` — REVERTED |
| **Contradiction** | `get_vps_proxy_health` → `sbv: last push 2026-06-17 15:58:49 (4 min ago), 32 24h-pushes, status ok` — SBV data IS flowing |
| **Re-probe evidence** | `get_vps_service_health` (this cycle) summary: "1 unhealthy — VPS services may be down or network latency high" |
| **Caller surface** | system-auditor Tier-2 → B-07 VPS route check flags unhealthy services; WORK channel alert threshold |
| **Caller count** | 1 agent (system-auditor) — false WARN trigger risk |
| **Delta from prior** | REVERTED from RESOLVED — recurring pattern: healthy at 14:08, unhealthy at 16:07 |
| **Suggested fix** | `dev-vps-crawls` or `dev-mcp-server`: investigate vn-sbv-fetch health check endpoint — `response_ms=0` with `unhealthy` despite live data delivery suggests the /health HTTP endpoint is broken or not responding, while the push path works fine. Fix the health-check endpoint separately from the data push path. |

---

### F-06 — ISSUE (NEW): `get_ism_subcomponents` returns no_data — FRED_API_KEY not configured

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_ism_subcomponents` |
| **Probe** | `call_tool(server="vn-market", tool="get_ism_subcomponents", arguments={})` |
| **Response** | `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` |
| **Caller-surface grep** | `grep -r "get_ism_subcomponents" docs/agents/tools/package/` → `news-scout.md` lists it; `bctc-analyst.md` lists it. Flow files: `docs/agents/news-scout/flow/stage-bootstrap.md` and `docs/agents/bctc-analyst/flow/stage-pass-rpt.md` |
| **Caller count** | 2 agents reference this tool; calls return `no_data` silently (not a crash) |
| **Suggested fix** | Configure `FRED_API_KEY` in mcp-server env to populate `fred_series_daily` ISM rows, OR mark tool in docs as "requires FRED_API_KEY — returns no_data if not configured." Agents should already handle the `error: no_data` gracefully per cowork-error-boundary skill. |

---

### F-07 — ISSUE (NEW): `get_vn_macro_indicators` degraded — NSO Excel unreachable via VPS proxy

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_vn_macro_indicators` |
| **Probe** | `call_tool(server="vn-market", tool="get_vn_macro_indicators", arguments={})` |
| **Response** | `{"status":"degraded","iip":[],"blocked_reason":"nso_excel_cache: ... vpsFetch: read response body from https://www.nso.gov.vn/wp-content/uploads/2026/06/02.-Bieu-T5.2026-final.xlsx: context deadline exceeded"}` |
| **Caller-surface grep** | `grep -r "get_vn_macro_indicators" docs/agents/` → used in `market-watcher/flow/cycle.md` (macro regime context) |
| **Caller count** | 1 agent (market-watcher); tool returns graceful degraded status, data is empty |
| **Suggested fix** | `dev-vps-crawls`: investigate NSO Excel endpoint timeout — `02.-Bieu-T5.2026-final.xlsx` at nso.gov.vn may have URL change for May 2026 data or VPS proxy timeout needs increasing. Verify if Excel filename pattern changes monthly. |

---

## DOWNGRADED (Prior RESOLVED → Recurring ISSUE)

### Prior R-01 → Now F-05 (Recurring)

vn-sbv-fetch was marked RESOLVED at 14:08 (healthy) but returned UNHEALTHY at 16:07. This is a recurring oscillation — the service health check flaps while the underlying sbv data delivery works. Reclassified as ISSUE F-05 (recurring health-check reporting bug).

---

## IMPROVEMENTS (carry-forward, 0 affected callers)

### I-01 — IMPROVE: `get_technical_indicators` SSOT doc lists `ticker` but live schema requires `code`

| Field | Value |
|-------|-------|
| **Class** | IMPROVE |
| **Tool** | `get_technical_indicators` |
| **Evidence** | `docs/agents/tools/list/get_technical_indicators.md` param listed as `ticker`; live schema requires `code`. Probe: `{ticker:"FPT"}` → "code Required" error; `{code:"FPT"}` → full TA data. |
| **Caller-surface grep** | `grep -r "get_technical_indicators" docs/agents/` → `market-watcher/flow/cycle.md` uses `code` ✅; `fb-market-poster/flow/main.md` uses `{"code":ticker}` ✅. All flow callers are correct. |
| **Caller count affected** | **0** — all flow files already use `code` |
| **Suggested fix** | Update `docs/agents/tools/list/get_technical_indicators.md` param from `ticker` → `code`. Update example in `docs/agents/tools/package/market-watcher.md`. Low priority. |

---

## TOOLS VERIFIED HEALTHY (this cycle)

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ OK | agent_name required (enum); returns signals + market context + system status |
| `get_market_snapshot` | ✅ OK | VN-Index 1806.2, source_tier=2, breadth live |
| `get_macro_snapshot` | ✅ OK | Oil $79.59, gold $4378.7, USDVND 26113, all live tier-1 |
| `get_system_status` | ✅ OK | DB 281.91MB, WAL 1.09MB, 0 open circuits |
| `get_cron_health` | ✅ OK | 65 crons reported; see F-01/F-04 for exceptions |
| `get_pipeline_health` | ✅ OK | 35/41 tickers TA-ready; see F-02 for 6 stale tickers |
| `get_vps_proxy_health` | ✅ OK | prices/news/sbv healthy; bctc stale (F-01) |
| `get_vps_service_health` | ⚠️ F-05 | vn-sbv-fetch unhealthy but data flowing; health-check flap |
| `get_rate_limit_status` | ✅ OK | 11/11 sources ready, 0 at limit |
| `get_sla_status` | ✅ OK | bctc CRITICAL breach (F-01); price/news/sbv/ff OK |
| `get_earnings_calendar` | ✅ OK | Q1-2026 calendar current; 11 QUÁ HẠN tickers |
| `get_alerts` | ✅ OK | Returns live alerts with full detail |
| `get_agent_signals` | ✅ OK | `agent` param required (confirmed); signal_type server-side filter works |
| `get_market_summary` | ✅ OK | `period` param required (enum); daily summary returned |
| `fetch_and_analyze` | ✅ OK | 20 articles fetched, cafef/vnexpress active |
| `get_fed_liquidity_spread` | ✅ OK | EFFR 3.63, IORB 3.65, spread -0.02 |
| `get_foreign_flow` | ✅ OK | VCB net_sell MEDIUM, daily history returned |
| `get_watchlist` | ✅ OK | 41 tickers with prices and thresholds |
| `task_list_held` | ✅ OK | 10 locks returned; cowork-leader + published slots |
| `get_bctc_refined` | ✅ OK | Graceful error on missing report_id |
| `get_macro_snapshot` | ✅ OK | Carry/yield/oil/gold signals all live |
| `get_ism_subcomponents` | ⚠️ F-06 | Returns no_data (FRED_API_KEY missing) |
| `get_vn_macro_indicators` | ⚠️ F-07 | Returns degraded (NSO Excel VPS timeout) |
| `get_system_status` | ✅ OK | Uptime 2h41m; bctcQueueEnricher 188 zero cycles (F-01) |

---

## Cron Health Highlights

| Cron | Rate | Avg Duration | Delta vs Prior | Note |
|------|------|-------------|----------------|------|
| `intelligenceCycleJob` | 98.7% | 49.7s | ≈ | OK |
| `bctcReparseJob` | 82.4% | 263.7s | unchanged (no new runs since 14:08) | ISSUE F-04 |
| `vnstockTradingStatsRefresh` | 66.7% | 915s | unchanged (3 total runs, low sample) | Monitor |
| `bctcPdfPullJob` | 99.0% | 55.7s | ≈ | OK |
| `bctcQueueEnricherJob` | 99.6% | 45.2s | 188 zero-URL cycles | BUG F-01 |
| All other crons | 99–100% | — | clean | Healthy |

**`vnstockTradingStatsRefresh` note:** 66.7% rate on only 3 total runs (2 success, 1 fail). Low sample; avg_duration 915s (15 min) suggests large data fetch. Not yet classified as ISSUE — needs 10+ runs to establish pattern.

---

## Schema / Contract Notes (verified clean)

- **`send_telegram`**: param = `message` (not `text`). All 9+ call sites in flow files use `message:`. ✅ Confirmed N-01 from prior.
- **`post_agent_signal`**: signal_type enum {urgent_news, price_anomaly, cross_validate, suppress, chain_catalyst, fundamental_validation, price_confirmation, verified_chain, signal_feedback, legal_risk, verified_decision}. All agent flow usages valid. ✅
- **`get_cycle_bootstrap`**: agent_name enum matches all callers. ✅
- **`get_financial_summary`**: requires `actionCode` (not `ticker`/`code`). Caller (market-analyst/flow/main.md) uses `actionCode` correctly. ✅

---

*Report generated: 2026-06-17 16:07 UTC | Path: docs/agent-memory/health/team-tool-recheck-2026-06-17-1607.md*
