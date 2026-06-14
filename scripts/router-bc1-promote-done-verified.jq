# Router board mutation: BC-1 in_progress[] -> done[] as done_verified after the 03:00:45Z live-verify gate PASSED.
# Raw probe (router-run, 2026-06-14T03:26Z): uptime 4h08m (StartedAt 23:18:20Z), RestartCount=0, WAL=4,128,272B (3.94MB < 5MB).
# All three gate conditions met -> promote. Then set head in_progress/next_agent=pm to resume the architect->pm handoff
# (pm atomizes A-1 restart-cadence-alert + D-1 WAL>10MB-escalation from docs/architecture-briefs/2026-06-14-fix-mcp-crash-loop-writewal.md,
#  now UNBLOCKED since BC-1 passed). Pointer: docs/agents/dev-team/flow/main.md (Step 0b pipeline-resume / Step 3 execute).
# Usage: jq --arg now "$NOW" --arg started "$STARTED" --arg wal "$WAL" --arg img "$IMG" \
#        -f scripts/router-bc1-promote-done-verified.jq docs/data/orch/orch-state.json
(.task_board.in_progress | map(select(.id=="BC-1"))[0]) as $bc
| if $bc == null then error("BC-1 not in in_progress[]") else . end
| .task_board.done += [
    ($bc + {
      status: "done_verified",
      done_verified_at: $now,
      done_verified_by: "dev-team",
      live_verification_result: {
        gate_passed: true,
        observed_at: $now,
        uptime: "4h08m (container StartedAt \($started), deliberate force-recreate baseline — NOT a crash)",
        restart_count: 0,
        restart_count_verdict: "PASS — no auto-restart since BC-1 went live; old ~2h crash cadence shows ZERO recurrence over 4h+.",
        wal_bytes: ($wal|tonumber),
        wal_verdict: "PASS — \(($wal|tonumber)) B (3.94MB) < 5MB threshold. WAL bounded at the new wal_autocheckpoint=1000 (~4.1MB) ceiling vs old 16MB wedge — root fix b41070b7 (image f0c53f54) holding as designed.",
        running_image: $img,
        promoter_guard_satisfied: "Reopen-criteria were RestartCount>0 OR WAL>=5MB. Neither met -> legitimate done_verified, NOT a force-promote."
      }
    })
  ]
| .task_board.in_progress |= map(select(.id != "BC-1"))
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-MCP-CRASH-LOOP-WRITEWAL",
    next_agent: "pm"
  }
