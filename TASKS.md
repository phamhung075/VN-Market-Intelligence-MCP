# TASKS — VN Market Intelligence MCP
# Kanban Board | Agile/Kanban | DDD + TDD | Bun + TypeScript

> **WIP Limit**: max 2 tasks In Progress simultaneously
> **Workflow**: Backlog → Todo → In Progress → Review → Done
> **Branch**: `task/NNN-kebab-name`
> **Report**: `reports/TASK_REPORT_NNN.md` generated after every Review

---

## ✅ DONE

| # | Title | Branch | Merged | Report |
|---|-------|--------|--------|--------|
| 000 | Initial project structure | `main` | 2026-03-24 | — |
| 001 | Project setup & DDD folder structure | `task/001-project-setup` | 2026-03-25 | [TASK_REPORT_001](reports/TASK_REPORT_001.md) |
| 002 | SQLite schema + migrations | `task/002-db-schema` | 2026-03-25 | [TASK_REPORT_002](reports/TASK_REPORT_002.md) |
| 003 | Env config + structured logging | `task/003-env-config` | 2026-03-25 | [TASK_REPORT_003](reports/TASK_REPORT_003.md) |
| 011 | Embedding pipeline (HuggingFace local ONNX) | `task/011-rag-embeddings` | 2026-03-25 | [TASK_REPORT_011](reports/TASK_REPORT_011.md) |
| 012 | LanceDB vector store (read/write/search) | `task/012-lancedb-store` | 2026-03-25 | [TASK_REPORT_012](reports/TASK_REPORT_012.md) |
| 041 | Vietnamese number parser | `task/041-vn-number-parser` | 2026-03-25 | [TASK_REPORT_041](reports/TASK_REPORT_041.md) |
| 042 | Balance sheet extractor | `task/042-bctc-balance-sheet` | 2026-03-25 | [TASK_REPORT_042](reports/TASK_REPORT_042.md) |
| 014 | Embedding text builder (domain) | `task/014-embedding-text-builder` | 2026-03-26 | [TASK_REPORT_014](reports/TASK_REPORT_014.md) |
| 043 | Income statement extractor | `task/043-bctc-income-stmt` | 2026-03-26 | [TASK_REPORT_043](reports/TASK_REPORT_043.md) |
| 044 | Cash flow extractor | `task/044-bctc-cashflow` | 2026-03-26 | [TASK_REPORT_044](reports/TASK_REPORT_044.md) |
| 013 | RAG multi-level retriever | `task/013-rag-retriever` | 2026-03-26 | [TASK_REPORT_013](reports/TASK_REPORT_013.md) |
| 045 | Ratio computation | `task/045-bctc-ratios` | 2026-03-26 | [TASK_REPORT_045](reports/TASK_REPORT_045.md) |
| 046 | Period delta (QoQ / YoY) | `task/046-period-delta` | 2026-03-26 | [TASK_REPORT_046](reports/TASK_REPORT_046.md) |
| 047 | BCTC orchestrator (full parse pipeline) | `task/047-bctc-orchestrator` | 2026-03-26 | [TASK_REPORT_047](reports/TASK_REPORT_047.md) |
| 029 | SSC portal scraper | `task/029-ssc-scraper` | 2026-03-26 | [TASK_REPORT_029](reports/TASK_REPORT_029.md) |
| 081 | Bun HTTP server + SSE transport | `task/081-bun-mcp-server` | 2026-03-26 | [TASK_REPORT_081](reports/TASK_REPORT_081.md) |
| 030 | PDF downloader + pdf-parse text extractor | `task/030-pdf-extractor` | 2026-03-26 | [TASK_REPORT_030](reports/TASK_REPORT_030.md) |
| 048 | SSC fetch → parse → store pipeline | `task/048-ssc-pipeline` | 2026-03-26 | [TASK_REPORT_048](reports/TASK_REPORT_048.md) |
| 085 | SSC report MCP tools (fetch/summary/compare) | `task/085-tool-reports` | 2026-03-26 | [TASK_REPORT_085](reports/TASK_REPORT_085.md) |
| 021 | RSS base fetcher + CafeF news | `task/021-rss-cafef` | 2026-03-26 | [TASK_REPORT_021](reports/TASK_REPORT_021.md) |
| 082 | Watchlist MCP tools (add/remove/get/update) | `task/082-tool-watchlist` | 2026-03-26 | [TASK_REPORT_082](reports/TASK_REPORT_082.md) |
| 063 | Signal detector (price + news + report) | `task/063-signal-detector` | 2026-03-27 | [TASK_REPORT_063](reports/TASK_REPORT_063.md) |
| 064 | Multi-signal alert generator | `task/064-alert-generator` | 2026-03-27 | [TASK_REPORT_064](reports/TASK_REPORT_064.md) |
| 086 | Alert MCP tools (get_alerts, briefing, history) | `task/086-tool-alerts` | 2026-03-27 | [TASK_REPORT_086](reports/TASK_REPORT_086.md) |
| 087 | Server tool wiring (register all tools in createBunServer) | `task/087-server-wiring` | 2026-03-27 | [TASK_REPORT_087](reports/TASK_REPORT_087.md) |
| 022 | VnExpress Finance RSS fetcher | `task/022-rss-vnexpress` | 2026-03-27 | [TASK_REPORT_022](reports/TASK_REPORT_022.md) |
| 023 | Reuters / AP News RSS fetcher | `task/023-rss-reuters` | 2026-03-27 | [TASK_REPORT_023](reports/TASK_REPORT_023.md) |
| 061 | News normalizer → AnalysisEntry | `task/061-news-normalizer` | 2026-03-27 | [TASK_REPORT_061](reports/TASK_REPORT_061.md) |
| 062 | Causal cascade engine + runImpactChain use case | `task/062-cascade-engine` | 2026-03-27 | [TASK_REPORT_062](reports/TASK_REPORT_062.md) |
| 083 | Analysis MCP tools (fetch_and_analyze, run_impact_chain, search_similar_context) | `task/083-tool-analysis` | 2026-03-27 | [TASK_REPORT_083](reports/TASK_REPORT_083.md) |
| 088 | Legacy cleanup — delete src/server.ts + src/tools/ stubs | `task/088-legacy-cleanup` | 2026-03-27 | [TASK_REPORT_088](reports/TASK_REPORT_088.md) |
| 026 | HOSE market data fetcher (VnDirect API) | `task/026-hose-prices` | 2026-03-27 | [TASK_REPORT_026](reports/TASK_REPORT_026.md) |
| 102 | News polling job (every 30 min) | `task/102-job-news-poll` | 2026-03-28 | [TASK_REPORT_102](reports/TASK_REPORT_102.md) |
| 104 | SSC nightly report check (20:00 GMT+7) | `task/104-job-ssc-check` | 2026-03-28 | [TASK_REPORT_104](reports/TASK_REPORT_104.md) |
| 103 | Market open/close scan (09:00 + 15:30 GMT+7) | `task/103-job-market-scan` | 2026-03-28 | [TASK_REPORT_103](reports/TASK_REPORT_103.md) |
| 101 | Morning briefing job (08:00 GMT+7) | `task/101-job-morning-briefing` | 2026-03-28 | [TASK_REPORT_101](reports/TASK_REPORT_101.md) |
| 066 | AI summary generator (rule-based BCTC) | `task/066-ai-summary` | 2026-03-28 | [TASK_REPORT_066](reports/TASK_REPORT_066.md) |
| 065 | Historical pattern matcher | `task/065-pattern-matcher` | 2026-03-28 | [TASK_REPORT_065](reports/TASK_REPORT_065.md) |
| 084 | Market MCP tools (get_market_snapshot, get_patterns) | `task/084-tool-market` | 2026-03-28 | [TASK_REPORT_084](reports/TASK_REPORT_084.md) |
| 123 | Integration tests — MCP tools with real SQLite | `task/123-test-integration-mcp` | 2026-03-28 | [TASK_REPORT_123](reports/TASK_REPORT_123.md) |
| DOC-001 | Update CLAUDE.md architecture section | `task/doc-001-claude-md-update` | 2026-03-28 | [TASK_REPORT_DOC-001](reports/TASK_REPORT_DOC-001.md) |
| 024 | Trading Economics macro indicator scraper | `task/024-scraper-trading-economics` | 2026-03-28 | [TASK_REPORT_024](reports/TASK_REPORT_024.md) |
| 122 | Unit tests — domain services branch coverage | `task/122-domain-services` | 2026-03-28 | [TASK_REPORT_122](reports/TASK_REPORT_122.md) |
| 124 | Integration tests — SSC pipeline mock HTTP | `task/124-test-ssc-pipeline` | 2026-03-28 | [TASK_REPORT_124](reports/TASK_REPORT_124.md) |
| 125 | E2E test — daily briefing flow | `task/125-test-e2e-briefing` | 2026-03-28 | [TASK_REPORT_125](reports/TASK_REPORT_125.md) |
| 025 | Yahoo Finance commodity fetcher | `task/025-yahoo-finance` | 2026-03-29 | [TASK_REPORT_025](reports/TASK_REPORT_025.md) |
| 028 | SBV (State Bank Vietnam) macro fetcher | `task/028-sbv-macro` | 2026-03-29 | [TASK_REPORT_028](reports/TASK_REPORT_028.md) |
| FIX-081 | Fix SSE test timeout flakiness | `task/fix-081-sse-timeout` | 2026-03-29 | [TASK_REPORT_FIX-081](reports/TASK_REPORT_FIX-081.md) |
| 126 | Macro cascade integration | `task/126-macro-cascade` | 2026-03-29 | — |
| 089 | `get_macro_snapshot` MCP tool | `task/089-tool-macro` | 2026-03-29 | — |
| 134 | Sentiment classifier + cascade directional signals | `task/134-sentiment-classifier` | 2026-03-29 | — |
| 027 | HNX + UPCOM market data fetcher | `task/027-hnx-prices` | 2026-03-28 | [TASK_REPORT_027](reports/TASK_REPORT_027.md) |
| 105 | Evening summary job (22:00 GMT+7) | `task/105-job-evening-summary` | 2026-03-28 | [TASK_REPORT_105](reports/TASK_REPORT_105.md) |
| 121 | Unit tests — BCTC parser (Vietnamese edge cases) | `task/121-test-bctc-edge-cases` | 2026-03-28 | [TASK_REPORT_121](reports/TASK_REPORT_121.md) |
| 127 | Unit + integration tests — Puppeteer SSC fetcher | `task/127-test-ssc-puppeteer` | 2026-03-29 | — |
| 031 | Puppeteer-based SSC browser fetcher | `task/031-ssc-puppeteer` | 2026-03-29 | — |
| 032 | SSC multi-category document listing + dedup | `task/032-ssc-multi-category` | 2026-03-29 | — |
| 033 | Wire Puppeteer fetcher into sscCheckerJob | `task/033-ssc-checker-wiring` | 2026-03-29 | — |
| 128 | Unit tests — Telegram notifier (mock API) | `task/128-test-telegram` | 2026-03-29 | — |
| 034 | Telegram notifier + alert hook + send_test_telegram MCP tool | `task/034-telegram-notifier` | 2026-03-29 | — |
| 129 | Unit tests — 15-min intelligence cycle | `task/129-test-intelligence-cycle` | 2026-03-29 | — |
| 106 | 15-min intelligence cycle job | `task/106-job-intelligence-cycle` | 2026-03-29 | — |
| 035 | VnEconomy stocks + finance RSS fetcher | `task/035-vneconomy-fetcher` | 2026-03-29 | — |
| 131 | Alert cooldown + dedup + grouper | `task/131-alert-quality` | 2026-04-01 | [TASK_REPORT_131](reports/TASK_REPORT_131.md) |
| 132 | BCTC validator (accounting identity + magnitude) | `task/132-bctc-validator` | 2026-04-01 | [TASK_REPORT_132](reports/TASK_REPORT_132.md) |
| 133 | Volatility calculator + adaptive thresholds | `task/133-volatility-calculator` | 2026-04-01 | [TASK_REPORT_133](reports/TASK_REPORT_133.md) |
| 135 | RAG temporal decay retriever | `task/135-rag-temporal-decay` | 2026-03-29 | — |
| 130 | Periodic summary generator (daily/weekly/monthly/quarterly/yearly) | `task/130-periodic-summaries` | 2026-03-29 | — |
| 136 | Wire circuit breaker into hose.ts + ssc.ts | `task/136-circuit-breaker` | 2026-03-29 | — |
| 137 | Fix alert pipeline — Step E reads DB alerts | `task/137-fix-alert-pipeline` | 2026-04-01 | [TASK_REPORT_137](reports/TASK_REPORT_137.md) |
| 138 | Fix impact chain — real runImpactChain in Step D | `task/138-fix-impact-chain` | 2026-03-29 | — |
| 139 | VN-Index live feed via CafeF index endpoint | `task/139-vnindex-cafef` | 2026-03-29 | — |
| 140 | SQLite WAL checkpoint — daily cron + SIGTERM hook | `task/140-wal-checkpoint` | 2026-03-29 | — |
| 141 | Enhance get_system_health — WAL size, alert stats, last cycle | `task/141-system-health-tool` | 2026-03-29 | — |
| 142 | Cross-signal conviction scorer | `task/142-conviction-scorer` | 2026-03-30 | — |
| 143 | Sector peer wiring into Telegram alert body | `task/143-sector-peer-alerts` | 2026-03-30 | — |
| 144 | Historical parallel in Telegram alert body | `task/144-historical-parallel-alert` | 2026-03-30 | — |
| 145 | Morning briefing upgrade — conviction + unresolved alerts | `task/145-briefing-upgrade` | 2026-03-30 | — |
| 146 | Proactive weekly pattern watch (Sunday 22:30 Telegram) | `task/146-weekly-pattern-watch` | 2026-03-30 | — |
| 147 | Morning briefing Telegram delivery | `task/147-briefing-telegram` | 2026-03-30 | — |
| 148 | Alert resolution lifecycle + resolve_alert MCP tool | `task/148-alert-resolution` | 2026-03-30 | — |
| 149 | get_portfolio_conviction MCP tool | `task/149-portfolio-conviction` | 2026-03-30 | — |
| 150 | Conviction score history (conviction_history table) | `task/150-conviction-history` | 2026-03-30 | — |
| 151 | Sigma data sufficiency health check | `task/151-sigma-readiness` | 2026-03-30 | — |
| 152 | News-mention alert noise filter | `task/152-news-alert-filter` | 2026-04-01 | — |
| 153 | SSC scan deduplication | `task/153-ssc-scan-dedup` | 2026-04-01 | — |
| 154 | Silence LanceDB TRACE logging | `task/154-lancedb-log-silence` | 2026-04-01 | — |
| 155 | Log file rotation (size-based, 3 rolling files) | `task/155-log-rotation` | 2026-04-01 | — |
| 156 | Off-hours cycle interval increase (15 min → 60 min) | `task/156-offhours-interval` | 2026-04-01 | — |
| 157 | Data audit engine: dataAuditJob.ts + schema migration | `task/157-data-audit-job` | 2026-04-01 | [TASK_REPORT_157](reports/TASK_REPORT_157.md) |
| 158 | Scheduler wiring: CRONS.dataAuditDaily + dataAuditWeekly | `task/158-audit-scheduler-wiring` | 2026-04-01 | [TASK_REPORT_158](reports/TASK_REPORT_158.md) |
| 159 | get_system_health db_audit section | `task/159-health-db-audit` | 2026-04-01 | [TASK_REPORT_159](reports/TASK_REPORT_159.md) |
| 160 | Company name alias dictionary (stockAliases.ts) | `task/160-stock-aliases` | 2026-04-01 | [TASK_REPORT_160](reports/TASK_REPORT_160.md) |
| 161 | Wire aliases into cascade engine + pollNews | `task/161-alias-wiring` | 2026-04-01 | — |
| 162 | Market-wide pattern cascade to all watchlist stocks | `task/162-market-wide-broadcast` | 2026-04-01 | — |
| 163 | SQLite schema: prediction_markets + prediction_signals tables | `task/163-prediction-schema` | 2026-04-01 | — |
| 169 | mcp.config.json predictionMarkets section + config.ts type extension | `task/169-prediction-config` | 2026-04-01 | — |
| 165 | Prediction cascade mapper (predictionCascadeMapper.ts) | `task/165-prediction-cascade-mapper` | 2026-04-01 | [TASK_REPORT_165](reports/TASK_REPORT_165.md) |
| 164 | Polymarket REST fetcher (polymarket.ts) | `task/164-polymarket-fetcher` | 2026-04-01 | — |
| 166 | Prediction signal detector (type stub) | `task/166-prediction-signal-detector` | 2026-04-01 | — |
| 167 | Prediction market scheduler job + cron wiring | `task/167-prediction-market-job` | 2026-04-01 | — |
| 168 | get_prediction_markets MCP tool | `task/168-prediction-mcp-tool` | 2026-04-01 | — |
| 172 | Prediction signals section in morning briefing + evening summary | `task/172-prediction-briefing` | 2026-04-01 | [TASK_REPORT_172](reports/TASK_REPORT_172.md) |

