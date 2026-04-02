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
| 194 | CLAUDE.md sync through Sprint 026 | `main` (7f53108) | 2026-04-02 | — |
| HOT-01 | fix: source .env in start.sh — Telegram token missing | `main` (c5b925e) | 2026-04-02 | — |
| HOT-02 | feat: delete_telegram_report MCP tool + auto-cleanup workflow | `main` (c6ea1ce) | 2026-04-02 | — |

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

---

## 🔍 REVIEW

| # | Title | Branch | Notes |
|---|-------|--------|-------|
| DOC-001 | Update CLAUDE.md architecture section | `task/doc-001-claude-md-update` | Ready for QA |
| 195 | Portfolio rebalancing signals: `get_rebalancing_signals` | `task/195-rebalancing-signals` | 17 tests pass, tsc clean, awaiting QA sign-off |
| 215 | Telegram webhook registration + security | `task/215-telegram-webhook` | Ready for QA |
| 217 | compare_stocks MCP tool — side-by-side comparison | `worktree-agent-a1f64692` | 20 tests pass, tsc 0 errors |
| 218 | Weekly portfolio report via Telegram | `worktree-agent-a219df68` | 14 tests pass, tsc clean |
| 219 | Custom alert rules engine | `task/219-custom-alert-rules` | 21 tests pass, tsc clean, 3 MCP tools |
| 223 | Portfolio target allocation: `set_target_allocation` / `get_target_allocation` | `task/223-target-allocation` | 22 tests pass, tsc clean, toolCount 53→55 |

---

## 🚧 IN PROGRESS

| # | Title | Branch | Notes |
|---|-------|--------|-------|
| — | — | — | Empty |

---

### Sprint 028 — Bug Fixes & Alert Quality (2026-04-02)

> Triggered by: production monitoring reports (news-scout, alert-commander, market-watcher)
> All fixes applied directly on main — hotfix batch

| # | Title | Status | Notes |
|---|-------|--------|-------|
| 198 | VN-Index → banking/real_estate cascade rules | ✅ Done | Added 4 rules (up/down × banking/real_estate) + "mất điểm tháng" keyword |
| 199 | Sentiment classifier: insider selling from leaders | ✅ Done | Added "muốn thoái sạch vốn" (w5), "thoái sạch vốn" (w4), "lãnh đạo bán" (w3), increased insider selling weights |
| 200 | Macro pressure dual alert (Brent+USD/VND) | ✅ Done | Added 4 combined rules: aviation -0.15, logistics -0.12, retail -0.08, automotive -0.10 |
| 201 | Cap macro penalty per entry | ✅ Done | MAX_MACRO_NEGATIVE_DELTA = -0.25 prevents over-penalisation of infrastructure news |
| 202 | VCB news_mention noise filter | ✅ Done | Market-wide cascade impacts now require direct mention to trigger news_mention alerts |
| 203 | Investigate Vinamilk → VNM alias | ✅ Investigated | Code correct — "vinamilk" in dictionary. Likely VNM not in watchlist at runtime |
| 204 | Investigate VCB price mismatch | ✅ Investigated | Data source inconsistency between VnDirect legacy (VND) and stock_prices (×1000). Not a code bug |
| 205 | Sector-wide decline alert | ✅ Done | Emits price_drop signal when ≥3 stocks in same sector decline ≥0.5%. Shows sector avg + top decliners |
| 206 | Coal/mining cascade rules | ✅ Done | Added "than đá"/"coal"/"khoáng sản" → oil_gas domain. ALV-type companies now cascade correctly |
| 207 | Infrastructure capex boost rule | ✅ Done | "sân bay Long Thành", "siêu dự án", "cao tốc" → aviation +0.80, logistics +0.75. Macro cap prevents crush |
| 208 | Fix DB path CWD-dependent resolution | ✅ Done | DEFAULT_DB_PATH now absolute via import.meta.dir. Prevents "no such table" after restart from different CWD |

**Remaining (deferred / PO decision needed):**
- Reuters RSS failing — external service issue, monitor only
- USD/VND watchlist expansion — PO decision: add VEA, HVN, HPG as FX-sensitive stocks
- VCB BCTC Q1/2025 PDF empty — scanned image, needs OCR worker (pdfOcrWorker.ts)
- Polymarket API timeout — external service issue, increase timeout config

---

## 📋 TODO
*(Dependencies cleared — ready to assign)*

### Sprint 034 — Depth Over Breadth: Sentiment Trend + Context Sync (2026-04-02)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 224 | CLAUDE.md sync: document Sprints 030-033 additions | `task/224-claude-md-sync` | BA | P0 | — | Backlog |
| 225 | Sentiment trend per stock: `get_sentiment_trend` MCP tool | `task/225-sentiment-trend` | BA | P1 | 224 (soft) | Backlog |

---

