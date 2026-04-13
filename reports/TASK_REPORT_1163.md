# Task Report — Task 1163: TDD red phase — write failing tests for market_messages review system

> **Branch**: `task/1163-market-message-review`
> **Date reviewed**: 2026-04-13
> **Final status**: APPROVED (TDD red phase — failures are expected)
> **DDD layer**: tests

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-04-13 | Sprint 068 kick-off |
| Todo → In Progress | 2026-04-13 | Assigned to Developer |
| In Progress → Review | 2026-04-13 | Developer submitted test file |
| Review → Done | 2026-04-13 | QA approved red phase |

---

## Role Activity Log

### Developer
- Files created: `src/__tests__/1163-market-message-review.test.ts`
- Files modified: none
- TDD cycle followed: YES — test commit `fc53049` is the first and only commit on the branch
- Tests written: 19 describe blocks covering AC-1 through AC-12, plus edge case (invalid verdict)
- Assumptions made: none observed; all type stubs are local to the test file, no premature implementation files created

### QA — Review 1
- Date: 2026-04-13
- Outcome: APPROVED
- `bun test src/__tests__/1163-*` result: FAIL — 1 error (expected red phase: `Cannot find module '../infrastructure/db/marketMessageStore.js'`)
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 0 non-blocking

---

## Test Results

```
bun test src/__tests__/1163-market-message-review.test.ts

# Unhandled error between tests
error: Cannot find module '../infrastructure/db/marketMessageStore.js'

0 pass
1 fail
1 error
```

**Expected failure**: the test file imports `marketMessageStore.js` and `marketMessageTools.js` which do not exist yet (tasks 1164 and 1166 will create them). The module-not-found error at runtime is exactly the correct TDD red phase outcome.

**TypeScript check**: `bun tsc --noEmit` passes with 0 errors. The test file uses local type stubs (`MarketMessageAgent`, `MarketMessageType`, `MarketMessageRow`, function type aliases) and casts the `require()` calls, allowing TypeScript to compile cleanly before the implementation modules exist.

---

## Coverage Mapping (19 test groups → 12 ACs)

| Test group | AC covered | Status |
|---|---|---|
| 1. market_messages table creation — table exists | AC-1 | red (module missing) |
| 1. market_messages table creation — 9 columns | AC-1 | red |
| 1. market_messages table creation — 4 indexes | AC-1 | red |
| 1. market_messages table creation — idempotent | AC-1 | red |
| 2. insertMarketMessage — returns id >= 1 | AC-2 | red |
| 2. insertMarketMessage — correct fields persisted | AC-2 | red |
| 2. insertMarketMessage — verdict/reviewed_at null | AC-2 | red |
| 2. insertMarketMessage — valid sent_at datetime | AC-2 | red |
| 2. insertMarketMessage — never throws | AC-2 edge | red |
| 3. getUnreviewedMarketMessages — ordering | AC-5 | red |
| 3. getUnreviewedMarketMessages — excludes reviewed | AC-5 | red |
| 4. getUnreviewedMarketMessages — ticker filter | AC-6 | red |
| 4. getUnreviewedMarketMessages — no filter returns all | AC-6 | red |
| 5. getUnreviewedMarketMessages — empty (all reviewed) | AC-7 | red |
| 5. getUnreviewedMarketMessages — empty table | AC-7 | red |
| 6. reviewMarketMessage — sets verdict/note/reviewed_at | AC-8 | red |
| 6. reviewMarketMessage — returns true | AC-8 | red |
| 7. reviewMarketMessage — idempotent overwrite | AC-9 | red |
| 8. reviewMarketMessage — returns false for missing id | AC-10 | red |
| 8. reviewMarketMessage — no throw for missing id | AC-10 | red |
| 9. reviewMarketMessage — invalid verdict throws | edge case | red |
| 10. sendTelegramMarket — returns true, inserts row | AC-3 | red |
| 10. sendTelegramMarket — null ticker when omitted | AC-3 | red |
| 11. sendTelegramMarket — returns false, zero rows | AC-4 | red |
| 12. sendTelegramMarket — backward compat compiles | AC-11 | red |
| 12. sendTelegramMarket — unknown defaults inserted | AC-11 | red |
| 13. get_unreviewed MCP tool — JSON array, newest first | AC-5 | red |
| 13. get_unreviewed MCP tool — row shape correct | AC-5 | red |
| 14. get_unreviewed MCP tool — empty state text | AC-7 | red |
| 15. get_unreviewed MCP tool — ticker filter | AC-6 | red |
| 16. review MCP tool — success with note | AC-8 | red |
| 16. review MCP tool — row updated after call | AC-8 | red |
| 17. review MCP tool — success without note | AC-8 | red |
| 18. review MCP tool — idempotent | AC-9 | red |
| 19. review MCP tool — unknown id returns not found | AC-10 | red |
| 19. review MCP tool — no throw for missing id | AC-10 | red |

