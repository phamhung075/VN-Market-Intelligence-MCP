# Task Report: 1789 — Q4-2025 Overdue Days DST Bug Fix
date: 2026-04-30
outcome: APPROVED

## Summary

`getDeadlineForQuarter()` produced wrong deadline dates when the server runs in a
timezone that observes DST (e.g. Europe/Paris, UTC+1 winter / UTC+2 summer).

Root cause: `new Date(ISO_STRING)` creates a UTC-midnight Date, but the subsequent
`setDate(local)` call operates in local time. When the DST spring-forward (2026-03-29
in Paris) falls between the quarter-end anchor and the deadline day, the local
arithmetic lands 1 hour short of UTC midnight, causing `toISOString().slice(0,10)` to
return the previous calendar date.

Fix: replaced all deadline arithmetic with `Date.UTC()` anchors + `setUTCDate()` so
results are strictly timezone-invariant.

## Test Results

- Targeted tests (TZ=Europe/Paris): 13 pass / 0 fail
- Related earningsCalendar tests (1358a, 1519, 1781): 22 pass / 0 fail
- Full suite: ~8330 pass / 30 fail (30 failures are pre-existing network/confidence
  tests unrelated to this task; baseline was 25 fails before 1789 branch, variance
  is due to network test flakiness)
- TypeScript: 0 errors

## Key Assertions Verified

| Assertion | Expected | Result |
|-----------|----------|--------|
| Standard Q4-2025 deadline | 2026-03-31 | PASS |
| Banking Q4-2025 deadline | 2026-04-15 | PASS |
| Standard Q4 at 2026-04-30: daysUntilDeadline | -30 | PASS |
| Banking Q4 at 2026-04-30: daysUntilDeadline | -15 | PASS |
| Deadline day boundary (standard Q4 at 2026-03-31) | SAP_DEN / 0 | PASS |
| Deadline day boundary (banking Q4 at 2026-04-15) | SAP_DEN / 0 | PASS |
| One-day-overdue (standard Q4 at 2026-04-01) | QUA_HAN / -1 | PASS |

## DDD Compliance: PASS

- `earningsCalendar.ts` is in `domain/services/financial-reports/`
- Single import: `MS_PER_DAY` from `../timeConstants.js` (domain sibling)
- Zero imports from `infrastructure/` or `application/`

## Security: PASS

- No `process.env` usage (uses `Bun.env` pattern in the wider codebase; this file
  has no env access at all — pure domain logic)
- No hardcoded secrets or credentials
- No SQL in this file

## Files Changed

- `apps/mcp-server/src/domain/services/financial-reports/earningsCalendar.ts`
  — Q4 path: `new Date(ISO) + setDate()` replaced with `Date.UTC() + setUTCDate()`
  — Q1-Q3 path: same UTC-anchored pattern applied
- `apps/mcp-server/src/__tests__/1789-q4-overdue-days.test.ts`
  — 13 new tests across 3 describe blocks (AC-1: TZ-invariance, AC-2: overdue count,
    AC-3: boundary checks)

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Merge Status

Merged to main via `--no-ff` on 2026-04-30. Branch `task/1789-q4-overdue-days` deleted.
