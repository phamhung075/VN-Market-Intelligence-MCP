# Team MCP Tool Recheck — 2026-06-17 12:07 UTC

**Cycle:** 2026-06-17 12:05–12:07 UTC
**Agent:** health-recheck (scheduled routine)
**Gateway:** vn-market reachable ✅ (schema validation confirmed)
**Tools probed:** 34 tools smoke-called this cycle

---

## Summary

| Severity | Count |
|----------|-------|
| ISSUE (CRITICAL) | 1 |
| ISSUE | 3 |
| IMPROVE | 2 |
| RESOLVED / NON-ISSUE | 1 |

---

## ACTIVE FINDINGS (re-confirmed this cycle)

### F-01 — ISSUE (CRITICAL): BCTC VPS push stale + bctcQueueEnricher 162 consecutive zero-URL cycles

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_vps_proxy_health`, `get_sla_status`, `get_system_status`, `get_bctc_pending_refine` |
| **Evidence (this cycle)** | `get_vps_proxy_health` → `bctc: stale: YES, last push 2026-06-16 18:02:24 (18h ago)` |
| | `get_sla_status` → `bctc: 923 min elapsed vs 360 min SLA — CRITICAL breach` |
| | `get_system_status` → `bctcQueueEnricher: consecutive_zero_cycles=162` + `"0 URLs populated across all 9 items — all sources may be unavailable or geo-blocked"` |
| | `get_bctc_pending_refine` → 5+ PDFs stuck PENDING/PARTIAL: VCB Q1-2025 (PARTIAL), HPG/GVR/HVN Q1-2026 (PENDING) |
| **Caller surface** | `bctc-analyst/flow/cycle.md` (all BCTC analysis passes), `refine_bctc_md/flow/main.md` (all refine units) |
| **Caller count** | 2 agents directly blocked; system-auditor check B-13/C-16 also affected |
| **Grep run** | `grep -r "bctc" docs/agents/bctc-analyst/flow/` → confirmed bctc-analyst depends on bctcQueueEnricher for report discovery |
| **Impact** | BCTC analyst cannot discover new Q1-2026 reports to analyze. refine_bctc_md queue growing (4+ PENDING PDFs visible). bctcQueueEnricher has been zero for 162 cycles — this is a systemic source outage, not a transient glitch. |
| **Suggested fix** | `dev-vps-crawls`: diagnose VPS BCTC URL scraper — check if source URLs changed, geo-block added, or VPS BCTC service route broken. The `vn-bctc-fetch` VPS service reports "healthy" but pushes nothing — investigate the scraper logic for the URL population step. |

---

### F-02 — ISSUE: BDI (Baltic Dry Index) data stale 70+ days

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_supply_chain_exposure`, `get_pipeline_health` |
| **Evidence (this cycle)** | `get_supply_chain_exposure` → `BDI: 1,400 (+0.0%) — 2026-04-07` (70+ days ago) |
| | `get_pipeline_health` → `BDI: rows=0 \| TA not ready` |
| **Caller surface** | `market-watcher/flow/cycle.md` Step "Supply chain + sector": `get_supply_chain_exposure()` called each cycle |
| **Caller count** | 1 agent (market-watcher) uses this signal every cycle |
| **Impact** | Supply chain analysis missing live BDI signal. Market-watcher reports `BDI/rates` as stale. The shipping cost signal, used for supply chain risk assessment, has been absent for 10+ weeks. |
| **Suggested fix** | `dev-mainserver-crawls` or `dev-vps-crawls`: restore BDI feed. Check if the BDI scraper endpoint changed (Investing.com / Baltic Exchange source). The `DAG` and `DLC` watchlist tickers also show `rows=0` in pipeline health — likely the same data-feed gap. |

---

