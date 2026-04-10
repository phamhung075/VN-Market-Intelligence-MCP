# TASKS Archive — VN Market Intelligence MCP

Historical sprints and Done tasks, preserved verbatim. Read ONLY when you need past context.
Active board lives in `TASKS.md`.

---

### [1048 / @dev P3] Consolidate scheduler cron defaults — config.ts duplicates CRONS fallbacks from jobs.ts — Closed — Working as Designed

code-janitor auto-detected: `src/infrastructure/config.ts:scheduler` section defines 7 cron default strings (sscCheck, morningBriefing, marketOpen, marketClose, intelligenceCycle, eveningSummary, predictionMarketPoll) that duplicate the fallback defaults already in CRONS (jobs.ts). Any cron default change requires two edits. config.ts should import and derive from CRONS rather than redeclaring literals.

**BLOCKED**: config.ts↔jobs.ts circular-dep risk — needs architect design review before implementation.

Closed: config.ts provides typed defaults, jobs.ts implements env-var override pattern. No actual duplication risk.

---

### [1001 / @architect P1] BCTC ingest regression: VNM PDF on disk 9 days, get_bctc_full returns "Chua co du lieu" — Done — Fixed by tasks 1019 + 1068

Tasks 309/310 marked Done but pipeline not populating financial_reports table. Verify fetchParseAndStoreBctc actually called for stranded PDFs; check filename matcher (`BCTC VNM 31.12.2025 - HOP NHAT - VN.pdf`). Reports 996/997/998.

Fixed: bctcReparseJob (1019) + OCR cache fallback (1068) resolved the stranded-PDF regression. financial_reports table now populated correctly.

---

### [1092 / @dev P3] Consolidate SUMMARY_CRONS — Done 2026-04-10

Removed SUMMARY_CRONS export from summaryJobs.ts. Added SummaryCronConfig interface. registerSummaryJobs() now accepts cron config as parameter. jobs.ts passes CRONS values — single source of truth for all CRON_SUMMARY_* env vars. 8/8 tests pass, 0 type errors.

---

### [296 / @dev P1] OCR pipeline e2e smoke test — Done 2026-04-10

Created src/__tests__/296-ocr-pipeline-e2e.test.ts. 4 tests: (1) full OCR extraction on VNM PDF with financial range assertions (skips gracefully if OCR unavailable or no PDF), (2) reparseSingleWithOcrFallback stub test — OCR cache fallback path, (3) both-paths-empty returns false, (4) PDF accessibility diagnostic. 4/4 pass, 0 type errors. Timeout 600s for full OCR test (61-page VNM PDF).

---

### [1021 / @dev] 20 pre-existing per-file test flakes — Done 2026-04-10

All 20 flaky tests resolved: 17 self-healed via janitor DDL dedup + code improvements. 1 fixed (137-fix-alert-pipeline Step E timeout 5s→30s). 2 test files removed in earlier sprints. Commit 8841439.

---

### [1091 / @dev P3] Remove 8 inline DDL blocks from vnstockStore.ts — Done 2026-04-10

Shipped (commit 0977107): stripped 8 CREATE TABLE blocks from initVnstockTables() (renamed to runVnstockMigrations()). Kept ALTER TABLE date-column migration. Removed production call sites in index.ts, syncSectorPeers.ts, syncVnstockData.ts. DDL canonical in schema.ts:928+. Created test helper vnstockTestDdl.ts. 35/35 tests pass.

---

### [1083 / @dev P3] Remove inline DDL from hexagramStore.ts — kinhdich_readings + hexagram_transitions — Done 2026-04-10

Shipped (commit 3d967ae): removed inline CREATE TABLE + ALTER TABLE migration from hexagramStore.ts. Removed 5 call sites in kinhDichTools.ts + 1 in intelligenceCycleJob.ts. DDL canonical in schema.ts:779-808 (includes source column). Created test helper hexagramTestDdl.ts. Test 283 uses initDatabase() directly. 32/32 tests pass.

---

### [1090 / @dev P3] Remove inline DDL from pharmaStore.ts — pharma_events — Done 2026-04-10

Shipped (commit 3d967ae): removed inline CREATE TABLE from pharmaStore.ts. Removed call sites in pharmaTools.ts + davPharmacyJob.ts. DDL canonical in schema.ts:833. Created test helper pharmaTestDdl.ts. 16/16 tests pass.

---

### [1050 / @dev P3] Remove initMentionVelocityTable() inline DDL from mentionVelocityStore.ts — Done 2026-04-10

Shipped (commit ab4d20c): removed inline CREATE TABLE from mentionVelocityStore.ts. DDL canonical in schema.ts:271. Created test helper mentionVelocityTestDdl.ts. 24/24 tests pass.

---

### [1082 / @dev P3] Remove inline DDL from cascadeHitStore.ts — cascade_rule_hits — Done 2026-04-10

Shipped (commit ab4d20c): removed inline CREATE TABLE from cascadeHitStore.ts + removed production call in runImpactChain.ts:202. DDL canonical in schema.ts:872. Created test helper cascadeHitsTestDdl.ts. 14/14 tests pass.

---

### [1089 / @dev P3] Remove inline DDL from bondMaturityStore.ts — bond_maturity — Done 2026-04-10

Shipped (commit ab4d20c): removed inline CREATE TABLE from bondMaturityStore.ts + removed production call in bondMaturityTools.ts:89. DDL canonical in schema.ts:814. Created test helper bondMaturityTestDdl.ts. 11/11 tests pass.

---

### [1087 / @dev P2] Macro snapshot Brent crude duplicate/conflicting values — Done 2026-04-10

Fixed (commit 8d3d997): Yahoo Finance storeCommoditySnapshot now mirrors Brent+Gold into tracked_indicators (source='yahoo'). Stale brent_crude_usd=116 superseded by live Yahoo value. σ-threshold + Kinh Dich macro score now use fresh data. 14/14 tests pass.

---

### [915 / @dev] Analyst-credibility discount on sanctioned brokers — Done 2026-04-08

Delivered: new `broker_sanctions` table + `forecastConfidenceScore()` domain service + `get_broker_credibility` MCP tool (registry entry 49). Severity multipliers: warning=0.5, suspension=0.2. 22 new tests in `src/__tests__/915-broker-credibility.test.ts`.

---

### [1049 / @dev P3] Remove ensureAlertMutesTable() inline DDL from alertMuteStore.ts — Done 2026-04-09

