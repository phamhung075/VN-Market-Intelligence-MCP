# TASK_1838b — Phase 1 Implementation: getDb() Repository Pattern

> Sprint: 1838 | Owner: developer | Type: REFACTOR | Priority: P0 | Size: SPRINT-L
> Created: 2026-05-03 | Created by: pm
> Design: docs/architecture/1838a-repository-pattern.md

---

## Context

Architect completed 1838a (design gate). Domain layer is already clean — zero `getDb()` imports inside `domain/`. The `domain/repositories/` directory pre-exists with an empty barrel. This task implements Phase 1 of the repository pattern: create 5 domain interfaces, 5 SQLite adapters, migrate the 2 application-layer callers (`scanMarket.ts` and `kinhDichTools.ts` score helpers), wire production, and update affected tests.

**Phase boundary: `server.ts` and `startScheduler.ts` full migration are Phase 2. Do NOT touch those files beyond the minimal wiring required for `scanMarket`.**

---

## Exact Files To Create (11 new files)

### Domain interfaces — `apps/mcp-server/src/domain/repositories/`

```
IWatchlistRepository.ts
IMarketPriceRepository.ts
IVnstockRepository.ts
IKinhDichScoreRepository.ts
IHexagramRepository.ts
```

Copy the exact interface signatures from `docs/architecture/1838a-repository-pattern.md` Sections 2.1–2.5. No implementation — interfaces only.

**Important for `IVnstockRepository.ts`:** imports vnstock types from `infrastructure/fetchers/vnstockBridge.js`. This is a documented Phase 1 pragmatic exception (see design Section 6 R-1).

### SQLite adapters — `apps/mcp-server/src/infrastructure/db/repositories/`

```
SqliteWatchlistRepository.ts
SqliteMarketPriceRepository.ts
SqliteVnstockRepository.ts
SqliteKinhDichScoreRepository.ts
SqliteHexagramRepository.ts
index.ts                          (barrel — re-export all 5 adapters)
```

Each adapter:
- Accepts `db: Database` via constructor (import from `bun:sqlite`)
- Implements its corresponding domain interface exactly
- Wraps the SQL queries currently inline in the source files being migrated
- Catches SQLite errors and returns safe defaults (empty array / null / 0)

**Reference skeleton in design document Section 3.**

---

## Exact Files To Modify (4 files)

### 1. `apps/mcp-server/src/domain/repositories/index.ts`

Re-export all 5 new interfaces:

```typescript
export * from "./IWatchlistRepository.js";
export * from "./IMarketPriceRepository.js";
export * from "./IVnstockRepository.js";
export * from "./IKinhDichScoreRepository.js";
export * from "./IHexagramRepository.js";
```

### 2. `apps/mcp-server/src/application/usecases/scanMarket.ts`

- Introduce `ScanMarketDeps` interface (see design Section 4)
- Replace all `getDb()` calls with `deps.watchlistRepo` and `deps.marketPriceRepo`
- `scanMarket(deps: ScanMarketDeps)` — deps as first (or only) parameter
- Remove the `getDb` import from this file once all call sites are replaced
- Preserve the existing function signature as a compatibility shim if callers outside of scheduler exist (check with Grep first)

**Before/after pattern in design Section 4.**

### 3. `apps/mcp-server/src/interface/mcp/tools/kinhdich/kinhDichTools.ts`

Use default-parameter injection (design Section 6 R-2) to avoid breaking standalone callers:

```typescript
import { SqliteKinhDichScoreRepository } from "../../../../infrastructure/db/repositories/SqliteKinhDichScoreRepository.js";
import { getDb } from "../../../../infrastructure/db/schema.js";

export function computeSentimentScore(
  code: string,
  repo: IKinhDichScoreRepository = new SqliteKinhDichScoreRepository(getDb()),
): number { ... }
```

Apply this pattern to all score-computation helpers that currently call `getDb()` directly:
- `computeSentimentScore`
- `computeFundamentalsScore`
- `computePriceScore`
- `computeForeignFlowScore`
- any additional helpers calling `getDb()` in this file

This is backward-compatible: all existing callers continue working without changes.

### 4. `apps/mcp-server/src/scheduler/startScheduler.ts` — MINIMAL CHANGE ONLY

Wire the repos at the `scanMarket` call site(s) only. Do NOT refactor any other `getDb()` calls in this file (those are Phase 2):

```typescript
import { SqliteWatchlistRepository } from "../infrastructure/db/repositories/SqliteWatchlistRepository.js";
import { SqliteMarketPriceRepository } from "../infrastructure/db/repositories/SqliteMarketPriceRepository.js";

// At the scanMarket call site:
const db = getDb();
await scanMarket({
  watchlistRepo: new SqliteWatchlistRepository(db),
  marketPriceRepo: new SqliteMarketPriceRepository(db),
});
```