> **Sprint 003 COMPLETE** — All 5 tasks merged: 021, 082, 063, 064, 086. PO sign-off: APPROVED 2026-03-27.
> **Sprint 004 Wave 1** — Tasks 087, 022, 023 merged: 2026-03-27.
> **Sprint 004 Wave 2** — Task 061 merged: 2026-03-27. Task 062 unblocked.
> **Sprint 004 Wave 3** — Task 062 merged: 2026-03-27. Task 083 now unblocked (Wave 4).
> **Sprint 004 COMPLETE** — All 6 tasks merged: 087, 022, 023, 061, 062, 083. QA approved: 2026-03-27.
> **Sprint 005 Wave 1** — Task 088 merged: 2026-03-27. Wave 2 (026, 102, 104) now unblocked.
> **Sprint 005 Wave 2** — Task 026 merged: 2026-03-27. Task 103 (market scan jobs) now unblocked.
> **Sprint 005 Wave 2** — Task 104 merged: 2026-03-28. SSC nightly check live at 20:00 GMT+7.
> **Sprint 005 COMPLETE** — All 6 tasks merged: 088, 026, 102, 104, 103, 101. QA approved: 2026-03-28.
> **Sprint 006 PLANNING** — Tasks 065, 066, 027, 084, 105, 123 promoted to Todo. See SPRINT_GOAL.md sprint_id: 006.
> **Sprint 006 ACTIVE** — 2026-03-28. Wave 1 (065, 066, 027, 105) ready to assign. WIP limit: 2. TECH_006.md approved by Architect.
> **Sprint 006 Wave 1** — Task 066 completed: 2026-03-28. Rule-based AI summary generator with 40 tests.
> **Sprint 006 Wave 1** — Task 065 completed: 2026-03-28. Historical pattern matcher, 15 tests pass.
> **Sprint 006 Wave 2** — Task 084 merged: 2026-03-28. Market MCP tools (get_market_snapshot, get_patterns), 14/14 tests pass, toolCount 14→16. Task 123 now unblocked (Wave 3).
> **Sprint 006 COMPLETE** — All 6 tasks merged: 065, 066, 027, 105, 084, 123. QA approved: 2026-03-28. 28-test integration harness covers all 16 MCP tools across 5 end-to-end roundtrip chains with real SQLite.
> **Sprint 008 Wave 1** — All 3 tasks merged: FIX-081, 025, 028. QA approved: 2026-03-29. Full suite: 842 pass, 0 fail. Yahoo Finance commodity fetcher (13 tests), SBV macro fetcher (14 tests), SSE timeout fix (8 tests hardened).
> **Sprint 008 Wave 2** — All 2 tasks merged: 126, 089. QA approved: 2026-03-29. Macro cascade integration (15 tests), get_macro_snapshot MCP tool (16 tests). toolCount 16 → 17.
> **Sprint 008 COMPLETE** — All 5 tasks merged: FIX-081, 025, 028, 126, 089. Sprint 008 delivers the macro intelligence layer: commodity prices, SBV central bank rates, causal chain macro adjustments, and get_macro_snapshot MCP tool. 66 new tests added.
> **Sprint 010-011 QA batch** — Tasks 131, 132, 133, 137 merged: 2026-04-01. Alert quality (35 tests), BCTC validator (26 tests), adaptive thresholds (25 tests), Step E fix (18 tests). tsc: 0 errors.
> **Sprint 017 COMPLETE** — All 5 tasks merged: 152, 153, 154, 155, 156. Production Hardening: noise filter, SSC dedup, LanceDB silence, log rotation, off-hours interval. 16 new tests.
> **Sprint 018 COMPLETE** — All 3 tasks merged: 157, 158, 159. Data audit engine, scheduler wiring, health tool enhancement. 2026-04-01.
> **Sprint 019 COMPLETE** — All 3 tasks merged: 160, 161, 162. QA approved: 2026-04-01. 69 new tests (160: 34, 161: 19, 162: 16). stockAliases, alias wiring in cascadeEngine + pollNews, market-wide broadcast.
> **Sprint 020 COMPLETE** — Prediction Market Intelligence pipeline: schema (163), config (169), cascade mapper (165), signal detector stub (166), scheduler job (167), MCP tool (168), Polymarket fetcher (164). NOTE: task 166 is a type-stub only — `detectPredictionSignals` not yet implemented. Sprint 021 completes the loop.
> **Sprint 021 QA batch** — Tasks 165 + 172 merged: 2026-04-01. Prediction cascade mapper (38 tests), prediction signals in briefings (18 tests). tsc: 0 errors.

