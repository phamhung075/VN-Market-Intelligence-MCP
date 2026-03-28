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
> **Sprint 007 PLANNING** — Tasks 025, 028 promoted to Todo. See SPRINT_GOAL.md sprint_id: 007. Both fetchers are independent; build in parallel (Wave 1 only).
> **Sprint 008 PLANNING** — Tasks 025, 028 carried forward; new tasks 126, 089, FIX-081 added. See SPRINT_GOAL.md sprint_id: 008. Wave 1: 025 + 028 + FIX-081 in parallel. Wave 2: 126 + 089 after Wave 1.
> **Sprint 008 BA** — REQ_008.md written. B1 resolved (DomainType missing logistics + gold_mining — user must confirm patch approach). B2 + B3 pending user answer. Architect unblocked for task design pending B1 confirmation.
> **Sprint 008 ARCH** — TECH_008.md written and approved by Architect (2026-03-28). Wave execution plan: Wave 1 (025 + 028 + FIX-081 in parallel) → Wave 2 (126 + 089 in parallel). PM sprint planning unblocked. See docs/TECH_008.md.
> **Sprint 008 PM** — 5 tasks broken down (2026-03-28). Wave 1: 025 + 028 + FIX-081 → Todo. Wave 2: 126 + 089 → Backlog. Full acceptance criteria + file-level context injected per TECH_008. WIP limit: max 2 In Progress simultaneously. See TASKS.md Sprint 008 section.

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

### Sprint 008

> Sprint 007 tasks 025 and 028 carried forward with no work done. Sprint 008 adds cascade integration (126), macro MCP tool (089), and SSE test fix (FIX-081). Status: ACTIVE.
> TECH-007 approved by Architect (2026-03-28). See docs/TECH_007.md for interface contracts, DB DDL, test strategy, and wave execution plan for tasks 025 and 028.
> **Sprint 008 ACTIVE** — 2026-03-28. Wave 1 tasks (025, 028, FIX-081) ready to assign. WIP limit: 2. Tasks 025 and 028 are independent and can be built in parallel.
> **Sprint 008 TECH** — TECH_008.md approved. PM: plan sprint execution per TECH_008 wave plan. Ref: docs/TECH_008.md.
> **Sprint 008 PM** — 5 tasks broken down, 2 waves defined. Wave 1 (025 + 028 + FIX-081) all Todo. Wave 2 (126 + 089) Backlog until Wave 1 merges. WIP limit enforced: start any 2 of the 3 Wave 1 tasks simultaneously.

#### Wave 1 — Run in parallel (025, 028, FIX-081 are all independent of each other)

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 025 | Yahoo Finance commodity fetcher | `task/025-yahoo-finance` | Developer | infrastructure | 003 ✅ | Todo |
| 028 | SBV (State Bank Vietnam) macro fetcher | `task/028-sbv-macro` | Developer | infrastructure | 003 ✅ | Todo |
| FIX-081 | Fix SSE test timeout flakiness | `task/fix-081-sse-timeout` | Fixer | interface/test | 081 ✅ | Todo |

---

**Task 025 — Yahoo Finance commodity fetcher**

**Branch**: `task/025-yahoo-finance`
**Layer**: infrastructure
**Depends on**: 003 ✅

**Files to read first**:
- `src/infrastructure/fetchers/tradingEconomics.ts` (follow this exact pattern for HttpClient + never-throw contract)
- `src/infrastructure/db/schema.ts` (add DDL after existing `macro_indicators` block)
- `src/infrastructure/fetchers/index.ts` (barrel export to update)

**Files to create/modify**:
- CREATE: `src/infrastructure/fetchers/yahooFinance.ts`
- CREATE: `src/__tests__/025-yahoo-finance.test.ts` (12 test cases YF-01 through YF-12)
- MODIFY: `src/infrastructure/db/schema.ts` (add `commodity_prices` + `commodity_prices_history` DDL blocks)
- MODIFY: `src/infrastructure/fetchers/index.ts` (barrel export `fetchYahooFinancePrices`, `storeCommoditySnapshot`)

