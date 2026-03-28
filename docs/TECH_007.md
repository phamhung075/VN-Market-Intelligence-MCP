# TECH-007: Sprint 007 — Hardening Sprint (Test Coverage, Doc Fix, Macro Fetcher)

status: APPROVED_BY_ARCHITECT
req_ref: REQ-007

---

## Brownfield Impact

### Files modified

| File | Reason |
|------|--------|
| `CLAUDE.md` | DOC-001: replace stale flat-layout tree with real DDD tree; update Done/Pending lists |
| `src/infrastructure/db/schema.ts` | Task 024: add `macro_indicators` table DDL inside `initDatabase()` |

### Files created

| File | Task |
|------|------|
| `src/infrastructure/fetchers/tradingEconomics.ts` | 024 |
| `src/__tests__/121-test-bctc-edge-cases.test.ts` | 121 |
| `src/__tests__/122-test-domain-services.test.ts` | 122 |
| `src/__tests__/124-test-ssc-pipeline.test.ts` | 124 |
| `src/__tests__/125-test-e2e-briefing.test.ts` | 125 |

### Breaking changes

None. `CLAUDE.md` is documentation-only. The `macro_indicators` DDL is additive — `CREATE TABLE IF NOT EXISTS` does not affect existing tables. No existing exports are removed or renamed.

---

## Architecture Decision

Five of the six tasks are test-only work that exercises code already on `main`. They follow the established TDD pattern (`src/__tests__/NNN-*.test.ts`, Bun test APIs, in-memory SQLite). The single production file added by task 024 (`tradingEconomics.ts`) slots directly into `src/infrastructure/fetchers/` alongside the identical `ssc.ts` / `hose.ts` / `hnx.ts` pattern: injectable `HttpClient`, `cheerio` parsing, `null`-safe return, `storeMacroIndicators()` for SQLite persistence. No new domain model is required because `MacroIndicators` is a plain data object, not a domain entity — it belongs in the infrastructure layer as a fetcher-local type (or in `src/domain/models/index.ts` if the cascade engine needs to import it in Sprint 008; deferred decision).

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| CLAUDE.md doc update | N/A (documentation) | `CLAUDE.md` | MODIFY |
| `macro_indicators` DDL | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| `fetchMacroIndicators` + `storeMacroIndicators` | infrastructure | `src/infrastructure/fetchers/tradingEconomics.ts` | NEW |
| BCTC edge-case tests | test | `src/__tests__/121-test-bctc-edge-cases.test.ts` | NEW |
| Domain services branch-coverage tests | test | `src/__tests__/122-test-domain-services.test.ts` | NEW |
| SSC pipeline integration tests | test | `src/__tests__/124-test-ssc-pipeline.test.ts` | NEW |
| E2E daily briefing tests | test | `src/__tests__/125-test-e2e-briefing.test.ts` | NEW |

---

## Task-by-Task Specification

---

### DOC-001 — CLAUDE.md Architecture Update

**DDD layer:** N/A (documentation)
**File modified:** `CLAUDE.md`

**Change surface:**

1. Replace the `Architecture summary` code block. The new tree must show:
   ```
   src/
   ├── index.ts                    ← Bun HTTP server entry point
   ├── domain/
   │   ├── models/                 ← FinancialReport, Alert, AnalysisEntry
   │   ├── repositories/           ← Interfaces (ports)
   │   └── services/               ← vnNumberParser, extractors, cascade, signals, alerts
   ├── infrastructure/
   │   ├── config.ts
   │   ├── logger.ts
   │   ├── db/                     ← SQLite schema + stores
   │   ├── fetchers/               ← HTTP fetchers (ssc, pdf, hose, hnx, cafef, rss, reuters)
   │   └── rag/                    ← embeddings, vectorstore, retriever
   ├── application/
   │   └── usecases/               ← orchestration use cases
   ├── interface/
   │   ├── mcp/                    ← MCP server + all tool registrations
   │   └── scheduler/              ← scheduler index
   └── scheduler/                  ← cron job implementations
   ```
2. Remove every reference to `src/server.ts` and `src/tools/`.
3. Update "Done" list to include all 43 tasks (000–123, matching TASKS.md Done section as of Sprint 006 COMPLETE).
4. Update "Pending" list to exactly: 024, 025, 028, 121, 122, 124, 125.

**Acceptance check:** `grep -r "src/server.ts\|src/tools/" CLAUDE.md` returns zero matches.