---

## 🔍 REVIEW

| # | Title | Branch | Notes |
|---|-------|--------|-------|
| — | — | — | Empty |

---

## 🚧 IN PROGRESS

| # | Title | Branch | Notes |
|---|-------|--------|-------|
| — | — | — | Empty |

---

## 📋 TODO
*(Dependencies cleared — ready to assign)*

### Sprint 022 — House in Order

> Sprint 022 ACTIVE — 2026-04-01. PO vision set. All 4 tasks independent, can run in parallel.
> Design ref: SPRINT_GOAL.md sprint_id: 022.

| # | Title | Branch | Agent | Layer | Priority | Depends on | Status |
|---|-------|--------|-------|-------|----------|------------|--------|
| 174 | CLAUDE.md full sync — Sprints 014-021 | `task/174-claude-md-sync` | Developer | docs/ | P0 | — | **Backlog** |
| 175 | Stale branch + worktree cleanup | `task/175-branch-cleanup` | Developer | git | P1 | — | **Backlog** |
| 176 | `trigger_alert_check` MCP tool | `task/176-trigger-alert-check` | Developer | interface/mcp + application | P1 | — | **Backlog** |
| 177 | TASKS.md Kanban housekeeping | `task/177-tasks-housekeeping` | Developer | docs/ | P2 | — | **Backlog** |

