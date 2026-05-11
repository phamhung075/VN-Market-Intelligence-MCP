# Task Report — Task 307: /why Payload Format + No-Arg Guard

> **Branch**: `task/307-why-payload-fix` (implementation landed on `task/304-conviction-kinh-dich` in batch)
> **Date started**: 2026-04-06
> **Date merged**: 2026-04-07 (merge commit `3ec1b03` — merged with 304+306 in batch)
> **Final status**: APPROVED
> **DDD layer**: infrastructure/notifiers

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-04-05 | Sprint 050 planning |
| Todo → In Progress | 2026-04-06 | Depends on Task 305 (user_requests table) |
| In Progress → Review | 2026-04-06 | Developer submitted commit `804fdcc` |
| Review → Done | 2026-04-07 | QA approved, merged to main |

---

## Role Activity Log

### PM (Project Manager)
- Defined task scope: /why VCB must store payload as "why:VCB" (not "Why did VCB move today?")
- Guard: /why with no argument or whitespace-only must return Vietnamese error and insert zero rows
- Update 238-user-requests.test.ts to reflect new /why spec
- Dependencies: Task 305 (user_requests table + insertUserRequest function)

### Developer
- Files modified: `src/infrastructure/notifiers/telegramCommands.ts`, `src/__tests__/238-user-requests.test.ts`
- Files created: `src/__tests__/315-telegram-why-command.test.ts`
- TDD cycle: tests and implementation in single commit; 8 new tests all pass
- Tests written: 315-telegram-why-command.test.ts, 8 tests
- 238-user-requests.test.ts: 14 lines updated; /why tests now reflect new payload format
- Pre-existing 3 /ask encoding failures in 238 noted but not introduced by this task

### QA — Review 1
- Date: 2026-04-07
- Outcome: APPROVED
- `bun test ./src/__tests__/315-telegram-why-command.test.ts`: PASS (8/8, 0 fail)
- `bun test ./src/__tests__/238-user-requests.test.ts`: 13 pass / 3 fail
  - 3 failures are pre-existing /ask encoding mismatch (Vietnamese accented vs unaccented), present on main before this task
  - Task 307 fixed 2 /why failures that existed on main; net improvement from 5 to 3
- `bun test` (full suite on main after merge): 3110 pass / 61 fail (baseline same as pre-merge)
- `bun tsc --noEmit`: PASS (0 errors)
- Issues found: 1 non-blocking

---

## Test Results

```
bun test ./src/__tests__/315-telegram-why-command.test.ts

  8 pass
  0 fail
 17 expect() calls
Ran 8 tests across 1 file. [47ms]
```

```
bun test ./src/__tests__/238-user-requests.test.ts  (after task 307)

 13 pass
  3 fail   <- pre-existing encoding mismatch in /ask tests unrelated to this task
Ran 16 tests across 1 file.
```

Pre-merge baseline on main: 238 had 5 failures (3 /ask + 2 /why). Task 307 fixed both /why tests, reducing to 3 failures.

---

## Issues Discovered During Review

### Blocking Issues

None.

---

### Non-Blocking Issues

#### Issue 307-01
- **Type**: Pre-existing test debt — encoding mismatch
- **File**: `src/__tests__/238-user-requests.test.ts:232`
- **Description**: Three /ask tests in 238 assert `result.text.toContain("Su dung")` (unaccented) but the implementation returns `"Cách dùng: /ask VCB giam vi sao?"` (accented Vietnamese). These were failing before this task and are unrelated to the /why changes.
- **Impact**: 3 of 16 tests in 238 fail persistently on main.
- **Fix applied**: Not fixed by this task. Commit note acknowledges pre-existing nature.
- **Status**: Deferred. Should be addressed in a dedicated fix task (update test assertions to match accented Vietnamese strings, or normalize the response to unaccented for testability).

#### Issue 307-02
- **Type**: TDD process — test and implementation committed together
- **File**: commit `804fdcc`
- **Description**: Same as Issue 304-01 — both commits land tests and implementation together rather than as separate red/green commits.
- **Fix applied**: N/A — accepted for this sprint.
- **Status**: Non-blocking.

---

## Bug Report

| # | Severity | Description | File | Status |
|---|----------|-------------|------|--------|
| — | — | No new bugs introduced | — | — |

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | Input validation — ticker | `/why` extracts `args[0]?.trim()` and checks for empty string before inserting | None | Guard in place; empty/whitespace returns error without DB write |
| 2 | SQL injection | `handleAsk(db, why:${ticker.toUpperCase()})` passes string to insertUserRequest which uses parameterized binding | None | `insertUserRequest` uses `db.prepare` with `?` placeholder |
| 3 | Telegram response format | Error message uses Vietnamese plain text (no Markdown); conforms to "plain text only" invariant | None | Correct |

**Security verdict**: CLEAN

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| /why VCB stores payload as "why:VCB" | PASS | Test 315 line 108 confirms `rows[0].payload === "why:VCB"` |
| /why VCB payload does NOT contain "Why did" | PASS | Test 315 line 109 confirms |
| /why FPT stores payload as "why:FPT" | PASS | Test 315 line 121 |
| /why VNM stores payload as "why:VNM" | PASS | Test 315 line 130 |
| Ticker is uppercased in payload | PASS | `ticker.toUpperCase()` in telegramCommands.ts line 630 |
| /why with no arg inserts ZERO rows | PASS | Test 315 line 159 confirms count=0 |
| /why with no arg returns Vietnamese error containing "/why VCB" | PASS | Test 315 line 168 |
| /why with whitespace-only inserts ZERO rows | PASS | Test 315 line 172 confirms count=0 |
| /why with whitespace-only returns Vietnamese error | PASS | Test 315 line 185 |
| 238 /why tests updated to reflect new payload spec | PASS | 14 lines updated in 238; 2 previously failing /why tests now pass |

---

## Merge Summary

```bash
git merge --no-ff (batch merge via 3ec1b03) -m "merge(304+306+307): ..."
```

- Commits in branch: 1 task commit (`804fdcc`)
- Files changed (task 307 scope): telegramCommands.ts, 315-telegram-why-command.test.ts, 238-user-requests.test.ts (14 lines), TASKS.md
- Lines added: +187 (315 test file) +14 (238 updates) +16 (telegramCommands) | Lines removed: -14 (238 old /why tests)
- Tests added: 8 new tests (315-telegram-why-command.test.ts)
- Type errors at merge: 0

---

## Notes for Next Tasks

- Task 306 (buildEnrichedAnswer): the "why:" prefix in payload is the trigger for Step F to build a structured "why did TICKER move" answer. The prefix convention is now locked — do not change without updating both 307 tests and the Step F logic.
- The 3 pre-existing /ask encoding failures in 238 should be addressed in a hygiene task: normalize assertions to accented Vietnamese or add a `.normalize()` comparison helper.
- `handleAsk` is reused by both /ask and /why — any change to its return format will affect both command paths and must update tests 238 and 315.