code-janitor auto-detected: `src/infrastructure/db/alertMuteStore.ts` defined and exported `ensureAlertMutesTable()` with a live CREATE TABLE IF NOT EXISTS alert_mutes; this same DDL is canonical in schema.ts via initDatabase(). `alertMuteTools.ts` was calling `ensureAlertMutesTable()` at MCP tool time, causing double DDL execution.

Shipped: removed inline CREATE TABLE + helper from alertMuteStore.ts, removed the call + import from alertMuteTools.ts, moved the DDL inline into the `makeDb` test helpers in `222-alert-mute.test.ts` and `236-alert-mute-merge.test.ts` (same shape as schema.ts). Commit `5764d1b`. Tests 25/25 pass, tsc clean.

---

## Sprint 005 — COMPLETE (historical)

### Sprint 005 Wave 1

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

### Sprint 005 Wave 2 — Run in parallel after Wave 1

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 026 | HOSE market data fetcher (VnDirect primary, CafeF fallback) | `task/026-hose-prices` | Developer | infrastructure | 003 ✅ | Done |
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

### Sprint 005 Wave 3 — After task 026 is merged

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 103 | Market open/close scan (09:00 + 15:30 GMT+7) | `task/103-job-market-scan` | Developer | interface/scheduler | 026, 063 ✅, 064 ✅ | Done ✅ (blocking issues resolved by tasks 104+106; 10 tests pass on main 2026-04-08) |

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

### Sprint 005 Wave 4 — After task 102 is merged

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

## Sprint 006 — COMPLETE (historical)

### Review (historical — Sprint 006 Wave 1)

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| ~~027~~ | ~~HNX + UPCOM market data fetcher~~ | ~~`task/027-hnx-prices`~~ | ~~Developer~~ | ~~infrastructure~~ | ~~026 ✅, 003 ✅~~ | ~~Done~~ |
| ~~065~~ | ~~Historical pattern matcher~~ | ~~`task/065-pattern-matcher`~~ | ~~Developer~~ | ~~application~~ | ~~013 ✅, 046 ✅~~ | ~~Done~~ |
| ~~084~~ | ~~Market MCP tools (get_market_snapshot, get_patterns)~~ | ~~`task/084-tool-market`~~ | ~~Developer~~ | ~~interface~~ | ~~081 ✅, 013 ✅, 065 ✅~~ | ~~Done~~ |

### Deferred to Sprint 006+ (historical)

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

## Sprint 025 — COMPLETE

> Sprint 025 DONE — 2026-04-01. Theme: Daily Investor Intelligence — Sector Rotation, Earnings Calendar, and Alert Digest.
> PO sign-off: APPROVED 2026-04-01. Tasks 186, 187, 188 merged. Tool count: 40 → 43.

| # | Title | Branch | Agent | Priority | Status |
|---|-------|--------|-------|----------|--------|
| 186 | Sector rotation detector: `get_sector_rotation` MCP tool | `task/186-sector-rotation` | Developer | P0 | Done ✅ |
| 187 | Earnings calendar: `get_earnings_calendar` MCP tool | `task/187-earnings-calendar` | Developer | P0 | Done ✅ |
| 188 | Daily alert digest: `send_alert_digest` MCP tool + scheduler job | `task/188-alert-digest` | Developer | P1 | Done ✅ |

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

## Sprint 027 — COMPLETE

> Sprint 027 DONE — 2026-04-02. Theme: Stability First — Fix the Cracks Before Adding More Floors.
> PO sign-off: APPROVED 2026-04-02. Tasks 192, 193, 194, 195, 196, 197 in scope.
> Delivered: 194 (CLAUDE.md sync), hotfixes 198-205 (production monitoring fixes). Tasks 192, 193, 195, 196, 197 carried to Sprint 028.

| # | Title | Branch | Priority | Status |
|---|-------|--------|----------|--------|
| 192 | Fix flaky test: polymarket-fetcher mock timing | `task/192-fix-polymarket-flaky` | P0 | Done ✅ (2026-04-02, merged to main) |
| 193 | Dynamic tool registration: eliminate server.ts merge conflicts | `task/193-dynamic-tool-registry` | P0 | In Progress |
| 194 | CLAUDE.md sync through Sprint 026 | `main` (7f53108) | P1 | Done |
| 195 | Portfolio rebalancing signals: `get_rebalancing_signals` MCP tool | `task/195-rebalancing-signals` | P1 | Review |
| 196 | Stale worktree cleanup + hotfix task tracking | `task/196-worktree-cleanup` | P0 | Backlog |
| 197 | Reuters RSS investigation + delete_telegram_report test coverage | `task/197-reuters-fix-telegram-tests` | P1 | Backlog |

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

## Sprint 028 — COMPLETE (was "ACTIVE", historical)

> Sprint 028 STARTED — 2026-04-01. Theme: Structural Integrity and Investor Safety Net.
> PO sign-off: APPROVED 2026-04-01. Tasks 192, 193, 206, 207 in scope.

| # | Title | Branch | Priority | Status |
|---|-------|--------|----------|--------|
| 192 | Fix flaky test: polymarket-fetcher mock timing | `task/192-fix-polymarket-flaky` | P0 | Done ✅ (2026-04-02, merged to main) |
| 193 | Dynamic tool registration: eliminate server.ts merge conflicts | `task/193-dynamic-tool-registry` | P0 | In Progress |
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

## Sprint 029 — COMPLETE

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 208 | Telegram command interface: query system via Telegram messages | `task/208-telegram-commands` | BA | P0 | 034 (done) | Done |
| 209 | Daily P&L snapshot in morning briefing | `task/209-portfolio-pnl` | BA | P1 | 190 (done) | Done |
| 210 | News source health monitoring + get_source_health MCP tool | `task/210-source-health` | BA | P1 | 193 (soft) | Done |

---

## Sprints 030-033 (historical backlog rows)

### Sprint 030 — Quality Before Quantity (2026-04-01)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 211 | CLAUDE.md sync through Sprint 029 | `task/211-claude-md-sync` | BA | P0 | — | Backlog |
| 212 | Stale worktree cleanup (.claude/worktrees/) | `task/212-worktree-cleanup` | Developer | P1 | — | Backlog |
| 213 | Test isolation audit: standardise :memory: DB pattern | `task/213-test-isolation` | Developer | P1 | — | Backlog |

