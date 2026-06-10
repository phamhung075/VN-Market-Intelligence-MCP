# Quality Audit Framework — VN-Market-Intelligence-MCP
## 2026-06-10 | Architect: External-Auditor Stance

---

## 1. Purpose and Governing Principle

This framework defines an **independent external-auditor quality assessment** of the VN-Market-Intelligence-MCP system. The assessor adopts the stance of an outside quality expert, not a team insider.

Every check is derived by reasoning about system **quality**: how the system works from the outside, how it responds to requests, how the parts interact. Checks are built from the system's **published behavioral contract** — the SLAs, cadences, output promises, channel guarantees, and inter-service expectations declared in `docs/data/system-map.json` and `docs/data/project-stats.json` — NOT from reading implementation internals.

Capability counts reference `docs/data/project-stats.json` as SSOT (never hardcoded here).

---

## 2. Anchor Standard

**ISO/IEC 25010 Product-Quality Characteristics** extended with market-intelligence-specific dimensions.

### 2.1 The 10 Audit Dimensions (Lenses)

| # | Dimension | Auditor Question Family |
|---|---|---|
| D1 | Functional Suitability | Does a valid request return a correct, complete, well-shaped response? |
| D2 | Performance / Responsiveness | Acceptable latency? Direction + delta shown, not bare snapshot? |
| D3 | Reliability / Availability | Service up per deployment intent? Health 200? Restart count? Uptime? |
| D4 | Data Freshness / SLA | Served data within declared cadence? Stale-but-flagged vs silently stale? |
| D5 | Data Correctness / Cross-source Consistency | Two planes/sources agree on the same fact? |
| D6 | Graceful Degradation / Resilience | On VPS/upstream failure: safe degradation or crash/fabrication? |
| D7 | Observability / Alerting | Failures logged + signalled to correct Telegram channel? Verdict trail exists? |
| D8 | Inter-service Contract Integrity | Gateway routes resolve? Declared contract matches served reality? |
| D9 | Security / Access | Authenticated paths (VPS X-API-Key, push endpoints) actually guarded? |
| D10 | Maintainability / Test Confidence | Capability protected by live, non-obsolete test + green CI? |

---

## 3. Deployment-Intent Gate

**SSOT:** `docs/data/system-map.json → .project.infrastructure.docker.host_runtime_set`

**Deployed (intended to run on 16GB Mac host):**
- mcp-server, api-gateway, frontend, macro-indicators, mcp-gateway, pdf-extractor

**Undeployed by design** (defined in repo, not run — host memory constraint):
- stock-price, technical-analysis, kinh-dich-service, alert-engine, rag-service, news-fetch

**Gate rule:** Any capability whose service is UNDEPLOYED_BY_DESIGN has its D3/Reliability checks
pre-scored severity:"INFO" with a note "undeployed by design — auditor reports grey, never FAIL".
This prevents false mismatches generating noisy fix tasks.

---

## 4. Capability Set (38 capabilities)

### 4.1 MCP Tool Categories (12 capabilities)

Sourced from the tools list in `docs/data/system-map.json`, grouped into 12 categories.
Tool and cron counts are authoritative from `docs/data/project-stats.json`.

| Cap ID | Category | Representative Tools | Primary Dimensions |
|---|---|---|---|
| CAP-SYSTEM | system | get_system_status, get_agent_signals, task_claim, send_telegram, get_watchlist | D1, D3, D7, D10 |
| CAP-FINANCIAL-REPORTS | financial-reports | get_bctc_full, read_bctc_pdf, get_financial_summary, get_cash_flow, list_stored_pdfs | D1, D4, D6, D8, D10 |
| CAP-SECTOR | sector | get_sector_comparison, get_sector_rotation, get_supply_chain_exposure, get_pharma_signals | D1, D4, D5, D10 |
| CAP-MACRO | macro | get_macro_snapshot, get_fed_liquidity_spread, get_imf_signals, get_ism_subcomponents, get_yield_spread_signal | D1, D2, D4, D5, D6, D7, D10 |
| CAP-MARKET-DATA | market-data | get_market_snapshot, get_price_history, get_foreign_flow, get_market_context, get_technical_indicators | D1, D2, D4, D5, D6, D10 |
| CAP-NEWS-ANALYSIS | news-analysis | fetch_and_analyze, get_market_message_digest, get_sentiment_trend, get_market_summary | D1, D4, D6, D7, D10 |
| CAP-ALERTS | alerts | get_alerts, set_price_alert, get_alert_accuracy, write_alert_verdict, send_alert_digest | D1, D2, D6, D7, D10 |
| CAP-PORTFOLIO | portfolio | get_positions, get_portfolio_conviction, get_portfolio_risk, get_target_allocation, set_position | D1, D5, D10 |
| CAP-BRIEFINGS | briefings | generate_market_summary, get_market_summary, get_cycle_bootstrap, get_cron_health, get_sla_status | D1, D2, D4, D7, D10 |
| CAP-BACKTESTING | backtesting | run_backtest, compare_backtest_runs, get_backtest_run, export_backtest_run_csv, run_hexagram_backtest | D1, D10 |
| CAP-KINHDICH | kinhdich | get_kinhdich_reading, get_market_hexagram, explain_hexagram, get_hexagram_history | D1, D4, D10 |
| CAP-ANALYSIS | analysis | sequential_market_analysis, run_impact_chain, get_correlation_matrix, get_cascade_metrics, get_investment_clock_phase | D1, D6, D10 |

### 4.2 Deployed Services (6 capabilities)

