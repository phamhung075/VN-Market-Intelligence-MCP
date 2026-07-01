# FIX-BCTC-BANK-SUMMARY-MAPPING AC-13 — corrective patch (SSOT-W1-ORCH-APPLY-WRAPPER).
# The board-close pass mistakenly wrote qa_ac13 fields onto task_board.head, which is a
# DEPRECATED STUB (G-7: "task_board.head must remain a stub" — schema comment
# apps/mcp-server/src/infrastructure/orchStateSchema.ts:265-286). Routing/note fields
# belong ONLY on the canonical top-level .head (HeadSchema). This patch:
#   1. Reverts task_board.head to its pre-existing stub shape (drops the stray .note).
#   2. Sets the CANONICAL top-level .head to idle + honest AC-13 outcome note — safe
#      because .head.active_task_id already equals this exact task
#      (TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST), i.e. this qa run
#      IS the owner of the current head cycle, not a concurrent unrelated one.
#
# Usage: jq --arg now "$NOW" -f scripts/qa/fix-bctc-bank-summary-mapping-ac13-head-fix.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

def note_text:
  "[qa " + $now + "] FIX-BCTC-BANK-SUMMARY-MAPPING AC-13 terminal sprint-close COMPLETE (PARTIAL/GREEN): " +
  "W1-W4 done_verified — single mcp-server rebuild confirmed (image 33fea3ba.../container 715ea5bbe6d1, " +
  "W2/W3 source markers present in running image; 55/55 sprint unit tests + tsc 0 errors; live 3-serve-tool " +
  "probe (get_financial_summary/get_bctc_full/compare_financials) on rebuilt server shows identity guard " +
  "correctly hard-blocking corrupt CTG total_assets=0 across all 3 paths; VCB/FPT/HPG/VNM non-regression " +
  "confirmed — values plausible, VNM's pre-existing PENDING/zero-refined-units state correctly honest-NULL " +
  "blocked (not a new regression)). W5 BLOCKED — AC-10 CTG re-ingest (report_id=96e36139-5dac-414d-8e4d-" +
  "20a4725890d1) refused exit 3 by reingest-bctc-report.ts's own data-loss guard (56/56 bctc_refined_units " +
  "FAILED/empty-markdown, 0 DONE-with-markdown windows) — needs a fresh agentic-refine transcription task " +
  "(dev-mcp-server/bctc-analyst scope, not fabricated here). Full evidence: " +
  "reports/TASK_REPORT_FIX-BCTC-BANK-SUMMARY-MAPPING-AC13.md";

# 1. Revert the deprecated stub — drop the stray note field added in error.
del(.task_board.head.note)

# 2. Canonical top-level head → idle, honest outcome note.
| .head = {
    status: "idle",
    active_task_id: null,
    next_agent: null,
    updated_by: "qa",
    updated_at: $now,
    note: note_text
  }
