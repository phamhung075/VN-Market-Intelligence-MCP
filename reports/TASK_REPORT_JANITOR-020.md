# Task Report: JANITOR-020 — DRY dedup marketContextTools shared types
date: 2026-05-02
outcome: APPROVED

## Test Results
- Targeted tests (239-market-context + 1360a-market-context-builder): 29 passed / 0 failed
- Full suite: OOM crash (Bun 1.3.11 bug — pre-existing, same crash URL across all recent sessions, unrelated to this change)
- TypeScript: 0 errors (bun tsc --noEmit clean; confirmed by pre-push hook)

## DDD Compliance: PASS

- marketContextTools.ts (interface layer) imports `AnalysisRow`, `AlertCountRow`, `LastCycleRow`, `MACRO_CODES` from `domain/services/marketContextBuilder.ts` — correct direction (interface → domain).
- marketContextBuilder.ts has ZERO runtime imports from infrastructure/ or application/. The only infrastructure-layer references in that file are in JSDoc comments.
- No circular dependency introduced.

## Security: PASS

- No process.env usage in changed files (Bun.env standard maintained).
- No hardcoded secrets or credentials.
- No SQL changes in this task.

## Changes
- `apps/mcp-server/src/domain/services/marketContextBuilder.ts` — export 3 interfaces + 1 const (8 lines changed, existing types made public)
- `apps/mcp-server/src/interface/mcp/tools/market-data/marketContextTools.ts` — remove 4 duplicate definitions, add 2 import lines (net -29 lines)

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Merge Status
- Branch: `task/JANITOR-020-dry-marketcontext-types`
- Developer commit: `5d227312`
- Merge commit: `9facacec`
- Merged to: `main`
- Pushed: YES (origin/main @ 9facacec)
- Branch deleted: YES