---

### Sprint 017 — Production Hardening

> Sprint 017 COMPLETE — 2026-04-01. All 5 tasks done.
> Tasks 152, 154, 156 merged in earlier sessions. Tasks 153, 155 merged 2026-04-01.

| # | Title | Priority | Status |
|---|-------|----------|--------|
| 152 | News-mention alert noise filter | P0 | Done |
| 153 | SSC scan deduplication | P0 | Done — merged 2026-04-01 |
| 154 | Silence LanceDB TRACE logging | P1 | Done |
| 155 | Log file rotation | P1 | Done — merged 2026-04-01 |
| 156 | Off-hours cycle interval increase | P2 | Done |

### Sprint 018 — Data Integrity First

> Sprint 018 COMPLETE — 2026-04-01. All 3 tasks merged: 157 (data audit engine), 158 (scheduler wiring), 159 (get_system_health db_audit section).
> Design refs: docs/REQ_018.md (BA) + docs/TECH_018.md (Architect).
> Full suite at merge: 1171 pass, 3 fail (all pre-existing), 0 TypeScript errors.

---

### Sprint 020 — Prediction Market Intelligence

> Sprint 020 COMPLETE — 2026-04-01. All 7 tasks done.
> Tasks 163, 164, 165, 166, 167, 168, 169 merged. Note: task 166 is a type stub only — full impl in task 171.
> Design refs: docs/REQ_020.md (BA) + docs/TECH_020.md (Architect — APPROVED).

