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

---

## STEP po-S3 — DJ-GATE-1 MCP-layer authorization (2026-06-08T11:31:41Z)

**Context:** RAG layer reported DONE. Directed gate: verify-raw DFR-P1-RAG actually DONE, then authorize the MCP layer (flip DFR-P1-MCP TODO → READY). P2/P3 remain gated.

**What considered:**
- only path: flip DFR-P1-MCP → READY — both deps (DFR-BA-1 approved, DFR-P1-RAG DONE) confirmed satisfied via live raw-verification; no reason to hold.

**DJ-GATE-1 verify-raw (LIVE container, not badges):**
1. `docker ps`: vn-market-intelligence-mcp-rag-service-1 Up 8min (healthy), rebuilt 2026-06-08 13:22:07 — post the QA-fix commit 92aa2700 (13:19:47). Rebuild is live, not claimed.
2. Live `docker exec` lancedb introspect (/app/data/lancedb, table rag_entries): NUM_COLS=16; all 8 new metadata cols present (ticker/sector/source_domain/depth_tier/doc_type/published_at/confidence/impact_score), 0 missing; ROW_COUNT=14028 (matches QA baseline exactly → migration non-destructive confirmed on LIVE volume, not a test instance).
3. Git: 76a02b0d (FR-1/2/3 migration+DTO+pre-filters) + 92aa2700 (QA CHANGES_REQUESTED fix: apply_temporal_decay now passes 8 metadata fields + regression test, 104→105) both landed. DFR-QA-1 commit 0c76aa37 = round-2 APPROVED, AC-FR2-4/FR3-2/FR3-3 PASS live, 105/105 tests.
4. orch-state: DFR-P1-RAG status=DONE, DFR-QA-1 status=DONE. Deps for DFR-P1-MCP = [DFR-BA-1 approved, DFR-P1-RAG DONE] → satisfied.

**Decisions / board flips:**
1. DFR-P1-MCP: TODO → READY (next active task). Scope per approved spec: FR-6 (ALTER TABLE rag_analyses ADD COLUMN body_text, Q5-safe schema-news.ts:57 try/catch) + FR-4 (rag.decayHalfLifeDays in mcp.config.json news:2/macro:7/filing:30/analysis:14, NOT hardcoded) + FR-5 (ragIndex callers pollNews.ts + fetchParseAndStoreBctc.ts pass new metadata) + FR-3 mcp part (SearchRequest passes decay_half_life_days + filter params). ops_rebuild_required=true after merge.
2. DFR-P2-DEEPFETCH / DFR-P3-HYBRID: stay BLOCKED (verified status=BLOCKED, untouched). Per original plan Phase 2/3 are separate later gates, NOT opened this gate. WIP: DFR-P1-MCP is the only dispatch this gate.

**why-change:** no change from plan — phased ordering held; P1-RAG → P1-MCP → QA-1 serialized.

**Router action requested:** dispatch DFR-P1-MCP → dev-mcp-server (zone apps/mcp-server/). PO does not nested-spawn dev.

**Next gate:** after DFR-P1-MCP lands + ops rebuild mcp-server → DFR-QA-1 final verify. Only after DFR-QA-1 green: re-evaluate P2 unblock (Q1/Q2 green, then only QA-1 dep) and P3 (P1-RAG live, Q3 green) in a future explicit gate.
