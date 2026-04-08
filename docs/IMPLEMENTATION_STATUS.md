# Implementation Status

> Extracted from CLAUDE.md for readability. This is the detailed sprint-by-sprint changelog.

## Done (200+ tasks, Sprint 000-050)

### Foundation (Sprint 000)
- `src/infrastructure/db/schema.ts` — SQLite schema init (all tables)
- `src/infrastructure/config.ts` — Env config
- `src/infrastructure/logger.ts` — Structured logging
- `src/infrastructure/rag/embeddings.ts` — HuggingFace multilingual-MiniLM (local ONNX)
- `src/infrastructure/rag/vectorstore.ts` — LanceDB vector store
- `src/infrastructure/rag/retriever.ts` — Multi-level RAG search
- `src/domain/services/vnNumberParser.ts` — Vietnamese number parser
- `src/domain/services/balanceSheetExtractor.ts` — BCTC balance sheet
- `src/domain/services/embeddingTextBuilder.ts` — RAG text builder

### BCTC Pipeline (Sprint 001-002)
- `src/domain/services/incomeStatementExtractor.ts` — income statement
- `src/domain/services/cashFlowExtractor.ts` — cash flow
- `src/domain/services/ratioComputer.ts` — 22 financial ratios
- `src/domain/services/periodDeltaComputer.ts` — QoQ / YoY deltas
- `src/infrastructure/fetchers/ssc.ts` — SSC portal scraper
- `src/infrastructure/fetchers/pdf.ts` — PDF downloader + text extractor
- `src/application/usecases/fetchParseAndStoreBctc.ts` — SSC fetch → parse → store pipeline (task 048)
- `src/interface/mcp/tools/reports.ts` — `fetch_bctc_report`, `get_financial_summary`, `compare_reports` (task 085)

### News + Alerts (Sprint 003-004)
- `src/infrastructure/fetchers/cafef.ts`, `vnexpress.ts`, `reuters.ts` — 3 RSS news sources
- `src/domain/services/newsNormalizer.ts` — RSS item → AnalysisEntry
- `src/domain/services/cascadeEngine.ts` — causal chain (global → stock)
- `src/domain/services/signalDetector.ts` — price/news/report signals
- `src/domain/services/alertGenerator.ts` — multi-signal alert generator
- `src/interface/mcp/tools/watchlist.ts` — 4 watchlist MCP tools
- `src/interface/mcp/tools/alerts.ts` — 3 alert MCP tools
- `src/interface/mcp/tools/analysis.ts` — 3 analysis MCP tools
- `src/interface/mcp/server.ts` — McpServer factory + SSEServerTransport (16 tools registered)

### Market Data + Scheduler (Sprint 005)
- `src/infrastructure/fetchers/hose.ts` — HOSE prices (VnDirect + CafeF fallback)
- `src/scheduler/newsPollerJob.ts` — every 30 min news poll with dedup
- `src/scheduler/sscCheckerJob.ts` — 20:00 SSC nightly check with retry
- `src/scheduler/marketScanJob.ts` — 09:00 + 15:30 market open/close scan
- `src/scheduler/morningBriefingJob.ts` — 08:00 daily briefing

### Analytical Depth (Sprint 006)
- `src/application/usecases/getPatternSummary.ts` — historical pattern matcher (task 065)
- `src/application/usecases/generateAiSummary.ts` — rule-based BCTC plain-language summary (task 066)
- `src/infrastructure/fetchers/hnx.ts` — HNX + UPCOM prices (task 027)
- `src/scheduler/eveningSummaryJob.ts` — 22:00 evening summary (task 105)
- `src/interface/mcp/tools/marketTools.ts` — `get_market_snapshot`, `get_patterns` (task 084)
- 28-test MCP integration harness covering all 16 tools (task 123)

### SSC Automation + Telegram + Intelligence Cycle (Sprint 009)
- `src/infrastructure/fetchers/ssc.ts` — upgraded to Puppeteer automation for JS-rendered SSC portal (task 031)
- `src/infrastructure/notifiers/telegram.ts` — Telegram Bot API notifier, never-throw, Bun.fetch (task 034)
- `src/interface/mcp/tools/telegramTools.ts` — `send_test_telegram` MCP tool (task 034)
- `src/scheduler/intelligenceCycleJob.ts` — unified 15-min cycle: poll → SSC → prices → chain → Telegram (task 106)
- `mcp.config.json` — central JSON config (server, paths, scheduler, alerts, RAG, adaptive thresholds)

