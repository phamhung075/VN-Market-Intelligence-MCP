# dev-mcp-server worker-side board flip for FIX-BCTC-BANK-BS-SECTION-CLASSIFIER.
#
# Two idempotent transitions, applied in one pass so either can be re-run safely:
#   T1: ready -> in_progress (status=IN_PROGRESS, assigned=dev-mcp-server, started_at=$now).
#       Only fires while the row is still in task_board.ready.
#   T2: in_progress -> review (status=REVIEW, review_note=$reviewNote).
#       Only fires while the row is in task_board.in_progress AND $reviewNote is non-empty
#       (empty string = "not ready to close yet", caller passes it blank for the T1-only pass).
#
# Usage (Step 1, ready -> in_progress):
#   NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
#   jq --arg now "$NOW" --arg reviewNote "" \
#     -f scripts/dev-mcp-server-fix-bctc-bs-section-classifier-flip.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Usage (Step 4, in_progress -> review):
#   NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
#   jq --arg now "$NOW" --arg reviewNote "<commit sha + bun test evidence + deploy-gate note>" \
#     -f scripts/dev-mcp-server-fix-bctc-bs-section-classifier-flip.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

("FIX-BCTC-BANK-BS-SECTION-CLASSIFIER") as $cid

# ---- T1: ready -> in_progress (idempotent: only while still in ready[]) ----
| ((.task_board.ready // []) | map(select(type=="object" and .id==$cid)) | first) as $readyRow
| ( if $readyRow != null then
      .task_board.ready |= map(select((type=="object" and .id==$cid) | not))
      | .task_board.in_progress += [ $readyRow
          + { status: "IN_PROGRESS",
              assigned: "dev-mcp-server",
              started_at: $now } ]
    else . end )

# ---- T2: in_progress -> review (idempotent: only while still in in_progress[], and caller supplied a note) ----
| ( if ($reviewNote // "") != "" then
      ((.task_board.in_progress // []) | map(select(type=="object" and .id==$cid)) | first) as $ipRow
      | ( if $ipRow != null then
            .task_board.in_progress |= map(select((type=="object" and .id==$cid) | not))
            | .task_board.review += [ $ipRow
                + { status: "REVIEW",
                    review_note: $reviewNote,
                    reviewed_at: $now } ]
          else . end )
    else . end )

| ._updated_at = $now
| ._updated_by = "dev-mcp-server"
