# Mint FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP -> backlog[]
#
# Discovered 2026-07-10 during routine dev-team cron tick: BACKLOG-HYGIENE-
# VERIFY-PRUNE-SWEEP's own ready[] row sat open for hours after all 11 of its
# decomposed children reached DONE_VERIFIED. Root cause: docs/agents/dev-team/
# flow/main.md Step 0b only revisits a task when .head.status=="in_progress" --
# once PM decomposes an epic and head resets to idle, the parent row is never
# automatically re-checked. Router only caught this by chance during manual
# board inspection, not via any flow step or signal.
#
# Distinct from the already-shipped FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE
# (which stops premature BOUNDED-1 auto-pickup of a wrapper row) -- this gap
# is at the opposite end of the lifecycle: closing a wrapper once its children
# are legitimately done.
#
# GUARD: refuse if a row with this ID already exists anywhere on the board.
#
# Usage: jq --arg now "$NOW" \
#          -f scripts/router-mint-fix-devteam-epic-wrapper-autoclose-sweep.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
($ARGS.named.now) as $now
| ([.task_board[] | arrays[]? | select(type=="object" and .id=="FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP")] | length) as $exists
| if $exists > 0 then error("FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP already exists on board — refuse duplicate mint")
  else . end
| .task_board.backlog = ((.task_board.backlog // []) + [{
    id: "FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP",
    size: "S",
    status: "BACKLOG",
    title: "dev-team post-cycle: sweep ready[]/in_progress[] for epic-wrapper rows whose children are all terminal, auto-dispatch pm for closeout",
    type: "FIX",
    zone: "docs/agents/dev-team/flow/",
    owner: "developer",
    priority: "normal",
    depends: [],
    note: "Discovered 2026-07-10: BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP's ready[] row (owner=pm) sat open for hours after all 11 children (D0/D0B/D1/D2.5/D3/D4/D5+SHG-2..5) reached DONE_VERIFIED. Root cause: Step 0b pipeline-resume in docs/agents/dev-team/flow/main.md only fires on .head.status==\"in_progress\" -- once PM decomposes an epic and head resets to idle, nothing re-checks whether the parent's children are now all terminal. Router caught this only by chance during manual board inspection. Fix: add a Step 4 (post-cycle) candidate that scans ready[]/in_progress[] for rows with non-null/non-empty children[] where every child (board-live or archived) is terminal (DONE/DONE_VERIFIED/CANCELLED/DEFERRED/SKIPPED), and auto-dispatches the row's own next_agent/owner (usually pm) for closeout instead of relying on router luck. Distinct from already-shipped FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE (that one prevents premature BOUNDED-1 pickup of a wrapper row; this one closes a wrapper once legitimately done). See feedback_epic_wrapper_closeout_gap_no_auto_revisit memory.",
    created_at: $now,
    created_by: "router",
    source: "router discovery during routine board inspection, 2026-07-10 dev-team cron tick"
  }])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "router"
