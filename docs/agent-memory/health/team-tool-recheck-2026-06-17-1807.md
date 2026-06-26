# Team MCP Tool Recheck — 2026-06-17 18:07 UTC

**Cycle:** 2026-06-17 18:04–18:08 UTC
**Agent:** health-recheck (scheduled routine)
**Gateway:** vn-market reachable ✅ (schema validation confirmed via get_cycle_bootstrap, get_market_snapshot)
**Prior report:** team-tool-recheck-2026-06-17-1607.md
**Tools probed this cycle:** 22 tools smoke-called

---

## Summary

| Severity | Count |
|----------|-------|
| BUG / ISSUE (CRITICAL, re-confirmed, worsened) | 2 |
| ISSUE (re-confirmed, unchanged) | 4 |
| RESOLVED (F-07 recovered) | 1 |
| IMPROVE (carry-forward, 0 affected callers) | 1 |

---

## ACTIVE FINDINGS (re-confirmed this cycle)

### F-01 — BUG (CRITICAL): BCTC pipeline fully stalled — 204 consecutive zero-URL cycles, SLA 1283 min breached (WORSENED)

| Field | Value |
|-------|-------|
| **Class** | BUG |
| **Tool(s)** | `get_vps_proxy_health`, `get_sla_status`, `get_system_status` |
| **Prior cycle (16:07)** | consecutive_zero_cycles=188, SLA breach 1163 min |
| **This cycle (18:07)** | consecutive_zero_cycles=**204** (+16 cycles), SLA breach **1283 min** (21.4h) vs 360 min threshold |
| **Re-probe evidence** | `get_vps_proxy_health` → `bctc: stale YES, last push 2026-06-16 18:02:24, 24h_pushes=0` |
| | `get_sla_status` → `bctc: 1283/360 min — CRITICAL` |
| | `get_system_status` → `bctcQueueEnricher: consecutive_zero_cycles=204; "0 URLs populated across all 9 item(s) — all sources may be unavailable or geo-blocked"` |
| | `get_cron_health` → `bctcQueueEnricherJob: last_run 2026-06-17 18:00:01 (success, rate 99.7%)` — job runs but produces zero URLs |
| **Masking note** | bctcQueueEnricherJob reports "success" in cron health even with 204 zero-URL cycles. The cron wrapper catches no exception — zero-URL result is logged as WARN but does not fail the job. cronHealthAlertJob cannot detect this. |
| **Caller surface** | `docs/agents/bctc-analyst/flow/cycle.md` (all BCTC analysis passes); `docs/agents/refine_bctc_md/flow/main.md` (refine units); system-auditor B-13/C-16 checks |
| **Caller count** | 2 agents directly blocked; 11 Q1-2026 tickers still QUÁ HẠN (BDI, BID, DAG, DLC, GAS, JSH, PLX, PPC, SIS, VDC, VEA) per `get_earnings_calendar` |
| **Delta from prior** | WORSENED — +16 zero cycles since 16:07; SLA breach grew 120 min |
| **Suggested fix** | `dev-vps-crawls`: diagnose VPS `/proxy/bctc-discover/:ticker` — `vn-bctc-fetch` service reports "healthy" but pushes 0 URL items. Likely ssc.gov.vn or cafef BCTC URL structure changed. Secondary fix: `dev-mcp-server` — make bctcQueueEnricherJob return error (not success) when zero_consecutive_cycles exceeds threshold (e.g. ≥10) so cronHealthAlertJob can auto-detect. |

---

### F-02 — ISSUE: BDI + 5 tickers have 0 OHLCV rows — TA pipeline blind spots (UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_pipeline_health` |
| **Prior cycle (16:07)** | BDI rows=0, DAG rows=1, DLC rows=0, JSH rows=0, SIS rows=0, VDC rows=0 |
| **This cycle (18:07)** | `get_pipeline_health` → BDI rows=0, DAG rows=1, DLC rows=0, JSH rows=0, SIS rows=0, VDC rows=0 — UNCHANGED |
| **Re-probe evidence** | `get_pipeline_health` called this cycle — all 6 tickers still ≤1 rows, TA not ready |
| **Caller surface** | `docs/agents/market-watcher/flow/cycle.md` → TA signals; 6 watchlist tickers unavailable |
| **Caller count** | 1 agent (market-watcher); 6 watchlist tickers unavailable for TA |
| **Delta from prior** | UNCHANGED — persistent multi-day gap |
| **Suggested fix** | `dev-mainserver-crawls` or `dev-stock-price`: restore OHLCV for BDI (HNX), DAG (thin HOSE), DLC (UPCOM), JSH (HNX), SIS (HOSE), VDC (UPCOM). HNX/UPCOM tickers may need alternate price source. |

