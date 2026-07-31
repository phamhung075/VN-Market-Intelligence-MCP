# dev-team-dispatch-stockprice-fix-and-reroute-deploylane-20260731-0016.jq
# Two independent board mutations from po's daily-triage BATCH return (tick 2026-07-31T00:07Z,
# agent ad07eb7eff1e14529, decision-journal STEP dev-team-S16 continuation).
#
# RAW-verified by dev-team before applying, not trusted on po's report alone:
#   - apps/stock-price/pkg/infrastructure/fetchers.go:240 and :303 both confirmed to use
#     `file:%s?mode=ro&_journal_mode=WAL&_busy_timeout=5000` by direct read.
#   - apps/stock-price/pkg/infrastructure/foreign_flow_repository.go:33-36 and
#     room_event_repository.go:32-35 confirmed to already carry the identical fix (mode=ro
#     dropped) with the identical explanatory comment po quoted -- this is a 2-of-4-call-sites
#     partial fix, not a novel finding, by direct read of both sibling files.
#   - FIX-MCP-SERVER-DEPLOY-LANE-STALL-REBUILD-REQUIRED-INERT's po_evidence_correction and
#     po_ac_recheck fields confirmed already written onto the live row by po itself (po has
#     its own Bash + gateway grant and applied orch-apply.sh directly during triage) --
#     dev-team is only re-routing next_agent here, not re-deriving po's evidence correction.
#
# (1) FIX-STOCKPRICE-PRICEHISTORY-RO-WAL-DSN-SWALLOWED-EMPTY-KILLS-KINHDICH: backlog -> in_progress.
#     WIP=1/2 confirmed before this write (dev-mcp-server on FIX-SIGNAL-OUTCOMES-...); .head is
#     deliberately NOT touched -- .head is the single-slot idle-fallthrough resume pointer used
#     only by BOUNDED-1/SLS/RLC/DRS (docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md),
#     not a general WIP tracker for every Step-3 tier dispatch (execute-tier.md Phase 3.5's own
#     claim/spawn/release pattern never writes .head either -- confirmed by direct read).
#
# (2) FIX-MCP-SERVER-DEPLOY-LANE-STALL-REBUILD-REQUIRED-INERT: next_agent ops -> qa. po's own
#     correction fields already document the row's cited evidence as falsified (wrong container
#     path) and its own baseline_pass as already met live -- routing to qa for verify-then-close
#     per po's explicit recommendation, not dispatching to ops as originally written.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); \
#   jq --arg now "$NOW" -f scripts/dev-team-dispatch-stockprice-fix-and-reroute-deploylane-20260731-0016.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

($now) as $now
| "dev-team/po-batch-dispatch-20260731T0016Z" as $src
| "FIX-STOCKPRICE-PRICEHISTORY-RO-WAL-DSN-SWALLOWED-EMPTY-KILLS-KINHDICH" as $id1
| "FIX-MCP-SERVER-DEPLOY-LANE-STALL-REBUILD-REQUIRED-INERT" as $id2

# ── (1) Move id1: backlog[] -> in_progress[], status BACKLOG -> IN_PROGRESS ──
| (.task_board.backlog[] | select(.id == $id1)) as $picked
| .task_board.backlog = [ .task_board.backlog[] | select(.id != $id1) ]
| .task_board.in_progress = ([ $picked
    | .status = "IN_PROGRESS"
    | .updated_at = $now
    | .updated_by = $src
    | .claimed_at = $now
    | .claimed_by = "dev-team (step 3 direct dispatch)"
  ] + .task_board.in_progress)

# ── (2) Re-route id2: next_agent ops -> qa, verify-then-close per po's own correction ──
| .task_board.backlog = [ .task_board.backlog[]
    | if .id == $id2 then
        .next_agent = "qa"
        | .updated_at = $now
        | .updated_by = $src
        | .dev_team_route_note = "Re-routed ops->qa 2026-07-31T00:16Z per po_evidence_correction + po_ac_recheck (both already on this row): cited runtime-verified proof was falsified (wrong container path), baseline_pass condition 1 (container_vm_headroom_mb numeric) already met live. qa should verify-then-close-or-rescope, not dispatch as a fix against the falsified evidence. Residual worth checking: degraded currently null not false; the '9 rows carry rebuild_required' count needs re-verification at source; general deploy-lane claim is weaker than filed (stock-price image stale 16d but its 3 commits since are dead-code/test-only, no rebuild need demonstrated)."
      else . end
  ]

| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = $src