---

### Task 121 — BCTC Parser Edge Cases

**DDD layer:** test (exercises `src/domain/services/`)
**File created:** `src/__tests__/121-test-bctc-edge-cases.test.ts`

**Imports required:**
```typescript
import { parseVnNumber } from "../domain/services/vnNumberParser.js";
import { extractBalanceSheet } from "../domain/services/balanceSheetExtractor.js";
import { extractIncomeStatement } from "../domain/services/incomeStatementExtractor.js";
import { extractCashFlow } from "../domain/services/cashFlowExtractor.js";
import { describe, it, expect } from "bun:test";
```

**Test structure:** four `describe` blocks — `parseVnNumber`, `extractBalanceSheet`, `extractIncomeStatement`, `extractCashFlow`. Each `it()` is independent with inline string fixtures; no I/O.

**Minimum test count:** 36 defined in REQ-007 (P-01–P-15, B-01–B-08, I-01–I-08, C-01–C-05) plus the suffix edge case from the Edge Cases section.

**Critical implementation notes for Developer:**

- `parseVnNumber("()")`: after `slice(1,-1).trim()` the inner string is `""`. The empty-string guard at the top only fires before parenthesis stripping. After stripping, the inner value `""` will reach `Number("")` which is `0`, not `NaN`. Developer must trace the actual code path: `s = "".trim()` → `s === ""` check at top → NOT triggered because we are past that point. `Number("")` returns `0`. Then `isNaN(0) || s === ""` → `s === ""` is `true` → returns `null`. So `"()"` does return `null` — test P-14 is correct.

- `parseVnNumber("( )")`: inner string after `slice(1,-1)` is `" "`, after `.trim()` is `""`. Same code path as above → returns `null`. The `( )` note in REQ-007 is confirmed.

- For `extractBalanceSheet` fallback tests (B-02, B-03): the Developer must read the actual fallback guard conditions in `balanceSheetExtractor.ts` to write precise fixture text. The fixture must omit the line containing the total keyword while providing lines that match the sub-total keywords.

- For `extractIncomeStatement` I-03 guard (`netRevenue > 0`): fixture must include `netRevenue = 0` (line present but value is `0`) — not simply an absent line.

---

### Task 122 — Domain Services Branch Coverage

**DDD layer:** test (exercises `src/domain/services/`)
**File created:** `src/__tests__/122-test-domain-services.test.ts`

**Imports required:**
```typescript
import { detectSignals } from "../domain/services/signalDetector.js";
import { generateAlerts } from "../domain/services/alertGenerator.js";
import { buildImpactChain } from "../domain/services/cascadeEngine.js";
import { normalizeNewsItem } from "../domain/services/newsNormalizer.js";
import { describe, it, expect } from "bun:test";
```

**Test structure:** four `describe` blocks matching the four services. Total: 62 test cases (SD-01–SD-22, AG-01–AG-12, CE-01–CE-18, NN-01–NN-10).

**Critical implementation notes for Developer:**

- SD-14 (`latestReportDate` within 24 h): use `new Date().toISOString()` as the value so the test is time-independent. SD-15 (old report): use `"2020-01-01T00:00:00.000Z"` as a safe past value.

- SD-08/SD-09 (custom threshold overrides): check the actual `SignalContext.watchlistThresholds` field shape in `signalDetector.ts` before writing the fixture. The interface has `dropPct` and `risePct` fields.

- CE-01 (first-match-wins): the Developer must read `SECTOR_RULES` in `cascadeEngine.ts` to find a domain that has two entries. If no domain has two rules, CE-01 must be adapted to test the actual first-match behavior with two different domains rather than two rules for the same domain.

- CE-09 (`ragResults` is `undefined`): the `buildImpactChain` function signature must accept `ragResults?: AnalysisEntry[]`. If the current signature requires a non-undefined value, the Developer should pass an empty array instead and adjust CE-09 to test `[]` (which aligns with CE-10).

- NN-09 (`extractStockTickers` not in `KNOWN_VN_STOCKS`): the Developer must check whether `KNOWN_VN_STOCKS` is exported from `newsNormalizer.ts` — it may be an internal constant. The test fixture should use a ticker that is definitively not in the list (e.g. `"ZZZZZ"`).

**Coverage requirement:** after running `bun test --coverage src/__tests__/122-test-domain-services.test.ts`, branch coverage for each of `signalDetector.ts`, `alertGenerator.ts`, `cascadeEngine.ts` must be ≥90%.

