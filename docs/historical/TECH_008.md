# TECH-008: Sprint 008 — Macro Intelligence Layer

status: APPROVED_BY_ARCHITECT
req_ref: REQ-008

---

## Brownfield Impact

- **Files created:**
  - `src/infrastructure/fetchers/yahooFinance.ts` (task 025)
  - `src/infrastructure/fetchers/sbv.ts` (task 028)
  - `src/interface/mcp/tools/macroTools.ts` (task 089)
  - `src/__tests__/025-yahoo-finance.test.ts`
  - `src/__tests__/028-sbv-rates.test.ts`
  - `src/__tests__/126-macro-cascade.test.ts`
  - `src/__tests__/089-tool-macro.test.ts`

- **Files modified:**
  - `src/infrastructure/db/schema.ts` — add 4 DDL blocks (tasks 025 + 028)
  - `src/infrastructure/fetchers/index.ts` — barrel exports for yahooFinance + sbv
  - `src/domain/services/cascadeEngine.ts` — MacroContext type + MACRO_ADJUSTMENTS + buildCausalChain signature extension (task 126)
  - `src/application/usecases/runImpactChain.ts` — commodityFetcher + sbvFetcher injectors + MacroContext assembly (task 126)
  - `src/interface/mcp/server.ts` — register registerMacroTools, toolCount 16 → 17 (task 089)
  - `src/interface/mcp/tools/index.ts` — export registerMacroTools (task 089)
  - `src/__tests__/081-bun-mcp-server.test.ts` — SSE timeout 300ms → 2000ms, test.timeout 10000ms, afterAll guard (FIX-081)
  - `bctc-schema.ts` — add `logistics` and `gold_mining` to DomainType (task 126, blocker B1)

- **Files deleted:** none

- **Breaking changes:** No. All function signature extensions are additive (optional parameters). DomainType is a union type extension — all existing callers remain valid. The `buildCausalChain` fourth parameter is optional with identical default behaviour when omitted.

---

## Architecture Decision

Sprint 008 closes the global macro layer of the causal cascade. The design keeps the domain layer strictly pure: `MacroContext` is a plain TypeScript interface defined inside `cascadeEngine.ts` with no infrastructure imports. The two new infrastructure fetchers (`yahooFinance.ts`, `sbv.ts`) follow the established `tradingEconomics.ts` pattern — injectable `HttpClient`, cheerio HTML parsing, never-throw contract, `INSERT OR REPLACE` upsert + append-only history in SQLite. The application layer (`runImpactChain.ts`) assembles `MacroContext` from dynamic imports of the fetchers (same lazy-import pattern as `defaultRagRetriever`) and passes it to the pure domain function, keeping infrastructure I/O fully isolated from domain logic.

---

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| DomainType (logistics, gold_mining) | domain (schema) | `bctc-schema.ts` | MODIFY |
| MacroContext interface | domain | `src/domain/services/cascadeEngine.ts` | MODIFY |
| MACRO_ADJUSTMENTS table | domain | `src/domain/services/cascadeEngine.ts` | MODIFY |
| buildCausalChain (macroContext param) | domain | `src/domain/services/cascadeEngine.ts` | MODIFY |
| applyMacroAdjustments (internal helper) | domain | `src/domain/services/cascadeEngine.ts` | MODIFY |
| CommoditySnapshot interface | infrastructure | `src/infrastructure/fetchers/yahooFinance.ts` | NEW |
| fetchYahooFinancePrices | infrastructure | `src/infrastructure/fetchers/yahooFinance.ts` | NEW |
| storeCommoditySnapshot | infrastructure | `src/infrastructure/fetchers/yahooFinance.ts` | NEW |
| SbvMacroSnapshot interface | infrastructure | `src/infrastructure/fetchers/sbv.ts` | NEW |
| fetchSbvRates | infrastructure | `src/infrastructure/fetchers/sbv.ts` | NEW |
| storeSbvSnapshot | infrastructure | `src/infrastructure/fetchers/sbv.ts` | NEW |
| commodity_prices DDL | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| sbv_rates DDL | infrastructure | `src/infrastructure/db/schema.ts` | MODIFY |
| RunCascadeInput extensions | application | `src/application/usecases/runImpactChain.ts` | MODIFY |
| MacroContext assembly | application | `src/application/usecases/runImpactChain.ts` | MODIFY |
| registerMacroTools | interface | `src/interface/mcp/tools/macroTools.ts` | NEW |
| get_macro_snapshot tool | interface | `src/interface/mcp/tools/macroTools.ts` | NEW |
| server.ts wiring | interface | `src/interface/mcp/server.ts` | MODIFY |
| tools/index.ts barrel | interface | `src/interface/mcp/tools/index.ts` | MODIFY |
| SSE test fix | interface/test | `src/__tests__/081-bun-mcp-server.test.ts` | MODIFY |