### F-03 — ISSUE: vn-sbv-fetch VPS service UNHEALTHY (fallback active)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_vps_service_health`, `get_vps_proxy_health`, `get_macro_snapshot` |
| **Evidence (this cycle)** | `get_vps_service_health` → `vn-sbv-fetch: unhealthy \| 44m uptime` |
| | `get_vps_proxy_health` → `sbv: last push 2026-06-17 11:58:42 (ok, 5 min ago)` — fallback source active |
| | `get_macro_snapshot` → USD/VND 26113 returning correctly |
| **Caller surface** | `news-scout`, `market-watcher`, `unified-agent` all call `get_macro_snapshot` which sources SBV FX rates |
| **Caller count** | 3 agents; data currently unaffected due to fallback |
| **Impact** | Degraded: SBV FX data currently served from fallback. If fallback fails too, USD/VND, SBV deposit rate signals go stale — `get_macro_snapshot` carry-signal would become estimate. |
| **Suggested fix** | `ops` / `dev-vps-crawls`: investigate vn-sbv-fetch unhealthy state — low uptime (44m) suggests recent crash/restart cycle. Check VPS service logs. |

---

### F-04 — ISSUE: vnstockTradingStatsRefresh low success rate (66.7%), extreme duration (15 min avg)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_cron_health` |
| **Evidence (this cycle)** | `vnstockTradingStatsRefresh: success_rate=0.67 (66.7%), total_runs=3, avg_duration=915464ms (~15.3 min)` |
| **Caller surface** | Feeds stock fundamentals data used by `get_ticker_intelligence`, `get_financial_summary` |
| **Caller count** | Indirect: market-watcher and bctc-analyst call `get_ticker_intelligence` each cycle |
| **Impact** | 33% of runs failing; 15-minute average duration suggests timeout or source rate-limit issue. Missing fundamentals data degrades ticker intelligence quality. |
| **Suggested fix** | `dev-stock-price`: investigate vnstockTradingStatsRefresh — check VNStock API endpoint availability, timeout config, and retry logic. Consider reducing batch size or adding circuit breaker. |

---

### F-05 — ISSUE: bctcReparseJob 82.2% success rate (persistent, 174 runs)

| Field | Value |
|-------|-------|
| **Class** | ISSUE |
| **Tool(s)** | `get_cron_health` |
| **Evidence (this cycle)** | `bctcReparseJob: success_rate=0.82 (82.2%), total_runs=174, avg_duration=266764ms (~4.5 min)` |
| **Caller surface** | BCTC PDF extraction pipeline; feeds `get_bctc_full`, `get_bctc_series` used by bctc-analyst |
| **Caller count** | 1 agent (bctc-analyst) + refine_bctc_md depend on parsed BCTC data |
| **Impact** | ~31 failed re-parses in 7 days. BCTC data gaps possible for specific tickers. Combined with F-01 (queue enricher failing), BCTC pipeline has two compounding failure modes. |
| **Suggested fix** | `dev-pdf-extractor`: check bctcReparseJob failure logs — likely OCR timeout or malformed PDF patterns. Add per-file exception isolation so one bad PDF doesn't fail the whole batch. |

---

## IMPROVEMENTS

### I-01 — IMPROVE: get_sector_rotation missing 5-session trend data

| Field | Value |
|-------|-------|
| **Class** | IMPROVE |
| **Tool(s)** | `get_sector_rotation` |
| **Evidence (this cycle)** | Returns "chỉ có dữ liệu 1 ngày — chưa đủ 5 phiên giao dịch" (only 1d available, need 5 sessions) for all 16 sectors |
| **Impact** | market-watcher cannot compute sector momentum direction from 5d trend. Only 1d snapshot available. Affects `CARRY_REGIME=HOT_MONEY_INFLOW` concentration detection. |
| **Suggested fix** | `dev-stock-price` / `dev-mcp-server`: verify sector rotation job fetches from OHLCV table across full 5-session window, not from a transient in-memory cache that resets on server restart. |

---

### I-02 — IMPROVE: Multiple RSS news sources showing "Suy giảm" (degraded) — non-blocking

| Field | Value |
|-------|-------|
| **Class** | IMPROVE |
| **Tool(s)** | `get_system_status` (source health section) |
| **Evidence (this cycle)** | CafeF RSS, Reuters RSS, TradingEconomics (×2), VnEconomy RSS, VnExpress RSS all showing "Suy giảm" with 1–4 consecutive errors |
| **Impact** | Low — `fetch_and_analyze` returned 20 articles this cycle; `get_pipeline_health` shows news freshness 9 min (ok). These are circuit-breaker transient states, not full outages. |
| **Suggested fix** | `dev-mcp-server`: review circuit-breaker failure thresholds for RSS sources. Consider adding retry-on-next-cycle before marking degraded, to reduce false-alarm noise in `get_system_status`. |

