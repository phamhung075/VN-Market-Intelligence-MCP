---
title: "Brownfield Inventory — news-fetch Microservice"
date: "2026-05-24"
author: "architect (P0-NF-1)"
pilot: "news-fetch"
phase: "0"
status: "DONE"
task: "P0-NF-1"
zone: "apps/news-fetch/"
---

# Brownfield Inventory — `news-fetch` Microservice

**Generated:** 2026-05-24 by architect (Phase 0, task P0-NF-1)
**Zone:** `apps/news-fetch/`
**Language:** TypeScript / Bun
**Service port:** 5008

---

## 1. CRITICAL — Charter DDD-Drift Reconcile

**Charter §Deltas states:** "src/ — flat src, not DDD-layered"
**Actual state:** STALE. `apps/news-fetch/src/` ALREADY has all four DDD layers:

```
apps/news-fetch/src/
  domain/
    models.ts          — Article, FetchResult, NewsSource (pure types, zero infra imports)
    repositories.ts    — ReutersNewsPort, BloombergNewsPort (port interfaces, domain-only imports)
  application/
    use-cases.ts       — FetchReutersHeadlinesUseCase, FetchBloombergHeadlinesUseCase (thin wrappers, inject port)
  infrastructure/
    scrapers/
      reuters-rss.ts          — ReutersRssScraper (HTTP+XML, implements ReutersNewsPort)
      reuters-stealth.ts      — ReutersStealthFallback (Playwright, implements ReutersNewsPort)
      bloomberg-rss.ts        — BloombergRssScraper (HTTP+XML, implements BloombergNewsPort)
      bloomberg-stealth.ts    — BloombergStealth (Playwright, implements BloombergNewsPort)
      playwright-browser-factory.ts — shared Playwright setup utility
  interface/
    handlers.ts        — Hono router factory createRouter() (5 routes, injects ports)
  index.ts             — composition root: wires all scrapers into createRouter(), binds port 5008
  pkg.ts               — package metadata constant (name/version)
  types/
    playwright-stealth.d.ts  — ambient type declaration for playwright-extra-plugin-stealth
```

**Implication for Phase 1:** This is **rewire + light extract**, not a greenfield layer-up. All four DDD layers structurally exist. Work = extract pure primitives from within existing layer bodies + add `src/sandbox/` + add `src/primitive/` + add `src/module/` + split composition root out of `index.ts`.

---

## 2. Layer-by-Layer Assessment

### 2a. domain/ — GREEN (structurally clean)

`domain/models.ts` and `domain/repositories.ts` contain zero infrastructure imports. Models are pure TypeScript interfaces/enums. Port interfaces (repositories.ts) import only from `./models`. The DDD golden rule (domain/ has ZERO imports from infrastructure/) is satisfied.

**No rewiring needed.** Phase 1 adds new scenario-driven pure-function layer on top.

### 2b. application/ — YELLOW (thin; redundant structure)

`use-cases.ts` has two use-case classes that are purely one-line delegates to the injected port. They carry no business logic. They are correct DDD (they inject via port, no domain reasoning), but they add zero value over calling the port directly. The module composition pattern will supersede them.

**Risk:** If these classes are replaced by the module in Phase 1, the handlers.ts must be updated. Low risk — one file, isolated.

### 2c. infrastructure/ — GREEN (clean adapters, correctly scoped)

All five scraper files import ONLY from `domain/` (models + repositories). No cross-layer violations. Each scraper correctly implements the corresponding port interface from `domain/repositories.ts`. The circuit-breaker, RSS HTTP fetch, Playwright stealth, and browser factory are all correctly contained here.

`normalizeRfcDate()` is a pure date-parsing function that appears **duplicated** in both `reuters-rss.ts` and `bloomberg-rss.ts` (lines 218–226 and 218–226 respectively — identical bodies). This is the primary extraction candidate for `published-at-parser` primitive.

**No layer violations. One duplication detected (normalizeRfcDate).**

### 2d. interface/ — YELLOW (composition logic embedded in handlers.ts)

`handlers.ts` contains `createRouter()` factory that accepts 4 injected ports. This is clean for DI. However, the fallback orchestration logic (RSS primary → Playwright fallback if error or empty) is embedded in two private async functions (`fetchReuters()`, `fetchBloomberg()`) inside the router factory at lines 60-84 and 122-146.

**This fallback-chain logic is pure orchestration logic** — it has no HTTP, no DOM, no Playwright calls. It belongs in the application layer or a `news-ingest` module (source-routing / fallback-selection logic). Extracting it creates a testable, sandboxable surface.

### 2e. index.ts — YELLOW (serves as composition root; not yet named)

`index.ts` is the de-facto composition root. It imports all four scrapers, wires them into `createRouter()`, binds port 5008, and exports the Bun server config. It is 57 lines. The comment "Composition root — wire scrapers into router" is present but it is just the top section of the file.

