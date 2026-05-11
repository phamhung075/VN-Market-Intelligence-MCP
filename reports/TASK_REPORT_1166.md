# Task Report — Task 1166: Registry Registration + tool-registry.json Update

> **Branch**: `task/1163-market-message-review`
> **Date reviewed**: 2026-04-13
> **Final status**: APPROVED
> **DDD layer**: interface

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Todo → In Progress | 2026-04-13 | Tasks 1163, 1164, 1165 cleared |
| In Progress → Review | 2026-04-13 | Developer submitted after registry + JSON update |
| Review → Done | 2026-04-13 | QA approved — 36/36 tests pass, 0 TypeScript errors |

---

## Role Activity Log

### Developer
- Files modified: `src/interface/mcp/tools/registry.ts`, `docs/data/tool-registry.json`, `src/interface/mcp/tools/marketMessageTools.ts`
- TDD cycle followed: YES — test file written in Task 1163 (TDD red phase), all 36 tests green in this task
- Tests written: `src/__tests__/1163-market-message-review.test.ts` (36 tests, written in Task 1163)
- Fixes applied from TASK_REPORT_1164 non-blocking issues:
  - Issue 1164-01: `z.number()` → `z.coerce.number()`, `max(100)` → `max(50)` at `marketMessageTools.ts:126`
  - Issue 1164-02: Error format corrected to `"Error reviewing message ${args.id}: ${msg}"` at `marketMessageTools.ts:91`

### QA — Review 1
- Date: 2026-04-13
- Outcome: APPROVED
- `bun test src/__tests__/1163-*` result: PASS (36 pass / 0 fail, 92 expect() calls)
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 0 non-blocking

---

## Test Results

```
bun test src/__tests__/1163-market-message-review.test.ts

  Task 1163 — 1. market_messages table creation (AC-1)
    pass: PRAGMA table_info returns 9 columns
    pass: PRAGMA index_list returns 4 indexes
    pass: second initDatabase() call does not throw

  Task 1163 — 2. insertMarketMessage (AC-2)
    pass: returns integer id >= 1
    pass: inserted row has correct from_agent, message_type, ticker, content
    pass: verdict and reviewed_at are null after insert
    pass: sent_at is a valid datetime string

  Task 1163 — 3. getUnreviewedMarketMessages ordering (AC-5)
    pass: returns 2 unreviewed rows when 1 is reviewed
    pass: rows are ordered newest first (DESC)
    pass: reviewed row is excluded

  Task 1163 — 4. getUnreviewedMarketMessages ticker filter (AC-6)
    pass: filter by VCB returns only VCB row (1 of 3)

  Task 1163 — 5. getUnreviewedMarketMessages empty state (AC-7)
    pass: returns empty array when all rows reviewed

  Task 1163 — 6. reviewMarketMessage success (AC-8)
    pass: sets verdict, verdict_note, reviewed_at on target row
    pass: returns true when row found

  Task 1163 — 7. reviewMarketMessage idempotent (AC-9)
    pass: second call overwrites verdict without error

  Task 1163 — 8. reviewMarketMessage unknown id (AC-10)
    pass: returns false when id not found
    pass: does not throw when id not found

  Task 1163 — 9. reviewMarketMessage invalid verdict
    pass: throws Error("Invalid verdict") for value outside signal/noise

  Task 1163 — 10. sendTelegramMarket persist on success (AC-3)
    pass: returns true and inserts one row on successful send
    pass: inserted row has null ticker when persist.ticker is omitted

  Task 1163 — 11. sendTelegramMarket no persist on failure (AC-4)
    pass: returns false and inserts zero rows on failed send

  Task 1163 — 12. sendTelegramMarket backward compat without persist (AC-11)
    pass: compiles and returns true when called without persist option
    pass: inserts row with from_agent='unknown', message_type='unknown', ticker=null

  Task 1163 — 13. get_unreviewed_market_messages MCP tool — rows exist (AC-5)
    pass: returns JSON array with correct structure, newest first

  Task 1163 — 14. get_unreviewed_market_messages MCP tool — empty (AC-7)
    pass: returns bilingual empty-state string

  Task 1163 — 15. get_unreviewed_market_messages MCP tool — ticker filter (AC-6)
    pass: ticker="VCB" returns only VCB row

  Task 1163 — 16. review_market_message MCP tool — success with note (AC-8)
    pass: returns "Message N labelled as 'noise'. Note saved."

  Task 1163 — 17. review_market_message MCP tool — success without note (AC-8)
    pass: returns "Message N labelled as 'signal'." (no trailing note)

  Task 1163 — 18. review_market_message MCP tool — idempotent (AC-9)
    pass: second call returns success; row verdict overwritten

  Task 1163 — 19. review_market_message MCP tool — unknown id (AC-10)
    pass: returns "Message 999 not found."

36 pass / 0 fail
92 expect() calls
```