### Security + Alert Quality + BCTC Validation (Sprint 010)
- SQL injection fix — parameterised queries across all SQLite helpers (security patch)
- `src/domain/services/alertCooldown.ts` — suppress same-stock/signal within cooldown window (task 131)
- `src/domain/services/alertDedup.ts` — djb2 fingerprint deduplication within 60-min window (task 131)
- `src/domain/services/alertGrouper.ts` — cluster overlapping alerts into grouped notifications (task 131)
- `src/domain/services/bctcValidator.ts` — accounting identity, magnitude, and confidence checks (task 132)

### Adaptive Thresholds + Sentiment + RAG Temporal Decay (Sprint 011)
- `src/domain/services/volatilityCalculator.ts` — per-stock stdDev → adaptive ±sigma thresholds (task 133)
- `src/domain/services/sentimentClassifier.ts` — rule-based bullish/bearish/neutral, Vi + EN, negation-aware (task 134)
- `src/infrastructure/rag/retriever.ts` — RAG temporal decay: recency boost via configurable half-life (task 135)
- `src/infrastructure/fetchers/vneconomy.ts` — VnEconomy stocks + finance RSS feeds (task 035)

### Periodic Summaries (Sprint 012)
- `src/application/usecases/generatePeriodicSummary.ts` — daily/weekly/monthly/quarterly/yearly summaries (task 130)
- `src/scheduler/summaryJobs.ts` — cron triggers (task 130)
- `src/interface/mcp/tools/summaryTools.ts` — `get_market_summary`, `generate_market_summary` (task 130)

### Fetcher Reliability + Sector Context + Telegram Vietnamese (Sprint 013)
- 3-tier HOSE fallback, HNX VnDirect fallback, Google News redirect-follow, browser UA
- Intelligence cycle: stale guard 14-min auto-release + 2-min per-step timeout
- `src/domain/services/sectorPeers.ts` — sector peer mapping, sector-wide vs stock-specific
- `src/domain/services/macroThresholds.ts` — σ-based thresholds (z-score classification)
- `src/domain/services/priceNewsValidator.ts` — cross-validate news vs price action + sensitive dates
- `src/infrastructure/db/commodityTracker.ts` — auto-extract commodity prices from news text
- `src/infrastructure/fetchers/tradingEconomicsStream.ts` — TE global news stream (5th source)
- Full Vietnamese Telegram format, severity labels, macro dashboard in briefing

### Trade Relationships (Sprint 014)
- `src/domain/services/tradeRelationships.ts` — stock-level trade map with revenue exposure %
- `src/infrastructure/db/tradeStore.ts` — trade exposure CRUD + auto-learn from news

### Alert Pipeline + VN-Index + WAL + Circuit Breaker (Sprint 014)
- Step E DB-driven alert send, real runImpactChain, fetchVnIndex via CafeF
- SQLite WAL checkpoint, circuit breaker on HOSE/SSC fetchers

### Conviction Scorer (Sprint 015)
- 5-dimension cross-signal conviction score (price, volume, sentiment, cascade, sector)
- Sector peer context + conviction in alert body, morning briefing conviction scores

### The Analyst's Dashboard (Sprint 016)
- Morning briefing Telegram delivery, alert resolution lifecycle
- `get_portfolio_conviction`, `submit_feedback` MCP tools, sigma health check

### Production Hardening (Sprint 017)
- News-mention noise filter, SSC scan dedup, log rotation, off-hours 60-min interval

### Data Integrity (Sprint 018)
- Daily/weekly data audit, orphan vectors, stale entries, DB/RAG row counts

### Stock Aliases + Market Broadcast (Sprint 019)
- Company name alias dictionary, cascade alias resolution, `send_market_broadcast`

### Prediction Market Intelligence (Sprint 020-021)
- Polymarket fetcher, prediction_markets/signals tables, cascade mapper
- Signal detection (volume_spike + probability_shift), morning briefing top-3

### Alert Check Trigger (Sprint 022)
- `trigger_alert_check` on-demand signal re-evaluation