**Target state:** `index.ts` becomes a thin server entry that imports from `composition-root.ts`. The composition root is extracted to `apps/news-fetch/composition-root.ts` following the pattern used by Go services. This is the G3 task.

---

## 3. Pure-Function Primitive Candidates

**Charter instruction:** "Do not over-extract. The genuine pure-function surface is small."

Scanning all five source files for pure functions (no I/O, no Playwright, no HTTP, no DOM, deterministic):

| # | Primitive name | Source location | Description | Extractable? |
|---|---|---|---|---|
| 1 | `published-at-parser` | `reuters-rss.ts:218-226` + `bloomberg-rss.ts:218-226` | `normalizeRfcDate(rfcDate: string): string \| null` — converts RFC 2822 to ISO 8601, returns null on parse failure. Pure, deterministic, no I/O. Currently duplicated. | YES — HIGH priority (dedup as extract) |
| 2 | `source-dedup-key` | to be extracted from use-case or new | `computeArticleKey(article: {url, headline, publishedAt}): string` — stable dedup key for an article (URL if present, else headline-hash). Currently implicit (no dedup logic exists — this is a NEW primitive needed for the news-ingest module's dedup responsibility). | YES — NEW primitive |
| 3 | `headline-normalizer` | implicit in scraper output | `normalizeHeadline(raw: string): string` — trim, collapse whitespace, strip trailing source attribution (e.g. "- Bloomberg" suffix from Google News RSS titles). Currently not implemented; headline is emitted as-scraped (`headline: item.querySelector('title')?.textContent?.trim() ?? ''`). | YES — NEW primitive |
| 4 | `article-relevance-filter` | not implemented | `isRelevantArticle(article: Article, keywords: string[]): boolean` — pure boolean filter for VN-market relevance keywords. Zero I/O. | YES — NEW primitive |
| 5 | `published-at-guard` | implicit | `isArticleRecent(publishedAt: string \| null, windowHours: number): boolean` — pure time-window guard using ISO 8601 input. No Date.now() direct call — inject `now` for determinism. | DEFER — only add if Phase 1 time allows |

**Confirmed primitive set (3 core + 1 new + 1 defer):**

1. `published-at-parser` — extracts + dedups the duplicated `normalizeRfcDate` function
2. `headline-normalizer` — new pure function (normalize/strip Google News attribution suffix)
3. `source-dedup-key` — new pure function (stable article fingerprint for dedup)
4. `article-relevance-filter` — new pure function (keyword-based relevance boolean)
5. `published-at-guard` — DEFER to Phase 1 flex slot (P1-F)

**Why not 5 core primitives:** The charter warns "do not over-extract" for a mostly-I/O service. The fallback-chain orchestration in handlers.ts is NOT a primitive (it is module/use-case logic). RSS parsing (parseRssXml, parseDom, buildArticle) is NOT a primitive — it is an adapter function within the infrastructure scraper. `NewsSource` enum is a domain model, not a primitive.

**ADAPTER boundary (keep in infrastructure/, NOT primitives):**
- RSS HTTP fetch (fetch() calls)
- Playwright / playwright-extra-plugin-stealth / browser-factory
- XML parsing via DOMParser / parseRssXml / parseRegex
- Circuit-breaker / fallback-routing logic (moves to module, not primitive)
- flaresolverr calls (VPS adapter)

---

## 4. Module Candidate: `news-ingest`

**Single module confirmed.** `news-ingest` composes the 4 primitives via port interfaces (DI). It owns:

- Source routing: select primary vs fallback by source enum
- Fallback-chain: RSS primary → Playwright fallback (logic currently embedded in `handlers.ts` private functions `fetchReuters()` + `fetchBloomberg()` — must move here)
- Article dedup: call `source-dedup-key` primitive to filter duplicates within a batch
- Relevance filtering: call `article-relevance-filter` primitive (optional pass)
- Headline normalization: call `headline-normalizer` on each article before emit

**Module location:** `apps/news-fetch/src/module/news_ingest/` (TypeScript pattern, mirrors kinh-dich `src/module/reading_composer/`)

**Module port interface:** `NewsIngestPort` — single method `ingestHeadlines(source: NewsSource, maxItems?: number): Promise<Article[]>` (pure return, no FetchResult envelope; envelope stays in adapter layer)

---

## 5. Composition Root Target

**Current state:** `apps/news-fetch/src/index.ts` contains composition root at lines 22-33 plus server binding at lines 36-57.

**Target state (G3):**
- `apps/news-fetch/composition-root.ts` — wires scrapers + module + router. No business logic. No `if` on data values. No domain operations. Contains only: imports, DI bindings, router export.
- `apps/news-fetch/src/index.ts` — imports `app` from `composition-root.ts`, binds port. ~10 lines.
- `apps/news-fetch/src/interface/handlers.ts` — MODIFY: `createRouter()` signature changes from 4 raw port params to injecting a `NewsIngestPort` (the module). HTTP contract (OpenAPI YAML) added at `apps/news-fetch/api/openapi.yaml`.

---

## 6. G5 Deletion / Rewire Surface (MCP-Server Callers)

### 6a. Caller inventory

| File | Type | Current behavior | G5 action |
|---|---|---|---|
| `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` | MCP tool handler | Imports `fetchReuters` from `infrastructure/fetchers/reuters.ts` (legacy fetcher, NOT the microservice) | REWIRE: replace direct import with HTTP call to `http://news-fetch:5008/reuters/headlines` |
| `apps/mcp-server/src/infrastructure/fetchers/reuters.ts` | Legacy infrastructure fetcher | Standalone RSS fetcher with rate-limiting, consecutive-error counter, VN-market focus. Not the same as news-fetch microservice's reuters-rss.ts | DEPRECATE: move to `apps/mcp-server/src/_deprecated/fetchers/reuters.ts` after HTTP rewire |
| `apps/mcp-server/src/infrastructure/fetchers/newsSourceRouter.ts` | Legacy router | Routes news source selection | ASSESS at G5 task — may be superseded by microservice routing |
| `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts` | Cron scheduler | Already calls `http://news-fetch:5008` via HTTP. No legacy import. | NO ACTION — already correctly HTTP-wired |
| `apps/mcp-server/src/interface/mcp/newsDebugTriggerHandler.ts` | Debug trigger | References `vn-news-fetch` VPS service name (string literals only, no import) | NO ACTION — string config, not a code dependency |
| `apps/mcp-server/src/interface/mcp/tools/system/newsDebugTriggerTool.ts` | MCP tool | VPS service name in string literal only | NO ACTION |
| `apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts` | Watchdog | VPS `vn-news-fetch` service name in strings | NO ACTION |

### 6b. Deprecated target path

`apps/mcp-server/src/_deprecated/fetchers/reuters.ts` (consistent with project `_deprecated/` pattern used across other pilots)

### 6c. Zero-TODO-migrat verification

After G5: `grep -r "TODO.*migrat" apps/mcp-server/src/ apps/news-fetch/src/` must return 0.

---

## 7. Scan Summary

| Layer | State | Action required |
|---|---|---|
| `domain/` | GREEN | None — clean port interfaces, zero infra imports |
| `application/` | YELLOW | Use-cases superseded by module; update handlers.ts wiring in module task |
| `infrastructure/` | GREEN | No violations; `normalizeRfcDate` duplication resolved by extracting `published-at-parser` primitive |
| `interface/` | YELLOW | Fallback-chain logic in handlers.ts must move to `news-ingest` module |
| `index.ts` (composition root) | YELLOW | Extract `composition-root.ts`; reduce index.ts to ~10-line server entry |

**Scan clean:** true (no DDD golden rule violations — domain/ imports are all inward-only)

**Key risk flags:**
- R-1: Fallback-chain logic in `handlers.ts` private functions — architectural boundary leak (orchestration in interface layer). Fixed by module extraction.
- R-2: `normalizeRfcDate` duplicated in two scrapers — technical debt resolved by `published-at-parser` primitive.
- R-3: `analysis.ts` in mcp-server imports legacy `fetchReuters` directly — G5b rewire needed. One caller.
- R-4: Generic developer ownership — all tasks must carry explicit file paths, exact scenario JSON structures, and sandbox command. No embedded context shorthand.

---

## 8. Primitive Scenario Structure (for Phase 1 task plan)

Each primitive ships with exactly 3 scenario JSON files (charter G1 minimum):

```json
{
  "primitive": "<primitive-name>",
  "function": "<exact function name>",
  "input": { ... },
  "expectedOutput": { ... },
  "scenarioType": "golden | edge | failure"
}
```

`published-at-parser` scenarios:
- golden: valid RFC 2822 "Mon, 13 May 2026 14:30:00 GMT" → "2026-05-13T14:30:00.000Z"
- edge: valid RFC 2822 with timezone offset "Thu, 22 May 2026 07:00:00 +0700" → ISO 8601
- failure: malformed string "not-a-date" → null

`headline-normalizer` scenarios:
- golden: "Fed raises rates - Bloomberg" → "Fed raises rates"
- edge: "  Multiple   spaces   in   headline  " → "Multiple spaces in headline"
- failure: "" (empty string) → "" (no-op, not an error)

`source-dedup-key` scenarios:
- golden: article with url → deterministic key containing URL hash
- edge: article without url (url=null) → deterministic key derived from headline
- failure: article with empty headline AND null url → well-defined fallback key (not crash)

`article-relevance-filter` scenarios:
- golden: headline containing "Vietnam" with keywords=["Vietnam","VN"] → true
- edge: headline in mixed-case "VIETNAM GDP" with keywords=["vietnam"] → true (case-insensitive)
- failure: headline with zero keyword matches → false (not an error; false is the correct result)
