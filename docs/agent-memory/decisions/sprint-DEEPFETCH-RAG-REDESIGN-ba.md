# Decision Journal — Sprint DEEPFETCH-RAG-REDESIGN · ba

**Sprint goal:** Phase 1 additive RAG metadata enrichment — LanceDB +8 cols, per-doc_type decay, DTO extensions, rag_analyses.body_text. Phase 2/3 gated.
**Agent:** ba
**Started:** 2026-06-08T00:00:00Z

---

### STEP ba-S1 · ba · 2026-06-08T00:00:00Z
**task-id:** DFR-BA-1
**what-done:** Wrote Phase 1 requirement spec with 6 FRs, 6 NFRs, 5 edge cases, 26 ACs mapped to live-verifiable checks.
**what-considered:**
- Only path: spec Phase 1 scope only (B2/B4/B7/Q5/caller-update); Phase 2/3 explicitly out of scope with backlog task references per brief instruction.
**why-decision:** Brief and task note are unambiguous — Phase 1 is additive-only, lowest risk, no re-embed. Scoping hard stops at Phase 2 gate (Q1/Q2/Q3/Q4 feasibility probes not yet answered). Spec follows recompute-on-read pattern: old rows keep vectors + NULL defaults; new rows gain metadata.
**why-change:** No change from plan — follows brief §B2/B4/B7/Q5 directly.
