# Task Report: hotfix_bctc_integrity — BCTC Cross-Ticker Contamination + FPT Silent Failure
date: 2026-04-29
outcome: APPROVED

## Test Results
- Hotfix tests (`hotfix-bctc-integrity.test.ts`): 10 passed / 0 failed
- Related tests (`bctc-pdf-pull-job` + `1019-bctc-reparse-job`): 28 passed / 0 failed
- Full suite: 8008 passed / 22 failed / 21 skip
- Pre-existing failures: 22 (unchanged — no regression introduced)
- Pre-existing OOM crash: `1294b-bctc-fallback.test.ts` (Bun C++ panic, documented in handoff)
- TypeScript: 2 pre-existing errors in `1383` and `1397c` test files (not introduced by this hotfix). 3 new TS errors in `hotfix-bctc-integrity.test.ts` fixed by QA (null-initialized capture variables cast via `unknown`).

## DDD Compliance: PASS
- `bctcPdfPullJob.ts` and `bctcReparseJob.ts` are in `interface/scheduler` layer
- No imports from `domain/` in `infrastructure/` — domain layer is clean
- Production imports lazy-loaded inside `makeProductionDeps()` — correct pattern

## Security: PASS
- `Bun.env.VPS_PUSH_API_KEY` used correctly — no hardcoded secrets
- All SQL uses parameterized `.prepare(...).run(...)` — no string interpolation
- No path traversal patterns (`../`) in file path handling
- `file://` URL handling uses `existsSync` + controlled `localPath.replace` — no user input

## Issues Found

### Blocking (fixed by QA before merge)
- `hotfix-bctc-integrity.test.ts` lines 273–275: TS2769 — `.toBe(value)` on `null`-initialized variables rejected by TypeScript overload resolution. Fixed by `as unknown as T` cast pattern.

### Non-Blocking
- `bctcReparseJob.ts` `makeProductionDeps().insertFallbackRecord`: uses `Q${payload.quarter}` for `period_type` which produces `"QQ1"` when `quarter` is already `"Q1"`. This is a pre-existing issue in the fallback record logic (DA_NOP path), not introduced by this hotfix. Period_type inconsistency visible in log: `"period":"2025-QQ1"`. Recommend separate task.

## Merge Status
- Commits merged to main: `1b8fdfd3` (fix) + `d12ead94` (TS fix)
- Pushed to `origin/main`
- `mcp-server` container rebuilt and healthy: 118 tools, /health = ok
- No task branch to delete (hotfix was developed on main worktree directly)
