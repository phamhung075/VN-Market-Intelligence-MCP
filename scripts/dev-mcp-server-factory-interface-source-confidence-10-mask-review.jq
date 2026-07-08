# Board reconcile: FACTORY-INTERFACE-source-confidence-10-mask
# in_progress[IN_PROGRESS] -> review[REVIEW] bucket move + .head.next_agent -> qa
# dispatcher-wrap owns .head here (this task IS the current .head.active_task_id),
# matching the FACTORY-INTERFACE-sequential-confidence-05-mask precedent.
#
# dev-mcp-server fixed finalizeBctcRefineTool.ts:398 `row.source_confidence ?? 1.0`
# (same audit family as the sequential-confidence sibling). Ground-truth
# investigation FIRST: parseRefinedMarkdown already always computes a real
# per-row confidence (never absent); DV-HC-SC suite + live named-volume DB
# (bctc_table_rows: 380 rows @0.1, 2 @0.4, 3257 @1.0, 0 NULLs) independently
# confirm real values already persist unchanged. The `?? 1.0` was provably
# unreachable dead code, not an active masking bug — documented honestly
# rather than claimed as a live-bug fix. Hardened structurally anyway per
# required discipline: row-shape `source_confidence` retyped honestly
# `number | undefined`; INSERT-boundary fallback extracted into exported
# `resolveSourceConfidence()` (propagates real value incl. edge cases 0/1.0
# unchanged; falls to schema default 1.0 ONLY when genuinely undefined;
# column stays NOT NULL, never made nullable). New
# FACTORY-INTERFACE-source-confidence-10-mask.test.ts (6/6 pass) tests both
# resolver branches directly (parser-absent case can't be reproduced through
# the real pipeline, so tested at the resolver's own honest boundary).
# tsc clean. Targeted+adjacent 167/167 pass. Full bun test 14312 pass/58
# fail/3 errors/1177 files (fail set = pre-existing VPS-push/RSS/insider/
# foreign-flow network-flaky class, zero overlap with changed files).
# mcp-server image rebuilt (35c8117c1f85) but NOT swapped into the running
# container (still 180382145ee7) — ops-gated live swap per standing policy.
#
# GUARD: refuse unless FACTORY-INTERFACE-source-confidence-10-mask is in
# in_progress[] with status IN_PROGRESS.
# Usage: jq --arg now "$NOW" -f scripts/dev-mcp-server-factory-interface-source-confidence-10-mask-review.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="FACTORY-INTERFACE-source-confidence-10-mask")][0]) as $t
| if $t == null then error("FACTORY-INTERFACE-source-confidence-10-mask not in in_progress[] — refuse")
  elif ($t.status != "IN_PROGRESS") then error("FACTORY-INTERFACE-source-confidence-10-mask status != IN_PROGRESS (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-INTERFACE-source-confidence-10-mask") then
    error("head.active_task_id drifted away from FACTORY-INTERFACE-source-confidence-10-mask (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| .task_board.in_progress = [$ip[] | select((type=="object" and .id=="FACTORY-INTERFACE-source-confidence-10-mask") | not)]
| .task_board.review = ((.task_board.review // []) + [
    ($t + {
      status: "REVIEW",
      next_agent: "qa",
      moved_to_review_at: $now,
      moved_by: "dev-mcp-server",
      review_note: "Code fix + tests DONE: finalizeBctcRefineTool.ts's `row.source_confidence ?? 1.0` INSERT fallback extracted into exported resolveSourceConfidence() — propagates real parser confidence unchanged (incl. edge cases 0/1.0), falls to schema default 1.0 only when genuinely undefined, NOT NULL preserved (column NOT made nullable). IMPORTANT FOR QA: ground-truth investigation found the original `?? 1.0` was provably UNREACHABLE dead code, not a live masking bug — parseRefinedMarkdown always supplies a real confidence, existing DV-HC-SC suite (HC-human-confirm.test.ts) already proved real values persist, and the live named-volume DB independently confirms it (bctc_table_rows: 380 rows @0.1, 2 @0.4, 3257 @1.0, 0 NULLs) even under the pre-fix image. QA RAW-verify should confirm the SAME live-DB facts (non-1.0 rows exist, 0 NULLs) rather than expect a before/after behavior delta — this is a behavior-preserving structural hardening + honest documentation fix, not a live-bug repair. New FACTORY-INTERFACE-source-confidence-10-mask.test.ts (6/6 pass) covers both resolver branches directly. tsc clean, tools=183 unchanged, targeted+adjacent 167/167 pass, full bun test 14312/58fail/3err/1177 files (pre-existing flaky class, zero overlap). mcp-server image rebuilt (35c8117c1f85) but NOT swapped into the running container (still 180382145ee7, serving FACTORY-INTERFACE-sequential-confidence-05-mask) — docker compose up -d is ops-gated, stops at REVIEW not done_verified."
    })
  ])
| .head.next_agent = "qa"
| .head.next_action = "QA verify FACTORY-INTERFACE-source-confidence-10-mask (finalizeBctcRefineTool.ts source_confidence resolver hardening) — confirm live named-volume DB shows non-1.0 source_confidence rows + 0 NULLs (already true pre-fix, per dev's ground-truth finding: the original `?? 1.0` was unreachable dead code, not an active mask), verify resolveSourceConfidence unit tests (6/6), then ops-gated mcp-server image swap (id 35c8117c1f85) before done_verified."
| .head.updated_at = $now
| .head.updated_by = "dev-mcp-server"
