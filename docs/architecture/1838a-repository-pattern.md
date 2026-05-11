# Architecture Design: 1838a — getDb() Repository Pattern Refactor

> Status: PENDING_PO_APPROVAL
> Author: architect
> Sprint: 1838
> Created: 2026-05-03

---

## 0. Findings Summary

`getDb()` appears in **302 source files** with roughly **902 unique call-site occurrences** (excluding tests). The domain layer itself is already clean — no `getDb()` calls inside `apps/mcp-server/src/domain/`. The violations are concentrated in the **application** and **interface** layers, plus the scheduler. The `domain/repositories/` directory already exists with a placeholder barrel `index.ts`, confirming the architectural intent was established but never populated.

This is a large-scale refactor. Sprint 1838 must be scoped conservatively to the top-5 files only (Phase 1). The remainder is Phase 2+ work tracked via future sprints.

---

## 1. Coupling Analysis — Top-5 Files

Files ranked by direct `getDb()` call count in production source (tests excluded).

| Rank | File | Calls | Domain Concept | Proposed Interface |
|------|------|-------|----------------|--------------------|
| 1 | `interface/mcp/server.ts` | 16 | HTTP route dispatch — prices, foreign flow, watchlist, inline queries | `IWatchlistRepository`, `IMarketPriceRepository` |
| 2 | `infrastructure/db/vnstockStore.ts` | 18 | Vnstock financial data (PE ratios, officers, balance sheet, cash flow) | `IVnstockRepository` |
| 3 | `interface/mcp/tools/kinhdich/kinhDichTools.ts` | 10 | Kinh Dich score computation (sentiment, fundamentals, price, foreign flow, macro) | `IKinhDichScoreRepository` |
| 4 | `application/usecases/scanMarket.ts` | 7 | Market scan — watchlist read, volume history, conviction history, price-news validation | `IWatchlistRepository`, `IMarketPriceRepository` |
| 5 | `infrastructure/db/hexagramStore.ts` | 8 | Kinh Dich readings and Markov transition matrix | `IHexagramRepository` |

**Notes on classification:**

- `startScheduler.ts` (41 calls) is excluded from Top-5 because its calls are all pass-through to `recordJobRun(getDb(), ...)` — the coupling is at the scheduler orchestration layer (interface), not business logic. Migrating it is a Phase 2 mechanical substitution.
- `infrastructure/db/alertStore.ts` (8 calls) is already an infrastructure adapter with `db` parameter injection on most public functions. It uses the default-parameter pattern (`db: Database = getDb()`). This is an acceptable existing pattern; the remaining bare `getDb()` calls there are in private helpers. Phase 2.
- `vnstockStore.ts` is classified infrastructure-internal but ranks high and all its public functions already accept an optional injected db parameter on some paths; it needs a full repository interface to complete the pattern.

---

## 2. Repository Interface Definitions

All interfaces live in `apps/mcp-server/src/domain/repositories/`. They are pure TypeScript — no imports from `infrastructure/`, only domain model types.

### 2.1 IWatchlistRepository

Serves `scanMarket.ts` (watchlist read) and `server.ts` (watchlist + context stock listing).

```typescript
// apps/mcp-server/src/domain/repositories/IWatchlistRepository.ts

export interface WatchlistEntry {
  code: string;
  domain: string;
}

export interface IWatchlistRepository {
  /** Return all watchlist entries (code + domain). Empty array if table missing. */
  getAll(): WatchlistEntry[];

  /** Return all watchlist codes plus reference/context stock codes for VPS dispatch. */
  getAllCodesForVps(): { watchlist: string[]; reference: string[] };
}
```

### 2.2 IMarketPriceRepository

Serves `scanMarket.ts` (volume history, conviction history insert) and `server.ts` (inline price queries).

```typescript
// apps/mcp-server/src/domain/repositories/IMarketPriceRepository.ts

export interface VolumeHistory {
  avgVolume: number;
}

export interface ConvictionRecord {
  symbol: string;
  date: string;
  peakScore: number;
  dominantSignal: string;
  createdAt: string;
}

export interface RecentNewsTitle {
  sourceTitle: string;
}

export interface IMarketPriceRepository {
  /**
   * Compute rolling average volume for a stock, excluding today's open session.
   * Returns 0 when fewer than minHistoryRows closed days exist.
   */
  getAvgVolume(code: string, todayUtc: string, historyLimit: number, minHistoryRows: number): number;

  /**
   * Upsert a conviction history row (INSERT OR REPLACE).
   */
  upsertConvictionHistory(record: ConvictionRecord): void;

  /**
   * Fetch recent news titles from rag_analyses for a stock within the last N hours.
   */
  getRecentNewsTitles(code: string, withinHours: number, limit: number): RecentNewsTitle[];
}
```