---

### Task 124 — SSC Pipeline Integration Tests

**DDD layer:** test (exercises `application/usecases/fetchParseAndStoreBctc` + `infrastructure/fetchers/ssc` + `infrastructure/db`)
**File created:** `src/__tests__/124-test-ssc-pipeline.test.ts`

**Imports required:**
```typescript
import { Database } from "bun:sqlite";
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { initDatabase } from "../infrastructure/db/schema.js";
import { fetchParseAndStoreBctc } from "../application/usecases/fetchParseAndStoreBctc.js";
import { buildSscSearchUrl, parseSscHtml } from "../infrastructure/fetchers/ssc.js";
import type { HttpClient } from "../infrastructure/fetchers/ssc.js";
```

**Mock SSC HTML fixture** (inline constant, reused across SSC-01–SSC-07):
```html
<table class="tbl-data">
  <tbody>
    <tr>
      <td><a href="/report/VCB-Q1-2025.pdf">BCTC Quý I 2025 - VCB</a></td>
      <td>15/04/2025</td>
    </tr>
  </tbody>
</table>
```

**Mock PDF text fixture** (minimal valid BCTC text with at least one `P_NET_REVENUE` and one `P_TOTAL_ASSETS` match): the Developer must read `incomeStatementExtractor.ts` and `balanceSheetExtractor.ts` to identify the exact regex patterns, then craft a fixture string that satisfies at least those two line patterns. A safe minimum:
```
Doanh thu thuần  1.000.000
Tổng tài sản     5.000.000
```

**DB setup pattern** — each test uses a fresh in-memory DB passed via `DB_PATH` override or direct injection. Since `fetchParseAndStoreBctc` itself calls `parseBctcReport` which calls `getDb()` internally, the DB must be accessible via the singleton. Use `Bun.env["DB_PATH"] = ":memory:"` in `beforeEach` combined with `closeDb()` from `schema.ts` to reset the singleton between tests.

**SSC-08 dedup behavior note:** the pipeline does not deduplicate at the use-case level (confirmed by reading `fetchParseAndStoreBctc.ts` — no `INSERT OR IGNORE` guard on `financial_reports`). The test must assert the actual row count (likely 2 after two calls) and document this as expected behavior.

**SSC-11 `buildSscSearchUrl` test:** this is a pure function — no DB, no mock needed.
```typescript
it("SSC-11: buildSscSearchUrl produces correct params", () => {
  const url = buildSscSearchUrl("VCB", 2025);
  expect(url).toContain("keyword=VCB");
  expect(url).toContain("type=BCTC");
  expect(url).toContain("year=2025");
});
```

---

### Task 024 — Trading Economics Macro Fetcher

**DDD layer:** infrastructure
**File created:** `src/infrastructure/fetchers/tradingEconomics.ts`
**File modified:** `src/infrastructure/db/schema.ts`

#### Interface contracts

```typescript
// src/infrastructure/fetchers/tradingEconomics.ts

export interface MacroIndicators {
  country: string;          // e.g. "vietnam"
  cpi: number | null;       // "Inflation Rate" row value
  gdpGrowth: number | null; // "GDP Growth Rate" row value
  interestRate: number | null; // "Interest Rate" row value
  fetchedAt: string;        // ISO 8601
}

/**
 * Scrapes the Trading Economics Vietnam indicators page.
 *
 * @param httpClient - Injectable HTTP client (defaults to axios-backed client).
 *                     Inject mock for tests. Reads TRADING_ECONOMICS_BASE_URL
 *                     env var to override the base URL.
 * @returns MacroIndicators — never throws; null fields on parse/HTTP failure.
 */
export async function fetchMacroIndicators(
  httpClient?: HttpClient,
): Promise<MacroIndicators>

/**
 * Upserts macro indicators into the macro_indicators SQLite table.
 *
 * @param indicators - Data to persist.
 * @param db         - Optional database instance (defaults to getDb()).
 */
export function storeMacroIndicators(
  indicators: MacroIndicators,
  db?: Database,
): void
```

The `HttpClient` interface is re-used from `src/infrastructure/fetchers/ssc.ts` — import the type, do not redeclare it.

#### HTML scraping target

URL: `https://tradingeconomics.com/vietnam/indicators` (overridable via `Bun.env["TRADING_ECONOMICS_BASE_URL"]`).

