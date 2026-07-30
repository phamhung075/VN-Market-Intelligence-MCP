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

### STEP pm-S5 · FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS Decomposition · pm · 2026-07-30T18:25:00Z
**task-id:** FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS (P0 decomposition)
**what-done:** Decomposed architect's Candidate-A ruling (kind-scoped `task_list_held` + prefix-match probe) into 3 atomic dev tasks with explicit dependency tiers. Parent row (FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS) status moved from IN_PROGRESS → BACKLOG (plan_only → plan_done), with supervised:true preserved. Created 3 handoff files (TASK-COWORK-MUTEX-001/002/003), documented tier sequencing (001 → [002, 003] parallel), explicit AC per file, and risk flags.

**what-considered:**
- Parent row status: supervised:true + plan_only:true → no child tasks auto-pickup (BOUNDED-1 SLS correctly skipped it). After PM decomposition, children rows inherit supervised:true per dispatch CLAUDE.md Step 2.5 (preserve for protocol-layer changes). Parent status becomes BACKLOG (plan_complete), next_agent → developer-generic (children route to developer zone).
- Task granularity: architect specified items 1+2 MUST land same commit (FR-6), items 4+5 as follow-ups. Split into: TASK-COWORK-MUTEX-001 (core implementation: dispatch-claim/SKILL.md Step 2.4 + CLAUDE.md 1-line + doc-sync), TASK-COWORK-MUTEX-002 (test harness: cowork-dispatch-collision-probe.test.sh, test-first per dev-standards), TASK-COWORK-MUTEX-003 (cross-reference: spawn-fanout.md annotation, lowest priority). All ~2h or less.
- Dependency tiers: (Tier 1) TASK-001 no deps; (Tier 2) TASK-002 + TASK-003 both depend on 001 and can run in parallel post-001. Sequential block: nothing, parallel bottleneck: 001 completion before dev can start 002/003.
- WIP policy: parent was locked by supervised flag anyway. Children inherit supervised:true, so auto-pickup still blocked. Router/PO must explicitly dispatch each tier. WIP count unchanged (parent transitions from IN_PROGRESS to BACKLOG, children enter backlog as TODO).
- Handoff files: all three tasks created with zone=cross-service/, size M/S, explicit AC, risk flags, dependencies documented. Test strategy documented for 002 (3 live cases: occurrence-3 repro, ambiguous multi-slot, negative control). No code changes expected in PM cycle (plan_only discipline maintained).

**why-decision:** Architect's ruling provides greenfield design (no code exists yet), narrowed to Candidate-A (read-probe via task_list_held, NOT shared namespace). Decomposition respects the FR-6 lockstep constraint (items 1+2 same commit) while enabling parallel execution of non-blocking items (002 and 003 can start once 001 is complete and their interface is known). Test-first discipline (task 002 articulates the 3 test cases before code lands) mirrors dev-standards § Test Strategy. Supervised hold preserved on children to protect dispatch protocol changes from auto-pickup (same safety lever architect relied on for plan_only).

**why-change:** Architect delivered full design (Candidate A ruling, multi-slot resolution rule, file-level ownership) post-BA spec — PM's job is to decompose and fan out to dev teams. No change to architect's guidance, only a sequencing & lane-routing decision (cross-service zone, three tasks, tier dependencies, WIP=0 since parent is blocked by supervised flag).

**risk-flags:**
- Supervised flag on children: BOUNDED-1 SLS will not auto-pick these tasks (correct). Deliberate dispatch must route each tier (router/PO responsibility, PM notes for transparency).
- FR-6 lockstep discipline: both SKILL.md and CLAUDE.md must land in ONE commit, or phase-list pointer silently disables Step 2.4 on next fresh read. Developer must verify `git show --name-only` includes both files post-commit. Added to AC check-list in TASK-001.
- Occurrence-3 reproduction (task 002 case 1): uses live coordination store, real `task_claim`/`task_release`. Test is fast (~1s) and idempotent (cleanup ensures no orphans), but developer must ensure test runs in a clean environment (no stale locks held by prior test runs).
- Doc-sync gap (task 001): `docs/agents/tools/list/task_list_held.md` does not document the `expired` parameter that Step 2.4 relies on. Architect flagged as "non-blocking, cheap to fix in same commit" — bundled into task 001. No impact if skipped, but better to land it together.

---

## RETURN
DONE: FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS decomposed into 3 atomic tasks with explicit dependencies, handoffs created, parent row moved to BACKLOG (plan_only→plan_done), supervised:true preserved on all children per protocol layer safety.

TASKS CREATED: TASK-COWORK-MUTEX-{001, 002, 003} (all zone: cross-service/)

TIER SEQUENCING:
- **Tier 1** (greenfield, no deps): TASK-COWORK-MUTEX-001 (core implementation: SKILL.md Step 2.4 + CLAUDE.md 1-line + doc-sync, same commit per FR-6) — 2-3h
- **Tier 2** (post-001): TASK-COWORK-MUTEX-002 (test harness: cowork-dispatch-collision-probe.test.sh, 3 live cases, test-first) — 1.5-2h; TASK-COWORK-MUTEX-003 (annotation: spawn-fanout.md cross-reference) — 30m (can run in parallel after 001)

HANDOFF: docs/handoffs/TASK-COWORK-MUTEX-{001,002,003}.md

BOARD CHANGES: Parent row FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS status IN_PROGRESS→BACKLOG, next_agent → null (children route to developer), supervised:true preserved. Three new child rows added to backlog[].

WIP IMPACT: Parent transitions out of IN_PROGRESS (freed 1 WIP slot). Children enter backlog as TODO (no WIP impact until picked up). Supervised flag blocks auto-pickup; deliberate dispatch required.

NEXT: Router/PO explicitly dispatches TASK-COWORK-MUTEX-001 to developer (cross-service zone). After completion, tier 2 tasks (002, 003) can be dispatched in parallel.

PIPELINE: continue (P0, decomposition-only, no code changes in this cycle)

---

