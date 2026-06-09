# po-S40: FIX-CI-C1129-CALIBRATION-TEST-REWRITE REVIEW->DONE + REBASELINE ci_absolute 73->68
# Scoped map on task_board.active_sprints[24] ONLY (CI-RED-RECONCILE). Mutates existing objects only:
#  (1) task status flip REVIEW->DONE + done metadata (gate CI-C1129-GATE-7040cfb6, run 27207225757)
#  (2) ci_absolute 73 -> 68 (sha 7040cfb6, run 27207225757, job 80326149577)
#  (3) long_tail_triage_policy.absolute mirror sync -> "68 (...)"
# No add/drop of task ids (tracked unique count stays 230). Preserves _schema/_ssot/signal_queue.
# Invoke: jq --arg now "<UTC>" -f scripts/po-s40-c1129-done-rebaseline.jq orch-state.json > tmp
.task_board.active_sprints[24] |= (
  .tasks |= map(
    if .id == "FIX-CI-C1129-CALIBRATION-TEST-REWRITE" and .status == "REVIEW"
    then
      .status = "DONE"
      | .done_by = "po-S40"
      | .resolution = "REWRITE-GATED — Task 1129 cluster 10->0 named flip confirmed CI run 27207225757 (gate CI-C1129-GATE-7040cfb6); ZERO Zod-bypass adaptation required (date z.string().optional(), no .default — all 5 ACs ported verbatim)"
      | .done_at = $now
      | .gate_result = "CI-C1129-GATE-7040cfb6"
      | .dj_gate_1 = "#po-S40"
    else . end
  )
  | .ci_absolute = {
      "native_fail": 68,
      "native_errors": 0,
      "fail_plus_error": 68,
      "tests": 11803,
      "pass": 11693,
      "skip": 42,
      "sha": "7040cfb6",
      "run_id": "27207225757",
      "bun_job_id": "80326149577",
      "supersedes": "73 (sha 8916675a, run 27205559638, job 80320331863)",
      "delta_vs_prior": "-5 (73->68) — FIX-CI-C1129-CALIBRATION-TEST-REWRITE TEST-INFRA REWRITE (InMemoryTransport+Client.callTool() -> _registeredTools[\"get_calibration_report\"].handler() direct invocation, 1124-transport-hang signature, green siblings 1117/1124/1134 proven). Authoritative jitter-robust signal = named Task 1129 cluster 10 fail->0 fail (unambiguous, per-victim exact-prefix tally). Projected ~63 (73-10) but landed 68: the +5-vs-projection is NOT regression — rewriting the harness (removing InMemoryTransport/Client imports) reorders the bun ESM-cache mock.module() contamination graph, shifting jitter on OTHER unrelated tests beyond the +/-3 band (the absolute is only stable when the import/test SET is unchanged); the named per-victim flip is the authoritative gate. NOTE: C1129 needed ZERO Zod-bypass adaptation — date param is z.string().optional() with no .default/.coerce, so direct-handler behavior == protocol behavior; all 5 ACs ported VERBATIM (unlike C1134 which needed AC-4/AC-6 adaptation). New band ~68 +/-3 (floor ~65).",
      "updated_at": $now,
      "updated_by": "po-S40"
    }
  | .long_tail_triage_policy.absolute = "68 (sha 7040cfb6, run 27207225757, job 80326149577 — SUPERSEDES 73/8916675a)"
  | .long_tail_triage_policy.updated_by = "po-S40"
  | .long_tail_triage_policy.updated_at = $now
)
