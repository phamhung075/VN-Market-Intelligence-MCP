# TECH-006: Sprint 006 — Analytical Depth Layer

status: APPROVED_BY_ARCHITECT
req_ref: REQ-006

---

## Brownfield Impact

### Files modified

| File | Reason |
|------|--------|
| `src/application/usecases/index.ts` | Add barrel exports for 065, 066, 105 |
| `src/infrastructure/db/schema.ts` | Add `exchange` column migration guard (027), `ai_analysis` column guard (066) |
| `src/interface/mcp/tools/index.ts` | Add `registerMarketTools` export |
| `src/interface/mcp/server.ts` | Import + call `registerMarketTools` (084) |
| `src/scheduler/jobs.ts` | Import + wire `scheduleEveningSummaryJob` at `0 22 * * 1-5` (105) |

### Files created

| File | Task |
|------|------|
| `src/application/usecases/getPatternSummary.ts` | 065 |
| `src/application/usecases/generateAiSummary.ts` | 066 |
| `src/infrastructure/fetchers/hnx.ts` | 027 |
| `src/application/usecases/assembleEveningSummary.ts` | 105 |
| `src/scheduler/eveningSummaryJob.ts` | 105 |
| `src/interface/mcp/tools/marketTools.ts` | 084 |
| `src/__tests__/123-integration-mcp-tools.test.ts` | 123 |

### Breaking changes

None. All new files. Schema modifications are additive-only (`ALTER TABLE ADD COLUMN`). The `market_prices` and `market_prices_history` tables gain an `exchange TEXT` column with `DEFAULT 'HOSE'` — existing HOSE rows remain valid.

---

## Architecture Decision

All six tasks fit cleanly into the existing DDD layer structure without new abstractions. Tasks 065 and 066 extend the application layer with pure orchestration use cases. Task 027 mirrors the established `hose.ts` infrastructure fetcher pattern exactly. Task 105 mirrors `assembleBriefing.ts` and `morningBriefingJob.ts` patterns for the evening slot. Task 084 follows the `registerAnalysisTools` interface pattern. Task 123 is a cross-cutting integration test that uses the real SQLite singleton, matching the project's TDD contract.

The `search_similar_context` tool must NOT be re-registered in `marketTools.ts` — it is already owned by `analysis.ts` (task 083). `marketTools.ts` exports only two new tools: `get_market_snapshot` and `get_patterns`.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| `getPatternSummary` use case | application | `src/application/usecases/getPatternSummary.ts` | NEW |
| `generateAiSummary` use case | application | `src/application/usecases/generateAiSummary.ts` | NEW |
| `assembleEveningSummary` use case | application | `src/application/usecases/assembleEveningSummary.ts` | NEW |
| application barrel export | application | `src/application/usecases/index.ts` | MODIFY |
| HNX + UPCOM fetcher | infrastructure | `src/infrastructure/fetchers/hnx.ts` | NEW |
| SQLite schema migrations (exchange + ai_analysis) | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| Market MCP tools (snapshot + patterns) | interface/mcp | `src/interface/mcp/tools/marketTools.ts` | NEW |
| MCP tools barrel | interface/mcp | `src/interface/mcp/tools/index.ts` | MODIFY |
| MCP server wiring | interface/mcp | `src/interface/mcp/server.ts` | MODIFY |
| Evening summary cron job | interface/scheduler | `src/scheduler/eveningSummaryJob.ts` | NEW |
| Scheduler job registry | interface/scheduler | `src/scheduler/jobs.ts` | MODIFY |
| Integration tests | test | `src/__tests__/123-integration-mcp-tools.test.ts` | NEW |

---

## Interface Contracts

### Task 065 — `src/application/usecases/getPatternSummary.ts`

