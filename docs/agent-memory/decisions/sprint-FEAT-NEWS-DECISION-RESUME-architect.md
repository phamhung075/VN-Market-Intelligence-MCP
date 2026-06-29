# Decision Journal — Sprint FEAT-NEWS-DECISION-RESUME · architect

**Sprint goal:** Add plain-Vietnamese decision résumé per news card (FR-1 builder + FR-2 DB + FR-3 DTO + FR-4 pill fix + FR-5 card render)
**Agent:** architect
**Started:** 2026-06-29T16:09:19Z

---

### STEP architect-S1 · architect · 2026-06-29T16:30Z
**task-id:** ARCH-FEAT-NEWS-DECISION-RESUME
**what-done:** Brownfield scan of 5 affected files, produced technical design + dev-hop split (Hop1=dev-mcp-server FR-1+FR-2+FR-3, Hop2=dev-frontend FR-4+FR-5), appended [Architect] Brownfield Findings to docs/handoffs/BA-FEAT-NEWS-DECISION-RESUME.md.
**what-considered:**
- (A) Separate `buildDecisionResume()` into its own file in domain/services — REJECTED: single-use, co-location in newsNormalizer.ts avoids a new file and keeps the translation table adjacent to the domain constants it references.
- (B) Put the domain VN translation table in a shared constants file — REJECTED: only one consumer (newsNormalizer.ts); shared file is over-engineering; mirrors existing domain-constant co-location pattern in newsNormalizer.ts.
- (C) Combine Hop1+Hop2 into a single dev task — REJECTED: two zones (apps/mcp-server + apps/frontend), Hop2 has a hard data dependency on Hop1 DTO field existing at runtime; sequential dispatch is mandatory.
- (D) Backfill existing rag_analyses rows — REJECTED by BA NFR-4 (explicit: no backfill required); legacy rows gracefully render without résumé strip.
**why-decision:** co-location + sequential hop separation satisfies DDD boundary (no cross-layer imports), NFR (no fake data, deterministic builder), and dep-chain (Hop2 codes against live DTO).
**why-change:** no change from plan
