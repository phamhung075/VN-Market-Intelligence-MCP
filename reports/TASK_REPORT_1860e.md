# Task Report: 1860e — process_telegram_report delete_success field
date: 2026-05-09
outcome: APPROVED

## Summary

Adds structured JSON response to `process_telegram_report` MCP tool. Previously returned plain text; now returns JSON with `delete_success: true | false | null` so callers can distinguish three states: deletion succeeded, deletion failed (row still marked processed), deletion not requested.

## Changed Files

- `apps/mcp-server/src/interface/mcp/tools/briefings/telegramReportTools.ts` — Step 3 refactored: `telegramDeleted` boolean replaced by `deleteSuccess: boolean | null`; old abort-on-failure guard removed; response now JSON payload with `processed`, `report_id`, `resolution`, `delete_success`, `message` fields.
- `apps/mcp-server/src/__tests__/1860e-delete-success-field.test.ts` — 13 tests covering all 3 delete_success states + backward-compat text preservation.

## Test Results

- Unit tests (1860e): 13 passed / 0 failed
- Telegram regression (bun test telegram): 250 passed / 0 failed
- TypeScript (bun tsc --noEmit): 0 errors in task scope (pre-existing TSC errors unrelated to this task in regimeConfidenceThreshold.ts, dailyDashboardJob.ts, watchdog tests)

## DDD Compliance: PASS

- Changed file is in `interface/mcp/tools/` — correct layer for MCP tool handlers.
- No domain imports from infrastructure introduced by this task.

## Security: PASS

- No hardcoded credentials or API keys.
- No `process.env` usage (Bun.env standard maintained).
- No SQL in changed files.

## Issues Found

### Blocking
None.

### Non-Blocking
- Cherry-pick conflict with 1860c (which added `expire_monitoring_reports` tool and imports on main). Resolved manually: kept 1860e logic, retained 1860c additions. Both features coexist correctly.

## Merge Status

Cherry-picked commit `8b0d87d8` onto main as `7d0013dc`. Worktree removed. Branch `task/1860e-delete-success-field` deleted.
