# Task Report — Task 028: SBV Macro Fetcher

> **Branch**: `task/028-sbv-macro`
> **Date started**: 2026-03-29
> **Date merged**: 2026-03-29
> **Final status**: APPROVED
> **DDD layer**: infrastructure/fetchers

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-03-29 | Promoted from Sprint 008 deferred backlog |
| Todo → In Progress | 2026-03-29 | Assigned to Developer |
| In Progress → Review | 2026-03-29 | Developer submitted |
| Review → Done | 2026-03-29 | QA approved, merged |
| Done | 2026-03-29 | Merged to main via `merge(028)` |

---

## Role Activity Log

### Developer
- Files created:
  - `src/infrastructure/fetchers/sbv.ts`
  - `src/__tests__/028-sbv-rates.test.ts`
- Files modified:
  - `src/infrastructure/db/schema.ts` — added `sbv_rates` and `sbv_rates_history` tables
  - `src/infrastructure/fetchers/index.ts` — barrel export for `fetchSbvRates`, `storeSbvSnapshot`, `SbvMacroSnapshot`
- TDD cycle followed: YES
- Tests written: 14 tests (SBV-01 through SBV-14)
- Assumptions:
  - SBV interest rate page: `/en/home/rm/ir` — HTML table, row per rate type
  - SBV exchange rate page: `/en/home/rm/ex` — HTML table, Transfer rate preferred
  - Vietnamese number format: dots as thousand separators, commas as decimal separators

### QA — Review 1
- Date: 2026-03-29
- Outcome: APPROVED
- `bun test src/__tests__/028-sbv-rates.test.ts` result: PASS (14 tests, 0 failures)
- `bun tsc --noEmit` result: PASS (0 errors)
- Full regression `bun test`: 842 pass, 0 fail (after merging all Wave 1 tasks)
- Issues found: 0 blocking, 0 non-blocking

---

## Test Results

```
bun test src/__tests__/028-sbv-rates.test.ts

  Task 028 — SBV Macro Fetcher
  ✓ SBV-01: successful parse of both pages returns all 3 fields
  ✓ SBV-02: parses overnight rate from interest rate table
  ✓ SBV-03: parses refinancing rate from interest rate table
  ✓ SBV-04: parses USD/VND official rate with Vietnamese dot-thousand format
  ✓ SBV-05: interest rate page failure sets rate fields to 0, FX still populated
  ✓ SBV-06: FX page failure sets usdVndOfficial to 0, rates still populated
  ✓ SBV-07: both pages fail returns null
  ✓ SBV-08: HTTP error returns null without throwing
  ✓ SBV-09: empty tables result in zero-filled fields
  ✓ SBV-10: storeSbvSnapshot upserts latest row (INSERT OR REPLACE)
  ✓ SBV-11: storeSbvSnapshot appends to history table on each call
  ✓ SBV-12: fetchSbvRates and storeSbvSnapshot are re-exported from the barrel index
  ✓ SBV-13: returned snapshot fetchedAt is a valid ISO 8601 timestamp
  ✓ SBV-14: Vietnamese labels in HTML are also matched correctly

Tests: 14 passed, 0 failed
```

**Coverage notes**: Both English and Vietnamese bilingual label arrays are tested (SBV-14). Vietnamese dot-thousand format for FX rates tested (SBV-04). Comma-decimal variant included in fixtures (`FX_HTML_COMMA`). Barrel check uses file-content scan rather than live import to avoid hnx.ts module-level side effects (SBV-12).

---

## DDD Compliance

- `src/infrastructure/fetchers/sbv.ts` is correctly placed in the infrastructure layer.
- No imports from `src/domain/` in the fetcher.
- `SbvMacroSnapshot` interface defined locally in the fetcher module.
- Two-page concurrent fetch design with independent failure handling.
- Injectable `HttpClient` pattern — consistent with `ssc.ts` and `yahooFinance.ts`.

---

## Issues Discovered During Review

### Blocking Issues

None.

### Non-Blocking Issues

- **storeSbvSnapshot not try/catch wrapped**: Unlike `storeCommoditySnapshot` in task 025, `storeSbvSnapshot` does not catch the transaction error — if the transaction throws, the error propagates to the caller. This is a minor inconsistency. Deferred: acceptable since callers (scheduler jobs) wrap in their own try/catch.

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | SQL Injection | All SQLite queries use parameterized statements | None | Parameterized queries used throughout |
| 2 | Secrets | No hardcoded credentials | None | `Bun.env` used for URL override via `SBV_BASE_URL` |
| 3 | Path Traversal | No file path operations | None | N/A |

**Security verdict**: CLEAN

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| `SbvMacroSnapshot` interface exported | PASS | SBV-01 |
| Overnight rate parsed (English label) | PASS | SBV-02 |
| Refinancing rate parsed (English label) | PASS | SBV-03 |
| USD/VND parsed with Vietnamese number format | PASS | SBV-04 — "24.150" → 24150 |
| Interest rate page failure → rates=0, FX still works | PASS | SBV-05 |
| FX page failure → FX=0, rates still work | PASS | SBV-06 |
| Both pages fail → null | PASS | SBV-07 |
| HTTP error → null, never throws | PASS | SBV-08 |
| Empty tables → zero-filled snapshot (not null) | PASS | SBV-09 |
| `storeSbvSnapshot` dual-table transaction | PASS | SBV-10, SBV-11 |
| INSERT OR REPLACE upsert semantics | PASS | SBV-10 |
| History append on each call | PASS | SBV-11 |
| Barrel export correct | PASS | SBV-12 |
| fetchedAt is ISO 8601 | PASS | SBV-13 |
| Vietnamese bilingual labels matched | PASS | SBV-14 — "Qua đêm", "Tái cấp vốn" |
| Two-page fetch design | PASS | concurrent gets to /rm/ir and /rm/ex |
| `bun tsc --noEmit` clean | PASS | 0 errors |
| DDD: no domain imports in infrastructure | PASS | verified by grep scan |

---

## Merge Summary

```bash
git merge --no-ff task/028-sbv-macro -m "merge(028): SBV macro fetcher"
```

- Commits in branch: 1 (+ 1 PM commit moving task to Review)
- Files changed: 4
- Lines added: +805 | Lines removed: -1
- Tests added: 14 new tests (SBV-01 through SBV-14)
- Type errors at merge: 0

---

## Notes for Next Tasks

- `sbv_rates` and `sbv_rates_history` tables are now in schema.
- `SbvMacroSnapshot` available from fetchers barrel for use in application use cases.
- Sprint 008 Wave 2 can now build on both `yahooFinance.ts` and `sbv.ts` for macro intelligence context enrichment.
- VN decimal normalization function `parseVietnameseFxRate` in `sbv.ts` follows the same pattern as `vnNumberParser.ts` in domain — consider unifying if reused elsewhere.