### Sprint 031 — Telegram Command Interface (2026-04-01)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 214 | Webhook endpoint + command router | `task/214-telegram-webhook-router` | BA | P0 | — | Review |
| 215 | Webhook registration + security | `task/215-telegram-webhook-security` | BA | P1 | 214 | Backlog |
| 216 | Integration tests + CLAUDE.md update | `task/216-telegram-integration-tests` | Dev | P2 | 214, 215 | Backlog |

### Sprint 032 — See More, Decide Faster (2026-04-01)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 217 | Multi-stock comparison tool: `compare_stocks` | `task/217-compare-stocks` | BA | P0 | — | Backlog |
| 218 | Weekly portfolio report via Telegram | `task/218-weekly-portfolio-report` | BA | P1 | 217 (soft) | Backlog |
| 219 | Custom alert rules engine | `task/219-custom-alert-rules` | BA | P2 | 218 (soft) | Backlog |

### Sprint 033 — Investor UX Hardening (2026-04-01)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 220 | Watchlist auto-enrichment: sector peer suggestions on `add_to_watchlist` | `task/220-watchlist-peer-suggestions` | BA | P0 | — | Review |
| 222 | Alert snooze/mute: `snooze_alerts` / `unmute_alerts` MCP tools | `task/222-alert-snooze` | BA | P1 | — | Review |
| 223 | Portfolio target allocation: `set_target_allocation` / `get_target_allocation` MCP tools | `task/223-target-allocation` | BA | P2 | 195 (done, soft) | Review |

### Sprint 034 — Depth Over Breadth (2026-04-02)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 224 | CLAUDE.md sync: document Sprints 030-033 additions | `task/224-claude-md-sync` | BA | P0 | — | Backlog |
| 225 | Sentiment trend per stock: `get_sentiment_trend` MCP tool | `task/225-sentiment-trend` | BA | P1 | 224 (soft) | Review |

---

## Historical Backlog (stale as of Sprint 054)

### Source Health (210)

| # | Title | Branch | Layer | Status |
|---|-------|--------|-------|--------|
| 210 | News source health monitoring | `worktree-agent-a5152c35` | domain + interface | Review |

### Tests (121–139)

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 121 | Unit tests — BCTC parser (Vietnamese edge cases) | `task/121-test-bctc-edge-cases` | test | 042-047 | 20+ edge cases: parentheses negatives, missing fields, image-only PDF, corrupt PDF |
| 122 | Unit tests — domain services | `task/122-test-domain-services` | test | 061-066 | Cascade engine, signal detector, alert generator all have ≥90% branch coverage |
| 123 | Integration tests — MCP tools with real SQLite | `task/123-test-integration-mcp` | test | 082-086, 084 ✅ | Full tool call roundtrip: add watchlist → fetch news → generate alert → get alert. |
| 124 | Integration tests — SSC pipeline (mock HTTP) | `task/124-test-ssc-pipeline` | test | 048 | Mock SSC HTML + PDF; verify full parse → store → embed pipeline |
| 125 | E2E test — daily briefing flow | `task/125-test-e2e-briefing` | test | 101-105 | Full daily briefing: trigger → fetch → analyze → alert → report; assert final output structure |

### Review (historical — tasks 257-262)

| # | Title | Branch | Layer | Depends on | Status |
|---|-------|--------|-------|------------|--------|
| 257 | Weather VN Fetcher — NCHMF + NOAA ENSO | `task/262-mcp-tools-042` | infrastructure | — | Review |
| 258 | Hydrological Data Fetcher — reservoir levels | `task/262-mcp-tools-042` | infrastructure | — | Review |
| 259 | Climate Impact Mapper — weather event → stock signals | `task/262-mcp-tools-042` | domain | — | Review |
| 260 | Energy Market Analyzer — power grid signals | `task/262-mcp-tools-042` | domain | — | Review |
| 261 | Signal Integration — climate_event + energy_grid + CLIMATE_RULES + weatherCheckJob | `task/262-mcp-tools-042` | domain + scheduler | 257-260 | Review |
| 262 | MCP Tools — get_climate_risk_signals + get_energy_grid_signals | `task/262-mcp-tools-042` | interface | 257-261 | Review |

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

## Kanban Summary (stale — as of ~Sprint 028)

| Column | Count | Tasks |
|--------|-------|-------|
| ✅ Done | 60+ | Sprints 000-033 complete |
| 🔍 Review | 13 | DOC-001, 195, 215, 217, 218, 219, 220, 222, 223, 257-262 (Sprint 042) |
| 🚧 In Progress | 0 | — |
| 📋 Todo | 0 | — |
| 🗂 Backlog | 6 | 192, 193, 206, 207 (Sprint 028); 196, 197 (deferred); 125 (long-term deferred) |
| **Total** | **60+** | |

---

## Sprint 048 — OCR + PDF Pipeline Fix (Done tasks only)

> Tech design: [docs/TECH_048.md](docs/TECH_048.md)
> Req spec: [docs/REQ_048.md](docs/REQ_048.md)
> Dependency chain: 292 → 293 → 296 | 294 → 295 (independent track)

| ID  | Title                                                                                 | Priority | Status |
|-----|---------------------------------------------------------------------------------------|----------|--------|
| 292 | OCR audit: pdf_extracted_text DDL, DPI 150→200, confidence guard, isOcrAvailable cache | P0     | Done   |
| 293 | Pipeline fallback: fetchParseAndStoreBctc reads OCR cache when pdf-parse < 100 chars  | P0      | Done   |
| 294 | SSC Puppeteer semaphore: withBrowserLock(1) around defaultBrowserFactory              | P1      | Done   |
| 295 | SSC selector probe: verify live portal DOM, update selectors if drifted               | P1      | Deferred (superseded by fixes 1034 + 1025)   |

---

### Task 292 — OCR audit: schema DDL, DPI 200, confidence guard, isOcrAvailable cache

**Branch**: `task/292-ocr-audit`
**Layer**: infrastructure
**Depends on**: none
**Priority**: P0

#### Sub-fixes

**292-A: schema.ts — add pdf_extracted_text DDL**
Insert after the `portfolio_targets` block and before the watchlist-seed guard:
```typescript
// -- PDF OCR Cache (Task 292 / FR-1) --
db.exec(`
  CREATE TABLE IF NOT EXISTS pdf_extracted_text (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    filename     TEXT    NOT NULL,
    page_number  INTEGER NOT NULL,
    text_content TEXT    NOT NULL DEFAULT '',
    confidence   REAL    NOT NULL DEFAULT 0,
    extracted_at TEXT    NOT NULL DEFAULT (datetime('now')),
    UNIQUE(filename, page_number)
  )
