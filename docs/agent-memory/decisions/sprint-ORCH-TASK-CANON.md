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

### STEP arch-S1 · architect · 2026-06-06T20:15:00Z
**task-id:** ARCH-ORCH-TASK-CANON
**what-done:** Issued all 4 blocker rulings, folded fluidity-audit F-4/F-5 addendum into F4 scope, merged F1a+F4 into single agent-father task, confirmed dispatch order, wrote full brownfield blueprint to docs/handoffs/ORCH-TASK-CANON-ARCH.md.
**what-considered:**
- BLOCKER-1: TypeScript interface as machine-SSOT (enforces shape at compile time) + docs/standards/task-schema.md as human-readable view — both, not either
- BLOCKER-4 migration runner: agent-father (data-file jq migration = ops-lane, not TypeScript) vs dev-mcp-server (keeps F2 focused on TypeScript only) — agent-father wins; cleaner gate ordering
- F1a+F4 merge: both are agent-father, disjoint file sets, one context load cheaper than two dispatches
- Per-agent journal files (F-4 addendum): Option 1 chosen (per-agent files) over commit-mutex-wrap (125s serialization latency) and deferred-merge (extra post-tier step)
**why-decision:** Routing migration to agent-father creates a clean one-way dependency gate: F1B commit = green light for F2 TypeScript rename. Per-agent files eliminate all append contention at zero latency cost; journalStore glob is backward-compatible with legacy single-file names.
**why-change:** BA addendum (F-4/F-5 from fluidity audit) arrived after BA spec; folded into F4 scope rather than a separate sprint to avoid a third agent-father dispatch and keep the journal-path change atomic with the resolver bug fix.

### STEP pm-S1 · pm · 2026-06-06T21:45:00Z
**task-id:** PM-ORCH-TASK-CANON-DECOMPOSE
**what-done:** Decomposed architect blueprint (ORCH-TASK-CANON-ARCH.md) into 5 atomic tasks with handoff files + canonical schema; created TASK_AF-ORCH-F1A-F4.md, TASK_AF-ORCH-F1B.md, TASK_F2-MCP.md, TASK_F3-FE.md, TASK_QA.md (all per PM init.md § handoff_file_mandatory); created docs/standards/task-schema.md (human-readable TypeScript contract); updated orch-state.json .task_board.active_sprints to add ORCH-TASK-CANON sprint with 5 canonical tasks.
**what-considered:**
- Dispatch order STRICT sequential (architect confirmed): F1a-F4 → F1B → F2 → F3 → QA (gates: commit-mutex, REBUILD verify, API verify, dashboard verify)
- Zone isolation: F1a+F4 (docs-only), F1B (data-only), F2 (TypeScript), F3 (frontend), QA (integration) — all disjoint except dependencies
- Task shape (canonical {id,title,owner,status,zone,created_at}): all 5 tasks conform; F1a+F4 task will enforce schema in all flow files post-commit
- Blocker rulings embedded in handoff acceptance criteria (D-1 to D-6 from brief); no blocker escalation needed (architect issued rulings)
**why-decision:** Task-level decomposition required before developer dispatch (PM init.md mandates handoff files + task shape). Atomic 5-task breakdown allows parallel zone-isolation verification (F1a-F4 docs review while F1B jq drafted) and clear dependency gates (F1B commit gates F2 start, F2 REBUILD gates F3 start).
**why-change:** Canonical task schema NEW (created as part of F1a-F4 scope per D-1 ruling BLOCKER-1); handoff files per architect blueprint § Dispatch Order (TASK_NNN.md format per PM init.md § handoff_file_mandatory).