All 12 ACs from REQ-068 have test coverage. The TECH-068 test strategy lists 19 test groups; the file delivers 19 describe blocks (36 individual `it()` cases).

---

## Issues Discovered During Review

### Blocking Issues

None.

### Non-Blocking Issues

None.

---

## Security Report

| # | Category | Description | Risk | Verdict |
|---|----------|-------------|------|---------|
| 1 | process.env in test file | `process.env["DB_PATH"] = ":memory:"` and mock Telegram credentials set in beforeEach/afterEach | N/A — test isolation pattern | ACCEPTED — established pattern in `002-db-schema.test.ts` |
| 2 | Parameterized SQL in seed helper | `seedRow()` uses `db.prepare(...).run(params...)` with positional `?` bindings | N/A | PASS |
| 3 | any types | 0 occurrences of `: any` in the test file | N/A | PASS |

**Security verdict**: CLEAN

---

## DDD Compliance

- Test file imports only from `src/infrastructure/db/schema.js` and `src/infrastructure/notifiers/telegram.js` (infrastructure), plus future modules via `require()` with type stubs.
- No domain layer is imported from infrastructure.
- No application layer is imported from domain.
- DDD pipeline scan: no violations introduced by task 1163.

**DDD verdict**: PASS

---

## Acceptance Criteria Sign-off (Red Phase)

| Criterion | Status | Notes |
|---|---|---|
| AC-1: market_messages table + indexes created by initDatabase() | Tests written, red | Task 1164 unblocked |
| AC-2: insertMarketMessage persists a row | Tests written, red | Task 1164 unblocked |
| AC-3: sendTelegramMarket inserts row on success | Tests written, red | Task 1165 unblocked |
| AC-4: sendTelegramMarket no insert on failure | Tests written, red | Task 1165 unblocked |
| AC-5: get_unreviewed returns unreviewed newest first | Tests written (store + tool), red | Tasks 1164+1166 |
| AC-6: get_unreviewed filters by ticker | Tests written (store + tool), red | Tasks 1164+1166 |
| AC-7: get_unreviewed empty state | Tests written (store + tool), red | Tasks 1164+1166 |
| AC-8: review_market_message sets verdict + reviewed_at | Tests written (store + tool), red | Tasks 1164+1166 |
| AC-9: review_market_message idempotent | Tests written (store + tool), red | Tasks 1164+1166 |
| AC-10: review_market_message handles unknown id | Tests written (store + tool), red | Tasks 1164+1166 |
| AC-11: backward compat without persist option | Tests written, red | Task 1165 unblocked |
| AC-12: Full suite green (TypeScript 0 errors) | TypeScript PASS; bun test pending tasks 1164-1166 | — |

---

## Merge Summary

This is a TDD red phase task — no merge to main at this step. The branch `task/1163-market-message-review` continues for tasks 1164, 1165, 1166, and 1167 on the same branch.

- Commits in branch: 1 (test commit only)
- Files added: 1 (`src/__tests__/1163-market-message-review.test.ts`)
- Tests added: 36 `it()` cases across 19 `describe` blocks
- Type errors: 0

---

## Notes for Next Tasks

- Task 1164 is unblocked: create `src/infrastructure/db/marketMessageStore.ts` + add `market_messages` DDL to `schema.ts`. Running the test file after 1164 should turn AC-1, AC-2, AC-5, AC-6, AC-7, AC-8, AC-9, AC-10 green.
- Task 1165 is unblocked after 1164: modify `sendTelegramMarket()` + 10 call sites. Should turn AC-3, AC-4, AC-11 green.
- Task 1166 is unblocked after 1165: create `marketMessageTools.ts` + register in registry. Should turn all MCP tool tests green.
- Task 1167 is unblocked after 1166: advance `project-stats.json` to sprint 68.
- The `morningBriefingJob.ts` chunking edge case (TECH-068 risk register) requires the Developer to call `insertMarketMessage` once with the full pre-split text before the chunk loop, not per chunk.
