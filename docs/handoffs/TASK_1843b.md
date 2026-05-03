---
sprint: 1843
branch: task/1843b-fix-preexisting-test-failures
size: S
depends_on: []
blocks: []
---

## TLDR

Fix 4 pre-existing test failures (Task 265 x3 + Task 1332 x1) and extract the `computeBenchmarkReturn` DRY helper in backtestEngine.ts. All three changes are low-risk: two are test-only date fixes, one is a singleton isolation fix, and one is a trivial pure-function extraction with no logic change.

## [PM] Planning Context

- **Acceptance Criteria:**
  - [ ] AC-265-1: "records a mention and retrieves velocity" test passes
  - [ ] AC-265-2: "upserts: second insert for same code+hour increments counts" test passes
  - [ ] AC-265-3: "stores different codes independently" test passes
  - [ ] AC-1332-1: `1332-pollnews-source-display-name` test suite passes on first run
  - [ ] AC-1332-2: `bun test 1332-pollnews-source-display-name` run 3 times consecutively — all pass (intermittency confirmed gone)
  - [ ] AC-DRY-1: `computeBenchmarkReturn` helper exists in backtestEngine.ts as a module-level function
  - [ ] AC-DRY-2: Both call sites (runBacktestEngine + buildEmptyReport) use `computeBenchmarkReturn(benchmarkCandles)` instead of inline block
  - [ ] AC-DRY-3: No logic change — return values identical to before
  - [ ] AC-DRY-4: `tsc --noEmit` exits 0
  - [ ] `bun test` summary shows 0 fail for all 4 previously-failing tests

- **Files to read first:**
  - `apps/mcp-server/src/__tests__/265-velocity-store.test.ts` — locate the 3 hardcoded hour literals
  - `apps/mcp-server/src/__tests__/1332-pollnews-source-display-name.test.ts` — find describe block structure, check for existing beforeEach
  - `apps/mcp-server/src/interface/mcp/tools/news-analysis/sourceHealthTools.ts` — check if `_resetGlobalSourceTracker()` is already exported
  - `apps/mcp-server/src/domain/backtesting/backtestEngine.ts` — find the 2 inline benchmarkReturn blocks (around lines 324 and 372)

- **Files to modify:**
  - `apps/mcp-server/src/__tests__/265-velocity-store.test.ts` — replace 3 hardcoded hour literals with Date.now() offsets:
    - "records a mention..." → `new Date(Date.now() - 1 * 60 * 60 * 1000).toISOString()`
    - "upserts: second insert..." → `new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()`
    - "stores different codes..." → `new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()`
    - NOTE: Reputation store tests in same file also use "2026-04-03" dates — do NOT change those (no prune behavior, they still pass)
  - `apps/mcp-server/src/__tests__/1332-pollnews-source-display-name.test.ts` — add `beforeEach(() => { _resetGlobalSourceTracker(); })` at top of describe block; add import for `_resetGlobalSourceTracker`
  - `apps/mcp-server/src/interface/mcp/tools/news-analysis/sourceHealthTools.ts` — ONLY IF `_resetGlobalSourceTracker()` export is absent: add `export function _resetGlobalSourceTracker(): void` that reinitialises the tracker map (no logic change)
  - `apps/mcp-server/src/domain/backtesting/backtestEngine.ts` — extract inline benchmark return block into `function computeBenchmarkReturn(candles: DailyCandle[]): number | null`; replace both inline blocks with call to this helper

- **Root cause summary:**
  - Task 265 x3: hardcoded `"2026-04-03T10:00:00.000Z"` hour is now > 30 days in the past; `recordMention()` prune query deletes it immediately; `getVelocity` returns null. Production code is correct — test-only fix.
  - Task 1332 x1: `globalSourceTracker` is a `globalThis` singleton; state from other test files in the same Bun worker contaminates this test's assertions. `beforeEach` reset guarantees clean state.

- **Dependencies:** none — can run in parallel with 1843a
- **Knowledge needed:** `.claude/knowledge/dev-standards.md`