---

### Sprint 021 — Close the Loop

> Sprint 021 PARTIAL — Tasks 165 + 172 merged: 2026-04-01. Tasks 170, 171, 173 remain in backlog.
> Design refs: SPRINT_GOAL.md sprint_id: 021.

| # | Title | Branch | Agent | Layer | Priority | Depends on | Status |
|---|-------|--------|-------|-------|----------|------------|--------|
| 170 | Fix pre-existing test failures — 062 stale assertion | `task/170-fix-test-failures` | Developer | tests | P0 | — | **Backlog** |
| 171 | Implement `detectPredictionSignals` (full logic, not stub) | `task/171-prediction-signal-impl` | Developer | domain/services | P0 | — | **Backlog** |
| 173 | Prediction market cascade: wire signals into `buildCausalChain` via `runPredictionImpactChain` | `task/173-prediction-cascade-wiring` | Developer | application/usecases + scheduler | P1 | 171 ✓, 165 ✓ | **Backlog** |

---

#### Task 170 — Fix pre-existing test failures

**Branch**: `task/170-fix-test-failures`
**Layer**: tests only
**Priority**: P0
**Depends on**: nothing
**Estimated effort**: 30 minutes

**Context**: `062-cascade-engine.test.ts` line 221 asserts `bankImpacts.length === 0` for an
oil-price news entry. Sprint 013 added macro rules that correctly trigger banking domain via
oil sector NPL risk. The production rule is correct; the test expectation is stale.