---

## Interface Contracts

### bctc-schema.ts — DomainType extension (blocker B1)

```typescript
export type DomainType =
  | 'oil_gas'
  | 'banking'
  | 'real_estate'
  | 'steel'
  | 'aviation'
  | 'retail'
  | 'tech'
  | 'utilities'
  | 'agriculture'
  | 'insurance'
  | 'securities'
  | 'pharma'
  | 'logistics'      // NEW — task 126
  | 'gold_mining'    // NEW — task 126
  | 'other'
```

The two new values are appended before `'other'`. No existing code breaks — `DomainType` is a union and all switch/if-else paths that handle `'other'` as a catch-all still compile correctly.

---

### src/infrastructure/fetchers/yahooFinance.ts (task 025)

Scraping strategy: Yahoo Finance serves live prices via `<fin-streamer>` custom elements. Each symbol uses a single URL (`/quote/SYMBOL`). The `value` attribute is parsed first; element text content is the fallback. Commas (thousands separator) are stripped with `replace(/,/g, "")` before `parseFloat`.

**Blocker B2 resolution:** REQ-008 originally suggested the HTML scraping approach; user confirmed Yahoo Finance unofficial JSON API (`query1.finance.yahoo.com/v8/finance/chart/`) as the primary source. This is simpler and more reliable than HTML scraping. The TASKS.md acceptance criteria (YF-01 through YF-12) still reference `fin-streamer` HTML parsing — the Developer must choose one approach and keep tests consistent. The recommended approach is the JSON API because it avoids HTML brittleness. **If the Developer uses the JSON API:** the `HttpClient.get(url)` contract still applies (returns a string which is the raw JSON body); cheerio is not needed; parsing switches to `JSON.parse`. The `YAHOO_FINANCE_BASE_URL` env override still applies. The acceptance criteria YF-E5 (comma stripping) remains valid as the JSON API can also return number strings.

```typescript
export interface CommoditySnapshot {
  /** Brent crude front-month futures price in USD per barrel. null if fetch failed. */
  brentCrudeUSD: number | null;
  /** Gold front-month futures price in USD per troy ounce. null if fetch failed. */
  goldUSDPerOz: number | null;
  /** USD/VND exchange rate: VND per 1 USD. null if fetch failed. */
  usdVndRate: number | null;
  /** ISO 8601 timestamp when the snapshot was attempted. */
  fetchedAt: string;
}

/**
 * Fetch commodity prices from Yahoo Finance (JSON API or HTML scrape).
 * Never throws. Returns null only on catastrophic import failure.
 * Individual fields are null when a specific symbol cannot be fetched.
 *
 * @param httpClient - Optional injectable HTTP client (for tests).
 * @returns CommoditySnapshot | null
 */
export async function fetchYahooFinancePrices(
  httpClient?: HttpClient,
): Promise<CommoditySnapshot | null>

/**
 * Upsert commodity snapshot to SQLite (INSERT OR REPLACE + append-only history).
 * Writes source "yahoo_finance" to both commodity_prices and commodity_prices_history
 * in a single db.transaction().
 *
 * @param snapshot - CommoditySnapshot to persist.
 * @param db       - Optional database instance (defaults to getDb()).
 */
export function storeCommoditySnapshot(
  snapshot: CommoditySnapshot,
  db?: Database,
): void
```

**Env var:** `YAHOO_FINANCE_BASE_URL` — replaces base domain for all three symbol URLs.

**URL targets (JSON API approach):**
- Brent: `${base}/v8/finance/chart/BZ=F?interval=1d&range=1d`
- Gold:  `${base}/v8/finance/chart/GC=F?interval=1d&range=1d`
- USDVND: `${base}/v8/finance/chart/USDVND=X?interval=1d&range=1d`

Response path: `result[0].meta.regularMarketPrice` in the chart API JSON.

**DB tables used:** `commodity_prices` (upsert), `commodity_prices_history` (insert).

---

### src/infrastructure/fetchers/sbv.ts (task 028)

Two-page fetcher. The interest-rate page and FX-rate page are fetched independently (partial failure is valid). The function returns `null` only when both HTTP GETs fail.