**Interface to implement**:
```typescript
export interface CommoditySnapshot {
  brentCrudeUSD: number | null;   // USD per barrel
  goldUSDPerOz: number | null;    // USD per troy oz
  usdVndRate: number | null;      // VND per 1 USD (market rate)
  fetchedAt: string;              // ISO 8601
}

export async function fetchYahooFinancePrices(httpClient?: HttpClient): Promise<CommoditySnapshot | null>
export function storeCommoditySnapshot(snapshot: CommoditySnapshot, db?: Database): void
```

**JSON API approach (recommended over HTML scraping)**:
- Base URL env var: `YAHOO_FINANCE_BASE_URL` (default: `https://query1.finance.yahoo.com`)
- Brent: `${base}/v8/finance/chart/BZ=F?interval=1d&range=1d`
- Gold:  `${base}/v8/finance/chart/GC=F?interval=1d&range=1d`
- USDVND: `${base}/v8/finance/chart/USDVND=X?interval=1d&range=1d`
- Response field: `result[0].meta.regularMarketPrice`
- Strip commas before parseFloat: `replace(/,/g, "")`
- Headers: `User-Agent: Mozilla/5.0 ...`, `Referer: https://finance.yahoo.com`, timeout 15s

**DB DDL to add** (inside `initDatabase()`, after `macro_indicators` block):
```sql
CREATE TABLE IF NOT EXISTS commodity_prices (
  source          TEXT PRIMARY KEY,
  brent_crude_usd REAL,
  gold_usd_per_oz REAL,
  usd_vnd_rate    REAL,
  fetched_at      TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS commodity_prices_history (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  source          TEXT NOT NULL,
  brent_crude_usd REAL,
  gold_usd_per_oz REAL,
  usd_vnd_rate    REAL,
  fetched_at      TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cph_source_fetched
  ON commodity_prices_history(source, fetched_at DESC);
```

**storeCommoditySnapshot contract**: single `db.transaction()` — INSERT OR REPLACE into `commodity_prices` (source = "yahoo_finance") + INSERT INTO `commodity_prices_history`.

**Acceptance Criteria**

**Given** Yahoo Finance JSON API is reachable (or mocked via injectable `HttpClient`)
**When** `fetchYahooFinancePrices(httpClient)` is called
**Then**
- Returns `CommoditySnapshot` with `brentCrudeUSD`, `goldUSDPerOz`, `usdVndRate`, `fetchedAt`
- YF-01: Happy path — all 3 values returned as positive numbers (BZ=F=84.37, GC=F=2341.50, USDVND=X=25450)
- YF-02/03/04: Each of `brentCrudeUSD`, `goldUSDPerOz`, `usdVndRate` is a `number` type
- YF-05: Partial success — one symbol missing still returns the other two (missing symbol field = null)
- YF-06: All 3 symbols fail — returns `null`, never throws
- YF-07: HTTP error — returns `null`, never throws, logs warning
- YF-08: HTML fallback — if JSON unavailable, parses `<fin-streamer value="">` attribute; falls back to element text if no `value` attr
- YF-E5: Comma in value `"2,341.50"` is stripped correctly → `2341.50`
- YF-09: `storeCommoditySnapshot` writes to both `commodity_prices` (1 row upsert) and `commodity_prices_history` (appended row) using in-memory SQLite
- YF-10: Two calls to `storeCommoditySnapshot` — `commodity_prices` stays 1 row, `commodity_prices_history` becomes 2 rows
- YF-11: `fetchYahooFinancePrices` and `storeCommoditySnapshot` are importable from `src/infrastructure/fetchers/index.ts`
- YF-12: `fetchedAt` is a valid ISO 8601 timestamp string
- `bun test src/__tests__/025-*.test.ts` passes with mocked HTTP — no real network calls
- `bun tsc --noEmit` 0 errors