### Sprint 033 — Investor UX Hardening (2026-04-01)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 220 | Watchlist auto-enrichment: sector peer suggestions on `add_to_watchlist` | `task/220-watchlist-peer-suggestions` | BA | P0 | — | Review |
| 222 | Alert snooze/mute: `snooze_alerts` / `unmute_alerts` MCP tools | `task/222-alert-snooze` | BA | P1 | — | Review |
| 223 | Portfolio target allocation: `set_target_allocation` / `get_target_allocation` MCP tools | `task/223-target-allocation` | BA | P2 | 195 (done, soft) | Review |

---

### Sprint 032 — See More, Decide Faster (2026-04-01)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 217 | Multi-stock comparison tool: `compare_stocks` | `task/217-compare-stocks` | BA | P0 | — | Backlog |
| 218 | Weekly portfolio report via Telegram | `task/218-weekly-portfolio-report` | BA | P1 | 217 (soft) | Backlog |
| 219 | Custom alert rules engine | `task/219-custom-alert-rules` | BA | P2 | 218 (soft) | Backlog |

---

### Sprint 031 — Telegram Command Interface (2026-04-01)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 214 | Webhook endpoint + command router | `task/214-telegram-webhook-router` | BA | P0 | — | Review |
| 215 | Webhook registration + security | `task/215-telegram-webhook-security` | BA | P1 | 214 | Backlog |
| 216 | Integration tests + CLAUDE.md update | `task/216-telegram-integration-tests` | Dev | P2 | 214, 215 | Backlog |

---

### Sprint 030 — Quality Before Quantity (2026-04-01)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 211 | CLAUDE.md sync through Sprint 029 | `task/211-claude-md-sync` | BA | P0 | — | Backlog |
| 212 | Stale worktree cleanup (.claude/worktrees/) | `task/212-worktree-cleanup` | Developer | P1 | — | Backlog |
| 213 | Test isolation audit: standardise :memory: DB pattern | `task/213-test-isolation` | Developer | P1 | — | Backlog |

---

### Sprint 029 — Always-On Investor (2026-04-01) — COMPLETE

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 208 | Telegram command interface: query system via Telegram messages | `task/208-telegram-commands` | BA | P0 | 034 (done) | Done |
| 209 | Daily P&L snapshot in morning briefing | `task/209-portfolio-pnl` | BA | P1 | 190 (done) | Done |
| 210 | News source health monitoring + get_source_health MCP tool | `task/210-source-health` | BA | P1 | 193 (soft) | Done |

---

### Sprint 005
<!-- Execution waves per TECH_005.md:
  Wave 1 — 088 (independent cleanup, no deps beyond already-done 087)
  Wave 2 — 026 + 102 + 104 in parallel (all independent of each other)
  Wave 3 — 103 (after 026 done)
  Wave 4 — 101 (after 102 done)
-->

> REQ-005 written — TECH-005 approved by Architect. See docs/TECH_005.md. Status: ACTIVE.

#### Wave 1 — COMPLETE

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 088 | Legacy cleanup — delete src/server.ts + src/tools/ stubs | `task/088-legacy-cleanup` | Developer | interface | 087 ✅ | Done ✅ |

**Task 088 — Acceptance Criteria**

**Given** `src/server.ts` and `src/tools/` exist as dead stubs (no live imports confirmed by Architect)
**When** task 088 is implemented and merged
**Then**
- `src/server.ts` file does not exist on disk
- `src/tools/` directory does not exist on disk
- `grep -r "from.*src/server" src/` returns zero matches in production code
- `bun tsc --noEmit` reports 0 errors
- `bun test` full suite passes with 0 failures

**Files to delete**: `src/server.ts`, `src/tools/watchlist.ts`, `src/tools/analysis.ts`, `src/tools/reports.ts`, `src/tools/alerts.ts`
**Pre-deletion check**: `grep -r "from.*['\"].*src/server\|from.*['\"]../tools/\|from.*['\"]./tools/" src/` must return empty before deleting
**Note**: `src/db/schema.ts` (legacy, different path) — do NOT delete; check if test files import it first.

---

#### Wave 2 — Run in parallel after Wave 1 (all three are independent of each other)

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 026 | HOSE market data fetcher (VnDirect primary, CafeF fallback) | `task/026-hose-prices` | Developer | infrastructure | 003 ✅ | Todo |
| 102 | News polling job (every 30 min) | `task/102-job-news-poll` | Developer | interface/scheduler | 061 ✅, 062 ✅, 064 ✅ | Done ✅ |
| 104 | SSC nightly report check (20:00 GMT+7) | `task/104-job-ssc-check` | Developer | interface/scheduler | 048 ✅, 086 ✅ | Done ✅ |

**Task 026 — Acceptance Criteria**