```typescript
export interface SbvMacroSnapshot {
  /** SBV overnight interbank lending rate in percent. null if unavailable. */
  overnightRatePct: number | null;
  /** SBV refinancing (policy) rate in percent. null if unavailable. */
  refinancingRatePct: number | null;
  /** SBV official USD/VND reference rate: VND per 1 USD. null if unavailable. */
  usdVndOfficial: number | null;
  /** ISO 8601 timestamp when the snapshot was attempted. */
  fetchedAt: string;
}

/**
 * Fetch SBV interest rates and official FX rate from two separate pages.
 * Never throws. Returns null only when both HTTP GETs fail.
 * Individual fields are null when a page cannot be scraped.
 *
 * @param httpClient - Optional injectable HTTP client (for tests).
 * @returns SbvMacroSnapshot | null
 */
export async function fetchSbvRates(
  httpClient?: HttpClient,
): Promise<SbvMacroSnapshot | null>

/**
 * Upsert SBV snapshot to SQLite (INSERT OR REPLACE + append-only history).
 * Writes source "sbv" to both sbv_rates and sbv_rates_history
 * in a single db.transaction().
 *
 * @param snapshot - SbvMacroSnapshot to persist.
 * @param db       - Optional database instance (defaults to getDb()).
 */
export function storeSbvSnapshot(
  snapshot: SbvMacroSnapshot,
  db?: Database,
): void
```

**Env var:** `SBV_BASE_URL` — replaces base domain for both SBV page URLs.

**URL targets:**
- Interest rates: `${base}/webcenter/portal/en/home/rm/ir`
- FX rates:       `${base}/webcenter/portal/en/home/fm/exchangerate`

**Parse rules (interest rate page):**
- `overnightRatePct`: `<td>` label contains `"overnight"` or `"qua đêm"` (case-insensitive)
- `refinancingRatePct`: `<td>` label contains `"refinancing"` or `"tái cấp vốn"`, must NOT match `"discount"` or `"chiết khấu"` (SBV-E6 non-contamination)
- Strip `%` and whitespace, `parseFloat`

**Parse rules (FX rate page):**
- `usdVndOfficial`: find USD row (`"USD"` or `"Đô la Mỹ"`), extract "Central rate" or "Tỷ giá trung tâm" column
- Vietnamese decimal normalisation: `replace(/\./g, "")` then `replace(",", ".")` before `parseFloat`
- `"Accept-Language": "en"` header added to default HTTP client

**DB tables used:** `sbv_rates` (upsert), `sbv_rates_history` (insert).

---

### src/infrastructure/db/schema.ts — new DDL blocks (tasks 025 + 028)

Added inside `initDatabase()` after the existing `macro_indicators` block:

```sql
-- Task 025: commodity_prices — latest snapshot per source
CREATE TABLE IF NOT EXISTS commodity_prices (
  source          TEXT PRIMARY KEY,
  brent_crude_usd REAL,
  gold_usd_per_oz REAL,
  usd_vnd_rate    REAL,
  fetched_at      TEXT NOT NULL
);
-- Task 025: commodity_prices_history — append-only time series
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

-- Task 028: sbv_rates — latest snapshot per source
CREATE TABLE IF NOT EXISTS sbv_rates (
  source               TEXT PRIMARY KEY,
  overnight_rate_pct   REAL,
  refinancing_rate_pct REAL,
  usd_vnd_official     REAL,
  fetched_at           TEXT NOT NULL
);
-- Task 028: sbv_rates_history — append-only time series
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

---

### src/domain/services/cascadeEngine.ts — task 126 additions

#### MacroContext interface (new pure domain type)

```typescript
export interface MacroContext {
  /** Brent crude price in USD per barrel. null = unknown / fetch failed. */
  brentCrudeUSD: number | null;
  /** Gold price in USD per troy ounce. null = unknown. */
  goldUSDPerOz: number | null;
  /** Market USD/VND rate from Yahoo Finance. null = unknown. */
  usdVndMarket: number | null;
  /** SBV refinancing policy rate in percent. null = unknown. */
  refinancingRatePct: number | null;
  /** SBV overnight rate in percent. null = unknown. */
  overnightRatePct: number | null;
  /** SBV official USD/VND rate. null = unknown. */
  usdVndOfficial: number | null;
}
```

#### MACRO_ADJUSTMENTS table (hardcoded, pure domain constant)

```typescript
interface MacroAdjustmentRule {
  /** Human-readable label for the reasoning annotation. */
  label: string;
  /** Returns true if this rule should fire given the macro context. */
  condition: (ctx: MacroContext) => boolean;
  /** Domains whose confidence score this rule adjusts. */
  domains: DomainType[];
  /** Signed delta to add to confidence (positive = boost, negative = penalty). */
  delta: number;
}

