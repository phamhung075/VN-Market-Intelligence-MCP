# Implementation Status

200+ tasks done. Current sprint + stats → `docs/data/project-stats.json`

## Done — Sprint 000–014 (Foundation through Trade Relationships)

| Sprint | What shipped |
|--------|-------------|
| 000 | SQLite schema, env config, structured logging, multilingual-MiniLM embeddings (local ONNX), LanceDB vector store, RAG retriever, Vietnamese number parser, balance sheet extractor, embedding text builder |
| 001-002 | Income statement + cash flow extractors, 22 financial ratios, QoQ/YoY deltas, SSC portal scraper, PDF downloader+extractor, SSC→parse→store pipeline (task 048), `get_financial_summary` / `compare_reports` tools (task 085) |
| 003-004 | CafeF / VnExpress / Reuters RSS fetchers, news normalizer, cascade engine (global→stock), signal detector, alert generator, 4 watchlist + 3 alert + 3 analysis MCP tools, McpServer + SSEServerTransport (16 tools) |
| 005 | HOSE prices (VnDirect+CafeF fallback), news poller cron, SSC nightly check, market open/close scan, morning briefing |
| 006 | Historical pattern matcher (task 065), rule-based BCTC summary (task 066), HNX+UPCOM prices (task 027), evening summary job (task 105), `get_market_snapshot`/`get_patterns` tools (task 084), 28-test MCP harness (task 123) |
| 009 | Puppeteer SSC automation, Telegram Bot API notifier (never-throw), `send_test_telegram`, unified 15-min intelligence cycle, `mcp.config.json` central config |
| 010 | SQL injection fix (parameterized queries), alert cooldown/dedup/grouper (task 131), BCTC accounting identity validator (task 132) |
| 011 | Per-stock stdDev adaptive thresholds (task 133), rule-based sentiment Vi+EN (task 134), RAG temporal decay (task 135), VnEconomy RSS (task 035) |
| 012 | Daily/weekly/monthly/quarterly/yearly periodic summaries (task 130), `get_market_summary`/`generate_market_summary` |
| 013 | 3-tier HOSE fallback, HNX VnDirect fallback, Google News redirect-follow, browser UA, 14-min stale guard + 2-min/step timeout, sector peers, σ-based macro thresholds, price-news validator, commodity tracker, TE global news stream (5th source), full Vietnamese Telegram format |
| 014 | Trade relationships (stock-level revenue exposure %), trade store CRUD+auto-learn, Step E DB-driven alert send, real runImpactChain, fetchVnIndex via CafeF, SQLite WAL checkpoint, circuit breaker on HOSE/SSC |

## Done — Sprint 015–034 (Analytical Depth)

| Sprint | What shipped |
|--------|-------------|
| 015 | 5-dimension conviction score (price/volume/sentiment/cascade/sector), sector peer context in alerts+briefing |
| 016 | Morning briefing Telegram delivery, alert resolution lifecycle, `get_portfolio_conviction`, `submit_feedback` |
| 017 | News-mention noise filter, SSC scan dedup, log rotation, off-hours 60-min interval |
| 018 | Daily/weekly data audit: orphan vectors, stale entries, DB/RAG row counts |
| 019 | Company name alias dictionary, cascade alias resolution, `send_market_broadcast` |
| 020-021 | Polymarket fetcher, prediction_markets/signals tables, cascade mapper, volume_spike+probability_shift detection, top-3 in morning briefing |
| 022 | `trigger_alert_check` on-demand signal re-evaluation |
| 023 | Position CRUD, decision note synthesizer, sparkline renderer, price history tool |
| 024 | VaR/max-drawdown calculator, alert accuracy, stock search, data freshness |
| 025 | Sector rotation momentum, BCTC deadline calendar, nightly alert digest |
| 026 | Pearson correlation matrix, portfolio export, signal P&L attribution |
| 027 | Target-weight drift → BAN/MUA/GIU, cascade rule expansions, sector-wide decline alert |
| 028 | Price alert checker (one-shot fire), per-host token-bucket rate limiter |
| 029 | Per-position P&L calculator, source health tracker (ok/degraded/down) |
| 030 | Telegram command router (/watchlist, /alerts, /briefing), webhook, `compare_stocks` |
| 031 | Sunday portfolio report, custom alert rule evaluator |
| 032-033 | Alert mute checker, target allocation CRUD |
| 034 | OLS regression sentiment trend (TANG/GIAM/ON DINH) |

