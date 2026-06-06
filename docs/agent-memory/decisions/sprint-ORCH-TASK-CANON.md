# Decision Journal — Sprint ORCH-TASK-CANON

**Sprint goal:** Canonical task schema + decision visibility on orchestration dashboard
**Started:** 2026-06-06T19:10:00Z

---

### STEP ba-S1 · ba · 2026-06-06T19:10:00Z
**task-id:** BA-ORCH-TASK-CANON
**what-done:** Authored full requirement spec for ORCH-TASK-CANON (F1 schema contract+migration / F2 serving coalesce+done[] / F3 done-group source / F4 skill resolver bug+journal rewrite / QA live-verify); wrote to docs/handoffs/ORCH-TASK-CANON-BA-spec.md.
**what-considered:**
- Raw-read done[] SSOT (66 rows, 27 distinct status strings, 1 nested container, 52/66 titles, 21/66 owners, 2/66 created_at) — not relayed from PO diagnosis
- F2 serving confirmed: orchestrationHandler.ts buildOrchestrationDto serves active_sprints tasks only; done[] never projected → join starved; decisions.by_task populated but no done tasks served → accordion empty
- Skill resolver: `entries[0].id` → always empty (field is `sprint_id`) → silent date-fallback → all sprint-named journal files invisible to resolver
- F3 filter: exact `t.status === "DONE"` misses 15 freeform variants (DONE-LIVE-VERIFIED etc.) — all hidden from done group
**why-decision:** All 4 layers (creation/migration/serving/journal) must ship together; F2-only coalesce without F1 migration delivers zero visibility for 66 existing done rows (derived-column-reflow lesson). Blocked zero PO-level questions — 4 architect-level blockers (schema location, counts rule, F3 rollout, migration runner).
**why-change:** F4 scope widened vs PO draft to include skill resolver fix (found raw via jq) and sprint-2026-06-06.md freeform rewrite for existing triage decisions.
