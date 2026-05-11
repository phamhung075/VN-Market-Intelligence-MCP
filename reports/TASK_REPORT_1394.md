# Task Report: 1394 — TDD RED tests for alert-digest-diacritics
date: 2026-04-17
outcome: APPROVED

## Test Results

| Test | Status | Assertion | Actual output |
|------|--------|-----------|---------------|
| T1 | FAIL (RED) | `"Không có cảnh báo"` present | `"Khong co canh bao"` |
| T2 | FAIL (RED) | `"Tóm tắt cảnh báo"` present | `"Tom tat canh bao"` |
| T3 | FAIL (RED) | `"Tổng"`, `"Nghiêm trọng"`, `"Quan trọng"` present | `"Tong:"`, `"Nghiem trong"`, `"Quan trong"` |
| T4 | FAIL (RED) | `"cảnh báo:"` present | `"canh bao:"` |
| T5 | FAIL (RED) | `"(và"` + `"cảnh báo khác)"` present | `"(va"` + `"canh bao khac)"` |

- Unit tests: 0 passed / 5 failed — RED by design
- TypeScript: 0 errors (`bun tsc --noEmit` clean)

## RED Phase Verification: PASS

All 5 tests fail against current `formatAlertDigest` implementation (`assembleAlertDigest.ts` lines 144–171 use unaccented transliterated strings). Failures are genuine assertions, not infrastructure/import errors. Each test file imports only `formatAlertDigest` (pure fn, no DB, no infra) — correct seam.

## DDD Compliance: PASS

- Test file imports from `application/usecases/assembleAlertDigest.js` only — no `infrastructure/` imports
- No domain/infra cross-layer violation introduced

## Security: PASS

- No credentials, no `process.env`, no SQL, no HTTP in test file

## Issues Found

### Blocking
None.

### Non-Blocking
None.

## Merge Status

Branch contains test file only (no production code change). Merge to main approved — RED tests establish baseline for Task 1395 (GREEN fix).
