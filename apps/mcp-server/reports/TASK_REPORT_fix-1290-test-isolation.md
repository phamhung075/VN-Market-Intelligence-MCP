# Task Report: fix/db-schema-missing-tables — FIX-1290 mock.module() Poisoning Fix
date: 2026-04-27
outcome: APPROVED

## Test Results
- Full suite: 7362 passed / 9 failed / 21 skipped
- TypeScript: 0 errors (`bun tsc --noEmit` clean)
- Previous baseline: 6536 pass / 213 fail (was 222 fail before this fix, pre-existing 9 remain)

## DDD Compliance: PASS
- Changed files are test files only — no domain layer changes
- No domain→infrastructure import violations

## Security: PASS
- Uses `Bun.env` only — no `process.env` in changed files
- No hardcoded credentials or API keys

## Test Quality: PASS
- FIX-1290-briefing-no-stale.test.ts: real module refs used for schema.js and marketMessageStore.js — prevents worker-scoped mock.module() from poisoning downstream test files in same Bun worker
- vnstock-3statement.test.ts: `afterAll` restores `Bun.env["DB_PATH"] = ":memory:"` so subsequent test files in same worker get the correct in-memory DB path

## 9 Pre-existing Failures (NOT regressions from this fix)
- `AC-4c: All 7 Cowork agent .md files include Step 0-b decision tree block` — cowork agent file structure, open since Sprint 230
- `Sprint 1338 — project-stats.json currentSprint equals 1338` — stale doc, sprint counter advanced
- `Sprint 1338 — SPRINT_GOAL.md contains retrospective section for sprint 1330-1337` — stale doc
- `Sprint 1338 — project-stats.json sprintGoal mentions 1338` — stale doc
- `Task 1300a — get_memory_files returns files for valid agent+task` — filesystem memory tool
- `Task 1300a — search_memory_by_trigger finds files by trigger tag` — filesystem memory tool
- `Task 1300b — update_memory_file creates issue file with front-matter` — filesystem memory tool
- `Task 1300b — update_memory_file creates pattern file` — filesystem memory tool
- `Task 1300b — update_memory_file sanitizes filename` — filesystem memory tool

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Merge Status
- Branch `fix/db-schema-missing-tables` merged to `main` via `--no-ff` (2026-04-27)
- Branch deleted post-merge
- `docs/data/project-stats.json` updated: testBaselinePass=7362, testBaselineFail=9, testFailures=9