### 2.3 IVnstockRepository

Serves `vnstockStore.ts` — the infrastructure store itself becomes an adapter implementing this port.

```typescript
// apps/mcp-server/src/domain/repositories/IVnstockRepository.ts

import type {
  VnstockFinancials,
  VnstockTradingStats,
  VnstockOfficer,
  VnstockShareholder,
  VnstockEvent,
  VnstockBalanceSheet,
  VnstockCashFlow,
} from "../../infrastructure/fetchers/vnstockBridge.js";

export interface IVnstockRepository {
  getLatestFinancials(code: string): VnstockFinancials | null;
  getLatestTradingStats(code: string): VnstockTradingStats | null;
  getOfficers(code: string): VnstockOfficer[];
  getShareholders(code: string): VnstockShareholder[];
  getEvents(code: string): VnstockEvent[];
  getLatestBalanceSheet(code: string): VnstockBalanceSheet | null;
  getLatestCashFlow(code: string): VnstockCashFlow | null;
  upsertFinancials(data: VnstockFinancials): void;
  upsertTradingStats(data: VnstockTradingStats): void;
}
```

**Important:** `IVnstockRepository` imports from `infrastructure/fetchers/vnstockBridge.js` for its type parameters. This is a pragmatic exception: moving those types to a domain model file would require large-scale type migration. For Phase 1, keep the import; document it as a known tech-debt item for Phase 3.

### 2.4 IKinhDichScoreRepository

Serves `kinhDichTools.ts` score helpers (`computeSentimentScore`, `computeFundamentalsScore`, `computePriceScore`, `computeForeignFlowScore`, etc.).

```typescript
// apps/mcp-server/src/domain/repositories/IKinhDichScoreRepository.ts

export interface SentimentRow {
  sentiment: string;
}

export interface FundamentalsRow {
  pe: number | null;
}

export interface PriceRow {
  changePct: number | null;
}

export interface TradingStatsRow {
  foreignVolume: number | null;
  avgVolume2w: number | null;
}

export interface MacroRow {
  value: number | null;
  indicator: string;
}

export interface IKinhDichScoreRepository {
  /** Recent sentiment metadata for stock from rag_analyses (last 7 days). */
  getRecentSentiments(code: string, days: number, limit: number): SentimentRow[];

  /** Latest PE ratio for a stock from vnstock_financials. */
  getLatestPe(code: string): FundamentalsRow | null;

  /** Average PE for all stocks in a domain (sector proxy). */
  getSectorPeList(domain: string, limit: number): FundamentalsRow[];

  /** Latest change_pct from market_prices. */
  getLatestChangePct(code: string): PriceRow | null;

  /** Latest foreign flow vs avg volume from vnstock_trading_stats. */
  getLatestTradingStats(code: string): TradingStatsRow | null;

  /** Latest macro indicator value (e.g. GDP growth, inflation). */
  getLatestMacroIndicator(indicator: string): MacroRow | null;

  /** Domain for a watchlist stock. */
  getWatchlistDomain(code: string): string | null;

  /** Lookup market prices for a set of codes for sector-wide Kinh Dich context. */
  getMarketPricesForCodes(codes: string[]): Array<{ code: string; changePct: number }>;
}
```

### 2.5 IHexagramRepository

Serves `hexagramStore.ts` (readings CRUD and Markov transition matrix).

```typescript
// apps/mcp-server/src/domain/repositories/IHexagramRepository.ts

export interface KinhDichReadingRow {
  stockCode: string;
  hexagramNumber: number;
  hoQueNumber: number;
  bienQueNumber: number;
  haoStates: string;
  rawScores: string;
  nguHanhDynamic?: string;
  tradingSignal?: string;
  confidence?: number;
  actionNote?: string;
  source?: 'manual' | 'cycle';
}

export interface TransitionRow {
  fromHexagram: number;
  toHexagram: number;
  count: number;
}

export interface IHexagramRepository {
  storeReading(row: KinhDichReadingRow): void;
  getLatestReading(stockCode: string): KinhDichReadingRow | null;
  recordTransition(stockCode: string, fromHexagram: number, toHexagram: number): void;
  getTopTransitions(stockCode: string, fromHexagram: number, topN: number): TransitionRow[];
  getReadingsForBacktest(stockCode: string): KinhDichReadingRow[];
}
```

---

## 3. SQLite Adapter Placement and Naming Convention

### Location

All SQLite adapter implementations live under:

```
apps/mcp-server/src/infrastructure/db/repositories/
```