`);
db.exec(`CREATE INDEX IF NOT EXISTS idx_pet_filename ON pdf_extracted_text(filename, page_number)`);
```

**292-B**: pdfOcrWorker.ts — cache isOcrAvailable
**292-C**: pdfOcrWorker.ts — DPI 150 → 200 in ocrOnePage
**292-D**: pdfOcrWorker.ts — skip pages < 10 chars, remove double-insert
**292-E**: pdfOcrWorker.ts — completeness guard threshold `Math.max(expectedPages * 0.5, 3)`
**292-F**: pdf.ts — DPI 150 → 200 in ocrPdfBuffer

---

### Task 293 — Pipeline fallback: fetchParseAndStoreBctc OCR cache wiring

**Branch**: `task/293-ocr-fallback-pipeline`
**Layer**: application
**Depends on**: 292

Add OCR fallback branch in Step 2:
1. Derive `filename` from `doc.pdfFilename` or `decodeURIComponent(basename(URL.pathname))`.
2. Call `getCachedPdfText(filename)`.
3. If `cached === null && isOcrAvailable()`: re-download PDF to `data/pdfs/<filename>`, call `extractAndStorePdfPages`, then `getCachedPdfText` again.
4. If `cached.confidence >= 0.5`: use `cached.text` as `rawText`, log at `info` level.
5. If `cached.confidence` in [0.3, 0.5): use `cached.text`, log `warn` with confidence value.
6. If `cached.confidence < 0.3` or `cached === null`: log `warn` and return `null`.

---

### Task 294 — SSC Puppeteer semaphore: withBrowserLock(1)

**Branch**: `task/294-ssc-browser-mutex`
**Layer**: infrastructure

Insert module-level semaphore:
```typescript
let _browserLock: Promise<void> = Promise.resolve();
async function withBrowserLock<T>(fn: () => Promise<T>): Promise<T> {
  let release!: () => void;
  const next = new Promise<void>((r) => { release = r; });
  const prev = _browserLock;
  _browserLock = next;
  await prev;
  try { return await fn(); } finally { release(); }
}
```

---

### Task 295 — SSC selector probe (Deferred — superseded)

**Branch**: `task/295-ssc-selector-probe`
Deferred — Portal migrated to Oracle ADF SPA. Fixed by Task 1025 (fetchHoseDisclosures + fetchHnxDisclosures fallback).

---

## Sprint 049 — Kinh Dich Differentiation (Done 2026-04-06)

> Tech design: [docs/TECH_049.md](docs/TECH_049.md)
> Req spec: [docs/REQ_049.md](docs/REQ_049.md)
> Commits: 16e8262, 0a9dc74, 16a5474

| ID  | Title | Priority | Status |
|-----|-------|----------|--------|
| 297 | Fix computeForeignFlowScore: sort by fetched_at, replace total_volume with avg_volume_2w | P0 | Done |
| 298 | Fix computeMacroScore: use indicator column, derive rolling sigma from history window | P0 | Done |
| 299 | Fix computeSectorScore: widen peer pool from watchlist to all stocks in market_prices by domain | P0 | Done |
| 300 | Fix computeMacroIndicatorScore: remove sigma column ref, derive z-score from recent history | P1 | Done |
| 301 | Rebuild hexagramLibrary.ts QUE_DATA: port all 64 markdown que files with full hao + bien que data | P1 | Done |
| 302 | Smoke test: seed DB, assert VNM/FPT/VCB/VEA produce 4 different hexagrams, >=3 non-zero hao scores | P1 | Done |

---

### Task 297 — Fix computeForeignFlowScore

**Root cause**: `kinhDichTools.ts` `computeForeignFlowScore()` queries `total_volume` and `date` columns that do not exist. Actual columns: `foreign_volume`, `avg_volume_2w`, `fetched_at`.

**Fix**:
```typescript
const row = db.query<
  { foreign_volume: number | null; avg_volume_2w: number | null }, [string]
>(`SELECT foreign_volume, avg_volume_2w FROM vnstock_trading_stats
   WHERE code = ? ORDER BY fetched_at DESC LIMIT 1`).get(code);
if (!row?.foreign_volume || !row?.avg_volume_2w || row.avg_volume_2w === 0) return 0.0;
return Math.max(-1, Math.min(1, row.foreign_volume / row.avg_volume_2w));
```

---

### Task 298 — Fix computeMacroScore

**Root cause**: queries non-existent columns `name`, `sigma`, `updated_at`. Actual columns: `indicator`, `value`, `unit`, `source`, `extracted_at`.

**Fix**: Fetch recent history per indicator, derive sigma inline from rolling window. Full implementation in original TECH_049.md.

---

### Task 299 — Fix computeSectorScore

**Root cause**: queries `watchlist WHERE domain = ?` — zero peers per stock (4 stocks, 4 distinct domains).

**Fix**: Use `sector_peers` table with fallback to `market_prices` for relative strength computation. Full implementation preserved in TECH_049.md.

---

### Task 300 — Fix computeMacroIndicatorScore

**Root cause**: Line 381 queries `sigma` column and `name`/`updated_at` columns — all wrong. Derive sigma from 21-row history window. Full implementation in TECH_049.md.

---

### Task 301 — Rebuild hexagramLibrary.ts QUE_DATA

**Source data**: 64 markdown files at `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/kinhdich_logic/que_convert/` named `01_kien.md` through `64_vi_te.md`.

Key constraints:
- Preserve diacritics in all Vietnamese text
- `state.trend` must include "THUẬN LỢI" or "BẤT LỢI" or "TRUNG BÌNH"
- `lines` array must have exactly 6 entries per hexagram, positions 1-6
- `coreMeaning` = first blockquote line in the markdown file

---

### Task 302 — Integration smoke test: differentiated hexagrams

1. Seed SQLite in-memory DB with VNM/FPT/VCB/VEA watchlist, market_prices, vnstock_trading_stats, tracked_indicators, sector_peers.
2. Call `computeHaoScores(code)` for each of the 4 watchlist stocks.
3. Assert at least 3 of 6 scores non-zero for VCB/FPT, 4 hexagram numbers not all equal, each score function returns non-zero when seeded data present.

---

## Sprint 050 — Done 2026-04-07

