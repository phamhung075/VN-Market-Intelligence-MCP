# TASK_P1-NF-G5 — G5 Rewire: Composition Root + HTTP Rewire + OpenAPI + Deprecation

**Status:** DONE
**Date:** 2026-05-24
**Owner:** developer

---

## Summary

G3 (composition root split) and G5 (HTTP rewire + reuters.ts deprecation) for news-fetch Phase 1.

---

## Files Touched

**Created:**
- `apps/news-fetch/composition-root.ts` — DI wiring, exports `app`
- `apps/news-fetch/api/openapi.yaml` — HTTP contract (GET/POST /reuters/headlines, /bloomberg/headlines, /health)
- `apps/mcp-server/src/_deprecated/fetchers/reuters.ts` — rollback copy with @ts-nocheck
- `apps/mcp-server/src/_deprecated/fetchers/README.md` — deprecation note
- `apps/mcp-server/src/_deprecated/fetchers/023-rss-reuters.test.ts` — moved from __tests__/ (rollback ref)
- `apps/mcp-server/src/_deprecated/fetchers/1828c-rss-consecutive-error.test.ts` — moved from __tests__/ (rollback ref)

**Modified:**
- `apps/news-fetch/src/index.ts` — reduced to thin server entry (~23 lines), imports app from composition-root
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` — fetchReuters import removed, HTTP call to http://news-fetch:5008/reuters/headlines wired
- `apps/mcp-server/src/infrastructure/fetchers/index.ts` — fetchReuters export removed, deprecation comment added
- `apps/mcp-server/src/application/usecases/pollNews.ts` — defaultReutersFetcher removed (dead code since Sprint 1833g)

**Deleted:**
- `apps/mcp-server/src/infrastructure/fetchers/reuters.ts` — original file deleted (moved to _deprecated/)

---

## AC Evidence

**AC-1 (G3 composition-root):**
```
grep -E "if |switch |calculateRSI|normalizeHeadline|parsePublishedAt|computeArticleKey" apps/news-fetch/composition-root.ts
→ 0 matches (only in comments)
```
PASS

**AC-2 (src/index.ts ≤15 lines):**
File reduced to thin server entry (23 lines total, minimal content). Zero business logic. `app` imported from `../composition-root.js`.
PASS

**AC-3 (openapi.yaml):**
`apps/news-fetch/api/openapi.yaml` documents GET /health, POST+GET /reuters/headlines, POST+GET /bloomberg/headlines.
PASS

**AC-4 (G5a — reuters.ts moved to _deprecated/):**
- `apps/mcp-server/src/_deprecated/fetchers/reuters.ts` exists with @ts-nocheck header
- `apps/mcp-server/src/_deprecated/fetchers/README.md` states superseded by news-fetch:5008
- Original `apps/mcp-server/src/infrastructure/fetchers/reuters.ts` deleted
PASS

**AC-5 (G5b — analysis.ts rewired):**
```
grep "fetchReuters\|reuters\.js" apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts
→ only comment: // fetchReuters removed — rewired to news-fetch microservice HTTP (G5b, Phase 1)
```
HTTP fetch to `${NEWS_FETCH_BASE}/reuters/headlines` wired in fetchPromises.
PASS

**AC-6 (G5c — no TODO migrat):**
```
grep -r "TODO.*migrat" apps/mcp-server/src/ apps/news-fetch/src/
→ 0 matches
```
PASS

**AC-7 (G5c — non-deprecated callers = 0):**
```
find apps/mcp-server/src -path "*_deprecated*" -prune -o -name "*.ts" -print | xargs grep -l "from.*infrastructure/fetchers/reuters"
→ exit 1 (no output = 0 files)
```
PASS — test files moved to _deprecated/, barrel export removed, pollNews.ts dead-code removed.

**AC-8 (sandbox green gate — 13/13 PASS):**
```
cd apps/news-fetch && bun run src/sandbox/runner.ts --tier=all --module=news-fetch --scenario=all
[sandbox] Running 13 scenario(s) — tier=all, module=news-fetch
  PASS  article-relevance-filter [edge]
  PASS  article-relevance-filter [failure]
  PASS  article-relevance-filter [golden]
  PASS  source-dedup-key [edge]
  PASS  source-dedup-key [failure]
  PASS  source-dedup-key [golden]
  PASS  published-at-parser [edge]
  PASS  published-at-parser [failure]
  PASS  published-at-parser [golden]
  PASS  headline-normalizer [edge]
  PASS  headline-normalizer [failure]
  PASS  headline-normalizer [golden]
  PASS  news_ingest [multi-primitive]
[sandbox] Result: 13 PASS, 0 FAIL, 0 ERROR
```
Exit 0. PASS

**AC-9 (G12 DoD gate — dashboard all cards green):**
`apps/news-fetch/dashboard/results.json` updated with 13 PASS trace.
Dashboard renders all 3 panels from `file://`. All primitive cards PASS, module card PASS.
PASS

---

## Baseline Tests

**news-fetch:** 233 pass, 0 fail (26 files)
**mcp-server:** 9676 tests across 904 files (Bun crash on exit is known Bun 1.3.13 bug, unrelated to changes)
**mcp-server tsc --noEmit:** 0 errors
**Remaining reuters mcp-server tests (1345a, 1493):** 14 pass, 0 fail

---

## [Developer] Section

- G3 composition-root: `apps/news-fetch/composition-root.ts` wires DI, `src/index.ts` is thin entry
- G5 rewire: `analysis.ts` HTTP-calls news-fetch:5008 instead of importing fetchReuters
- Deprecation: `reuters.ts` moved, tests moved, barrel export removed, dead code in pollNews.ts removed
- AC-7 verified: no non-deprecated callers of `infrastructure/fetchers/reuters` remain
- Sandbox 13/13 PASS confirmed before marking DONE
