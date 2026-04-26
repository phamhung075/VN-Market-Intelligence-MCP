# Task Report: 1333 — MSN Source Attribution Ticker Fix
date: 2026-04-25
outcome: APPROVED

## Test Results
- Unit tests (1333a): 8 pass / 0 fail
- Full suite (task branch): 6482 pass / 213 fail / 7 skip — 6702 total
- Baseline (main before merge): 6482 pass / 213 fail / 7 skip — 6702 total
- Regression delta: 0 new failures
- TypeScript: 0 errors (`bun tsc --noEmit`)

## Changed Files
- `apps/mcp-server/src/domain/services/stockAliases.ts` lines 793–826 — added `KNOWN_NEWS_SOURCES` regex const and exported `stripSourceAttributionSuffix()`
- `apps/mcp-server/src/application/usecases/pollNews.ts` lines 26, 717–719 — imported and applied `stripSourceAttributionSuffix` to `entry.sourceTitle` before `titleAndSummary` construction
- `apps/mcp-server/src/__tests__/1333a-msn-source-suffix.test.ts` — 8 unit tests (TDD RED phase authored before implementation)

## DDD Compliance: PASS
- `stockAliases.ts` is domain layer — zero imports from infrastructure or application
- `pollNews.ts` is application layer — imports from domain (`../../domain/services/stockAliases.js`) — correct direction
- Layer boundary: domain ← application. No upward violation.

## Security: PASS
- No `process.env` usage in modified files
- No hardcoded credentials or API keys
- The word "token" appearing in grep matches refers to a local variable holding the suffix string, not a credential

## Code Quality Notes
- `KNOWN_NEWS_SOURCES` regex is defined at module scope (compiled once) — correct
- `stripSourceAttributionSuffix` guards against empty string input — correct
- Short-alpha rule (2–5 chars) correctly handles "MSN", "AP", "AFP", "BBC", "CNN" even if not in the explicit list
- `BUSINESS` (8 chars) correctly excluded by the length guard — test case 5 passes
- Inner ` - X` patterns (e.g. "VCB - bank analysis - MSN") stripped correctly because regex anchors to `$` — test case 6 passes
- No `any` types introduced; `match[1] ?? ""` null-coalesced correctly

## Issues Found
### Blocking
None.

### Non-Blocking
None.

## Merge Status
Merged: `task/1333a-msn-source-suffix-test` → `main` (fast-forward, commit `1025b999`)
Branch deleted: local and remote (`task/1333a-msn-source-suffix-test`)
