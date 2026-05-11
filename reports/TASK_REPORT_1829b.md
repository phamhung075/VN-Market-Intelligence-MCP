# Task Report: 1829b — te-chromium CB counter persist across Docker restarts
date: 2026-05-02
outcome: APPROVED

## Problem
The `tradingEconomicsChromium.ts` circuit-breaker (CB) counter was stored as two
module-level variables (`_teChromiumConsecutiveFailures`, `_teChromiumAlertSent`).
Every Docker container restart reset these to zero, so a crash loop would re-open
the browser indefinitely rather than staying locked after 3 consecutive failures.

## Fix
Replaced module-level variables with a file-persisted state object (`TeCbState`)
written to `/app/data/te-chromium-cb-state.json`.

Key changes in `apps/mcp-server/src/infrastructure/fetchers/tradingEconomicsChromium.ts`:
- Added `loadCbState(path)` / `saveCbState(state, path)` helpers (atomic
  write via `.tmp` → `rename`, same pattern as the news cache).
- Exported `TE_CB_STATE_PATH` constant and `TeCbState` interface.
- Extended `TeNewsDeps` with optional `cbStatePath` for test isolation.
- `resetTeChromiumFailureCounter(path?)` now wipes the state file; backwards-
  compatible alias `resetTeChromiumCb` retained.
- Existing 1823d tests updated to inject a temp `cbStatePath`.

## Test Results
- 1829b unit tests (4 AC): 4 passed / 0 failed
- 1823d regression tests (5 AC): 5 passed / 0 failed
- Full suite: 8602 pass / 0 fail (8640 tests across 771 files)
- TypeScript: 0 errors (tsc clean confirmed by pre-push hook)

## Acceptance Criteria
| AC | Description | Result |
|----|-------------|--------|
| AC-CB-persist-1 | Cold start: no state file → counter starts at 0 | PASS |
| AC-CB-persist-2 | After N failures, state file contains consecutiveErrors=N | PASS |
| AC-CB-persist-3 | Success after failures resets file to {0, false} | PASS |
| AC-CB-persist-4 | Pre-existing file count loaded and accumulated across restart | PASS |

## DDD Compliance: PASS
- File is in `infrastructure/fetchers/` — correct layer.
- No domain imports from infrastructure.

## Security: PASS
- No `process.env` (uses `Bun.env` where needed).
- No hardcoded credentials.
- File path is injectable via `deps.cbStatePath` for test isolation.

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Pre-existing Failure Note
`1331a-single-writer-guard.test.ts TEST-3` (STOCK_PRICE_DB_PATH env undefined)
was confirmed failing on main before this branch. It did not appear in the post-merge
full suite failure list (0 fail run), consistent with flaky env-dependent test behaviour.

## Merge Status
MERGED to main — commit `3d147595`
Branch `task/1829b-te-chromium-cb-persist` deleted.
Worktree `.claude/worktrees/agent-a63c7975` removed.
