# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-rag-service

**Sprint goal:** Make cowork `guaranteed:true` an honored contract (look-back/catch-up on missed slots). This entry is an ambient CI-red fix filed under the active sprint bucket per fleet journal convention, unrelated to the sprint's own scope.
**Agent:** dev-rag-service
**Started:** 2026-08-07T01:29:33Z

---

### STEP dev-rag-service-S1 · dev-rag-service · 2026-08-07T01:29:33Z
**task-id:** FIX-CI-SIZELINT-RAG-EMBEDDER-NEW-OFFENDER
**what-done:** Added `# size-justification: 175L — ...` header (first 8 lines) to apps/rag-service/infrastructure/embedder.py; declared count matches post-edit `wc -l` exactly (167L→175L).
**what-considered:**
- Split lazy-load vs idle-unload into two files — rejected: both share the SAME asyncio.Lock double-check pattern + SAME _model/_last_used_monotonic state; a split would duplicate the lock or force tight cross-file coupling.
- Justification header only (no split) — chosen, per task's own stated preference for genuinely cohesive lifecycle code.
**why-decision:** File IS the singleton's full state machine (load+unload), not a bag of unrelated helpers — honest justification beats an artificial split.
**why-change:** No change from task brief — AC1 explicitly favored justification over split for this file.

---

### STEP dev-rag-service-S2 · dev-rag-service · 2026-08-07T01:29:33Z
**task-id:** FIX-CI-SIZELINT-RAG-EMBEDDER-NEW-OFFENDER
**what-done:** Did NOT run `--update`; verified fix scoped: `SIZE_LINT_INCLUDE_OVERRIDE=embedder.py --check` → RC=0; full-repo `--check` offender count 4→3 (embedder.py cleared).
**what-considered:**
- Run full `--update` to regenerate baseline — rejected: AC2 forbids it (would launder 3 unrelated current offenders repo-wide).
- Scoped env-override verification vs waiting for sibling baseline tasks to land for a true full-repo RC=0 — chose scoped verification now; documented remaining 3 offenders belong to sibling tasks (BCTCREFINED-PROJECTION-BASELINE, RAG-APP-FACTORY-BASELINE, schema.ts) sequenced separately per task NOTE.
**why-decision:** Task's own NOTE states this task's work is independent of the baseline-touching siblings — full-repo green is a batch-level outcome, not provable from this single-file commit alone.
**why-change:** No change — AC3/AC4 full-repo green depends on sibling tasks landing; this entry records honest scoped verification only.
