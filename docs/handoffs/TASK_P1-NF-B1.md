# TASK P1-NF-B1 — Primitive: published-at-parser (G12 streak #1)

**Pilot:** news-fetch
**Phase:** 1
**Task:** P1-B1
**Status:** DONE

---

## Summary

Created `published-at-parser` primitive (extracted from duplicate `normalizeRfcDate` in reuters-rss.ts and bloomberg-rss.ts). 3 scenario JSONs created. Scrapers updated to import from primitive. Backward-compat re-export added to both scrapers.

---

## Files Created/Modified

- `apps/news-fetch/src/primitive/published-at-parser/index.ts` (CREATE)
- `apps/news-fetch/src/primitive/published-at-parser/index.test.ts` (CREATE)
- `docs/scenarios/news-fetch/primitives/published-at-parser/golden.json` (CREATE)
- `docs/scenarios/news-fetch/primitives/published-at-parser/edge.json` (CREATE)
- `docs/scenarios/news-fetch/primitives/published-at-parser/failure.json` (CREATE)
- `apps/news-fetch/src/infrastructure/scrapers/reuters-rss.ts` (MODIFY — removed local `normalizeRfcDate`, import from primitive, re-export alias)
- `apps/news-fetch/src/infrastructure/scrapers/bloomberg-rss.ts` (MODIFY — same)
- `apps/news-fetch/src/sandbox/runner.ts` (MODIFY — corrected PROJECT_ROOT path)

---

## AC Verification

**AC-1:** `parsePublishedAt` exported from `apps/news-fetch/src/primitive/published-at-parser/index.ts`. Zero imports from infrastructure/application/interface. PASS.

**AC-2:** Both `reuters-rss.ts` and `bloomberg-rss.ts` import `parsePublishedAt` from `../../primitive/published-at-parser/index.js`. Local `normalizeRfcDate` removed. Backward-compat re-export added. PASS.

**AC-3:** Unit test with 4 `it()` blocks (≥3 required): valid RFC 2822 → ISO, RFC +0700 → UTC, malformed → null, empty → null. PASS.

**AC-4 (sandbox green gate):**
```
bun run src/sandbox/runner.ts --tier=primitive --module=news-fetch --scenario=all

[sandbox] Running 3 scenario(s) — tier=primitive, module=news-fetch

  PASS  published-at-parser [edge]    — primitives/published-at-parser/edge.json
  PASS  published-at-parser [failure] — primitives/published-at-parser/failure.json
  PASS  published-at-parser [golden]  — primitives/published-at-parser/golden.json

[sandbox] Result: 3 PASS, 0 FAIL, 0 ERROR
EXIT: 0
```
**G12 STREAK #1 EARNED.**

**AC-5 (R-FENCE discovery):** Import path style used: `../../primitive/published-at-parser/index.js` (with `.js` ESM extension). This is the canonical import style for Phase 2's `eslint.config.mjs` fence.

**AC-6:** `grep -r "^import.*from.*infrastructure" apps/news-fetch/src/primitive/` returns 0. PASS.

**AC-7:** Dashboard not yet created — sub-check skipped per spec. PASS.

**AC-8 (G12 DoD gate):** Sandbox shows 3/3 green. Evidence above. DONE.

---

## Baseline Tests

```
213 pass, 6 skip, 0 fail
Ran 219 tests across 22 files.
```

---

## [Developer] G12 Streak Evidence

**G12 Streak #1 — P1-B1:** Sandbox 3/3 PASS, exit 0. Evidence pasted above.