**Given** a list of HOSE ticker codes e.g. `["VCB", "HPG"]`
**When** `fetchHosePrices(codes)` is called
**Then**
- Returns `MarketPrice[]` with `code`, `price`, `previousPrice`, `changeAmt`, `changePct`, `volume`, `updatedAt`
- Primary source: VnDirect JSON API (`https://finfo-api.vndirect.com.vn/v4/stocks?q=code:...`)
- Fallback to CafeF HTML scraper if VnDirect returns 0 rows or HTTP error
- Returns `[]` (never throws) on total failure; logs warning
- `storePrices(prices)` upserts into `market_prices` (INSERT OR REPLACE) and appends to `market_prices_history`
- `fetchVnIndex()` returns `VnIndexSnapshot | null`
- Schema: `market_prices` gains `previous_price REAL` column; `market_prices_history` table created
- `bun test src/__tests__/026-*.test.ts` passes with mocked HTTP (no real network calls)
- `bun tsc --noEmit` 0 errors

**Files to create/modify**:
- CREATE: `src/infrastructure/fetchers/hose.ts`
- MODIFY: `src/infrastructure/db/schema.ts` (add `previous_price` column to `market_prices`; add `market_prices_history` table + index)

---

**Task 102 — Acceptance Criteria**

**Given** RSS sources (CafeF, VnExpress, Reuters) have articles not yet in `rag_analyses`
**When** `pollNews()` is called
**Then**
- Returns `PollNewsResult` with `fetched`, `inserted`, `duplicates`, `alerts`, `errors` counts
- New articles stored via `INSERT OR IGNORE INTO rag_analyses` using UNIQUE index on `source_url`
- Second call with same articles increments `duplicates`, does NOT create duplicate rows
- Each source failure increments `errors` but does not abort remaining sources
- Impact chain (`runImpactChain`) runs on each new entry; resulting alerts stored via `INSERT OR IGNORE INTO alerts`
- Schema: `CREATE UNIQUE INDEX IF NOT EXISTS idx_rag_source_url ON rag_analyses(source_url) WHERE source_url IS NOT NULL AND source_url != ''` added in `initDatabase()`
- `runNewsPoller()` in `newsPollerJob.ts` has concurrency guard (skips if previous cycle still running)
- `bun test src/__tests__/102-*.test.ts` passes with mocked fetchers
- `bun tsc --noEmit` 0 errors

**Files to create/modify**:
- CREATE: `src/application/usecases/pollNews.ts`
- CREATE: `src/scheduler/newsPollerJob.ts`
- MODIFY: `src/infrastructure/db/schema.ts` (add UNIQUE index on `rag_analyses.source_url`)

---

**Task 104 — Acceptance Criteria**

**Given** watchlist stocks exist in SQLite and SSC portal is reachable
**When** `runSscCheck()` is called
**Then**
- Queries SSC for new BCTC documents for each watchlist stock
- Skips documents whose `source_url` already exists in `financial_reports`
- Calls `fetchParseAndStoreBctc({ url, actionCode })` for each new document
- 2-second delay between documents per stock to avoid rate-limiting
- 3-retry exponential backoff (2 s → 4 s → 8 s) on SSC HTTP errors
- If `financial_reports` lacks `source_url` column, adds it via `ALTER TABLE`
- No crash on empty watchlist or SSC unreachable (logs warning, returns gracefully)
- `bun test src/__tests__/104-*.test.ts` passes with mocked HTTP
- `bun tsc --noEmit` 0 errors

**Files to create**:
- CREATE: `src/scheduler/sscCheckerJob.ts`

---

#### Wave 3 — After task 026 is merged

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 103 | Market open/close scan (09:00 + 15:30 GMT+7) | `task/103-job-market-scan` | Developer | interface/scheduler | 026, 063 ✅, 064 ✅ | In Progress (changes requested) |

**Task 103 — Acceptance Criteria**

**Given** watchlist stocks have HOSE price data and `market_prices_history` table exists
**When** `runMarketScan("open")` or `runMarketScan("close")` is called
**Then**
- Calls `fetchHosePrices` for all watchlist stock codes
- Inserts fetched prices into `market_prices_history` (in addition to upsert in `market_prices`)
- Assembles `MarketSnapshot` per stock: `{ actionCode, price, previousPrice, volume, avgVolume }`
- `avgVolume` = AVG of last 20 rows in `market_prices_history`; if < 5 rows exist, returns `0` (suppresses `volume_spike`)
- Passes snapshots through `detectSignals` filtering for `price_drop`, `price_surge`, `volume_spike` only
- Calls `generateAlerts` and stores resulting alerts via `INSERT OR IGNORE INTO alerts`
- No crash on empty watchlist or HOSE fetch failure
- `bun test src/__tests__/103-*.test.ts` passes with mocked fetcher
- `bun tsc --noEmit` 0 errors

**Files to create**:
- CREATE: `src/scheduler/marketScanJob.ts`

---