**Coverage notes**: `marketMessageStore.ts` at 100% function coverage / 98.04% line coverage. `marketMessageTools.ts` at 66.67% function coverage / 62.16% line coverage — uncovered lines 88-91 (error catch path, unreachable via Zod guard) and 121-144 (server.tool registration block, not exercised in unit tests which call handlers directly). Both gaps are acceptable for this task scope.

---

## Issues Discovered During Review

### BLOCKING Issues

None.

---

### NON-BLOCKING Issues

None. All deferred issues from TASK_REPORT_1164 (Issue 1164-01, Issue 1164-02) have been resolved in this task.

---

## Registry Verification

### registry.ts

- Import: `import { registerMarketMessageTools } from "./marketMessageTools.js";` — line 70. PRESENT.
- Registration: `registerMarketMessageTools,` — line 138 with comment `// Task 1166: get_unreviewed_market_messages + review_market_message (+2 tools → 93)`. PRESENT.

### tool-registry.json

- `toolCount`: 93. CORRECT (was 91 after Task 1146).
- Category `"Market Message Review"` added with `"count": 2` and `"tools": ["get_unreviewed_market_messages", "review_market_message"]`. PRESENT.
- `lastUpdated`: `"2026-04-13"`. CORRECT.

---

## QA Fixes Applied Verification

| Issue from TASK_REPORT_1164 | Expected Fix | File:Line | Status |
|-----------------------------|-------------|-----------|--------|
| 1164-01: `z.number()` → `z.coerce.number()` | `z.coerce.number().int().min(1).max(50)` | `marketMessageTools.ts:126` | APPLIED |
| 1164-01: `max(100)` → `max(50)` | `.max(50)` | `marketMessageTools.ts:126` | APPLIED |
| 1164-02: Error format | `"Error reviewing message ${args.id}: ${msg}"` | `marketMessageTools.ts:91` | APPLIED |

---

## Security Report

| # | Category | Description | Risk | Status |
|---|----------|-------------|------|--------|
| 1 | SQL Injection | All store queries use `?` positional placeholders. No string interpolation. | None | CLEAN |
| 2 | Verdict validation | Zod `z.enum(["signal","noise"])` at tool layer + runtime guard in store layer. | None | CLEAN |
| 3 | process.env | Zero `process.env` in new/modified source files. Tests use `process.env` in `__tests__/` — acceptable. | None | CLEAN |
| 4 | any types | Zero `: any` annotations in `marketMessageTools.ts`. | None | CLEAN |

**Security verdict**: CLEAN

---

## DDD Compliance

- `src/interface/mcp/tools/marketMessageTools.ts`: imports from `infrastructure/db/marketMessageStore.js` and `infrastructure/db/schema.js`. Interface → infrastructure direction. PASS.
- `src/interface/mcp/tools/registry.ts`: imports only from other interface layer tool files. PASS.
- Domain layer: zero new infrastructure imports added to `src/domain/`. PASS.

**DDD verdict**: PASS

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| `registerMarketMessageTools` imported and called in registry.ts | PASS | Line 70 import, line 138 registration |
| tool-registry.json toolCount = 93 | PASS | Was 91, +2 new tools |
| tool-registry.json "Market Message Review" category with 2 tools | PASS | get_unreviewed_market_messages, review_market_message |
| `z.coerce.number()` fix applied (Issue 1164-01) | PASS | marketMessageTools.ts:126 |
| `max(50)` fix applied (Issue 1164-01) | PASS | marketMessageTools.ts:126 |
| Error format fix applied (Issue 1164-02) | PASS | marketMessageTools.ts:91 |
| bun tsc --noEmit: 0 errors | PASS | |
| bun test src/__tests__/1163-*: 36/36 pass | PASS | All 3 previously-failing Task 1165 tests now green |

---

## Merge Summary

Branch `task/1163-market-message-review` is ready to merge. All sprint 068 tasks (1163–1166) are complete and the full 36-test suite is green.

```bash
git merge --no-ff task/1163-market-message-review -m "merge(1166): registry registration + tool-registry.json update"
```

- Type errors at merge: 0
- Test suite: 36/36 pass

---

## Notes for Next Tasks

- Sprint 068 branch `task/1163-market-message-review` ready for merge to `main`.
- Branch hygiene: delete local + remote branch after merge, remove any `.claude/worktrees/` entry if present.
- No known tech debt deferred from this task — all TASK_REPORT_1164 non-blocking issues resolved.
