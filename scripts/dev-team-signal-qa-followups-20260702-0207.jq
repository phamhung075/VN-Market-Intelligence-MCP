# Dev-team tick 2026-07-02T02:07Z — mint 2 signal rows to po for QA non-blocking follow-ups
# Source: qa worker a082a59635761cbb4 (FIX-BCTC-ANALYST-ESCALATION-DISPATCH-NO-BASH review), both PRE-EXISTING
# conditions outside that task's AC — PLAN-ONLY bridge per anomaly-task-bridge; po triages into backlog.
# Usage: jq --arg now "$NOW" -f scripts/dev-team-signal-qa-followups-20260702-0207.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: idempotent (skips any row id already present); signal_queue-scoped writes only.

def newrows($now): [
  {id: "qa-followup-signal-routing-rows-20260702",
   summary: "[qa-followup] drain-signals.md 0a-3 + po/triage-signals.md lack dedicated routing rows for types data-coverage-gap (to:ops) and deep_dive_result (to:po) — both fall to generic catch-all (log+skip+WORK). No silent loss, but no automated action. Add explicit routing rows.",
   severity: "INFO", status: "NEW", ts: $now,
   from: "dev-team/qa-gate", to: "po", type: "repair_task_request", payload_ref: null},
  {id: "qa-followup-stagelog-bash-nobash-agent-20260702",
   summary: "[qa-followup] docs/agents/bctc-analyst/flow/stage-log-notify.md lines ~39/45 contain bash blocks (date/wc/git add+commit) that the no-Bash bctc-analyst tool package cannot execute — latent defect predating 881e38f1. Convert to Read/Write/call_tool steps or reassign the commit stage.",
   severity: "INFO", status: "NEW", ts: $now,
   from: "dev-team/qa-gate", to: "po", type: "repair_task_request", payload_ref: null}
];

(.signal_queue.rows // [] | map(.id)) as $existing
| (newrows($now) | map(select(.id as $i | ($existing | index($i)) | not))) as $fresh
| if ($fresh | length) == 0 then .
  else
    .signal_queue.rows = ((.signal_queue.rows // []) + $fresh)
    | .signal_queue._updated_at = $now
    | .signal_queue._updated_by = "dev-team"
  end
