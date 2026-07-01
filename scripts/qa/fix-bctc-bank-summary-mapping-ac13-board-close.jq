# FIX-BCTC-BANK-SUMMARY-MAPPING — terminal qa AC-13 sprint-close board flip
# Context: single mcp-server rebuild verified (image 33fea3ba.../container 715ea5bbe6d1,
#   W2/W3 markers confirmed present inside the running image), CTG re-ingest attempted
#   (report_id=96e36139-5dac-414d-8e4d-20a4725890d1) — BLOCKED (exit 3, data-loss guard:
#   56/56 bctc_refined_units FAILED/empty-markdown, no DONE window to safely finalize).
#   Live 3-serve-tool verify (get_financial_summary/get_bctc_full/compare_financials) run
#   directly against the rebuilt running server for CTG + non-regression VCB/FPT/HPG/VNM.
#   Full evidence: reports/TASK_REPORT_FIX-BCTC-BANK-SUMMARY-MAPPING-AC13.md
#
# W1-W4: AC's fully verified (unit tests 55/55 pass, tsc 0 errors, live-serve behavior
#   correct on rebuilt image, no regression) -> flip review -> done_verified.
# W5: AC-6 unit-verified GREEN but its live-path (validation_status refresh) and AC-10
#   (CTG total_assets unfreeze) both require finalize_bctc_refine to actually run against
#   real CTG data, which is the SAME blocked re-ingest operation -> stays BLOCKED, not
#   flipped to done_verified (partial close; overclaiming avoided).
#
# Usage: jq --arg now "$NOW" -f scripts/qa/fix-bctc-bank-summary-mapping-ac13-board-close.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: array-shape preserved on both lanes; rows mutated via map()/select(), never
#   hand-rebuilt; head mutated by field-add only (.note) — status/active_task_id/next_agent
#   untouched (head currently owned by a concurrent, unrelated dev-team cycle).

def w1id: "TASK-W1-FIX-BCTC-BANK-SUMMARY-MAPPING-GUARD";
def w2id: "TASK-W2-FIX-BCTC-BANK-SUMMARY-MAPPING-ROW-REPAIR";
def w3id: "TASK-W3-FIX-BCTC-BANK-SUMMARY-MAPPING-SECTION-GUARD";
def w4id: "TASK-W4-FIX-BCTC-BANK-SUMMARY-MAPPING-AGGREGATOR-FIXTURES";
def w5id: "TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST";
def greenIds: [w1id, w2id, w3id, w4id];

def reportRef: "reports/TASK_REPORT_FIX-BCTC-BANK-SUMMARY-MAPPING-AC13.md";

# 1. Move the 4 GREEN rows: review[] -> done_verified[] with qa fields added.
(.task_board.review | map(select(.id as $i | greenIds | index($i) != null))
  | map(
      .status = "DONE_VERIFIED"
      | .qa_ac13_verified_at = $now
      | .qa_ac13_verified_by = "qa (AC-13 terminal sprint-close)"
      | .qa_ac13_report_ref = reportRef
    )
) as $flipped
| .task_board.done_verified += $flipped
| .task_board.review = [ .task_board.review[] | select(.id as $i | greenIds | index($i) == null) ]

# 2. W5 stays in review[] — mutate in place to BLOCKED (AC-10 genuinely blocked).
| .task_board.review = [
    .task_board.review[]
    | if .id == w5id then
        .status = "BLOCKED"
        | .qa_ac13_verified_at = $now
        | .qa_ac13_report_ref = reportRef
        | .qa_ac13_note = "AC-6 (validation_status truthful hard-block) unit-verified GREEN (55/55 pass incl TASK-W5 test file) but its live-path and AC-10 (CTG total_assets unfreeze) both require finalize_bctc_refine to run against real CTG data. reingest-bctc-report.ts --report-id 96e36139-5dac-414d-8e4d-20a4725890d1 REFUSED (exit 3): 56/56 bctc_refined_units are FAILED/empty-markdown (0 DONE-with-markdown windows) — data-loss guard correctly refuses to wipe existing bctc_table_rows for nothing. total_assets remains frozen at 0 (RAW-probed on named volume market.db post-rebuild). Remedy (per script's own printed step, out of qa scope): fresh agentic-refine transcription pass for this report_id (get_bctc_pending_refine + push_bctc_refined_unit x56 windows) is dev-mcp-server/bctc-analyst domain work, not fabricated here (no-fake-data policy)."
        | .blocked_on = "Fresh agentic-refine transcription pass for report_id=96e36139-5dac-414d-8e4d-20a4725890d1 (CTG 2026-Q1) — mint a follow-up task, not further qa review."
      else . end
  ]

# 3. Board bookkeeping bump (standard writer convention).
| .task_board._updated_at = $now
| .task_board._updated_by = "qa"

# 4. head.note — additive only, does not disturb the concurrent head cycle's
#    status/active_task_id/next_agent/next_action/updated_by/updated_at.
| .head.note = "[qa " + $now + "] FIX-BCTC-BANK-SUMMARY-MAPPING AC-13 terminal sprint-close: W1-W4 done_verified (single mcp-server rebuild confirmed — image 33fea3ba.../container 715ea5bbe6d1, W2/W3 source markers present in running image; 55/55 unit tests + tsc 0 errors; live 3-serve-tool probe on CTG shows identity guard correctly hard-blocking corrupt total_assets=0 across get_financial_summary/get_bctc_full/compare_financials; VCB/FPT/HPG/VNM non-regression confirmed, values plausible, VNM's pre-existing PENDING/no-refine-units state correctly honest-NULL-blocked, not a new regression). W5 BLOCKED: AC-10 CTG re-ingest refused exit 3 (56/56 windows FAILED/empty-markdown) — needs a fresh agentic-refine transcription task, out of qa scope, not fabricated. Full evidence: " + reportRef
