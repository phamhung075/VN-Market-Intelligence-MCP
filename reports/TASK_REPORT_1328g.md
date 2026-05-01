# Task Report: 1328g — logPolicySuppression to signalRejectionStore
date: 2026-04-24
outcome: APPROVED

## Changed Files
- `apps/mcp-server/src/infrastructure/db/signalRejectionStore.ts:64-100` — logPolicySuppression() function
- `apps/mcp-server/src/__tests__/1328g-suppression-log.test.ts` — 9 new tests (AC1 x6, AC2 x3)

## Test Results
- Unit tests (1328g): 9 pass / 0 fail
- Full suite: 6860 pass / 12 fail (12 failures are pre-existing — SSC pipeline x2, TASK-1567 watchdog x1, SPRINT-240 price pipeline x1 + others; none touch signalRejectionStore)
- Baseline before task: 6860 pass / 12 fail (confirmed via stash comparison)
- Net new: +9 pass, +0 fail
- TypeScript: 0 errors

## DDD Compliance: PASS
- File is in `infrastructure/db/` — correct layer
- Zero imports from `domain/` or `application/` — no upward violations
- Imports only `bun:sqlite` (runtime type)

## Security: PASS
- All SQL uses `db.prepare()` + `stmt.run(params...)` positional bindings — no string interpolation
- No `process.env` usage
- No hardcoded credentials

## Critical Checks
- `signal_type` hardcoded as string literal `"policy_suppressed"` at line 95 — not exposed in params interface. PASS.
- `reason` stored as `JSON.stringify(params.failed_conditions)` at line 87. PASS.
- `params.rule` accepted (`"position_danger_3and" | "watchlist_opportunity_4and"`) but not stored — intentional (rule is implicit from context). PASS.
- `stock_code` and `payload_preview` correctly default to `null` when omitted. PASS.

## JSDoc Note
Function documents that `getSignalRejectionSummary()` will include policy_suppressed rows in its count, and advises callers that need validation-only counts to add `WHERE signal_type != 'policy_suppressed'`. Good defensive documentation.

## Issues Found
### Blocking
None.
### Non-Blocking
None.

## Merge Status
Merged to main via fast-forward: 901e5caa
Branch `task/1328g-suppression-log` deleted.
