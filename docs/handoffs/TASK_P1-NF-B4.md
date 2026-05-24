# TASK P1-NF-B4 — Primitive: article-relevance-filter

**Pilot:** news-fetch
**Phase:** 1
**Task:** P1-B4
**Status:** DONE

---

## Summary

Created `article-relevance-filter` primitive. Pure boolean keyword-match (case-insensitive). Empty keywords array = false (no filter = not relevant).

---

## Files Created

- `apps/news-fetch/src/primitive/article-relevance-filter/index.ts`
- `apps/news-fetch/src/primitive/article-relevance-filter/index.test.ts`
- `docs/scenarios/news-fetch/primitives/article-relevance-filter/golden.json`
- `docs/scenarios/news-fetch/primitives/article-relevance-filter/edge.json`
- `docs/scenarios/news-fetch/primitives/article-relevance-filter/failure.json`

---

## AC Verification

**AC-1:** `isRelevantArticle` exported. Zero infra imports. PASS.

**AC-2:** Unit test with 5 `it()` blocks: match present, case-insensitive match, no match, empty keywords, partial substring match. PASS.

**AC-3:** All 3 scenario JSONs present. PASS.

**AC-4 (sandbox green gate):**
```
[sandbox] Running 12 scenario(s) — tier=primitive, module=news-fetch

  PASS  article-relevance-filter [edge]
  PASS  article-relevance-filter [failure]
  PASS  article-relevance-filter [golden]
  PASS  source-dedup-key [edge/failure/golden]
  PASS  published-at-parser [edge/failure/golden]
  PASS  headline-normalizer [edge/failure/golden]

[sandbox] Result: 12 PASS, 0 FAIL, 0 ERROR
EXIT: 0
```
ALL 4 PRIMITIVES × 3 SCENARIOS = 12/12 PASS.

**AC-5:** `grep -r "from.*infrastructure" apps/news-fetch/src/primitive/article-relevance-filter/` returns 0. PASS.

**AC-6:** Dashboard not yet created — NOT-RUN per spec. PASS.

---

## Baseline Tests

```
227 pass, 6 skip, 0 fail — Ran 233 tests across 25 files.
```