**TDD test file**: `src/__tests__/025-yahoo-finance.test.ts`
Mock pattern:
```typescript
function makeHttpClient(json: string) {
  return { get: async (_url: string): Promise<string> => json };
}
function makeErrorHttpClient() {
  return { get: async (_url: string): Promise<string> => { throw new Error("Network error"); } };
}
```

---

**Task 028 — SBV (State Bank Vietnam) macro fetcher**

**Branch**: `task/028-sbv-macro`
**Layer**: infrastructure
**Depends on**: 003 ✅

**Files to read first**:
- `src/infrastructure/fetchers/tradingEconomics.ts` (follow HttpClient + never-throw pattern)
- `src/infrastructure/db/schema.ts` (add DDL after `commodity_prices` block from task 025)
- `src/infrastructure/fetchers/index.ts` (barrel export to update)

**Files to create/modify**:
- CREATE: `src/infrastructure/fetchers/sbv.ts`
- CREATE: `src/__tests__/028-sbv-rates.test.ts` (14 test cases SBV-01 through SBV-14)
- MODIFY: `src/infrastructure/db/schema.ts` (add `sbv_rates` + `sbv_rates_history` DDL blocks)
- MODIFY: `src/infrastructure/fetchers/index.ts` (barrel export `fetchSbvRates`, `storeSbvSnapshot`)

**Interface to implement**:
```typescript
export interface SbvMacroSnapshot {
  overnightRatePct: number | null;    // percent
  refinancingRatePct: number | null;  // percent (policy rate)
  usdVndOfficial: number | null;      // VND per 1 USD (central rate)
  fetchedAt: string;                  // ISO 8601
}

export async function fetchSbvRates(httpClient?: HttpClient): Promise<SbvMacroSnapshot | null>
export function storeSbvSnapshot(snapshot: SbvMacroSnapshot, db?: Database): void
```

**Two-page fetch strategy** (env var: `SBV_BASE_URL`, default `https://www.sbv.gov.vn`):
- Interest rates page: `${base}/webcenter/portal/en/home/rm/ir`
- FX rates page:       `${base}/webcenter/portal/en/home/fm/exchangerate`
- Pages fetched independently; partial failure is valid (one page down = null fields for that page only)
- Returns `null` only when BOTH pages fail
- Header: `Accept-Language: en`

**Parse rules**:
- `overnightRatePct`: `<td>` label contains `"overnight"` or `"qua đêm"` (case-insensitive), strip `%` and whitespace, `parseFloat`
- `refinancingRatePct`: label contains `"refinancing"` or `"tái cấp vốn"`, must NOT match `"discount"` or `"chiết khấu"` (SBV-E6 non-contamination)
- `usdVndOfficial`: USD row (`"USD"` or `"Đô la Mỹ"`), "Central rate" / "Tỷ giá trung tâm" column
- VN decimal normalisation: `replace(/\./g, "")` then `replace(",", ".")` before parseFloat (e.g. `"25.450,50"` → `25450.5`)

**DB DDL to add** (inside `initDatabase()`, after `commodity_prices_history` block):
```sql
CREATE TABLE IF NOT EXISTS sbv_rates (
  source               TEXT PRIMARY KEY,
  overnight_rate_pct   REAL,
  refinancing_rate_pct REAL,
  usd_vnd_official     REAL,
  fetched_at           TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sbv_rates_history (
  id                   INTEGER PRIMARY KEY AUTOINCREMENT,
  source               TEXT NOT NULL,
  overnight_rate_pct   REAL,
  refinancing_rate_pct REAL,
  usd_vnd_official     REAL,
  fetched_at           TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sbvh_source_fetched
  ON sbv_rates_history(source, fetched_at DESC);
```

**storeSbvSnapshot contract**: single `db.transaction()` — INSERT OR REPLACE into `sbv_rates` (source = "sbv") + INSERT INTO `sbv_rates_history`.

**Acceptance Criteria**

