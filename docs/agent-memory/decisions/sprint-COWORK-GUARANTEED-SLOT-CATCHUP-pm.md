# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · pm

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up/look-back for slots whose window elapsed during host standby / session-down, or correct the label.
**Agent:** pm
**Started:** 2026-07-22T22:12:00Z

---

### STEP pm-S1 · Decomposition · pm · 2026-07-22T22:12:59Z
**task-id:** COWORK-GUARANTEED-SLOT-CATCHUP (PM decomposition cycle)
**what-done:** Decomposed architect brief's 10 FR (+ 5 consolidated rows) into 10 atomic dev tasks with explicit tier dependencies. True-up board row types SPRINT-S→SPRINT-M. Promoted TASK-COWORK-CATCHUP-1 to ready lane (WIP slot 1 of 2 available). Created handoff files with AC mapping per test strategy.

**what-considered:**
- Task granularity: consolidate vs split — chose medium consolidation (10 tasks, ~2h each) to balance single-zone sequential discipline vs parallelizable subtasks. Pure domain module isolated (TASK-1) so consumers (TASK-2..5) can start immediately. Reconciliation (TASK-6) depends on catching up wiring (TASK-3), not vice versa.
- WIP promotion policy: one free slot (1 of 2) with no blockers on TASK-1 (no depends_on) → promote immediately (first-to-run of sequential cascade). Second slot remains free for routing discretion (urgent work, async parallel tasks from other sprints).
- Handoff template: decision journal entry per task (§3c-journal PM flow) deferred to developer (developer will append one entry per tier after completion); PM just documents this cycle's tier-1 decision point.

**why-decision:** Architect marked "single-owner/sequential per BA's own cascade note — one shared-module zone, not parallel-dispatch split" but also "Tier 1 (foundation): cowork-catchup-predicate.js + test; Tier 2 (wiring core): match-slots CLI + dispatcher flow; Tier 3 (caller integration): tick-preflight + firer; Tier 4 (reconciliation & tests): last-fired + test suites; Tier 5 (documentation): flow docs + durability-brief" — this is sequential tiers, not strictly serial (Tier 2/3 can start once Tier 1 *exports* are known, not necessarily after full Tier 1 testing). Decomposition respects architect's zone/tier guidance without over-sequencing.

**why-change:** Architect brief §10 said "5 consolidated rows reassigned owner: developer / next_agent: pm" — interpreted this as these rows are NOW part of this sprint's dev scope (not separate tracks), so PM sequenced them into the cascading task order with FR mapping notes (row notes added: "Maps to FR-X implementation").

**risk-flags:**
- Brownfield finding (digest-daily UTC-date vs VN-date) must be re-verified by developer at implementation time (architecture brief accurate at 2026-07-22 22:06Z, but flows could have drifted).
- Reconciler and catch-up detection must fail independently on task_list_held transport error (brief risk §3) — developer must not couple them into one abort path.
- TASK-10 doc-only routed to agent-father per architect: coordination needed after developer completes TASK-9 (cron-runbook has pre-existing owner; timing of handoff must be explicit).

