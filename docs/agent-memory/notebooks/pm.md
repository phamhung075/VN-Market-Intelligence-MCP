# PM — Notebook

## c335 FIX-RUNIDLE-PREDICATE-D-ACTIVE-SPRINTS-PERMANENT-FLOOR · Root-Cause Confirmed, Decomposed to 5 Atomic Tasks · 2026-08-09T00:00Z

**MANDATE (from po, session bc8e264c):** Decompose and dispatch the task FIX-RUNIDLE-PREDICATE-D-ACTIVE-SPRINTS-PERMANENT-FLOOR. Root cause already confirmed by po via live hand-run of predicates. Task exists because RC-IDLE-LOOPS shipped (5/5 tasks DONE_VERIFIED) but its AC-3 empirical criterion was never re-measured — the idle guard is dead on arrival due to structural unreachability of predicate (d).

**ROOT CAUSE (verified live 2026-08-08T22:15Z):**
- RC-IDLE-LOOPS shipped with predicate (d): "active_sprints == 0"
- active_sprints[] is an accumulator with NO closeout producer
- Live state: 8 entries, all status=ACTIVE, 2 stale (2026-07-17, >3 weeks)
- Predicate (d) has never been true, so RUN-IDLE has never fired
- Consequence: drain-signal commits rose from 18-49/day (mid-July) to 25-65/day (this week), unmitigated

**PO GUIDANCE (binding constraints):**
1. Do NOT create a new active_sprints[] entry to track this task's work (guardrail 1) → tasks placed in backlog, not sprint
2. Run SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP first to contextualize this as instance of that class → task notes this dependency

**DECOMPOSITION APPLIED (5 atomic tasks, all backlog-tracked):**

1. **TASK_RUNIDLE-1-AUDIT** (Zone: cross-service/dev-flow/, Size S, ~1.5h)
   - Map all writers to active_sprints[]
   - Document where sprints SHOULD close (po/sprint-signoff.md flow)
   - Audit current state: list all 8 sprints with id/status/updated_at/age/task_count
   - Identify structural gap: what close-producer is missing
   - Deliverable: docs/architecture-briefs/2026-08-09-active-sprints-accumulator-gap.md
   - Blocks: TASK_RUNIDLE-2, TASK_RUNIDLE-3

2. **TASK_RUNIDLE-2-REDESIGN** (Zone: cross-service/dev-flow-scripts/, Size M, ~2h)
   - Refactor _step5_idle_check() predicate (d) in scripts/agents-flow/dev-team-tick-preflight.sh (L338-392)
   - New logic: return true if ALL active_sprints have zero READY/IN_PROGRESS tasks
   - Add helper: identify "dispatchable work" in a sprint
   - Test: verify script works on mixed boards (active+idle sprints)
   - Depends: TASK_RUNIDLE-1
   - Blocks: TASK_RUNIDLE-4

3. **TASK_RUNIDLE-3-STALENESS** (Zone: cross-service/dev-flow-scripts/, Size M, ~2h)
   - Implement staleness filter: sprint with updated_at > 7 days old AND zero dispatchable children
   - Create helper: skip_stale_childless_sprints()
   - Handle malformed timestamps gracefully (e.g., '2026-07-17T04:53:14ZZ' double-Z)
   - Integrate into predicate (d) so stale/childless sprints don't block idle
   - Depends: TASK_RUNIDLE-1
   - Blocks: TASK_RUNIDLE-4

4. **TASK_RUNIDLE-4-TEST** (Zone: cross-service/dev-flow-tests/, Size S, ~1.5h)
   - Write regression test case: "active_sprints non-empty but every member stale/childless → RUN-IDLE fires"
   - Fulfills AC-2 from RC-IDLE-LOOPS (that was never written)
   - Mock board: 8 sprints, all stale/childless, all other predicates true
   - Assert: _step5_idle_check() returns RUN-IDLE verdict
   - Assert: consecutive_run_idle counter increments
   - Depends: TASK_RUNIDLE-2, TASK_RUNIDLE-3

5. **TASK_RUNIDLE-5-VERIFY** (Zone: cross-service/observability/, Size S, ~1h)
   - After tasks 2-4 land: wait for next quiet dev-team tick
   - Observe docs/data/dev-team-idle-widen-state.json, verify consecutive_run_idle > 0 (was always 0)
   - Schedule 7-day review: measure git log --grep='chore(signals): drain' daily count
   - Verify count drops below 25-65/day band (pre-fix baseline 08-05..08-08)
   - Fulfills AC-3 from RC-IDLE-LOOPS (that was never re-measured)
   - Depends: TASK_RUNIDLE-2, TASK_RUNIDLE-3, TASK_RUNIDLE-4

**BOARD MUTATIONS APPLIED:**
1. Parent row FIX-RUNIDLE-PREDICATE-D-ACTIVE-SPRINTS-PERMANENT-FLOOR: status=BACKLOG (unchanged), added decomposed_tasks array with all 5 task ids
2. Added 5 new tasks to backlog (TASK_RUNIDLE-1..5):
   - all status=BACKLOG
   - priority=high (inherited from parent)
   - owner=developer, next_agent=developer (routed by zone specialists)
   - depends_on/blocks chains set per decomposition
   - created_by=pm/decompose-runidle-predicate-d-20260809T0000Z

**HANDOFF FILES CREATED (5 total):**
- docs/handoffs/TASK_RUNIDLE-1-AUDIT.md (audit scope, mapping, findings template)
- docs/handoffs/TASK_RUNIDLE-2-REDESIGN.md (predicate logic, test strategy, helper design)
- docs/handoffs/TASK_RUNIDLE-3-STALENESS.md (staleness thresholds, childlessness definition, filter integration)
- docs/handoffs/TASK_RUNIDLE-4-TEST.md (test scaffold, AC assertions, discovery pattern)
- docs/handoffs/TASK_RUNIDLE-5-VERIFY.md (verification measurement plan, success criteria, post-landing schedule)

