# po-S44: FIX-CI-C1485 REVIEW->DONE (1328e-scoped) + rebaseline ci_absolute 68->63 + sync long_tail.absolute
# Scoped to active_sprints[24] (CI-RED-RECONCILE) ONLY. No whole-object rewrite.
.task_board.active_sprints[24] |= (
  # (A) flip FIX-CI-C1485 REVIEW->DONE (scoped to 1328e cure); add terminal_reason + note
  (.tasks |= map(
    if .id == "FIX-CI-C1485-TELEGRAM-MOCK-RESTORE" then
      .status = "DONE"
      | .terminal_reason = "GATE PASSED on PRIMARY: Task 1328e 10 fail -> 0 fail (jitter-robust per-victim exact-prefix tally, run 27211911171, job 80342965730, sha 5e7c9b5c). arch-S15 1485-second-contaminator cure (file-bottom afterAll registry-restore) PROVEN for 1328e. DONE scoped to the 1328e cure ONLY."
      | .gate_run_id = "27211911171"
      | .gate_bun_job_id = "80342965730"
      | .gate_sha = "5e7c9b5c"
      | .closed_at = "2026-06-09T14:20:00Z"
      | .closed_by = "po-S44"
      | .note_235_not_cured = "PREDICTED co-victim Task 235 DID NOT FLIP on full CI (stays 6 fail -> 6 fail). The dev 2-file local joint-pass (1485+235) was a FALSE POSITIVE (same mode that disproved arch-S14). 235 is NOT cured by this task; carried as a SEPARATE open lever needing its own full-CI architect-first triage. NOT a regression (6 before, 6 now). This DONE does NOT claim 235 cured."
    else . end
  ))
  # (B) rebaseline ci_absolute 68 -> 63
  | .ci_absolute = {
      "native_fail": 63,
      "native_errors": 0,
      "fail_plus_error": 63,
      "tests": 11803,
      "pass": 11698,
      "skip": 42,
      "sha": "5e7c9b5c",
      "run_id": "27211911171",
      "bun_job_id": "80342965730",
      "supersedes": "68 (sha 7040cfb6, run 27207225757, job 80326149577)",
      "delta_vs_prior": "-5 (68->63) — FIX-CI-C1485-TELEGRAM-MOCK-RESTORE C5-CURE TELEGRAM REGISTRY RESTORE: file-bottom afterAll in the leaking 1485 test re-installs the cache-busted real telegram module into the process-global ESM registry, stopping the `notifyTelegramAlert: async () => ({ok:true})` stub from poisoning downstream files. Authoritative jitter-robust signal = named Task 1328e cluster 10 fail->0 fail (unambiguous, per-victim exact-prefix tally). Projected -10 but landed -5: the +5-vs-projection is NOT regression — adding an afterAll to file pos 89 reorders the bun ESM-cache mock.module() contamination graph, shifting jitter on OTHER unrelated tests beyond the +/-3 band; the named per-victim flip is the authoritative gate. PREDICTED co-victim Task 235 did NOT flip (stays 6) — separate open lever, NOT cured. New band ~63 +/-3 (floor ~60).",
      "updated_at": "2026-06-09T14:20:00Z",
      "updated_by": "po-S44"
    }
  # (C) sync long_tail_triage_policy.absolute -> 63
  | .long_tail_triage_policy.absolute = "63 (sha 5e7c9b5c, run 27211911171, job 80342965730 — SUPERSEDES 68/7040cfb6)"
  | .long_tail_triage_policy.updated_at = "2026-06-09T14:20:00Z"
  | .long_tail_triage_policy.updated_by = "po-S44"
)