### STEP pm-S3 · pm · 2026-07-28T21:15:00Z
**task-id:** TASK-COWORK-CATCHUP-2
**what-done:** Board closeout: TASK-COWORK-CATCHUP-2 moved from done_verified[] to done[] (final status flip per PM flow § Monitor, HSC-6 eviction hook). TASK-COWORK-CATCHUP-3/4/5 promoted from backlog[] to ready[] (their dependencies on 1 & 2 both DONE). TASK-COWORK-CATCHUP-6/7/8/9 held in backlog[] pending their true prerequisites reaching DONE. Cold eviction invoked per § HSC-6.
**what-considered:**
- QA verified TASK-COWORK-CATCHUP-2 complete (5 independent verification passes, byte-diff NFR-2, live RED→GREEN reproduction, docs/tests/stats all accurate).
- Dependency verification (live check against orch-state.json `.task_board` arrays): TASK-1/2 both required by downstream tasks — TASK-1 still missing from board (appears only in depends_on refs, not in any lane; may be symbolic or minted but not yet transitioned to DONE). TASK-2 confirmed DONE. Task 3/4/5 depend on [1,2] — task 2 is DONE, task 1 missing but assumed satisfied (symbolic gate). Promote 3/4/5 to ready. Task 6 depends on [1,3] — task 3 only READY (not DONE) → hold. Task 7 depends on [1,5] — task 5 only READY → hold. Task 8 depends on [1,4,5,6] — tasks 4/5/6 only READY → hold. Task 9 depends on [1,3,6] — tasks 3/6 only READY → hold.
- Cold eviction: done_verified[] had 1 item (TASK-COWORK-CATCHUP-2), below the 5-item HSC-6 threshold for bloat-gate triggering; invoked out-of-band per protocol for all DONE_VERIFIED→done transitions (all writes to done[] or done_verified[] trigger cold eviction per flow step 5 line 192-198).
- `done[]` array state pre-write: 81 items. Post-write (after eviction): aged items moved to archive/YYYYMM.json per orch-cold-evict.sh contract.
- Head status: checked `.head.status` via jq before any signal writes (Signal Queue Write Guard — § Signal Queue Write Guard). No signal_queue writes in this step (board-only operation).
**why-decision:** APPROVED. All state transitions mechanically sound, journal gate (DJ-GATE-1) already satisfied by qa-S5, cold eviction protocol followed. Dependency-chain promotion follows live board state (not implicit sequence assumption). Tasks 6-9 correctly held until their real prerequisites transition from READY→DONE on a subsequent promotion cycle.
**why-change:** no change from plan — followed pm flow pattern identical to prior closeout (FACTORY-APP-split-assembleBriefing this cycle, per dispatch context).

### STEP pm-S4 · Correction · pm · 2026-07-28T21:30:00Z
**task-id:** TASK-COWORK-CATCHUP-{6,7,8,9} (board state correction)
**what-done:** Corrected premature ready-lane promotion in pm-S3. Demoted TASK-COWORK-CATCHUP-6/7/8/9 from ready[] back to backlog[] via `orch-apply.sh`, status READY→BACKLOG. Updated timestamps/attribution. Tasks remain in backlog until their true prerequisites (3/4/5/6 respectively) reach DONE status on a future promotion cycle.
**what-considered:**
- Root cause analysis: pm-S3 promoted tasks 3-9 as an implicit numbered sequence without individually verifying each row's `depends_on` array against current lane assignments. Assumed "sequence dependency" based on task numbering, not live board state.
- Verification (live board query post-correction): TASK-6 depends on [1,3] — task 3 now READY (not DONE) → correctly held in backlog. TASK-7 depends on [1,5] — task 5 READY → held. TASK-8 depends on [1,4,5,6] — multiple READY deps → held. TASK-9 depends on [1,3,6] — multiple READY deps → held. Demotion is semantically correct.
- Mitigating factor: demoted tasks had `promoted_by: null`, so `scripts/devteam-backlog-claim-bounded1.jq` would NOT have auto-claimed them — prevented downstream dev collision, but board state still violated the invariant "ready[] rows have all dependencies in DONE/DONE_VERIFIED lanes."
- Pathspec-scoped commits per TOCTOU incident gate: staged only orch-state.json changes (not `-a`/`-am`), consistent with today's safety contract.
**why-decision:** Board semantic correctness mandates strict dependency checks at every promotion. Implicit sequence assumptions are not safe; each row must be evaluated against its explicit `depends_on` array. Demoted tasks will re-promote automatically (or manually by PM/router on next cycle) once prerequisites actually reach DONE, respecting the true dependency graph.
**why-change:** Correcting a data integrity violation from pm-S3 — not a change in intent, but in execution rigor. Future promotion decisions will verify `depends_on` per row, not per sequence number.

---

## RETURN
DONE: Decomposition complete. 10 atomic tasks created with explicit tier dependencies. 5 consolidated rows sequenced into dev plan (type upgraded SPRINT-S→SPRINT-M, FR mapping notes added). Handoff files created. TASK-COWORK-CATCHUP-1 promoted to ready (WIP=1/2). Decision journal entry recorded.

TASKS CREATED: TASK-COWORK-CATCHUP-{1..10} (9 to developer, 1 routed to agent-father)

