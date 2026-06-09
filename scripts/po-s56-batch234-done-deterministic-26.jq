# po-S56 BATCHED board write — scoped, surgical, single-status-key safe.
# Scope: task_board.active_sprints[24] (CI-RED-RECONCILE) + task_board.in_progress + task_board._updated_*.
# Nothing else touched. _schema/_ssot/root signal_queue preserved by construction.

# --- helpers ---
def flip_done($id; $actual):
  (.tasks |= map(
    if .id == $id then
      .status = "DONE"
      | .done_by = "po-S56"
      | .done_at = "2026-06-09T19:45:00Z"
      | .actual_result = $actual
    else . end
  ));

# 1..3: BATCH2/3/4 REVIEW -> DONE on the CI-RED-RECONCILE sprint
.task_board.active_sprints[24] |=
  ( flip_done("BATCH2-CI-C-ML-MOCK-STUB-LEAK-GUARD";
      "DONE (router gate-PASS, signal ci-batch2-gate-result-92e2c1ea-20260609T1830Z.json): 12 mock.module() contaminator files got afterAll-restore guards + permanent meta-test mock-module-afterall-guard.test.ts. Clean additive mover 42->40, pass +3, +1 green meta-guard test, errors 0, NO regression. Structural fix + meta-guard = permanent value.")
  | flip_done("BATCH3-CI-C-MH-MARKET-HOURS-GATE-NOW-SEAM";
      "DONE (router gate-PASS, signal ci-batch3-gate-result-5c86974d-20260609T1842Z.json): all 6 target 1407b market-hours-gate fails CURED (0 fail markers). Run absolute rose 40->55 = CONTAMINATION VARIANCE (1407b frozen-clock reshuffled file-exec order; isolation-probe 1146-get-insider 17p/0f alone), NOT a BATCH3 regression.")
  | flip_done("BATCH4-CI-C-CD-CONFIG-DRIFT-ASSERTS";
      "DONE (router gate-PASS, signal ci-batch4-gate-result-c34ddfc4-20260609T1855Z.json): all 8 config-drift victims (1343e/1349a/1837a/230-AC-4c/1336-named-volume/schedulerFileCount/cowork-schedule-policy_id/chef-intraday) at ZERO fail markers (BATCH4_VICTIMS_ALL_CURED). native_fail 55->26, pass +29 additive, errors 0, sum invariant 11734+42+26=11802.")
  )

# 4: BATCH5 TODO -> ACTIVE (the only remaining CI work)
| .task_board.active_sprints[24].tasks |= map(
    if .id == "BATCH5-CI-C-AL-ASSERTION-LOGIC-TRIAGE" then
      .status = "ACTIVE"
      | .activated_by = "po-S56"
      | .activated_at = "2026-06-09T19:45:00Z"
      | .remaining_surface = "20 test files / 26 genuine fails — the ONLY remaining work between current deterministic state and /goal green"
      | .arch_triage = "architect arch-S25 triage IN FLIGHT (buckets: FIX-PROD | REWRITE-STALE | REMOVE-OBSOLETE); Wave-3 dev to follow"
      | .reclassified_in = "Task 1328e conviction-routing reverted BATCH2->BATCH5 (confirmed still red post-BATCH2/3/4; assertion-logic item, not a mock-stub-leak contaminator) per signal ci-batch4-gate-result-c34ddfc4 1328e_confirms_batch5"
    else . end
  )

# 5: ci_absolute -> DETERMINISTIC 26 (merge: preserve unrecognized sibling keys)
| .task_board.active_sprints[24].ci_absolute =
    ((.task_board.active_sprints[24].ci_absolute // {}) + {
      native_fail: 26,
      native_errors: 0,
      fail_plus_error: 26,
      tests: 11747,
      pass: 11679,
      skip: 42,
      sha: "3ad97a18",
      run_id: "27230921229",
      bun_job_id: "80410540618",
      supersedes: "42 (e1ee78b9)",
      deterministic: true,
      two_sha_proof: "DETERMINISTIC by construction (per-file process isolation) — confirmed identical across two SHAs: d14d2f92 (run 27230529533) = 11679 pass / 42 skip / 26 fail AND 3ad97a18 (run 27230921229) = 11679 pass / 42 skip / 26 fail. This is the stable gate floor; remaining 26 = genuine BATCH5 C-AL residual across 20 files. Replaces the old non-deterministic 26..55-by-ordering note.",
      updated_at: "2026-06-09T19:45:00Z",
      updated_by: "po-S56"
    })
  # explicitly drop any stale non-determinism caveat key if present
  | .task_board.active_sprints[24].ci_absolute |= del(.non_deterministic, .non_determinism_note, .ordering_caveat)