**Given** SBV website pages are reachable (or mocked via two-page injectable `HttpClient`)
**When** `fetchSbvRates(httpClient)` is called
**Then**
- SBV-01: Happy path — all 3 fields returned as positive numbers from both pages
- SBV-02: `overnightRatePct` parses correctly from the interest-rate page
- SBV-03: `refinancingRatePct` parses correctly and is NOT contaminated by the discount rate row
- SBV-04: `usdVndOfficial` parses the "Central rate" column from the FX page correctly
- SBV-05: Both pages fail — returns `null`, never throws
- SBV-06: IR page fails, FX page succeeds — `overnightRatePct`/`refinancingRatePct` = null, `usdVndOfficial` > 0 (not null)
- SBV-07: FX page fails, IR page succeeds — `usdVndOfficial` = null, rate fields > 0
- SBV-08: Vietnamese labels `"qua đêm"` / `"tái cấp vốn"` are parsed correctly
- SBV-09: `refinancingRatePct` NOT contaminated by discount/chiết khấu row appearing above it
- SBV-E3: VN decimal `"25.450,50"` normalises to `25450.5`
- SBV-10: `storeSbvSnapshot` writes to both `sbv_rates` (upsert) and `sbv_rates_history` (append) using in-memory SQLite
- SBV-11: Two calls — `sbv_rates` stays 1 row, `sbv_rates_history` becomes 2 rows
- SBV-12: `fetchSbvRates` and `storeSbvSnapshot` are importable from `src/infrastructure/fetchers/index.ts`
- SBV-13: VN number format `"25.450"` (dots as thousands separator) → `25450`
- SBV-14: `fetchedAt` is a valid ISO 8601 timestamp string
- `bun test src/__tests__/028-*.test.ts` passes with mocked HTTP — no real network calls
- `bun tsc --noEmit` 0 errors

**TDD test file**: `src/__tests__/028-sbv-rates.test.ts`
Mock pattern:
```typescript
function makeTwoPageHttpClient(irHtml: string, fxHtml: string) {
  return {
    get: async (url: string): Promise<string> => {
      if (url.includes("/rm/ir")) return irHtml;
      if (url.includes("/fm/exchangerate")) return fxHtml;
      throw new Error(`Unexpected URL: ${url}`);
    },
  };
}
```

---

**Task FIX-081 — Fix SSE test timeout flakiness**

**Branch**: `task/fix-081-sse-timeout`
**Layer**: interface/test
**Depends on**: 081 ✅
**Agent**: Fixer (minimal change, no new features)

**Files to read first**:
- `src/__tests__/081-bun-mcp-server.test.ts` (identify the SSE fetch + afterAll teardown)

**Files to modify** (test setup only — no production code unless root-cause requires it):
- MODIFY: `src/__tests__/081-bun-mcp-server.test.ts`

**Three targeted changes**:
1. SSE abort timeout: `setTimeout(() => controller.abort(), 300)` → `setTimeout(() => controller.abort(), 2000)`
2. Test-level timeout: add `{ timeout: 10000 }` option to the SSE `it(...)` call (Bun test API)
3. afterAll guard: wrap `serverInstance.close()` in try/catch so a failed test that leaves `serverInstance` undefined does not cause a secondary teardown failure:
```typescript
afterAll(async () => {
  try {
    await serverInstance?.close();
  } catch {
    // ignore teardown errors
  }
});
```

**Acceptance Criteria**

**Given** `src/__tests__/081-bun-mcp-server.test.ts` intermittently times out on SSE transport startup
**When** FIX-081 is applied
**Then**
- `bun test src/__tests__/081-*.test.ts` passes 10 consecutive runs without any timeout failure
- Verify: `for i in $(seq 1 10); do bun test src/__tests__/081-bun-mcp-server.test.ts || break; done`
- No behaviour change to `src/interface/mcp/transport.ts` or `src/interface/mcp/server.ts`
- `bun test` full suite passes; `bun tsc --noEmit` 0 errors

---

#### Wave 2 — Run in parallel after Wave 1 merges (126 and 089 are independent of each other)

