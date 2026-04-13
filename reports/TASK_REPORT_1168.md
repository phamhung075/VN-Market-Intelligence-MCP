# Task Report — Task 1168: TDD red phase — Market Message Digest + Batch Review

> **Branch**: `task/1168-market-message-digest`
> **Date started**: 2026-04-13
> **Date merged**: pending (Tasks 1169–1172 remain)
> **Final status**: APPROVED (TDD red phase)
> **DDD layer**: tests

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-04-13 | Sprint 069 created by PM |
| Todo → In Progress | 2026-04-13 | Developer started TDD red phase |
| In Progress → Review | 2026-04-13 | Developer submitted: 31 failing tests committed |
| Review → Done | 2026-04-13 | QA approved red phase |

---

## Role Activity Log

### PM (Project Manager)
- Sprint 069 created; tasks 1168–1172 defined and assigned to Developer
- Task 1168 scope: TDD red phase covering AC-1 to AC-12 (and AC-14 coverage via test structure)
- DDD layer: tests only — no production code written in this task
- Context injection: TECH-069 test strategy section + 1163-market-message-review.test.ts pattern

### Developer
- Files created: `src/__tests__/1168-market-message-digest.test.ts`
- Files modified: none (TDD red phase only)
- TDD cycle followed: YES — test file committed before any store/tool implementation
- Tests written: 31 test cases across 4 describe blocks
- Assumptions made:
  - Used `require()` dynamic imports (not ES imports) to allow TypeScript to compile while the referenced exports do not yet exist — this is the correct forward-declaration technique matching the 1163 pattern
  - `process.env["DB_PATH"] = ":memory:"` at file top for test isolation — established codebase-wide pattern, not a production env read

### QA — Review 1
- Date: 2026-04-13
- Outcome: APPROVED
- `bun test src/__tests__/1168-market-message-digest.test.ts` result: 0 pass / 31 fail (RED — expected)
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 0 non-blocking

---

## Test Results

```
bun test src/__tests__/1168-market-message-digest.test.ts

 Task 1168 — getMarketMessageDigest
  (fail) AC-1: returns 3 grouped entries from 5 seeded rows (one already reviewed)
  (fail) AC-1: alert-commander 2026-04-13 entry has count=2 and ids containing 10 and 11
  (fail) AC-1: morning-briefing 2026-04-13 entry has count=1 and ids=[12]
  (fail) AC-1: excludes rows where verdict is not null
  (fail) AC-2: row 8 days ago with limit_days=7 is excluded
  (fail) AC-2: row 1 day ago is included with limit_days=7
  (fail) AC-3: empty state — no unreviewed rows returns []
  (fail) edge: single row in group — ids is an array of exactly one number
  (fail) edge: default limit_days=7 — row 6 days ago included, row 8 days ago excluded
  (fail) edge: limit_days=0 treated as 1 at store level (clamping)
  (fail) edge: limit_days=50 treated as 30 at store level (clamping)
  (fail) AC-1: preview field contains at most 120 chars of message content

 Task 1168 — batchReviewMarketMessages
  (fail) AC-4: updates all 3 ids in one transaction — returns { updated: 3, notFound: [] }
  (fail) AC-4: sets verdict='noise', verdict_note, and reviewed_at on all 3 updated rows
  (fail) AC-5: reports notFound ids — ids [id20, id21] exist, id 999 does not
  (fail) AC-5: no exception thrown when some ids are not found
  (fail) AC-6: empty ids array returns immediately — { updated: 0, notFound: [] }
  (fail) AC-7: invalid verdict throws Error('Invalid verdict')
  (fail) edge: idempotent overwrite — second call with different verdict wins
  (fail) edge: all 200 non-existent ids — returns { updated: 0, notFound: all 200 }
  (fail) edge: note is optional — null note stores null in verdict_note

 Task 1168 — get_market_message_digest MCP tool handler
  (fail) AC-8: formatted output contains [2026-04-13], agent names, counts, ids, and footer
  (fail) AC-8: formatted text contains both ids 41 and 42 for the alert-commander group
  (fail) AC-9: empty state returns 'Khong co tin nhan chua review trong 7 ngay qua.'
  (fail) edge: empty state with default (no limit_days arg) uses 7 in the empty message

 Task 1168 — batch_review_market_messages MCP tool handler
  (fail) AC-10: all found — returns "3 tin da duoc danh gia la 'noise'."
  (fail) AC-10: all 3 rows have verdict='noise' after tool call
  (fail) AC-11: partial notFound — text contains '2 tin', '1 ID khong tim thay', and '999'
  (fail) AC-12: with note — text ends with 'Note saved.', row has verdict_note='false alarm'
  (fail) edge: all ids not found — returns 'Khong tim thay bat ky tin nhan nao.'
  (fail) edge: invalid verdict propagates as error message from handler

0 pass
31 fail
Ran 31 tests across 1 file. [519ms]
```

Failure mode: all tests fail with `TypeError: getMarketMessageDigest is not a function` (store functions undefined) or `TypeError: handleGetMarketMessageDigest is not a function` (handler functions undefined). This is the correct red-phase failure — the functions do not exist yet and are expected to be created in Tasks 1169–1170.