const MACRO_ADJUSTMENTS: MacroAdjustmentRule[] = [
  {
    label: "brentCrudeUSD>90",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 90,
    domains: ["oil_gas", "logistics"],
    delta: +0.10,
  },
  {
    label: "brentCrudeUSD>90",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD > 90,
    domains: ["aviation"],
    delta: -0.08,
  },
  {
    label: "brentCrudeUSD<70",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD < 70,
    domains: ["oil_gas"],
    delta: -0.10,
  },
  {
    label: "brentCrudeUSD<70",
    condition: (ctx) => ctx.brentCrudeUSD !== null && ctx.brentCrudeUSD < 70,
    domains: ["aviation"],
    delta: +0.06,
  },
  {
    label: "goldUSDPerOz>2000",
    condition: (ctx) => ctx.goldUSDPerOz !== null && ctx.goldUSDPerOz > 2000,
    domains: ["gold_mining"],
    delta: +0.05,
  },
  {
    label: "refinancingRatePct>6",
    condition: (ctx) => ctx.refinancingRatePct !== null && ctx.refinancingRatePct > 6,
    domains: ["banking"],
    delta: -0.08,
  },
  {
    label: "refinancingRatePct>6",
    condition: (ctx) => ctx.refinancingRatePct !== null && ctx.refinancingRatePct > 6,
    domains: ["real_estate"],
    delta: -0.10,
  },
  {
    label: "refinancingRatePct<4",
    condition: (ctx) => ctx.refinancingRatePct !== null && ctx.refinancingRatePct < 4,
    domains: ["banking"],
    delta: +0.06,
  },
  {
    label: "refinancingRatePct<4",
    condition: (ctx) => ctx.refinancingRatePct !== null && ctx.refinancingRatePct < 4,
    domains: ["real_estate"],
    delta: +0.08,
  },
  {
    label: "usdVnd>25500",
    condition: (ctx) =>
      (ctx.usdVndMarket !== null && ctx.usdVndMarket > 25500) ||
      (ctx.usdVndOfficial !== null && ctx.usdVndOfficial > 25500),
    domains: ["aviation"],
    delta: -0.07,
  },
  {
    label: "usdVndMarket>25500",
    condition: (ctx) => ctx.usdVndMarket !== null && ctx.usdVndMarket > 25500,
    domains: ["steel"],
    delta: +0.05,
  },
];
```

#### Internal helper: applyMacroAdjustments

```typescript
/**
 * Apply macro adjustment rules to domain-level CausalChainEntries in-place.
 * Null MacroContext fields cause rules referencing those fields to be silently skipped.
 * After summing all applicable deltas, confidence is clamped to [0.05, 0.99].
 * Affected entry.reasoning is annotated with: " [Macro: label=VALUE → DELTA domain]"
 *
 * Pure function — modifies the entries array elements in-place (no I/O).
 */
function applyMacroAdjustments(
  entries: CausalChainEntry[],
  macroContext: MacroContext,
): void
```

#### buildCausalChain signature extension

```typescript
/**
 * Build a causal chain from a seed AnalysisEntry.
 * When macroContext is omitted or null, behaviour is identical to pre-Sprint-008 baseline.
 *
 * @param seedEntry    - Normalized news entry
 * @param watchlist    - User's stock watchlist
 * @param ragResults   - Pre-fetched historical context (optional)
 * @param macroContext - Pre-fetched macro data for confidence adjustment (optional)
 * @returns            - CausalChain with all levels: seed → domain → action
 */
export function buildCausalChain(
  seedEntry: AnalysisEntry,
  watchlist: WatchlistEntry[],
  ragResults?: SearchResult[],
  macroContext?: MacroContext | null,
): CausalChain
```

The macro adjustment step is inserted as **Step 2b** in `buildCausalChain`, between the domain entry construction (Step 2) and the action entry construction (Step 3). This ensures action entries inherit the already-adjusted confidence scores from their parent domain entries.

---

### src/application/usecases/runImpactChain.ts — task 126 extensions

```typescript
import type { CommoditySnapshot } from "../../infrastructure/fetchers/yahooFinance.js";
// NOTE: this import is a TYPE-ONLY import. The actual function is dynamically
// imported inside the function body to avoid circular dependency. The type
// import is safe because TypeScript erases it at runtime.

