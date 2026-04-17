# TASK REPORT — Sprint 111 (Tasks 1337 + 1338)

**Date:** 2026-04-16
**Branch:** `task/1337-1338-test-isolation` → merged to `main`
**Reviewer:** QA agent

---

## Summary

| # | Check | Result |
|---|-------|--------|
| 1 | TypeScript `bun tsc --noEmit` | PASS (0 errors) |
| 2 | Production source changes | NONE (test files only) |
| 3 | DDD compliance (`domain/` imports) | PASS |
| 4 | Security (`process.env` in prod src) | PASS |
| 5 | `297-foreign-flow-fix.test.ts` — 5/5 pass | PASS |
| 6 | `297` DB_PATH at line 10 before imports | PASS |
| 7 | `296` OCR `it()` timeout = 30000ms | PASS |
| 8 | `296` fails fast at 30s (not 8+ min hang) | PASS |
| 9 | Full suite — 4910 pass, 20 skip, 1 fail | PASS |

---

## Task Details

### Task 1337 — 297-foreign-flow-fix DB isolation

**Root cause:** `process.env["DB_PATH"]` was set after imports, so the DB singleton was already initialized with the shared on-disk DB before the in-memory override could take effect. Concurrent tests inserting the same ticker caused UNIQUE constraint violations.

**Fix:** Moved `process.env["DB_PATH"] = ":memory:";` to line 10, before all imports. Added `afterAll(closeDb)` to release the singleton after the test file completes.

**Result:** 5/5 tests pass, no UNIQUE constraint errors.

### Task 1338 — 296-ocr-pipeline-e2e timeout cap

**Root cause:** OCR `it()` had no explicit timeout, so Bun used the default (which allowed the tesseract process to run for 8+ minutes on a 61-page VNM PDF before the suite was forcibly killed).

**Fix:** Added `30_000` (30s) as the third argument to the `it()` call. The OCR test now times out cleanly at ~30s with `this test timed out after 30000ms` — the dangling tesseract process is killed by Bun automatically.

**Result:** 1 expected timeout failure at 30s, no hang.

---

## Full Suite Result (post-merge on main)

```
4910 pass | 20 skip | 1 fail
Ran 4931 tests across 370 files [58.77s]
```

The 1 fail is test 296 OCR timeout — expected and acceptable per task specification.

Note: Bun runtime crash at process exit (`panic: A C++ exception occurred`) is a known Bun 1.3.11 bug unrelated to this task. All 4910 tests completed successfully before the crash.

---

## Files Changed

- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/297-foreign-flow-fix.test.ts` — DB_PATH moved to line 10 + afterAll(closeDb) added
- `/Users/admin/Documents/Hung/__works__/__PROJET/__labo/VN-Market-Intelligence-MCP/src/__tests__/296-ocr-pipeline-e2e.test.ts` — explicit 30s timeout on OCR it()

**Verdict: APPROVED — merged.**
