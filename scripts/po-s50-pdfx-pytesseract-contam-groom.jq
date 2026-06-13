# po-s50-pdfx-pytesseract-contam-groom.jq
# Groom FIX-PDFX-PYTESSERACT-CONTAMINATION into .task_board.backlog[] as READY.
# Free-zone (apps/pdf-extractor), test_only + no_rebuild. mcp-server FROZEN — untouched.
# Usage (atomic):
#   tmp=$(mktemp)
#   jq -e -f scripts/po-s50-pdfx-pytesseract-contam-groom.jq \
#     --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     docs/data/orch/orch-state.json > "$tmp" \
#     && [ -s "$tmp" ] && mv "$tmp" docs/data/orch/orch-state.json
#
# Idempotent: removes any pre-existing same-id entry before appending.

.task_board.backlog |= (
  map(select((.id // "") != "FIX-PDFX-PYTESSERACT-CONTAMINATION"))
  + [{
      id: "FIX-PDFX-PYTESSERACT-CONTAMINATION",
      title: "Restore sys.modules['pytesseract'] unconditionally in test_ocr_backends.py to stop cross-test import poisoning",
      owner: "dev-pdf-extractor",
      status: "READY",
      zone: "apps/pdf-extractor/",
      type: "FIX",
      size: "XS",
      priority: "P1",
      test_only: true,
      no_rebuild: true,
      blocked_by: [],
      created_at: $now,
      created_by: "po",
      root_cause: "test_ocr_backends.py:558 `saved = sys.modules.pop(\"pytesseract\", None)` restores ONLY `if saved is not None` (line 565). When pytesseract was not previously imported, the module stays ABSENT from sys.modules after the test, poisoning later tests that import it. Victim: integration/test_extract_md_tables_fpt.py:97 `import pytesseract` → test_ac3_table_count_ge2 (line 167) and test_ac3_each_table_is_valid_pipe_table (line 184) fail with `cannot import name 'Output' from 'pytesseract'`. Root-cause RAW-proven by QA isolation run: `2 passed in 79.42s`.",
      fix_recipe: "Restore sys.modules['pytesseract'] UNCONDITIONALLY (try/finally that re-inserts even when saved is None is wrong — instead delete the key only if it was absent, or use `patch.dict(\"sys.modules\", {\"pytesseract\": None})` which scopes the absence to the test correctly and auto-restores prior state). Prefer patch.dict over manual pop/restore.",
      acceptance: [
        "test_ac3_table_count_ge2 and test_ac3_each_table_is_valid_pipe_table (integration/test_extract_md_tables_fpt.py) PASS in full-suite run order, not just isolation",
        "grep-proof: no remaining bare `sys.modules.pop` in test_ocr_backends.py without an unconditional/scoped restore (manual pop/restore replaced or guarded)",
        "Full apps/pdf-extractor suite residual failures drop from 4 to 2 — only the 2 @pytest.mark.slow container-only real-OCR tests remain (legit host-skips)",
        "Diff is test-files-only: production src under apps/pdf-extractor/ unchanged; no Dockerfile/compose/requirements change",
        "no_rebuild honored — no container rebuild needed (test-only change)"
      ],
      evidence_refs: [
        "apps/pdf-extractor/__tests__/test_ocr_backends.py:558-566",
        "apps/pdf-extractor/__tests__/integration/test_extract_md_tables_fpt.py:97,167,184"
      ],
      note: "Continues killing pdf-extractor CI-red class (follow-up to FIX-PDFX-TEST-LOOP-POLLUTION, commit 27d09912). QA-isolated hand-off. Free zone — apps/mcp-server FROZEN until EVIDENCE-ACCUM-SILENT-CRON 16:00Z gate; not touched."
    }]
)
| .task_board._updated_at = $now
| .task_board._updated_by = "po"
| ._updated_at = $now
| ._updated_by = "po"
