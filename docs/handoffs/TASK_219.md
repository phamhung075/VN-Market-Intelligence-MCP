# TASK_219 — fix(test-isolation): 1526 mock.module poison

## TLDR

branch: task/219-fix-1526-mock-poison
change: add optional `detectSignalsFn` DI param to `runSignalDetectionGuard`; remove `mock.module` calls from 1526 test; pass mock directly as 3rd arg
test: `src/__tests__/1526-push-prices-market-hours-guard.test.ts`

## Problem

`1526-push-prices-market-hours-guard.test.ts` called `mock.module("signalDetector.js")` at module scope.
Bun's `mock.module` replaces the real implementation process-wide, poisoning 47 tests across domain/signal files.

## Fix

Add optional `detectSignalsFn?: typeof detectSignals` as 3rd param to `runSignalDetectionGuard`.
Inside the loop: `const fn = detectSignalsFn ?? detectSignals;`
Tests pass the mock directly — no process-wide module replacement.

files_to_modify:
- `src/interface/mcp/pushPricesSignals.ts`
- `src/__tests__/1526-push-prices-market-hours-guard.test.ts`

---

## [Developer] Implementation Record

files_actually_modified:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/pushPricesSignals.ts   # added detectSignalsFn?: typeof detectSignals param (line 36); use `fn = detectSignalsFn ?? detectSignals` inside loop (line 60-61)
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1526-push-prices-market-hours-guard.test.ts   # removed mock.module("signalDetector.js") and mock.module("alertStore.js") calls; pass detectSignalsMock as 3rd arg to all 3 runSignalDetectionGuard() calls

tests_written:
- src/__tests__/1526-push-prices-market-hours-guard.test.ts   # 3 assertions, all GREEN (AC-1/AC-2/AC-3)

tests_skipped: []

tsc_clean: true
full_suite_pass: true   # 5784 pass, 0 fail (5805 total including 21 skip)

---

## [QA] Review Record

verdict: APPROVED
blocking_issues: []
non_blocking: []

files_confirmed_clean:
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/interface/mcp/pushPricesSignals.ts
- /Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/1526-push-prices-market-hours-guard.test.ts

merge_commit: 26eba37
