# Task Report 1278a — RED Phase: Insider Dump Cascade Tests

**Sprint:** 1278
**Phase:** RED (test definition)
**Status:** APPROVED
**Date:** 2026-04-22

---

## Summary

RED phase test suite (1278a) establishes 6 test cases for insider dump cascade detection. 5 tests PASS (sentiment keywords + cascade plumbing), 1 test FAILS intentionally (contract test for INSIDER_DUMP_RULES, implemented in GREEN phase 1278b).

---

## Files Changed

| File | Lines | Status |
|------|-------|--------|
| `src/__tests__/1278a-insider-dump-cascade-red.test.ts` | NEW, 225 lines | APPROVED |

---

## QA Checklist Results

| Check | Result | Notes |
|-------|--------|-------|
| **1. TDD** | PASS | 5 tests use only existing components (sentimentClassifier.classifySentiment, buildCausalChain from cascadeEngine). No new module creation. |
| **2. Contract Test** | PASS | TC-4 properly defines INSIDER_DUMP_RULES interface (key + keyword + sector fields). Test fails until GREEN phase—intentional. |
| **3. DDD Compliance** | PASS | All imports from `domain/services/` (sentimentClassifier, cascadeEngine, newsNormalizer). Zero cross-layer violations. |
| **4. Security** | PASS | No `process.env` hardcoding. No SQL injection vectors. No unvalidated user input. |
| **5. TypeScript** | PASS | `bun tsc --noEmit` returns 0 errors. All type annotations correct (DomainType casts, AnalysisEntry structure). |
| **6. Test Template** | PASS | Follows `.claude/knowledge/dev-standards.md` pattern: describe/test/expect structure, clear test names, readable assertions. |
| **7. Coverage** | PASS | 6 test cases cover: (TC-1) xả hàng sentiment, (TC-2) bán sạch sentiment, (TC-3) thoái sạch sentiment, (TC-4) INSIDER_DUMP_RULES contract, (TC-5) banking cascade plumbing, (TC-6) non-banking guard (FPT tech sector). |

---

## Test Results

```
Task 1278a — Insider Dump Cascade (RED Phase)

TC-1: xả hàng keyword triggers bearish sentiment ..................... PASS
TC-2: bán sạch keyword triggers bearish sentiment ..................... PASS
TC-3: thoái sạch keyword triggers bearish sentiment ................... PASS
TC-4: INSIDER_DUMP_RULES array defined with correct structure ........ FAIL (expected)
TC-5: buildCausalChain with banking insider dump includes peers ....... PASS
TC-6: FPT (tech) insider dump does not cascade to banking ............ PASS

Result: 5 PASS / 1 FAIL (expected)
Assertions: 24 total
```

### Test Breakdown

**Existing Components Used:**
- `classifySentiment()` from `src/domain/services/sentimentClassifier.ts` — all 3 insider dump keywords (xả hàng, bán sạch, thoái sạch) already present (lines 130, 132, 133)
- `buildCausalChain()` from `src/domain/services/cascadeEngine.ts` — already processes banking domains and action-level seeds

**Contract Test (TC-4):**
- Uses dynamic import to gracefully handle INSIDER_DUMP_RULES being undefined in RED phase
- Defines expected interface: key + keyword + sector fields
- Expects 3+ rules with keywords matching sentiment classifier
- All rules must target "banking" sector
- All rules must share key "insider_dump_banking_peers"
- Will PASS in GREEN phase when INSIDER_DUMP_RULES is exported from cascadeEngine

---

## Full Test Suite Status

**Before task:** 6171 tests
**New tests added:** 6 (all within 1278a test file)
**After task:** 6177 tests expected
**Actual result:** 6176 PASS + 1 FAIL (from 1278a TC-4)

Full suite regression: CLEAN (no unintended failures in other modules)

---

## DDD Layer Compliance

| Layer | Status | Details |
|-------|--------|---------|
| domain → application | PASS | sentimentClassifier (domain), buildCausalChain (domain) — no outbound dependencies |
| Test imports | PASS | Only domain/services, no infrastructure/*, no application/* |
| Type safety | PASS | All AnalysisEntry, WatchlistEntry, DomainType annotations correct |

---

## Security Scan

| Area | Status | Scan |
|------|--------|------|
| SQL injection | PASS | No SQL queries in test file |
| Env vars | PASS | Zero `process.env` or `Bun.env` hardcoding |
| Input validation | PASS | Test fixtures use hardcoded strings, no untrusted input |

---

## Next Steps

1. **GREEN phase (1278b):** Developer implements INSIDER_DUMP_RULES + peer-banking cascade logic in cascadeEngine
2. **TC-4 will then PASS** when INSIDER_DUMP_RULES is exported
3. **Merge 1278b** to complete insider dump feature

---

## Blocking Issues

None. All checks pass. Intentional TC-4 failure is by design.

---

## non_blocking Notes

- TC-4 uses `require()` for dynamic import (Bun compatibility). Could refactor to async import in future, but current approach is pragmatic for RED phase.
- All three sentiment keywords pre-exist from sprint 1272 — no changes needed to sentimentClassifier.ts
- buildCausalChain already processes banking domain; peer-filtering logic is GREEN phase responsibility

---

## Verdict

**APPROVED** — Ready for merge to main.

1278a establishes clean test structure for insider dump cascade feature. All 5 production tests pass with existing components. Contract test (TC-4) correctly fails, defining the interface for GREEN phase implementation. No regressions in full test suite.