**Coverage notes**: 31 test cases across 4 groups. Every AC from AC-1 to AC-12 has at least one test. AC-1 has 5 tests covering grouped result count, individual entries (alert-commander count/ids, morning-briefing count/ids), exclusion of reviewed rows, and 120-char preview truncation. AC-4 has 2 tests (return value + db state verification). AC-5 has 2 tests (return value + no exception). Edge cases cover: single-row GROUP_CONCAT parsing, default limit_days=7, clamping at min (0→1) and max (50→30), idempotent overwrite, all-200-not-found, all-ids-not-found MCP path, invalid verdict MCP error path.

---

## DDD Compliance

### Scan results

```bash
grep -r "from.*infrastructure" src/domain/    # 0 hard import violations
grep -r "from.*application" src/domain/       # 0 violations
```

The test file at `src/__tests__/1168-market-message-digest.test.ts` is in the tests layer. It imports from `src/infrastructure/db/` and `src/interface/mcp/tools/` — this is correct and expected for integration-style store/handler tests. No domain layer is imported.

**DDD Compliance: PASS**

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | SQL injection | `seedRow()` and `seedRowWithId()` helpers use parameterized `?` bindings for all values — no string interpolation of test data | None | Already parameterized |
| 2 | process.env usage | `process.env["DB_PATH"] = ":memory:"` at line 35 | None | This is a test harness override, not production env reading. Identical pattern used in 1163 and 12+ other test files codebase-wide. No secrets involved. |

**Security verdict**: CLEAN

---

## TypeScript

- `bun tsc --noEmit`: 0 errors
- `any` types: 0 occurrences in the test file
- All stub types defined locally for forward-declaration of not-yet-existing functions
- `require()` used intentionally (with `// eslint-disable-next-line` comment) to allow runtime undefined resolution while keeping TypeScript valid — correct pattern matching 1163

---

## Issues Discovered During Review

### Blocking Issues

None.

### Non-Blocking Issues

None.

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: getMarketMessageDigest returns 3 grouped entries, correct counts/ids/ordering, reviewed row excluded | VERIFIED (test exists, fails correctly) | 5 test cases cover all AC-1 sub-conditions |
| AC-2: limit_days date cutoff respected | VERIFIED (test exists, fails correctly) | 2 test cases: 8-days excluded, 1-day included |
| AC-3: empty state returns [] | VERIFIED (test exists, fails correctly) | |
| AC-4: batchReviewMarketMessages updates all ids, sets verdict/note/reviewed_at | VERIFIED (test exists, fails correctly) | 2 test cases: return value + db state |
| AC-5: notFound ids reported, no exception | VERIFIED (test exists, fails correctly) | 2 test cases |
| AC-6: empty ids returns immediately | VERIFIED (test exists, fails correctly) | |
| AC-7: invalid verdict throws Error("Invalid verdict") | VERIFIED (test exists, fails correctly) | |
| AC-8: MCP tool formatted digest output structure | VERIFIED (test exists, fails correctly) | 2 test cases: full output + id presence |
| AC-9: MCP tool empty state message | VERIFIED (test exists, fails correctly) | |
| AC-10: MCP tool all-found success text + db state | VERIFIED (test exists, fails correctly) | 2 test cases |
| AC-11: MCP tool partial notFound text | VERIFIED (test exists, fails correctly) | |
| AC-12: MCP tool with note — text ends "Note saved.", row has verdict_note | VERIFIED (test exists, fails correctly) | |
| TDD RED phase: all 31 tests fail before tasks 1169–1170 | PASS | 0 pass / 31 fail confirmed |
| bun tsc --noEmit: 0 errors | PASS | TypeScript compiles clean |
| Test file is syntactically valid TypeScript | PASS | tsc confirms |

---

## Merge Summary

Task 1168 is a TDD red-phase task. No merge to `main` occurs here. The branch `task/1168-market-message-digest` continues to be used for Tasks 1169, 1170, and 1172. Merge will happen after Task 1172 is complete.

- Commits in branch (task 1168): 2
  - `task(1168): TDD red phase — write failing tests for market message digest + batch review`
  - `chore(1168): move task 1168 to Review in TASKS.md`
- Files created: `src/__tests__/1168-market-message-digest.test.ts` (670 lines, 31 tests)
- Type errors at submission: 0

---

## Notes for Next Tasks

- Task 1169 can now start: implement `getMarketMessageDigest` and `batchReviewMarketMessages` (plus the `MarketMessageDigestEntry` and `BatchReviewResult` interfaces) in `src/infrastructure/db/marketMessageStore.ts`. After 1169, store-level tests (AC-1 to AC-7 + store edge cases) should turn green; MCP tool tests remain red.
- Task 1170 can start after 1169: implement `handleGetMarketMessageDigest` and `handleBatchReviewMarketMessages` in `src/interface/mcp/tools/marketMessageTools.ts`, register both new tools inside the existing `registerMarketMessageTools` function. After 1170, all 31 tests should be green.
- Task 1171 (admin close of 1139) is independent — can run in parallel with 1169/1170.
- Task 1172 (project-stats.json sprint 069 advance) depends on 1170 and 1171 both being Done.
- Key implementation note for 1169: `GROUP_CONCAT(id ORDER BY sent_at DESC)` requires SQLite 3.44+. Bun bundles 3.46+ — no runtime guard needed. The `id_list` field from SQLite is always a string; use `.split(",").map(Number)` to produce `number[]`.
- Key implementation note for 1170: both new tools go inside the existing `registerMarketMessageTools(server)` function — no new function, no change to `registry.ts`.
