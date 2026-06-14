# po-S48 batched board write — CI-RED-RECONCILE sprint (active_sprints[24])
# 1) SWEEP REVIEW->DONE  2) ci_absolute SHA advance (native_fail STAYS 62)
# 3) open FIX-CI-C1173-TRIAGE (architect, TODO)
# Scoped to active_sprints[24] ONLY + task_board _updated_*; no whole-object rewrite.

.task_board._updated_at = $now
| .task_board._updated_by = "po-S48"
| .task_board.active_sprints[24] |= (
    ._updated_by = "po-S48"
    # (1) SWEEP REVIEW -> DONE
    | .tasks = (.tasks | map(
        if .id == "FIX-CI-TELEGRAM-STUB-AFTERALL-SWEEP"
        then .status = "DONE"
           | .closed_at = $now
           | .closed_by = "po-S48"
           | .gate_proof = "Task 235 per-victim exact-prefix (fail) 4->0 CONFIRMED on full-CI run 27216305674 (bun_job 80358657573, sha c017289d). Anchors held: Task 1352a 2->2, Task 1792 4->4 (independent residuals). Absolute native_fail flat 62->62 (2 cured 235 fails offset by jitter-reshuffle from inserting afterAll at 6 CI positions — established C1485/C235-1792 precedent; named per-victim flip is authoritative). Telegram-mock contamination CLASS hardened across 6 files: FIX-1290/1424a/1345b (primary cure) + 047/1352a/1356a (audit frozen-capture -> cache-bust). Commit c017289d KEPT."
        else . end
      ))
    # (2) ci_absolute — native_fail STAYS 62, advance SHA reference
    | .ci_absolute = {
        "native_fail": 62,
        "native_errors": 0,
        "fail_plus_error": 62,
        "tests": 11803,
        "pass": 11699,
        "skip": 42,
        "sha": "c017289d",
        "run_id": "27216305674",
        "bun_job_id": "80358657573",
        "supersedes": "62 (09dce373)",
        "delta_vs_prior": "0 (62 -> 62) — flat absolute on a NEW sha. FIX-CI-TELEGRAM-STUB-AFTERALL-SWEEP cured the named Task 235 4->0 (2 unique tests), but the absolute held flat because inserting an afterAll at 6 distinct CI file positions reorders the bun ESM-cache mock.module() contamination graph and shifts jitter on unrelated tests beyond +/-3. Authoritative jitter-robust signal = the named per-victim Task 235 4->0 flip (NOT the absolute). Same disposition as C1485 (10->0, absolute 68->63) and C235-1792 (6->4). Telegram-mock contamination CLASS now DRAINED + hardened (6 files). Band stays ~62 +/-3 (floor ~59).",
        "updated_at": $now,
        "updated_by": "po-S48"
      }
    # (2b) sync long_tail_triage_policy.absolute mirror
    | .long_tail_triage_policy.absolute = "62 (sha c017289d, run 27216305674, job 80358657573)"
    | .long_tail_triage_policy.updated_by = "po-S48"
    | .long_tail_triage_policy.updated_at = $now
    # (3) open next lever FIX-CI-C1173-TRIAGE (architect, TODO, ARCHITECT-FIRST)
    | .tasks += [{
        "id": "FIX-CI-C1173-TRIAGE",
        "type": "SPIKE",
        "owner": "architect",
        "status": "TODO",
        "size": "S",
        "zone": "apps/mcp-server/src/__tests__/",
        "priority": "high",
        "sprint": "CI-RED-RECONCILE",
        "depends": [],
        "title": "ARCHITECT-FIRST prod-vs-test triage of Task 1173 — the single dominant 62-run lever (6 fails)",
        "root_cause": "UNKNOWN — to be determined by architect triage. With Task 235 now cured (FIX-CI-TELEGRAM-STUB-AFTERALL-SWEEP, run 27216305674), the fresh 62-run per-prefix distribution makes Task 1173 the single dominant cluster at 6 fails; next tier Task 1839b / Task 1792 / Task 1282a at 4 each.",
        "scope": "ARCHITECT-FIRST prod-vs-test confirm per /goal REMOVE-obsolete clause: classify each of Task 1173's failures as REWRITE (prod still exists, test stale -> rewrite test to match) vs REMOVE (prod gone/superseded, test obsolete -> DELETE). Produce a brief with the prod-vs-test verdict + full-CI-ordered-repro evidence (the established evidence bar this sprint — 2-file joint-pass is NOT sufficient proof; require full-CI per-victim exact-prefix repro). Do NOT open a fix task yet — this is triage-only; PO opens the scoped fix after the architect verdict returns.",
        "evidence_bar": "Full-CI-ordered-repro per-victim exact-prefix (fail) tally for 'Task 1173' (3 consecutive false-positive local repros this sprint arch-S14/S15/S16 => 2-file joint-pass NOT sufficient). Routed ARCHITECT-FIRST per /goal REMOVE-obsolete clause.",
        "measurement_source": "docs/signals/ci-telegram-sweep-gate-result-c017289d-20260609T1530Z.json (router-verified gate, run 27216305674) — Task 235 cured, next levers Task 1173 (6, single dominant), Task 1839b/1792/1282a (4 each)",
        "created_at": $now,
        "created_by": "po-S48"
      }]
  )