| # | Title | Branch | Agent | Layer | Depends on | Status |
|---|-------|--------|-------|-------|------------|--------|
| 126 | Macro cascade integration | `task/126-macro-cascade` | Developer | domain + application | 025 ✅, 028 ✅ | Backlog (Wave 1) |
| 089 | `get_macro_snapshot` MCP tool | `task/089-tool-macro` | Developer | interface | 025 ✅, 028 ✅, FIX-081 ✅ | Backlog (Wave 1) |

---

**Task 126 — Macro cascade integration**

**Branch**: `task/126-macro-cascade`
**Layer**: domain (cascadeEngine) + application (runImpactChain) + schema (bctc-schema.ts)
**Depends on**: 025 ✅, 028 ✅

**Files to read first**:
- `src/domain/services/cascadeEngine.ts` (buildCausalChain signature, CausalChainEntry type)
- `src/application/usecases/runImpactChain.ts` (RunCascadeInput interface, current pipeline steps)
- `bctc-schema.ts` (DomainType union — add `logistics` and `gold_mining` before `other`)
- `src/infrastructure/fetchers/yahooFinance.ts` (CommoditySnapshot interface — from task 025)
- `src/infrastructure/fetchers/sbv.ts` (SbvMacroSnapshot interface — from task 028)

**Files to create/modify**:
- CREATE: `src/__tests__/126-macro-cascade.test.ts` (12 scenario tests)
- MODIFY: `bctc-schema.ts` — add `'logistics'` and `'gold_mining'` to DomainType union (before `'other'`)
- MODIFY: `src/domain/services/cascadeEngine.ts` — add `MacroContext` interface, `MACRO_ADJUSTMENTS` constant, `applyMacroAdjustments()` helper, extend `buildCausalChain` signature with optional 4th param
- MODIFY: `src/application/usecases/runImpactChain.ts` — extend `RunCascadeInput` with `commodityFetcher?` + `sbvFetcher?`, add Step 0 (parallel macro fetch), pass `macroContext` as 4th arg to `buildCausalChain`

**DomainType patch** (must be committed in the same PR as cascadeEngine.ts):
```typescript
// bctc-schema.ts — add before 'other':
| 'logistics'    // NEW Sprint 008
| 'gold_mining'  // NEW Sprint 008
```

**MacroContext interface** (pure domain type, no infrastructure imports):
```typescript
export interface MacroContext {
  brentCrudeUSD: number | null;
  goldUSDPerOz: number | null;
  usdVndMarket: number | null;       // from CommoditySnapshot.usdVndRate
  refinancingRatePct: number | null;
  overnightRatePct: number | null;
  usdVndOfficial: number | null;
}
```

**MACRO_ADJUSTMENTS rules** (hardcoded domain constants):
- `brentCrudeUSD > 90` → `oil_gas`, `logistics`: `+0.10`; `aviation`: `−0.08`
- `brentCrudeUSD < 70` → `oil_gas`: `−0.10`; `aviation`: `+0.06`
- `goldUSDPerOz > 2000` → `gold_mining`: `+0.05`
- `refinancingRatePct > 6` → `banking`: `−0.08`; `real_estate`: `−0.10`
- `refinancingRatePct < 4` → `banking`: `+0.06`; `real_estate`: `+0.08`
- `usdVndMarket > 25500 || usdVndOfficial > 25500` → `aviation`: `−0.07`
- `usdVndMarket > 25500` → `steel`: `+0.05`

**applyMacroAdjustments** (internal pure helper):
- Modifies `CausalChainEntry[]` in-place; null MacroContext fields → rule silently skipped
- After summing all applicable deltas, clamps confidence to `[0.05, 0.99]`
- Annotates `entry.reasoning` with: `" [Macro: label=VALUE → DELTA domain]"`

**buildCausalChain extended signature** (optional 4th param — backwards compatible):
```typescript
export function buildCausalChain(
  seedEntry: AnalysisEntry,
  watchlist: WatchlistEntry[],
  ragResults?: SearchResult[],
  macroContext?: MacroContext | null,  // NEW — optional, omitting = pre-Sprint-008 behaviour
): CausalChain
```
Macro adjustment step inserted as Step 2b (after domain entries built, before action entries).

