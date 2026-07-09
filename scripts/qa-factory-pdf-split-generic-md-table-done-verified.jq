# Board flip: FACTORY-PDF-split-generic-md-table REVIEW -> DONE_VERIFIED
# Live-endpoint RAW-verify PASS: docker inspect confirms the running
# pdf-extractor container (vn-market-intelligence-mcp-pdf-extractor-1) is on
# the rebuilt image sha256:131d16bdfba5be84a8977ca9c32bbf36f971d24483ca172ff661383b36960e5e
# (healthy, /health 200 ocr_source_ok=true); all 8 split submodules present
# + compiled (.pyc cpython-312/313) inside the container, 164L shim confirmed;
# docker exec python3 resolves GenericMdTableExtractor/build_document_map
# live from the shim -> genuinely bound to infrastructure.generic_md_table.*,
# zero import errors; full container log scan since boot = zero error/
# traceback/exception lines. Behavioral parity independently reproduced (not
# trusting the dev's report): 2 real BCTC PDFs (FPT Q1-2026, HPG Q4-2025)
# copied out of the running container, rasterized at production DPI, run
# through the CURRENT (deployed-identical) extractor vs a git-worktree of the
# pre-split 4111L god-file (c2069debd) on the SAME images -> output JSON
# byte-for-byte IDENTICAL both PDFs (12 + 7 tables, real VND figures).
# Extractor also run live INSIDE the container itself via docker exec
# (production rasterize_report() on a container-resident PDF) -> same
# structure, zero exceptions; test artifact cleaned up after, no HTTP-push
# side effects on production DB. pytest re-confirmed via a clean A/B isolating
# exactly the 8-stage split (parent commit ca5a8a545 vs HEAD 530ab8fa0):
# 11 failed/1017 passed/1 skipped both sides, identical failing test-ID set
# (pre-existing env-only). One post-split run showed a 12th failure
# (test_extract_layout_and_tables_raises_on_timeout) -> reproduced GREEN on
# re-run, confirming the dev's documented timing-flake, not a regression.
#
# GUARD: refuse unless FACTORY-PDF-split-generic-md-table is in review[]
# with status REVIEW, and .head.active_task_id still points at it.
# Usage: jq --arg now "$NOW" --rawfile note /path/to/review_note_append.txt \
#          -f scripts/qa-factory-pdf-split-generic-md-table-done-verified.jq \
#          docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ($ARGS.named.note) as $note
| (.task_board.review // []) as $rv
| ([$rv[] | select(type=="object" and .id=="FACTORY-PDF-split-generic-md-table")][0]) as $t
| if $t == null then error("FACTORY-PDF-split-generic-md-table not in review[] — refuse")
  elif ($t.status != "REVIEW") then error("FACTORY-PDF-split-generic-md-table status != REVIEW (got \($t.status)) — refuse")
  else . end
| if (.head.active_task_id != "FACTORY-PDF-split-generic-md-table") then
    error("head.active_task_id drifted away from FACTORY-PDF-split-generic-md-table (got \(.head.active_task_id)) — refuse .head write, board-only move needed instead")
  else . end
| ($t + {
    status: "DONE_VERIFIED",
    review_note: ($t.review_note + $note),
    updated_at: $now,
    updated_by: "qa",
    status_note: "live-endpoint RAW-verify PASS (qa, \($now)): docker inspect confirms container on rebuilt image sha256:131d16bdfba5 (healthy); all 8 split submodules present+compiled in-container, 164L shim resolves live via docker exec, zero import errors, zero error/traceback lines in boot logs. Behavioral parity independently reproduced on 2 real BCTC PDFs (FPT+HPG) -- output byte-for-byte identical pre-split (c2069debd) vs post-split, both via host reproduction and live in-container invocation. pytest clean A/B on the true pre-split parent (ca5a8a545) vs HEAD: 11 failed/1017 passed/1 skipped both sides, identical failing test-ID set; one flaky extra failure reproduced GREEN on re-run (known timing flake, not a regression). done_verified."
  }) as $done
| .task_board.review = [$rv[] | select(.id != "FACTORY-PDF-split-generic-md-table")]
| .task_board.done_verified = ((.task_board.done_verified // []) + [$done])
| .head.status = "done"
| .head.active_task_id = null
| .head.next_agent = "router"
| .head.next_action = "FACTORY-PDF-split-generic-md-table DONE_VERIFIED (qa live-endpoint RAW-verify PASS \($now) — docker inspect image match sha256:131d16bdfba5, all 8 split submodules present+compiled+import-clean in-container, zero boot-log errors, byte-identical extraction output pre/post split on 2 real BCTC PDFs (host + live in-container reproduction), pytest clean A/B on true pre-split parent commit = identical 11-failure env-only set both sides). No new follow-up bug discovered this cycle."
| .head.updated_at = $now
| .head.updated_by = "qa"
