# TASK_1350a — Fix 73 Failing Tests: mock.module Leak + Missing Reader Injection + Stale Docs

**Sprint:** 1350
**Architect:** 2026-04-27
**Status:** Design complete — ready for developer

---

## Root Cause Analysis

73 tests fail across 3 independent root causes. Each is diagnosable, targeted, and low-risk to fix.

---

## Category A — `mock.module` Schema Contamination (65 tests, 10 files)

### Root Cause

`/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/apps/mcp-server/src/__tests__/1345b-bctc-financial-validation.test.ts`

Line 36 calls:

```typescript
mock.module("../infrastructure/db/schema.js", () => {
  const db = new Database(":memory:");
  // only creates financial_reports table
  return { getDb: () => db, initDatabase: () => Promise.resolve(), closeDb: () => {} };
});
```

In Bun 1.3.x, `mock.module()` replaces the module in the **process-wide module registry** for the remainder of the worker's lifetime. There is no `afterAll` that restores it. All test files at positions 112–121 in execution order that import `schema.js` receive the stub, which has only `financial_reports` — no `alerts`, `rag_analyses`, `telegram_reports`, `market_messages`, `daily_ohlcv`, `imf_indicators`, `watchlist`, etc.

### Affected files (poisoned, not broken themselves)

- `FIX-1305-review-id-coerce.test.ts` (3 tests: `market_messages` missing)
- `002-db-schema.test.ts` (10 tests: `rag_analyses`, views, indexes missing)
- `1043-schema-ddl-consolidation-2.test.ts` (8 tests: `trade_exposures`, `cascade_rule_hits` missing)
- `227-report-webhook.test.ts` (11 tests: `telegram_reports` missing)
- `FIX-HEALTH-MONITOR.test.ts` (4 tests: `daily_ohlcv` missing)
- `086-tool-alerts.test.ts` (19 tests: `rag_analyses`, `alerts` missing)
- `1045-schema-ddl-consolidation-3.test.ts` (8 tests: `bond_maturity`, `pharma_events` missing)
- `1296b-imf-integration.test.ts` (2 tests: `imf_indicators` missing)

### Fix — Category A

**File to edit:** `apps/mcp-server/src/__tests__/1345b-bctc-financial-validation.test.ts`

**Remove** the `mock.module("../infrastructure/db/schema.js", ...)` block entirely (lines 36–116).

**Replace** the test setup with a proper `beforeEach`/`afterEach` using real `initDatabase()`:

```typescript
import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

// Telegram mock stays — it's safe (no module registry contamination)
mock.module("../infrastructure/notifiers/telegram.js", () => ({
  sendTelegramWork: () => Promise.resolve(true),
  sendTelegramMarket: () => Promise.resolve(true),
  sendTelegramBug: (msg: string) => {
    telegramBugMessages.push(msg);
    return Promise.resolve(true);
  },
  sendTelegram: () => Promise.resolve(true),
}));

// Replace mock.module(schema) with:
beforeEach(async () => {
  closeDb();
  await initDatabase();
});

afterEach(() => {
  closeDb();
});
```

The `financial_reports` table IS created by `initDatabase()` (via `initFinancialReportsTables()`). The test's `parseBctcReport` calls work correctly against the full real schema.

**Validation:** `bun test src/__tests__/1345b-bctc-financial-validation.test.ts` must pass. Then `bun test` full suite must show these 65 tests passing.

---

## Category B — Missing `readReuters`/`readTe` Injection in Watchdog Tests (5 tests, 3 files)

### Root Cause

Task 1345a added `readReuters` and `readTe` as optional readers in `runVpsProxyWatchdog`. These default to `readLatestReutersTimestamp` and `readLatestTeTimestamp`, which both query `rag_analyses` via `getDb()`. Both functions have `try/catch` and return `null` on failure (no table = no error thrown). However, returning `null` causes the staleness calculation to treat Reuters/TE as infinitely stale, adding them to the stale array, which changes the result from `"ok"` or `"restored"` to `"alert-sent"`.

The three watchdog test files were written BEFORE `readReuters`/`readTe` params existed. They do NOT inject these readers, and do NOT call `initDatabase()`, so the DB has no tables.

### Affected files

**`apps/mcp-server/src/__tests__/1319-watchdog-foreign-flow.test.ts`**
- Failing test: `"returns ok when foreign_flow data is 89 minutes old (below threshold)"`
- Expects `"ok"` but gets `"alert-sent"` because Reuters + TE are null → stale

**`apps/mcp-server/src/__tests__/1557-watchdog-recovery.test.ts`**
- 3 failing tests: all depend on `"restored"` or specific stale-array state
- Reuters + TE being stale corrupts the stale count

**`apps/mcp-server/src/__tests__/1567-watchdog-user-alert-error-logging.test.ts`**
- 1 failing test: `"returns restored when pipeline recovers"`
- Same cause

### Fix — Category B

**Files to edit:** all 3 watchdog test files listed above.

In each test that injects readers but does not explicitly inject `readReuters` and `readTe`, add them as fresh readers. The `freshReaders` helper in `1319` already provides `readPrice`, `readNews`, `readOhlcv`. Extend it or add inline:

