# BA board flip: FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS in_progress[] -> backlog[] (spec complete, PLAN-ONLY).
# BA wrote the decomposition spec (docs/handoffs/FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS-BA-spec.md, 7 FRs +
# 6 edge cases + DDD mapping) rather than minting child rows, per ba/flow/main.md Step 5's anti-dup-row precedent.
# Zero PO blockers this cycle. next_agent -> architect (technical design + candidate ruling). supervised/plan_only
# PRESERVED (do not clear — this row's supervised gate exists specifically to block auto-pickup; deliberate
# router/po dispatch of architect is unaffected). Resets .head to idle for the next deliberate dispatch.
# Usage: jq --arg now "$NOW" -f scripts/ba-fix-cowork-dispatch-router-intent-mutex-bypass-spec-complete.jq docs/data/orch/orch-state.json
(.task_board.in_progress | map(select(.id=="FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS"))[0]) as $t
| if $t == null then error("FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS not in in_progress[] — refuse to flip")
  elif ($t.status != "IN_PROGRESS") then error("row status \($t.status) != IN_PROGRESS — refuse to flip")
  else . end
| .task_board.backlog += [
    ($t + {
        status: "BACKLOG",
        next_agent: "architect",
        ba_spec_complete: true,
        ba_handoff: "docs/handoffs/FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS-BA-spec.md",
        ba_completed_at: $now,
        updated_at: $now,
        note: ($t.note + "\n\n[ba " + $now + " SPEC COMPLETE — PLAN-ONLY, zero PO blockers] Confirmed the 4 literal task_id formats live (intent:<agent>:<intent-key> / cron:cowork:<TICK> / cowork-slot:<slot_id> / published:<slot_id>:<period>) — disjoint keyspaces, task_claim is a no-op mutex across paths by construction. 7 FRs + 6 edge cases in ba_handoff: cowork-slot-agent recognition (cowork-schedule.json SSOT), intent-key->slot_id resolution (ambiguous for 8/9 multi-slot agents), 2 named collision-check candidates (read-probe vs shared-namespace) narrowed to both needing to gate on published:<slot_id>:<period> since cowork-slot:<slot_id> alone is released seconds after spawn and cannot anchor the fix, symmetric log+telegram+EXIT reuse, CLAUDE.md/SKILL.md lockstep-update requirement (pattern duplicated inline in both), live reproduction-harness requirement. Did not mint child board rows -- updated this same parent row per ba/flow/main.md Step 5 anti-dup-row precedent. NEXT: architect -- rule on candidate A vs B + multi-slot resolution rule.")
       })
  ]
| .task_board.in_progress |= map(select(.id != "FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS"))
| .task_board._updated_at = $now
| .task_board._updated_by = "ba"
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "ba",
    active_task_id: null,
    next_agent: null,
    next_action: "FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS BA spec complete (zero PO blockers) -> backlog[], next_agent=architect. supervised:true holds it from BOUNDED-1 auto-pickup -- dispatch architect deliberately via router/po.",
    note: "FIX-COWORK-DISPATCH-ROUTER-INTENT-MUTEX-BYPASS moved to backlog[] with ba_handoff spec. Head idle -- free slot for next tick."
  }
