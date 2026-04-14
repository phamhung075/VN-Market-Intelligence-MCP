# Task Report: 1204 — VCB Q1-2025 BCTC all-zero record cleanup
date: 2026-04-13
outcome: APPROVED

## Summary

Idempotent startup migration added to `initDatabase()` in `src/infrastructure/db/schema.ts`.
On every server boot the migration deletes the corrupted VCB Q1-2025 `financial_reports` row
if and only if `extraction_confidence < 0.1`. After deletion the row is absent; after a valid
re-parse the new row has `extraction_confidence >= 0.3` and is never touched again. VCB Q1-2025
is also inserted into `bctc_vps_queue` with `status='pending', attempts=0` via the existing
`BACKFILL_079` block (added in task 1201, referenced by task 1204 comment at line 1343).

## Test Results

- Unit tests (1204 only): 7 passed / 0 failed — 16 expect() calls — 169 ms
- Regression sample (tasks 1201 + 1202 + 1204): 33 passed / 0 failed — 384 ms
- TypeScript (pre-push hook): bun tsc --noEmit = 0 errors

## Acceptance Criteria Verification

| Criterion | Result |
|-----------|--------|
| 7 tests pass in src/__tests__/1204-vcb-zero-cleanup.test.ts | PASS |
| DELETE uses `extraction_confidence < 0.1` guard | PASS — see schema.ts lines 1365-1370 |
| Does NOT delete rows with confidence >= 0.1 | PASS — test "migration does NOT delete … >= 0.1" |
| Idempotent on double initDatabase() call | PASS — test "initDatabase() can be called twice without error" |
| VCB Q1-2025 in bctc_vps_queue as pending after migration | PASS — test "VCB Q1-2025 is queued … with status=pending" |
| Does not affect VCB Q4-2025 | PASS — dedicated test |
| Does not affect other tickers (BID Q1-2025 zero-confidence row stays) | PASS — dedicated test |

## DDD Compliance: PASS

Task 1204 changes are confined to `src/infrastructure/db/schema.ts` (infrastructure layer) and
the new test file. No domain layer was modified. Pre-existing `import type` from infrastructure
into domain are type-only DTO references predating this task — not introduced here.

## Security: PASS

- No hardcoded credentials.
- DELETE statement is a parameterized literal with no user input — no injection surface.
- `process.env["DB_PATH"]` fallback in `getDb()` and `closeDb()` is a pre-existing pattern
  (not introduced by this task) required for the test harness to override DB_PATH before module
  load. Non-blocking pre-existing issue.

## Issues Found

### Blocking
None.

### Non-Blocking
- `process.env["DB_PATH"]` used as primary lookup in `getDb()` / `closeDb()` (lines 64, 550) —
  pre-existing, not introduced by task 1204. The rule is `Bun.env` only; however this is
  test-harness scaffolding that predates this sprint. Recommend a dedicated follow-up task
  to replace with `Bun.env` + test runner env injection.

## Full Suite Note

`bun test` (all files) triggered a Bun 1.3.11 C++ crash after 480 s / 2.41 GB peak RAM —
a known Bun runtime bug unrelated to this task (same crash observed on main before this branch).
Regression verified via targeted file batch (1201 + 1202 + 1204) covering the shared schema
code path. TypeScript clean confirmed by pre-push hook.

## Merge Status

Merged: `git merge --no-ff task/1204-vcb-zero-cleanup` — commit on main.
Branch deleted: local + remote (pre-push tsc hook passed).
TASKS.md: task 1204 moved to Done.