#### Wave 4 — After task 102 is merged

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 101 | Morning briefing job (08:00 GMT+7) | `task/101-job-morning-briefing` | Developer | interface/scheduler | 102 ✅, 086 ✅ | Done ✅ |

**Task 101 — Acceptance Criteria**

**Given** SQLite contains recent `rag_analyses`, `alerts`, `watchlist`, `market_prices`, and `financial_reports` rows
**When** `runMorningBriefing()` is called (or cron fires at 08:00 Asia/Ho_Chi_Minh)
**Then**
- Runs `pollNews()` as best-effort pre-fetch (failure does not abort briefing)
- Fetches VnIndex via `fetchVnIndex()` (best-effort; null on failure)
- `assembleBriefing(vnIndex)` returns `DailyBriefing` with:
  - `topStories`: up to 5 `rag_analyses` rows since midnight Vietnam time, sorted by `impact_score DESC`
  - `alerts`: unread alerts from last 12 hours
  - `watchlistSummary`: one entry per watchlist stock with price + changePct from `market_prices`
  - `newReports`: stock codes with new `financial_reports` since midnight Vietnam time
- `persistBriefing(briefing)` writes to `./data/briefings/YYYY-MM-DD.json` (creates dir if absent, overwrites if re-run)
- `jobs.ts` updated: imports all four job modules; `eveningSummary` cron entry removed
- `src/index.ts` updated: calls `startScheduler()` as step 3 of bootstrap
- `bun run src/index.ts` logs `[scheduler] jobs registered` at startup (manual verify)
- `bun test src/__tests__/101-*.test.ts` passes with mocked DB + file system
- `bun tsc --noEmit` 0 errors

**Files to create/modify**:
- CREATE: `src/application/usecases/assembleBriefing.ts`
- CREATE: `src/scheduler/morningBriefingJob.ts`
- MODIFY: `src/scheduler/jobs.ts` (import + wire all 4 job modules; remove `eveningSummary` cron entry)
- MODIFY: `src/index.ts` (add `startScheduler()` call as step 3 of bootstrap)

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
| 024 | Trading Economics scraper | `task/024-scraper-trading-economics` | infra | 003 ✅ |
| 025 | Yahoo Finance commodity fetcher | `task/025-yahoo-finance` | infra | 003 ✅ |
| ~~026~~ | ~~HOSE market data fetcher~~ | ~~`task/026-hose-prices`~~ | ~~infra~~ | ~~003 ✅~~ |
| ~~027~~ | ~~HNX + UPCOM market data fetcher~~ | ~~`task/027-hnx-prices`~~ | ~~infra~~ | ~~003 ✅~~ |
| 028 | SBV (State Bank Vietnam) macro fetcher | `task/028-sbv-macro` | infra | 003 ✅ |

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
| 024 | Trading Economics scraper | `task/024-scraper-trading-economics` | infra | 003 ✅ | Returns macro indicators (CPI, GDP, interest rate) as structured JSON; deferred Sprint 006 |
| 025 | Yahoo Finance commodity fetcher | `task/025-yahoo-finance` | infra | 003 ✅ | Returns Brent crude, gold, USD/VND prices; deferred Sprint 006 |
| 028 | SBV (State Bank Vietnam) macro fetcher | `task/028-sbv-macro` | infra | 003 ✅ | Returns SBV interest rate, FX rate; deferred Sprint 006 |

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
| 105 | Evening summary job (22:00) | `task/105-job-evening-summary` | interface | 086 ✅ | **Done** — merged to main 2026-03-28; 14 tests pass, tsc 0 errors |

---

### 📡 Source Health (210)

| # | Title | Branch | Layer | Status |
|---|-------|--------|-------|--------|
| 210 | News source health monitoring | `worktree-agent-a5152c35` | domain + interface | Review 🔍 |

---

### 🧪 Tests (121–139)

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 121 | Unit tests — BCTC parser (Vietnamese edge cases) | `task/121-test-bctc-edge-cases` | test | 042-047 | 20+ edge cases: parentheses negatives, missing fields, image-only PDF, corrupt PDF |
| 122 | Unit tests — domain services | `task/122-test-domain-services` | test | 061-066 | Cascade engine, signal detector, alert generator all have ≥90% branch coverage |
| 123 | Integration tests — MCP tools with real SQLite | `task/123-test-integration-mcp` | test | 082-086, 084 ✅ | Full tool call roundtrip: add watchlist → fetch news → generate alert → get alert. **UNBLOCKED — ready for Wave 3** |
| 124 | Integration tests — SSC pipeline (mock HTTP) | `task/124-test-ssc-pipeline` | test | 048 | Mock SSC HTML + PDF; verify full parse → store → embed pipeline |
| 125 | E2E test — daily briefing flow | `task/125-test-e2e-briefing` | test | 101-105 | Full daily briefing: trigger → fetch → analyze → alert → report; assert final output structure |

---

### 🔍 Review (195, 220)

