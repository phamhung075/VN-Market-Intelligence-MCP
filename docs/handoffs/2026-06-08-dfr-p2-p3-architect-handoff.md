# Architect Hand-off — DFR Phase 2 + Phase 3 (combined)

**From:** po · **To:** architect (router dispatches) · **Date:** 2026-06-08
**Source brief:** docs/architecture-briefs/2026-06-08-deepfetch-rag-redesign.md (Pillars A + B)
**Feasibility (all DONE, green — do NOT re-probe):**
- DFR-Q1/Q2 recon: docs/architecture-briefs/2026-06-08-dfr-q1-q2-recon.md
- DFR-Q3/Q4 spike: docs/spikes/SPIKE_DFR-Q3-Q4-lancedb-feasibility.md

## Gate state (PO action this cycle)
- DFR-P2-DEEPFETCH: BLOCKED -> **TODO** (deps DFR-Q1, DFR-Q2, DFR-QA-1 all DONE — raw-verified)
- DFR-P3-HYBRID:   BLOCKED -> **TODO** (deps DFR-Q3, DFR-P1-RAG all DONE — raw-verified)
- DJ-GATE-1 PASS: Phase-1 (DFR-P1-RAG, DFR-P1-MCP, DFR-QA-1) all DONE raw-verified in active_sprints[23].tasks before flip.

## Sequencing / parallelism decision
- **Run both in parallel.** Hot zones are disjoint: P2 = mcp-server + vps + mainserver-crawls; P3 = rag-service (+ a thin mcp-server caller opt-in). WIP ok: in_progress lane was empty (0) at gate time.
- P2 is the user headline ("fetch deeper for full detail") — primary. P3 is independent (its deps were already met) — runs concurrently in a different zone.
- One shared touch-point only: mcp-server. P2's mcp-server work (gate + queue + re-index) is in scheduler/domain/infra; P3's mcp-server work is a tiny `hybrid:true` opt-in on the search caller. Architect must keep these from colliding on the same file (serialize the two mcp-server slices if they touch the same module; otherwise independent).

## What ARCHITECT must design

### DFR-P2-DEEPFETCH (zone=multi -> MUST split before any dev dispatch)
Blueprint Option R from the brief. Produce a per-zone split:
1. **dev-mcp-server** — relevance gate (3-signal OR: ticker / sector-keyword / impact>=7) in pollNews.ts POST-dedup; `deep_fetch_queue` + `deep_fetch_stats` SQLite tables; `deepFetchVpsJob.ts` (VPS executor) + `deepFetchMainJob.ts` (mainserver fallback dispatcher) cron jobs; `body_text` column already added in Phase-1 — re-index deep content with `depth_tier="deep"` via status/upsert (NO silent DB delete).
2. **dev-vps-crawls** — extend EXISTING `article-body-fetcher.py` with `extract_vnexpress()` + add `vnexpress.net` to ALLOWED_DOMAINS; add `vnexpress.net` to `ARTICLE_BODY_ALLOWED_DOMAINS` in `vps-proxy-server.js`. EXTEND the live `vn-vps-proxy.service` `/proxy/article-body` endpoint (already serves cafef.vn + vneconomy.vn) — **NO new systemd service** (per DFR-Q2 verdict). Plain HTTP only, NO Chromium on VPS.
3. **dev-mainserver-crawls** — Playwright fallback executor for JS-rendered / international sources (the `status="vps-failed"` path). Playwright ONLY on main-server.

### DFR-P3-HYBRID (zone=rag-service + thin mcp-server caller)
Lock the FTS + RRF integration design:
- 2-call `create_fts_index()` pattern (single-field per call -> title, then summary) — confirmed available in deployed lancedb 0.30.2 (SPIKE_DFR-Q3-Q4).
- WHEN to build the FTS index (startup vs on-migrate vs lazy) and how to keep it fresh on new inserts.
- `LanceHybridQueryBuilder` + `RRFReranker` hybrid path in `LanceDBVectorStore`.
- Hybrid opt-in flag: `POST /search {hybrid: bool}` default `false` (backward-compat); mcp-server search caller opts in.

## GUARDRAILS (bake into the dev task specs — MANDATORY, not optional)
- Deep-fetch is outward-facing: hard caps (10 deep / 5 Playwright per cycle), per-domain daily limit, 4h stale expiry, `source_url` UNIQUE — all mandatory.
- No silent DB deletion; re-index via status/upsert.
- VPS = plain HTTP only (no Chromium); Playwright ONLY on main-server.
- No hardcoded system data — query docs/data/system-map.json for zones/sources/services.
- No branches — all work on main.

## Router: dispatch next = ARCHITECT
Architect produces (a) DFR-P2 zone split (3 sub-tasks) + (b) DFR-P3 FTS/RRF integration design, then hands to ba/pm -> dev-{mcp-server,vps-crawls,mainserver-crawls,rag-service} -> qa.
