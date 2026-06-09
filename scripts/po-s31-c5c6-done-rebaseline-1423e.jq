# po-S31 batched board write: C5 DONE + C6 DONE + ci_absolute rebaseline 135->102 + open Task-1423e cluster
# Single atomic jq pass over docs/data/orch/orch-state.json. Pointer: docs/agents/po/flow/main.md (decision-journal + commit-mutex).
# Owned by po. Targets ONLY active_sprints[24] (CI-RED-RECONCILE). Preserves _schema=v3 _ssot=true.
.task_board.active_sprints[24].tasks |= (
  map(
    if .id == "FIX-CI-C5-UNMOCKED-HTTP-FETCHES" then
      .status = "DONE"
      | .resolution = "DONE"
      | .done_by = "po-S31"
      | .done_at = "2026-06-09T10:20:00Z"
      | .dj_gate_1 = "sprint-CI-RED-RECONCILE-po.md#po-S31"
      | .gate_result = "CI-C5-GATE-fff91143 PASSED — native 135->102 (-33, beyond +/-3 band) AND all 4 named victims flipped fail->pass individually (Task028 9->0, Task025 7->0, Task1423a 6->0, Task1487 3->0); fix=DI-seam (removed file-top mock.module() from 083+123, added _test* injection seam to analysis.ts), commit fff91143 pushed"
    elif .id == "FIX-CI-C6-SSOT-WATCHLIST-SECTOR-DRIFT" then
      .status = "DONE"
      | .resolution = "DONE"
      | .done_by = "po-S31"
      | .done_at = "2026-06-09T10:20:00Z"
      | .dj_gate_1 = "sprint-CI-RED-RECONCILE-po.md#po-S31"
      | .gate_result = "CI-C6-GATE-37bb2e7d PASSED — named 1031 SECTOR_PEERS DGC assertion flipped fail->pass (domain other->chemicals) across baseline job 80278819016 vs C6 job 80294081419; stale-test REWRITE to match prod SSOT; commit 37bb2e7d pushed"
    else . end
  )
  + [
    {
      "id": "FIX-CI-1423E-PREEXISTING-CLUSTER",
      "type": "FIX",
      "owner": "architect",
      "status": "TODO",
      "size": "M",
      "zone": "apps/mcp-server/src/__tests__/",
      "priority": "medium",
      "sprint": "CI-RED-RECONCILE",
      "depends": [],
      "blocked_by": [],
      "root_cause": "UNKNOWN — architect-first prod-vs-test triage required",
      "title": "Task 1423e — 22 pre-existing CI fails (byte-stable, NOT a C5 victim) — architect-first prod-vs-test triage",
      "note": "Surfaced during C5 gate disambiguation (signal docs/signals/ci-c5-gate-result-fff91143-20260609T1015Z.json). A naive grep -F 'Task 1423' over-matched 22 fails — those are ALL Task 1423e, a SEPARATE pre-existing cluster present in BOTH the 135 baseline (job 80278819016) AND the 102 C5 run (job 80297590558), byte-stable, zero C5 impact (the real C5 victim was Task 1423a 6->0, distinct prefix). Root cause UNKNOWN — do NOT guess. ARCHITECT-FIRST triage per /goal REMOVE-obsolete clause + assertion-logic escalation rule: confirm prod-vs-test BEFORE any dev fix — (a) prod correct + test stale -> REWRITE, or (b) prod broken -> FIX, or (c) test obsolete -> REMOVE. Gate later vs the NEW 102 band (~102 +/-3, floor ~99), NOT the retired 135 band.",
      "baseline_pass": "102 native fail+error absolute (102 fail + 0 err / Ran 11816, sha fff91143, run 27198910454, bun job 80297590558) — NEW band ~102 +/-3, floor ~99",
      "created_at": "2026-06-09T10:20:00Z",
      "created_by": "po-S31"
    }
  ]
)
| .task_board.active_sprints[24].ci_absolute = {
    "native_fail": 102,
    "native_errors": 0,
    "fail_plus_error": 102,
    "tests": 11816,
    "pass": 11672,
    "skip": 42,
    "sha": "fff91143",
    "run_id": "27198910454",
    "bun_job_id": "80297590558",
    "supersedes": "135 (sha 3663bd12, run 27193376550, job 80278819016)",
    "delta_vs_prior": "-33 (135->102) — C5 DI-seam fix; far beyond +/-3 jitter band, unambiguous; all 4 named victims flipped individually (Task028 9->0, Task025 7->0, Task1423a 6->0, Task1487 3->0); zero regression; tests unchanged 11816 (no add/remove). New band ~102 +/-3 (floor ~99).",
    "updated_at": "2026-06-09T10:20:00Z",
    "updated_by": "po-S31"
  }
| .task_board.active_sprints[24].long_tail_triage_policy.absolute = "102 (sha fff91143, run 27198910454, job 80297590558 — SUPERSEDES 135/3663bd12)"
| .task_board.active_sprints[24].long_tail_triage_policy.updated_by = "po-S31"
| .task_board.active_sprints[24].long_tail_triage_policy.updated_at = "2026-06-09T10:20:00Z"
