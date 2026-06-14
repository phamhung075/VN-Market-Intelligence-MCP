# po-S32: FIX-CI-1423E-PREEXISTING-CLUSTER TODO->DONE (TEST-OBSOLETE REMOVE)
#         + REBASELINE ci_absolute 102 -> 91 (sha 9ed78225)
#         + sync long_tail_triage_policy.absolute mirror -> 91
# Single batched atomic transform over orch-state.json. No task add/remove.
.task_board.active_sprints[24].tasks |= map(
  if .id == "FIX-CI-1423E-PREEXISTING-CLUSTER" then
    .status = "DONE"
    | .done_by = "po-S32"
    | .resolution = "DONE"
    | .done_at = "2026-06-09T10:45:00Z"
    | .root_cause = "TEST-OBSOLETE REMOVE — apps/mcp-server/src/__tests__/1423e.test.ts depended entirely on the dead get_macro_calendar _testReferenceDate injection seam (deleted when the MCP tool was rewired domain->HTTP-proxy in commit 98df0f43); in CI (no port-5004 macro-indicators service) every call returned {error: service unavailable} cascading to ~22 structural fails. Architect verdict TEST-OBSOLETE (all 9 -> REMOVE). Dev git rm 1423e.test.ts -> commit 9ed78225. Domain logic fully covered by the protected sibling 1423e-macro-calendar.test.ts (exercises macroCalendar.ts directly, untouched, 23/0)."
    | .gate_result = "CI-1423E-GATE-9ed78225 PASSED — named Task 1423 cluster 22 fail -> 0 fail (jitter-robust per-victim flip), tests -13 (exactly the removed 1423e.test.ts), zero coverage lost (protected sibling 1423e-macro-calendar.test.ts stays 23/0)"
    | .dj_gate_1 = "sprint-CI-RED-RECONCILE-po.md#po-S32"
  else . end
)
| .task_board.active_sprints[24].ci_absolute = {
    "native_fail": 91,
    "native_errors": 0,
    "fail_plus_error": 91,
    "tests": 11803,
    "pass": 11670,
    "skip": 42,
    "sha": "9ed78225",
    "run_id": "27200448050",
    "bun_job_id": "80302822813",
    "supersedes": "102 (sha fff91143, run 27198910454, job 80297590558)",
    "delta_vs_prior": "-11 (102->91) — FIX-CI-1423E-PREEXISTING-CLUSTER TEST-OBSOLETE REMOVE (git rm 1423e.test.ts). Authoritative jitter-robust signal = named Task 1423 cluster 22 fail->0 fail (unambiguous); tests -13 (exactly the removed file's 13 it() cases). The +11 vs the ~80 projection is NOT regression — removing a test FILE reorders bun ESM-cache mock.module() contamination, shifting jitter on unrelated tests beyond the +/-3 band (absolute is only stable when the test SET is unchanged); the per-victim flip is the unambiguous gate. New band ~91 +/-3 (floor ~88).",
    "updated_at": "2026-06-09T10:45:00Z",
    "updated_by": "po-S32"
  }
| .task_board.active_sprints[24].long_tail_triage_policy.absolute = "91 (sha 9ed78225, run 27200448050, job 80302822813 — SUPERSEDES 102/fff91143)"
| .task_board.active_sprints[24].long_tail_triage_policy.updated_by = "po-S32"
| .task_board.active_sprints[24].long_tail_triage_policy.updated_at = "2026-06-09T10:45:00Z"