### Naming Convention

| Interface | Adapter file |
|-----------|-------------|
| `IWatchlistRepository` | `SqliteWatchlistRepository.ts` |
| `IMarketPriceRepository` | `SqliteMarketPriceRepository.ts` |
| `IVnstockRepository` | `SqliteVnstockRepository.ts` |
| `IKinhDichScoreRepository` | `SqliteKinhDichScoreRepository.ts` |
| `IHexagramRepository` | `SqliteHexagramRepository.ts` |

Each adapter:
- Accepts a `Database` instance via constructor injection
- Implements its corresponding domain interface exactly
- Never imports from `domain/` except to reference the interface it implements
- Barrel-exported from `infrastructure/db/repositories/index.ts`

### Example Adapter Skeleton

```typescript
// apps/mcp-server/src/infrastructure/db/repositories/SqliteWatchlistRepository.ts

import type { Database } from "bun:sqlite";
import type { IWatchlistRepository, WatchlistEntry } from "../../../domain/repositories/IWatchlistRepository.js";

export class SqliteWatchlistRepository implements IWatchlistRepository {
  constructor(private readonly db: Database) {}

  getAll(): WatchlistEntry[] {
    try {
      return this.db
        .query<{ code: string; domain: string }, []>("SELECT code, domain FROM watchlist")
        .all()
        .map((r) => ({ code: r.code, domain: r.domain || "other" }));
    } catch {
      return [];
    }
  }

  getAllCodesForVps(): { watchlist: string[]; reference: string[] } {
    // ... implementation
    return { watchlist: [], reference: [] };
  }
}
```

---

## 4. Constructor Injection Pattern

### Principle

Services and use cases receive repositories through constructor parameters or function parameters, not by calling `getDb()` internally. The production wiring point is at the composition root (server startup or scheduler init).

### Before/After: `scanMarket.ts`

**Before (current — DDD violation)**

```typescript
// application/usecases/scanMarket.ts

function getWatchlistEntries(): WatchlistItem[] {
  const db = getDb();                              // violation: direct infra call
  const rows = db.query<...>("SELECT code, domain FROM watchlist").all();
  return rows.map((r) => ({ actionCode: r.code, domain: r.domain as DomainType }));
}

export function getAvgVolumeSync(code: string, todayUtc?: string): number {
  const db = getDb();                              // violation: direct infra call
  // ... queries market_prices_history
}

export async function scanMarket(options: ScanMarketOptions = {}): Promise<MarketScanResult> {
  const watchlistEntries = getWatchlistEntries();
  // ...
  const imfMacroScore = getImfMacroScoreForConviction(getDb());  // violation
  // ...
}
```

**After (target)**

```typescript
// application/usecases/scanMarket.ts

export interface ScanMarketDeps {
  watchlistRepo: IWatchlistRepository;
  marketPriceRepo: IMarketPriceRepository;
  fetchPrices?: PriceFetcher;
}

export async function scanMarket(deps: ScanMarketDeps): Promise<MarketScanResult> {
  const watchlistEntries = deps.watchlistRepo.getAll();
  // ...
  const avgVolume = deps.marketPriceRepo.getAvgVolume(code, today, 20, 5);
  // ...
}
```

**Production wiring** (in `startScheduler.ts` or wherever `scanMarket` is called):

```typescript
import { getDb } from "../infrastructure/db/schema.js";
import { SqliteWatchlistRepository } from "../infrastructure/db/repositories/SqliteWatchlistRepository.js";
import { SqliteMarketPriceRepository } from "../infrastructure/db/repositories/SqliteMarketPriceRepository.js";

const db = getDb();
await scanMarket({
  watchlistRepo: new SqliteWatchlistRepository(db),
  marketPriceRepo: new SqliteMarketPriceRepository(db),
});
```

**Test wiring** (in-memory mock):

```typescript
const mockWatchlistRepo: IWatchlistRepository = {
  getAll: () => [{ code: "VCB", domain: "banking" }],
  getAllCodesForVps: () => ({ watchlist: ["VCB"], reference: [] }),
};
const mockMarketPriceRepo: IMarketPriceRepository = {
  getAvgVolume: () => 1000000,
  upsertConvictionHistory: () => {},
  getRecentNewsTitles: () => [],
};
await scanMarket({ watchlistRepo: mockWatchlistRepo, marketPriceRepo: mockMarketPriceRepo });
```

No real SQLite required for unit tests.

---

## 5. Phased Migration Strategy

### Phase 1 — Sprint 1838 (this sprint, developer task 1838b)

Scope: top-5 files only. Goal: validate pattern, keep tests green, no regressions.