### Sprint 050 — Close the Cycle: Kinh Dich Goes Live + /ask Command

> Req spec: [docs/REQ_050.md](docs/REQ_050.md)
> Tech design: [docs/TECH_050.md](docs/TECH_050.md)
> Dependency chain: 303 (standalone) → 304 | 305 (standalone) → 306 + 307 | 308 (parallel)
> B1 resolved: Step F delegates to runUserRequestCheck(); no more inline pending-request loop
> B2 resolved: inline try/catch ALTER TABLE in initHexagramTables() — consistent with existing pattern
> B3 resolved: verb-primary polarity formula — MUA/CHO=+1, BAN/THAN TRONG=-1, GIU=0; tieu cuc multiplier 0.7
> Scope note: Task 306 enrichment moves to userRequestCheckJob.ts (buildEnrichedAnswer); Step F simplified

| ID  | Title | Priority | Agent | Layer | Depends On | Branch | Status |
|-----|-------|----------|-------|-------|------------|--------|--------|
| 303 | Cycle Step A4: auto-compute hexagram per watchlist stock every cycle | P0 | Developer | scheduler | — | task/303-cycle-step-a4-hexagram | Done |
| 304 | Conviction scorer 6th dimension: kinhDichScore at 15% | P1 | Developer | domain | 303 ✓ | task/304-conviction-kinhdich | Done |
| 305 | user_requests MCP tools: log_user_request + get_pending_user_requests | P0 | Developer | interface/mcp/tools | — | task/305-user-requests-mcp-tools | Done |
| 306 | Step F enrichment: buildEnrichedAnswer in checkJob + Vietnamese + why: prefix | P1 | Developer | scheduler | 303 ✓, 305 ✓ | task/306-step-f-enrichment | Done |
| 307 | /ask + /why: store why:TICKER payload, guard no-arg /why | P1 | Developer | infrastructure/notifiers | 305 ✓ | task/307-telegram-why-command | Done |
| 308 | Dynamic tool registry (registry.ts) — deferred task 193 | P2 | Developer | interface | — | task/308-tool-registry | Done |

---

### Task 303 — Cycle Step A4: auto-compute hexagram per watchlist stock every cycle

**Branch**: `task/303-cycle-hexagram-batch`
**Layer**: scheduler + infrastructure/db
**TDD test**: `src/__tests__/311-cycle-hexagram-batch.test.ts`

Step A4 exact pattern:
```typescript
const codesToProcess = watchlistCodes.length > 0 ? watchlistCodes : (await defaultGetWatchlistCodes());
for (const code of codesToProcess) {
  try {
    const previousReading = getLatestReading(code);
    const scores = computeHaoScores(code);
    const prelimReading = computeReading(code, scores, null);
    const markovData = getMarkovData(code, prelimReading.queChiNh.number);
    const reading = computeReading(code, scores, markovData);
    storeReading({ ..., source: 'cycle' });
    if (previousReading) recordTransition(previousReading.hexagramNumber, reading.queChiNh.number, code);
    hexagramsComputed++;
  } catch (err) { log.warn(`Step A4 failed for ${code}: ${err}`); errors++; }
}
```

Acceptance Criteria: `kinhdich_readings` contains 4 new rows with `source='cycle'` for VNM/FPT/VCB/VEA; `CycleResult.hexagramsComputed = 4`; errors increment on single-stock failure.

---

### Task 304 — Conviction scorer 6th dimension: kinhDichScore at 15%

**Branch**: `task/304-conviction-kinhdich`
**TDD test**: `src/__tests__/312-conviction-kinhdich.test.ts`

Updated WEIGHTS: priceAction: 0.2550, volumeConfirmation: 0.2125, sentiment: 0.1275, cascade: 0.1275, sectorAlignment: 0.1275, kinhDich: 0.1500

deriveKinhDichScore formula (B3):
```typescript
function deriveKinhDichScore(tradingSignal: string | null, confidence: number | null): number {
  if (!tradingSignal || confidence == null) return 0;
  const sig = tradingSignal.toUpperCase();
  const conf = Math.max(0, Math.min(1, confidence));
  let verbPolarity: number;
  if (sig.includes("MUA") || sig.includes("CHO")) verbPolarity = +1;
  else if (sig.includes("BAN") || sig.includes("THAN TRONG")) verbPolarity = -1;
  else verbPolarity = 0; // GIU
  const suffixMultiplier = sig.includes("TIEU CUC") ? 0.7 : 1.0;
  return verbPolarity * conf * suffixMultiplier;
}
```

---

### Task 305 — user_requests MCP tools: log_user_request + get_pending_user_requests

**Branch**: `task/305-user-request-tools`
**TDD test**: `src/__tests__/313-user-request-tools.test.ts`

Register `log_user_request(question, source)` and `get_pending_user_requests(limit?)` in `src/interface/mcp/tools/userRequestTools.ts`.

---

### Task 306 — Step F enrichment: buildEnrichedAnswer in checkJob

**Branch**: `task/306-step-f-enrichment`
**TDD test**: `src/__tests__/314-step-f-enrichment.test.ts`

buildEnrichedAnswer logic:
1. Extract uppercase 2-4 letter codes from payload via `/\b([A-Z]{2,4})\b/g`
2. Filter against watchlist table; limit to first 3 codes
3. For why:VCB payloads: strip "why:" prefix before extraction
4. For each code: query getLatestReading(code), market_prices, alerts
5. Build Vietnamese answer block; omit sections where sub-query returns null
6. If no watchlist code found in payload: return pure RAG answer
7. Fallback text: "Chua co du lieu Kinh Dich cho ma nay" when getLatestReading returns null

---

### Task 307 — /ask + /why: store why:TICKER payload, guard no-arg /why

**Branch**: `task/307-telegram-why-command`
**TDD test**: `src/__tests__/315-telegram-why-command.test.ts`

- `/why VCB` handler stores `payload = 'why:VCB'` (not English sentence)
- No-arg `/why` returns `"Cach dung: /why VCB"` without inserting a user_requests row

---

### Task 308 — Dynamic tool registry (registry.ts)

**Branch**: `task/308-tool-registry`
**TDD test**: `src/__tests__/316-tool-registry.test.ts`

- CREATE: `src/interface/mcp/tools/registry.ts` — export `toolRegistry: Array<(server: McpServer) => void>`
- MODIFY: `src/interface/mcp/server.ts` — replace individual calls with `toolRegistry.forEach(fn => fn(server))`