| # | Title | Branch | Layer | Depends on | Status |
|---|-------|--------|-------|------------|--------|
| 195 | Portfolio rebalancing signals: `get_rebalancing_signals` MCP tool | `task/195-rebalancing-signals` | domain + interface | 193 (partial — registered directly pending registry) | Review |
| 220 | Watchlist auto-enrichment: sector peer suggestions on `add_to_watchlist` | `task/220-watchlist-peer-suggestions` | interface | — | Review |

**Task 195 — Acceptance Criteria**
- A position at 42% weight with 25% target produces drift = +17%, action = "BAN"
- A position at 18% weight with 25% target produces drift = -7%, action = "MUA"
- A position with |drift| < threshold produces "(trong nguong)"
- Equal-weight fallback: 4 positions with no `target_weight` each get 25% target
- Stock with no `market_prices` row shown as "(thieu du lieu gia)"
- No open positions returns "Khong co vi the nao dang mo"
- Corrective share quantities are integers (sell = floor, buy = ceil)
- Threshold parameter 0.10 flags only drifts > 10%
- >= 16 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count increases from 46 to 47

---

## Kanban Summary

| Column | Count | Tasks |
|--------|-------|-------|
| ✅ Done | 60+ | Sprints 000-033 complete |
| 🔍 Review | 7 | DOC-001, 195, 215, 217, 218, 219, 220, 222, 223 |
| 🚧 In Progress | 0 | — |
| 📋 Todo | 0 | — |
| 🗂 Backlog | 6 | 192, 193, 206, 207 (Sprint 028); 196, 197 (deferred); 125 (long-term deferred) |
| **Total** | **60+** | |

---

## Sprint 028 — ACTIVE

> Sprint 028 STARTED — 2026-04-01. Theme: Structural Integrity and Investor Safety Net.
> PO sign-off: APPROVED 2026-04-01. Tasks 192, 193, 206, 207 in scope.

| # | Title | Branch | Priority | Status |
|---|-------|--------|----------|--------|
| 192 | Fix flaky test: polymarket-fetcher mock timing | `task/192-fix-polymarket-flaky` | P0 | Backlog |
| 193 | Dynamic tool registration: eliminate server.ts merge conflicts | `task/193-dynamic-tool-registry` | P0 | Backlog |
| 206 | Stop-loss / take-profit threshold alerts | `task/206-price-alert-tools` | P1 | Review |
| 207 | Per-source API rate limiting for external fetchers | `task/207-rate-limiter` | P1 | Review |

**Task 206 — Acceptance Criteria**
- `set_price_alert('VCB', 'stop_loss', 88000)` inserts a row with `triggered = 0`.
- Price 87,500 processed → row marked `triggered = 1` and HIGH alert inserted into `alerts`.
- Triggered row does NOT re-fire on subsequent price checks.
- `set_price_alert('FPT', 'take_profit', 120000)` + price 123,000 → take-profit alert fires.
- `get_price_alerts()` returns all pending alerts in Vietnamese table format.
- `delete_price_alert(id)` removes the row; no longer shown in `get_price_alerts`.
- `checkPriceAlerts([])` (empty prices) → no crash, returns 0 breaches.
- `price_alerts` table + index created in `schema.ts` with `IF NOT EXISTS`.
- >= 18 tests, 0 failures. `bun tsc --noEmit` → 0 errors. Tool count 48 → 51.

Files:
- MODIFY: `src/infrastructure/db/schema.ts` — add `price_alerts` table + index
- CREATE: `src/application/usecases/checkPriceAlerts.ts`
- CREATE: `src/interface/mcp/tools/priceAlertTools.ts`
- MODIFY: `src/interface/mcp/tools/registry.ts` — add priceAlertTools entry (requires 193)
- MODIFY: `src/scheduler/intelligenceCycleJob.ts` — wire `checkPriceAlerts` after price fetch
- CREATE: `src/__tests__/206-price-alert-tools.test.ts`

Dependency: task 193 (registry.ts must exist before task 206 appends to it).

**Task 207 — Acceptance Criteria**
- `canCall('cafef.vn')` → `true` before first call, `false` immediately after `record()`,
  `true` again after 8 s (mocked timer).
- Two rapid calls to same host: second skipped, logged at DEBUG.
- Different hosts: independent counters — one rate-limited does not block others.
- All 7 modified fetchers return `[]` / `null` gracefully when rate-limited (no throws).
- `mcp.config.json` `fetchers.rateLimits` section parsed and applied at startup.
- `rateLimiter.ts` lives in `src/domain/services/` (pure logic, no I/O imports).
- >= 14 tests, 0 failures. `bun tsc --noEmit` → 0 errors. Tool count unchanged.

