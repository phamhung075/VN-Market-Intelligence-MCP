---
task_id: "P0-NF-1"
pilot: "news-fetch"
phase: "0"
title: "Brownfield inventory of apps/news-fetch — reconcile DDD-drift, identify primitive set + module + adapter boundary"
estimate: "2h"
owner: "architect"
status: "READY"
date: "2026-05-24"
---

# TASK P0-NF-1 — Brownfield Inventory + DDD-Drift Reconcile

## Summary

Architect performs a read-only brownfield scan of `apps/news-fetch/` and produces the inventory doc that anchors Phase 1. The CRITICAL output is reconciling the charter drift: the thin scale charter §Deltas says `src/` is "flat, not DDD-layered" — that is STALE. `apps/news-fetch/src/` ALREADY has `domain/ application/ infrastructure/ interface/` layers. This is **rewire + light extract**, not a greenfield layer-up.

Owner is the generic `developer` — there is no `dev-news-fetch` specialist embedding context. Therefore this brownfield doc must be MORE explicit than specialist-owned pilots (charter §Deltas point 3).

## Acceptance Criteria

### AC-1: DDD-drift reconciled (binding)
- [ ] Document the ACTUAL current layout of `apps/news-fetch/src/`: `domain/{models.ts,repositories.ts}`, `application/use-cases.ts`, `infrastructure/scrapers/*`, `interface/handlers.ts`, `index.ts`, `pkg.ts`
- [ ] State explicitly that charter §Deltas "flat src/" is stale; record the reconciled reality
- [ ] Classify which of the 4 existing layers are clean vs. need rewiring for the primitive/module/composition-root target

### AC-2: Primitive set identified (anti-over-extract)
- [ ] Identify pure-function primitive candidates ONLY (charter §Risk 1 — mostly-I/O service, small genuine surface)
- [ ] Candidate set to confirm/refine: `headline-normalizer`, `source-dedup-key`, `article-relevance-filter`, `ticker-tagger`, `published-at-parser`
- [ ] Expected count: 3–5 primitives. Each will need ≥3 scenario JSON files (golden + edge + failure) per G1
- [ ] Explicitly mark RSS/API fetch, flaresolverr/stealth calls, circuit-breakers, VPS push as ADAPTERS (out of primitives) — these stay in `infrastructure/`

### AC-3: Module + composition-root target
- [ ] Confirm single module: `news-ingest` (composes the primitives via ports/DI)
- [ ] Identify composition-root target (`apps/news-fetch/composition-root.ts` or equivalent) wiring module + adapters
- [ ] Note current `index.ts` / `interface/handlers.ts` role and how they map to the target composition root + HTTP interface (port 5008)

### AC-4: G5 deletion/rewire surface
- [ ] Grep mcp-server for any news-fetch TS callers that need HTTP-rewire to port 5008
- [ ] List MCP tool handlers affected; note `_deprecated/` target path if old code exists in mcp-server

### AC-5: Output doc
- [ ] Write `docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-brownfield.md`
- [ ] Update `docs/data/pilot-status-news-fetch.json` `phase0.deliverables.brownfield_inventory` → DONE with doc path + commit SHA

## Boundary
- Read-only scan. NO code changes in `apps/news-fetch/src/` this task (Phase 0 = `no_code_in_service_pkg_yet: true`).
- `apps/news-fetch/` ONLY. Do NOT touch cowork agents (news-scout/market-watcher) per charter §Risk 4.

## References
- Thin charter: `docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-charter.md`
- Canonical G1–G12: `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
- Phase plan template: `docs/architecture-briefs/2026-05-22-refactor/07-phases.md`

---

## [Architect] Brownfield Findings

- **Zone:** `apps/news-fetch/`
- **Status:** DONE 2026-05-24

**DDD-drift reconcile (CRITICAL):**
Charter §Deltas "flat src/" is STALE. All four DDD layers already exist:
- `domain/models.ts` + `domain/repositories.ts` — GREEN (zero infra imports, port interfaces clean)
- `application/use-cases.ts` — YELLOW (thin delegates, superseded by module in Phase 1)
- `infrastructure/scrapers/` (5 files) — GREEN (no violations; `normalizeRfcDate` duplicated across reuters-rss.ts + bloomberg-rss.ts — resolved by `published-at-parser` primitive)
- `interface/handlers.ts` — YELLOW (fallback-chain orchestration embedded in private functions — moves to `news_ingest` module)
- `index.ts` — YELLOW (serves as de-facto composition root; split into `composition-root.ts` + slim entry in G3/P1-G5 task)

**Work = rewire + light extract** (not greenfield layer-up).

**Verified paths:**
- `apps/news-fetch/src/domain/models.ts` — Article, FetchResult, NewsSource (pure types)
- `apps/news-fetch/src/domain/repositories.ts` — ReutersNewsPort, BloombergNewsPort (port interfaces)
- `apps/news-fetch/src/application/use-cases.ts` — thin wrappers, superseded by news_ingest module
- `apps/news-fetch/src/infrastructure/scrapers/reuters-rss.ts:218-226` — `normalizeRfcDate` duplication (extract to `published-at-parser` primitive)
- `apps/news-fetch/src/infrastructure/scrapers/bloomberg-rss.ts:218-226` — same duplication
- `apps/news-fetch/src/interface/handlers.ts:60-84,122-146` — fallback-chain logic (move to module)
- `apps/news-fetch/src/index.ts:22-33` — composition root section (extract to `composition-root.ts`)

**Primitive set (4 confirmed, 1 deferred):**
1. `published-at-parser` — extract + dedup `normalizeRfcDate`; function: `parsePublishedAt(rfcDate: string): string | null`
2. `headline-normalizer` — new pure function; strips Google News suffix, collapses whitespace
3. `source-dedup-key` — new pure function; stable article fingerprint for dedup
4. `article-relevance-filter` — new pure function; keyword-based relevance boolean
5. `published-at-guard` — DEFERRED to P1-F flex slot

**Adapters (confirmed NOT primitives):** RSS HTTP fetch, Playwright/stealth scrapers, DOMParser XML parsing, circuit-breaker, flaresolverr, VPS push

**Module:** `news_ingest` — single module at `src/module/news_ingest/`; composes 4 primitives via ports; owns fallback-chain orchestration (moved from handlers.ts)

**Composition root target:** `apps/news-fetch/composition-root.ts` (G3); `index.ts` reduced to ≤15-line server entry

**G5 rewire surface:**
- `apps/mcp-server/src/interface/mcp/tools/news-analysis/analysis.ts` — REWIRE: replace `import { fetchReuters }` with HTTP call to `http://news-fetch:5008/reuters/headlines`
- `apps/mcp-server/src/infrastructure/fetchers/reuters.ts` — DEPRECATE: move to `_deprecated/fetchers/reuters.ts`
- `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts` — NO ACTION (already HTTP-wired to port 5008)

**Risk flags:**
- R-1: Fallback-chain logic in handlers.ts private functions (orchestration in interface layer) — fixed by P1-C module extraction
- R-2: `normalizeRfcDate` duplicated in two scrapers — fixed by P1-B1 primitive extraction
- R-3: `analysis.ts` imports legacy `fetchReuters` directly — one G5b caller
- R-4: Generic developer — all Phase 1 tasks carry explicit file paths and scenario JSON bodies (no shorthand)

**Scan clean:** true (no DDD golden rule violations — domain/ imports inward only in all files)

**Output doc:** `docs/architecture-briefs/2026-05-22-refactor/scale/news-fetch-brownfield.md`