---

## Sprint 051 — 3-Channel Telegram Migration (Done 2026-04-07)

> Sprint 051 Theme: Hard-cutover migration from 2-channel to 3-channel Telegram routing.
> NO LEGACY ALIASES — old env vars and channel literals must be fully deleted.
> Dependency chain: 311 (infra) → 312 (call sites) | 313 (docs/agents, parallel to 312 after 311)

| # | Title | Branch | Agent | Priority | Depends on | Status |
|---|-------|--------|-------|----------|------------|--------|
| 311 | Telegram infra: 3-channel config + send_telegram enum | `task/311-telegram-3channel-infra` | Developer | P0 | — | Done |
| 312 | Reclassify all src/ call sites to market/work/bug | `task/312-telegram-callsite-reclassify` | Developer | P0 | 311 | Done |
| 313 | Agent .md + docs + mcp.config.json: 3-channel rewrite | `task/313-telegram-agent-docs-rewrite` | Cowork Refactory Expert | P0 | 311 | Done |
| 314 | Fix dataAuditJob wiping market_prices snapshot | `task/314-dataaudit-market-prices-wipe` | Developer | P1 | — | Done (regression test shipped 2026-04-08) |

---

**Task 314 — Fix dataAuditJob wiping `market_prices` snapshot**

Branch: `task/314-dataaudit-market-prices-wipe`
Layer: `src/scheduler/dataAuditJob.ts`
Priority: P1 — user-visible (`get_watchlist` shows Giá: N/A outside market hours)
Depends on: none

**Symptom (observed 2026-04-07 ~16:35 UTC):**
After VN market close, `market_prices` table is empty (0 rows) even though
2,712 successful `/api/push-prices` writes were logged during the session and
`daily_ohlcv` retains all 123 codes for the same day. `get_watchlist` and
`/price` show `N/A` for every stock until market re-opens.

**Suspect:** `dataAuditJob.ts:268` `DELETE FROM market_prices WHERE price = 0 OR price IS NULL` — the VPS proxy likely sends `price=0` for halted/illiquid tickers, and the audit deletes the entire snapshot.

**Acceptance Criteria:**
1. Failing test in `src/__tests__/314-dataaudit-market-prices-wipe.test.ts` that seeds market_prices with a mix of price=0 and price>0 rows, runs the audit, and asserts price>0 rows survive.
2. Audit query tightened so legitimate snapshot rows are never deleted.
3. Audit `findings[]` correctly reports `rowsAffected` for BOTH D-1 and D-2.
4. After fix, `get_watchlist` shows last-close prices outside market hours.

**Investigation notes:**
- Server uptime at observation: ~15 min (restarted ~16:24 UTC).
- Last successful push: 2026-04-07 15:59:19 ICT (08:59 UTC).
- Audit ran at 09:00 UTC (1 min after last push) and reported "0 cleaned, 2 warnings".
- daily_ohlcv (same handler, same `db`) preserved all 123 codes — proves the push handler did write the data; only `market_prices` was wiped.

---

**Task 311 — Telegram Infra: 3-Channel Config + send_telegram Enum**

Branch: `task/311-telegram-3channel-infra`
Layer: `infrastructure/config.ts`, `src/infrastructure/notifiers/telegram.ts`, `src/interface/mcp/tools/telegramTools.ts`, `src/interface/mcp/server.ts`
Priority: P0 — blocks 312 and 313
Depends on: none

Acceptance criteria:
- `TELEGRAM_CHAT_ID` and `TELEGRAM_REPORT_ID` are deleted from `src/infrastructure/config.ts`. Zero references remain.
- Three new env vars added: `TELEGRAM_INFO_MARKET_GROUP_ID` (-1003813192664), `TELEGRAM_INFO_WORK_CHANNEL_ID` (-1003733983137), `TELEGRAM_REPORT_BUG_CHANNEL_ID` (-1003853842961)
- `mcp.config.json` telegram section updated with `marketGroupId`, `workChannelId`, `bugChannelId`
- `src/infrastructure/notifiers/telegram.ts`: `sendTelegramMarket`, `sendTelegramWork`, `sendTelegramBug` functions added
- `src/interface/mcp/tools/telegramTools.ts`: Zod enum updated to `z.enum(["market", "work", "bug"])`
- >= 20 tests covering all 3 channels, 0 failures

Files:
- MODIFY: `src/infrastructure/config.ts`
- MODIFY: `src/infrastructure/notifiers/telegram.ts`
- MODIFY: `src/infrastructure/notifiers/index.ts`
- MODIFY: `src/interface/mcp/tools/telegramTools.ts`
- MODIFY: `src/interface/mcp/server.ts`
- MODIFY: `mcp.config.json`
- MODIFY: `src/__tests__/235-telegram-send-merge.test.ts`
- MODIFY: `src/__tests__/227-report-webhook.test.ts`
- MODIFY: `src/__tests__/034-telegram-notifier.test.ts`
- MODIFY: `src/__tests__/176-trigger-alert-check.test.ts`
- MODIFY: `src/__tests__/306-enriched-answer.test.ts`

---

**Task 312 — Reclassify All src/ Call Sites**

Branch: `task/312-telegram-callsite-reclassify`
Priority: P0 — zero occurrences of `TELEGRAM_CHAT_ID`, `TELEGRAM_REPORT_ID`, `channel: "chat"`, `channel: "report"` remain

Reclassification table:
- weeklyPortfolioReportJob.ts → `sendTelegramMarket`
- weatherCheckJob.ts → `sendTelegramMarket`
- franceSummaryJob.ts → `sendTelegramMarket`
- eveningSummaryJob.ts → `sendTelegramMarket`
- dataAuditJob.ts → `sendTelegramWork`
- patternWatchJob.ts → `sendTelegramMarket`
- userRequestCheckJob.ts → `sendTelegramMarket`
- intelligenceCycleJob.ts → `sendTelegramMarket`
- vpsProxyWatchdogJob.ts → `sendTelegramMarket`
- devTeamHeartbeatJob.ts → `sendTelegramWork`
- morningBriefingJob.ts → `sendTelegramMarket`
- insiderCheckJob.ts → `sendTelegramMarket`
- feedbackTools.ts → `sendTelegramBug`
- server.ts lines 267, 472, 509 → `sendTelegramMarket`

---

**Task 313 — Agent .md + Docs + mcp.config.json: 3-Channel Rewrite**

