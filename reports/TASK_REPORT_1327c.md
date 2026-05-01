# Task Report: 1327c — Merge feature/ddd-phase-0 → main (tsc clean + gate pass)
date: 2026-04-25
outcome: APPROVED

## Commit
537a24c3 — fix(1327c): tsc clean + merge gates pass — 3 TypeScript errors resolved

## Files Changed
- apps/mcp-server/src/scheduler/alerts/alertScanParallelJob.ts:92-95
- apps/mcp-server/src/__tests__/1309-bb-alert-scan-job.test.ts:54-66,312-324,366-381
- apps/mcp-server/src/__tests__/1323-pdf-extractor-client.test.ts:28-39,86,133-146,150,188
- TASKS.md (kanban update)

## Test Results
- Unit tests (1309 + 1323): 21 pass / 0 fail
- Full suite: 6792-6798 pass / 13-14 fail (within ≤15 threshold) / 21 skip
- TypeScript: 0 errors (bun tsc --noEmit exits 0)

## Gate Verification

| Gate | Claim | Verified |
|------|-------|----------|
| G-1  | bun tsc --noEmit exits 0 | PASS — confirmed |
| G-2  | bun test fail count ≤ 15 | PASS — 13-14 fail (pre-existing, non-regression) |
| G-3  | Scaffold: packages/, apps/, docker-compose.yml, pnpm-workspace.yaml | PASS — all present |
| G-4  | docker-compose.yml contains mcp-server service | PASS — confirmed |
| G-5  | pnpm-workspace.yaml has apps/* and packages/* | PASS — confirmed |
| G-6  | packages/shared-types, shared-db, shared-config index.ts exist | PASS — all three present |
| G-7  | Bun 1.3.11 panic documented in commit message | PASS — C++ exception + bun.report link in commit body |

## Fix Assessment

### alertScanParallelJob.ts:92-95
Status narrowing: `results[0].status === "rejected"` used as boolean guard before
accessing `.reason`. The inline re-check on lines 93-94 is technically redundant
(ternary re-evaluates the same condition) but TypeScript requires it for type narrowing
within the expression. Correct and compliant with exactOptionalPropertyTypes.

### 1309-bb-alert-scan-job.test.ts
Removed explicit `undefined` fields from ComputeTAResponse mock objects
(exactOptionalPropertyTypes=true forbids assigning undefined to optional fields).
Renamed `bb.mid` → `bb.middle` matching actual ComputeTAResponse shape.
All 21 tests in this file pass.

### 1323-pdf-extractor-client.test.ts
Cast partial mock fetch functions via `as unknown as typeof fetch` to satisfy
TS2741 (missing `preconnect` property on full fetch type).
Non-null assertion `!` on capturedBody before `.toContain()` — acceptable in test
context where capturedBody is guaranteed assigned by the mock. All 11 tests pass.

## DDD Compliance: PASS
- scheduler layer importing from infrastructure/ — explicitly permitted per DDD table
- No domain/ imports from infrastructure/
- No upward imports detected in modified files

## Security: PASS
- No process.env usage in modified files
- No hardcoded credentials, tokens, or secrets
- No SQL in modified files (test/scheduler only)

## Pre-existing Failures (deferred to Sprint 1328)
13-14 failing tests across: 1289c (VPS payload schema), 1551 (pipeline watchdog
market alert), 1322 (evening summary — missing daily_ohlcv table), 1370 (france
watchlist movers), plus BCTC OCR x4, SSC null pipeline x2. None introduced by 1327c.

## Merge Status
Already merged to main as commit 537a24c3 (HEAD).
TASKS.md row 1327c: Done.
