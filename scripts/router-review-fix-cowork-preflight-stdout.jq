# Router board flip: FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION in_progress[] -> review[] (IN_PROGRESS->REVIEW).
# Developer completed the two-file fix (commit 27f9a6ade) + decision journal (643f000ab); router RAW-verified
# transcript (tool histogram, forbidden grep CLEAN), commit scope (exactly the 2 files), stub-harness evidence
# (stdout-pure JSON, stderr diagnostics, exit!=0 path surfaces matcher stderr), DJ-GATE-1 journal markers.
# Resets .head to idle so the next tick's Step 0b sees a free slot.
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute — router promote on green verify).
# Usage: jq --arg now "$NOW" -f scripts/router-review-fix-cowork-preflight-stdout.jq docs/data/orch/orch-state.json
(.task_board.in_progress | map(select(.id=="FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION"))[0]) as $t
| if $t == null then error("FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION not in in_progress[] — refuse to flip")
  elif ($t.status != "IN_PROGRESS") then error("row status \($t.status) != IN_PROGRESS — refuse to flip")
  else . end
| .task_board.review += [
    ($t + {
        status: "REVIEW",
        promoted_at: $now,
        promoted_by: "router",
        next_agent: "qa",
        review_note: "Developer done: commit 27f9a6ade (cowork-match-slots.js L203/L228 console.log->console.error; cowork-tick-preflight.sh Step 6 splits stdout/stderr via mktemp, exit!=0 path surfaces stderr in detail) + journal 643f000ab. Router RAW-verified: histogram+forbidden CLEAN, 16/16 matcher tests, 20/20 preflight tests, stub harnesses prove stdout-pure JSON on cadence-skip/suppress + ERROR detail carries matcher stderr. Live preflight NOT run by developer (claims real election locks) — first real cadence-skip tick is the field verification."
       })
  ]
| .task_board.in_progress |= map(select(.id != "FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION"))
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: null,
    next_agent: null,
    note: "FIX-COWORK-PREFLIGHT-DIAGNOSTIC-STDOUT-POLLUTION promoted to review (commit 27f9a6ade, RAW-verified). Head idle — free slot for next tick."
  }