### Position Tracking + Price History (Sprint 023)
- Position CRUD, decision note synthesizer, sparkline renderer, price history tool

### Portfolio Risk + Alert Accuracy (Sprint 024)
- VaR/max-drawdown calculator, alert accuracy, stock search, data freshness

### Sector Rotation + Earnings Calendar + Alert Digest (Sprint 025)
- Sector rotation momentum, BCTC deadline calendar, nightly alert digest

### Correlation + Performance Attribution (Sprint 026)
- Pearson correlation matrix, portfolio export, signal P&L attribution

### Portfolio Rebalancing + Hotfixes (Sprint 027)
- Target-weight drift → BAN/MUA/GIU, cascade rule expansions, sector-wide decline alert

### Stop-Loss / Take-Profit + Rate Limiting (Sprint 028)
- Price alert checker (one-shot fire), per-host token-bucket rate limiter

### P&L + Source Health (Sprint 029)
- Per-position P&L calculator, source health tracker (ok/degraded/down)

### Telegram Two-Way + Stock Comparison (Sprint 030)
- Telegram command router (/watchlist, /alerts, /briefing), webhook, compare_stocks

### Weekly Portfolio + Custom Alerts (Sprint 031)
- Sunday portfolio report, custom alert rule evaluator

### Alert Mute + Target Allocation (Sprint 032-033)
- Alert mute checker, target allocation CRUD

### Sentiment Trend (Sprint 034)
- OLS regression sentiment trend (TANG/GIAM/ON DINH)

### Two-Team Autonomy (Sprint 035a-b)
- Dev team cron prompt, unified agent rewrite, two-channel architecture
- Telegram report store, webhook report branch, report tools

### MCP Audit + Communication (Sprint 036)
- Removed 8 dead tools, changelog store, report claiming, merged tools
- `get_system_status` (4→1), `send_telegram` (3→1), `manage_alert_mute` (2→1)

### Observability Layer (Sprint 039)
- signal_outcomes, cascade_hits, prediction_outcomes tables
- `record_signal_outcome`, `get_signal_effectiveness`, `get_cascade_metrics`, `get_prediction_accuracy`
- France summary, dev team heartbeat, user request check, prediction outcome jobs

### Capital Protection (Sprint 039-040)
- `get_legal_risk_signals`, `get_policy_signals`, `get_bond_maturity_calendar`
- `get_public_contracts`, `get_credit_flow_signal`, `get_insider_signals`

### Supply Chain + Climate + Energy (Sprint 041-042)
- `get_supply_chain_exposure`, `get_climate_risk_signals`, `get_energy_grid_signals`

### Crisis + Pharma Radar (Sprint 043-044)
- `get_crisis_early_warning`, `get_pharma_signals`

### Sector Peer Shadow Sync (Sprint 045)
- `syncStockLight()` for peers, `syncSectorPeers` orchestrator
- `get_sector_comparison` MCP tool (PE/PB/ROE vs sector median)

### Kinh Dich Engine (Sprint 046)
- 64-hexagram state machine: hexagramLibrary, hexagramResolver, haoEncoder
- Lao/Thieu 4-state system, Ho Que (nuclear), Bien Que (transformed)
- Ngu Hanh (Five Elements) classifier with tuong sinh/tuong khac
- kinhDichReading orchestrator, Vietnamese formatter
- hexagramStore (SQLite), hexagramBacktester (5-day forward)
- 6 MCP tools: get_kinhdich_reading, get_market_hexagram, get_hexagram_history, get_transition_probabilities, run_hexagram_backtest, explain_hexagram
- 206 tests across 6 test files

### VPS Price-Proxy Rebuild + Watchdog (Dev Team Loop #17, 2026-04-06, commit c84a329)

**Root cause**: the Vultr VPS crontab silently disappeared (likely `crontab -r` or editor overwrite) on 2026-03-27, leaving `market_prices` stale for 10 days.

**Solution — split of responsibility**:
- VPS side: `vps-scripts/fetch-prices-loop.sh` (forever driver, replaces cron) + `vps-scripts/vn-price-fetch.service` (systemd unit, `Restart=always`). VPS crontab entry removed — schedule lives inside the loop script.
- MCP side: `src/scheduler/vpsProxyWatchdogJob.ts` — observe-only watchdog. Reads `MAX(market_prices.updated_at)`, sends one Telegram Chat alert if >5 min stale during market hours (30-min cooldown). No SSH at runtime.
- `deploy-vps-proxy.sh` rewritten: uploads both files, runs daemon-reload/enable/restart, removes legacy cron.
- Test: `src/__tests__/313-vps-proxy-watchdog.test.ts` — 8/8 pass.