import type { SbvMacroSnapshot } from "../../infrastructure/fetchers/sbv.js";

export interface RunCascadeInput {
  newsText: string;
  seedEntry?: AnalysisEntry;
  watchlist: WatchlistEntry[];
  ragRetriever?: RagRetriever;
  /** Optional commodity data fetcher. Defaults to fetchYahooFinancePrices (dynamic import). */
  commodityFetcher?: () => Promise<CommoditySnapshot | null>;
  /** Optional SBV rate fetcher. Defaults to fetchSbvRates (dynamic import). */
  sbvFetcher?: () => Promise<SbvMacroSnapshot | null>;
}
```

**MacroContext assembly logic inside `runImpactChain`:**

```
Step 0 (new): Fetch macro data
  - Call commodityFetcher() and sbvFetcher() in parallel via Promise.all
  - Each call is individually wrapped in try/catch; failure = null for that fetcher
  - Assemble MacroContext from results:
    brentCrudeUSD     ← commodity?.brentCrudeUSD ?? null
    goldUSDPerOz      ← commodity?.goldUSDPerOz ?? null
    usdVndMarket      ← commodity?.usdVndRate ?? null
    refinancingRatePct ← sbv?.refinancingRatePct ?? null
    overnightRatePct  ← sbv?.overnightRatePct ?? null
    usdVndOfficial    ← sbv?.usdVndOfficial ?? null

Step 3 (modified): Call buildCausalChain with macroContext as 4th argument
```

**Default fetchers (dynamic import, same pattern as defaultRagRetriever):**

```typescript
async function defaultCommodityFetcher(): Promise<CommoditySnapshot | null> {
  try {
    const { fetchYahooFinancePrices } = await import("../../infrastructure/fetchers/yahooFinance.js");
    return fetchYahooFinancePrices();
  } catch (err) {
    logger.warn("[runImpactChain] defaultCommodityFetcher failed", { ... });
    return null;
  }
}

async function defaultSbvFetcher(): Promise<SbvMacroSnapshot | null> {
  try {
    const { fetchSbvRates } = await import("../../infrastructure/fetchers/sbv.js");
    return fetchSbvRates();
  } catch (err) {
    logger.warn("[runImpactChain] defaultSbvFetcher failed", { ... });
    return null;
  }
}
```

**Caching:** Both fetchers are called exactly once per `runImpactChain` invocation via local variables. No module-level cache.

---

### src/interface/mcp/tools/macroTools.ts (task 089)

```typescript
import type { HttpClient } from "../../../infrastructure/fetchers/ssc.js";
import type { CommoditySnapshot } from "../../../infrastructure/fetchers/yahooFinance.js";
import type { SbvMacroSnapshot } from "../../../infrastructure/fetchers/sbv.js";

interface MacroSnapshotResponse {
  commodity: CommoditySnapshot | null;
  rates: SbvMacroSnapshot | null;
  fetchedAt: string;
}

/**
 * Register macro MCP tools: get_macro_snapshot.
 * Increments tool count from 16 to 17.
 */
export function registerMacroTools(server: McpServer): void
```

**Tool: `get_macro_snapshot`**

Input schema (Zod):
```typescript
{
  _testCommodityClient: z.any().optional(),
  _testSbvClient:       z.any().optional(),
}
```

Behaviour:
1. Call `fetchYahooFinancePrices(_testCommodityClient)` and `fetchSbvRates(_testSbvClient)` in parallel via `Promise.all`.
2. Each call is independently error-isolated (`.catch` returns null for that fetcher).
3. Assemble `MacroSnapshotResponse`.
4. Format human-readable text output (see output format below).
5. Return `{ content: [{ type: "text", text }] }`.

Output format (text/event-stream `type: "text"` content):
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
  Energy sector:       HIGH OIL (>$90) — cascade +0.10 oil_gas confidence
  Gold sector:         neutral (gold < $2000)
  Banking/Real Estate: neutral (refi rate 4.50% — below 6% threshold)
  Currency pressure:   LOW (USD/VND 25450 — below 25500 threshold)
```