**RunCascadeInput extensions**:
```typescript
export interface RunCascadeInput {
  // existing fields unchanged ...
  commodityFetcher?: () => Promise<CommoditySnapshot | null>;  // NEW
  sbvFetcher?: () => Promise<SbvMacroSnapshot | null>;          // NEW
}
```
Default fetchers use dynamic import (same lazy-import pattern as `defaultRagRetriever`):
- `defaultCommodityFetcher`: dynamic imports `fetchYahooFinancePrices`, returns null on failure
- `defaultSbvFetcher`: dynamic imports `fetchSbvRates`, returns null on failure
- Both called in `Promise.all` in Step 0; each wrapped in try/catch
- `usdVndMarket` field mapped from `commodity?.usdVndRate ?? null`

**Acceptance Criteria**

**Given** `fetchYahooFinancePrices()` and `fetchSbvRates()` are available (025 ✅, 028 ✅) and injectable via `RunCascadeInput`
**When** `runImpactChain(input)` processes a news item with mocked fetchers
**Then**
- High Brent (> $90): oil_gas domain entry confidence boosted by `+0.10`; aviation entry reduced by `−0.08`
- Low Brent (< $70): oil_gas confidence reduced by `−0.10`; aviation confidence boosted by `+0.06`
- High gold (> $2000/oz): gold_mining confidence boosted by `+0.05`
- High refi rate (> 6%): banking confidence `−0.08`, real_estate confidence `−0.10`
- Low refi rate (< 4%): banking confidence `+0.06`, real_estate confidence `+0.08`
- Null `MacroContext`: zero adjustments — confidence identical to pre-macro baseline
- Fetcher throws: chain still completes with zero macro adjustment, warning logged (never throws to caller)
- Confidence clamped to `[0.05, 0.99]` even on extreme macro values (e.g. brent=$200)
- Reasoning annotation present: `entry.reasoning` contains `"[Macro: brentCrudeUSD=..."` when rule fires
- `runImpactChain` passes `macroContext` to `buildCausalChain` (verify via injected mock fetchers in RunCascadeInput)
- `DomainType` in `bctc-schema.ts` includes `'logistics'` and `'gold_mining'` — `bun tsc --noEmit` 0 errors
- `bun test src/__tests__/126-*.test.ts` passes with mocked fetchers; no real network calls
- `bun tsc --noEmit` 0 errors

**TDD test file**: `src/__tests__/126-macro-cascade.test.ts`
Inject mocked fetchers via `RunCascadeInput.commodityFetcher` and `RunCascadeInput.sbvFetcher`. Use a minimal watchlist with at least one `oil_gas` stock and one `banking` stock.

---

**Task 089 — `get_macro_snapshot` MCP tool**

**Branch**: `task/089-tool-macro`
**Layer**: interface
**Depends on**: 025 ✅, 028 ✅, FIX-081 ✅

**Files to read first**:
- `src/interface/mcp/tools/marketTools.ts` (follow this pattern for registerXxxTools + tool handler)
- `src/interface/mcp/server.ts` (find the `registerMarketTools` call — add `registerMacroTools` after it)
- `src/interface/mcp/tools/index.ts` (barrel export to update)
- `src/infrastructure/fetchers/yahooFinance.ts` (CommoditySnapshot — from task 025)
- `src/infrastructure/fetchers/sbv.ts` (SbvMacroSnapshot — from task 028)

**Files to create/modify**:
- CREATE: `src/interface/mcp/tools/macroTools.ts`
- CREATE: `src/__tests__/089-tool-macro.test.ts` (8 test scenarios)
- MODIFY: `src/interface/mcp/server.ts` — add `registerMacroTools(mcpServer)` after `registerMarketTools` (toolCount 16 → 17)
- MODIFY: `src/interface/mcp/tools/index.ts` — add `export { registerMacroTools } from "./macroTools.js"`

