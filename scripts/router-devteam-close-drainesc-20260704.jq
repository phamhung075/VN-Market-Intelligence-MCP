# Router closeout: FIX-DRAINESC-SEVERITY-RECURRENCE-GATE sprint COMPLETE (qa PASS, RAW-verified).
# qa (a65f4348) verdict PASS; Task Report reports/TASK_REPORT_IMPL-DRAIN-GATE-SEVERITY-RECURRENCE.md.
# Router scrub-amended the qa commit fb003949a -> c1620c558 to remove a session-UUID-prefix leak that
# appeared inside a *documented* `grep -c '<coord-uuid>'` scan example (report content + qa author +
# Claude-Session trailer preserved; only the report file touched). Router independently re-ran
# scripts/agents-flow/drain-signals.test.js -> 11/11 PASS exit 0.
# Moves BOTH IMPL-DRAIN-GATE + parent FIX-DRAINESC in_progress[] -> done_verified[]; sets .head idle (WIP=0).
# Guards: error unless BOTH are in in_progress[] (idempotent -- re-run after success aborts, no write). SF-1 released after apply.
# Usage: NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; jq --arg now "$NOW" --arg qacommit "c1620c558" -f scripts/router-devteam-close-drainesc-20260704.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(type=="object" and .id=="IMPL-DRAIN-GATE-SEVERITY-RECURRENCE"))[0]) as $impl
| (.task_board.in_progress | map(select(type=="object" and .id=="FIX-DRAINESC-SEVERITY-RECURRENCE-GATE"))[0]) as $parent
| if $impl == null then error("IMPL-DRAIN-GATE-SEVERITY-RECURRENCE not in in_progress[] -- refuse to close")
  elif $parent == null then error("FIX-DRAINESC-SEVERITY-RECURRENCE-GATE not in in_progress[] -- refuse to close")
  else . end
| .task_board.done_verified += [
    (($impl | del(.next_agent)) + {
      status: "DONE_VERIFIED",
      owner: "router",
      qa_verdict: "PASS",
      verifying_agent: "qa",
      verified_by: "router",
      qa_report: "reports/TASK_REPORT_IMPL-DRAIN-GATE-SEVERITY-RECURRENCE.md",
      qa_commit: $qacommit,
      dev_commits: ["bf0b2cc9a", "9419e644d"],
      closed_at: $now,
      closed_by: "router",
      close_note: "qa PASS all 9 ACs (drain-signals.test.js 11/11 re-run by router+qa; GATE-A severity floor >=HIGH + GATE-B two-tier recurrence dedup; type==array guard load-bearing on 3 live string-.related rows; dev commits touched no orch-state/signals.db; byte-identical no-arg drain-mode; count==1 never suppressed; injection-safe; no ticker hardcode). Router scrub-amended qa report fb003949a->c1620c558 (removed session-UUID-prefix leak in a documented grep example)."
    }),
    (($parent | del(.next_agent)) + {
      status: "DONE_VERIFIED",
      owner: "router",
      qa_verdict: "PASS",
      verifying_agent: "qa",
      verified_by: "router",
      child_impl: "IMPL-DRAIN-GATE-SEVERITY-RECURRENCE",
      qa_report: "reports/TASK_REPORT_IMPL-DRAIN-GATE-SEVERITY-RECURRENCE.md",
      qa_commit: $qacommit,
      closed_at: $now,
      closed_by: "router",
      close_note: "Sprint umbrella closed with child IMPL-DRAIN-GATE-SEVERITY-RECURRENCE (qa PASS). Cures recurring per-cycle Opus esc-deep-dive waste (MBB fired 4x byte-identical): GATE-A severity floor + GATE-B two-tier board-row-exists/count>=2 recurrence dedup now gate the Opus spawn in drain-esc-dispatch.md."
    })
  ]
| .task_board.in_progress |= map(select(type != "object" or (.id != "IMPL-DRAIN-GATE-SEVERITY-RECURRENCE" and .id != "FIX-DRAINESC-SEVERITY-RECURRENCE-GATE")))
| .head = {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    next_action: "FIX-DRAINESC-SEVERITY-RECURRENCE-GATE sprint COMPLETE -- IMPL + parent both done_verified (qa PASS, report c1620c558; router re-ran 11/11). SF-1 released; next dev-team cron tick starts a fresh cycle and drains the deferred backlog (MBB batch-reflow repair_task_request + drain-esc follow-ups routed to PO). W5 deploy-gate rows in review[] remain user-owned.",
    updated_at: $now,
    updated_by: "router",
    note: ($now + ": FIX-DRAINESC sprint closed by router. Both rows in_progress->done_verified; head idle; WIP=0. SF-1 to be released.")
  }