Macro Signal Summary rules (mirrors MACRO_ADJUSTMENTS, for display only):
- If `brentCrudeUSD > 90`: "HIGH OIL (>$90) — cascade +0.10 oil_gas confidence"
- If `brentCrudeUSD < 70`: "LOW OIL (<$70) — cascade -0.10 oil_gas confidence"
- Otherwise: "neutral"
- If `goldUSDPerOz > 2000`: "HIGH GOLD (>$2000) — cascade +0.05 gold_mining confidence"
- Otherwise: "neutral (gold < $2000)"
- If `refinancingRatePct > 6`: "TIGHT POLICY (>6%) — cascade -0.08 banking, -0.10 real_estate"
- If `refinancingRatePct < 4`: "LOOSE POLICY (<4%) — cascade +0.06 banking, +0.08 real_estate"
- Otherwise: "neutral (refi rate X% — below 6% threshold)"
- If `usdVndMarket > 25500` or `usdVndOfficial > 25500`: "HIGH (USD/VND X — above 25500 threshold) — cascade -0.07 aviation, +0.05 steel"
- Otherwise: "LOW (USD/VND X — below 25500 threshold)"

---

### src/interface/mcp/server.ts — tool registration change

```typescript
// Add after existing registerMarketTools line:
import { registerMacroTools } from "./tools/index.js";

// In createBunServer body:
registerMarketTools(mcpServer);  // existing
registerMacroTools(mcpServer);   // NEW — task 089: get_macro_snapshot (toolCount 16 → 17)
```

---

### src/interface/mcp/tools/index.ts — barrel export addition

```typescript
export { registerMacroTools } from "./macroTools.js";
```

---

### src/__tests__/081-bun-mcp-server.test.ts — FIX-081

Three targeted changes only (no production code change):

1. **SSE abort timeout:** `setTimeout(() => controller.abort(), 300)` → `setTimeout(() => controller.abort(), 2000)`
2. **Test-level timeout annotation:** Add `{ timeout: 10000 }` as the options argument to the SSE `it(...)` call (Bun test API: `it("...", fn, timeout)` or `it("...", { timeout }, fn)` depending on Bun version — use whichever form compiles with `bun tsc --noEmit`).
3. **afterAll guard:** Wrap `serverInstance.close()` in a try/catch so a failed test that leaves `serverInstance` undefined does not cause a secondary failure in teardown.

```typescript
afterAll(async () => {
  try {
    await serverInstance?.close();
  } catch {
    // ignore teardown errors
  }
});
```

---

## Dependency Graph and Execution Waves

```
Wave 1 (parallel — all independent):
  025 — Yahoo Finance fetcher   [infrastructure/fetchers/yahooFinance.ts]
  028 — SBV macro fetcher       [infrastructure/fetchers/sbv.ts]
  FIX-081 — SSE test fix        [src/__tests__/081-*.test.ts]

Wave 2 (parallel — both depend on 025 + 028 being done):
  126 — Macro cascade           [cascadeEngine.ts + runImpactChain.ts + bctc-schema.ts]
  089 — get_macro_snapshot tool [macroTools.ts + server.ts + tools/index.ts]
```

Task 089 does NOT depend on task 126 (it calls the fetchers directly, not through runImpactChain). Both Wave 2 tasks depend only on the Wave 1 fetchers being available. They can be developed in parallel once Wave 1 is merged.

The `bctc-schema.ts` DomainType patch (blocker B1) is part of task 126 because the new domains (`logistics`, `gold_mining`) are only referenced in `MACRO_ADJUSTMENTS`. It must be committed in the same PR as `cascadeEngine.ts` to keep the codebase in a consistently compilable state.

Schema DDL additions (tasks 025 + 028) can be committed together in a single `schema.ts` change or split across the two task branches — both use `CREATE TABLE IF NOT EXISTS` so order does not matter.

---

## Test Strategy per Task

### Task 025 — `src/__tests__/025-yahoo-finance.test.ts` (12 test cases: YF-01 through YF-12)

