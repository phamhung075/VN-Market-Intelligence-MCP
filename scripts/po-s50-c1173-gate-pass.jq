# po-S50 — CI-RED-RECONCILE batched board write after CI-C1173-GATE-326cf35a PASSED.
# Pointer: docs/agents/po/flow/main.md (PO board-write step). Run scoped on active_sprints[24] only.
# 3 mutations: (1) FIX-CI-C1173-REWRITE-TRANSPORT REVIEW->DONE, (2) REBASELINE ci_absolute 62->59,
# (3) OPEN FIX-CI-C1839b-TRIAGE (architect-first, TODO). + task_board _updated_* bump. No whole-object rewrite.
.task_board.active_sprints[24].tasks |= (
  map(
    if .id == "FIX-CI-C1173-REWRITE-TRANSPORT" then
      .status = "DONE"
      | .closed_by = "po-S50"
      | .gate_verified_at = "2026-06-09T16:00:00Z"
      | .terminal_reason = "GATE PASSED UNAMBIGUOUS — Task 1173 per-victim exact-prefix (fail) 6 -> 0 (3 unique tests, double-logged) on run 27218281159 / bun_job 80365846275 / sha 326cf35a. arch-S18 MCP-InMemoryTransport hook-timeout verdict PROVEN: rewriting AC-4/AC-5 to call exported prod handleGetLabelAccuracyReport(getDb(), since_days) directly (dropped makeMcpSetup InMemoryTransport+Client harness that stalled the ~5000ms afterEach client.close()) eliminated the stall. No prod change (calibrationTools.ts untouched)."
      | .gate_proof = "Task 1173 6 -> 0 (jitter-robust full-CI per-victim exact-prefix tally) AND clean absolute -3 (native_fail 62 -> 59, pass 11699 -> 11702, errors 0). UNLIKE the telegram-stub SWEEP (jitter-masked flat 62) this transport-harness removal landed the -3 exactly on the 3 unique 1173 tests. Run 27218281159 / job 80365846275 / sha 326cf35a."
      | .bonus_watch_result = "Task 235 stays 0 (no regression from prior SWEEP cure). Anchor Task 1352a 2 -> 2 (unchanged independent genuine-logic residual, separate triage)."
    else . end
  )
  + [{
      "id": "FIX-CI-C1839b-TRIAGE",
      "type": "SPIKE",
      "owner": "architect",
      "status": "TODO",
      "size": "S",
      "zone": "apps/mcp-server/src/__tests__/",
      "priority": "high",
      "sprint": "CI-RED-RECONCILE",
      "depends": [],
      "title": "ARCHITECT-FIRST prod-vs-test triage of Task 1839b — one of three co-dominant 59-run levers (2 unique fails / 4 log-markers)",
      "root_cause": "UNKNOWN — to be determined by architect triage. With Task 1173 + Task 235 now cured, PO's fresh self-tally of the 59-run (run 27218281159, job 80365846275, sha 326cf35a) shows three co-dominant clusters TIED at the top: Task 1839b / Task 1792 / Task 1282a (4 fail-markers each = 2 unique tests each, double-logged). 1839b selected as the cleanest fresh dominant to triage first (1792 carries known own-residual entanglement noted by router; 1282a not yet characterized).",
      "scope": "ARCHITECT-FIRST prod-vs-test confirm per /goal REMOVE-obsolete clause: classify each of Task 1839b's failures as REWRITE (prod still exists, test stale -> rewrite test to match prod) vs REMOVE (prod gone/superseded, test obsolete -> DELETE) vs CONTAMINATION (mock.module ESM-cache leak from a sibling). Produce a brief with the prod-vs-test verdict + full-CI-ordered-repro evidence. Do NOT open a fix task yet — triage-only; PO opens the scoped fix after the architect verdict returns.",
      "evidence_bar": "Full-CI-ordered-repro per-victim exact-prefix (fail) tally for 'Task 1839b' on run 27218281159 (sha 326cf35a) baseline 2 unique (4 markers). 2-file joint-pass is NOT sufficient proof (3 false-positive local repros earlier this sprint arch-S14/S15/S16). Routed ARCHITECT-FIRST per /goal REMOVE-obsolete clause.",
      "measurement_source": "docs/signals/ci-c1173-gate-result-326cf35a-20260609T1600Z.json (router-verified gate, run 27218281159) + PO po-S50 self re-tally of gh run 27218281159 job 80365846275 native log: top-3 co-dominant Task 1839b/1792/1282a at 4 markers each; Task 1173=0 (cured), Task 235=0 (cured).",
      "baseline_pass": "59 (native_fail, sha 326cf35a, run 27218281159, job 80365846275)",
      "created_at": "2026-06-09T16:00:00Z",
      "created_by": "po-S50"
    }]
)
| .task_board.active_sprints[24].ci_absolute = {
    "native_fail": 59,
    "native_errors": 0,
    "fail_plus_error": 59,
    "tests": 11803,
    "pass": 11702,
    "skip": 42,
    "sha": "326cf35a",
    "run_id": "27218281159",
    "bun_job_id": "80365846275",
    "supersedes": "62 (c017289d)",
    "delta_vs_prior": "-3 (62 -> 59) — CLEAN absolute improvement matching the 3 unique Task 1173 tests. FIX-CI-C1173-REWRITE-TRANSPORT removed the InMemoryTransport stalling harness (not a mock.module reorder), so unlike the telegram SWEEP jitter-mask the -3 landed exactly on the cured tests. Both the named per-victim Task 1173 6->0 flip AND the absolute agree. New band ~59 +/-3 (floor ~56).",
    "updated_at": "2026-06-09T16:00:00Z",
    "updated_by": "po-S50"
  }
| .task_board.active_sprints[24].long_tail_triage_policy.absolute = "59 (sha 326cf35a, run 27218281159, job 80365846275)"
| .task_board._updated_at = "2026-06-09T16:00:00Z"
| .task_board._updated_by = "po-S50"
