# Dev-team tick 2026-07-02T01:07Z — flip FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT in_progress → review
# Developer a3afed9bb47749ad5 (commit f9e6f40d) RAW-verified by dispatcher:
#   - sprint_goal.entries 26 → 18; token census post-fix: OPEN x4, PLANNING x1, active x13 (zero drifted)
#   - all 8 evicted rows present in docs/data/orch/archive/2026-07.json .closed_sprint_goals[] with canonical status
#   - AC-2 Stage 1d guard live-proven: rejected dispatcher board write mid-fix (drifted data),
#     passed post-normalization (positive path) — plus fixture-only negative tests in commit
#   - root cause deeper than dispatched: orch-cold-evict.sh never scanned .sprint_goal.entries[]; now wired
# Usage: jq --arg now "$NOW" -f scripts/dev-team-flip-fix-sprint-goal-review-20260702-0107.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: idempotent (no-op if row absent from in_progress); lane-scoped writes only.

def fixid: "FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT";

([.task_board.in_progress[] | select(.id == fixid)]) as $rows
| if ($rows | length) == 0 then .
  else
    .task_board.in_progress |= map(select(.id != fixid))
    | .task_board.review += [($rows[0]
        + {status: "REVIEW",
           review_note: ("READY-FOR-QA " + $now + ": commit f9e6f40d. AC-1: entries 26->18, 8 tokens normalized, evicted to archive .closed_sprint_goals[] (RAW-verified). AC-2: Stage 1d write-time guard in orchStateSchema.ts checkSprintGoalStatusCanonical() + orch-validate.mjs, live-proven both paths; post-cycle.md 4.2 bloat-trigger extended to sprint_goal.entries. Scoped tests 108/108, tsc clean, shellcheck clean; full-suite 54 fails pre-existing (CI-RED-RECONCILE). REMAINING: server-side orchStateStore.ts parity rides next user-approved mcp-server rebuild.")})]
    | .task_board._updated_at = $now
    | .task_board._updated_by = "dev-team"
  end
