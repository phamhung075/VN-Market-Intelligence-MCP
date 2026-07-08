# Board flip: FACTORY-PDF-paddleocr-score-07-mask REVIEW -> DONE_VERIFIED
# Live-endpoint RAW-verify PASS: docker inspect confirms the running
# pdf-extractor container (vn-market-intelligence-mcp-pdf-extractor-1) is on
# the rebuilt image sha256:0c83b2c5f8add1340624b906ea5018213e74129ccf1d37ca0f3ea5733957e198
# (healthy); sha256 of /app/infrastructure/pek_engine_adapter.py inside the
# container is byte-identical to the local fix source (41bbee1f5c51...);
# docker exec'd into the container's own python3 process and directly
# invoked the REAL deployed _cells_to_row_bands()/_map_bboxes_to_zones()
# (imported from /app, not the local worktree) with a 3-cell fixture
# (present score 0.88, MISSING score key, explicit real 0.0 score) ->
# row_density emitted [0.88, null, 0.0] exactly — missing-score cell is a
# named JSON null (never the old fabricated 0.7), explicit 0.0 preserved
# (not treated as missing), present score passes through unchanged. No
# real HTTP route exists to force PaddleOCR to omit its own 'score' key
# (this is a defensive null-guard for malformed/partial OCR output, not a
# normal PP-StructureV2 response shape) — direct in-process invocation of
# the actually-deployed image code is the correct exhaustive RAW-verify
# for this specific fix, per task instructions' explicit fallback clause.
#
# GUARD: refuse unless FACTORY-PDF-paddleocr-score-07-mask is in review[]
# with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --rawfile note /path/to/review_note_append.txt \
#          -f scripts/qa-factory-pdf-paddleocr-score-07-mask-done-verified.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FACTORY-PDF-paddleocr-score-07-mask")][0]) as $t
| if $t == null then error("FACTORY-PDF-paddleocr-score-07-mask not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-PDF-paddleocr-score-07-mask status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-PDF-paddleocr-score-07-mask") then
    error("head.active_task_id drifted away from FACTORY-PDF-paddleocr-score-07-mask (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    review_note: ($t.review_note + $note),
    updated_at: $now,
    updated_by: "qa",
    status_note: "live-endpoint RAW-verify PASS (qa, \($now)): docker inspect confirms container vn-market-intelligence-mcp-pdf-extractor-1 running image sha256:0c83b2c5f8ad (healthy); deployed /app/infrastructure/pek_engine_adapter.py sha256 byte-identical to fix source; docker exec into the container's own python3 process directly invoked the REAL deployed _cells_to_row_bands()/_map_bboxes_to_zones() with present/missing/explicit-0.0 score cells -> row_density [0.88, null, 0.0] exactly, no fabricated 0.7. done_verified."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FACTORY-PDF-paddleocr-score-07-mask")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .head.status = "done"
| .head.active_task_id = null
| .head.next_agent = "router"
| .head.next_action = "FACTORY-PDF-paddleocr-score-07-mask DONE_VERIFIED (qa live-endpoint RAW-verify PASS \($now) — docker exec into the actual running/healthy rebuilt pdf-extractor container (image sha256:0c83b2c5f8ad), direct invocation of the real deployed _cells_to_row_bands()/_map_bboxes_to_zones() confirmed row_density=[0.88,null,0.0] for present/missing/explicit-0.0 score cells — missing-score never fabricates 0.7, explicit 0.0 preserved). No new follow-up bug discovered this cycle."
| .head.updated_at = $now
| .head.updated_by = "qa"