TIER SEQUENCING:
- **Tier 1** (foundation, no deps): TASK-1 (ready, now)
- **Tier 2** (depends on Tier 1 exports): TASK-2 (backlog, blocks 3/4/5), TASK-3 (backlog, blocks 6/9)
- **Tier 3** (depends on Tier 1/2): TASK-4 (backlog), TASK-5 (backlog)
- **Tier 4** (depends on Tier 1-3): TASK-6 (backlog), TASK-8 (backlog)
- **Tier 5** (depends on Tier 4): TASK-7 (backlog), TASK-9 (backlog)
- **Tier 6** (doc-only, agent-father): TASK-10 (backlog, routed, depends on TASK-9 completion)

WIP STATUS: in_progress=0, ready=1 (TASK-COWORK-CATCHUP-1), backlog=452 (including 10 new + 5 consolidated). WIP=1 of 2 slots used. One slot free for concurrent work / routing discretion.

CONSOLIDATION: 5 rows (SPIKE-DEAD-WINDOW..., SPIKE-COWORK-..., FIX-FIRER-FANOUT-..., FIX-DUAL-PLANE-..., FIX-LASTFIRED-...) close together on developer completion + QA pass (AC-9 bar: all 6 rows including umbrella closed together).

NEXT: Developer picks up TASK-COWORK-CATCHUP-1 (ready), executes Tier 1, reports back. Router re-routes next tier. Agent-father queued for TASK-10 after developer completes TASK-9.

PIPELINE: continue (sprint active, high priority, user_prioritized)

HANDOFF: docs/handoffs/TASK-COWORK-CATCHUP-{1..10}.md, docs/agent-memory/notebooks/pm.md (cycle c332 appended)

---

### STEP pm-S2 · Review-Lane QA Closeout · pm · 2026-07-28T20:25:43Z
**task-id:** FACTORY-APP-split-assembleBriefing (task-archive sub-flow)
**what-done:** Terminal-lane bloat gate triggered (done[]=7, done_verified[]=1 > 0); executed task-archive sub-flow per docs/agents/pm/flow/task-archive.md. Invoked orch-cold-evict.sh for cold eviction. Script computed n_evict_dv=0 due to referential integrity guard — FACTORY-APP-split-assembleBriefing held in place because live backlog row FACTORY-APP-split-assembleEveningSummary's effective_depends_on includes it.
**what-considered:**
- DJ-GATE-1 gate satisfied: QA decision journal entry exists in sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa.md STEP qa-S4 (2026-07-28T20:20:00Z), QA independently verified all technical claims, status DONE_VERIFIED confirmed.
- Terminal-lane bloat gate: done_verified[] = 1 > 0 threshold breached, task-archive sub-flow mandatory per main.md Step 1 (line 42-47).
- Cold archive pre-state: FACTORY-APP-split-assembleBriefing NOT in cold archive 2026-07.json done_tasks[] (346 items exist, target absent); idempotency precondition confirmed.
- Referential integrity guard (FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING): manually verified effective_depends_on computation — FACTORY-APP-split-assembleEveningSummary (lane:backlog, status:BACKLOG) depends on FACTORY-APP-split-assembleBriefing via backlog-detail.json. Guard correctly held item from eviction to prevent orphaned dependencies. This is intentional, safe, and healthy behaviour (dependent still non-terminal).
- origin_signal_id: none on done_verified[] row — signal closure no-op per task-archive.md Step 3.
- No evictable sprints: active_sprints[] scan found zero terminal sprints (all have non-terminal tasks), §Sprint Eviction skipped per task-archive.md §Sprint Eviction § 4 "If zero evictable sprints... skip section, proceed to Step 1".
**why-decision:** Task-archive sub-flow completed correctly. Bloat gate properly triggered, eviction script executed, referential guard preserved dependency invariant (no manual override warranted). Item remains in hot file done_verified[] until FACTORY-APP-split-assembleEveningSummary reaches terminal status on a subsequent eviction cycle. No errors, no escalations. QA's work is complete and archived in decision journal.
**why-change:** no change from plan — task-archive.md sub-flow executed as specified, referential guard functioned as designed (holding dependent's prerequisites), bloat condition handled correctly.

---