---

### F-03 — ISSUE: Reuters RSS + Trading Economics dead — 49 consecutive errors each (WORSENED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_system_status` |
| **Prior cycle (16:07)** | 29 consecutive errors each |
| **This cycle (18:07)** | `Reuters RSS: Ngưng (stopped), 49 consecutive errors, chưa bao giờ thành công (never succeeded this session)` |
| | `Trading Economics (×2 instances): Ngưng, 49 consecutive errors, never succeeded` |
| **Re-probe evidence** | `get_system_status` source health table (this cycle) — all 3 entries show Ngưng/49 errors |
| **Context** | Server uptime ~4h41m (restarted 13:22 UTC). At ~5 min poll cadence, 49 errors = every cycle since restart. These sources have NEVER succeeded in this server session. |
| **Caller surface** | `news-scout/flow/cycle.md` → `fetch_and_analyze()` uses news feeds; macro context via trading-economics |
| **Caller count** | 2 agents; `fetch_and_analyze` still works via cafef/vnexpress, but Reuters and TradingEconomics coverage lost |
| **Delta from prior** | WORSENED — 29→49 errors; no recovery since server restart 13:22 UTC |
| **Suggested fix** | `dev-mainserver-crawls`: investigate Reuters RSS URL (feeds.reuters.com possibly rotated). Investigate TradingEconomics — check if TRADING_ECONOMICS_API_KEY needed or if direct scrape path changed. `dev-mcp-server`: consider raising circuit breaker trip threshold to distinguish transient vs permanent failures. |

---

### F-04 — ISSUE: bctcReparseJob 82% success rate (UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_cron_health` |
| **Prior cycle (16:07)** | 82.4%, 176 runs (7d window) |
| **This cycle (18:07)** | `bctcReparseJob: success_rate=0.82 (82.0%), total_runs=172, avg_duration=263463ms (~4.4 min)` |
| **Re-probe evidence** | `get_cron_health` called this cycle — last_run: 2026-06-17 14:00:01 (no new run between 16:07 and 18:07); run count 176→172 due to 7-day window rolling old entries |
| **Caller surface** | BCTC PDF extraction pipeline → `bctc-analyst` + `refine_bctc_md` |
| **Caller count** | 2 agents |
| **Delta from prior** | UNCHANGED — same failure rate persists across 172 runs |
| **Suggested fix** | `dev-pdf-extractor`: add per-PDF exception boundary so one corrupt/oversized PDF doesn't abort full batch. avg_duration 4.4 min suggests OCR timeout on large PDFs. Add timeout-per-file guard (e.g. 120s per document). |

---

### F-05 — ISSUE: vn-sbv-fetch VPS service UNHEALTHY (recurring oscillation, UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_vps_service_health` |
| **Prior cycle (16:07)** | unhealthy, response_ms=0, uptime 1h14m |
| **This cycle (18:07)** | `vn-sbv-fetch: unhealthy \| last poll 4m ago \| response_ms=0 \| VPS uptime 44m` |
| **Contradiction** | `get_vps_proxy_health` → `sbv: last push 2026-06-17 17:58:54 (9 min ago), 36 24h-pushes, status ok` — SBV data IS flowing correctly |
| **SLA note** | `get_sla_status` → `sbv_fx: 49/30 min — CRITICAL` at probe time (49 min since last push), though VPS push log shows sbv push 9 min ago. SLA breach was transient. |
| **Re-probe evidence** | `get_vps_service_health` called this cycle — summary: "1 unhealthy — VPS services may be down or network latency high" |
| **Caller surface** | system-auditor Tier-2 B-07 VPS route check → false WARN trigger risk |
| **Caller count** | 1 agent (system-auditor) |
| **Delta from prior** | UNCHANGED — recurring oscillation. Health check endpoint broken (response_ms=0 on every poll) while push path healthy. |
| **Suggested fix** | `dev-vps-crawls` or `dev-mcp-server`: fix vn-sbv-fetch health endpoint — `response_ms=0` consistently despite live data delivery. Health check probe likely hitting wrong endpoint or not starting HTTP server. Consider separate health-check process on VPS. |