Files:
- CREATE: `src/domain/services/rateLimiter.ts`
- MODIFY: `src/infrastructure/fetchers/cafef.ts`
- MODIFY: `src/infrastructure/fetchers/vnexpress.ts`
- MODIFY: `src/infrastructure/fetchers/vneconomy.ts`
- MODIFY: `src/infrastructure/fetchers/reuters.ts`
- MODIFY: `src/infrastructure/fetchers/tradingEconomicsStream.ts`
- MODIFY: `src/infrastructure/fetchers/hose.ts`
- MODIFY: `src/infrastructure/fetchers/hnx.ts`
- MODIFY: `mcp.config.json` — add `fetchers.rateLimits` section
- CREATE: `src/__tests__/207-rate-limiter.test.ts`

---

## Sprint 027 — COMPLETE

> Sprint 027 DONE — 2026-04-02. Theme: Stability First — Fix the Cracks Before Adding More Floors.
> PO sign-off: APPROVED 2026-04-02. Tasks 192, 193, 194, 195, 196, 197 in scope.
> Delivered: 194 (CLAUDE.md sync), hotfixes 198-205 (production monitoring fixes). Tasks 192, 193, 195, 196, 197 carried to Sprint 028.

| # | Title | Branch | Priority | Status |
|---|-------|--------|----------|--------|
| 192 | Fix flaky test: polymarket-fetcher mock timing | `task/192-fix-polymarket-flaky` | P0 | Backlog |
| 193 | Dynamic tool registration: eliminate server.ts merge conflicts | `task/193-dynamic-tool-registry` | P0 | Backlog |
| 194 | CLAUDE.md sync through Sprint 026 | `main` (7f53108) | P1 | Done |
| 195 | Portfolio rebalancing signals: `get_rebalancing_signals` MCP tool | `task/195-rebalancing-signals` | P1 | Review |
| 196 | Stale worktree cleanup + hotfix task tracking | `task/196-worktree-cleanup` | P0 | Backlog |
| 197 | Reuters RSS investigation + delete_telegram_report test coverage | `task/197-reuters-fix-telegram-tests` | P1 | Backlog |

**Task 196 — Acceptance Criteria**
- All stale agent-* worktrees under `.claude/worktrees/` removed (`git worktree prune`)
- Commits c5b925e (start.sh .env fix) and c6ea1ce (delete_telegram_report) tracked in TASKS.md Done section
- `delete_telegram_report` added to CLAUDE.md tool list and README.md tool table
- `bun tsc --noEmit` → 0 errors
- No worktrees left with branches that are already merged to main

Files:
- `TASKS.md` — add hotfix entries to Done section
- `CLAUDE.md` — add delete_telegram_report to tool list
- `cowork-analysis-vnmarket-team/README.md` — update tool count + add delete_telegram_report row
- Shell: `git worktree prune` + remove stale `.claude/worktrees/` directories

**Task 197 — Acceptance Criteria**
- Root cause of Reuters RSS failures documented (log analysis)
- If fixable: fix applied + test added; if not: alternative source identified (AP News direct, Bloomberg RSS)
- `sendTelegramReport()` return type change (boolean → message_id number) reflected in all tests
- `bun test` full suite → 0 failures
- `bun tsc --noEmit` → 0 errors

Files:
- INVESTIGATE: `src/infrastructure/fetchers/reuters.ts`
- MODIFY (if needed): test files referencing `sendTelegramReport` return value
- MODIFY (if needed): `src/infrastructure/notifiers/telegram.ts`

---

## Sprint 025 — COMPLETE

> Sprint 025 DONE — 2026-04-01. Theme: Daily Investor Intelligence — Sector Rotation, Earnings Calendar, and Alert Digest.
> PO sign-off: APPROVED 2026-04-01. Tasks 186, 187, 188 merged. Tool count: 40 → 43.

| # | Title | Branch | Agent | Priority | Status |
|---|-------|--------|-------|----------|--------|
| 186 | Sector rotation detector: `get_sector_rotation` MCP tool | `task/186-sector-rotation` | Developer | P0 | Done ✅ |
| 187 | Earnings calendar: `get_earnings_calendar` MCP tool | `task/187-earnings-calendar` | Developer | P0 | Done ✅ |
| 188 | Daily alert digest: `send_alert_digest` MCP tool + scheduler job | `task/188-alert-digest` | Developer | P1 | Done ✅ |

---

## Sprint 026 — COMPLETE

> Sprint 026 DONE — 2026-04-02. Theme: Signal Quality and Portfolio Correlation — Know What Moves Together.
> PO sign-off: APPROVED 2026-04-02. Tasks 189, 190, 191 merged. Tool count: 43 → 46.

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 189 | Correlation analysis: `get_correlation_matrix` MCP tool | `task/189-correlation-matrix` | Developer | P0 | market_prices_history ✅, watchlist ✅, positions ✅ | Done ✅ |
| 190 | Data export: `export_portfolio_snapshot` MCP tool | `task/190-export-snapshot` | Developer | P0 | all tables ✅ | Done ✅ |
| 191 | Performance attribution: `get_performance_attribution` MCP tool | `task/191-performance-attribution` | Developer | P1 | positions ✅, alerts ✅ | Done ✅ |

