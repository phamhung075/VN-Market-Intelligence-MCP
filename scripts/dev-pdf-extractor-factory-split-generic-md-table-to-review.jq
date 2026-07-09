# scripts/dev-pdf-extractor-factory-split-generic-md-table-to-review.jq
#
# FACTORY-PDF-split-generic-md-table — in_progress[] -> review[] after the
# 8-stage extract-by-seam split (constants/markdown_emit/grid_cleanup/
# ordinal_grid/document_map/page_zoning/unit_ocr/extractor) landed + tests
# GREEN + all 8 commits pushed. Flipped to REVIEW (not DONE_VERIFIED — dev
# agent never self-flips, per DJ-GATE-1 / task instructions); next_agent=qa
# to independently re-verify. .head reset to idle (this dev-pdf-extractor
# session's work is complete and committed — nothing else is actively
# running against this task right now); the review[] row itself (not
# .head) carries the qa handoff. Precedent: scripts/router-hnx-ssl-review-flip.jq
# (in_progress->review + .head idle reset in one atomic transform).
#
# REFUSE if FACTORY-PDF-split-generic-md-table not in in_progress[] (gate guard).
#
# Usage:
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     -f scripts/dev-pdf-extractor-factory-split-generic-md-table-to-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

(.task_board.in_progress | map(select(type=="object" and .id=="FACTORY-PDF-split-generic-md-table"))[0]) as $t
| if $t == null then error("FACTORY-PDF-split-generic-md-table not in in_progress[] — refuse to flip") else . end
| .task_board.review += [
    ($t + {
        status: "REVIEW",
        owner: "dev-pdf-extractor",
        size: "XL",
        next_agent: "qa",
        updated_at: $now,
        updated_by: "dev-pdf-extractor",
        reviewed_at: $now,
        reviewed_by: "dev-pdf-extractor",
        review_note: "Split the 4111L generic_md_table_extractor.py god-file into infrastructure/generic_md_table/ (constants.py, markdown_emit.py, grid_cleanup.py, ordinal_grid.py, document_map.py, page_zoning.py, unit_ocr.py, extractor.py) behind a 164L thin re-export shim — 8 sequential commits (21686062b..f261bd4b6), one sub-module per commit, tests run between every stage. Every function body moved verbatim (ast span extraction + byte-diff verified against the pre-move source at every stage, via new reusable scripts/pdf-extractor-god-file-extract.py). GenericMdTableExtractor._process_page (largest method) split into 3 named stage helpers (Step A tokenize / Step A2 classify+measure / Steps C5-G per-region reconstruct+emit) while staying a bound method (test seam preserved: tests call/monkeypatch extractor._process_page directly). Symbol-parity verified: AST-diffed the original module's 112 top-level names (git c2069debd, pre-split) against the final shim's resolved dir() namespace -- 0 missing (except 5 unused stdlib typing re-exports, confirmed zero callers via repo-wide grep), 0 unexpected extras. Callers unchanged: main.py composition-root imports (build_document_map/zone_page/ocr_unit/GenericMdTableExtractor) smoke-tested against the new shim. Every new file <=120L or carries an honest # size-justification: header. Tests: baseline established first (pytest -q = 11 failed/1017 passed/1 skipped, pre-existing env-only failures -- no PDF fixtures/Tesseract/poppler binary in sandbox) and re-confirmed identical after every one of the 8 stages, including test_generic_md_table_extractor.py (149/149, incl. the AC-1 Fence-A AST import-boundary check) post-split. mypy: pre-existing env-blocking \"pdf-extractor is not a valid Python package name\" error confirmed identical on the ORIGINAL unmodified file via git stash/git stash pop A/B -- not caused by this change. G12 pilot sandbox-runner gate: N/A -- pilot-status-pdf-extractor.json status=DONE (closed 2026-05-24) and the flow doc's sandbox_runner.py script no longer exists in this repo state; pytest is the live DoD gate. rebuild_required=true (infra code moved/restructured) -- ops rebuild+swap needed before qa live-verify. Decision journal: docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-dev-pdf-extractor.md STEP dev-pdf-extractor-S5."
    })
  ]
| .task_board.in_progress |= map(select(type != "object" or .id != "FACTORY-PDF-split-generic-md-table"))
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-pdf-extractor (FACTORY-PDF-split-generic-md-table -> REVIEW)"
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "dev-pdf-extractor",
    active_task_id: null,
    next_agent: null,
    note: "FACTORY-PDF-split-generic-md-table repo scope shipped (8 commits 21686062b..f261bd4b6) -> review[] lane, next_agent=qa. rebuild_required=true — ops rebuild+swap then qa live-verify per docs/protocols/docker-deployment-runbook.md § Microservice Code-Change Close Gate."
  }