## Done — Sprint 035–052 (Autonomy + Observability + Protection)

| Sprint | What shipped |
|--------|-------------|
| 035a-b | Dev team cron prompt, unified agent rewrite, two-channel architecture, Telegram report store, webhook report branch, report tools |
| 036 | Removed 8 dead tools, changelog store, report claiming, merged tools: `get_system_status` (4→1), `send_telegram` (3→1), `manage_alert_mute` (2→1) |
| 039 | signal_outcomes / cascade_hits / prediction_outcomes tables, `record_signal_outcome`, `get_signal_effectiveness`, `get_cascade_metrics`, `get_prediction_accuracy`, France summary, dev team heartbeat, user request check, prediction outcome jobs |
| 039-040 | `get_legal_risk_signals`, `get_policy_signals`, `get_bond_maturity_calendar`, `get_public_contracts`, `get_credit_flow_signal`, `get_insider_signals` |
| 041-042 | `get_supply_chain_exposure`, `get_climate_risk_signals`, `get_energy_grid_signals` |
| 043-044 | `get_crisis_early_warning`, `get_pharma_signals` |
| 045 | `syncStockLight()` for peers, `syncSectorPeers` orchestrator, `get_sector_comparison` (PE/PB/ROE vs sector median) |
| 046 | Kinh Dich engine: hexagramLibrary (64 hexagrams), hexagramResolver, haoEncoder (4-state), nuclearComputer, transformedComputer, nguHanhClassifier (Five Elements), kinhDichReading orchestrator, Vietnamese formatter, hexagramStore (SQLite), hexagramBacktester (5-day forward), 6 MCP tools, 206 tests |

## Done — VPS Proxy Rebuild (Dev Loop #17, 2026-04-06, commit c84a329)

**Root cause:** Vultr VPS crontab silently disappeared (~2026-03-27), leaving `market_prices` stale 10 days.
**Fix:**
- VPS: `vps-scripts/fetch-prices-loop.sh` (forever driver, replaces cron) + `vn-price-fetch.service` (systemd `Restart=always`)
- MCP: `vpsProxyWatchdogJob.ts` (observe-only, no SSH)
- `deploy-vps-proxy.sh` rewritten: uploads both files, daemon-reload/enable/restart, removes legacy cron
- Test: `src/__tests__/313-vps-proxy-watchdog.test.ts` — 8/8 pass

**Invariant:** VPS liveness owned by systemd. MCP observes `market_prices.updated_at` only. No SSH at runtime.

## Done — Sprint 049 Kinh Dich Differentiation (QA sign-off 2026-04-06)

- `hexagramLibrary.ts` rebuilt: all 64 hexagrams, full hao + bien que data (task 301)
- Fixed computeForeignFlowScore (sort by fetched_at, avg_volume_2w), computeMacroScore (indicator column, rolling sigma), computeSectorScore (all market_prices stocks, not just watchlist), computeMacroIndicatorScore (z-score from history) (tasks 297-300)
- Smoke test: VNM/FPT/VCB/VEA produce 4 different hexagrams, >=3 non-zero hao scores (task 302)
- QA: tasks 280, 195, 215, 217-219, 297-302. 3015 tests pass, tsc 0 errors, DDD PASS

## Done — Sprint 050: Kinh Dich Live + /ask (2026-04-06)

- Intelligence cycle Step A4: auto-compute hexagram per watchlist stock every 15 min (task 303)
- `convictionScorer.ts` 6th dimension: kinhDichScore at 15% weight (task 304)
- `userRequestTools.ts`: `log_user_request` + `get_pending_user_requests` (task 305)
- `userRequestCheckJob.ts` Step F: `buildEnrichedAnswer`, Vietnamese format, `why:` prefix (task 306)
- `telegramCommands.ts`: `/ask` + `/why` commands, `why:TICKER` payload, no-arg guard (task 307)
- `registry.ts`: dynamic tool registry — flat array of `register*Tools` functions (task 308)