```typescript
import type { Database } from "bun:sqlite";

export interface Precedent {
  date: string;                            // ISO timestamp from created_at
  headline: string;                        // source_title
  impactScore: number;                     // impact_score 0–10
  impactDirection: "up" | "down" | "neutral";
}

export interface PatternSummary {
  stockCode: string;
  eventKeyword: string;
  precedents: Precedent[];
  avgImpactPct: number;
  dominantDirection: "up" | "down" | "neutral";
  lookbackHours: number;
  generatedAt: string;                     // ISO timestamp
}

/**
 * Query rag_analyses for historical precedents of an event affecting a stock.
 *
 * Returns null (never throws) when zero precedents are found.
 * Applies LIMIT 100 — uses the 100 most recent precedents only.
 *
 * @param stockCode      Stock ticker, e.g. "GAS"
 * @param eventKeyword   Event text to match in source_title or summary
 * @param lookbackHours  Hours to look back (default 168 = 1 week; 0 = no limit)
 * @param db             SQLite instance; defaults to getDb() if omitted
 */
export async function getPatternSummary(
  stockCode: string,
  eventKeyword: string,
  lookbackHours?: number,
  db?: Database,
): Promise<PatternSummary | null>
```

**SQLite query pattern** (parameterised — no string interpolation):

```sql
SELECT id, created_at, source_title, impact_score, impact_direction
FROM rag_analyses
WHERE created_at >= ?
  AND affected_actions LIKE ?       -- '%"STOCKCODE"%' with quotes
  AND (source_title LIKE ? OR summary LIKE ?)  -- '%keyword%'
ORDER BY created_at DESC
LIMIT 100
```

When `lookbackHours === 0`, pass `'1970-01-01T00:00:00.000Z'` as the lower bound (effectively no time filter).

`dominantDirection` tie-break: `up` > `neutral` > `down`.

---

### Task 066 — `src/application/usecases/generateAiSummary.ts`

```typescript
import type { Database } from "bun:sqlite";
import type { FinancialReport, AIAnalysis } from "../../../bctc-schema.js";

export interface GenerateAiSummaryOptions {
  db?: Database;
}

/**
 * Rule-based BCTC analysis. No LLM calls.
 *
 * Steps:
 *   1. detectFinancialSignals(report)    — pure, no I/O
 *   2. deriveOutlook(signals)            — pure, no I/O
 *   3. buildStrengthsWeaknesses(signals, report) — pure, no I/O
 *   4. buildSummaryNarrative(report, signals, outlook) — pure, no I/O
 *   5. updateFinancialReportAiAnalysis(report.id, aiAnalysis, db) — SQLite write
 *   6. Return AIAnalysis
 *
 * @param report   Fully populated FinancialReport
 * @param options  Optional db injection for tests
 */
export async function generateAiSummary(
  report: FinancialReport,
  options?: GenerateAiSummaryOptions,
): Promise<AIAnalysis>
```

**Internal helpers** (module-private, exported for unit tests only):

```typescript
// Pure — no I/O. Inspects ratios + yoyDelta + qoqDelta.
export function detectFinancialSignals(report: FinancialReport): FinancialSignal[]

// Pure — first-match rule set.
export function deriveOutlook(signals: FinancialSignal[]): Outlook

// Pure — returns { keyStrengths, keyWeaknesses } in Vietnamese.
export function buildStrengthsWeaknesses(
  signals: FinancialSignal[],
  report: FinancialReport,
): { keyStrengths: string[]; keyWeaknesses: string[] }

// Pure — 1–3 sentence Vietnamese narrative.
export function buildSummaryNarrative(
  report: FinancialReport,
  signals: FinancialSignal[],
  outlook: Outlook,
): string
```

**SQLite persistence helper** (module-private):

```typescript
// Checks PRAGMA table_info(financial_reports) before ALTER TABLE.
// Logs warning on missing report ID; never throws.
function updateFinancialReportAiAnalysis(
  reportId: string,
  aiAnalysis: AIAnalysis,
  db: Database,
): void
```

**Signal threshold table** (implemented as ordered conditional checks):

| Signal | Condition (uses `yoyDelta`, `ratios`, `cashFlow`) |
|--------|---------------------------------------------------|
| `strong_revenue_growth` | `yoyDelta?.netRevenue.changePct >= 20` |
| `revenue_decline` | `yoyDelta?.netRevenue.changePct < 0` |
| `margin_expansion` | `yoyDelta?.grossMarginPP.changePP > 1.5` |
| `margin_compression` | `yoyDelta?.grossMarginPP.changePP < -1.5` |
| `strong_profit_growth` | `yoyDelta?.netProfit.changePct >= 20` |
| `profit_decline` | `yoyDelta?.netProfit.changePct < 0` |
| `high_debt` | `ratios.debtToEquity > 2.0` (cap Infinity at 99.9) |
| `debt_reduction` | `yoyDelta?.totalDebt.changePct < -10` |
| `strong_cashflow` | `cashFlow.freeCashFlow > 0 AND yoyDelta?.freeCashFlow.changePct > 0` |
| `negative_cashflow` | `cashFlow.freeCashFlow < 0` |
| `inventory_buildup` | `ratios.inventoryDays > 90` |
| `receivables_concern` | `ratios.receivablesDays > 60` |

