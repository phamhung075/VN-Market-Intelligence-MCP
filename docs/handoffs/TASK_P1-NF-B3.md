# TASK P1-NF-B3 — Primitive: source-dedup-key

**Pilot:** news-fetch
**Phase:** 1
**Task:** P1-B3
**Status:** DONE

---

## Summary

Created `source-dedup-key` primitive. Computes deterministic dedup key: URL-based when URL present, headline-based fallback, empty-headline sentinel.

---

## Files Created

- `apps/news-fetch/src/primitive/source-dedup-key/index.ts`
- `apps/news-fetch/src/primitive/source-dedup-key/index.test.ts`
- `docs/scenarios/news-fetch/primitives/source-dedup-key/golden.json`
- `docs/scenarios/news-fetch/primitives/source-dedup-key/edge.json`
- `docs/scenarios/news-fetch/primitives/source-dedup-key/failure.json`

---

## AC Verification

**AC-1:** `computeArticleKey` + `ArticleKeyInput` exported. Zero infra imports. PASS.

**AC-2:** Unit test with 4 `it()` blocks: url-based key, headline-based (null url), fallback (empty headline), empty string url treated as null. PASS.

**AC-3:** All 3 scenario JSONs present. PASS.

**AC-4 (sandbox green gate):**
```
[sandbox] Running 9 scenario(s) — tier=primitive, module=news-fetch

  PASS  source-dedup-key [edge]
  PASS  source-dedup-key [failure]
  PASS  source-dedup-key [golden]
  PASS  published-at-parser [edge]
  PASS  published-at-parser [failure]
  PASS  published-at-parser [golden]
  PASS  headline-normalizer [edge]
  PASS  headline-normalizer [failure]
  PASS  headline-normalizer [golden]

[sandbox] Result: 9 PASS, 0 FAIL, 0 ERROR
EXIT: 0
```
PASS.

**AC-5:** `grep -r "from.*infrastructure" apps/news-fetch/src/primitive/source-dedup-key/` returns 0. PASS.

**AC-6:** Dashboard not yet created — NOT-RUN per spec. PASS.