---

## NON-ISSUES / VERIFIED CLEAN

### N-01 — send_telegram `message` vs `text` param — NO AFFECTED CALLERS

| Field | Value |
|-------|-------|
| **Class** | NON-ISSUE |
| **Evidence (this cycle)** | Tool contract confirmed: `docs/agents/tools/list/send_telegram.md` → param is `message` (required string) |
| | Grep: `grep -r "send_telegram.*text" docs/agents/ --include="*.md"` → 0 results using `text:` in actual call arguments |
| | All 9 call sites found use `message:` correctly (alert-commander, market-watcher, digest-predict, unified-agent, qa-responder) |
| **Verdict** | Caller-surface verified: 0 affected callers. Contract consistent. No action needed. |

---

## TOOLS VERIFIED HEALTHY (probed this cycle)

| Tool | Status | Notes |
|------|--------|-------|
| `get_cycle_bootstrap` | ✅ OK | Requires `agent_name` param — schema validated |
| `get_market_snapshot` | ✅ OK | VN-Index 1806.2, breadth data live |
| `get_macro_snapshot` | ✅ OK | Oil/gold/USD/VND all live tier-1 |
| `get_system_status` | ✅ OK | All circuit breakers open=0 |
| `get_cron_health` | ✅ OK | 65 crons tracked, most 99–100% |
| `get_pipeline_health` | ✅ OK | 35/41 tickers TA-ready |
| `get_vps_proxy_health` | ✅ OK (bctc stale) | prices/news/sbv routes healthy |
| `get_vps_service_health` | ⚠️ partial | vn-sbv-fetch unhealthy (F-03) |
| `get_rate_limit_status` | ✅ OK | 10/12 sources ready |
| `get_sla_status` | ✅ OK (bctc breach) | bctc SLA breached (F-01) |
| `get_watchlist` | ✅ OK | 41 tickers returned |
| `get_earnings_calendar` | ✅ OK | Q1-2026 data current |
| `get_week_period` | ✅ OK | Returns canonical periodKey |
| `get_sector_rotation` | ⚠️ degraded | Works but missing 5d data (I-01) |
| `get_supply_chain_exposure` | ⚠️ degraded | BDI 70d stale (F-02) |
| `get_climate_risk_signals` | ✅ OK | June power grid risk noted |
| `get_open_chain_findings` | ✅ OK | Empty (expected, off-hours) |
| `fetch_and_analyze` | ✅ OK | 20 articles fetched and analyzed |
| `task_claim` / `task_release` | ✅ OK | Lock round-trip confirmed |
| `get_technical_indicators` | ✅ OK | VCB full TA returned |
| `get_price_history` | ✅ OK | 23 bars returned for VCB 30d |
| `get_patterns` | ✅ OK | Returns empty (no breakout match — expected) |
| `get_ticker_intelligence` | ✅ OK | FPT brief returned |
| `get_alerts` | ✅ OK | 5 alerts returned |
| `get_bctc_refined` | ✅ OK | Correct empty-error for unknown report_id |
| `get_bctc_pending_refine` | ✅ OK | 5 pending PDFs returned |
| `log_agent_work` | ✅ OK | Two-call pattern works (id=1416) |
| `send_telegram` | ✅ OK | Param contract confirmed (`message`) |
| `get_macro_snapshot` (sbv) | ✅ OK | SBV source variant returns same data |

---

## Cron Health Highlights

| Cron | Rate | Avg Duration | Note |
|------|------|-------------|------|
| `intelligenceCycleJob` | 98.6% | 50.6s | OK — minor drops expected |
| `bctcReparseJob` | 82.2% | 266s | ISSUE — F-05 |
| `vnstockTradingStatsRefresh` | 66.7% | 915s | ISSUE — F-04 |
| `bctcPdfPullJob` | 99.0% | 56.6s | OK |
| `bctcQueueEnricherJob` | 99.6% | 45.4s | Runs fine but zero URLs — F-01 |
| All other crons | 99–100% | — | Healthy |

---

*Report generated: 2026-06-17 12:07 UTC | Path: docs/agent-memory/health/team-tool-recheck-2026-06-17-1207.md*