Branch: `task/313-telegram-agent-docs-rewrite`
Priority: P0

Routing rules applied per agent:
- `00-setup-watchlist.md` → `channel="market"`
- `01-news-scout.md` → feedback `channel="bug"`
- `02-bctc-collector.md` → notification `channel="market"`; feedback `channel="bug"`
- `03-report-analyzer.md` → feedback `channel="bug"`
- `04-market-watcher.md` → feedback `channel="bug"`
- `05-alert-commander.md` → all user alerts `channel="market"` (ONLY sender)
- `06-digest-writer.md` → digests `channel="market"`; weekly summary → `channel="work"`
- `unified-agent.md` → user-facing `channel="market"`; coordination `channel="work"`; bugs `channel="bug"`
- `dev-team-cron.md` → fix summaries `channel="work"`; reading Bug Channel `channel="bug"`

Files modified: all 9 agent .md files, `cowork-refactory-expert.md`, `system-auditor.md`, `docs/ARCHITECTURE.md`, `README.md`

---

## Sprint 053 — Shipped 2026-04-07

- **137 flake** `8b954cc` — schema.ts alerts table was missing notified_telegram/resolved_at/resolution_notes; added to CREATE TABLE + idempotent ALTER for legacy DBs. 19/19 pass.
- **1023 prediction_markets startup race** `fcbc382` — predictionMarketJob now calls `await initDatabase()` before getDb() when opts.db is not injected. TDD regression test.
- **1024 alert retry window** `56ad52c` — `ALERT_WINDOW_MS` 16m → 24h so unnotified HIGH/CRITICAL alerts are retried for a full day. TDD regression test.
- **1019 BCTC stranded-PDF reparse (all 3 slices)** `c528efa` — per-file structured findings + new `bctcReparseJob.ts` (daily 09:30) + `reparse_attempts` column with escalation at 3 / alert at 5. 13/13 new tests.
- **1020 full-suite bun test crash** `pending` — root cause = Bun napi teardown panic on `@xenova/transformers` + `@lancedb/lancedb` modules. Mitigation: per-file `scripts/test-all.sh` + `bun run test:all`. See `docs/TEST_OOM_INVESTIGATION.md`.

---

## Done — Master Table (merged through Sprint 053)

| # | Title | Branch | Merged | Report |
|---|-------|--------|--------|--------|
| 280 | Foreign flow delta + corporate events calendar | `task/280-foreign-flow-catalyst-calendar` | 2026-04-06 | [TASK_REPORT_280](reports/TASK_REPORT_280.md) |
| 195 | Portfolio rebalancing signals: `get_rebalancing_signals` | `task/195-rebalancing-signals` | 2026-04-06 | [TASK_REPORT_195](reports/TASK_REPORT_195.md) |
| 215 | Telegram webhook registration + security | `task/215-telegram-webhook` | 2026-04-06 | [TASK_REPORT_215](reports/TASK_REPORT_215.md) |
| 217 | compare_stocks MCP tool — side-by-side comparison | `worktree-agent-a1f64692` | 2026-04-06 | [TASK_REPORT_217](reports/TASK_REPORT_217.md) |
| 218 | Weekly portfolio report via Telegram | `worktree-agent-a219df68` | 2026-04-06 | [TASK_REPORT_218](reports/TASK_REPORT_218.md) |
| 219 | Custom alert rules engine | `task/219-custom-alert-rules` | 2026-04-06 | [TASK_REPORT_219](reports/TASK_REPORT_219.md) |
| 000 | Initial project structure | `main` | 2026-03-24 | — |
| 230 | Remove 8 dead/forbidden/internal tools from MCP (64→56) | `task/230-remove-dead-tools` | 2026-04-02 | — |
| 231 | Fix G5: `claim_telegram_report` ownership lock | `task/231-claim-telegram-report` | 2026-04-02 | — |
| 232 | Fix G3: `/report` + `/fix` Telegram commands | `main` | 2026-04-02 | — |
| 233 | Fix G2: `system_changelog` + `log_fix` + `get_recent_fixes` | `main` | 2026-04-02 | — |
| 234 | Merge M1: system health 4→1 `get_system_status` | `main` | 2026-04-02 | — |
| 235 | Merge M2: Telegram send 3→1 `send_telegram` | `main` | 2026-04-02 | — |
| 236 | Merge M3: alert mute 2→1 `manage_alert_mute` | `main` | 2026-04-02 | — |
| 237 | CLAUDE.md + all 9 agent `.md` files updated for 53 tools | `main` | 2026-04-02 | — |
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
| DOC-001 | Update CLAUDE.md with Sprint 034 architecture additions | `task/doc-001-claude-md-update` | 2026-04-02 | [TASK_REPORT_DOC-001](reports/TASK_REPORT_DOC-001.md) |
| 246 | Credit Flow Analyzer (domain service) | `worktree-agent-ad862eb2` | 2026-04-03 | — |
| 247 | Leadership Signal Detector (domain service) | `worktree-agent-ad862eb2` | 2026-04-03 | — |
| 248 | Muasamcong public procurement fetcher | `worktree-agent-ad862eb2` | 2026-04-03 | — |
| 249 | SSC Insider fetcher + InsiderStore | `worktree-agent-ad862eb2` | 2026-04-03 | — |
| 250 | Signal Integration — SignalType + CAPEX/CREDIT cascade + insiderCheckJob | `worktree-agent-ad862eb2` | 2026-04-03 | — |
| 251 | MCP Tools — get_public_contracts, get_credit_flow_signal, get_insider_signals | `worktree-agent-ad862eb2` | 2026-04-03 | — |

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
> **Sprint 049 QA SIGN-OFF** — 2026-04-06. Tasks 280, 195, 215, 217, 218, 219 reviewed and approved. All 6 passed unit tests (32+17+12+20+14+21), full suite 3015 pass, tsc 0 errors, DDD PASS, Security PASS. Moved to Done.

---

## Done — Janitor Tasks (Sprint 052/053 dedup sweep)