## Done — Sprint 051: Three-Channel Telegram (2026-04-07, tasks 311-314)

- `config.ts` + `telegram.ts`: three-channel Zod enum (`market|work|bug`), env vars renamed (task 311)
- All scheduler call sites reclassified to correct channel (task 312)
- All agent .md + `docs/ARCHITECTURE.md`: three-channel rewrite (task 313)
- `dataAuditJob.ts`: preserve recent zero-price rows, fix false-positive purge (task 314)

## Done — Sprint 052: BCTC Overdue + SSOT (2026-04-07)

- `bctcOverdueCheckJob.ts`: daily 09:00 detect overdue BCTC filings, insert alert rows (task 1018)
- `sectorRotationJob.ts`: 1d return prefers `change_pct` column (task 916 fix)
- `macroStatsJob.ts`: Brent crude via yahooFinance only, news-mining removed (task 921 fix)
- `157-data-audit-job.test.ts`: LanceDB timeout 60s, flake resolved

## Done — Sprint 053-054 (2026-04-08 to 2026-04-09)

- Sprint 054 Phase 1: `.claude/knowledge/` factory created (2026-04-08): 10 knowledge files, fail-loud lazy-load protocol in CLAUDE.md + all agents
- Phase 1.5 SSOT dedup: stock-classification.md, fail-loud-protocol.md, signal bus SSOT in mcp-tools.md, GLOSSARY_VI.md. `cowork-refactory-expert.md` 409→156 lines
- restart-policy.md created (2026-04-08)
- Janitor DDL dedup (tasks 1033-1047, 1049-1050): 15 inline DDL blocks removed from stores, moved to `initDatabase()` in schema.ts
- Task 1021: 20 test flakes resolved (5s→30s timeout for Step E)
- Task 1063: Removed fake-AI and low-value Telegram commands
- Task 1070: Position ledger — buyPosition/sellPosition/applyPositionCommand + weighted avg cost
- Task 1071: Telegram /set_position + /check_position handlers
- Task 1072: ask_queue DDL + askQueueStore CRUD helpers
- Task 1073: Telegram /ask handler
- Task 1074: askQueueCheckJob scheduler (*/12 * * * *)
- Task 1075: alertPolicyChecker + stopLossComputer + mcp.config.json alertPolicy
- Task 1076: marketScanJob noise retirement — direct MARKET sends removed, DB inserts preserved
- Task 1077: kinhDichWrapper + appendKinhDich wired into analysis/market/portfolio tools
- Task 1078: MCP tools get_pending_ask_questions + answer_ask_question (+2 tools → 80 total)
- Task 1079: MCP tool get_user_positions_for_analysis (+1 tool)
- Task 1081: Sprint 054 smoke test (7-step end-to-end, all mocked)
- Task 1082: SSC timeout raised 3→5 min; volume_spike suppressed during ATC window
- Task 1086: WAL checkpoint PASSIVE→TRUNCATE on shutdown + startup replay
- Task 1088a: Enhanced detectUnitMultiplier + magnitude inference in balanceSheetExtractor; zero-totals validator rejects garbage BCTC rows
- Task 1091: vnstockStore.ts 8 inline DDL blocks removed
- Task 1042: 8 vnstock table DDLs moved to initDatabase() in schema.ts
- Task 1068: bctcReparseJob — OCR cache fallback for scanned PDFs (commit 6d46ffb)
- Sprint 054 Phase 6: Cowork E7 position-aware agents + E8 07-qa-responder created
- Watchlist expanded to 30 tickers (from 8)

## Done — Sprint 055 (2026-04-10 to 2026-04-11)