| Step | Action | Files |
|------|--------|-------|
| 1a | Create `domain/repositories/` interfaces (5 files) | New files in `domain/repositories/` |
| 1b | Create `infrastructure/db/repositories/` adapters (5 files) | New files in `infrastructure/db/repositories/` |
| 1c | Refactor `scanMarket.ts` to accept `ScanMarketDeps` | `application/usecases/scanMarket.ts` |
| 1d | Refactor `kinhDichTools.ts` score helpers to accept repo | `interface/mcp/tools/kinhdich/kinhDichTools.ts` |
| 1e | Wire production deps in callers | `startScheduler.ts`, `server.ts` (specific call sites) |
| 1f | Update affected test files to use mocks | Tests for scanMarket, kinhDichTools |

**Test strategy for Phase 1:**
- Existing tests that pass a real in-memory `Database` continue to work unchanged — the SQLite adapters accept an injected `db` so `:memory:` still works.
- New unit tests for `scanMarket` use mock repos (no DB at all), asserting business logic in isolation.
- No schema changes required. No migration scripts. The adapters only wrap existing queries.

### Phase 2 — Sprint 1840+ (future, not this sprint)

Scope: remaining files with moderate coupling (5–15 calls). Mechanical substitution.

Priority order (lowest blast radius first):
1. `scheduler/startScheduler.ts` — all `recordJobRun(getDb(), ...)` calls → inject `db` at scheduler init
2. `interface/mcp/server.ts` — inline HTTP handlers → inject repos at server startup
3. `infrastructure/db/alertStore.ts` — complete the default-parameter pattern already started
4. `infrastructure/db/vnstockStore.ts` — wrap behind `IVnstockRepository` once adapter exists (Phase 1 creates the interface, Phase 2 migrates callers)
5. All remaining application usecases (checkSscReports, assembleAlertDigest, etc.)

### Phase 3 — Sprint 1845+ (future)

Scope: long-tail — ~200+ files in interface/tools and scheduler that call `getDb()` 1–4 times each. Pattern by then is established; developer can work mechanically.

---

## 6. Risk Assessment

### R-1: Circular Dependency Risk — LOW

Checked: `domain/repositories/` interfaces import only from domain models or root-level `bctc-schema`. No circular path. Infrastructure adapters import from `domain/repositories/` (one direction only). Risk is low.

**Exception:** `IVnstockRepository` imports vnstock types from `infrastructure/fetchers/vnstockBridge.js`. This is a temporary violation; the types should eventually move to `domain/models/vnstockTypes.ts`. Flagged for Phase 3.

### R-2: Static Initializers — MEDIUM

`kinhDichTools.ts` score-computation functions (`computeSentimentScore`, `computeFundamentalsScore`, etc.) call `getDb()` at the top of the function body — not in a static initializer, so they are injectable. However, they are exported as standalone functions used in multiple places. The safest migration approach is to convert them to methods on a `KinhDichScoreService` class that receives `IKinhDichScoreRepository` via constructor. This is a design change that must be planned carefully in 1838b to avoid breaking existing callers.

**Alternative:** Keep the functions standalone but add a `repo` parameter with a default that calls the SQLite adapter. Lower migration risk but doesn't achieve full DI purity.

For Sprint 1838, the **default-parameter approach** is recommended to minimize blast radius:

```typescript
export function computeSentimentScore(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number { ... }
```

This is injectable in tests, backward-compatible for callers, and avoids a class refactor in one sprint.

### R-3: `server.ts` God Object — HIGH RISK

`server.ts` has 16 `getDb()` calls scattered across inline HTTP handler bodies (lines 285–1254). Full refactor requires extracting those handlers into dedicated handler classes or functions with injected repos. This is a separate architectural task. Phase 1 of Sprint 1838 should NOT touch `server.ts` — it is classified Phase 2.

Rationale: `server.ts` already passes `getDb()` as a parameter to `handleWebhook`, `handlePushPrices`, `handlePushForeignFlow` — those callers already receive `db` by injection. The remaining inline usages are local to the HTTP server bootstrap and acceptable at the interface layer where `getDb()` is permitted.

### R-4: `vnstockStore.ts` Self-Reference — MEDIUM

`vnstockStore.ts` is an infrastructure module that already uses `db` injection on some functions (via the optional `injectedDb?: ReturnType<typeof getDb>` pattern). Phase 1 creates the `IVnstockRepository` interface and the `SqliteVnstockRepository` adapter. Migrating callers of `vnstockStore.ts` functions is Phase 2 — callers are spread across scheduler and application layers.

### R-5: Default Parameter Anti-Pattern in alertStore.ts — LOW