**Interface to implement**:
```typescript
// import types only — actual function calls via dynamic import or direct call
import type { CommoditySnapshot } from "../../../infrastructure/fetchers/yahooFinance.js";
import type { SbvMacroSnapshot } from "../../../infrastructure/fetchers/sbv.js";

interface MacroSnapshotResponse {
  commodity: CommoditySnapshot | null;
  rates: SbvMacroSnapshot | null;
  fetchedAt: string;
}

export function registerMacroTools(server: McpServer): void
```

**Tool: `get_macro_snapshot`**
- Input schema (Zod): `{ _testCommodityClient: z.any().optional(), _testSbvClient: z.any().optional() }`
- Calls `fetchYahooFinancePrices(_testCommodityClient)` and `fetchSbvRates(_testSbvClient)` in parallel via `Promise.all`
- Each call error-isolated with `.catch(() => null)`
- Output: formatted plain-text content (type: "text")

Output format:
```
=== Macro Snapshot ===
Generated: <ISO timestamp>

[Commodity Prices]
  Brent Crude:  84.37 USD/bbl
  Gold:        2341.50 USD/oz
  USD/VND:   25,450.00

[SBV Central Bank Rates]
  Overnight Rate:    5.00%
  Refinancing Rate:  4.50%
  USD/VND Official: 25,452.00

[Macro Signal Summary]
  Energy sector:       neutral (brent $84.37 — below $90 threshold)
  Gold sector:         neutral (gold < $2000)
  Banking/Real Estate: neutral (refi rate 4.50% — below 6% threshold)
  Currency pressure:   LOW (USD/VND 25450 — below 25500 threshold)
```

Macro Signal Summary rules (mirror MACRO_ADJUSTMENTS for display only):
- `brentCrudeUSD > 90`: `"HIGH OIL (>$90) — cascade +0.10 oil_gas confidence"`
- `brentCrudeUSD < 70`: `"LOW OIL (<$70) — cascade -0.10 oil_gas confidence"`
- Otherwise: `"neutral (brent $X.XX — below $90 threshold)"`
- `goldUSDPerOz > 2000`: `"HIGH GOLD (>$2000) — cascade +0.05 gold_mining confidence"`
- Otherwise: `"neutral (gold < $2000)"`
- `refinancingRatePct > 6`: `"TIGHT POLICY (>6%) — cascade -0.08 banking, -0.10 real_estate"`
- `refinancingRatePct < 4`: `"LOOSE POLICY (<4%) — cascade +0.06 banking, +0.08 real_estate"`
- Otherwise: `"neutral (refi rate X% — below 6% threshold)"`
- `usdVndMarket > 25500 || usdVndOfficial > 25500`: `"HIGH (USD/VND X — above 25500 threshold) — cascade -0.07 aviation, +0.05 steel"`
- Otherwise: `"LOW (USD/VND X — below 25500 threshold)"`

**Acceptance Criteria**

**Given** Yahoo Finance and SBV fetchers are available (025 ✅, 028 ✅) and injectable via Zod `_testCommodityClient` / `_testSbvClient`
**When** Claude calls the `get_macro_snapshot` MCP tool
**Then**
- Happy path: output text contains all three sections `"[Commodity Prices]"`, `"[SBV Central Bank Rates]"`, `"[Macro Signal Summary]"`
- Commodity fetcher fails: commodity section shows N/A values; rates section still present and populated
- SBV fetcher fails: rates section shows N/A values; commodity section still present and populated
- Both fetchers fail: returns error-friendly text (no throw, no crash)
- Tool is registered with name `"get_macro_snapshot"` in McpServer
- Tool count = 17 after `registerMacroTools` (assert `toolCount >= 17` or check tool name presence)
- High Brent (> $90): Macro Signal Summary line contains `"HIGH OIL (>$90)"`
- High refi rate (> 6%): Macro Signal Summary line contains `"TIGHT POLICY (>6%)"`
- `bun test src/__tests__/089-*.test.ts` passes with mocked fetchers; no real network calls
- `bun tsc --noEmit` 0 errors