- Task 1100: `cron_job_runs` DDL + `cronJobRunStore` CRUD (4 functions, 24 tests)
- Task 1101: `recordJobRun` wrapper + applied to 5 scheduler jobs (newsPoller, sscChecker, marketScan, askQueueCheck, dataAudit)
- Task 1102: `get_cron_health` MCP tool (+1 tool)
- Task 1103: `cronHealthAlertJob` — daily WORK alert when any job success_rate < 80%
- Task 1104: Sprint 055 cron smoke test (14 tests)
- Task 1105: Signal Fix A — `causal_root_id` migration + signal grouping
- Task 1106: Signal Fix B — `signal_class` field + conviction weighting
- Task 1107: Signal Fix C — `recency_weight` in `search_similar_context` (recencyWeighter.ts, floor 0.1)
- Task 1108: `agent_work_log` DDL + `agentWorkLogStore` (17 tests)
- Task 1109: `log_agent_work` + `get_agent_work_log` MCP tools (+2 tools)
- Task 1110: `sent_by` column on alerts table + Alert Commander filter
- Net: +3 tools → ~83 total. 156/156 tests pass. bun tsc --noEmit clean.

## Done — Sprint 056 (2026-04-11)

- Task 1111: BCTC fallback hardening — `disableSscPolling` config flag, HOSE/HNX/UPCOM queried in parallel, `listSscDocumentsWithFlag` wrapper. Closes P1 deadline gap (bank BCTC 2026-04-14). 9/9 tests pass.
- TECH_1002: Anonymous SSC PDF attribution — `normaliseFilename` + `action_code` on `pdf_extracted_text` + D-7c fallback. 11 tests. (commit 60482d1)
- Task 1112: BCTC VPS proxy — `bctc_vps_queue` table, `GET /api/bctc-fetch-queue`, `POST /api/push-bctc-pdf`, `vps-scripts/fetch-bctc.sh` + `fetch-bctc-loop.sh` + `vn-bctc-fetch.service`. VPS deployed, both services active. (commit 0ecca9b)
- Hotfix e4c5383: VEA added to watchlist (30 tickers), TLS cert bypass for HNX/UPCOM in VPS fetcher, GDP regex tightened, BCTC re-extracted from cached OCR.
- Hotfix 09f0cef: Task 1004 — 18 new cascade `SECTOR_RULES` for govt stabilization + systemic stress + policy combos, `detectPolicyInterventionCombo()`.
- Task 1113: VPS proxy observability — push log endpoint (`POST /api/log-push`), `get_vps_proxy_health` MCP tool (+1 tool → 84 total). (commit 594dc67)
- VPS maintenance: `vn-price-fetch.service` restarted (was stale 15 days), `vn-bctc-fetch.service` first-ever deploy — both now active on Vultr Singapore.

## In Progress

Sprint 056 complete. Backlog items in TASKS.md. Sprint 057 planning pending.

## Done — Sprint 057 (2026-04-12)

- Fix 1115: `deterministicNewsId()` in alertGenerator — news_mention alerts now use day-bucket IDs to prevent duplicates after server restart when RSS URLs change (7 new tests)
- Task 1116: `evidence_fragments` + `evidence_scores` DDL in schema.ts + `evidenceFragmentStore.ts` CRUD (18 tests)
- Task 1117: `record_evidence_fragment` MCP tool (+1 tool → 85 total) in `evidenceTools.ts`
- Task 1118: `evidenceAccumulatorJob.ts` — nightly 23:00 VN, purge + weighted score accumulation per stock; CRONS map key `evidenceAccumulator` (7 tests)
- Net: +1 tool, +1 cron, 31/31 new tests pass. bun tsc --noEmit clean.

## Done — Sprint 058 (2026-04-12)

- Task 1119/1120: split-block OCR extraction for income statement + balance sheet with magnitude inference fallback (scanned PDF hardening)

## Done — Sprint 059 (2026-04-12)

- Tasks 1121+1123: likelihood ratio store + prediction_claims store CRUD
- Task 1122: `baseRateComputationJob.ts` — weekly base-rate computation (`CRON_BASE_RATE_COMPUTATION` `0 19 * * 0` UTC)
- Task 1125: `predictionResolutionJob.ts` — daily prediction resolution with direction-based outcome matching
- Task 1126: Agent 08 `08-prediction-synthesizer.md` added to Cowork roster