---

## Test Files To Update (3 files)

### `apps/mcp-server/src/__tests__/103-job-market-scan.test.ts`

Replace real DB calls with mock repos using the in-memory mock pattern from design Section 4:

```typescript
const mockWatchlistRepo: IWatchlistRepository = {
  getAll: () => [{ code: "VCB", domain: "banking" }],
  getAllCodesForVps: () => ({ watchlist: ["VCB"], reference: [] }),
};
const mockMarketPriceRepo: IMarketPriceRepository = {
  getAvgVolume: () => 1_000_000,
  upsertConvictionHistory: () => {},
  getRecentNewsTitles: () => [],
};
```

Pass `{ watchlistRepo: mockWatchlistRepo, marketPriceRepo: mockMarketPriceRepo }` to `scanMarket()`.

### `apps/mcp-server/src/__tests__/302-kinhdich-differentiation-smoke.test.ts`

Pass a mock `IKinhDichScoreRepository` to each score function being tested. Mock must return representative data that exercises differentiation logic.

### `apps/mcp-server/src/__tests__/278-kinhdich-allzero-differentiation.test.ts`

Pass a mock `IKinhDichScoreRepository` that returns zero/null for all fields to verify all-zero score handling.

---

## New Test File (required)

Create `apps/mcp-server/src/__tests__/1838b-repository-adapters.test.ts`

Test each SQLite adapter with an in-memory database (`:memory:` — set by `setup.ts` preload):

```typescript
// apps/mcp-server/src/__tests__/1838b-repository-adapters.test.ts
import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { SqliteWatchlistRepository } from "../infrastructure/db/repositories/SqliteWatchlistRepository.js";
// ... import all 5 adapters

describe("Task 1838b — Repository Adapters", () => {
  it("SqliteWatchlistRepository.getAll() returns empty array on missing table", () => {
    const db = new Database(":memory:");
    const repo = new SqliteWatchlistRepository(db);
    expect(repo.getAll()).toEqual([]);
  });

  // One happy-path test per adapter (table created in-memory, row inserted, method returns expected value)
  // One error-path test per adapter (missing table or empty DB returns safe default)
});
```

Minimum: 2 tests per adapter = 10 tests total.

---

## Acceptance Criteria

- [ ] AC-1: All 5 domain interface files exist in `domain/repositories/` with exact signatures from design doc
- [ ] AC-2: All 5 SQLite adapter files exist in `infrastructure/db/repositories/` and compile clean (`tsc --noEmit`)
- [ ] AC-3: `infrastructure/db/repositories/index.ts` barrel exports all 5 adapters
- [ ] AC-4: `domain/repositories/index.ts` re-exports all 5 interfaces
- [ ] AC-5: `scanMarket.ts` has zero `getDb()` calls; accepts `ScanMarketDeps`
- [ ] AC-6: `kinhDichTools.ts` score helpers use default-parameter injection; zero bare `getDb()` calls in score functions
- [ ] AC-7: `startScheduler.ts` wires `SqliteWatchlistRepository` + `SqliteMarketPriceRepository` at `scanMarket` call site; no other changes to that file
- [ ] AC-8: `103-job-market-scan.test.ts` passes using mock repos (no real DB)
- [ ] AC-9: `302-kinhdich-differentiation-smoke.test.ts` passes
- [ ] AC-10: `278-kinhdich-allzero-differentiation.test.ts` passes
- [ ] AC-11: New test file `1838b-repository-adapters.test.ts` — minimum 10 tests, all pass
- [ ] AC-12: `bun test` total: >= 8539 pass, 0 new failures introduced
- [ ] AC-13: `tsc --noEmit` exits 0 (no TypeScript errors)
- [ ] AC-14: `server.ts` is NOT modified (Phase 2 boundary)

---

## Phase Boundary Reminder

| In scope (1838b) | Out of scope (Phase 2+) |
|------------------|------------------------|
| 5 domain interfaces | `server.ts` refactor |
| 5 SQLite adapters | Full `startScheduler.ts` migration |
| `scanMarket.ts` migration | `alertStore.ts` remaining calls |
| `kinhDichTools.ts` score helpers | `vnstockStore.ts` caller migration |
| Wire at `scanMarket` call site | Phase 3 long-tail (~200 files) |

---

## Design Reference

Full interface signatures, adapter skeleton, before/after pattern, and risk notes:
`docs/architecture/1838a-repository-pattern.md`

---

## Return Format (after implementation)

```
RETURN
DONE: 1838b — Phase 1 repository pattern implemented
NEXT: qa | verify all ACs, run bun test, confirm 0 new failures
HANDOFF: docs/handoffs/TASK_1838b.md
PIPELINE: continue
PIPELINE_STATE_WRITE: [confirm written]
```
