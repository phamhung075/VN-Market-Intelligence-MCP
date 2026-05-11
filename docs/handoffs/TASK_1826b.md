# TASK_1826b — FIX: GSO HTML parser observability + regex variants 1 & 2

| Field | Value |
|-------|-------|
| Task ID | 1826b |
| Type | FIX |
| Priority | High |
| Owner | developer |
| Handoff to | qa |
| Branch | task/1826b-gso-parser-observability |
| Started | 2026-05-02 |

---

## Context

Sprint 1825b introduced `parseGsoHtml` in `macroIndicatorFetcher.ts` as a regex-based HTML parser replacing a broken `JSON.parse(HTML)` call. The parser covers one HTML layout. GSO has been observed serving at least two additional layouts:

- Variant 1: number appears before the label in the same cell (number-before-label layout)
- Variant 2: value stored in a `data-value` attribute near a GDP label

When neither variant is matched the caller receives 0 indicators with no diagnostic signal, making silent failures indistinguishable from empty responses.

---

## Files to Change

1. `apps/mcp-server/src/domain/services/macro/macroIndicatorFetcher.ts`
   - Replace `parseGsoHtml` function (approximately lines 199-226) with updated version
   - Add Variant 1 CPI regex: number-before-label layout
   - Add Variant 2 GDP regex: data-value attribute layout
   - Add `console.error` log when 0 indicators matched (observability)
   - Net: +16 lines

2. `apps/mcp-server/src/__tests__/239-macro-indicator-refresh.test.ts`
   - Append AC-12a, AC-12b, AC-12c after the existing 12 tests (no replacements)
   - Net: +65 lines (additions only)

---

## Acceptance Criteria

| ID | Criterion |
|----|-----------|
| AC-12a | Opaque HTML (no recognisable pattern) → `console.error` fires containing the string `"no CPI/GDP patterns matched"` |
| AC-12b | Variant 1 HTML (number before label) → result `success=true`, `sourceUsed="gso"` |
| AC-12c | Variant 2 HTML (`data-value` attribute near GDP) → `indicatorCount >= 1` |

---

## Test Run Target

```
bun test 239-macro-indicator-refresh.test.ts
→ 15 pass / 0 fail  (12 existing + 3 new AC-12a/b/c)
```

---

## Full Acceptance Gate

- [ ] `bun test 239-macro-indicator-refresh.test.ts` → 15 pass / 0 fail
- [ ] AC-12a: opaque HTML → `console.error` with `"no CPI/GDP patterns matched"`
- [ ] AC-12b: Variant 1 HTML → `success=true`, `sourceUsed="gso"`
- [ ] AC-12c: Variant 2 HTML (data-value) → `indicatorCount >= 1`
- [ ] `tsc --noEmit` → 0 errors
- [ ] No new npm dependencies added

---

## Baseline

- Passing tests at task start: **8582**
- Failing tests at task start: **0** (pre-existing failures excluded)

---

## Constraints

- Domain layer only — `macroIndicatorFetcher.ts` is in `domain/services/macro/`. Zero imports from `infrastructure/`.
- No new npm dependencies.
- All financial numbers in million VND per dev-standards.
- Branch: `task/1826b-gso-parser-observability`

---

## Definition of Done

Developer commits on branch `task/1826b-gso-parser-observability`, all acceptance criteria green, then hands off to qa for final sweep and merge.