| ID | Scenario | Mock |
|----|----------|------|
| YF-01 | Happy path: all 3 symbols present, correct values returned | HTML/JSON with BZ=F=84.37, GC=F=2341.50, USDVND=X=25450 |
| YF-02 | `brentCrudeUSD` field is a number | Same fixture |
| YF-03 | `goldUSDPerOz` field is a number | Same fixture |
| YF-04 | `usdVndRate` field is a number | Same fixture |
| YF-05 | Partial success: BZ=F missing, other two still returned | Fixture without BZ=F element |
| YF-06 | All 3 symbols fail: returns null | Error client |
| YF-07 | HTTP error: returns null (never throws) | Error client that throws |
| YF-08 | `value` attribute absent: falls back to text content | Fixture with no `value` attr on fin-streamer |
| YF-E5 | Comma in value `"2,341.50"` stripped correctly → 2341.50 | Fixture with comma value |
| YF-09 | `storeCommoditySnapshot` writes to both tables | In-memory SQLite |
| YF-10 | Two calls to `storeCommoditySnapshot`: commodity_prices stays 1 row, history becomes 2 | In-memory SQLite |
| YF-11 | Barrel export: fetchYahooFinancePrices + storeCommoditySnapshot importable from fetchers/index | Import test |
| YF-12 | `fetchedAt` is valid ISO 8601 timestamp | Any fixture |

**Mock pattern** (mirrors `tradingEconomics.ts` tests):
```typescript
function makeHttpClient(html: string) {
  return { get: async (_url: string): Promise<string> => html };
}
function makeErrorHttpClient() {
  return { get: async (_url: string): Promise<string> => { throw new Error("Network error"); } };
}
```

### Task 028 — `src/__tests__/028-sbv-rates.test.ts` (14 test cases: SBV-01 through SBV-14)

| ID | Scenario | Mock |
|----|----------|------|
| SBV-01 | Happy path: overnight + refinancing + official FX all present | Both pages with valid data |
| SBV-02 | `overnightRatePct` parses correctly | IR page with overnight row |
| SBV-03 | `refinancingRatePct` parses correctly | IR page with refinancing row |
| SBV-04 | `usdVndOfficial` parses central rate correctly | FX page with USD row |
| SBV-05 | Both pages fail: returns null | Error client |
| SBV-06 | IR page fails, FX page succeeds: rates=0, usdVndOfficial>0 (not null) | Partial mock |
| SBV-07 | FX page fails, IR page succeeds: usdVndOfficial=0, rates>0 (not null) | Partial mock |
| SBV-08 | Vietnamese labels `"qua đêm"` / `"tái cấp vốn"` parsed correctly | VI fixture |
| SBV-09 | refinancingRatePct not contaminated by discount/chiết khấu row above it | Ambiguous IR fixture |
| SBV-E3 | VN decimal `"25.450,50"` normalised to 25450.5 | FX fixture with VN number |
| SBV-10 | `storeSbvSnapshot` writes to both tables | In-memory SQLite |
| SBV-11 | Two calls: sbv_rates stays 1 row, sbv_rates_history becomes 2 | In-memory SQLite |
| SBV-12 | Barrel export: fetchSbvRates + storeSbvSnapshot importable | Import test |
| SBV-13 | VN number format `"25.450"` → 25450 (dots as thousands separator) | FX fixture |
| SBV-14 | `fetchedAt` is valid ISO 8601 timestamp | Any fixture |

**Two-page mock pattern:**
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

### Task FIX-081 — acceptance: 10 consecutive passes

No new test file. Only `src/__tests__/081-bun-mcp-server.test.ts` is modified. The acceptance criterion is `bun test src/__tests__/081-*.test.ts` passes 10 consecutive runs without timeout failure. Verify with:
```bash
for i in $(seq 1 10); do bun test src/__tests__/081-bun-mcp-server.test.ts || break; done
```

### Task 126 — `src/__tests__/126-macro-cascade.test.ts`

| Scenario | Assertions |
|----------|-----------|
| High Brent (>$90): oil_gas confidence boosted +0.10 | Spy on chain entries for oil_gas domain |
| High Brent (>$90): aviation confidence reduced -0.08 | Spy on chain entries for aviation domain |
| Low Brent (<$70): oil_gas confidence reduced -0.10 | Chain entries for oil_gas |
| Low Brent (<$70): aviation confidence boosted +0.06 | Chain entries for aviation |
| High gold (>$2000): gold_mining confidence boosted +0.05 | Chain entries for gold_mining |
| High refi rate (>6%): banking confidence -0.08, real_estate -0.10 | Chain entries |
| Low refi rate (<4%): banking confidence +0.06, real_estate +0.08 | Chain entries |
| Null MacroContext: zero adjustments, same as baseline | Diff vs pre-macro run |
| Fetcher failure: chain completes, warning logged | Mock fetcher that throws |
| Confidence clamped to [0.05, 0.99] | Extreme macro values (brent=$200) |
| Reasoning annotation present when adjustment applied | String contains "[Macro: brentCrudeUSD=..." |
| runImpactChain passes macroContext to buildCausalChain | Mock commodityFetcher + sbvFetcher injected via RunCascadeInput |