---

**Task 189 — Correlation Matrix**

Acceptance criteria:
- Two stocks with identical price series produce r = 1.0, classified TUONG QUAN CAO
- Two stocks with anti-correlated series produce r close to -1.0
- Pairs with < 5 aligned data points shown as "(du lieu khong du)"
- Diversification score = 100 when all pairs have |r| < 0.70
- Diversification score = 0 when all pairs have |r| >= 0.85
- Warning line appears only for highly correlated pairs where BOTH stocks have open positions
- When < 2 watchlist stocks, returns "Can it nhat 2 co phieu"
- When `market_prices_history` empty, returns "Chua co du lieu lich su gia"
- >= 16 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 43 → 44

Files:
- CREATE: `src/domain/services/correlationCalculator.ts`
- CREATE: `src/interface/mcp/tools/correlationTools.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `src/interface/mcp/tools/index.ts`
- CREATE: `src/__tests__/189-correlation-matrix.test.ts`

---

**Task 190 — Portfolio Snapshot Export**

Acceptance criteria:
- Exported JSON contains all 7 top-level keys: exported_at, schema_version, watchlist,
  positions, alerts, analysis_entries, financial_reports, market_prices, summary
- `summary.watchlist_count` matches actual row count in `watchlist` table
- `summary.open_positions` counts only rows WHERE closed_at IS NULL
- File written to `data/exports/snapshot_<YYYYMMDD_HHmmss>.json`
- File size reported in MB correct to 1 decimal place
- When export directory cannot be written, output contains "(khong the ghi file)"
- All tables export as empty arrays when 0 rows
- >= 14 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 44 → 45

Files:
- CREATE: `src/application/usecases/exportPortfolioSnapshot.ts`
- CREATE: `src/interface/mcp/tools/exportTools.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `src/interface/mcp/tools/index.ts`
- CREATE: `src/__tests__/190-export-snapshot.test.ts`

---

**Task 191 — Performance Attribution**

Acceptance criteria:
- Two closed positions with `news_mention` signal and positive P&L produce win rate 100%
  and correct total P&L sum for that group
- Position with NULL `entry_alert_id` grouped under "Khong ro nguon tin hieu"
- Groups ranked by total P&L descending
- "Tin hieu hieu qua nhat" names the group with highest total P&L
- "Tin hieu kem hieu qua" names the group with lowest win rate (excluding 0-position groups)
- When no closed positions exist, returns "Chua co vi the nao duoc dong"
- If `entry_alert_id` column missing, all positions in unknown group + migration hint
- Positions with NULL `realized_pnl` excluded from averages but counted in totals
- >= 14 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 45 → 46

Files:
- CREATE: `src/domain/services/performanceAttributor.ts`
- CREATE: `src/interface/mcp/tools/performanceTools.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `src/interface/mcp/tools/index.ts`
- CREATE: `src/__tests__/191-performance-attribution.test.ts`

---

**Task 186 — Sector Rotation Detector**

Acceptance criteria:
- `get_sector_rotation()` groups stocks by sector using `sectorPeers.ts` mapping
- A sector where all stocks have 5d return > +2% and 1d > +0.5% is labelled "DONG TIEN VAO"
- A sector where all stocks have 5d return < -2% and 1d < -0.5% is labelled "DONG TIEN RA"
- Sectors ranked by 5d return descending in output
- OUTFLOW sector containing a watchlist stock triggers a warning line
- When `market_prices` is empty, returns "Chua co du lieu gia thi truong"
- When only 1d data available, output contains "(chi co du lieu 1 ngay)"
- >= 16 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 40 → 41

Files:
- CREATE: `src/domain/services/sectorRotationDetector.ts`
- CREATE: `src/interface/mcp/tools/sectorRotationTools.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `src/interface/mcp/tools/index.ts`
- CREATE: `src/__tests__/186-sector-rotation.test.ts`

---

**Task 187 — Earnings Calendar**

Acceptance criteria:
- For a watchlist stock with no filing in `financial_reports`, next Q1 deadline (30 April) shown as "(uoc tinh)"
- Stock whose filing deadline passed yesterday with no entry shows "QUA HAN"
- Stock within 14 days of deadline shows "SAP DEN"
- Stock with actual filing in `financial_reports` shows "DA NOP" with actual date
- When `watchlist` is empty, returns "Danh sach theo doi trong"
- >= 14 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 41 → 42