The Trading Economics indicators page renders an HTML table. The selector strategy uses `cheerio` to find table rows containing the indicator name in text. The exact CSS class structure of the live page as of Q1 2026 must be verified at implementation time. The fallback strategy is:

1. Look for `<td>` cells whose text content exactly or partially matches the indicator labels ("Inflation Rate", "GDP Growth Rate", "Interest Rate").
2. The numeric value is the immediately following sibling `<td>` (or the `<td>` in the same `<tr>` that contains a bare decimal number).
3. Strip `%` suffix; call `parseFloat()`; if `NaN`, set to `null`.

This is intentionally flexible so the Developer can adapt to the actual page structure without re-architecting. The `TRADING_ECONOMICS_BASE_URL` env override guarantees the mock-HTTP test never touches the live site.

#### SQLite DDL (add inside `initDatabase()`)

```sql
CREATE TABLE IF NOT EXISTS macro_indicators (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  country       TEXT NOT NULL,
  cpi           REAL,
  gdp_growth    REAL,
  interest_rate REAL,
  fetched_at    TEXT NOT NULL,
  UNIQUE(country)
);
```

Placement in `initDatabase()`: after the `financial_reports` DDL block, before the closing `}`.

#### Storage implementation

```typescript
// INSERT OR REPLACE INTO macro_indicators
// (country, cpi, gdp_growth, interest_rate, fetched_at)
// VALUES (?, ?, ?, ?, ?)
```

`INSERT OR REPLACE` handles the `UNIQUE(country)` constraint as an upsert.

#### Error isolation

Each of the three indicator parse operations must be wrapped independently so a failure on one does not set the others to `null`. Pattern:

```typescript
function parseIndicatorValue(html: string, label: string): number | null {
  try {
    // cheerio lookup for label → adjacent value cell
    // parseFloat(); return null if NaN
  } catch {
    return null;
  }
}
```

#### Test file

`src/__tests__/024-test-trading-economics.test.ts` — 8 test cases (TE-01–TE-08) per REQ-007. Uses mocked `HttpClient`; no real network calls.

---

### Task 125 — E2E Daily Briefing Tests

**DDD layer:** test (exercises `application/usecases/assembleBriefing` + `assembleEveningSummary` + `infrastructure/db` + file system)
**File created:** `src/__tests__/125-test-e2e-briefing.test.ts`

**Imports required:**
```typescript
import { Database } from "bun:sqlite";
import { describe, it, expect, mock, beforeEach } from "bun:test";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import { assembleBriefing } from "../application/usecases/assembleBriefing.js";
import { assembleEveningSummary } from "../application/usecases/assembleEveningSummary.js";
```

**DB setup:** each test creates a fresh `Database(":memory:")`, sets `Bun.env["DB_PATH"] = ":memory:"`, calls `closeDb()` to reset the singleton, then calls `initDatabase()` to build tables. This ensures `macro_indicators` table exists for E2E-13 (depends on task 024 being merged first).

**Temp dir setup:** each test creates a unique subdirectory under `os.tmpdir()` and cleans it up in `afterEach`.

**E2E-09 time-sensitive alert filter:** the `assembleBriefing` query uses `triggered_at >= since12h` where `since12h = new Date(Date.now() - 12 * 3600_000).toISOString()`. To seed an "old" alert (24 h ago), insert a row with `triggered_at = new Date(Date.now() - 24 * 3600_000).toISOString()`. To seed a "recent" alert, use `new Date().toISOString()`.

**E2E-13 `macroContext` field note:** `assembleEveningSummary` does not currently query `macro_indicators`. The E2E-13 test exercises `assembleEveningSummary` after task 024 adds the table. If the `EveningSummary` type does not include a `macroContext` field, the Developer must add the field and the corresponding DB query to `assembleEveningSummary.ts` as part of task 125. This is a small production modification scoped within task 125.

**E2E-14 `midnightVietnamAsUtc()` test:** `midnightVietnamAsUtc()` is an unexported private helper. Test it indirectly via `assembleBriefing` by seeding one `rag_analyses` row with `created_at` = current midnight boundary minus 1 second (outside window) and one row with `created_at` = current midnight boundary plus 1 second (inside window). Assert `topStories.length == 1`.

**`DailyBriefing` shape assertion helper** — all tests calling `assembleBriefing()` must run this check:

