# PO triage 2026-08-23T11:57Z — INPUT 3 + INPUT 4 (CI RED, structural).
# Promotes the cowork-fire routing-gap row into the single UMBRELLA work row
# covering ALL 4 currently/recently-unrouted Pipeline-A types, moves it
# backlog[] -> ready[] (status BACKLOG -> READY in the SAME write,
# CANONICAL:SSOT-STATUSFLIP-LANEMOVE), and makes the 3 satellite rows
# dispatchable (next_agent was null on all 3 = undispatchable by every picker).
# No 5th tracker minted — satellites stay in backlog[] purely as the guard's
# own per-type dedup anchors (mint_routing_gap_row scans backlog+ready+
# in_progress+review+qa; removing them would make the guard re-mint next run).
def NOW: "2026-08-23T11:57:00Z";
def UMBRELLA: "FIX-SIGNAL-TYPE-ROUTING-GAP-cowork-fire";
def SATELLITES: ["FIX-SIGNAL-TYPE-ROUTING-GAP-flow-actuator-fix",
                 "FIX-SIGNAL-TYPE-ROUTING-GAP-system-issue",
                 "FIX-SIGNAL-TYPE-ROUTING-GAP-sprint-registry-unresolved-journal-ids"];

(.task_board.backlog | map(select(.id == UMBRELLA)) | .[0]) as $u
| .task_board.backlog |= map(select(.id != UMBRELLA))
| .task_board.ready |= (. + [ $u
    + { status: "READY",
        priority: "P0",
        owner: "agent-father",
        next_agent: "agent-father",
        zone: "docs/agents/po/flow/",
        size: "S",
        files: ["docs/agents/po/flow/triage-signals.md"],
        baseline_pass: "bash scripts/audits/guard-signal-type-coverage.sh --check exits 0 against docs/data/orch/orch-state.json",
        umbrella_scope: ["cowork-fire","flow_actuator_fix","system-issue","sprint_registry_unresolved_journal_ids"],
        updated_at: NOW,
        updated_by: "po/triage-20260823T1157Z",
        po_manual_dispatch_flagged_at: NOW,
        po_manual_dispatch_flagged_by: "po (Step 1 triage — dev-team tick 11:37Z)",
        po_manual_dispatch_class: "DRS-STRANDED-OFF-ALLOWLIST",
        po_umbrella_note: ("[po/triage 2026-08-23T11:57Z] PROMOTED TO UMBRELLA + BATCH-FOLDED, backlog[]->ready[], P1->P0, owner po->agent-father. SCOPE IS NOW ALL FOUR Pipeline-A types, not just cowork-fire: cowork-fire, flow_actuator_fix, system-issue, sprint_registry_unresolved_journal_ids. Add one Pipeline-A routing-table row per type to docs/agents/po/flow/triage-signals.md (the section headed \"For each signal in `pendingSignals[]` (Pipeline A):\"). "
          + "OWNERSHIP EVIDENCE, not assumption: the IDENTICAL defect was fixed on this exact file this morning by agent-father under TASK-PO-TRIAGE-SIGNALS-DOC-CORRECTION (owner=agent-father, zone=docs/agents/po/flow/, commit 735dfa815 at 08:54Z, which added the tactical Pipeline-B audit-handoff row and reproduced guard PASS post-edit). agent-father/init.md commit_zone.allowed includes docs/agents/. PO's own commit surface (po/flow/main.md commit-mutex own_paths) is notebook + decision-journal + orch-state.json ONLY and does not include its own flow docs — which is why PO routes this rather than editing it, consistent with the disposition PO already recorded on this row at 10:33Z. "
          + "WHY THIS NEEDS MANUAL/BATCH DISPATCH: agent-father is OFF the DRS ratified allowlist [architect,ba,pm,po,agents-architect], so no automated lane can pick this up — it is folded into PO's 2026-08-23T11:57Z BATCH for router manual dispatch. That is the mechanism that has kept CI red all day despite the row existing since 09:25Z. "
          + "CI EVIDENCE: run 32637153628 / HEAD 4b6f60eaab9dfdba0dc24f2bdd1f76dd829af697, job signal-type-coverage-guard exit 1. Live guard re-run by PO this tick against a fixture copy: FAIL — unrouted Pipeline-A types [\"flow_actuator_fix\",\"sprint_registry_unresolved_journal_ids\",\"system-issue\"] (cowork-fire absent from the array only because a prior tick cleared it; the cowork cron re-appends it). "
          + "ARTIFICIAL-GREEN WARNING (repeated deliberately — this is the 2nd tick it applies): guard-signal-type-coverage.sh reads Pipeline-A live types from .dev_team_idle_chain.pending_triage_inbox[] in orch-state.json. PO's own Step 0-SIG inbox CLEAR runs at the END of this same tick and empties that array, so the very next CI run can report PASS with the routing table STILL unfixed. That green is an artifact of draining the guard's input, not evidence of a fix; the next emitter tick re-appends and CI goes red again. Cf. feedback_devteam_drain_step_can_itself_turn_signal_type_guard_red. THE ONLY VALID GATE IS THE AC: four matching table rows must exist in triage-signals.md's Pipeline-A section. "
          + "OUT OF SCOPE for agent-father (do NOT attempt, hand back via RETURN): the mint-template defect in scripts/audits/guard-signal-type-coverage.sh:249-250 — scripts/ is outside agent-father's commit_zone and it is already scoped on TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY (review[], next_agent=dev-mcp-server).")
      } ])
| .task_board.backlog |= map(
    if (.id as $i | SATELLITES | index($i)) then
      . + { next_agent: "agent-father",
            owner: "agent-father",
            priority: "P0",
            folded_into: UMBRELLA,
            updated_at: NOW,
            updated_by: "po/triage-20260823T1157Z",
            po_fold_note: ("[po/triage 2026-08-23T11:57Z] DISPATCHABILITY FIX + FOLD. This row was auto-filed by scripts/audits/guard-signal-type-coverage.sh with next_agent UNSET and no priority, which no dispatch lane resolves — the 2nd/3rd/4th live instance of that mint-template defect (tracked on TASK-DEV-MCP-SIGNAL-TYPE-REGISTRY, review[], next_agent=dev-mcp-server, redispatch_count=1). Hand-correcting the template's output is NOT the fix and PO is not re-minting a tracker for it. "
              + "This row is retained in backlog[] ONLY as the guard's own per-type dedup anchor (mint_routing_gap_row dedups on dedup_key across backlog+ready+in_progress+review+qa; deleting it makes the guard re-mint an identical row on the next red run). The actual WORK is folded into " + UMBRELLA + " (ready[], P0, next_agent=agent-father), which now carries all four unrouted Pipeline-A types in one scope. Close this row when that umbrella lands — do not dispatch it independently.")
          }
    else . end)
