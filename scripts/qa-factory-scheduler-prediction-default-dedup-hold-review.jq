# Board reconcile: FACTORY-SCHEDULER-prediction-default-dedup
# QA Step 5 RAW-verify PASS (docs/protocols/docker-deployment-runbook.md §
# Microservice Code-Change Close Gate). HOLD at REVIEW (not done_verified) —
# Step 6 (mark DONE) belongs to po per the runbook delegation rule, not qa.
# Explicit dispatch instruction: do NOT repeat the FACTORY-SCHEDULER-
# alert-confidence-literals self-close-to-done_verified deviation (2nd
# occurrence = recurring bug per po's own escalation trigger).
# .head.next_agent -> "po", status stays "review".
#
# GUARD: refuse unless FACTORY-SCHEDULER-prediction-default-dedup is in
# review[] with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --rawfile note <path-to-append-text> \
#   -f scripts/qa-factory-scheduler-prediction-default-dedup-hold-review.jq \
#   docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FACTORY-SCHEDULER-prediction-default-dedup")][0]) as $t
| if $t == null then error("FACTORY-SCHEDULER-prediction-default-dedup not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-SCHEDULER-prediction-default-dedup status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-SCHEDULER-prediction-default-dedup") then
    error("head.active_task_id drifted away from FACTORY-SCHEDULER-prediction-default-dedup (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| .task_board.review = [$rv[] | if (type=="object" and .id=="FACTORY-SCHEDULER-prediction-default-dedup") then
    (. + {
      next_agent: "po",
      review_note: (.review_note + $note),
      moved_to_review_at: .moved_to_review_at,
      updated_at: $now,
      updated_by: "qa",
      status_note: "qa Step 5 RAW-verify PASS — byte-identical deployed source (predictionMarketJob.ts/config.ts/mcp.config.json) confirmed via docker cp diff, live call-chain traced to resolvePredictionSignalConfig(pm) on the real cron path, natural cron fire caught live at 11:30:01Z (6 markets fetched, 0 signals, no crash), RAW sqlite3 query of docker-cp'd market.db+wal shows 0 DB drift; po Step 6 (mark DONE) next per runbook delegation rule"
    })
  else . end]
| .head.next_agent = "po"
| .head.next_action = "FACTORY-SCHEDULER-prediction-default-dedup: qa Step 5 RAW-verify PASS (health/toolCount=183 match baseline; deployed predictionMarketJob.ts/config.ts/mcp.config.json byte-identical to host HEAD via docker cp diff; call-chain confirms startScheduler.ts's zero-arg runPredictionMarketPoll() resolves through resolvePredictionSignalConfig(pm) with pm==DEFAULT_PREDICTION_SIGNAL_CONFIG field-for-field; live natural cron fire caught at 11:30:01Z — fetched 6 markets/detected 0 signals/no crash; RAW sqlite3 query of docker-cp'd market.db+wal shows 0 new prediction_signals rows since deploy, a quiet-market data fact not a defect; own re-run of the 7-test file + tsc --noEmit both clean) — po Step 6: mark DONE per docker-deployment-runbook.md Microservice Code-Change Close Gate."
| .head.updated_at = $now
| .head.updated_by = "qa"
