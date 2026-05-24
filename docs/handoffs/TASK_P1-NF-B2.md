# TASK P1-NF-B2 — Primitive: headline-normalizer

**Pilot:** news-fetch
**Phase:** 1
**Task:** P1-B2
**Status:** DONE

---

## Summary

Created `headline-normalizer` primitive. Strips trailing source attribution suffixes (e.g. "- Bloomberg", "- Reuters"), collapses multiple whitespace, trims. 3 scenario JSONs.

---

## Files Created

- `apps/news-fetch/src/primitive/headline-normalizer/index.ts` (CREATE)
- `apps/news-fetch/src/primitive/headline-normalizer/index.test.ts` (CREATE)
- `docs/scenarios/news-fetch/primitives/headline-normalizer/golden.json` (CREATE)
- `docs/scenarios/news-fetch/primitives/headline-normalizer/edge.json` (CREATE)
- `docs/scenarios/news-fetch/primitives/headline-normalizer/failure.json` (CREATE)

---

## AC Verification

**AC-1:** `normalizeHeadline` exported. Zero infra imports. PASS.

**AC-2:** Unit test with 5 `it()` blocks (≥3 required): suffix strip Bloomberg, suffix strip Reuters, whitespace collapse, empty no-op, trim. PASS.

**AC-3:** All 3 scenario JSONs present at `docs/scenarios/news-fetch/primitives/headline-normalizer/`. PASS.

**AC-4 (sandbox green gate):**
```
bun run src/sandbox/runner.ts --tier=primitive --module=news-fetch --scenario=all

[sandbox] Running 6 scenario(s) — tier=primitive, module=news-fetch

  PASS  published-at-parser [edge]
  PASS  published-at-parser [failure]
  PASS  published-at-parser [golden]
  PASS  headline-normalizer [edge]
  PASS  headline-normalizer [failure]
  PASS  headline-normalizer [golden]

[sandbox] Result: 6 PASS, 0 FAIL, 0 ERROR
EXIT: 0
```
PASS.

**AC-5:** `grep -r "from.*infrastructure" apps/news-fetch/src/primitive/headline-normalizer/` returns 0. PASS.

**AC-6 (G12 DoD gate):** Dashboard not yet created — NOT-RUN state correct per spec. PASS.

---

## Baseline Tests

```
218 pass, 6 skip, 0 fail — Ran 224 tests across 23 files.
```
