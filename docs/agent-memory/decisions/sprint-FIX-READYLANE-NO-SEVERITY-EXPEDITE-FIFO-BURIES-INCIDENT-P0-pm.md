# PM Decision Journal — FIX-READYLANE-NO-SEVERITY-EXPEDITE-FIFO-BURIES-INCIDENT-P0

## PM DECOMPOSITION — 2026-08-14T11:23Z (post-architect-design handoff, zone-split implementation rows minted)

**Context:** Architect completed design for incident-lane consumer (dedicated throughput mechanism to unblock starved P0 ready-lane rows). Parent task (cross-service/ zone) handed off to PM with design complete; PM decomposes the design into zone-split implementation tasks per established convention. Brief: `docs/architecture-briefs/2026-08-14-readylane-incident-lane-throughput.md`.

### 1. Decomposition Strategy — Zone-Split per `po_routing_ruling_20260721`

**Architect's Handoff (§5 of brief):**
Two zone-split implementation rows, hard sequenced:
1. `FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS` (developer: scripts/, no depends_on)
2. `FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW` (agent-father: docs/agents/dev-team/, depends_on SCRIPTS)

**Routing Precedent:** `po_routing_ruling_20260721` established that plain `scripts/` routes to `developer` zone, `docs/agents/` routes to `agent-father` zone, never mixed.

**Why Zone-Split Necessary Here:** Unlike QA-Drain's own analogous row (FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED, 2026-08-06 brief), this decomposition has a HARD dependency: MAINFLOW's call site `-f scripts/devteam-backlog-claim-incident-lane-consumer.jq` references a script file that does not exist at all until SCRIPTS ships. No backward-compatible fallback exists — intermediate state is not viable.

**Decision:** Follow the zone-split strategy verbatim. SCRIPTS is tier1 (ready now, developer), MAINFLOW is tier2 (depends_on tier1, agent-father, unblocks after SCRIPTS lands).

### 2. Tier Structure — Sequential Due to Hard Dependency

**Tier1 (ready now):** FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS
- No blockers, parallel-dispatchable
- 4-line additions to devteam-eligibility.jq (two new predicates: `is_po_expedited`, `incident_wip_in_progress`)
- NEW file: scripts/devteam-backlog-claim-incident-lane-consumer.jq (~50 lines, batch-claim script, priority-then-oldest-expedite-first sort)
- 2-line header-comment update to RLC (cross-reference only, no logic)
- 10–15 line fixture extension in satisfiability.sh

**Tier2 (after tier1):** FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW
- Hard depends_on SCRIPTS (file not existing blocks execution)
- 4 edits to main.md:
  1. Insert § Incident-Lane Consumer (25–30 lines, content-anchored at `<!-- jump:session-gate -->`, BEFORE SECONDARY-Drain)
  2. Update SECONDARY-Drain intro sentence (1 line)
  3. Add INCIDENT_CAP bullet to Invariants (2–3 lines)
  4. New Reusable Scripts bullet (1–2 lines)

**Why Sequential, Not Parallel:** MAINFLOW cannot execute in parallel with SCRIPTS because its jq invocation immediately references the script file by name. If SCRIPTS does not ship, MAINFLOW's build step (or runtime jq parse) will fail on a MISSING file error. This is not a coordination constraint (which parallelizes) — it is a **file-level runtime constraint** (sequential only). Brief explicitly flags this (§5): "Hard technical dependency here, not merely coordination hygiene."

### 3. Board State Mutations

**Before Decomposition:**
- `in_progress[] contains FIX-READYLANE-NO-SEVERITY-EXPEDITE-FIFO-BURIES-INCIDENT-P0 (status=IN_PROGRESS, owner=architect, next_agent=pm)`
- ready[] += 0 (no new rows yet)
- .head = {status=active, active_task_id=FIX-READYLANE-..., next_agent=pm, ...}

**Applied Transformation (single atomic orch-apply.sh write):**
1. `.task_board.ready += [SCRIPTS_ROW, MAINFLOW_ROW]` (two new TODO rows)
2. `.task_board.done += [READYLANE parent row (status=DONE, closed_at stamped)]`
3. `.task_board.in_progress |= filter out READYLANE parent`
4. `.head = {status=idle, active_task_id=null, next_agent=null, ...}` (non-closeout reset per Step 4c — parent task done, sprint legitimately IN_PROGRESS, leaving .head stale risks re-spawn of already-decomposed row)

