# TASK_1838a — Architect Design Gate: getDb() Repository Pattern Refactor

> Sprint: 1838 | Owner: architect | Type: ARCH | Priority: P0 | Size: SPRINT-L gate
> Created: 2026-05-03 | Created by: po

---

## Context

`getDb()` is the most connected node in the codebase with **224 dependency edges**. Domain code directly imports `getDb()` from the infrastructure layer, violating DDD's golden rule:

> `domain/` must have zero imports from `infrastructure/`

This creates tight coupling, makes unit testing difficult (real SQLite required), and risks cascading failures on any schema change.

U-4 is categorised SPRINT-L and was deferred from Sprint 1836 specifically because it requires an Architect design session before any implementation. This task IS that design session.

---

## Your Job (Architect)

Produce a complete design document at `docs/architecture/1838a-repository-pattern.md` covering all sections below. PO will review and approve before spawning developer for implementation.

---

## Required Design Outputs

### 1. Top-5 Coupling Analysis

Identify the 5 files (or modules) with the highest direct `getDb()` call frequency. Use Semble or Grep to enumerate all `getDb()` call sites. For each of the top 5, document:

- File path
- Number of `getDb()` calls
- Domain concept served (e.g. stock prices, alerts, positions)
- Proposed repository interface name

### 2. Repository Interface Definitions

For each of the top 5 files, define the TypeScript interface that would replace direct `getDb()` calls. Interfaces must live in `domain/repositories/`. Example structure:

```typescript
// domain/repositories/IStockPriceRepository.ts
export interface IStockPriceRepository {
  getLatest(ticker: string): Promise<StockPrice | null>;
  getRange(ticker: string, from: Date, to: Date): Promise<StockPrice[]>;
  upsert(price: StockPrice): Promise<void>;
}
```

### 3. SQLite Adapter Placement

Define where SQLite implementations live: `infrastructure/db/repositories/`. Document the naming convention (e.g. `SqliteStockPriceRepository.ts`).

### 4. Constructor Injection Pattern

Document how services receive repositories. Prefer constructor injection over service locator. Show a before/after example for one of the top-5 files.

### 5. Migration Strategy

Define the phased rollout:
- Phase 1: top-5 files (this sprint, developer task)
- Phase 2: remaining files (future sprints)
- How to prevent regression during migration (test strategy)
- Whether existing tests need updates or just new mocks

### 6. Risk Assessment

- Circular dependency risks
- Files that call `getDb()` in static initializers (harder to inject)
- Any files where injection is impractical (document exceptions with rationale)

---

## Acceptance Criteria

- [ ] AC-1: Design document exists at `docs/architecture/1838a-repository-pattern.md`
- [ ] AC-2: Top-5 coupled files identified with call counts
- [ ] AC-3: TypeScript interface signatures defined for all top-5 (no implementation, only interfaces)
- [ ] AC-4: SQLite adapter naming convention documented
- [ ] AC-5: Constructor injection pattern shown with before/after example
- [ ] AC-6: Phased migration strategy defined
- [ ] AC-7: Risk assessment covers circular deps + static init edge cases
- [ ] AC-8: Design reviewed by PO and status updated to APPROVED in the document

---

## PO Approval Gate

After producing the design document, return to PO via caveman with:

```
RETURN
DONE: Architecture design for 1838a complete — docs/architecture/1838a-repository-pattern.md
NEXT: po | review and approve design, then spawn developer for implementation
HANDOFF: docs/handoffs/TASK_1838a.md
PIPELINE: continue
PIPELINE_STATE_WRITE: [confirm written]
```

PO will review, approve or request changes, then spawn developer with an implementation task (1838b).

---

## Reference

- `docs/UPGRADE_PLAN.md` U-4 section — original problem statement and acceptance criteria
- `.claude/knowledge/fail-loud-protocol.md` — if getDb() analysis tool returns unexpected results, fail loud
- `docs/ARCHITECTURE.md` — current system architecture context

---

## [Architect] Design Record

**Completed:** 2026-05-03

**Key findings:**
- 302 source files contain `getDb()` calls (902 call-site occurrences excluding tests)
- Domain layer is already clean — zero `getDb()` imports inside `domain/`
- `domain/repositories/` directory pre-exists with empty barrel — pattern was pre-anticipated
- Top-5 by call count: `vnstockStore.ts` (18), `server.ts` (16), `kinhDichTools.ts` (10), `hexagramStore.ts` (8), `scanMarket.ts` (7)
- `server.ts` reclassified as Phase 2 (god-object risk); `scanMarket.ts` + `kinhDichTools.ts` score helpers elevated to Phase 1
- Default-parameter injection recommended for `kinhDichTools.ts` to avoid breaking standalone function callers
- Sprint split confirmed: 1838a (this design gate) + 1838b (Phase 1 implementation)

**Design document:** `docs/architecture/1838a-repository-pattern.md`

**AC status:**
- AC-1 through AC-7: COMPLETE
- AC-8: PENDING PO approval

**Next:** pm reviews design, then spawns developer for 1838b implementation task
