# TASK_REPORT: QUE-REFERENCE-PAGE-TEST

**Task:** QUE-REFERENCE-PAGE-TEST
**Status:** REVIEW
**Agent:** dev-frontend
**Date:** 2026-06-13
**Commit:** 13a3bfd0

---

## Summary

Wrote tests for the QUE_DETAIL generated map and added QueName deep-link tests to the existing codegen pipeline test file.

---

## Files Changed

| File | Action | Tests |
|---|---|---|
| `apps/frontend/app/__tests__/QUE-REFERENCE-PAGE-detail.test.ts` | CREATE | 13 tests (T1–T6) |
| `apps/frontend/app/__tests__/QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx` | RENAME+EXTEND (was .ts) | 16 tests (14 original + 2 deep-link) |
| `apps/frontend/app/__tests__/QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.ts` | DELETED (renamed to .tsx) | — |

---

## Vitest Results

| | Before | After | Delta |
|---|---|---|---|
| Fail | 21 | 21 | 0 |
| Pass | 1518 | 1533 | +15 |
| Total | 1539 | 1554 | +15 |

Pre-existing 21 failures are unrelated nav-order tests (task17-page18-reputation-nav, task17-page17-fedrates-nav, etc.) — unchanged.

---

## New Tests Added: 15

### File 1: QUE-REFERENCE-PAGE-detail.test.ts (13 tests)

| Suite | Count | Assertion |
|---|---|---|
| T1: QUE_DETAIL entry count | 1 | Object.keys(QUE_DETAIL).length === 64 |
| T2: all required fields | 2 | 12 scalar fields present + non-empty; phases is array |
| T3: phases shape | 2 | 6 items each; phase/action/outcome/gloss keys present + non-empty |
| T4: quẻ 1 spot-check | 4 | id=1, name='Kien', chinese='乾', coreMeaning matches SSOT |
| T5: legacy map not mutated | 2 | QUE_DESCRIPTIONS[1] has exactly 2 keys; no detail fields |
| T6: codegen banner | 2 | QUE_DETAIL defined + plain Object prototype |

### File 2: QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx (2 new tests)

| Suite | Count | Assertion |
|---|---|---|
| withDetailLink deep-link | 1 | anchor href contains #que-1 when withDetailLink=true (hexagram=1) |
| default / no prop | 1 | NO anchor rendered when withDetailLink absent |

**Implementation note:** The tooltip primitives (`~/components/ui/tooltip`) are mocked via `vi.mock` to render inline (no Radix portal, no timer delay). This avoids React Fast Refresh HMR transform issues in jsdom and allows direct container queries for the anchor. The mock is scoped to this test file only and does not affect any other test file.

---

## Type Check

`cd apps/frontend && npx tsc --noEmit` — EXIT 0 (clean)

---

## Lint

`npx eslint app/__tests__/QUE-REFERENCE-PAGE-detail.test.ts app/__tests__/QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx` — 0 errors (test files are .gitignored from eslint per project convention, warnings only).

---

## Technical Decisions

- **Rename .ts → .tsx:** The existing `QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.ts` was the closest existing QueName test file. JSX rendering tests require `.tsx` extension. Renamed (git detects as rename, 65% similarity) rather than creating a separate file.
- **Tooltip mock:** `~/components/ui/tooltip` uses `React.forwardRef` which triggers React Fast Refresh transforms from `@remix-run/dev` Vite plugin. In jsdom these transforms inject `$RefreshSig$` calls that fail without the HMR runtime. Mocking the module avoids the transform path entirely and keeps the test focused on the prop contract.
- **Generic iteration:** T2/T3 use `Object.values(QUE_DETAIL).forEach` — no per-hexagram switch/hardcode.
- **Spot-check values read from live file:** T4 coreMeaning value was read directly from the generated file rather than invented.

---

## RETURN

DONE: Test files committed — SERVICE=frontend, TIER=4, CHANGED=[QUE-REFERENCE-PAGE-detail.test.ts (CREATE), QUE-TOOLTIP-DRY-1a-codegen-pipeline.test.tsx (RENAME+EXTEND)], NEW_PASS=15, tsc clean
NEXT: qa | run full QA pipeline on main
HANDOFF: reports/TASK_REPORT_QUE-REFERENCE-PAGE-TEST.md
PIPELINE: continue
