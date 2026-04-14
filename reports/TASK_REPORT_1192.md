# Task Report: 1192 — Evening Summary Empty-Content Fallback

date: 2026-04-14
outcome: APPROVED

## Task Summary

When `hasContent === false` in `runEveningSummary`, the job previously silently
skipped sending a Telegram message. Task 1192 adds an explicit fallback: a plain
Vietnamese text message is sent to the market channel referencing `get_pipeline_health`
so the user knows to diagnose the pipeline.

## Test Results

- Unit tests (task file): 4 passed / 0 failed
- Full suite (1192 + 1168 together): 35 passed / 0 failed
- TypeScript: 0 errors (`bun tsc --noEmit` clean)

## Acceptance Criteria Verification

1. **4 tests pass** — confirmed: all 4 tests in
   `src/__tests__/1192-evening-summary-empty-fallback.test.ts` green.

2. **Fallback sends exactly once on empty content** — `eveningSummaryJob.ts`
   line 147: `await doSend(fallback, ...)` called exactly once inside the
   `else` branch. Test 1 asserts `calls.length === 1`.

3. **Plain text, no Markdown, references `get_pipeline_health`** — fallback
   string (line 143-146) contains no `*`, backtick, or `#` characters.
   Test 2 asserts absence of `[*\`#]`. Test 3 asserts
   `capturedMessage.toContain("get_pipeline_health")`.

4. **Normal content path unchanged** — Test 4 asserts `calls.length === 1`
   for `fullSummary()` and that the message does NOT contain
   `get_pipeline_health`, confirming the two paths are mutually exclusive.

5. **sendFn injection for test isolation** — `runEveningSummary` accepts
   optional `sendFn?: (message, opts) => Promise<void>`. In production both
   `summaryFn` and `sendFn` default to dynamic imports; in tests they are
   injected as closures. No network calls in tests.

## DDD Compliance: PASS

`eveningSummaryJob.ts` is in the `scheduler` layer (permitted to import
`infrastructure/logger` and `application/usecases`). The changed file does not
introduce any new cross-layer violations. Domain files are unchanged.

## Security: PASS

- No hardcoded credentials.
- No SQL in changed files.
- `process.env["DB_PATH"] = ":memory:"` in the test file is the standard
  in-memory DB bootstrap used across all test files in this project — acceptable
  test-only pattern; not present in production code.
- Fallback message is plain Vietnamese text — no Markdown injection surface.

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Merge Status

APPROVED — merged to main via standard procedure.
