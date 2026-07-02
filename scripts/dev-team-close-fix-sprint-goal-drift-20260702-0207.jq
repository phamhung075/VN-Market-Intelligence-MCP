# Dev-team tick 2026-07-02T02:07Z — close FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT review → done
# qa worker a7f04d04b4d8dcef2 verdict APPROVE, RAW-verified by dispatcher:
#   - journal docs/agent-memory/decisions/sprint-FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT-qa.md on disk
#   - no QA commits (HEAD still a439c529); orch-state untouched by QA (read-only jq/orch-validate runs)
#   - AC-1: scoped test 5/5 pass; live entries=15, tokens {OPEN x2, PLANNING x1, active x12} — dispatcher re-ran census, matches
#   - AC-2: Stage 1d negative path exit 2 on scratchpad fixture ("COMPLETE" rejected); positive path exit 0 on live SSOT
#   - AC-3: shellcheck orch-cold-evict.sh clean; AC-4: post-cycle.md 4.2 SPRINT_GOAL_TERMINAL_N wired
#   - tsc --noEmit clean; mock-guard --files PASS
# Usage: jq --arg now "$NOW" -f scripts/dev-team-close-fix-sprint-goal-drift-20260702-0207.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: idempotent (no-op if row absent from review); lane-scoped writes only.

def fixid: "FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT";

([.task_board.review[] | select(.id == fixid)]) as $rows
| if ($rows | length) == 0 then .
  else
    .task_board.review |= map(select(.id != fixid))
    | .task_board.done += [($rows[0]
        + {status: "DONE",
           completed_at: $now,
           completed_by: "qa",
           status_note: (($rows[0].review_note // $rows[0].status_note // "")
             + " | QA APPROVE " + $now + ": all 4 ACs RAW-verified (scoped tests 5/5, Stage 1d neg-path fixture exit 2 / pos-path exit 0, shellcheck clean, tsc clean, entries=15 zero drifted). REMAINING (tracked, not blocking): server-side orchStateStore.ts Stage-1d parity rides next user-approved mcp-server rebuild.")})]
    | .task_board._updated_at = $now
    | .task_board._updated_by = "dev-team"
  end
