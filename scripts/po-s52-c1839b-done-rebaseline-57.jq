# po-s52-c1839b-done-rebaseline-57.jq
# Scoped batched board write for sprint CI-RED-RECONCILE (active_sprints[24]):
#  (1) flip FIX-CI-C1839b-REWRITE-STALE-ASSERTS REVIEW -> DONE (DJ-GATE-1, po-S52)
#  (2) rebaseline ci_absolute 59 -> 57 (sha b106a1ec) + sync long_tail_triage_policy.absolute mirror
#  (3) append TRIAGE-CI-C1282a-DATA-FRESHNESS-PROD-VS-TEST (SPIKE, owner architect)
# Touches ONLY active_sprints[24] + task_board._updated_*. signal_queue/_schema/_ssot untouched.
# Pointer: docs/policies/dev-standards.md § Script Persistence (po scoped orch writes).

.task_board.active_sprints[24].tasks |= (map(
  if .id == "FIX-CI-C1839b-REWRITE-STALE-ASSERTS" then
    .status = "DONE"
    | .closed_at = "2026-06-09T16:36:41Z"
    | .closed_by = "po-S52-DJ-GATE-1"
    | .actual_result = "GATE PASSED (router raw-verified, run 27220454437, job 80373590001, sha b106a1ec). Task 1839b per-victim exact-prefix fail 4 markers (2 unique tests AC-3+AC-4) -> 0 CLEAN; absolute native_fail 59 -> 57 (-2), pass 11702 -> 11704 (+2), errors 0, tests/skip unchanged (11803/42). No regression: Task 1173=0, Task 235=0. arch-S19 rewrite-stale verdict PROVEN (genuine 1ms assertion failures vs evolved FS; AC-3 .bak-filter harden + market-watcher.md.bak git-rm + AC-4 stale-scaffold rewrite; coverage RETAINED/STRENGTHENED, zero prod edit). Commit b106a1ec kept + pushed by router."
  else . end
))

# (2) REBASELINE ci_absolute (single SSOT)
| .task_board.active_sprints[24].ci_absolute = {
    "native_fail": 57,
    "native_errors": 0,
    "fail_plus_error": 57,
    "tests": 11803,
    "pass": 11704,
    "skip": 42,
    "sha": "b106a1ec",
    "run_id": "27220454437",
    "bun_job_id": "80373590001",
    "supersedes": "59 (326cf35a)",
    "delta_vs_prior": "-2 (59 -> 57) — CLEAN absolute improvement matching the 2 unique Task 1839b tests (AC-3 + AC-4). FIX-CI-C1839b-REWRITE-STALE-ASSERTS rewrote 2 stale assertions in one file + git-rm'd a non-test trash file (market-watcher.md.bak), NOT a mock.module reorder, so the -2 landed exactly on the cured tests. Both the named per-victim Task 1839b 4->0 flip AND the absolute agree. New band ~57 +/-3 (floor ~54).",
    "updated_at": "2026-06-09T16:36:41Z",
    "updated_by": "po-S52"
  }

# (2-mirror) sync long_tail_triage_policy.absolute
| .task_board.active_sprints[24].long_tail_triage_policy.absolute = "57 (sha b106a1ec, run 27220454437, job 80373590001)"
| .task_board.active_sprints[24].long_tail_triage_policy.updated_by = "po-S52"
| .task_board.active_sprints[24].long_tail_triage_policy.updated_at = "2026-06-09T16:36:41Z"

# (3) APPEND next-lever TRIAGE SPIKE (architect-first prod-vs-test)
| .task_board.active_sprints[24].tasks += [{
    "id": "TRIAGE-CI-C1282a-DATA-FRESHNESS-PROD-VS-TEST",
    "type": "SPIKE",
    "owner": "architect",
    "status": "TODO",
    "mode": "spike",
    "timebox": 120,
    "size": "S",
    "zone": "apps/mcp-server/src/__tests__/",
    "priority": "high",
    "sprint": "CI-RED-RECONCILE",
    "depends": [],
    "title": "TRIAGE Task 1282a detectDataFreshnessBreach TC-1/TC-2 — prod-vs-test (REWRITE vs REMOVE vs prod-FIX) on the fresh 57-run dominant cluster",
    "question": "On the fresh 57-absolute run (27220454437, job 80373590001), Task 1282a is co-dominant at 4 fail-markers = 2 unique tests: detectDataFreshnessBreach() TC-1 (HIGH breach on stale price age>threshold) + TC-2 (CRITICAL breach age>1.5x threshold), BOTH at 1.00ms (genuine assertion failures, NOT transport-hang, NOT mock.module contamination). Classify per /goal REMOVE-obsolete clause: is detectDataFreshnessBreach() prod still present + correct (=> REWRITE the 2 stale asserts to match live behavior, retain coverage), or is the prod seam gone/superseded (=> REMOVE the obsolete tests), or is there a genuine prod defect (=> prod-FIX)? Produce the verdict + a single atomic scoped fix spec (file_list, exact AC edits or rm) the router can hand to dev.",
    "evidence_bar": "FULL-CI-ORDERED-REPRO required (NOT a 2-file local repro — 3 false-positive local repros earlier this sprint arch-S14/S15/S16). Ground the verdict in the raw 80373590001 CI log fingerprint (1.00ms genuine-assertion, zero mock.module, no InMemoryTransport stall). Projected absolute on cure: native_fail 57 -> 55.",
    "co_dominant_peer": "Task 1792 (4 markers = 2 unique tests: Conviction signal debounce DB-backed, ~98ms/64ms — DB/timer class, NOT 1ms genuine-assert). Tied at 4. 1282a chosen first as the cleaner 1ms rewrite-stale candidate matching the proven 1839b/1173 cure pattern; Task 1792 queued as the next lever after 1282a.",
    "remaining_57_distribution": "Per-prefix fail tally on run 27220454437: Task 1792=4, Task 1282a=4 (co-dominant), then 2s long tail: 1879a, 1793, 1503, 1416b, 1352a, 1336, 1331a, 1328e, 1309, 1100 (2 each). Cured classes drained: telegram-mock contamination, MCP-transport-hang (1124/1129/1134/1173), rewrite-stale (1839b). Cluster-6 schema-drift PARKED.",
    "spec_brief_target": "docs/architecture-briefs/2026-06-09-ci-c1282a-data-freshness-triage.md",
    "primary_gate_proof": "Triage deliverable = router-verifiable verdict doc + fix spec; the eventual FIX gate proof will be Task 1282a per-victim exact-prefix (fail) 4 -> 0 on the next full-CI run (jitter-robust), projected absolute 57 -> 55.",
    "baseline_pass": "57 (native_fail, sha b106a1ec, run 27220454437, job 80373590001)",
    "created_at": "2026-06-09T16:36:41Z",
    "created_by": "po-S52"
  }]

# board meta bump (scoped, no whole-object rewrite)
| .task_board._updated_at = "2026-06-09T16:36:41Z"
| .task_board._updated_by = "po-S52"
| .task_board.active_sprints[24]._updated_by = "po-S52"
