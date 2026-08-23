# PO triage 2026-08-23T11:57Z — INPUT 5. FIX-QA-VC-... sat in in_progress[]
# with status=IN_PROGRESS + blocked_reason=null after agents-architect handed
# off cleanly, so wip_in_progress counted it (WIP=1) and BOUNDED-1's gate
# `[ "$WIP" -lt 1 ]` was false — one clean handoff disabled 1 of 6 rotation
# lanes. PO decision: lane-move OUT of in_progress[] (the terminal shape that
# actually frees the slot), status IN_PROGRESS -> READY in the SAME write
# (CANONICAL:SSOT-STATUSFLIP-LANEMOVE), routed to agent-father and folded into
# this tick's BATCH for router manual dispatch.
def NOW: "2026-08-23T11:57:00Z";
def ROW: "FIX-QA-VC-LANEMOVE-PROSE-ONLY-NO-ORCHAPPLY-ACTUATOR";
(.task_board.in_progress | map(select(.id == ROW)) | .[0]) as $r
| .task_board.in_progress |= map(select(.id != ROW))
| .task_board.ready |= (. + [ $r
    + { status: "READY",
        next_agent: "agent-father",
        owner: "agent-father",
        updated_at: NOW,
        updated_by: "po/triage-20260823T1157Z",
        po_manual_dispatch_flagged_at: NOW,
        po_manual_dispatch_flagged_by: "po (Step 1 triage — dev-team tick 11:37Z)",
        po_manual_dispatch_class: "DRS-STRANDED-OFF-ALLOWLIST",
        po_decision_20260823T1157Z: "PO DECISION (the row was next_agent=po awaiting exactly this). DISPATCH agent-father with the signal agents-architect already wrote: docs/signals/2026-08-23-qa-vc-lanemove-orchapply-actuator.json (carries copy-executable jq+orch-apply.sh patches for AC-1/AC-2 + the AC-3 self-verify shape). Design is complete; no new brief. Folded into PO's 2026-08-23T11:57Z BATCH. LANE-MOVE RATIONALE: left at status=IN_PROGRESS with blocked_reason=null it kept wip_in_progress=1, which made BOUNDED-1's `WIP -lt 1` gate false and silently disabled one of the six rotation lanes — measured live this tick, 4th instance of that pattern. The two correct terminal shapes for 'done, awaiting a PO decision' are lane-move out of in_progress[] OR status=BLOCKED with a populated blocked_reason; IN_PROGRESS+null frees nothing. Chose lane-move because the work IS dispatchable now. AC-4/AC-5 (scripts/ regression verifier + fixtures) remain OUT of agent-father's commit_zone — hand back via RETURN for a developer row, do not attempt.",
        po_dispatch_target: "agent-father",
        po_dispatch_intent: "edit",
        po_dispatch_signal: "docs/signals/2026-08-23-qa-vc-lanemove-orchapply-actuator.json"
      } ])