Files:
- CREATE: `src/domain/services/earningsCalendar.ts`
- CREATE: `src/interface/mcp/tools/earningsCalendarTools.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `src/interface/mcp/tools/index.ts`
- CREATE: `src/__tests__/187-earnings-calendar.test.ts`

---

**Task 188 — Daily Alert Digest**

Acceptance criteria:
- With 7 alerts in DB spanning 3 stocks, digest contains 3 stock blocks with correct counts
- Alerts older than 24h excluded from digest
- Stock with > 3 alerts in 24h shows top 3 plus "(va N canh bao khac)"
- Severity counts in header match actual alert severities in DB
- When `alerts` empty, output contains "Khong co canh bao"
- When Telegram not configured, output contains "(Telegram chua duoc cau hinh)"
- `alertDigestJob` cron expression is `0 21 * * 1-5`
- >= 16 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 42 → 43

Files:
- CREATE: `src/application/usecases/assembleAlertDigest.ts`
- CREATE: `src/scheduler/alertDigestJob.ts`
- CREATE: `src/interface/mcp/tools/alertDigestTools.ts`
- MODIFY: `src/scheduler/jobs.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `src/interface/mcp/tools/index.ts`
- CREATE: `src/__tests__/188-alert-digest.test.ts`

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

---

## Sprint 027 — Active

> Sprint 027 ACTIVE — 2026-04-02. Theme: Stability First — Fix the Cracks Before Adding More Floors.

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 192 | Fix flaky test: `164-polymarket-fetcher.test.ts` mock timing | `task/192-fix-polymarket-flaky` | Developer | P0 | — | Review |
| 193 | Dynamic tool registration: eliminate server.ts merge conflicts | `task/193-dynamic-tool-registry` | Developer | P0 | — | Backlog |
| 194 | CLAUDE.md sync through Sprint 026 | `main` (7f53108) | — | P1 | — | Done |
| 195 | Portfolio rebalancing signals: `get_rebalancing_signals` MCP tool | `task/195-rebalancing-signals` | Developer | P1 | 193 | Review |
| 196 | Stale worktree cleanup + hotfix task tracking | `task/196-worktree-cleanup` | Developer | P0 | — | Backlog |
| 197 | Reuters RSS investigation + delete_telegram_report test coverage | `task/197-reuters-fix-telegram-tests` | Developer | P1 | — | Backlog |

---

**Task 192 — Fix Flaky Test: 164-polymarket-fetcher.test.ts**

Acceptance criteria:
- `bun test src/__tests__/164-polymarket-fetcher.test.ts` passes 10/10 consecutive runs
- `bun test` full suite passes 3/3 consecutive runs with no flaky failures in task 164
- No production code files modified — test isolation fix only
- `bun tsc --noEmit` → 0 errors
- >= 1 new test or assertion added that pins the previously-flaky behaviour

Files:
- MODIFY: `src/__tests__/164-polymarket-fetcher.test.ts`
- MODIFY (optional): shared test helper if mock isolation is extracted

---

**Task 193 — Dynamic Tool Registration**

Acceptance criteria:
- `src/interface/mcp/tools/registry.ts` exists and exports `toolRegistry` as an array of
  objects with a `register(server, db)` method
- `src/interface/mcp/server.ts` contains only a `toolRegistry.forEach(r => r.register(server, db))`
  loop — no individual `register*Tools(...)` call sites
- All 46 existing tools remain registered and functional
- `bun test` full suite → 0 failures
- `bun tsc --noEmit` → 0 errors
- A new tool can be added by editing only its own file + appending one entry to `registry.ts`
- >= 8 tests, 0 failures

Files:
- CREATE: `src/interface/mcp/tools/registry.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: each tool module file (add `export function register(server, db)` named export)
- CREATE: `src/__tests__/193-tool-registry.test.ts`

---

**Task 194 — DONE (committed 7f53108, 2026-04-02)**

CLAUDE.md synced through Sprint 026 — all files, tool count (46), test count (1672+) updated.

---

**Task 195 — Portfolio Rebalancing Signals: `get_rebalancing_signals` MCP tool**

Acceptance criteria:
- A position at 42% weight with 25% target produces drift = +17%, action = "BAN"
- A position at 18% weight with 25% target produces drift = -7%, action = "MUA"
- A position with |drift| < threshold produces "(trong nguong)"
- Equal-weight fallback: 4 positions with no `target_weight` each get 25% target
- Stock with no `market_prices` row shown as "(thieu du lieu gia)"
- No open positions → "Khong co vi the nao dang mo"
- Corrective share quantities are integers (sell = floor, buy = ceil)
- Threshold parameter 0.10 flags only drifts > 10%
- >= 16 tests, 0 failures
- `bun tsc --noEmit` → 0 errors
- Tool count 46 → 47 (first tool registered via dynamic registry from task 193)

Files:
- CREATE: `src/domain/services/rebalancingCalculator.ts`
- CREATE: `src/interface/mcp/tools/rebalancingTools.ts`
- MODIFY: `src/interface/mcp/tools/registry.ts`
- CREATE: `src/__tests__/195-rebalancing-signals.test.ts`

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
