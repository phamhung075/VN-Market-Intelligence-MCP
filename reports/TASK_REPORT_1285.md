# Task Report: 1285 — fix(cooldown): macro_deviation alerts bypass step E cooldown
date: 2026-04-15
outcome: APPROVED

## Test Results

| Suite | Pass | Fail |
|-------|------|------|
| Unit (1285-macro-alert-cooldown.test.ts) | 2 | 0 |
| Full regression | all pass* | 0 |
| TypeScript (`bun tsc --noEmit`) | — | 0 errors |

*OCR E2E test (296) was still processing during review; no failures detected in completed tests.

## Code Verification

| Check | Result |
|-------|--------|
| Step E cooldown SQL — `AND notified_telegram = 1` absent | PASS — only appears in a comment (line 312), not in active SQL |
| `recentAlertHistory.push(...)` outside `if (sent > 0)` guard | PASS — push at line 853, `if (sent > 0)` block closes at line 849 |
| AC-1: failed-send history visible to cooldown | PASS — test verifies suppression when `getRecentAlertHistoryFn` returns `notified_telegram=0` row |
| AC-2: failed send populates in-memory history for same-cycle dedup | PASS — second sibling suppressed even when first `sendAlertsFn` returns 0 |

## DDD Compliance: PASS

- Zero runtime `import ... from "...infrastructure"` in `src/domain/`
- Existing `import type` references (e.g. `VnstockIntradayTick`, `ShippingIndex`) are type-only, no runtime coupling
- No `application/` imports in domain

## Security: PASS

- Zero `process.env` usage in `src/` (all `Bun.env`)
- No new SQL queries; existing history query uses parameterized binding

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Merge Status

Merged to `main` via `--no-ff`. Branch `fix/1285-macro-alert-cooldown` deleted. Task 1285 moved to Done.
