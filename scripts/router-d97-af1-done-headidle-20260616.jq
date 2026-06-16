# Router 2026-06-16 — dev-team tick 21:27Z: record AF-1-LEADER-LOCK-BACKSTOP-DEFER verified completion.
#
# agent-father shipped the leader-lock.md Backstop-Window Defer Gate (commit 69babf46) — Root A of the
# gatherer manual×cloud double-fire umbrella. Router RAW-verified first-hand (it executes this exact flow):
#   - error/timeout-keyed branch (lock UNREADABLE) at top of the task_claim probe, BEFORE the claimed-check;
#   - generic window BOUNDARY_HOURS={0,4,8,12,16,20} (the "0 */4" gatherer cadence) AND minute<15 → DEFER one tick;
#   - existing WIN/OWN-HELD/ORPHAN-RECOVERY/PEER-HELD rebind-steal chain byte-stable;
#   - DJ-GATE-1 satisfied (decisions/sprint-FE-PAGE-REORG-agent-father.md task-id AF-1); file 113L == size-justif.
#
# done (NOT done_verified): a defer gate is only LIVE-confirmable when the probe actually errors inside a
# backstop window (rare timing coincidence, not observable now) → done_verified WITHHELD, set explicit false.
# This also resets .head idle so the next pipeline-resume does NOT re-dispatch head=dispatch/AF-1.
#
# GUARD: refuse unless AF-1 uniquely in ready[] (count==1). CONSERVATION: 6-lane total UNCHANGED (ready -1, done +1).
# Atomic temp->mv applied by caller.
# Usage: jq --arg now "$NOW" -f scripts/router-d97-af1-done-headidle-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "AF-1-LEADER-LOCK-BACKSTOP-DEFER" as $id
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done,.task_board.done_verified,.task_board.backlog]|map(length)|add) as $before6
| ([ .task_board.ready[] | select((.id? // .task_id? // "")==$id) ] | length) as $cnt
| if ($cnt != 1) then error("GUARD: AF-1 not uniquely in ready[] — count=" + ($cnt|tostring)) else . end
| ([ .task_board.ready[] | select((.id? // .task_id? // "")==$id)
      | . + {status:"DONE", next_agent:null, done_at:$now, done_by:"router", done_verified:false,
             live_verify:"LIVE RAW (router, flow executor): leader-lock.md commit 69babf46 — error/timeout-keyed defer branch before claimed-check; BOUNDARY_HOURS={0,4,8,12,16,20} AND minute<15 → DEFER one tick (generic, no slot literals); rebind-steal WIN/OWN-HELD/ORPHAN-RECOVERY/PEER-HELD chain byte-stable; 113L==size-justif; DJ-GATE-1 ok. done_verified WITHHELD — defer gate only confirmable on a live unreadable-lock-in-backstop-window tick." } ]) as $promoted
| .task_board.ready = [ .task_board.ready[] | select((.id? // .task_id? // "")!=$id) ]
| .task_board.done = ( $promoted + .task_board.done )
| .head = {
    status:"idle", updated_at:$now, updated_by:"dev-team",
    active_task_id:null, next_agent:null,
    note:("ROUTER " + $now + " — AF-1-LEADER-LOCK-BACKSTOP-DEFER DONE (router RAW-verified, commit 69babf46): leader-lock.md backstop-window defer gate ships gatherer-doublefire Root A. done_verified withheld (live unreadable-lock-in-window observation pending). DMS-1+DMS-2 still HELD behind ARCH-CRON-SCHEDULER-RELIABILITY. PUSH held (PO out-of-band).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done,.task_board.done_verified,.task_board.backlog]|map(length)|add) != $before6)
    then error("CONSERVATION FAIL: 6-lane total changed on AF-1 done move") else . end