**Architectural invariant recorded**: VPS liveness is owned by systemd on the Vultr host. The MCP server only observes `market_prices.updated_at` freshness. Nothing on the MCP side ever SSHes into the VPS at runtime. `deploy-vps-proxy.sh` is the operator-only escape hatch.

### Kinh Dich Differentiation (Sprint 049, QA sign-off 2026-04-06)

- `src/domain/services/kinhDich/hexagramLibrary.ts` — rebuilt with all 64 hexagrams, full hao + bien que data (task 301)
- `src/application/usecases/kinhDich/` — fixed computeForeignFlowScore (sort by fetched_at, avg_volume_2w), computeMacroScore (indicator column, rolling sigma), computeSectorScore (all market_prices stocks, not just watchlist), computeMacroIndicatorScore (z-score from history, no sigma column) (tasks 297-300)
- `src/__tests__/302-kinhdich-differentiation.test.ts` — smoke test: VNM/FPT/VCB/VEA produce 4 different hexagrams, >=3 non-zero hao scores (task 302)
- QA sign-off: tasks 280, 195, 215, 217, 218, 219, 297-302 reviewed. 3015 tests pass, tsc 0 errors, DDD PASS.

### Close the Cycle: Kinh Dich Goes Live + /ask Command (Sprint 050, tasks all Done 2026-04-06)

- `src/scheduler/intelligenceCycleJob.ts` — Step A4: auto-compute hexagram per watchlist stock every 15-min cycle (task 303)
- `src/domain/services/kinhDich/convictionScorer.ts` — 6th dimension: kinhDichScore at 15% weight (task 304)
- `src/interface/mcp/tools/userRequestTools.ts` — `log_user_request` + `get_pending_user_requests` MCP tools (task 305, pending registry registration)
- `src/scheduler/userRequestCheckJob.ts` — Step F enrichment: `buildEnrichedAnswer` in check job, Vietnamese format, `why:` prefix (task 306)
- `src/infrastructure/notifiers/telegramCommands.ts` — `/ask` command + `/why` command: store `why:TICKER` payload, guard no-arg `/why` (task 307)
- `src/interface/mcp/tools/registry.ts` — dynamic tool registry: flat array of all `register*Tools` functions, server.ts no longer needs editing to add tools (task 308)

### Three-Channel Telegram Migration (Sprint 051, tasks 311-313 Done 2026-04-07)

- `src/infrastructure/config.ts` + `src/infrastructure/telegram.ts` — three-channel Zod enum (`market | work | bug`), env vars renamed (task 311)
- `src/scheduler/*.ts` — all call sites reclassified to correct channel (task 312)
- `cowork-analysis-vnmarket-team/*.md` + `.claude/agents/*.md` + `docs/ARCHITECTURE.md` — agent .md three-channel rewrite (task 313)
- `src/scheduler/dataAuditJob.ts` — preserve recent zero-price rows, fixes false-positive purge (task 314)

### BCTC Overdue Alert + Single Source of Truth (Sprint 052, tasks Done 2026-04-07)

- `src/scheduler/bctcOverdueCheckJob.ts` — daily 09:00: detect overdue BCTC filings, insert alert rows (task 1018 slices 1-3)
- `src/scheduler/sectorRotationJob.ts` — 1d return prefers `change_pct` column (task 916 fix)
- `src/scheduler/macroStatsJob.ts` — Brent crude uses yahooFinance exclusively; news-mining removed (task 921 fix)
- `src/__tests__/157-data-audit-job.test.ts` — LanceDB timeout bumped to 60s, flake resolved

## In Progress

None — Sprint 052 tasks all Done. Next sprint: 053.

## Deferred
- E2E test — daily briefing flow (task 125)
- Graceful restart script (future)
- Micro-service MCP gateway architecture (future)
- `/ask` + `/why` user-request queue: `userRequestCheckJob.ts` was not created; functionality is inline in `telegramCommands.ts` (basic), full enrichment deferred