Skip any signal where the required delta field is null or `changePct` is null/NaN.

---

### Task 027 — `src/infrastructure/fetchers/hnx.ts`

```typescript
import type { HttpClient } from "./ssc.js";
import type { MarketPrice } from "./hose.js";

// Re-export for callers who only import from hnx.ts
export type { MarketPrice } from "./hose.js";

/**
 * Build HNX API URL for stock-type queries.
 * https://api.hnx.vn/api/snapshot?code=ACB,NVB&type=stock
 */
export function buildHnxUrl(codes: string[]): string

/**
 * Build HNX API URL for UPCOM-type queries.
 * https://api.hnx.vn/api/snapshot?code=FRT&type=upcom
 */
export function buildUpcomUrl(codes: string[]): string

/**
 * Parse HNX JSON array response into VnDirectStockRecord-equivalent objects.
 * Returns [] on any parse error.
 */
export function parseHnxResponse(json: string, exchange: "HNX" | "UPCOM"): MarketPrice[]

/**
 * Fetch live prices for HNX-listed stocks.
 * Returns [] (never throws) on any network or parse failure.
 */
export async function fetchHnxPrices(
  codes: string[],
  httpClient?: HttpClient,
): Promise<MarketPrice[]>

/**
 * Fetch live prices for UPCOM-listed stocks.
 * Returns [] (never throws) on any network or parse failure.
 */
export async function fetchUpcomPrices(
  codes: string[],
  httpClient?: HttpClient,
): Promise<MarketPrice[]>
```

**HNX response field mapping**:

| HNX field | MarketPrice field |
|-----------|-------------------|
| `code` | `code` |
| hardcoded `"HNX"` / `"UPCOM"` | `exchange` |
| `closePrice ?? 0` | `price` |
| `referencePrice ?? 0` | `previousPrice` |
| `percentChange ?? 0` | `changePct` |
| `totalVolume ?? 0` | `volume` |
| `0` | `avgVolume` |
| `new Date().toISOString()` | `fetchedAt` |

**Schema migration** (in `hnx.ts`, called before first `storeMarketPrices`):

```typescript
// Module-level, runs once per process
function ensureExchangeColumn(): void {
  const db = getDb();
  const cols = db.query<{ name: string }, []>(
    "PRAGMA table_info(market_prices)"
  ).all();
  if (!cols.some(c => c.name === "exchange")) {
    db.exec("ALTER TABLE market_prices ADD COLUMN exchange TEXT DEFAULT 'HOSE'");
  }
  const histCols = db.query<{ name: string }, []>(
    "PRAGMA table_info(market_prices_history)"
  ).all();
  if (!histCols.some(c => c.name === "exchange")) {
    db.exec("ALTER TABLE market_prices_history ADD COLUMN exchange TEXT DEFAULT 'HOSE'");
  }
}
```

`ensureExchangeColumn()` is also called from `src/infrastructure/db/schema.ts` inside `initDatabase()` so HOSE prices written after the migration also carry the `exchange` value.

**`storeMarketPrices` in `hose.ts`** must be updated to include `exchange` in the `market_prices` upsert and `market_prices_history` insert once the column exists. Because `MarketPrice` already carries `exchange: string`, the SQL statement is extended to:

```sql
INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, exchange, updated_at)
VALUES (?, ?, ?, ?, ?, ?)
```

---

### Task 105 — `src/application/usecases/assembleEveningSummary.ts`