```typescript
function assertDailyBriefingShape(b: unknown): void {
  expect(b).toHaveProperty("date");
  expect(b).toHaveProperty("topStories");
  expect(b).toHaveProperty("alerts");
  expect(b).toHaveProperty("watchlistSummary");
  expect(b).toHaveProperty("newReports");
  expect(b).toHaveProperty("generatedAt");
  expect(Array.isArray((b as any).topStories)).toBe(true);
  expect(Array.isArray((b as any).alerts)).toBe(true);
}
```

---

## Interface Contracts Summary

### New exported types (task 024)

```typescript
// src/infrastructure/fetchers/tradingEconomics.ts
export interface MacroIndicators {
  country: string;
  cpi: number | null;
  gdpGrowth: number | null;
  interestRate: number | null;
  fetchedAt: string;
}
export async function fetchMacroIndicators(httpClient?: HttpClient): Promise<MacroIndicators>
export function storeMacroIndicators(indicators: MacroIndicators, db?: Database): void
```

### Modified function signatures (task 125 only if macroContext needed)

```typescript
// src/application/usecases/assembleEveningSummary.ts — if macroContext required
export interface EveningSummary {
  // ... existing fields ...
  macroContext?: MacroIndicators | null;  // NEW — from macro_indicators table
}
```

This modification is conditional: only make it if REQ-007 E2E-13 cannot be satisfied by an existing field. Confirm against the actual `EveningSummary` interface before modifying.

---

## Task Breakdown (for PM)

Execution waves — all wave-1 tasks are independent of each other:

| Wave | Task | Title | Depends on | Branch |
|------|------|-------|------------|--------|
| 1 | DOC-001 | CLAUDE.md update | — | `task/doc-001-claude-md-update` |
| 1 | 121 | BCTC edge-case tests | 042–047 ✅ | `task/121-bctc-edge-cases` |
| 1 | 122 | Domain services coverage | 061–066 ✅ | `task/122-domain-services-coverage` |
| 1 | 124 | SSC pipeline integration | 048 ✅ | `task/124-ssc-pipeline-integration` |
| 1 | 024 | Trading Economics scraper | 003 ✅ | `task/024-trading-economics` |
| 2 | 125 | E2E daily briefing | 101–105 ✅, 024 | `task/125-e2e-briefing` |

Task 125 must start only after task 024 is merged (it requires the `macro_indicators` table and E2E-13).

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Trading Economics page HTML structure differs from assumed | High | Medium | `TRADING_ECONOMICS_BASE_URL` env var decouples tests from live site; mock HTML in tests can be tailored to actual structure at implementation time |
| `parseVnNumber("()")` behavior misread | Low | Low | Trace through the actual code: inner `""` hits `s === ""` inside `isNaN(result) || s === ""` guard → returns `null` — confirmed correct |
| `cascadeEngine.ts` `buildImpactChain` signature does not accept optional `ragResults` | Medium | Low | Developer adapts CE-09/CE-10 to use `[]` rather than `undefined`; no production change needed |
| `EveningSummary` missing `macroContext` field blocks E2E-13 | Medium | Low | Task 125 owns this small production addition to `assembleEveningSummary.ts` |
| In-memory SQLite singleton leaks between tests in task 124/125 | Medium | High | Mandatory `closeDb()` + `Bun.env["DB_PATH"] = ":memory:"` pattern in every `beforeEach`; each test gets a fresh DB |
| BCTC fixture text regex mismatch (124 `pdfTextOverride`) | Medium | Medium | Developer reads actual `P_NET_REVENUE` / `P_TOTAL_ASSETS` regex patterns from the extractor source before writing the fixture |
| `midnightVietnamAsUtc()` timezone flakiness (E2E-14) | Low | Medium | Use relative time seeds (`Date.now() ± offset`) rather than hardcoded strings; test boundary is always relative to current clock |

---

## Security Review

- SQL parameterized? Yes — all existing queries use `?` placeholders; task 024 `storeMacroIndicators` must also use `?` (INSERT OR REPLACE INTO ... VALUES (?, ?, ?, ?, ?))
- File paths validated (no `../`)? N/A — task 024 writes no files; DOC-001 is manual edit; test tasks write only to `os.tmpdir()` sub-paths
- External HTTP rate-limited? The Trading Economics fetcher is called once per evening job invocation (not in a loop); no rate-limit concern at current scale
- Secrets via `Bun.env` only? Yes — `TRADING_ECONOMICS_BASE_URL` follows the existing `Bun.env["KEY"]` pattern from `src/infrastructure/config.ts`