**After Decomposition:**
- `in_progress[] no longer contains READYLANE`
- `done[] now contains READYLANE (DONE, closed_at stamped)`
- `ready[] += 2 (SCRIPTS=TODO, MAINFLOW=TODO)`
- `WIP count: -1 (parent removed, 2 new TODO added but TODO is not in_progress, so net WIP unchanged)`
- `.head = idle (active_task_id=null)` — ready for router to dispatch next tier

**Validator Check:** orch-apply.sh Stage 1 (lanes coherence) PASS — no task in wrong lane status. Stage 1g (MISSING deps) non-fatal 16 pre-existing, no new introduced.

### 4. Handoff Files Created

1. `docs/handoffs/FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS.md` — AC-1 through AC-6:
   - Two predicates added to eligibility.jq
   - New script file created
   - RLC header comment updated
   - Satisfiability fixtures extended
   - All jq scripts validate
   - Commit credits architect brief

2. `docs/handoffs/FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW.md` — AC-1 through AC-5:
   - New § Incident-Lane Consumer inserted at content-anchored `<!-- jump:session-gate -->` (placement critical)
   - SECONDARY-Drain intro updated
   - INCIDENT_CAP added to Invariants
   - New Reusable Scripts bullet
   - Commit credits architect brief

### 5. Critical Design Constraints Preserved

**From Brief §4:**
- `INCIDENT_CAP=2` — hard-bounded budget, prevents ILC from saturating like a 4th priority tier (scope requirement §0)
- `po_expedited_at` field REUSED (not a new `expedite_at`/`incident_ref` field) — extends already-live PO convention, keeps implementation minimal
- `.head` write uses existing `$head_free` conditional guard (same as RLC/SLS/DRS/QA-Drain) — no new write pattern, collision-freedom proof intact
- `claimed_by: "dev-team (incident-lane consumer)"` — distinct stamp from RLC's `"dev-team (ready-lane consumer)"`, used for budget filtering
- Batch-claim (N rows per invocation) + unconditional Session-Gate→Step-1 invocation (not rotation-gated) — directly addresses the 1-per-6-ticks throughput ceiling

**Placement Priority:** ILC BEFORE SECONDARY-Drain BEFORE QA-Drain (P0 incident dispatch outranks review/QA triage for shared .head slot each tick when both idle).

### 6. Live Measurement Precedent

**QA-Drain Analogy (2026-08-06 brief, same pattern):**
- Problem: review[] PRIMARY lane starving (226 rows, 13-day latency, rotation-gated single-row claim)
- Solution: independent `QA_CAP=10` budget + batch-claim + unconditional Session-Gate→Step-1 invocation
- **Measured Result (live, verified this cycle):** review[] PRIMARY down to 56 rows over 8 days, ~4x throughput improvement despite continuous developer inflow into same queue.

**Expected Outcome (ILC carries identical pattern):** incident-queue depth (rows with `po_expedited_at` sitting in ready[]) should drop measurably over following week. No measurement at architect stage; measurement begins once MAINFLOW ships.

### 7. Sequencing & Unblock Conditions

**Tier1 Ready:** SCRIPTS has zero blockers — ready for immediate developer dispatch.

**Tier2 Unblock:** MAINFLOW unblocks when SCRIPTS lands AND ships (commits merged to main). No intermediate "SCRIPTS pending QA approval" gate — developer's own commit closure is sufficient trigger.

**Next Steps:**
- Router dispatches SCRIPTS (tier1) to developer specialist immediately
- Developer executes SCRIPTS, commits to main
- Router then dispatches MAINFLOW (tier2, now unblocked) to agent-father specialist
- Both tasks should land and be live before any other dev-team flow edits that might conflict with the Session-Gate→Step-1 insertion point

**Decision Rationale:**
- Architect designed the mechanism; PM's job is to break it into executable work per established zone-routing rules
- Zone-split is mandatory (routing convention), not optional
- Hard dependency is explicit in brief; captures the real runtime constraint (file does not exist until SCRIPTS ships)
- Tier structure preserves the prerequisite ordering (SCRIPTS before MAINFLOW)
- Board mutations are minimal (two new rows, one closure, one .head idle reset) — atomic single write, no intermediate states exposed
- Handoff files spell out AC clearly — developer and agent-father have complete specs for their respective rows