```typescript
import type { Database } from "bun:sqlite";
// Reuse from assembleBriefing to avoid duplication:
import type { BriefingAlert, TopStory } from "./assembleBriefing.js";

export interface WatchlistMover {
  code: string;
  changePct: number;     // signed; only |changePct| >= 1.0 appears here
  price: number;
  exchange: string;
}

export interface EveningSummary {
  date: string;                       // YYYY-MM-DD in Vietnam timezone
  topAlerts: BriefingAlert[];         // up to 5, last 24h, severity DESC
  topStories: TopStory[];             // up to 5, today since midnight, impact_score DESC
  watchlistMovers: WatchlistMover[];  // |changePct| >= 1.0, sorted by |changePct| DESC
  generatedAt: string;                // ISO timestamp
}

export interface AssembleEveningSummaryOptions {
  db?: Database;
  reportsDir?: string;   // defaults to "./reports"
}

/**
 * Assembles end-of-day summary from SQLite. Persists to
 * reports/YYYY-MM-DD-evening.json. Returns EveningSummary.
 *
 * Mirrors assembleBriefing.ts structure. Never throws — file write
 * failures are caught and logged.
 */
export async function assembleEveningSummary(
  options?: AssembleEveningSummaryOptions,
): Promise<EveningSummary>
```

**Severity sort** (client-side, not SQL `ORDER BY severity`):

```typescript
const SEVERITY_RANK: Record<string, number> = { critical: 3, warning: 2, info: 1 };
alerts.sort((a, b) => (SEVERITY_RANK[b.severity] ?? 0) - (SEVERITY_RANK[a.severity] ?? 0));
```

**`watchlistMovers` SQL** — `exchange` falls back to watchlist table when not in `market_prices`:

```sql
SELECT w.code,
       COALESCE(mp.exchange, w.exchange) AS exchange,
       mp.price,
       mp.change_pct
FROM watchlist w
LEFT JOIN market_prices mp ON mp.code = w.code
WHERE ABS(COALESCE(mp.change_pct, 0)) >= 1.0
ORDER BY ABS(COALESCE(mp.change_pct, 0)) DESC
```

---

### Task 105 — `src/scheduler/eveningSummaryJob.ts`

```typescript
/**
 * Evening summary cron job — 22:00 GMT+7 weekdays.
 *
 * Exports scheduleEveningSummaryJob() to be called from jobs.ts.
 * Concurrency guard: module-level _running flag.
 */

let _running = false;

export async function runEveningSummary(): Promise<void>

export function scheduleEveningSummaryJob(): void
```

**Cron expression**: `0 22 * * 1-5`
**Timezone**: `Asia/Ho_Chi_Minh`
**Concurrency guard pattern** (mirrors `morningBriefingJob.ts`):

```typescript
if (_running) {
  logger.warn("[eveningSummaryJob] already running — skipping");
  return;
}
_running = true;
try {
  await assembleEveningSummary();
} catch (err) {
  logger.error("[eveningSummaryJob] failed", { error: ... });
} finally {
  _running = false;
}
```

---

### Task 084 — `src/interface/mcp/tools/marketTools.ts`

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

/**
 * Register market MCP tools: get_market_snapshot, get_patterns.
 *
 * IMPORTANT: search_similar_context is NOT registered here — it is already
 * owned by registerAnalysisTools (analysis.ts). Registering it again would
 * cause a duplicate tool name error in McpServer.
 *
 * @param server The McpServer instance to register tools on.
 */
export function registerMarketTools(server: McpServer): void
```

**Tool 1 — `get_market_snapshot`**:

- Input: `codes?: z.array(z.string()).optional()` — optional list of tickers.
- Internal calls (all in `Promise.all`, each failure isolated):
  - `fetchHosePrices(["VNINDEX"])` → vnIndex
  - `fetchHosePrices(hoseCodes)` → hose prices
  - `fetchHnxPrices(hnxCodes)` → hnx prices
  - `fetchUpcomPrices(upcomCodes)` → upcom prices
- When `codes` is provided: classify by `market_prices.exchange` column via `getDb()`; unknown codes default to HOSE.
- When `codes` is absent or empty: only VNINDEX is fetched; `hose/hnx/upcom` are `[]`.
- Output format (text): VN-Index header line + per-exchange sections, `generatedAt` footer.

**Tool 2 — `get_patterns`**:

- Input:
  ```
  stockCode:    z.string().min(1).max(10)
  eventKeyword: z.string().min(1).max(100)
  lookbackHours: z.number().int().min(1).max(8760).default(168)
  ```
- Calls `getPatternSummary(stockCode, eventKeyword, lookbackHours)`.
- On null result: returns text `"No historical precedents found."`.
- On non-null: returns formatted text with precedent table + summary line showing `avgImpactPct` and `dominantDirection`.

---

### Task 123 — `src/__tests__/123-integration-mcp-tools.test.ts`

```typescript
// Test infrastructure
// - DB_PATH=':memory:' set before any import that triggers getDb()
// - initDatabase() called in beforeAll
// - closeDb() called in afterAll
// - LanceDB mocked: mock module "../../src/infrastructure/rag/retriever.js"
//   to return stub searchContext / insertAnalysis
// - HTTP mocked via injected httpClient or module-level override

