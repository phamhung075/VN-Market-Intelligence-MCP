# scripts/po-s152-a30-vmhwm-veto-escalate-gate-p0-scope.jq
#
# PO triage 2026-07-29T12:3xZ — companion to po-s151. Discharges the standing
# carry-over on docs/agent-memory/notebooks/po.md:23 ("A-30 row 5d+,
# recurring_bug_count=6, 8th carry -> escalate to user next tick"). This IS that tick.
#
# THE ROW: FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE (backlog, architect,
# supervised, recurring_bug_count=6, created 2026-07-25T12:54:33Z, carried 8 PO cycles).
#
# WHY IT STOPS BEING A CARRY-OVER AND BECOMES A GATE THIS TICK — a new fact, not a
# re-statement of the old one. po-s151 escalated FIX-AUDITOR-TIER1-A30-MEM-SINGLE-
# CONTAINER-SCOPE to P0 to route EVERY capped container into PLANE B's A-30 verdict
# logic. PO then read that logic end-to-end (docs/agents/system-auditor/flow/
# tier1-probe.md:159-177) instead of assuming it, and the two rows turn out to compose
# badly in a way neither row's own text anticipated:
#
#   clause 1  '[A-30] SKIP deep-probe' present  -> A-30 PASS, no emit
#   clause 3  parse verify-a30 JSON             -> verdict/reason/vm.{vmhwm_kb,vmrss_kb}
#   clause 4  ADDITIONAL VETO: verdict=="ESCALATE" AND vmhwm_kb > vmrss_kb -> PASS
#   clause 5  the actual severity map (OOMKilled -> CRITICAL, peak>97% -> CRITICAL, ...)
#
# clause 4 sits BETWEEN the evidence and the severity map and pre-empts all of it.
# VmHWM is the monotone high-water mark of VmRSS, so vmhwm > vmrss is true for any
# process not sitting exactly at its lifetime peak — as this row's own title already
# states, it "downgrades EVERY ESCALATE to PASS (including the OOMKilled CRITICAL
# branch, which it pre-empts by ordering)".
#
# CONSEQUENCE: widening PLANE B's scope while clause 4 stands produces a detector that
# looks at all 13 containers and still cannot escalate any of them. rag-service at
# 99.44% (PO-measured 2026-07-29T12:20:30Z, 4.3 MiB free) would reach clause 3, raise
# ESCALATE on the "peak >97%" branch, and be downgraded to PASS by clause 4 before
# clause 5 is ever consulted. That is occurrence #4 of the same false-pass shape,
# shipped BY the fix minted to stop it. This is the single most likely way the P0 gets
# closed while still being broken, so it is recorded as a hard gate on the P0's
# acceptance rather than left as an adjacent P1.
#
# MUTATIONS (in-place field edits only -> lane lengths byte-stable):
#   M1 FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE (backlog[])
#      P1->P0 + blocks[] + po_escalation_20260729T1231.
#      zone DELIBERATELY NOT TOUCHED (see note in M1 body).
#   M2 FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE (review[])
#      + po_veto_gate_20260729T1231 + blocked_by[] — its AC(1) is unreachable while
#      clause 4 stands.
#
# Idempotent: both mutations marker-guarded on their own po_* field -> re-run mutates 0.
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-s152-a30-vmhwm-veto-escalate-gate-p0-scope.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def escalate_veto($now):
  if (.po_escalation_20260729T1231 // null) != null then .
  else
    .priority = "P0"
    | .blocks = ["FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE"]
    | .updated_at = $now
    | .po_escalation_20260729T1231 =
        ("PO ESCALATION 2026-07-29T12:31Z — P1->P0. Discharges the standing 8th-cycle carry-over (po notebook L23). Scope, owner (architect), supervised flag and acceptance are ALL UNCHANGED — this row was already correctly specced; what was missing was a reason for anyone to reach it.\n\n"
       + "NEW FACT THIS TICK (not a re-statement of the 07-25 finding): po-s151 escalated FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE to P0 so that every capped container reaches PLANE B's A-30 verdict logic in tier1-probe.md. PO then read that logic end to end. clause 4 sits between the evidence (clause 3) and the severity map (clause 5) and pre-empts the entire map. So the P0 widening, shipped against clause 4 as it stands, yields a detector that inspects all 13 containers and can still only ever return PASS. rag-service at 99.44% / 4.3 MiB free (PO-measured 12:20:30Z) would raise ESCALATE on the 'peak >97%' branch at clause 5 and never get there. That is occurrence #4 of the same false-pass shape, delivered by the fix minted to end it. This row is therefore now a HARD GATE on another P0's acceptance, not an adjacent P1.\n\n"
       + "8 CARRIES IS ITSELF THE SIGNAL. recurring_bug_count=6, created 2026-07-25T12:54:33Z, carried by 8 consecutive PO cycles without an owner ever picking it up. It kept losing to rows with a visible symptom, because a detector that silently returns PASS has no symptom by construction — the failure mode and the invisibility have the SAME cause. That is a priority-mechanism defect, not a judgement call, and P0 is the correction.\n\n"
       + "ZONE DELIBERATELY NOT CORRECTED, flagged instead. This row says zone=cross-service/ while its actual subject is docs/agents/system-auditor/flow/tier1-probe.md — the same stale-zone shape po-s151 corrected on the scope row. NOT corrected here because on that row qa had already established the routing on the record (sprint-FIX-AUDITOR-A12A20A30-FP-REEMIT-CONVERGE-qa.md), and here no such finding exists. owner=architect is right for this row regardless: replacing a tautology with a real discriminator is a design decision, and the row's AC(1) is deliberately a discriminating-power test rather than a threshold prescription. Whoever routes this should expect architect to produce the predicate and agent-father to land it in the flow doc. Do NOT silently re-zone it without recording why.\n\n"
       + "DO NOT FOLD THIS INTO THE P0 SCOPE ROW. Different predicate, different clause, different owner, and folding would confound the evidence for each — the same reason the 2026-07-25 row explicitly held the absolute-headroom predicate out of its own scope, a call that was correct and was later delivered cleanly as FIX-AUDITOR-MEMACK-HEADROOM-FLOOR-AND-DEAD-TRACKEDBY. Sequence them, do not merge them.\n\n"
       + "READ-ONLY CONSTRAINTS: rag-service is at ~4 MiB headroom — `docker exec` against it is OFF THE TABLE (an exec allocates in its cgroup; that exact move SIGKILLed it at 2026-07-29T10:12Z). Host-side `docker stats`/`docker inspect` only. No stop/kill/rm/restart, no compose down/up. The 2026-07-25 samples this row's AC(1) replays against are already captured in its own root_cause — replay those, do not re-provoke the container to collect new ones.")
  end;

def gate_scope_row($now):
  if (.po_veto_gate_20260729T1231 // null) != null then .
  else
    .blocked_by = ["FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE"]
    | .updated_at = $now
    | .po_veto_gate_20260729T1231 =
        ("PO 2026-07-29T12:31Z — ACCEPTANCE GATE ADDED (companion to po_scope_amend_20260729T1222; that amendment stands unchanged). blocked_by=[FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE], escalated to P0 in the same pass.\n\n"
       + "THIS ROW'S AC(1) IS UNREACHABLE WHILE THAT ROW IS OPEN. AC(1) requires that with rag-service absent from the memory ack ledger the probe returns FAILURE and names rag-service. On PLANE A (scripts/agents-flow/auditor-tier1-probe.sh) that already passes and is CLOSED. On PLANE B — the half this row still owes, and the half that produces the operator-visible verdict — the path is tier1-probe.md clauses 1/3/4/5, and clause 4's `vmhwm_kb > vmrss_kb` veto downgrades EVERY ESCALATE to PASS before the severity map at clause 5 is consulted, including the OOMKilled CRITICAL branch. A per-container loop landed against that logic inspects all 13 containers and still emits nothing.\n\n"
       + "IMPLEMENTER INSTRUCTION, EXPLICIT: do NOT satisfy this row by editing clause 4 yourself. That predicate belongs to the blocked_by row, is architect-owned, supervised, and its AC(1) is a discriminating-power replay against three specific 2026-07-25 samples that this row does not carry. Widening scope here and quietly weakening the veto there in one pass would leave neither change with its own evidence. If you reach the point where the port is done and A-30 still cannot escalate, that is the CORRECT and expected state for this row — say so plainly in the close-out and route to the veto row; do not manufacture a green by touching clause 4.\n\n"
       + "WHY THIS GATE EXISTS AT ALL — it is the most likely way this P0 gets closed while still broken. The whole family's failure signature is a detector that returns PASS with no symptom; shipping a widened scope into a veto that cannot fail would produce exactly that, and it would be occurrence #4, delivered BY the fix minted to end the recurrence. Standing order from po_scope_amend_20260729T1222 applies here too: nothing in this family may be closed by making the detector quieter, and 'the probe ran clean' is not evidence when the clean is manufactured upstream of the severity map.")
  end;

.task_board.backlog =
  [ .task_board.backlog[]
    | if (type == "object" and .id == "FIX-AUDITOR-A30-VMHWM-VETO-TAUTOLOGY-FALSE-NEGATIVE")
      then escalate_veto($now) else . end ]
| .task_board.review =
  [ .task_board.review[]
    | if (type == "object" and .id == "FIX-AUDITOR-TIER1-A30-MEM-SINGLE-CONTAINER-SCOPE")
      then gate_scope_row($now) else . end ]
| ._updated_at = $now
| ._updated_by = "po/triage-20260729T1231-a30-veto-gate-escalation"
