# Task Report: fix-bctc-ocr — BCTC OCR Fallback Edge Cases (1294b + 048 + 293 + 305)
date: 2026-04-25
outcome: CHANGES_REQUESTED

## Test Results

### Targeted suites
| Suite | Pass | Fail | Notes |
|-------|------|------|-------|
| 048-ssc-pipeline.test.ts | 9 | 1 | "returns null gracefully when PDF extraction yields empty text" |
| 293-ocr-fallback-pipeline.test.ts | 4 | 2 | "returns null when no OCR cache" + "pdfTextOverride empty string regression" |
| 1294b-bctc-fallback.test.ts | 7 | 1 | RED 8 timed out at 5000ms (default) |

### Full regression
Not run (targeted suites did not pass — blocked by QA pipeline rule).

### TypeScript
0 errors (`bun tsc --noEmit` clean).

## DDD Compliance: PASS
Changed files are `application/usecases/` layer only. No domain→infrastructure imports introduced.

## Security: PASS
- No `process.env` usage in changed files
- SQL uses parameterized bindings (existing pattern preserved)
- No hardcoded credentials

## Issues Found

### Blocking

**fetchParseAndStoreBctc.ts:191 — `enableBctcFallback` default changed to `true`, breaking 3 existing tests**

Root cause: The parameter default was changed from `false` to `true` (line 191). Three pre-existing tests call `fetchParseAndStoreBctc` without passing `enableBctcFallback` and expect `null` on empty extraction. With the new default, the fallback fires. When fallback is rejected (0 signals), the code returns `{ fallback: false, reason: ..., hints: ... } as any` — not `null`. The tests fail because the return value is a non-null object.

Affected tests:
- `048-ssc-pipeline.test.ts:280` — `expect(result).toBeNull()` on `pdfTextOverride: ""`
- `293-ocr-fallback-pipeline.test.ts:273` — `expect(result).toBeNull()` on no OCR cache + FPT ticker
- `293-ocr-fallback-pipeline.test.ts:294` — `expect(result).toBeNull()` on `pdfTextOverride: ""`

Fix options (Dev must choose one):
1. Change `enableBctcFallback` default back to `false`. Callers that want fallback must opt in explicitly. Update 1294b tests that need fallback to pass `enableBctcFallback: true`. This is the safer API contract.
2. Keep default `true` but update the 3 affected tests to pass `enableBctcFallback: false` explicitly, and ensure the rejected-fallback path returns `null` instead of `{ fallback: false, ... } as any` so the API contract is consistent.

**fetchParseAndStoreBctc.ts:344-354 — rejected fallback returns `{ fallback: false, reason, hints } as any` instead of `null`**

When fallback is enabled but rejected (insufficient signals, stale signals, contradictory directions), the function returns an `any`-cast object rather than `null`. This makes the return type contract unreliable and caused the 048/293 assertion failures. The return should be `null` in all rejection cases (the `reason` and `hints` can be logged but not returned to callers).

**1294b-bctc-fallback.test.ts:458 — RED 8 times out at default 5000ms**

RED 8 ("OCR fails → fallback inserted, then OCR succeeds → overwrites news_inference") calls the real pipeline for a second time with `pdfTextOverride` pointing to BCTC text. This triggers `insertAnalysis` which loads the LanceDB embedding model (Xenova/paraphrase-multilingual-MiniLM-L12-v2, ~400MB, first-load ~6s). The test has no timeout override and fails at 5000ms every time.

Fix: Add `{ timeout: 15000 }` to the test: `test('RED 8: ...', async () => { ... }, { timeout: 15000 })`.

### Non-Blocking

- `fetchParseAndStoreBctc.ts:376-386` — Dev brief stated an UPDATE to stamp `extraction_method='ocr_pdf'` was added here, but no such UPDATE exists. The `extraction_method` column is written by the news-inference path (`parseBctcReport.ts:700`) but not stamped for the normal PDF/OCR path. RED 8 assertion at line 546 (`expect(row.extraction_method).toBe('ocr_pdf')`) will fail even if the timeout is fixed. This UPDATE is missing from the implementation.

## Merge Status

BLOCKED — 4 test failures. Branch not merged.

## Action Required (Fixer targets)

1. `fetchParseAndStoreBctc.ts:191` — Change `enableBctcFallback` default to `false`, OR update 048:280, 293:273, 293:294 to pass `enableBctcFallback: false` explicitly
2. `fetchParseAndStoreBctc.ts:344-354` — Return `null` (not `any` object) when fallback is rejected — callers cannot handle non-null non-FinancialReport return
3. `fetchParseAndStoreBctc.ts:376-386` — Add UPDATE to stamp `extraction_method='ocr_pdf'` after successful OCR pipeline run (required by RED 8 assertion at 1294b:546)
4. `1294b-bctc-fallback.test.ts:458` — Add `{ timeout: 15000 }` to RED 8 test to handle embedding model first-load latency
