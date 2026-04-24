# TECH-105: fix(test-timeout) — Eliminate 4 persistent 30s timeouts in test 137 Step E suite

status: APPROVED_BY_ARCHITECT
req_ref: REQ-105

## Brownfield Impact

- Files modified: `src/__tests__/137-fix-alert-pipeline.test.ts`
- Files created: none
- Files deleted: none
- Breaking changes: no

## Architecture Decision

The two 30-second-timeout root causes are both test-isolation failures, not production bugs. The fix is entirely in the test file: setting `DB_PATH=:memory:` before module resolution prevents `schema.js` from opening the production SQLite file on import, and injecting `getRecentAlertHistoryFn: async () => []` in all 6 Step E fixtures short-circuits the `else` branch at `intelligenceCycleJob.ts:820–833` that calls `getCooldownDb()` (a live `getDb()`). Both patterns are already established in the codebase (`src/__tests__/1192-*.test.ts` line 9 for the env pattern; the `getRecentAlertHistoryFn` optional dep at `intelligenceCycleJob.ts:123`).

## DDD Layer Plan

| Component | Layer | File Path | New/Modify |
|-----------|-------|-----------|------------|
| DB_PATH guard | test | `src/__tests__/137-fix-alert-pipeline.test.ts` line 1 | MODIFY |
| getRecentAlertHistoryFn injection (6 fixtures) | test | `src/__tests__/137-fix-alert-pipeline.test.ts` lines 282–455 | MODIFY |

No production files touched. `intelligenceCycleJob.ts`, `alertStore.ts`, `schema.ts`, `alertCooldown.ts` remain unchanged.

## Interface Contracts

No new interfaces. No production code changes.

The injected stub `getRecentAlertHistoryFn: async () => []` is type-compatible with the existing optional dep:

```typescript
// intelligenceCycleJob.ts line 123 — existing, unchanged
getRecentAlertHistoryFn?: () => Promise<Array<{ stocks: string; signalTypes: string; triggeredAt: string }>>;

// stub injected in all 6 Step E fixtures — empty array satisfies the return type
getRecentAlertHistoryFn: async () => [],
```

## Task Breakdown (for PM)

Single atomic task — no dependencies between the two changes, both land in the same commit:

| # | Task | File | Change |
|---|------|------|--------|
| 1328 | FR-1: add `process.env["DB_PATH"] = ":memory:";` as absolute first line | `137-fix-alert-pipeline.test.ts` line 1 | insert before JSDoc block |
| 1328 | FR-2: inject `getRecentAlertHistoryFn: async () => []` in all 6 Step E `runIntelligenceCycle` calls | `137-fix-alert-pipeline.test.ts` lines 282–455 | add key to deps objects |

Both changes are in task 1328 (already in TASKS.md as Todo). No sub-tasks required.

## Exact Change Specification

### FR-1 — File header

Insert as line 1 (push JSDoc to line 3, blank line on line 2):

```typescript
process.env["DB_PATH"] = ":memory:";

/**
 * Task 137 — Fix Step E: ...
```

Pattern reference: `src/__tests__/1192-*.test.ts` line 9 uses identical `process.env["DB_PATH"] = ":memory:";`.

### FR-2 — Six Step E fixtures

All 6 `runIntelligenceCycle({ ... })` calls in the `"Task 137 — Step E"` describe block (lines 270–456 in the original, shifted by +2 after FR-1) need one key added to their deps object:

```typescript
getRecentAlertHistoryFn: async () => [],
```

Placement: after `getWatchlistCodesFn` and before any closing `}` of the deps object, consistent across all 6 calls.

Affected test names:
1. "passes DB alerts to sendAlertsFn and returns correct count (AC-1)" — original line 282
2. "marks alerts as notified_telegram = 1 after successful send (AC-1)" — original line 315
3. "second cycle sends 0 alerts after first marks them notified (AC-1 idempotency)" — original line 347
4. "does not mark alert when sendAlertsFn returns 0 (AC-2)" — original line 383
5. "telegramAlertsSent = 0 when no unnotified HIGH/CRITICAL alerts exist" — original line 409
6. "Step E runs unconditionally (even outside market hours)" — original line 430

Tests 5 and 6 currently pass (no alerts → loop body never reaches `getCooldownDb()`). The injection is defensive correctness — if the loop precondition ever changes these tests will not regress silently.

## Root Cause Trace

```
runIntelligenceCycle (Step E)
  └─ no getRecentAlertHistoryFn in deps
       └─ else branch (line 820-833 intelligenceCycleJob.ts)
            └─ getCooldownDb() → getDb() → schema.js opens production SQLite
                 └─ WAL replay on real DB file → 30s CYCLE_TIMEOUT hit
```

FR-1 (`:memory:`) makes the real DB harmless even if reached. FR-2 prevents reaching it entirely. Both are required because FR-1 alone does not prevent the `else` branch from executing; it only makes the fallback DB path safe.

## Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| `process.env` assignment after any import → env var not seen by schema.js | High if misplaced | High | Placement must be absolute line 1, before all `import` statements — verified by pattern in 1192 test |
| `getRecentAlertHistoryFn: async () => []` type error (strict TS) | Low | Low | Return type is `Promise<Array<...>>` — empty array `[]` is assignable; verified at intelligenceCycleJob.ts:123 |
| Schema migration describe block conflicts with FR-1 env override | None | None | That block uses `Bun.env["DB_PATH"]` save/restore after module-level env is already `:memory:` — safe by design |
| Assertions or mock behaviours accidentally modified | Low | Medium | FR-3: only `getRecentAlertHistoryFn: async () => []` key is added; no existing keys removed or modified |

## Security Review

- [ ] SQL parameterized? N/A — test file only, no new SQL
- [ ] File paths validated (no `../`)? N/A
- [ ] External HTTP rate-limited? N/A
- [ ] Secrets via Bun.env only? N/A — `:memory:` is not a secret