---

### F-06 — ISSUE: `get_ism_subcomponents` returns no_data — FRED_API_KEY not configured (UNCHANGED)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_ism_subcomponents` |
| **Prior cycle (16:07)** | no_data — FRED_API_KEY missing |
| **This cycle (18:07)** | `{"source_tier":1,"error":"no_data","message":"fred_series_daily has no ISM sub-component rows. Run macroIndicatorRefreshJob to populate (requires FRED_API_KEY)."}` — IDENTICAL |
| **Re-probe evidence** | Direct tool probe this cycle — same error verbatim |
| **Caller surface** | `docs/agents/tools/package/news-scout.md` lists `get_ism_subcomponents`; `docs/agents/tools/package/bctc-analyst.md` lists it. Agents handle `error: no_data` gracefully per cowork-error-boundary skill. |
| **Caller count** | 2 agents; graceful degradation, not a crash |
| **Delta from prior** | UNCHANGED |
| **Suggested fix** | Configure `FRED_API_KEY` in mcp-server .env to populate `fred_series_daily` ISM rows, OR add env-availability check in `get_ism_subcomponents` tool doc to document the FRED_API_KEY dependency. |

---

## RESOLVED THIS CYCLE

### R-01 (was F-07): `get_vn_macro_indicators` — RESOLVED ✅

| Field | Value |
|-------|-------|
| **Prior (16:07)** | `status: "degraded", iip: [], blocked_reason: "nso_excel_cache: ... vpsFetch: read response body ... context deadline exceeded"` |
| **This cycle (18:07)** | `status: "ok", period: "2026-06", iip: [3 indicators with live YoY/MoM data], source: "NSO monthly Excel, sheet '2.IIPthang' (PROBE-3 PASS)"` |
| **Re-probe evidence** | Direct tool probe this cycle — full response with real IIP data |
| **Delta** | RESOLVED — NSO Excel VPS fetch succeeded in a subsequent cycle. No code change needed. Monitoring warranted (prior report showed this as first timeout). |

---

## IMPROVEMENTS (carry-forward, re-confirmed)

### I-01 — IMPROVE: `get_technical_indicators` SSOT doc says `ticker`, live schema requires `code` (UNCHANGED, 0 affected callers)

| Field | Value |
|-------|-------|
| **Class** | IMPROVE |
| **Tool** | `get_technical_indicators` |
| **Re-probe evidence (this cycle)** | `call_tool(..., arguments={"ticker":"FPT"})` → `MCP error -32602: Required field 'code' missing`; `call_tool(..., arguments={"code":"FPT"})` → full TA data returned ✅ |
| **Grep command run** | `grep -rn "\"ticker\"" docs/agents --include="*.md" \| grep "get_technical"` → `docs/agents/tools/list/get_technical_indicators.md:16: "ticker": ...` (SSOT doc wrong); `docs/agents/tools/package/market-watcher.md:177: arguments: { ticker: "FPT" }` (example wrong) |
| **Source-of-truth** | `apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts:526`: `code: z...describe("Stock ticker, e.g. VCB")` — canonical param is `code` |
| **Caller surface** | All flow files use `code` correctly: `market-watcher/flow/cycle.md` → `get_technical_indicators(code)` ✅; `fb-market-poster/flow/main.md:92` → `{"code": ticker}` ✅ |
| **Caller count affected** | **0** — all runtime flow callers already correct |
| **Historical note** | Flagged in agent-memory archive since 2026-05-12; doc not yet corrected |
| **Suggested fix** | Update `docs/agents/tools/list/get_technical_indicators.md`: `ticker` → `code`. Update example in `docs/agents/tools/package/market-watcher.md` line 177. Also update `docs/architecture/microservice/mcp-server/market-data.md` line 19. Low-priority doc fix. |

---