## Done — Sprint 060 (2026-04-12)

- Task 1129: `get_calibration_report` MCP tool (+1 tool → 89 total) in `calibrationTools.ts`
- Task 1130: Agent 08 self-assessment Step 0 integrates calibration into prediction cycle

## Done — Sprint 061 (2026-04-12)

- Tasks 1131-1134: VPS foreign flow pipeline — VPS-side extraction in `fetch-prices.sh`, `foreignFlowAlertJob.ts`, `get_foreign_flow` MCP tool (+1 tool), diagnostic endpoint `GET /api/foreign-flow-status`
- `foreignFlowAlertJob.ts` registered (`CRON_FOREIGN_FLOW_ALERT` `30 9 * * 1-5` UTC)

## Done — Sprint 062 (2026-04-13)

- Tasks 1136-1140: `recordJobRun` wrapper extended to morningBriefing, intelligenceCycle, eveningSummary, alertDigest, utility/infra jobs, bctcOverdueCheck, vpsProxyWatchdog, cronHealthAlert — full cron observability coverage

## Done — Sprint 063 (2026-04-13)

- Tasks 1141-1146: `insider_transactions` DDL + schema migration, `insiderCheckJob.ts` refactored with streak detection + alert rows + cron registration (`CRON_INSIDER_CHECK` `0 1 * * *` UTC), `get_insider_transactions` MCP tool (+1 tool)
- insiderCheckJob promoted from orphan to registered job

## Done — Sprint 064 (2026-04-13)

- Knowledge sync: align all agent tool maps with 90-tool reality (commit 882d507); `project-stats.json` corrected to toolCount=90

## Done — Sprint 065 (2026-04-13)

- Tasks 1150-1154: prediction claim resolution loop — `creation_price` + direction fallback fixes; full end-to-end prediction lifecycle closed

## Done — Sprint 066 (2026-04-13)

- Hotfix: process.env purge + test encoding fix for CI stability

## Done — Sprint 067 (2026-04-13)

- Tasks 1159-1162: morning briefing enrichment — `assembleBriefing` extended with 3 query helpers for richer daily context

## Done — Sprint 068 (2026-04-13)

- Tasks 1163-1167: `market_messages` DDL + `marketMessageStore.ts`, `marketMessageTools.ts` with `get_unreviewed_market_messages` + `review_market_message` MCP tools, `sendTelegramMarket` persist option migrated to 10 call sites (+2 tools)

## Done — Sprint 069 (2026-04-13)

- Tasks 1168-1172: `get_market_message_digest` + `batch_review_market_messages` MCP tools added (+2 tools), `recordJobRun` wrap verified for remaining jobs, Task 1139 administrative close
- Net: market message review system complete (4 tools total in category)

## Done — Sprint 070 (2026-04-13)

- Tasks 1173-1177: calibration label integration — `getLabelAccuracyReport` in `marketMessageStore.ts`, `get_label_accuracy_report` MCP tool (+1 tool → 96 total), `calibrationReportJob.ts` extended with label accuracy section + WORK Telegram block
- `calibrationReportJob.ts` registered (`CRON_CALIBRATION_REPORT` `0 13 * * 0` UTC)
- Net: +1 tool (96 total), label accuracy pipeline complete

## Done — Sprint 071 (2026-04-13)

- Tasks 1178-1180: `tickerIntelligenceTools.ts` — `get_ticker_intelligence` tool assembles 8 data sections per ticker (price context, recent alerts, open positions, Kinh Dich reading, active predictions, evidence score, insider transactions, open cascade chains) into a Vietnamese-formatted intelligence report
- `registry.ts` updated: `registerTickerIntelligenceTools` registered, tool count verified at 96
- Net: +1 tool (96 total), per-ticker intelligence pipeline complete

## Deferred

- E2E test: daily briefing flow (task 125)
- Graceful restart script (future)
- Micro-service MCP gateway architecture (future)
