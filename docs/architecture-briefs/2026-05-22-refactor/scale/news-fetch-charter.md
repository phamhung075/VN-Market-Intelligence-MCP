---
title: "Scale Charter — news-fetch"
date: "2026-05-24"
author: "po"
status: "READY"
service: "news-fetch"
owner: "developer"
language: "TypeScript"
scale_order: "parallel-eligible (after macro-indicators)"
canonical_goals: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md (G1–G12)"
---

# Scale Charter — `news-fetch`

**Thin charter. G1–G12, Decision Matrix, Security Clause, Baseline Metric Capture are CANONICAL in the pilot charter and are NOT restated here.**

→ **Canonical G1–G12 source:** `docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md`
Apply verbatim, substituting `news-fetch` for `technical-analysis`. Owner is the generic `developer` (no `dev-news-fetch` specialist exists).

→ **Phase plan:** `docs/architecture-briefs/2026-05-22-refactor/07-phases.md` · **QA gates:** `qa-gates/`
→ **Status tracking (canonical SSOT, schema = docs/data/pilot-status-schema.json):** `docs/data/pilot-status-news-fetch.json`

---

## Service-Specific Deltas

| Field | Value |
|---|---|
| **Owner specialist** | `developer` (generic — there is no dedicated `dev-news-fetch` agent in the roster) |
| **Language** | **TypeScript** (Bun). Small fetch/normalize service; no pivot proposed — low domain logic, low payoff for a Go rewrite. |
| **Anti-scope-creep boundary** | `apps/news-fetch/` ONLY. |

### Current state — SMALL TS/BUN SERVICE (src-flat, not DDD-layered)

`apps/news-fetch/` is a compact Bun/TS service (`src/`, `__tests__/`, `package.json`, `bun.lock`, `bunfig.toml`). Flat `src/` — not yet split into DDD layers. Smallest service in the rollout.

This is **rewire + light extract**. Given the small surface, expect a thin primitive set and a single module.

### Candidate primitives (target-state §News / NLP primitives)
Pure-function units in the fetch→dedup→classify pipeline: e.g. `headline-normalizer`, `source-dedup-key`, `article-relevance-filter`, `ticker-tagger`, `published-at-parser`. Module candidate: a `news-ingest` module. (RSS/API fetch + flaresolverr calls are adapters, not primitives.)

### Key risks
1. **Mostly I/O.** News-fetch is dominated by RSS/API fetching, circuit-breakers, and VPS push — all adapter concerns. The genuine pure-function surface is small (normalize, dedup-key, relevance filter, parse). Do not over-extract.
2. **Source policy.** Reuters/TE via VPS push; newsapi fallback. Circuit-breaker counters can be stale-historical (false-positive class). Keep fetch/circuit logic in adapters, out of primitives.
3. **Generic developer ownership.** No specialist means less embedded context — the charter + canonical goals + phase plan must carry more of the load. Architect should write a slightly more explicit phase expansion for this service than for specialist-owned ones.
4. **Coverage-sweep coupling.** An open design item (cowork coverage sweep — per-ticker rotation) touches news-scout/market-watcher cowork agents, NOT this service's code. Keep the refactor scoped to `apps/news-fetch/`; do not absorb cowork-agent work.