// 5 roundtrips × minimum expect() budget:
// RT1 (watchlist CRUD):     4+ expects
// RT2 (news → alert):       3+ expects
// RT3 (BCTC summary):       3+ expects
// RT4 (pattern matching):   3+ expects
// RT5 (market snapshot):    3+ expects
// Additional structural checks to reach ≥ 20 total expects
```

The test file imports MCP tool handler functions from `src/interface/mcp/tools/*` and calls them with a real in-memory `McpServer` instance bound to a real SQLite `:memory:` database. It does not make HTTP calls except through injected mock clients.

---

## Task Breakdown (for PM)

Execution waves per `SPRINT_GOAL.md`:

**Wave 1 — Run in parallel (no inter-dependencies):**

| Task | Title | Layer | Key dependency |
|------|-------|-------|----------------|
| 065 | Historical pattern matcher | application | `rag_analyses` SQLite schema ✅ |
| 066 | AI summary generator | application | `FinancialReport` + `bctc-schema.ts` ✅ |
| 027 | HNX + UPCOM fetcher | infrastructure | `hose.ts` `MarketPrice` type ✅ |
| 105 | Evening summary job | interface/scheduler | `assembleBriefing.ts` types ✅ |

**Wave 2 — After 065 and 027 are merged:**

| Task | Title | Layer | Key dependency |
|------|-------|-------|----------------|
| 084 | Market MCP tools | interface/mcp | 065 ✅, 027 ✅ |

**Wave 3 — After all Wave 1 + 2 are merged:**

| Task | Title | Layer | Key dependency |
|------|-------|-------|----------------|
| 123 | Integration tests | test | 065 ✅, 066 ✅, 084 ✅, 105 ✅ |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| HNX API (`api.hnx.vn`) endpoint URL or response schema is undocumented / changes without notice | High | Medium | Abstract behind `HttpClient` interface (injectable mock); implement `parseHnxResponse` defensively with default-zero fallbacks on every field; test with fixture JSON |
| `market_prices` primary key is `code TEXT` only — UPCOM ticker overlapping HOSE ticker causes silent overwrite | Low | Low | Documented known limitation in REQ-006 edge cases; deferred to Sprint 007 (composite PK migration) |
| `ALTER TABLE market_prices ADD COLUMN exchange` races if multiple processes start simultaneously | Low | Medium | `initDatabase()` is synchronous and runs at server boot before any requests; single-process architecture makes this safe |
| `generateAiSummary` emits no signals on sparse `FinancialReport` (all deltas null) — empty `AIAnalysis` returned | Medium | Low | Spec explicitly requires this case to succeed with ratios-only content; unit test must cover it |
| `rag_analyses.affected_actions` LIKE `'%"GAS"%'` partial match false-positive for `"GASC"` stock code | Low | Medium | The JSON serialisation writes `"GAS"` with surrounding quotes; LIKE `'%"GAS"%'` matches only the exact token; document this constraint in JSDoc |
| LanceDB cannot initialise in CI environment (no filesystem path) | High | Medium | Task 123 explicitly mocks `insertAnalysis` / `searchContext` at the module level; integration tests are SQLite-only |
| `bun:sqlite` singleton (`_db`) shared across parallel test workers causes cross-test contamination | Medium | High | Task 123 uses a single `beforeAll` + `afterAll` with unique row IDs per roundtrip; all tests must run in a single worker (not `--parallel`) |
| MCP duplicate tool name error if `registerMarketTools` is accidentally called after `registerAnalysisTools` re-registers `search_similar_context` | Medium | High | `marketTools.ts` explicitly does NOT register `search_similar_context`; code review must verify this; comment in source explains the constraint |

---

## Security Review

- SQL parameterised queries: Yes — `getPatternSummary` uses `db.prepare(...)` with `?` placeholders throughout; no string interpolation of user-supplied values.
- File paths validated (no `../`): Yes — evening summary output path is constructed via `join(reportsDir, date + "-evening.json")` where `date` is derived from `Date` object (format `YYYY-MM-DD`), not user input.
- External HTTP rate-limited: No explicit rate limiting — acceptable for Sprint 006; HNX API is called at most once per cron tick. HTTP timeout is 15,000 ms matching the HOSE fetcher.
- Secrets via `Bun.env` only: Yes — no new secrets introduced; HNX API is public (no auth).
- `ALTER TABLE` migration idempotent: Yes — `PRAGMA table_info` check prevents duplicate column errors on repeated `initDatabase()` calls.

---

## Implementation Notes for Developer

### 065 — Escaping in LIKE patterns

The parameterised query approach is:

```typescript
const stockPattern = `%"${stockCode}"%`;          // e.g. '%"GAS"%'
const keywordPattern = `%${eventKeyword}%`;        // raw — parameterised, so safe
```

Because `eventKeyword` is passed as a bound parameter (not interpolated into SQL), SQLite treats `%` and `_` within it as literal wildcards against the stored text — this is the intended matching behaviour. No additional escaping is required.

### 066 — `ai_analysis` column guard in `initDatabase()`

```typescript
// At end of initDatabase(), after SQLITE_DDL exec:
const cols = db.query<{ name: string }, []>(
  "PRAGMA table_info(financial_reports)"
).all();
if (!cols.some(c => c.name === "ai_analysis")) {
  db.exec("ALTER TABLE financial_reports ADD COLUMN ai_analysis TEXT");
}
```

### 027 — `storeMarketPrices` update in `hose.ts`

The existing `upsertLatest` prepared statement must be updated to include `exchange`:

```typescript
// BEFORE (task 026):
const upsertLatest = db.prepare(`
  INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, updated_at)
  VALUES (?, ?, ?, ?, ?)
`);
// call: upsertLatest.run(p.code, p.price, p.changePct, p.volume, p.fetchedAt)

// AFTER (task 027):
const upsertLatest = db.prepare(`
  INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, exchange, updated_at)
  VALUES (?, ?, ?, ?, ?, ?)
`);
// call: upsertLatest.run(p.code, p.price, p.changePct, p.volume, p.exchange, p.fetchedAt)
```

The `ensureExchangeColumn()` call must precede the `db.prepare(...)` calls inside `storeMarketPrices`, or be called inside `ensureHistoryTable()`.

### 084 — MCP server wiring

In `src/interface/mcp/server.ts`, add after `registerAnalysisTools(mcpServer)`:

```typescript
import { registerMarketTools } from "./tools/index.js";
// ...
registerMarketTools(mcpServer);
```

In `src/interface/mcp/tools/index.ts`, add:

```typescript
export { registerMarketTools } from "./marketTools.js";
```

### 105 — Scheduler wiring

In `src/scheduler/jobs.ts`, add to `CRONS` map:

```typescript
eveningSummary: Bun.env.CRON_EVENING_SUMMARY ?? '0 22 * * 1-5',
```

And in `startScheduler()`:

```typescript
import { scheduleEveningSummaryJob } from './eveningSummaryJob.js'
// ...
cron.schedule(CRONS.eveningSummary, async () => {
  await runEveningSummary()
}, { timezone: 'Asia/Ho_Chi_Minh' })
```

### 123 — Test file skeleton

```typescript
import { describe, test, expect, beforeAll, afterAll, mock } from "bun:test";

// Must set DB_PATH before any schema import
process.env["DB_PATH"] = ":memory:";

import { initDatabase, closeDb, getDb } from "../../src/infrastructure/db/schema.js";

// Mock LanceDB-dependent modules before they're imported
mock.module("../../src/infrastructure/rag/retriever.js", () => ({
  searchContext: async () => [],
  insertAnalysis: async () => {},
}));

// ... register McpServer, call registerWatchlistTools, registerReportTools,
//     registerAlertTools, registerAnalysisTools, registerMarketTools
// ... 5 roundtrip test blocks with real SQLite, mocked HTTP
```
