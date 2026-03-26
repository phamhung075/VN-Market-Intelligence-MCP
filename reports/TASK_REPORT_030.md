# Task Report: 030 — PDF Downloader + pdf-parse Text Extractor

date: 2026-03-26
outcome: APPROVED

## Summary

Implements `src/infrastructure/fetchers/pdf.ts` — a two-function module that:

1. `extractPdfText(buffer)` — parses an in-memory PDF buffer with pdf-parse and returns `{ text, confidence }`.
2. `downloadAndExtractPdf(url, httpClient?)` — downloads a PDF over HTTP then delegates to `extractPdfText`. The `httpClient` parameter is injectable for testing.

The barrel `src/infrastructure/fetchers/index.ts` re-exports both functions and the `PdfExtractionResult` type.

---

## Test Results

- Unit tests (`030-pdf-extractor.test.ts`): **7 passed / 0 failed**
- Full regression suite: **212 passed / 0 failed**
- TypeScript (`bun tsc --noEmit`): **0 errors**

### Test coverage (task file)

| File | % Funcs | % Lines |
|------|---------|---------|
| `src/infrastructure/fetchers/pdf.ts` | 83.33 | 70.13 |

Uncovered lines (123–143) are the `makeDefaultHttpClient` axios path — this is the production HTTP adapter and is intentionally not exercised in unit tests (mock is injected instead). Coverage level is acceptable for an infrastructure adapter.

### Tests cover

- Valid PDF buffer returns text and confidence > 0
- Empty buffer returns `{ text: "", confidence: 0 }` without throwing
- Corrupt buffer returns `{ text: "", confidence: 0 }` without throwing
- Scanned/minimal PDF returns confidence < 0.5
- `downloadAndExtractPdf` with mock HTTP client returns text and valid confidence
- HTTP failure (thrown error) returns `{ text: "", confidence: 0 }`
- Non-PDF HTTP response (HTML 404 page) returns `{ text: "", confidence: 0 }`

---

## DDD Compliance: PASS

- `src/infrastructure/fetchers/pdf.ts` lives in the infrastructure layer — correct.
- No imports from `src/domain/` or `src/application/`.
- Imports only: `./ssc.js` (for the `HttpClient` interface type, also infra layer), `../logger.js` (infra).
- Domain layer has zero imports from infrastructure (scan: CLEAN).

---

## Security: PASS

- No `process.env` usage — configuration is via `Bun.env` (no config needed in this module).
- No `any` type annotations — the single `as unknown as ArrayBuffer` cast in the axios adapter is a necessary type coercion for axios's `arraybuffer` responseType, not an unsafe `any`.
- No SQL in this module — SQL injection scan not applicable.
- URL passed to axios is caller-supplied; no path traversal risk (HTTP URL, not filesystem path).
- `pdf-parse` is wrapped in try/catch — malformed PDFs cannot crash the process.
- No hardcoded credentials or API keys.

---

## Checklist

### TDD Compliance

- [x] Test file exists: `src/__tests__/030-pdf-extractor.test.ts`
- [ ] Tests written before implementation — single commit; cannot verify TDD Red/Green order. Non-blocking: all 7 tests are meaningful and cover real failure scenarios.
- [x] Every acceptance criterion has a test
- [x] `bun test` passes: 0 failures, 0 errors
- [x] Tests are meaningful (mock HTTP, real pdf-parse, corrupt buffer, empty buffer, scanned PDF)
- [x] Edge cases tested: empty buffer, corrupt buffer, HTTP failure, HTML response

### DDD Compliance

- [x] `src/domain/` has ZERO imports from `infrastructure/` or `application/`
- [x] Infrastructure stays in infrastructure
- [x] No business logic in this module

### TypeScript

- [x] Zero `any` type annotations
- [x] All exported functions have JSDoc comments
- [x] Import paths end with `.js` (ESM)
- [x] `bun tsc --noEmit` = 0 errors

### Security

- [x] No hardcoded credentials
- [x] No SQL (not applicable)
- [x] `Bun.env` only (no config needed here)
- [x] Error boundaries: `extractPdfText` and `downloadAndExtractPdf` both never throw

---

## Issues Found

### Blocking

None.

### Non-Blocking

1. **Single commit combines test + implementation** (`c990654`). TDD Red/Green order cannot be verified from git history. The tests are substantive and meaningful, so this is a process observation only.

2. **Line coverage 70.13%** — the uncovered branch is the production axios client (`makeDefaultHttpClient`, lines 123–143). This is the expected tradeoff for an injectable HTTP client pattern. Acceptable.

---

## Merge Status

Merged to `main` via `--no-ff`:
`merge(030): PDF downloader + text extractor`

Branch `task/030-pdf-extractor` deleted.

Task 030 dependency for Task 048 (SSC fetch → parse → store pipeline) is now satisfied. Task 048 can proceed.