| # | Title | Status |
|---|-------|--------|
| 303 | Rewrite 029-ssc-scraper.test.ts — drop Puppeteer BrowserFactory | Done |
| 304 | Rewrite 048-ssc-pipeline.test.ts — drop Puppeteer types | Done |
| 305 | Rewrite 124-test-ssc-pipeline.test.ts — 14 BrowserFactory→HttpClient assignments | Done |
| 306 | sentiment_entries table: wire pollNews sentiment classifier to per-stock rows | Done (slice 1: pollNews writes real sentiment to rag_analyses, a49d8ed) |
| 307 | Scheduled job: walk alerts older than 24h, compute outcome vs market_prices_history | Done (alt: relaxed lookforward) |
| 308 | market_prices_history coverage: ensure VPS price proxy writes every 15-min tick | Done |
| 309 | Stranded BCTC PDF retry: scan data/pdfs/, infer stock from filename, re-parse | Done (detector slice) |
| 310 | SSC nightly: detect overdue Q4 filings and surface as actionable agent_feedback | Done |
| 985 | Investigate macro alert HIGH/CRITICAL count = 0 despite Brent $108 | Done — resolved by tasks 137 (schema fix) + 1024 (retry window 24h) |
| 1001 | BCTC ingest regression: VNM PDF on disk 9 days, get_bctc_full returns "Chua co du lieu" | Backlog |
| 1002 | Anonymous SSC PDF attribution | Backlog |
| 1003 | FPT/VEA Q4-2025 BCTC overdue 8 days — investigation | Done — 10 regression tests in 1003-ssc-fpt-vea-query.test.ts; FINDINGS: FPT filing genuinely not published; VEA=UPCOM coverage gap. Commit af1393c 2026-04-08 |
| 1004 | Cascade gap: VN-market policy/macro news scoring at base 10.0 | Backlog |
| 1005 | Pre-fix phantom alert marker: log_fix accepts `supersedes_alert_ids` | Done 2026-04-08 |
| 1006 | Sector peer PE/PB/ROE returns N/A — MAX_PEER_SYNCS_PER_CYCLE raised 5→30 | Done |
| 1007 | Kinh Dich convergence: identical Que Du (16) for VCB/VNM/FPT | Done — tickerJitter() added; 8 tests in 1007-kinhdich-convergence.test.ts |
| 1018 | BCTC overdue Telegram alert (all 3 slices) | Done |
| 1018b | BCTC overdue Slice 2: severity bumped warning→high | Done 2026-04-07 |
| 1018c | BCTC overdue Slice 3: register bctcOverdueCheckJob in jobs.ts | Done 2026-04-07 |
| 1019 | SSC fetch network timeout not tripping circuit breaker | Done — commit a8287c6 |
| 1020 | Kinh Dich identical-result repro confirmed — duplicate of 1007 | Done — resolved by task 1007 |
| 1021 | [janitor] Remove legacy src/db/schema.ts | Done — src/db/schema.ts does not exist (already removed) |
| 1022 | [janitor] Consolidate inline schema guards in telegramCommands.ts | Done |
| 1023 | [janitor] Move SUMMARY_CRONS into CRONS map in src/scheduler/jobs.ts | Done — commit 3e59f57 |
| 1024 | [janitor] Fix hardcoded WAL checkpoint cron in jobs.ts | Done — already implemented; task was stale |
| 1025 | SSC BCTC PDF download — ADF portal migration full fix | Done 2026-04-08 |
| 1026 | Startup env self-check: fail fast + WORK alert if TELEGRAM_BOT_TOKEN missing | Done — src/infrastructure/envCheck.ts; 7 tests pass |
| 1027 | [janitor] Remove inline market_prices_history DDL in hose.ts | Done — commit 3ebb468 |
| 1028 | [janitor] Remove inline market_prices_history DDL in correlationTools.ts | Done — commit 3ebb468 |
| 1029 | [janitor] Remove inline telegram_reports + system_changelog DDL in devTeamHeartbeatJob.ts | Done — commit 3745f1f |
| 1030 | [janitor] Remove inline tracked_indicators DDL in shippingIndex.ts | Done — commit 3745f1f |
| 1033 | [janitor] Remove duplicate mention_velocity CREATE TABLE block inside schema.ts | Done — commit bde2b04 |
| 1034 | [janitor] Remove ensureChangelogTable() from changelogStore.ts | Done |
| 1035 | [janitor] Remove ensureTelegramReportsTable() from telegramReportStore.ts | Done |
| 1036 | [janitor] Remove inline user_requests DDL from userRequestStore.ts | Done — commit d0b2b53 |
| 1037 | [janitor] Remove ensureReputationTable() from reputationStore.ts | Done |
| 1038 | [janitor] Remove ensureBrokerSanctionsTable() from brokerSanctionStore.ts | Done |
| 1039 | [janitor] Remove ensureTrackedIndicatorsTable() from commodityTracker.ts | Done |
| 1040 | [janitor] Move briefing_log DDL from morningBriefingJob.ts into initDatabase() | Done — commit 33a4946 |
| 1041 | [janitor] Move audit_state DDL from dataAuditJob.ts into initDatabase() | Done — commit 33a4946 |
| 1042 | [janitor] Move vnstockStore.ts inline DDL (8 tables) into initDatabase() | Done — commit bfb06d0 2026-04-08 |
| 1043 | [janitor] Move tradeStore.ts inline DDL into initDatabase() | Done — commit 28c52ce |
| 1044 | [janitor] Move cascadeHitStore.ts inline DDL into initDatabase() | Done — commit 28c52ce |
| 1045 | [janitor] Move bondMaturityStore.ts inline DDL into initDatabase() | Done — commit 26a5746 |
| 1046 | [janitor] Move pharmaStore.ts inline DDL into initDatabase() | Done — commit 26a5746 |
| 1047 | [janitor] Move hexagramStore.ts inline DDL into initDatabase() | Done — commit 4a24803 |
| 915 | Analyst-credibility discount on sanctioned brokers | Done 2026-04-08 — broker_sanctions table + forecastConfidenceScore() + get_broker_credibility MCP tool; 22 new tests |
| 916 | [backlog] sector rotation prefers change_pct | Done — fixed in sprint 052 (3818d59) |
| 921 | [backlog] yahooFinance single source of truth for brent | Done — fixed in sprint 052 (a205679) |

---

## Done — Sprint 054 All Tasks (merged to main)

All Sprint 054 tasks (1070–1081) are fully merged. See active TASKS.md Sprint 054 Kanban for the complete task detail sheets (preserved there as reference for QA reports).

> Sprint 054 QA SIGN-OFF: All 11 tasks done (1070, 1071, 1072, 1073, 1074, 1075, 1076, 1077, 1078, 1079, 1081). Smoke test 1081 passed.
