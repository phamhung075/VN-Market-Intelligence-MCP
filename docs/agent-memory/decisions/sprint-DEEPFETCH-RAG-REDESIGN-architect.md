# Decision Journal — ARCH-DEEPFETCH-RAG-REDESIGN

**Agent:** architect
**Sprint:** DEEPFETCH-RAG-REDESIGN
**Date:** 2026-06-08

---

## STEP architect-S1 — Pillar A: Deep-Fetch Gate Placement

**task_id:** ARCH-DEEPFETCH-RAG-REDESIGN
**what-considered:**
- Gate on VPS (pre-push filtering) vs gate on mcp-server (post-push, application layer)
- VPS gate would require deploying domain watchlist data to VPS (coupling); mcp-server already has `detectStocksInText`, `cascadeEngine`, and watchlist DB — all gate logic is already present there.

**decision:** Gate runs in mcp-server `pollNews.ts` post-dedup. VPS remains a dumb forwarder.

**why-change:** VPS intelligence creates a second code path to maintain; domain data would need to be replicated to VPS; mcp-server's `detectStocksInText` + `normalizeNews().impactScore` already provide the three gate signals needed.

---

## STEP architect-S2 — Pillar A: Deep-Fetch Executor Architecture

**task_id:** ARCH-DEEPFETCH-RAG-REDESIGN
**what-considered:**
- Option A: VPS eagerly fetches body for all 226 items/cycle regardless of domain relevance.
- Option B: Main-server headless (Playwright) for all deep-fetch.
- Option R: VPS-first (plain HTTP, article-body-fetcher.py extended) + main-server fallback for JS-rendered sources.

**decision:** Option R.

**why-change:** Option A doubles VPS request volume with no filtering — wastes bandwidth, hits rate-limits, fetches bodies for sports/US-politics noise. Option B routes all body-fetching through 350MB Playwright when ~80% of VN sources are plain HTML; over-engineered. Option R uses the lightest technique that works per source, matching the existing dev-vps-crawls constraint model.

---

## STEP architect-S3 — Pillar B: Schema Migration Strategy

**task_id:** ARCH-DEEPFETCH-RAG-REDESIGN
**what-considered:**
- Re-embed entire corpus with new model (larger model + richer metadata fields in embedding text).
- Additive column migration (add_columns()) — existing vectors unchanged, new metadata fields as pre-filters.
- Backfill with derived values by re-processing existing SQLite rag_analyses rows.

**decision:** Additive columns only. Existing 384-dim vectors are NOT re-embedded. New metadata fields enable filter pre-passes but do not require vector recomputation. Recompute-on-read-beats-backfill lesson applies: old rows have NULL metadata fields and remain searchable; new rows indexed post-migration carry full metadata.

**why-change:** Re-embedding the corpus has zero incremental benefit for the domain filter use-case (sector/ticker/doc_type are metadata filters, not semantic embedding inputs). Additive migration is online-safe (LanceDB `add_columns()` non-blocking). Backfill is infeasible without replaying the full ingestion pipeline for historical rows — not worth the compute cost for marginal improvement.

---

## STEP architect-S4 — Pillar B: Hybrid BM25 vs Metadata-Filter-Only

**task_id:** ARCH-DEEPFETCH-RAG-REDESIGN
**what-considered:**
- Option H: LanceDB FTS index + hybrid BM25+vector (Reciprocal Rank Fusion). Best recall for ticker-exact queries.
- Option V: Metadata pre-filter (ticker/sector columns). No BM25. Zero new infrastructure.

**decision:** Phase 1 = Option V (immediate win, zero risk). Phase 3 = Option H (gated on dev-rag-service Q3 feasibility probe — LanceDB FTS version check required).

**why-change:** LanceDB FTS API stability is version-dependent (v0.8+ required). Deploying it without version verification risks a breaking import on the running rag-service container. Option V delivers 80% of the precision gain (no more off-ticker noise in queries) with zero new dependency. Option H adds the remaining 20% (keyword recall for short tokens like "VCB") once feasibility is confirmed.

---

## STEP architect-S5 — Temporal Decay Per doc_type

**task_id:** ARCH-DEEPFETCH-RAG-REDESIGN
**what-considered:**
- Uniform half-life (current: 7 days for all content).
- Per-doc_type half-life (news: 1-3d; macro: 7d; filing: 30d; analysis: 14d).
- Per-source half-life.

**decision:** Per-doc_type half-life, passed as `decay_half_life_days` query parameter by each consumer. Configurable in `mcp.config.json` under `rag.decayHalfLifeDays`. No schema change needed — the DTO already accepts this parameter.

**why-change:** A BCTC quarterly filing published 25 days ago is still highly relevant for bctc-analyst; a 25-day-old news snippet is noise. The current uniform 7-day half-life makes filing retrieval degrade too fast and news retrieval degrade too slowly. Per-source decay would require a source→half-life lookup table of unbounded size; per-doc_type is the right abstraction level for this domain.