**VERIFICATION:**
- orch-apply.sh: Stage 0+1 PASS, conservation check PASSED (task_total: 755→760, signal_total: 38 stable), atomic rename applied ✓
- Post-apply jq confirms: all 5 tasks added to backlog with correct status/priority/zone/depends_on ✓
- Handoff files staged in docs/handoffs/ (5 files created and committed) ✓
- git commit: chore(pm/RUNIDLE-DECOMP) — 6 files changed, 408 insertions ✓

**DECISION JOURNAL:**
- **Task decomposition rationale:** Root cause is structural (predicate (d) is unreachable due to no closeout producer). Fix has two parts: (1) redesign predicate logic to be meaningful (check dispatchable work not array length), (2) filter out stale sprints so predicate doesn't wait forever for a missing closeout. Task 1 (audit) unblocks tasks 2-3 in parallel because they both need to understand the current state. Tasks 2-3 are independent and can run in parallel; both feed into task 4 (test). Task 5 is post-landing verification, can start after 2-3-4 ship.
- **Guardrail 1 compliance:** No new active_sprints[] row created. All 5 tasks backlog-tracked, will be dispatch-routed to dev-* zone specialists or developer by router/dev-team per normal flow.
- **SPIKE contextualization:** SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP (READY, P1, M) is the parent survey that found this instance (instance 9, dead gate class). Handoff notes cite the SPIKE so developer understands this is one data point in a broader pattern.
- **Verification gate ownership:** Task 5 owns the re-measurement of AC-3 (consecutive_run_idle > 0 + 7-day drain-commit count). This is a VERIFICATION-only task, not a code change; it documents whether the fix actually worked empirically.

**NEXT STEPS:**
1. **Router dispatch (conditional on SPIKE running first):** Router may defer these tasks until SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP has run, so developer context includes the class findings.
2. **Tier 1 (Task 1):** Developer runs audit, produces findings doc (blocking tasks 2-3).
3. **Tier 2 (Tasks 2-3 parallel):** Developer implements predicate redesign and staleness filter independently.
4. **Tier 3 (Task 4):** Developer writes test case after 2-3 land.
5. **Tier 4 (Task 5, post-landing):** After all 4 ship, observe and measure for 7 days.

---

## c334 GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS · WIP Slot Freeing (Out-of-Band PO Triage) · 2026-08-08T00:00Z

**MANDATE:** Out-of-band escalation from po's triage (agent a99c6a355831656ef): Parent row GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS was occupying 1 of 2 WIP slots despite already being decomposed (head.status=idle, 2026-08-07T03:30Z). WIP cap blocked 2 P0 CI-sizelint rows from dispatch; CI-RED-83bb4359 and CI-RED-a20cbf56 stalled for >23h.

**VERIFICATION (independent):**
- Row in_progress[0]: id=GUARD-NOTEBOOK-CONCURRENT-EDIT-COLLISION-DATA-LOSS, status=IN_PROGRESS, claimed_by=null
- Children verified: 3 live on board (FIX-NOTEBOOK-WRITE-TASK-KIND-ENUM-EXTENSION, FIX-NOTEBOOK-AUTO-PRUNE-STALENESS-GUARD, FIX-NOTEBOOK-WRITE-AC7-SKILL, all in backlog/blocked states)
- Note: po's claim of "zero children" was factually incorrect; row has 3 children. Core issue remains valid: parent decomposition complete but still occupying WIP slot.
- WIP usage before: 2/2 (GUARD row + FIX-CHEF-USDVND row), blocking ready[] dispatch

**ACTION TAKEN:**
- Relocated GUARD row from task_board.in_progress[] to task_board.backlog[]
- Status IN_PROGRESS → BLOCKED, added blocked_reason: "Parent decomposition task completed: 3 children decomposed as of 2026-08-07T03:30Z (head.status=idle). Row occupied WIP unnecessarily. Reactivate after children complete."
- orch-apply.sh: Stage 0+1 PASS, conservation check OK (task_total: 767→767, stable)

**BOARD STATE AFTER:**
- in_progress: 1 actual IN_PROGRESS (FIX-CHEF-USDVND row, claimed by dev-team), WIP capacity freed (1/2)
- ready[0:1]: 2 P0 CI-sizelint rows now dispatchable (FIX-CI-SIZELINT-CHECKFOREIGNFLOWGAP-*, FIX-CI-SIZELINT-COORDINATIONSTORE-*)
- backlog: +1 row (GUARD-NOTEBOOK row, status=BLOCKED), conservation verified

**NEXT STEP:** Dispatch the 2 freed P0 CI rows to dev-mcp-server per normal PM flow (both in same zone, parallel-dispatchable).

---

## Archive

Cycles c320 (BA-PREDICTION-EVIDENCE-REVIVAL, 2026-07-01), c319 (EVENING_SUMMARY, 2026-06-21), c327 (P1-MOMENTUM-RS, 2026-06-30), c318 (ARCH-AUTO-PUSH, 2026-06-18), c317 (OHLCV-WRITER, 2026-06-17), c316 (ERRAUDIT-W2, 2026-06-16), and c315 (BCTC-ENRICH, 2026-06-15) archived — see git history (this file, pre-2026-07-10T20:00Z) and commits 675891163d...5d121989 / c06b09a1 for full sprint records. Older cycles (c299–c189) archived to [pm-20260611.md](../../archive/notebooks/pm-20260611.md).