**TDD test file**: `src/__tests__/089-tool-macro.test.ts`

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
| ~~024~~ | ~~Trading Economics scraper~~ | ~~`task/024-scraper-trading-economics`~~ | ~~infra~~ | ~~003 ✅~~ |
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

*(022, 023 promoted to Sprint 004; 026 promoted to Sprint 005 Todo; 025, 028 promoted to Sprint 007 Todo → carried into Sprint 008)*

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| ~~024~~ | ~~Trading Economics scraper~~ | ~~`task/024-scraper-trading-economics`~~ | ~~infra~~ | ~~003 ✅~~ | ~~Done — merged 2026-03-28~~ |
| ~~025~~ | ~~Yahoo Finance commodity fetcher~~ | ~~`task/025-yahoo-finance`~~ | ~~infra~~ | ~~003 ✅~~ | ~~Promoted to Sprint 007 Todo → carried into Sprint 008~~ |
| ~~028~~ | ~~SBV (State Bank Vietnam) macro fetcher~~ | ~~`task/028-sbv-macro`~~ | ~~infra~~ | ~~003 ✅~~ | ~~Promoted to Sprint 007 Todo → carried into Sprint 008~~ |

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

### 🧪 Tests (121–139)

| # | Title | Branch | Layer | Depends on | Acceptance Criteria |
|---|-------|--------|-------|------------|---------------------|
| 121 | Unit tests — BCTC parser (Vietnamese edge cases) | `task/121-test-bctc-edge-cases` | test | 042-047 | 20+ edge cases: parentheses negatives, missing fields, image-only PDF, corrupt PDF | **Done** — merged to main 2026-03-28; 36 tests pass (P-01–P-15, B-01–B-08, I-01–I-08, C-01–C-05), tsc 0 errors |
| ~~122~~ | ~~Unit tests — domain services~~ | ~~`task/122-test-domain-services`~~ | ~~test~~ | ~~061-066~~ | ~~Done — 78 tests, 4 services ≥90% branch coverage; merged 2026-03-28~~ |
| 123 | Integration tests — MCP tools with real SQLite | `task/123-test-integration-mcp` | test | 082-086, 084 ✅ | Full tool call roundtrip: add watchlist → fetch news → generate alert → get alert. **UNBLOCKED — ready for Wave 3** |
| 124 | Integration tests — SSC pipeline (mock HTTP) | `task/124-test-ssc-pipeline` | test | 048 | Mock SSC HTML + PDF; verify full parse → store → embed pipeline — **Done** — 17 tests pass (SSC-01–SSC-12 + 5 extra); tsc 0 errors; merged 2026-03-28 |
| 125 | E2E test — daily briefing flow | `task/125-test-e2e-briefing` | test | 101-105 | Full daily briefing: trigger → fetch → analyze → alert → report; assert final output structure | **Done** — 39 tests pass (13 sections: DailyBriefing structure, full pipeline, topStories, alerts, watchlistSummary, newReports, vnIndex, macro indicators Task-024, graceful degradation, file persistence, evening summary, bookend E2E, concurrency guards); tsc 0 errors; merged 2026-03-28 |

---

## Kanban Summary

| Column | Count | Tasks |
|--------|-------|-------|
| ✅ Done | 50 | 000, 001, 002, 003, 011, 012, 013, 014, 021, 022, 023, 024, 026, 027, 029, 030, 041, 042, 043, 044, 045, 046, 047, 048, 061, 062, 063, 064, 065, 066, 081, 082, 083, 084, 085, 086, 087, 088, 101, 102, 103, 104, 105, 121, 122, 123, 124, 125, DOC-001 |
| 🔍 Review | 0 | — |
| 🚧 In Progress | 0 | — |
| 📋 Todo | 5 | Sprint 008: 025, 028, FIX-081, 126 (blocked), 089 (blocked) |
| 🗂 Backlog | 0 | — |
| **Total** | **58** | |

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
