# Board reconcile: FACTORY-INTERFACE-sequential-confidence-05-mask
# in_progress[IN_PROGRESS] -> review[REVIEW] bucket move + .head.next_agent -> qa
# (this task IS the current .head.active_task_id, unlike the CI-RED-0d28104a-FIX
# precedent — dispatcher-wrap owns .head here per the standard dev->qa handoff
# contract, see docs/agents/dev-mcp-server/flow/main.md RETURN block).
#
# dev-mcp-server fixed sequential-market-analysis.ts:170
# `result.confidence = input.confidence ?? 0.5` — only assigns result.confidence
# when input.confidence is actually supplied; init default confidence:0 ->
# undefined; type number -> number|undefined; generateRecommendations no longer
# mislabels an unstated confidence as "Low confidence". New
# FACTORY-INTERFACE-sequential-confidence-05-mask.test.ts (5/5 pass). tsc clean.
# mcp-server image rebuilt (id 180382145ee7) but NOT swapped into the running
# container (still 4c8ea4cfd41f) — ops-gated live swap per standing policy.
#
# GUARD: refuse unless FACTORY-INTERFACE-sequential-confidence-05-mask is in
# in_progress[] with status IN_PROGRESS.
# Usage: jq --arg now "$NOW" -f scripts/dev-mcp-server-factory-interface-sequential-confidence-05-mask-review.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="FACTORY-INTERFACE-sequential-confidence-05-mask")][0]) as $t
| if $t == null then error("FACTORY-INTERFACE-sequential-confidence-05-mask not in in_progress[] — refuse")
  elif ($t.status != "IN_PROGRESS") then error("FACTORY-INTERFACE-sequential-confidence-05-mask status != IN_PROGRESS (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-INTERFACE-sequential-confidence-05-mask") then
    error("head.active_task_id drifted away from FACTORY-INTERFACE-sequential-confidence-05-mask (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| .task_board.in_progress = [$ip[] | select((type=="object" and .id=="FACTORY-INTERFACE-sequential-confidence-05-mask") | not)]
| .task_board.review = ((.task_board.review // []) + [
    ($t + {
      status: "REVIEW",
      next_agent: "qa",
      moved_to_review_at: $now,
      moved_by: "dev-mcp-server",
      review_note: "Code fix + test DONE: sequential-market-analysis.ts no longer fabricates a 0.5 confidence when input.confidence is omitted (only assigns when actually supplied; init default confidence:0 -> undefined; generateRecommendations honestly labels an unstated confidence instead of folding it into \"Low confidence\"). New FACTORY-INTERFACE-sequential-confidence-05-mask.test.ts (5/5 pass) exercises AnalysisResult via a new test-only _analysisState introspection hook, since confidence is genuinely internal state never returned by handle()'s MCP response contract ({status,thought,progress,nextSteps} only) — flagging this for QA: the DoD's \"served payload shows null/absent\" RAW-verify language does not map to a live HTTP route today, verify at the unit level instead. tsc --noEmit clean. Tool count 183 unchanged, scheduler cron.schedule grep=3 unchanged, server boot health 200 verified. mcp-server image rebuilt (id 180382145ee7) but NOT swapped into the running container (still 4c8ea4cfd41f, serving CONTAM-10-WRITER-H) — docker compose up -d is an ops-gated live-container swap per standing policy, stops at REVIEW not done_verified."
    })
  ])
| .head.next_agent = "qa"
| .head.next_action = "QA verify FACTORY-INTERFACE-sequential-confidence-05-mask (sequential-market-analysis.ts confidence-fabrication fix) — unit-level RAW-verify via _analysisState introspection (confidence field is internal, never served over the MCP response contract), then ops-gated mcp-server image swap (id 180382145ee7) before done_verified."
| .head.updated_at = $now
| .head.updated_by = "dev-mcp-server"