Inject mocked fetchers via `RunCascadeInput.commodityFetcher` and `RunCascadeInput.sbvFetcher`. No network calls. Use a minimal watchlist with at least one oil_gas stock and one banking stock.

### Task 089 — `src/__tests__/089-tool-macro.test.ts`

| Scenario | Assertions |
|----------|-----------|
| Happy path: both fetchers succeed, text output contains all sections | Text includes "[Commodity Prices]" + "[SBV Central Bank Rates]" + "[Macro Signal Summary]" |
| Commodity fetcher fails: commodity section shows N/A, rates section present | Partial mock |
| SBV fetcher fails: rates section shows N/A, commodity section present | Partial mock |
| Both fetchers fail: returns error-friendly text (no throw) | Both mocks throw |
| Tool is registered with name "get_macro_snapshot" | Check McpServer._registeredTools |
| Tool count = 17 after registerMacroTools | createBunServer().toolCount === 17 |
| High Brent (>$90) produces correct Macro Signal Summary line | Mock with brentCrudeUSD=95 |
| High refi rate (>6%) produces correct Macro Signal Summary line | Mock with refinancingRatePct=7 |

---

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Yahoo Finance HTML structure changes (fin-streamer elements renamed/removed) | High | Medium | Use JSON API (`query1.finance.yahoo.com/v8/finance/chart/`) as primary — more stable than HTML attributes. Cache fixture HTML/JSON in test files so scraper regression is immediately visible. |
| Yahoo Finance JSON API rate limiting or CORS block | Medium | Medium | Add `User-Agent: Mozilla/5.0 ...` header and `timeout: 15_000`. Return null gracefully. Add `Referer: https://finance.yahoo.com` header to mimic browser. |
| SBV portal HTML structure differs between EN and VI language | Medium | Medium | Use `Accept-Language: en` header. Build dual-label parser (EN + VI labels) per SBV-08. |
| SBV portal slow response (government site, can be >10s) | High | Low | 15-second timeout matches tradingEconomics pattern. Return partial snapshot (null fields) on timeout — never block the cascade. |
| `logistics` and `gold_mining` DomainType values break existing discriminated union exhaustiveness checks | Low | Medium | Audit existing switch statements on DomainType in codebase before task 126 PR. Only `bctc-schema.ts` and `cascadeEngine.ts` reference this type directly — no other switch statements found in brownfield analysis. |
| Task 089 tool count assertion hardcoded at 17 — fails if future tasks add tools before 089 merges | Low | Low | Make test assert `toolCount >= 17` or assert `"get_macro_snapshot" in _registeredTools` instead of numeric count. |
| runImpactChain now makes 2 extra HTTP calls on every invocation (adds up to 30s latency) | Low | High | Both fetchers are called via `Promise.all` (parallel). Maximum added latency = max(yahoo_timeout, sbv_timeout) = 15s worst case. In production, consider injecting cached values (Sprint 009 scheduler). For Sprint 008 MVP, the never-throw contract ensures the chain completes even if fetchers time out. |
| MacroContext assembly: `usdVndMarket` field name vs `CommoditySnapshot.usdVndRate` | Low | Medium | The mapping `usdVndMarket ← commodity.usdVndRate` is explicit in `runImpactChain.ts`. Document the rename in a comment. `MacroContext` uses `usdVndMarket` to distinguish from `usdVndOfficial` (SBV rate) — this is intentional and correct. |

---

## Security Review

- [ ] SQL parameterized? **Yes** — all SQLite queries use `?` placeholders (same pattern as `tradingEconomics.ts`).
- [ ] File paths validated (no `../`)? **Yes** — no user-supplied file paths in any new file.
- [ ] External HTTP rate-limited? **Partial** — 15-second timeout enforced. No retry loop (single call per invocation). Rate limiting on Yahoo Finance / SBV is handled by returning null on failure.
- [ ] Secrets via Bun.env only? **Yes** — no hardcoded credentials. `YAHOO_FINANCE_BASE_URL` and `SBV_BASE_URL` are test-only overrides with safe defaults.
- [ ] XSS/injection in MCP tool output? **N/A** — output is plain text formatted for Claude consumption, not rendered as HTML.
- [ ] DDD layer violations? **No** — `MacroContext` is a pure domain type (no infrastructure import). Infrastructure fetchers do not import from domain or application. Application layer uses dynamic imports to avoid circular dependency.
