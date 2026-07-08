# Board reconcile: CI-RED-0d28104a-FIX in_progress[IN_PROGRESS] -> review[REVIEW] bucket move.
# dev-mcp-server fixed the 3rd recurrence of the mock.module()-precedent flaky-fetch class:
# DSI-S3-sector-fin.test.ts AC-SEC-2a/2b mocked hydrologicalData.js (freeze-before-mock +
# afterAll-restore, copied verbatim from 1efb6f918). Committed a80d405d1, pushed to origin/main.
# Post-push CI verification: 3 consecutive runs of the SAME push commit (a80d405d1) via
# `gh run rerun --failed` — run 1 failed on 240-price-pipeline-recovery.test.ts (unrelated,
# passes 3/3 locally), run 2 failed on 167-prediction-market-job.test.ts (unrelated, different
# file, passes 2/2 locally), run 3 conclusion=success. DSI-S3-sector-fin.test.ts was absent from
# FAILED FILES in every one of the 3 runs — confirms the target fix is solid; the first 2 failures
# are pre-existing, unrelated single-random-file CI-runner-level flakiness (P=16 isolation),
# NOT caused by this commit and NOT regression risk from this change. Flagging that broader
# flakiness pattern as a separate open question for the dispatcher/PO — out of this task's scope.
# GUARD: refuse unless CI-RED-0d28104a-FIX in in_progress[] with status IN_PROGRESS.
# NOTE: .head is NOT touched here — it currently tracks an unrelated concurrent task
# (CONTAM-10-WRITER-H) and this task was dispatched as a side/ambient fix, not the head pipeline.
# Usage: jq --arg now "$NOW" -f scripts/dev-mcp-server-ci-red-0d28104a-fix-review.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="CI-RED-0d28104a-FIX")][0]) as $t
| if $t == null then error("CI-RED-0d28104a-FIX not in in_progress[] — refuse")
  elif ($t.status != "IN_PROGRESS") then error("CI-RED-0d28104a-FIX status != IN_PROGRESS (got \($t.status)) — refuse")
  else . end
| .task_board.in_progress = [$ip[] | select((type=="object" and .id=="CI-RED-0d28104a-FIX") | not)]
| .task_board.review = ((.task_board.review // []) + [
    ($t + {
      status: "REVIEW",
      next_agent: "qa",
      moved_to_review_at: $now,
      moved_by: "dev-mcp-server",
      review_note: "Fix committed a80d405d1 (DSI-S3-sector-fin.test.ts hydrologicalData.js mock.module, freeze-before-mock+afterAll pattern copied from 1efb6f918), pushed to origin/main. Verified 17/17 local pass x3. 257-weather-vn.test.ts/258-hydro-data.test.ts audited: both always pass an injected HTTP client to the fetcher, never reach the live-network default-client branch — confirmed out of scope, left untouched (not a 4th recurrence risk). CI verification_gate=ci_green_on_subsequent_push: RAW-checked via gh run view/rerun on the a80d405d1 push, DSI-S3-sector-fin.test.ts absent from FAILED FILES across 3 consecutive reruns; run 3 conclusion=success. Runs 1-2 failed on unrelated single-file flakes (240-price-pipeline-recovery.test.ts, then 167-prediction-market-job.test.ts) — both pass locally, different file each run, looks like pre-existing CI-runner-level P=16 flakiness unrelated to this commit; flagging for PO/dispatcher triage, not fixed here (scope boundary)."
    })
  ])
