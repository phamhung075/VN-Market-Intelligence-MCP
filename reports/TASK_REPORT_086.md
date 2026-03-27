# Task Report — Task 086: Alert MCP Tools (get_alerts, briefing, history)

> **Branch**: `task/086-tool-alerts`
> **Date started**: 2026-03-27
> **Date merged**: 2026-03-27
> **Final status**: APPROVED
> **DDD layer**: interface

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-03-27 | Dependency 064 cleared |
| Todo → In Progress | 2026-03-27 | Assigned to Developer |
| In Progress → Review | 2026-03-27 | Developer submitted |
| Review → Done | 2026-03-27 | Approved — first review |
| Done | 2026-03-27 | Merged to main |

---

## Role Activity Log

### PM (Project Manager)
- Defined 4 tool handlers: `get_alerts`, `mark_alert_read`, `run_daily_briefing`, `get_analysis_history`
- Dependencies: Task 064 (alert generator), Task 081 (Bun server)
- DDD layer: interface — tools call infrastructure directly (no application use-case layer yet)
- Acceptance criteria: `get_alerts()` returns generated alerts; `run_daily_briefing()` returns structured report with watchlist stock info

### Developer
- Files created:
  - `src/interface/mcp/tools/alerts.ts` — 548 lines, 4 MCP tools
  - `src/__tests__/086-tool-alerts.test.ts` — 506 lines, 25 tests
- Files modified:
  - `src/interface/mcp/index.ts` — barrel export for `registerAlertTools`
  - `TASKS.md` — moved 086 to Review
- TDD cycle: YES — test file committed alongside implementation (single task commit)
- Tests written: `src/__tests__/086-tool-alerts.test.ts`, 25 tests
- Assumptions: Tools call `initDatabase()` lazily (no side effects on import); in-memory SQLite used for tests via `DB_PATH=:memory:`

### QA — Review 1
- Date: 2026-03-27
- Outcome: APPROVED
- `bun test src/__tests__/086-*.test.ts` result: PASS (25/25)
- `bun test` (full suite) result: PASS (273/273)
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 1 non-blocking (see below)

---

## Test Results

```
bun test src/__tests__/086-tool-alerts.test.ts

  Task 086 — Alert MCP Tools
  (pass) registers all 4 tools on the McpServer
  get_alerts
    (pass) returns a 'no alerts' message when table is empty
    (pass) returns alerts when they exist
    (pass) returns alerts sorted by most recent first
    (pass) filters by severity — only returns matching severity
    (pass) filters unread only — excludes read alerts
    (pass) filters by actionCode — only returns alerts affecting that stock
    (pass) respects the limit parameter
    (pass) respects the limitDays parameter — excludes older alerts
  mark_alert_read
    (pass) marks a specific alert as read by id
    (pass) marks all unread alerts as read when no alertId is provided
    (pass) saves a user note when provided
  run_daily_briefing
    (pass) returns a structured text response
    (pass) briefing includes a date header
    (pass) briefing includes active alerts section
    (pass) briefing includes watchlist section
    (pass) briefing includes VCB in watchlist section when VCB is in watchlist
    (pass) briefing shows 'no active alerts' when there are none
  get_analysis_history
    (pass) returns 'no analyses' when table is empty
    (pass) returns analysis entries when they exist
    (pass) filters by actionCode
    (pass) filters by level
    (pass) respects the limit parameter
    (pass) filters by fromDate and toDate
  storeAlerts → get_alerts roundtrip
    (pass) alerts stored via storeAlerts are retrievable via get_alerts

Tests: 25 passed, 0 failed
```

Full regression: 273 passed, 0 failed across all test files.

**Coverage notes**: All 4 tools covered including edge cases (empty tables, filter combinations, limit/date range params). Error-path branches in catch blocks are not exercised (uncovered at lines 242–250, 301–309, 405–413, 534–542) — these are defensive guards and acceptable to leave untested.

---

## Issues Discovered During Review

### BLOCKING Issues

None.

---

### NON-BLOCKING Issues

#### Issue 086-01
- **Type**: Architecture / Deferred wiring
- **File**: `src/index.ts`
- **Description**: `registerAlertTools()` (and `registerWatchlistTools()`) are exported and available but not called from the main entry point `src/index.ts`. The MCP server starts without any tools registered. This is a pre-existing pattern from task 082 — not introduced by this task.
- **Fix applied**: Deferred — a dedicated "wire-up" task should call all `register*Tools()` functions inside `createBunServer()` or `src/index.ts`. This will be needed before the smoke test.
- **Status**: Deferred to Task 083/wiring task in Sprint 004

---

## Bug Report

| # | Severity | Description | File | Status |
|---|----------|-------------|------|--------|
| — | — | No bugs found | — | — |

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | SQL Injection | `actionCode` filter uses `LIKE $actionCode` with `%` prefix/suffix | Low | Parameterized query used — no interpolation; LIKE pattern is safe |
| 2 | process.env | No `process.env` usage found | None | Uses `Bun.env` via `infrastructure/config.ts` |

**Security verdict**: CLEAN

All SQL queries use parameterized binding (named `$param` style). No string interpolation in SQL. No hardcoded credentials. No `process.env` usage in implementation code.

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| `get_alerts()` returns generated alerts from DB | PASS | Roundtrip test with `storeAlerts` + `get_alerts` confirmed |
| `get_alerts()` filters by severity, unread, actionCode, date range, limit | PASS | 7 dedicated filter tests |
| `mark_alert_read` marks single alert by ID | PASS | DB row verified directly |
| `mark_alert_read` marks all unread when no ID given | PASS | Count verified (2 marked) |
| `mark_alert_read` saves user note | PASS | DB `user_note` column verified |
| `run_daily_briefing()` returns structured report with date header | PASS | Regex match on year |
| `run_daily_briefing()` includes active alerts section | PASS | Text contains "alert" |
| `run_daily_briefing()` includes watchlist stock info (VCB) | PASS | VCB confirmed in output text |
| `run_daily_briefing()` shows no-alerts message when empty | PASS | Regex: `no.*alert\|0.*alert` |
| `get_analysis_history()` returns entries and supports all filters | PASS | 6 tests: empty, basic, actionCode, level, limit, date range |
| All 4 tools registered on McpServer | PASS | Registry check confirms all 4 keys |
| All tools use `{ content: [{ type: 'text' as const, text: '...' }] }` format | PASS | Every return path uses this shape |
| All tool inputs have Zod `.describe()` | PASS | All input fields annotated |
| Zero `any` types | PASS | `grep -rn ": any"` returns nothing |
| `bun tsc --noEmit` = 0 errors | PASS | |

---

## Merge Summary

```bash
git checkout main
git merge --no-ff task/086-tool-alerts -m "merge(086): alert MCP tools (get_alerts, briefing, history)"
```

- Commits in branch: 2 (implementation + review/TASKS.md update)
- Files changed: 4 (`alerts.ts`, `086-tool-alerts.test.ts`, `index.ts`, `TASKS.md`)
- Tests added: 25 new tests
- Type errors at merge: 0

---

## Notes for Next Tasks

- Sprint 003 is now COMPLETE. All 5 sprint tasks merged: 021, 082, 063, 064, 086.
- Before the smoke test (Sprint 003 close-out): a wiring task is needed to call `registerWatchlistTools()`, `registerAlertTools()`, and `registerReportTools()` from `src/index.ts` — otherwise the live server has no tools.
- Sprint 004 can begin with market data fetchers (024–028) or analysis pipeline tools (083, 084).
