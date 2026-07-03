# Router board claim: FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION backlog[] -> in_progress[] (BACKLOG->IN_PROGRESS).
# Fresh FIX minted by PO (report 3417, commit 6ffadcfe) — two-file root cause: cowork-match-slots.js
# console.log diagnostics (L203/L228) + cowork-tick-preflight.sh:204 `2>&1` folding stderr into the
# jq-parsed buffer. Cadence-skip ticks yield false ERROR verdicts, defeating the token-economy preflight.
# Direct dispatch to developer (cross-service scripts zone — outside all dev-* zones). WIP gate: refuse if
# in_progress already >= 2. Sets head so the dispatch is unambiguous on resume.
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute — router claim before dev spawn).
# Usage: jq --arg now "$NOW" -f scripts/router-claim-fix-cowork-preflight-stdout.jq docs/data/orch/orch-state.json
(.task_board.backlog | map(select(.id=="FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION"))[0]) as $t
| if $t == null then error("FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION not in backlog[] — refuse to claim")
  elif ($t.status != "BACKLOG") then error("row status \($t.status) != BACKLOG — refuse to claim")
  elif ((.task_board.in_progress | length) >= 2) then error("WIP limit: in_progress already \(.task_board.in_progress | length) — refuse")
  else . end
| .task_board.in_progress += [
    ($t + {
        status: "IN_PROGRESS",
        claimed_at: $now,
        claimed_by: "router",
        next_agent: "developer",
        dispatch_note: "Dispatched developer \($now). Two-file fix per PO triage (report 3417): (1) scripts/agents-flow/cowork-match-slots.js L203+L228 console.log->console.error (stdout stays JSON-only, sole emit at L267); (2) scripts/agents-flow/cowork-tick-preflight.sh:204 capture stdout(JSON) separately from stderr while preserving the exit!=0 error-message path (L206) that surfaces matcher stderr in the verdict. AC: cadence-skip/suppress tick yields clean verdict JSON (no false ERROR non-JSON output); diagnostics still visible on stderr; exit!=0 path still surfaces matcher stderr."
       })
  ]
| .task_board.backlog |= map(select(.id != "FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION"))
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION",
    next_agent: "developer",
    note: "FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION claimed — developer fixes matcher stdout pollution + preflight 2>&1 capture. Promote -> review on green verify + commit."
  }