```typescript
// In 1319-watchdog-foreign-flow.test.ts — extend freshReaders helper:
const freshReaders = (now: Date) => ({
  readPrice:       () => new Date(now.getTime() - 5 * 60_000),
  readNews:        () => new Date(now.getTime() - 5 * 60_000),
  readOhlcv:       () => new Date(now.getTime() - 5 * 60_000),
  readReuters:     () => new Date(now.getTime() - 5 * 60_000),  // ADD THIS
  readTe:          () => new Date(now.getTime() - 5 * 60_000),  // ADD THIS
});
```

Apply the same pattern in `1557` and `1567` — wherever `readPrice`/`readNews`/`readOhlcv` are passed but `readReuters`/`readTe` are omitted, add fresh reader injections.

**Validation:** `bun test src/__tests__/1319-watchdog-foreign-flow.test.ts src/__tests__/1557-watchdog-recovery.test.ts src/__tests__/1567-watchdog-user-alert-error-logging.test.ts` must all pass.

---

## Category C — Stale Sprint Number in Doc Invariant Test (3 tests, 1 file)

### Root Cause

`apps/mcp-server/src/__tests__/1338-sprint-goal-retrospective.test.ts` hardcodes sprint number `1344` in its assertions:

```typescript
expect(stats.currentSprint).toBe(1344);
expect(stats.sprintGoal).toContain("1344");
```

The project is currently on sprint 1349. `docs/data/project-stats.json` reflects 1349 and `SPRINT_GOAL.md` references 1349. The test hardcodes stale values.

### Fix — Category C

**File to edit:** `apps/mcp-server/src/__tests__/1338-sprint-goal-retrospective.test.ts`

Update hardcoded sprint references from `1344` to current sprint, and make the `describe` block name accurate. The test should assert the CURRENT sprint number from `project-stats.json`, OR be rewritten to assert structural invariants rather than a specific sprint number (preferred — more resilient):

```typescript
describe("Sprint — documentation invariants", () => {
  it("project-stats.json currentSprint is a valid sprint number (>= 1344)", () => {
    const stats = JSON.parse(readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8"));
    expect(stats.currentSprint).toBeGreaterThanOrEqual(1344);
  });

  it("SPRINT_GOAL.md top active sprint header references a sprint >= 1338", () => {
    // existing logic — already correct
  });

  it("SPRINT_GOAL.md contains retrospective section", () => {
    const content = readFileSync(join(ROOT, "SPRINT_GOAL.md"), "utf-8");
    // Check for Retrospective heading rather than specific sprint numbers
    expect(content).toContain("Retrospective");
  });

  it("project-stats.json sprintGoal is a non-empty string", () => {
    const stats = JSON.parse(readFileSync(join(ROOT, "docs/data/project-stats.json"), "utf-8"));
    expect(typeof stats.sprintGoal).toBe("string");
    expect(stats.sprintGoal.length).toBeGreaterThan(0);
  });
});
```

**Validation:** `bun test src/__tests__/1338-sprint-goal-retrospective.test.ts` must pass 4/4.

---

## Implementation Order

1. Fix `1345b` first (unblocks 65 tests in 10 files)
2. Fix watchdog tests (5 independent tests)
3. Fix sprint doc invariant (3 independent tests)
4. Run full suite: `bun test` must show 0 failures (or ≥7476 pass)

---

## Risk Assessment

| Fix | Risk | Reasoning |
|-----|------|-----------|
| Remove `mock.module(schema)` from 1345b | Low | Full schema contains `financial_reports`; `initDatabase()` creates it |
| Add `readReuters`/`readTe` to watchdog test helpers | Minimal | Pure test code, no production impact |
| Update sprint invariant test | Minimal | Doc test only; no production code touched |

---

## Files to Edit (Summary)

| File | Change |
|------|--------|
| `apps/mcp-server/src/__tests__/1345b-bctc-financial-validation.test.ts` | Remove `mock.module(schema)` lines 36–116; add `beforeEach`/`afterEach` with `initDatabase()` |
| `apps/mcp-server/src/__tests__/1319-watchdog-foreign-flow.test.ts` | Extend `freshReaders` with `readReuters` + `readTe` |
| `apps/mcp-server/src/__tests__/1557-watchdog-recovery.test.ts` | Add `readReuters`/`readTe` injections to all `runVpsProxyWatchdog` calls that test non-stale scenarios |
| `apps/mcp-server/src/__tests__/1567-watchdog-user-alert-error-logging.test.ts` | Add `readReuters`/`readTe` injections |
| `apps/mcp-server/src/__tests__/1338-sprint-goal-retrospective.test.ts` | Replace hardcoded `1344` with structural assertions |

---

## Tests to Verify Fix

```bash
# After each fix, run this sequence:
bun test src/__tests__/1345b-bctc-financial-validation.test.ts
bun test src/__tests__/1345b-bctc-financial-validation.test.ts src/__tests__/002-db-schema.test.ts src/__tests__/086-tool-alerts.test.ts
bun test src/__tests__/1319-watchdog-foreign-flow.test.ts src/__tests__/1557-watchdog-recovery.test.ts src/__tests__/1567-watchdog-user-alert-error-logging.test.ts
bun test src/__tests__/1338-sprint-goal-retrospective.test.ts
bun test  # full suite must show 0 fail
```

---

## DDD Layer Notes

All changes are in `src/__tests__/` — test layer only. No domain, application, infrastructure, or interface code is modified. Zero DDD violations.