## TOOLS VERIFIED HEALTHY (this cycle)

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ OK | `agent_name` required (enum: market-watcher/news-scout/etc.); returns signals + context |
| `get_market_snapshot` | ✅ OK | VN-Index 1806.2 (-0.10%), source_tier=2, breadth live, 168A/129D/65U |
| `get_macro_snapshot` | ✅ OK | Oil $79.5, Gold $4376.7, USDVND 26113, carry/yield signals live |
| `get_system_status` | ✅ OK | DB 281.91MB, WAL 3.93MB, 0 open circuits, 16 CBs healthy |
| `get_cron_health` | ✅ OK | 65+ crons reported; see F-01/F-04 for exceptions |
| `get_pipeline_health` | ✅ OK | 35/41 tickers TA-ready; see F-02 for 6 stale |
| `get_vps_proxy_health` | ✅ OK | prices/news/sbv healthy; bctc stale (F-01) |
| `get_vps_service_health` | ⚠️ F-05 | vn-sbv-fetch unhealthy health-check; data flowing ok |
| `get_rate_limit_status` | ✅ OK | 12 sources tracked; 2 "waiting" (normal rate-limit state), 0 at hard limit |
| `get_sla_status` | ✅ OK | bctc CRITICAL breach (F-01); sbv_fx transient breach; price/news/ff OK |
| `get_earnings_calendar` | ✅ OK | Q1-2026 calendar current; 11 QUÁ HẠN tickers |
| `get_watchlist` | ✅ OK | 41 tickers; prices/thresholds live |
| `get_agent_signals` | ✅ OK | `agent` param required; returns recent signals |
| `fetch_and_analyze` | ✅ OK | 20 articles fetched from cafef/vnexpress; Reuters absent (F-03) |
| `get_technical_indicators` | ✅ OK | Requires `code` param (not `ticker`); FPT returns full RSI/MACD/BB |
| `get_vps_service_health` | ⚠️ | vn-sbv-fetch health-check broken; see F-05 |
| `get_bctc_pending_refine` | ✅ OK | Returns large dataset (11,948 lines); tool responsive |
| `get_ism_subcomponents` | ⚠️ F-06 | no_data (FRED_API_KEY not configured) |
| `get_vn_macro_indicators` | ✅ RESOLVED | Returns ok with IIP data (was degraded at 16:07 — R-01) |
| `task_claim` | ✅ OK | Enum validated: `task_kind` must be cowork-slot\|sprint-task\|dashboard-row\|commit-mutex |
| `get_recent_fixes` | ✅ OK | Returns 20 recent fixes with detail |
| `send_telegram` | ✅ Schema OK | param = `message` (not `text`); confirmed in flow docs across all 9 call sites |

---

## Cron Health Highlights

| Cron | Rate | Avg Duration | Delta vs Prior | Note |
|------|------|-------------|----------------|------|
| `intelligenceCycleJob` | 98.7% | 48.9s | ≈ | OK |
| `bctcReparseJob` | 82.0% | 263.5s | ≈ (4 runs aged out of 7d window) | ISSUE F-04 |
| `vnstockTradingStatsRefresh` | 66.7% | 915s | UNCHANGED (3 total runs, low sample) | Monitor |
| `bctcPdfPullJob` | 99.1% | 54.8s | ≈ | OK |
| `bctcQueueEnricherJob` | 99.7% | 45.0s | 204 zero-URL cycles | BUG F-01 |
| All other crons | 99–100% | — | clean | Healthy |

**`vnstockTradingStatsRefresh` note:** 66.7% rate on only 3 total runs (2 success, 1 fail). Sample still too small; avg_duration 915s (~15 min) suggests heavy scrape. Not yet classified as ISSUE — flag if rate stays <80% past 10 runs.

---

## Schema / Contract Notes (verified this cycle)

- **`send_telegram`**: param = `message` (not `text`). All flow file call sites use `message:`. ✅
- **`post_agent_signal`**: signal_type enum valid; all agent flow usages correct. ✅
- **`get_cycle_bootstrap`**: `agent_name` enum required — valid values: news-scout | financial-analyst | market-watcher | alert-commander | digest-predict | qa-responder | unified-agent | report-analyzer | bctc-analyst. All package docs specify correct value. ✅
- **`task_claim`**: `task_kind` enum = cowork-slot | sprint-task | dashboard-row | commit-mutex. Probe confirmed. ✅

---

*Report generated: 2026-06-17 18:07 UTC | Path: docs/agent-memory/health/team-tool-recheck-2026-06-17-1807.md*
