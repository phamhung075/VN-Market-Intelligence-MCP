# TASK P1-NF-C — Module Stub: news_ingest (G12 streak #2)

**Pilot:** news-fetch
**Phase:** 1
**Task:** P1-C
**Status:** DONE

---

## Summary

Created `src/module/news_ingest/` module stub with `ports.ts`, `index.ts`, and `index.test.ts`. Module composes `headline-normalizer` + `source-dedup-key` primitives. Fallback-chain logic moved from `handlers.ts` private functions to module. `handlers.ts` updated to inject `NewsIngestPort`.

---

## Files Created/Modified

- `apps/news-fetch/src/module/news_ingest/ports.ts` (CREATE — NewsIngestPort + NewsFetcherPort)
- `apps/news-fetch/src/module/news_ingest/index.ts` (CREATE — processArticleBatch + composeNewsIngest)
- `apps/news-fetch/src/module/news_ingest/index.test.ts` (CREATE — 6 it() blocks, mock ports)
- `docs/scenarios/news-fetch/module/multi-source-ingest.json` (CREATE)
- `apps/news-fetch/src/interface/handlers.ts` (MODIFY — inject NewsIngestPort, 4-param compat overload)
- `apps/news-fetch/__tests__/1899a-routes-health-reuters.test.ts` (MODIFY — update method expectations)
- `apps/news-fetch/__tests__/1899a-routes-bloomberg.test.ts` (MODIFY — update method/error expectations)
- `apps/news-fetch/__tests__/fix-reuters-url-bloomberg-timeout.test.ts` (MODIFY — check module file for log strings)

---

## AC Verification

**AC-1:** `apps/news-fetch/src/module/news_ingest/index.ts` imports ONLY from `../../primitive/*` and `../../domain/*`. Zero `../../infrastructure/*` imports. PASS.

**AC-2:** `apps/news-fetch/src/module/news_ingest/ports.ts` declares `NewsIngestPort` and `NewsFetcherPort` (domain-only imports). PASS.

**AC-3:** `handlers.ts` updated: `createRouter()` accepts `NewsIngestPort` + backward-compat 4-param overload. Private `fetchReuters()` and `fetchBloomberg()` fallback-chain functions REMOVED from handlers.ts (moved to module). PASS.

**AC-4:** Unit test with 6 mock-port `it()` blocks: normal ingest, primary fallback on error, primary fallback on empty, dedup removes duplicates, empty array, returns all when no dups. PASS.

**AC-5:** `grep -r "^import.*from.*infrastructure" apps/news-fetch/src/module/` returns 0. PASS.

**AC-6 (sandbox green gate for module scenario):**
```
bun run src/sandbox/runner.ts --tier=all --module=news-fetch --scenario=all

[sandbox] Running 13 scenario(s) — tier=all, module=news-fetch

  PASS  article-relevance-filter [edge/failure/golden]
  PASS  source-dedup-key [edge/failure/golden]
  PASS  published-at-parser [edge/failure/golden]
  PASS  headline-normalizer [edge/failure/golden]
  PASS  news_ingest [multi-primitive] — multi-source-ingest.json

[sandbox] Result: 13 PASS, 0 FAIL, 0 ERROR
EXIT: 0
```
**G12 STREAK #2 EARNED.**

**AC-7 (all 12 primitive scenarios):** 12/12 primitive scenarios still PASS. Evidence above.

**AC-8 (G12 DoD gate):** 13/13 sandbox green. DONE.

---

## Baseline Tests

```
233 pass, 6 skip, 0 fail — Ran 239 tests across 26 files.
```