| Cap ID | Service | Port | Dimensions |
|---|---|---|---|
| CAP-SVC-MCP-SERVER | mcp-server | 3000 | D1, D3, D7, D8, D9, D10 |
| CAP-SVC-API-GATEWAY | api-gateway | 4000 | D3, D6, D7, D8, D9 |
| CAP-SVC-MACRO-INDICATORS | macro-indicators | 5004 | D3, D4, D6, D8 |
| CAP-SVC-PDF-EXTRACTOR | pdf-extractor | 5001 | D3, D6, D8, D10 |
| CAP-SVC-FRONTEND | frontend | 3001 | D3, D6, D8 |
| CAP-SVC-MCP-GATEWAY | mcp-gateway (proxy) | (varies) | D3, D8 |

### 4.3 Undeployed-by-Design Services (6 capabilities — INFO only)

D3 checks pre-scored INFO. No FAIL generated.

| Cap ID | Service | Port |
|---|---|---|
| CAP-SVC-STOCK-PRICE | stock-price | 5010 |
| CAP-SVC-TECHNICAL-ANALYSIS | technical-analysis | 5003 |
| CAP-SVC-KINH-DICH-SVC | kinh-dich-service | 5005 |
| CAP-SVC-ALERT-ENGINE | alert-engine | 5006 |
| CAP-SVC-RAG-SERVICE | rag-service | 5002 |
| CAP-SVC-NEWS-FETCH | news-fetch | 5008 |

### 4.4 Cron Groups (6 capabilities)

| Cap ID | Group | Key Jobs | Dimensions |
|---|---|---|---|
| CAP-CRON-INTELLIGENCE | Intelligence cycle engine | intelligenceCycle(*/15m), foreignFlowFetch(*/1m), vnIndexRefresh(*/5m market), taAlertScanJob, bbAlertScanJob, askQueueCheck | D3, D4, D7, D10 |
| CAP-CRON-FRESHNESS | Freshness + watchdog monitors | freshnessSlaMonitor(*/30m), vpsServiceHealth(*/5m), priceUpdateWatchdog, ohlcvStalenessCheckJob, pipelineWatchdog, systemAuditTier1/2/3 | D4, D7, D10 |
| CAP-CRON-BRIEFINGS | Daily briefings + summaries | morningBriefing(08:00VN), marketOpen, marketClose, eveningSummary, dailySummary, alertDigest(21:00VN), franceSummaryJob | D1, D2, D4, D7, D10 |
| CAP-CRON-OUTCOME | Outcome + calibration jobs | predictionOutcome, predictionResolution, calibrationReportJob, signalOutcomeJob, alertOutcomeJob, cascadeBacktestJob, verdictResolutionJob | D1, D5, D7, D10 |
| CAP-CRON-BCTC | BCTC pipeline jobs | bctcPdfPull(*/30m), bctcQueueEnricher(*/15m), bctcOverdueCheck, bctcReparseJob, sscCheck, dataAuditDaily | D4, D6, D7, D10 |
| CAP-CRON-MACRO | Macro + system refresh | macroIndicatorRefreshJob(19:13UTC), imfIndicatorPoller(*/6h), insiderCheckJob(01:00UTC), foreignFlowAlertJob, cronHealthAlert | D4, D5, D7, D10 |

---

## 5. Flagged Discrepancy — PDF Deployment Contract Gap (Critical)

**Finding:** `apps/api-gateway/cmd/server/main.go:44` default value for `NOT_DEPLOYED_SERVICES`
env var is `"pdf,rag,ta,stock,kinh-dich,alert,news"` — includes `"pdf"`.

**Conflict:** `docs/data/system-map.json → .project.infrastructure.docker.host_runtime_set.services`
lists `pdf-extractor` as an INTENDED-DEPLOYED service.

**Risk:** If the api-gateway runs without an explicit `NOT_DEPLOYED_SERVICES` env override, all
`/api/pdf/*` routes are silently rerouted to mcp-server fallback — making pdf-extractor's
direct capability dark even when its container is running and healthy.

**Check:** `GW-CONTRACT-03` (severity CRITICAL). Recheck: `curl -s http://localhost:4000/health`
inspect the `pdf` service entry — if it shows `not_deployed:true` or fallback routing while
docker ps shows pdf-extractor RUNNING, the contract gap is confirmed FAIL.

---

## 6. Re-check Contract

Every check carries:
- `recheck_how`: exact live MCP `call_tool` or HTTP probe the re-check agent runs
- `zone_owner`: the dev-*/ops/qa agent who fixes a FAIL/WARN
- `status`: initialized "NEEDS-REVIEW" — re-check waves flip to PASS/WARN/FAIL/INFO

Re-check agents by dimension:
- system-auditor Tier-1: D3 runtime/availability
- system-auditor Tier-2: D4 freshness/SLA/VPS
- system-auditor Tier-3: D10 DB integrity
- ops: D8 inter-service contract, D9 security/auth
- qa: D10 maintainability/test-confidence
- market-analyst / dev-mcp-server (tool-prober): D1 functional suitability + D2 responsiveness

---

## 7. Dimension x Capability Coverage Summary

38 capabilities x subset of 10 dimensions each yields approximately 275 checks total.
Undeployed capabilities contribute INFO-only D3 checks (6 caps x 1 check = 6 INFO checks).

Deployed service capabilities: 6 caps, ~7-9 checks each = ~48 checks
Undeployed service capabilities: 6 caps, 1 check each = 6 INFO checks
MCP tool category capabilities: 12 caps, ~8-12 checks each = ~120 checks
Cron group capabilities: 6 caps, ~6-9 checks each = ~50 checks

Target: ~275 checks, all initialized NEEDS-REVIEW (except undeployed D3 = INFO).

---

*Authored: architect | 2026-06-10 | Plan: /Users/admin/.claude/plans/lexical-dazzling-lightning.md*
*Commit guard: docs/agent-memory/decisions/sprint-QUALITY-AUDIT-FRAMEWORK-architect.md*
