# po-revert-peerindex-parent-unblock-20260728.jq
# SELF-CORRECTION, PO triage 2026-07-28T23:3xZ.
# Reverts mutation (2) of scripts/po-mint-ci-red-cdd5fa5a-buntest-20260728.jq, which
# moved FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD backlog/BLOCKED -> ready/READY with
# next_agent=architect. That unblock was WRONG on every premise it stated:
#   - It claimed "no PO decision was ever pending". False: the row carries
#     po_lane_disposition_20260721T1724, which parks it as a plan_only=true epic
#     WRAPPER ("This row now tracks, it does not dispatch"), with next_agent=po held
#     DELIBERATELY so PO can close it out once both children reach DONE_VERIFIED.
#   - It claimed the open call belongs to architect. False: architect already ruled on
#     2026-07-21 (architect_design_20260721T_LAYERED_WARN_DEFAULT — layered fix,
#     WARN-by-default disposition, blast-radius justified). Routing it back to architect
#     would have re-run a 7-day-old completed decision.
#   - It ignored decomposed_into = [..-HOOK, ..-SKILLS] (pm, 2026-07-21T17:20Z) and the
#     row's own po_disposition_20260728, written earlier TODAY, which explicitly reaffirms
#     "this row stays BLOCKED" because the dependency on ..-HOOK is legitimate.
# The real finding stands and moves to the child, where it belongs: ..-HOOK is
# ready/P0/next=developer/supervised and UNDISPATCHED since 2026-07-25, while the bug it
# prevents fired in production today against PO's own commit (forensics in the parent's
# po_disposition_20260728). Escalated via this tick's BATCH instead.
# Idempotent: guarded on the row currently being in ready[].
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/po-revert-peerindex-parent-unblock-20260728.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($now) as $now
| "FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD" as $gid
| ( [ .task_board.ready[]? | select(.id == $gid) ] | length ) as $inReady
| if $inReady == 0 then .
  else
    ( [ .task_board.ready[] | select(.id == $gid) ][0]
      | .status = "BLOCKED"
      | .next_agent = "po"
      | .updated_at = $now
      | .updated_by = "po-triage-20260728T2320Z"
      | del(.unblock_note)
      | del(.unblocked_at)
      | .po_correction_20260728T2335Z = "REVERTED an erroneous unblock made by this same PO tick ~10 minutes earlier. During the main.md pre-check for 'BLOCKED rows waiting on PO' this row surfaced with next_agent=po and blocked_reason=null/blocked_on=null/po_question=null, and PO read that null-triple as a stranded row with no real dependency, moved it to ready[] and re-routed it to architect. That was wrong: the null-triple is not evidence of a stranded row here, because this row's parked state is recorded in NAMED fields (plan_only, decomposed_into, po_lane_disposition_20260721T1724, po_disposition_20260728) rather than in the generic blocked_reason/blocked_on slots. Reverted to BLOCKED/backlog/next_agent=po, its correct state per the 07-21 lane disposition. LESSON (feedback_file_prior_art_check_before_minting_row / feedback_epic_wrapper_closeout_gap_no_auto_revisit): a BLOCKED row with an empty blocked_reason is not automatically a stranded row — read decomposed_into and the row's own dated disposition fields BEFORE concluding nothing is pending. What actually caught this was the PO notebook Carry-over line naming a '-HOOK'-suffixed sibling, which prompted the id-family scan that exposed the decomposition; the generic dedup scan run before minting did not, because it matched on the ci_red check_id only."
      | .po_reaffirm_block_20260728T2335Z = "Block REAFFIRMED, unchanged from the 19:5xZ disposition. The dependency on FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK is legitimate: a pre-commit hook is the only actuator that can bind the dev-*/qa/ba/pm/architect specialist population, which INV-GATEWAY-1 (.claude/skills/commit-mutex/SKILL.md:4-8) exempts from the mutex by design. This wrapper closes out when ..-HOOK and ..-SKILLS are both DONE_VERIFIED; ..-SKILLS is already DONE."
    ) as $grow
    | .task_board.ready = [ .task_board.ready[] | select(.id != $gid) ]
    | .task_board.backlog = (.task_board.backlog + [ $grow ])
  end

# Stamp the child with this tick's dispatch escalation (idempotent on the field).
| .task_board.ready = [ .task_board.ready[]
    | if .id == "FIX-COMMIT-PATH-PEER-INDEX-SWEEP-GUARD-HOOK"
         and (has("po_escalation_20260728T2335Z") | not) then
        . + {
          po_escalation_20260728T2335Z: "PO ESCALATION — 2nd consecutive tick, now carried in the BATCH. This row is P0, fully specified, and every prerequisite it needs already exists on disk: architecture brief docs/architecture-briefs/2026-07-21-commit-path-peer-index-sweep-guard.md (§4.1/§4.3), the architect's disposition ruling (WARN-by-default, opt-in GIT_SWEEP_GUARD_MODE=reject per migrated call site), the install path scripts/git-hooks/install.sh with scripts/git-hooks/pre-push as the proven precedent, and the verification harness scripts/audits/verify-commit-sweep-discriminator.sh (router-run 2026-07-21, VERDICT PASS on git 2.49.0). The ONLY missing artifact is scripts/git-hooks/pre-commit itself. It has sat READY/undispatched since 2026-07-25 and the bug it prevents fired in production on 2026-07-28T19:5xZ, sweeping five PO-owned paths into commit 09ae11440 under a dev-mcp-server message. Re-run the harness before implementing — a FAIL means the brief's GIT_INDEX_FILE discriminator premise no longer holds on the installed git. Dispatch EXPLICITLY as a supervised subtask carrying the brief, never as an unattended zone-detect Tier-3 pickup (parent's architect design, final clause).",
          updated_at: $now,
          updated_by: "po-triage-20260728T2320Z"
        }
      else . end
  ]
