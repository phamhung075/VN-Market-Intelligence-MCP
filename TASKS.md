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

---

## 🔍 REVIEW

*Empty*

---

## 🚧 IN PROGRESS

*Empty — ready to start*

---

## 📋 TODO
*(Dependencies cleared — ready to assign)*

| # | Title | Branch | Layer | Depends on |
|---|-------|--------|-------|------------|
| 063 | Signal detector (price + news + report) | `task/063-signal-detector` | domain | 002 ✅ |
| 021 | RSS base fetcher + CafeF news | `task/021-rss-cafef` | infra | 003 ✅ |
| 024 | Trading Economics scraper | `task/024-scraper-trading-economics` | infra | 003 ✅ |
| 025 | Yahoo Finance commodity fetcher | `task/025-yahoo-finance` | infra | 003 ✅ |
| 026 | HOSE market data fetcher | `task/026-hose-prices` | infra | 003 ✅ |
| 027 | HNX + UPCOM market data fetcher | `task/027-hnx-prices` | infra | 003 ✅ |
| 028 | SBV (State Bank Vietnam) macro fetcher | `task/028-sbv-macro` | infra | 003 ✅ |
| 029 | SSC portal scraper | `task/029-ssc-scraper` | infra | 002 ✅, 003 ✅ |
| 081 | Bun HTTP server + SSE transport | `task/081-bun-mcp-server` | interface | 002 ✅, 003 ✅ |

---

## 🗂 BACKLOG
*(Ordered by priority — move to Todo when dependencies are Done)*

### 📡 Infrastructure Fetchers (021–039)

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 022 | VnExpress Finance RSS fetcher | `task/022-rss-vnexpress` | infra | 021 | Same as 021 for VnExpress Finance RSS |
| 023 | Reuters / AP News RSS fetcher | `task/023-rss-reuters` | infra | 021 | `fetchReuters()` returns ≥5 international news items |
| 030 | PDF downloader + pdf-parse text extractor | `task/030-pdf-extractor` | infra | 029 | `downloadAndExtractPdf(url)` returns string with confidence > 0; handles scanned PDF gracefully (returns low confidence, not crash) |

---

### 📊 Domain: BCTC Parser (041–059)

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| ~~047~~ | ~~BCTC orchestrator (full parse pipeline)~~ | ~~`task/047-bctc-orchestrator`~~ | ~~application~~ | ~~042-046, 030~~ | **Review** — `parseBctcReport` implemented; 9/9 tests pass |
| 048 | SSC fetch → parse → store pipeline | `task/048-ssc-pipeline` | application | 047, 029, 011 | `fetchParseAndStoreBctc('VCB', 2025, 'Q1')` full pipeline: scrape → download → parse → ratios → embed → SQLite + LanceDB |

---

### ⚙️ Domain: Analysis Engine (061–079)

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 061 | News normalizer → AnalysisEntry | `task/061-news-normalizer` | domain | 014 | `normalizeNews(rawItem)` returns valid AnalysisEntry with level, sentiment, impactScore (0-10); test: neutral news scores 0-3 |
| 062 | Causal cascade engine | `task/062-cascade-engine` | domain | 061, 013 | `runImpactChain(newsText, watchlist)` returns chain with ≥1 domain entry and ≥1 action entry; confidence ≥ 0.5; test: oil news → oil_gas sector |
| 064 | Multi-signal alert generator | `task/064-alert-generator` | domain | 063 | `generateAlerts(signals, watchlist, thresholds)` creates Alert with correct severity; 3-signal combo → critical; stores in SQLite |
| 065 | Historical pattern matcher | `task/065-pattern-matcher` | application | 013, 046 | `getPatternSummary('GAS', 'oil price', 24)` returns summary with ≥3 historical precedents; averages impact direction |
| 066 | AI summary generator | `task/066-ai-summary` | application | 061, 047 | `generateAiSummary(report)` returns AIAnalysis with signals[], outlook, keyStrengths[]; stores in FinancialReport.aiAnalysis |

