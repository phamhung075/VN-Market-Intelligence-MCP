# po-S55: BATCH1 + BATCH0 REVIEW->DONE + REBASELINE ci_absolute 55->42 (skip 45 waypoint)
# Scoped to task_board.active_sprints[24] only. Merges ci_absolute (preserves siblings),
# does NOT touch root signal_queue, _schema, _ssot. Flow-doc pointer: docs/agents/po/flow/main.md
# (commit-mutex board-write). One-shot transform consumed by po-S55 batched board write.
.task_board.active_sprints[24].tasks |= map(
  if .id == "BATCH1-CI-C-TH-TRANSPORT-HANG-REWRITE" then
    .status = "DONE"
    | .closed_by = "po-S55"
    | .actual_result = "GATE PASSED (ci-batch1-gate-result-54b09df2-20260609T1747Z): 3 transport-hang victims (MSG-1-market-foreign-flow, RAPID-A-get-company-profile-tool, RAPID-H-insider-lookback) rewritten to direct _registeredTools invocation (no MCP InMemoryTransport); all 0-fail in CI run 27224701657; clean additive -10 (native_fail 55->45, pass 11706->11716, fail-delta==pass-delta); zero it() removed, tsc clean."
  elif .id == "BATCH0-CI-C-DV-DELIBERATE-VIOLATION-CLEANUP" then
    .status = "DONE"
    | .closed_by = "po-S55"
    | .actual_result = "GATE PASSED (ci-batch0-gate-result-e1ee78b9-20260609T1758Z; task_under_test alias BATCH0-CI-DELIBERATE-VIOLATION-RECONCILE): 6 victim anchors 0-fail in CI run 27225351774. Mixed class: 1331a TEST-2 REMOVED-OBSOLETE (alert-engine Go-only, sibling TEST-1 retained), DWF-is-trading-day AC-P0-3-6 it->it.failing (genuine deliberate-violation, 12 boundary siblings green), DWF-coordination-phase2 DV-P2-4 config-drift rewrite to split SSOT slot-claim.md/leader-lock.md. Clean -3 (native_fail 45->42, pass 11716->11717, tests 11803->11801 = 2 removed obsolete it()s); errors 0; obsolete-only removals with named protecting siblings."
  else . end
)
| .task_board.active_sprints[24].ci_absolute = (
    .task_board.active_sprints[24].ci_absolute + {
      native_fail: 42,
      native_errors: 0,
      fail_plus_error: 42,
      tests: 11801,
      pass: 11717,
      skip: 42,
      sha: "e1ee78b9",
      run_id: "27225351774",
      bun_job_id: "80390917327",
      supersedes: "55 (63d53931)",
      updated_at: $now_iso,
      updated_by: "po-S55"
    }
  )
| .task_board.active_sprints[24].long_tail_triage_policy.absolute = "42 (sha e1ee78b9, run 27225351774, job 80390917327)"
| .task_board.active_sprints[24].long_tail_triage_policy.band = "~42 +/-3 (floor ~39)"
| .task_board.active_sprints[24].long_tail_triage_policy.updated_at = $now_iso
| .task_board.active_sprints[24].long_tail_triage_policy.updated_by = "po-S55"
| .task_board._updated_at = $now_iso
| .task_board._updated_by = "po-S55"
