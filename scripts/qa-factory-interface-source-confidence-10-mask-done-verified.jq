# Board flip: FACTORY-INTERFACE-source-confidence-10-mask REVIEW -> DONE_VERIFIED
# Post-swap QA sanity check PASS: docker inspect confirms running container is on
# the rebuilt+QA-approved image (35c8117c1f85), RAW in-container source_confidence
# distribution + NULL count re-query matches the pre-swap figures exactly
# ({0.1:380, 0.4:2, 1.0:3257}, 0 NULLs), /health 200 + toolCount 183 unchanged,
# zero NOT NULL/constraint errors in post-swap logs (no finalize runs occurred
# in the post-swap window to exercise the write path under real traffic).
#
# GUARD: refuse unless FACTORY-INTERFACE-source-confidence-10-mask is in
# review[] with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --rawfile note /path/to/review_note_append.txt \
#          -f scripts/qa-factory-interface-source-confidence-10-mask-done-verified.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FACTORY-INTERFACE-source-confidence-10-mask")][0]) as $t
| if $t == null then error("FACTORY-INTERFACE-source-confidence-10-mask not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-INTERFACE-source-confidence-10-mask status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-INTERFACE-source-confidence-10-mask") then
    error("head.active_task_id drifted away from FACTORY-INTERFACE-source-confidence-10-mask (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    review_note: ($t.review_note + $note),
    updated_at: $now,
    updated_by: "qa",
    status_note: "post-swap sanity check PASS (qa, \($now)): docker inspect independently confirms image 35c8117c1f85 running+healthy on container c0dc4c1c7168; RAW in-container source_confidence distribution re-query {0.1:380,0.4:2,1.0:3257} 0 NULLs exact match to pre-swap; /health 200 toolCount=183 unchanged; zero NOT NULL/constraint errors in post-swap logs (no finalize runs occurred yet to exercise the write path). done_verified."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FACTORY-INTERFACE-source-confidence-10-mask")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .head.status = "done"
| .head.active_task_id = null
| .head.next_agent = "router"
| .head.next_action = "FACTORY-INTERFACE-source-confidence-10-mask DONE_VERIFIED (qa post-swap sanity check PASS \($now) — docker inspect image match (35c8117c1f85) + RAW source_confidence distribution re-query exact match to pre-swap ({0.1:380,0.4:2,1.0:3257}, 0 NULLs) + /health 200/toolCount 183 unchanged + zero NOT NULL/constraint errors in post-swap logs). No new follow-up bug discovered this cycle."
| .head.updated_at = $now
| .head.updated_by = "qa"
