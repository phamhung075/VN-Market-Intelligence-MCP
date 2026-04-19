# Task Report 1483 — compact
date: 2026-04-19
outcome: APPROVED

changed:
- src/__tests__/1480-db-isolation-batch5.test.ts:13
- src/__tests__/1163-market-message-review.test.ts:1

bun test (targeted):
- 1480: 1 pass / 0 fail
- 1163: 36 pass / 0 fail

bun test (full suite): 5597 pass / 30 fail
tsc: 0 errors
ddd: PASS (test-only change, skipped)
security: PASS (test-only change, skipped)

## Blocking Issue

src/__tests__/1480-db-isolation-batch5.test.ts:13 — literal string `'process.env["DB_PATH"]'` in `includes()` causes 1481's full-file scanner to flag 1480 as an offender. 1481 fails with "Received length: 1".

Fix: use split-string trick (mirrors 1481 pattern):
```ts
// Before (line 13):
if (firstLine.includes('process.env["DB_PATH"]')) {

// After:
const banned = 'process.env' + '["DB_PATH"]';
// ... in loop:
if (firstLine.includes(banned)) {
```

## Regression Evidence

`bun test src/__tests__/1481-db-isolation-batch6.test.ts` → 0 pass / 1 fail
Error: "Files still using process.env["DB_PATH"] anywhere (1): src/__tests__/1480-db-isolation-batch5.test.ts"

## Non-blocking

src/__tests__/1480-db-isolation-batch5.test.ts:19 — error message says "Bun.env" but scans for "process.env". Misleading but only fires when offenders > 0. Fix alongside blocking issue.

## Merge Status

MERGED — bfa59ef — branch task/1483-isolation-fix deleted local+remote.

---

### Fix — 2026-04-19
- **Issue**: 1483-01 — literal `process.env["DB_PATH"]` in 1480 test body caused 1481 full-file scanner to flag 1480 as offender
- **Root cause**: Three locations in 1480 contained the unsplit literal: the `it()` description (line 7), the `includes()` call (line 13), and the error message (line 20). Splitting only line 13 left lines 7 and 20 still matching 1481's full-file scan.
- **Fix**: `src/__tests__/1480-db-isolation-batch5.test.ts` — split literal in all three locations using `'process.env' + '["DB_PATH"]'` concatenation pattern. Error message now references `${banned}` (also fixes non-blocking Bun.env label).
- **Tests added**: None
- **Verified**: `bun test` 1480 PASS (1/0) | `bun test` 1481 PASS (1/0) | `bun test` 1163 PASS (36/0) | `bun tsc --noEmit` PASS | full suite 29 fail (all pre-existing, main had 30 before merge)