**Files to read first**:
- `src/__tests__/062-cascade-engine.test.ts` lines 203-222 — the failing test
- `src/domain/services/cascadeEngine.ts` — search for `banking` and `oil` rules to confirm
  current behaviour

**Files to modify**:
- MODIFY: `src/__tests__/062-cascade-engine.test.ts` — update the assertion at line 221 from
  `expect(bankImpacts.length).toBe(0)` to reflect that banking IS triggered by oil-price
  shocks via the macro NPL risk rule. Either: (a) assert `>= 0` (accept any), or (b) assert
  the specific count if deterministic, or (c) restructure the test to assert only that
  oil_gas/aviation are triggered (which was the original intent) without asserting banking is
  NOT triggered.

**Acceptance Criteria**:
- `bun test src/__tests__/062-cascade-engine.test.ts` → 0 failures
- `bun tsc --noEmit` → 0 errors
- No production code changes

---

#### Task 171 — Implement `detectPredictionSignals`

**Branch**: `task/171-prediction-signal-impl`
**Layer**: domain/services
**Priority**: P0
**Depends on**: nothing (parallel with task 170)
**Estimated effort**: 2 hours

**Files to read first**:
- `src/domain/services/predictionSignalDetector.ts` — current type stubs
- `src/__tests__/166-prediction-signal-detector.test.ts` — existing (failing) test file
- `docs/TECH_020.md` — Section 4 "Signal detector design"
- `src/scheduler/predictionMarketJob.ts` lines 355-400 — dynamic import + usage of `detectPredictionSignals`

**Files to modify**:
- MODIFY: `src/domain/services/predictionSignalDetector.ts` — add `PredictionSignalConfig` interface + `detectPredictionSignals` function (pure domain, zero I/O)
- MODIFY: `src/__tests__/166-prediction-signal-detector.test.ts` — update test cases to match the real function signature (currently fail due to missing export)

**Acceptance Criteria**:
- `bun test src/__tests__/166-prediction-signal-detector.test.ts` → 0 failures, >= 20 tests
- `detectPredictionSignals([], [], config)` returns `[]`
- A market with `volume24h >= volumeSpikeThresholdUsd` produces a `volume_spike` signal
- A market with yesPrice change >= `probabilityShiftPct / 100` produces a `probability_shift` signal
- Markets with no matching previous snapshot do not throw
- `bun tsc --noEmit` → 0 errors

---

#### Task 173 — Prediction market cascade wiring

**Branch**: `task/173-prediction-cascade-wiring`
**Layer**: application/usecases + scheduler
**Priority**: P1
**Depends on**: 171 ✓, 165 ✓ (predictionCascadeMapper already merged)
**Estimated effort**: 2 hours

**Files to read first**:
- `src/application/usecases/runImpactChain.ts` — existing `runImpactChain` function; add sibling export
- `src/domain/services/predictionCascadeMapper.ts` — `mapPredictionToSignals` function signature
- `src/scheduler/predictionMarketJob.ts` — where to call `runPredictionImpactChain`
- `src/infrastructure/db/alertStore.ts` — `insertAlert` helper

**Files to modify**:
- MODIFY: `src/application/usecases/runImpactChain.ts` — add `runPredictionImpactChain(signals, watchlist, db): Promise<Alert[]>`
- MODIFY: `src/scheduler/predictionMarketJob.ts` — after `detectPredictionSignals`, call `runPredictionImpactChain` for high/critical signals; store resulting alerts

**Files to create**:
- CREATE: `src/__tests__/173-prediction-impact-chain.test.ts`

**Acceptance Criteria**:
- A `probability_shift` signal with severity `high` produces >= 1 alert for matching watchlist stocks
- `runPredictionImpactChain([], watchlist, db)` returns `[]` without error
- Alerts are persisted in `alerts` table and retrievable via `get_alerts`
- `bun test src/__tests__/173-prediction-impact-chain.test.ts` → 0 failures, >= 12 tests

---
### Sprint 019 — Know What You're Watching

