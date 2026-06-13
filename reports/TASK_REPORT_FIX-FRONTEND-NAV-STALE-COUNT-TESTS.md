# TASK REPORT: FIX-FRONTEND-NAV-STALE-COUNT-TESTS

**Agent:** dev-frontend
**Date:** 2026-06-13
**Commit:** e43480e0
**Status:** REVIEW-READY

---

## Vitest Before / After

| Metric | Before | After |
|--------|--------|-------|
| Failing tests | 21 | 0 |
| Passing tests | 1533 | 1554 |
| Total tests | 1554 | 1554 |
| Test files | 64 (6 failing) | 64 (0 failing) |

---

## The 21 Failures Fixed

All 21 were stale frozen-count assertions left over from earlier page-addition commits:

1. `FE-HEADER-SSOT-top-nav.test.tsx > ANALYST_NAV canonical list > exports exactly 19 analyst nav items`
2. `FE-HEADER-SSOT-top-nav.test.tsx > NAV_ITEMS union > NAV_ITEMS is the union of ANALYST_NAV + SYSTEM_NAV (26 items total)`
3. `task17-page14-shareholders-nav.test.tsx > ANALYST_NAV count after PAGE 14 addition > exports exactly 20 analyst nav items`
4. `task17-page14-shareholders-nav.test.tsx > NAV_ITEMS total after PAGE 14 addition > NAV_ITEMS is ANALYST_NAV (20) + SYSTEM_NAV (7) = 27 total`
5. `task17-page14-shareholders-nav.test.tsx > new item is last in ANALYST_NAV > last ANALYST_NAV entry is 'Cơ cấu cổ đông'`
6. `task17-page15-officers-nav.test.tsx > ANALYST_NAV count after PAGE 15 addition > exports exactly 21 analyst nav items`
7. `task17-page15-officers-nav.test.tsx > NAV_ITEMS total after PAGE 15 addition > NAV_ITEMS is ANALYST_NAV (21) + SYSTEM_NAV (7) = 28 total`
8. `task17-page15-officers-nav.test.tsx > new item is last in ANALYST_NAV > last ANALYST_NAV entry is 'Ban lãnh đạo'`
9. `task17-page15-officers-nav.test.tsx > new item is last in ANALYST_NAV > second-to-last ANALYST_NAV entry is 'Cơ cấu cổ đông' (adjacent placement)`
10. `task17-page16-financials-nav.test.tsx > ANALYST_NAV count after PAGE 16 addition > exports exactly 22 analyst nav items`
11. `task17-page16-financials-nav.test.tsx > NAV_ITEMS total after PAGE 16 addition > NAV_ITEMS is ANALYST_NAV (22) + SYSTEM_NAV (7) = 29 total`
12. `task17-page16-financials-nav.test.tsx > new item is last in ANALYST_NAV > last ANALYST_NAV entry is 'Định giá'`
13. `task17-page16-financials-nav.test.tsx > new item is last in ANALYST_NAV > second-to-last ANALYST_NAV entry is 'Ban lãnh đạo' (adjacent placement)`
14. `task17-page17-fedrates-nav.test.tsx > ANALYST_NAV count after PAGE 17 addition > exports exactly 23 analyst nav items`
15. `task17-page17-fedrates-nav.test.tsx > NAV_ITEMS total after PAGE 17 addition > NAV_ITEMS is ANALYST_NAV (23) + SYSTEM_NAV (7) = 30 total`
16. `task17-page17-fedrates-nav.test.tsx > new item is last in ANALYST_NAV > last ANALYST_NAV entry is 'Lãi suất Fed'`
17. `task17-page17-fedrates-nav.test.tsx > new item is last in ANALYST_NAV > second-to-last ANALYST_NAV entry is 'Định giá' (adjacent placement)`
18. `task17-page18-reputation-nav.test.tsx > ANALYST_NAV count after PAGE 18 addition > exports exactly 24 analyst nav items`
19. `task17-page18-reputation-nav.test.tsx > NAV_ITEMS total after PAGE 18 addition > NAV_ITEMS is ANALYST_NAV (24) + SYSTEM_NAV (7) = 31 total`
20. `task17-page18-reputation-nav.test.tsx > new item is last in ANALYST_NAV > last ANALYST_NAV entry is 'Uy tín DN'`
21. `task17-page18-reputation-nav.test.tsx > new item is last in ANALYST_NAV > second-to-last ANALYST_NAV entry is 'Lãi suất Fed' (adjacent placement)`

---

## Root-Cause Fix: Relative-Order Decoupling

NOT a renumber-refreeze. Each per-page test now asserts position via predecessor lookup:

```typescript
// Example from task17-page18-reputation-nav.test.tsx Suite 4:
it("'Uy tín DN' appears immediately after 'Lãi suất Fed' in ANALYST_NAV (relative order)", () => {
  const predecessorIdx = ANALYST_NAV.findIndex((n) => n.label === "Lãi suất Fed");
  const itemIdx = ANALYST_NAV.findIndex((n) => n.label === "Uy tín DN");
  expect(predecessorIdx).toBeGreaterThanOrEqual(0);
  expect(itemIdx).toBeGreaterThan(predecessorIdx);
  expect(itemIdx).toBe(predecessorIdx + 1); // immediately adjacent
});
```

This assertion holds regardless of how many items come after page 18 in future sprints.

---

## Canonical Absolute-Count SSOT

Single canonical absolute-count assertion consolidated in `FE-HEADER-SSOT-top-nav.test.tsx`:
- `exports exactly 26 analyst nav items` — live SSOT
- `NAV_ITEMS is the union of ANALYST_NAV + SYSTEM_NAV (33 items total: 26 analyst + 7 system)`

Per-page tests (page14-18) use:
- Suite 1: `ANALYST_NAV.length >= N` (minimum bound, not frozen exact)
- Suite 2: `NAV_ITEMS.length === ANALYST_NAV.length + SYSTEM_NAV.length` (structural invariant only)

---

## Gates

- tsc --noEmit: EXIT 0 (no output)
- Lint on changed files: EXIT 0 (test files excluded by eslint ignore pattern — standard)
- Vitest: 0 failures, 1554 passed (was 21 failures, 1533 passed)
- TopNav.tsx production code: NOT touched

---

## Files Changed

| File | Change |
|------|--------|
| `apps/frontend/app/__tests__/FE-HEADER-SSOT-top-nav.test.tsx` | Rebaseline 19→26 analyst / 26→33 total; add 7 new labels to render check |
| `apps/frontend/app/__tests__/task17-page14-shareholders-nav.test.tsx` | Decouple Suite 1 (>=20), Suite 2 (structural), Suite 4 (relative-order) |
| `apps/frontend/app/__tests__/task17-page15-officers-nav.test.tsx` | Decouple Suite 1 (>=21), Suite 2 (structural), Suite 4 (relative-order x2) |
| `apps/frontend/app/__tests__/task17-page16-financials-nav.test.tsx` | Decouple Suite 1 (>=22), Suite 2 (structural), Suite 4 (relative-order x2 + find) |
| `apps/frontend/app/__tests__/task17-page17-fedrates-nav.test.tsx` | Decouple Suite 1 (>=23), Suite 2 (structural), Suite 4 (relative-order x2 + find) |
| `apps/frontend/app/__tests__/task17-page18-reputation-nav.test.tsx` | Decouple Suite 1 (>=24), Suite 2 (structural), Suite 4 (relative-order x2 + find) |

No production code modified. No mcp-server files touched.