---

### 🔌 Interface: MCP Server + Tools (081–099)

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 082 | Watchlist MCP tools (add/remove/get/update) | `task/082-tool-watchlist` | interface | 081, 002 | All 4 tools registered; add then get returns the stock; thresholds persist across restart |
| 083 | Analysis MCP tools (fetch_and_analyze, impact_chain) | `task/083-tool-analysis` | interface | 081, 062 | fetch_and_analyze returns ≥1 analysis entry; run_impact_chain returns chain for oil-related text |
| 084 | Market tools (snapshot, search_context, patterns) | `task/084-tool-market` | interface | 081, 013, 065 | get_market_snapshot returns VN-Index + prices; search_similar_context returns relevant past analysis |
| 085 | SSC report MCP tools (fetch/summary/compare) | `task/085-tool-reports` | interface | 081, 048 | fetch_ssc_reports triggers full pipeline; get_financial_summary returns formatted metrics; compare_financials shows YoY |
| 086 | Alert MCP tools (get_alerts, briefing, history) | `task/086-tool-alerts` | interface | 081, 064 | get_alerts filters correctly; run_daily_briefing returns structured report; mark_alert_read updates DB |

---

### ⏰ Interface: Scheduler (101–119)

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 101 | Morning briefing job (08:00 GMT+7) | `task/101-job-morning-briefing` | interface | 083, 086 | Cron fires at 08:00; calls fetchAllNews + generateDailyBriefing; stores result; test: manual trigger works |
| 102 | News polling job (every 30 min) | `task/102-job-news-poll` | interface | 021-023, 062, 064 | Polls all sources; runs cascade analysis; generates alerts if signals detected; deduplicates already-seen URLs |
| 103 | Market open/close scan jobs | `task/103-job-market-scan` | interface | 026, 027, 063 | Open job at 09:00 + close job at 15:30 (weekdays only); stores MarketSnapshot; detects abnormal volume |
| 104 | SSC nightly report check (20:00) | `task/104-job-ssc-check` | interface | 048 | Checks all watchlist stocks for new reports; triggers parse pipeline if new; sends alert if found |
| 105 | Evening summary job (22:00) | `task/105-job-evening-summary` | interface | 086 | Generates end-of-day digest; stores in reports/ folder with date filename |

---

### 🧪 Tests (121–139)

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 121 | Unit tests — BCTC parser (Vietnamese edge cases) | `task/121-test-bctc-edge-cases` | test | 042-047 | 20+ edge cases: parentheses negatives, missing fields, image-only PDF, corrupt PDF |
| 122 | Unit tests — domain services | `task/122-test-domain-services` | test | 061-066 | Cascade engine, signal detector, alert generator all have ≥90% branch coverage |
| 123 | Integration tests — MCP tools with real SQLite | `task/123-test-integration-mcp` | test | 082-086 | Full tool call roundtrip: add watchlist → fetch news → generate alert → get alert |
| 124 | Integration tests — SSC pipeline (mock HTTP) | `task/124-test-ssc-pipeline` | test | 048 | Mock SSC HTML + PDF; verify full parse → store → embed pipeline |
| 125 | E2E test — daily briefing flow | `task/125-test-e2e-briefing` | test | 101-105 | Full daily briefing: trigger → fetch → analyze → alert → report; assert final output structure |

---

## Kanban Summary

| Column | Count | Tasks |
|--------|-------|-------|
| ✅ Done | 14 | 000, 001, 002, 003, 011, 012, 013, 014, 041, 042, 043, 044, 045, 046 |
| 🔍 Review | 1 | 047 |
| 🚧 In Progress | 0 | — |
| 📋 Todo | 9 | 021, 024-029, 063, 081 |
| 🗂 Backlog | 10 | 022, 023, 030, 048, 061, 062, 064-066, 082-086, 101-105, 121-125 |
| **Total** | **35** | |

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