> Sprint 019 COMPLETE — 2026-04-01. All 3 tasks merged. 69 new tests (160: 34, 161: 19, 162: 16).
> Design refs: docs/REQ_019.md (BA) + docs/TECH_019.md (Architect — approved).
> Full suite: 1256 pass, 3 fail (pre-existing locale), tsc 0 errors.

| # | Title | Branch | Agent | Layer | Priority | Depends on | Status |
|---|-------|--------|-------|-------|----------|------------|--------|
| REQ-019 | BA: Requirement Spec for Sprint 019 | `task/doc-001-claude-md-update` | BA | docs/ | P0 | — | Done — docs/REQ_019.md |
| TECH-019 | Architect: Technical Design for Sprint 019 | `task/doc-001-claude-md-update` | Architect | docs/ | P0 | REQ-019 | Done — docs/TECH_019.md |
| 160 | Company name alias dictionary (`stockAliases.ts`) | `task/160-stock-aliases` | Developer | domain/services | P0 | TECH-019 | Done — merged 2026-04-01 |
| 161 | Wire aliases into cascade engine + pollNews Gate 3 | `task/161-alias-wiring` | Developer | domain/services + application/usecases | P0 | 160 ✓ | Done — merged 2026-04-01 |
| 162 | Market-wide pattern cascade to all watchlist stocks | `task/162-market-wide-broadcast` | Developer | domain/services + application/usecases + mcp.config.json | P1 | 160 ✓ | Done — merged 2026-04-01 |

---

### Sprint 005 — Scheduler Foundation

> Sprint 005 COMPLETE — 2026-03-28. All 6 tasks merged: 088, 026, 102, 104, 103, 101. QA approved.

---

## 🔍 REVIEW (historical — Sprint 006 Wave 1)

### Sprint 006 — Wave 1

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| ~~027~~ | ~~HNX + UPCOM market data fetcher~~ | ~~`task/027-hnx-prices`~~ | ~~Developer~~ | ~~infrastructure~~ | ~~026 ✅, 003 ✅~~ | ~~Done~~ |
| ~~065~~ | ~~Historical pattern matcher~~ | ~~`task/065-pattern-matcher`~~ | ~~Developer~~ | ~~application~~ | ~~013 ✅, 046 ✅~~ | ~~Done~~ |
| ~~084~~ | ~~Market MCP tools (get_market_snapshot, get_patterns)~~ | ~~`task/084-tool-market`~~ | ~~Developer~~ | ~~interface~~ | ~~081 ✅, 013 ✅, 065 ✅~~ | ~~Done~~ |

---

### Deferred to Sprint 006+

| # | Title | Branch | Layer | Depends on |
|---|-------|--------|-------|------------|
| ~~024~~ | ~~Trading Economics scraper~~ | ~~`task/024-scraper-trading-economics`~~ | ~~infra~~ | ~~003 ✅~~ |
| ~~025~~ | ~~Yahoo Finance commodity fetcher~~ | ~~`task/025-yahoo-finance`~~ | ~~infra~~ | ~~003 ✅~~ |
| ~~026~~ | ~~HOSE market data fetcher~~ | ~~`task/026-hose-prices`~~ | ~~infra~~ | ~~003 ✅~~ |
| ~~027~~ | ~~HNX + UPCOM market data fetcher~~ | ~~`task/027-hnx-prices`~~ | ~~infra~~ | ~~003 ✅~~ |
| ~~028~~ | ~~SBV (State Bank Vietnam) macro fetcher~~ | ~~`task/028-sbv-macro`~~ | ~~infra~~ | ~~003 ✅~~ |

### Sprint 004 — DONE (historical)

| # | Title | Branch | Layer | Depends on |
|---|-------|--------|-------|------------|
| ~~021~~ | ~~RSS base fetcher + CafeF news~~ | ~~`task/021-rss-cafef`~~ | ~~infra~~ | ~~003 ✅~~ |
| ~~082~~ | ~~Watchlist MCP tools (add/remove/get/update)~~ | ~~`task/082-tool-watchlist`~~ | ~~interface~~ | ~~081 ✅, 002 ✅~~ |
| ~~063~~ | ~~Signal detector (price + news + report)~~ | ~~`task/063-signal-detector`~~ | ~~domain~~ | ~~021, 082~~ |
| ~~064~~ | ~~Multi-signal alert generator~~ | ~~`task/064-alert-generator`~~ | ~~domain~~ | ~~063 ✅~~ |
| ~~086~~ | ~~Alert MCP tools (get_alerts, briefing, history)~~ | ~~`task/086-tool-alerts`~~ | ~~interface~~ | ~~064 ✅, 081 ✅~~ |

---

## 🗂 BACKLOG
*(Ordered by priority — move to Todo when dependencies are Done)*

### 📡 Infrastructure Fetchers (021–039)

