# Router board dedup: QA moved D-1 to done[APPROVED] but left a stale IN_PROGRESS copy in in_progress[].
# Drop the stale in_progress[] D-1 copy so the board carries exactly ONE authoritative D-1 entry (done[]).
# GUARD: refuse unless D-1 is present in done[] with status APPROVED (never drop a live/un-approved task).
# Pure hygiene forward-roll; head already idle/next_agent=ops (untouched here).
# Pointer: docs/agents/dev-team/flow/main.md (Step 0b — router reconciles board duplication on pipeline forward).
# Usage: jq -f scripts/router-d1-dedup-inprogress.jq docs/data/orch/orch-state.json
(.task_board.done | map(select(.id=="D-1"))[0]) as $done
| if $done == null then error("D-1 not in done[] — refuse to drop in_progress copy")
  elif ($done.status != "APPROVED") then error("D-1 in done[] but status != APPROVED (got \($done.status)) — refuse")
  else . end
| .task_board.in_progress |= map(select(.id != "D-1"))