`alertStore.ts` uses `db: Database = getDb()` on public functions. This is a well-established pattern that already makes the functions testable. It is not a DDD violation (alertStore is infrastructure). Leave as-is; do not change in Phase 1.

### R-6: Test Count — LOW

The test suite has 8,539+ passing tests. Phase 1 adds new interface and adapter files (net-new, no breakage), modifies 2–3 existing files (`scanMarket.ts`, `kinhDichTools.ts` score helpers), and updates their corresponding test files. Estimated test impact: 10–20 test files need minor updates; no tests should be deleted.

---

## 7. Scope Decision

**This sprint (1838) splits into two tasks:**

| Task | Owner | Scope |
|------|-------|-------|
| **1838a** (this document) | architect | Design only — this document |
| **1838b** | developer | Phase 1 implementation — interfaces + adapters + migrate scanMarket + kinhDich score helpers + wire production + update tests |

**Sprint 1838 does NOT include:**
- `server.ts` refactor (Phase 2)
- `startScheduler.ts` refactor (Phase 2)
- Any Phase 3 long-tail migration

The scope decision is driven by blast-radius control: modifying `server.ts` and `startScheduler.ts` in the same sprint as creating new repository interfaces would make rollback difficult if issues arise.

---

## 8. File Checklist for 1838b Developer

### New files to create

```
apps/mcp-server/src/domain/repositories/IWatchlistRepository.ts
apps/mcp-server/src/domain/repositories/IMarketPriceRepository.ts
apps/mcp-server/src/domain/repositories/IVnstockRepository.ts
apps/mcp-server/src/domain/repositories/IKinhDichScoreRepository.ts
apps/mcp-server/src/domain/repositories/IHexagramRepository.ts

apps/mcp-server/src/infrastructure/db/repositories/SqliteWatchlistRepository.ts
apps/mcp-server/src/infrastructure/db/repositories/SqliteMarketPriceRepository.ts
apps/mcp-server/src/infrastructure/db/repositories/SqliteVnstockRepository.ts
apps/mcp-server/src/infrastructure/db/repositories/SqliteKinhDichScoreRepository.ts
apps/mcp-server/src/infrastructure/db/repositories/SqliteHexagramRepository.ts
apps/mcp-server/src/infrastructure/db/repositories/index.ts
```

### Files to modify

```
apps/mcp-server/src/domain/repositories/index.ts          (re-export all new interfaces)
apps/mcp-server/src/application/usecases/scanMarket.ts     (inject IWatchlistRepository + IMarketPriceRepository)
apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts  (inject IKinhDichScoreRepository via default param)
apps/mcp-server/src/scheduler/startScheduler.ts            (wire SqliteWatchlistRepository at scanMarket call sites only)
```

### Test files to update

```
apps/mcp-server/src/__tests__/103-job-market-scan.test.ts  (pass mock repos)
apps/mcp-server/src/__tests__/302-kinhdich-differentiation-smoke.test.ts
apps/mcp-server/src/__tests__/278-kinhdich-allzero-differentiation.test.ts
```

---

## AC Verification

- [x] AC-1: Design document exists at `docs/architecture/1838a-repository-pattern.md`
- [x] AC-2: Top-5 coupled files identified with call counts (Section 1)
- [x] AC-3: TypeScript interface signatures defined for all top-5 (Section 2)
- [x] AC-4: SQLite adapter naming convention documented (Section 3)
- [x] AC-5: Constructor injection pattern shown with before/after example (Section 4)
- [x] AC-6: Phased migration strategy defined (Section 5)
- [x] AC-7: Risk assessment covers circular deps + static init edge cases (Section 6)
- [ ] AC-8: Design reviewed by PO — PENDING

---

## [Architect] Design Record

- Analyzed 302 source files containing `getDb()` calls
- Domain layer confirmed clean: zero `getDb()` imports inside `domain/`
- `domain/repositories/` directory pre-exists with empty barrel — pattern was anticipated
- Top-5 by call count: `startScheduler.ts` (41, excluded — pass-through), `vnstockStore.ts` (18), `server.ts` (16), `kinhDichTools.ts` (10), `hexagramStore.ts` (8), `scanMarket.ts` (7)
- `server.ts` reclassified as Phase 2 due to god-object risk; `scanMarket.ts` and `kinhDichTools.ts` elevated to Phase 1 as they are the cleanest application-layer targets
- Recommended default-parameter injection for `kinhDichTools.ts` score helpers to avoid breaking standalone function callers in Phase 1
- Sprint split: 1838a (this design) + 1838b (implementation, Phase 1 only)