# 6: long_tail_triage_policy.absolute mirror sync (only if the policy exists)
| (if (.task_board.active_sprints[24] | has("long_tail_triage_policy")) then
      .task_board.active_sprints[24].long_tail_triage_policy.absolute = "26 (sha 3ad97a18, run 27230921229, job 80410540618) — DETERMINISTIC per-file process isolation, two-SHA confirmed"
      | .task_board.active_sprints[24].long_tail_triage_policy.band = "26 (deterministic floor; = genuine BATCH5 C-AL residual, no jitter)"
   else . end)

# 7: APPEND 2 tracking tasks
| .task_board.active_sprints[24].tasks +=
  [
    {
      id: "IMPL-CI-PER-FILE-ISOLATION",
      type: "IMPL",
      owner: "dev-mcp-server + ops",
      status: "DONE",
      validation: "VALIDATED",
      size: "L",
      zone: "cross-service/",
      priority: "high",
      sprint: "CI-RED-RECONCILE",
      depends: [],
      title: "Per-file process isolation CI gate (Option A) — the user-demanded 'rethink architecture for testing ci di'. Each test file runs in its own bun OS process; zero shared ESM/mock/DB state; fail count = genuine fails, order-independent.",
      components: [
        "5938e3a3 (architect Phase-2 isolation design)",
        "3174de0c (ops: .github/workflows/ci.yml wired to runner)",
        "507be33f (dev: scripts/ci-per-file-isolation.sh + setup.ts STOCK_PRICE_DB_PATH env passthrough + dev-standards pointer)",
        "d14d2f92 (dev: aggregator anchored-extractor fix)",
        "a76a1c3e (dev: failed-file roster to stdout)"
      ],
      determinism_proof: "Two DIFFERENT SHAs produced IDENTICAL native output: d14d2f92 (run 27230529533) = 11679 pass / 42 skip / 26 fail; 3ad97a18 (run 27230921229) = 11679 pass / 42 skip / 26 fail. errors=0. The count that previously jittered 26<->55 by file-exec order is now STABLE BY CONSTRUCTION.",
      created_by: "po-S56",
      created_at: "2026-06-09T19:45:00Z",
      done_by: "po-S56",
      done_at: "2026-06-09T19:45:00Z",
      actual_result: "DELIVERED + PROVEN DETERMINISTIC. All 5 components on origin/main. HEAD=3ad97a18. The deterministic gate is now the stable floor; the remaining 26 are genuine BATCH5 fails."
    },
    {
      id: "RETIRE-CI-GATE-APPARATUS",
      type: "CLEAN",
      owner: "ops",
      status: "BLOCKED",
      blockedBy: "genuine-fail-count must reach 0 (i.e. BATCH5-CI-C-AL-ASSERTION-LOGIC-TRIAGE complete)",
      size: "S",
      zone: "cross-service/",
      priority: "medium",
      sprint: "CI-RED-RECONCILE",
      depends: ["BATCH5-CI-C-AL-ASSERTION-LOGIC-TRIAGE"],
      title: "Retire the old contamination-era CI gate bookkeeping (non-deterministic-absolute tracking, contamination-variance notes, isolation-probe scaffolding). Do NOT retire until the per-file deterministic gate reads 0 genuine fails.",
      created_by: "po-S56",
      created_at: "2026-06-09T19:45:00Z",
      note: "Held BLOCKED on purpose — the contamination-era apparatus stays in place as the audit trail until BATCH5 lands the deterministic gate at 0."
    }
  ]

# 8: DEDUP — remove the stray top-level in_progress copy of the seam-tests task
#    (terminal DONE wrongly parked in WIP bucket + cross-bucket dup; nested canonical retained)
| .task_board.in_progress |= map(select(.id != "FIX-CI-C1-MACRO-INJECT-SEAM-TESTS"))

# stamps
| .task_board._updated_at = "2026-06-09T19:45:00Z"
| .task_board._updated_by = "po-S56"
| .task_board.active_sprints[24].updated_at = "2026-06-09T19:45:00Z"
| .task_board.active_sprints[24].updated_by = "po-S56"