*(022, 023 promoted to Sprint 004; 026 promoted to Sprint 005 Todo)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| ~~024~~ | ~~Trading Economics scraper~~ | ~~`task/024-scraper-trading-economics`~~ | ~~infra~~ | ~~003 ✅~~ | ~~Done — merged 2026-03-28~~ |
| ~~025~~ | ~~Yahoo Finance commodity fetcher~~ | ~~`task/025-yahoo-finance`~~ | ~~infra~~ | ~~003 ✅~~ | ~~Done — ready for review 2026-03-28~~ |
| ~~028~~ | ~~SBV (State Bank Vietnam) macro fetcher~~ | ~~`task/028-sbv-macro`~~ | ~~infra~~ | ~~003 ✅~~ | ~~Done — merged 2026-03-29~~ |

---

### ⚙️ Domain: Analysis Engine (061–079)

*(061, 062 promoted to Sprint 004)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| ~~065~~ | ~~Historical pattern matcher~~ | ~~`task/065-pattern-matcher`~~ | ~~application~~ | ~~013 ✅, 046 ✅~~ | ~~Done ✅~~ |
| ~~066~~ | ~~AI summary generator~~ | ~~`task/066-ai-summary`~~ | ~~application~~ | ~~061 ✅, 047 ✅~~ | ~~Done ✅~~ |

---

### 🔌 Interface: MCP Server + Tools (081–099)

*(083 promoted to Sprint 004; 088 promoted to Sprint 005 Todo)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| ~~084~~ | ~~Market tools (get_market_snapshot, get_patterns)~~ | ~~`task/084-tool-market`~~ | ~~interface~~ | ~~081 ✅, 013 ✅, 065 ✅~~ | ~~Done ✅~~ |

---

### ⏰ Interface: Scheduler (101–119)

*(101, 102, 103, 104 promoted to Sprint 005 Todo)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| ~~105~~ | ~~Evening summary job (22:00)~~ | ~~`task/105-job-evening-summary`~~ | ~~interface~~ | ~~086 ✅~~ | ~~Done — merged to main 2026-03-28; 14 tests pass, tsc 0 errors~~ |

---

### 🧪 Tests (121–139)

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| ~~121~~ | ~~Unit tests — BCTC parser (Vietnamese edge cases)~~ | ~~`task/121-test-bctc-edge-cases`~~ | ~~test~~ | ~~042-047~~ | ~~Done — merged to main 2026-03-28; 36 tests pass, tsc 0 errors~~ |
| ~~122~~ | ~~Unit tests — domain services~~ | ~~`task/122-test-domain-services`~~ | ~~test~~ | ~~061-066~~ | ~~Done — 78 tests, 4 services ≥90% branch coverage; merged 2026-03-28~~ |
| ~~123~~ | ~~Integration tests — MCP tools with real SQLite~~ | ~~`task/123-test-integration-mcp`~~ | ~~test~~ | ~~082-086, 084 ✅~~ | ~~Done — merged 2026-03-28~~ |
| ~~124~~ | ~~Integration tests — SSC pipeline (mock HTTP)~~ | ~~`task/124-test-ssc-pipeline`~~ | ~~test~~ | ~~048~~ | ~~Done — 17 tests pass; merged 2026-03-28~~ |
| ~~125~~ | ~~E2E test — daily briefing flow~~ | ~~`task/125-test-e2e-briefing`~~ | ~~test~~ | ~~101-105~~ | ~~Done — 39 tests pass; merged 2026-03-28~~ |

---

## Sprint 009 — SSC Puppeteer + Telegram + Intelligence Cycle

> Sprint 009 COMPLETE — 2026-03-29. All 8 tasks merged: 127, 031, 032, 033, 128, 034, 129, 106.

---

## Kanban Summary

| Column | Count | Tasks |
|--------|-------|-------|
| ✅ Done | 120+ | Sprints 000-021 (see Done table above) |
| 🔍 Review | 0 | — |
| 🚧 In Progress | 0 | — |
| 📋 Todo | 4 | 174, 175, 176, 177 (Sprint 022) |
| 🗂 Backlog | 3 | 170, 171, 173 (Sprint 021 remainder) |
| **Total** | **127+** | |

---

## DDD Layer Summary

| Layer | Tasks | Description |
|-------|-------|-------------|
| **Domain** | 041-048, 061-066, 014 | Pure business logic, no I/O |
| **Infrastructure** | 002, 003, 011-013, 021-030 | SQLite, LanceDB, HTTP, scrapers |
| **Application** | 047, 048, 065, 066 | Use case orchestration |
| **Interface** | 081-105 | MCP tools, Bun server, scheduler |
| **Test** | 121-125 | Cross-cutting |

---

## Definition of Done (DoD)

A task is **Done** when ALL of the following are true:

- [ ] Code is on `task/NNN` branch
- [ ] `bun test src/__tests__/NNN-*.test.ts` → all pass
- [ ] `bun tsc --noEmit` → 0 errors
- [ ] QA checklist: 100% ✅
- [ ] Zero BLOCKING issues in Task Report
- [ ] Merged to `main` via `--no-ff`
- [ ] `reports/TASK_REPORT_NNN.md` generated
- [ ] Kanban card moved to Done
- [ ] TASKS.md updated (move row to Done table)
