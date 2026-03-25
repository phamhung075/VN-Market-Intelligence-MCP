# Task Report 041 — Vietnamese Number Parser

**Branch**: `task/041-vn-number-parser`
**Merged**: 2026-03-25
**Reviewer**: Claude (Reviewer agent)

---

## Summary

Implements `parseVnNumber()`, a pure domain-layer function that converts Vietnamese-formatted number strings to JavaScript numbers. Handles dot-as-thousands, comma-as-decimal, parenthesized negatives, and gracefully detects English-format numbers when unambiguous.

## Files Changed

| File | Change |
|------|--------|
| `src/domain/services/vnNumberParser.ts` | New — 93 lines, single exported pure function |
| `src/domain/services/index.ts` | Updated — barrel re-export of `parseVnNumber` |
| `src/__tests__/041-vn-number-parser.test.ts` | New — 19 test cases |

## Test Results

- **19/19 tests pass**
- **100% function coverage**, **97.56% line coverage** on `vnNumberParser.ts`
- Edge cases covered: empty string, em-dash, en-dash, single dash, N/A, alphabetic input, whitespace trimming, large numbers, zero, plain integers, percentage-like decimals

## Reviewer Checklist

| Criterion | Status |
|-----------|--------|
| Tests pass (`bun test`) | PASS |
| Type check (`bun tsc --noEmit`) | PASS (only pre-existing errors in `infrastructure/rag/vectorstore.ts`) |
| DDD compliance — domain has zero infra imports | PASS |
| Pure function, no side effects, no I/O | PASS |
| Barrel export in `domain/services/index.ts` | PASS |
| Acceptance criteria met (19 edge cases > required 15) | PASS |

## Blocking Issues

None.

## Notes

- The heuristic for disambiguating `1.000` (VN thousands vs English decimal) uses the "dot followed by exactly 3 digits" rule, which correctly treats it as 1000 in VN context. This is documented in both the source and tests.
- English comma-separated format (e.g., `1,234,567`) is also handled via a multi-comma or comma-followed-by-3-digits heuristic, making the parser robust for mixed-format inputs.
