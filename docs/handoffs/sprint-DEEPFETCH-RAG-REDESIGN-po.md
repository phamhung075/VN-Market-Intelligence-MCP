# Sprint Decision Journal — DEEPFETCH-RAG-REDESIGN (PO)

Sprint brief: docs/architecture-briefs/2026-06-08-deepfetch-rag-redesign.md
BA spec: docs/handoffs/DEEPFETCH-RAG-REDESIGN-phase1-BA-spec.md

---

## STEP po-S1 — Sprint kickoff (prior, commit 1af7088e)
Directed kickoff, user-greenlit. Phase 1 additive RAG metadata + per-doc_type decay (no re-embed). Spawned DFR-BA-1 spec + 5 feasibility probes (DFR-Q1..Q5) in parallel. Phase 2/3 (DFR-P2-DEEPFETCH / DFR-P3-HYBRID) seeded BLOCKED in backlog per dep ordering.

---

## STEP po-S2 — DJ-GATE-1 directed review (2026-06-08T10:42:33Z)

**Context:** BA spec ready (DFR-BA-1 spec_ready) + all 5 feasibility probes DONE/GREEN. Router requests: approve spec, authorize Phase-1 dev, confirm P2/P3 stay gated.

**What considered:**
- only path: approve DFR-BA-1 + authorize DFR-P1-RAG next (no revision warranted) — spec is raw-verified complete; no gap or contradiction found vs brief or feasibility verdicts.

**Verify-raw performed (not badges):**
1. Read full BA spec (352L): 6 FRs / 26 ACs, all live-verifiable, explicit Phase-2/3 OUT-OF-SCOPE section, NFR-1..6 (non-destructive / backward-compat / baseline-test-preserved / no-re-embed / no-downtime / no-hardcode), 5 edge cases (E1 URL-parse, E2 ticker-not-in-watchlist, E3 published_at-missing, E4 lancedb-version-incompat, E5 startup-race). DDD layer mapping table present + zones assigned (apps/rag-service dev-rag-service + apps/mcp-server dev-mcp-server). VERDICT: spec is sound, no revision.
2. Read SPIKE_DFR-Q3-Q4 doc raw: Q4 add_columns() NON-DESTRUCTIVE confirmed (throwaway table 3 rows before→3 after, vectors not re-embedded, safe defaults depth_tier=shallow/doc_type=news/0.0). Q3 FTS+hybrid AVAILABLE (lancedb 0.30.2, single-field create_fts_index, LanceHybridQueryBuilder + RRFReranker). Authoritative prod version = Docker image 0.30.2.
3. Q1/Q2 recon doc + brief exist on disk (verified ls): vnexpress plain-fetchable, EXTEND vn-vps-proxy (no new service), 469MB free.
4. Q5: ALTER TABLE rag_analyses ADD COLUMN body_text safe (single-writer, try/catch pattern at schema-news.ts:57). DONE on board.
5. Board cross-check: DFR-P1-RAG depends=[DFR-BA-1] only; DFR-P1-MCP depends=[DFR-BA-1, DFR-P1-RAG]; DFR-QA-1 depends=[DFR-P1-RAG, DFR-P1-MCP]. P2 depends=[Q1,Q2,DFR-QA-1]; P3 depends=[Q3,DFR-P1-RAG]. Both P2/P3 status=BLOCKED in backlog.

**Decisions:**
1. DFR-BA-1: spec_ready → approved (no revision). Spec covers brief Phase-1 scope (B2/B4/B7/Q5) exactly; Phase-2/3 correctly deferred.
2. DFR-P1-RAG: TODO → READY (next dispatch). Both migration gates green (Q4 add_columns + Q5 ALTER). Must run FIRST — DFR-P1-MCP (b)/(c) depend on rag-service accepting new DTO fields. WIP discipline: P1-RAG → P1-MCP → QA-1, serialized.
3. DFR-P1-MCP / DFR-QA-1: stay TODO (deps not yet met). Not dispatched this gate.
4. DFR-P2-DEEPFETCH / DFR-P3-HYBRID: stay BLOCKED. Feasibility gates now green (Q1/Q2 for P2; Q3 for P3) BUT Phase-1 deps unmet — P2 needs DFR-QA-1 (not done), P3 needs DFR-P1-RAG live (not done). Confirmed gated per original deps; no dep-note change needed (Q-answers do not unblock — they only clear the feasibility precondition, the Phase-1 ordering dep is intact). Do NOT dispatch this gate.

**why-change:** no change from kickoff plan — proceeding exactly per phased ordering.

**Router action requested:** dispatch DFR-P1-RAG → dev-rag-service (spawn `run docs/agents/dev-team/flow/main.md` routing the rag-service zone). PO does not nested-spawn dev.

**Next gate:** after DFR-P1-RAG lands live-verified → authorize DFR-P1-MCP dispatch.
