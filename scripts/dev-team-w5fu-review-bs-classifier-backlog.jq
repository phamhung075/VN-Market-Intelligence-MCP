# W5-FU-CTG-REFINE-96e36139 — reingest executed, DoD blocked by NEW bug → review flip + follow-up FIX backlog row
# Context: refine loop COMPLETE (56/56 DONE, finalize ok rows_parsed=440). STEP2 reingest --apply ran
#          clean (guard passed, VCB/FPT byte-identical non-regression) but CTG total_assets stayed 0:
#          finalize_bctc_refine's balance-sheet section classifier drops unit-0002 (pages 4-5, all 34
#          rows incl. TONG TAI SAN CO=2,924,176,928 trieu) and mistags unit-0003 (8/29 rows as
#          'general'). RAW-corroborated by dispatcher: 0 balance_sheet-tagged rows (vs VCB 57),
#          0 rows for pages 4-5, total_assets=0 post-apply.
# Usage: jq --arg now "$NOW" -f scripts/dev-team-w5fu-review-bs-classifier-backlog.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: array-shape preserved; W5-FU object mutated via select/map, never rebuilt.

def w5fuid: "W5-FU-CTG-REFINE-96e36139";
def fuid: "FIX-BCTC-BANK-BS-SECTION-CLASSIFIER";

# 1. Append mutated W5-FU row to review[]
.task_board.review += [
  .task_board.in_progress[]
  | select(.id == w5fuid)
  | .status = "REVIEW"
  | .review_note = ("[dispatcher " + $now + "] EXECUTED, DoD BLOCKED by NEW bug -> " + fuid + ". Refine 56/56 DONE finalized (rows_parsed=440, effective_status=PARTIAL/BEG7-override). STEP2 reingest --apply exit 0, guard passed, finalize re-ran DELETE+INSERT (440 bctc_table_rows). Non-regression PASS: VCB/FPT byte-identical before/after. DoD NOT MET: CTG total_assets still 0 — NOT a refine failure: refined markdown contains TONG TAI SAN CO=2,924,176,928 (trieu, =2.924e15 VND, internally consistent with unit-0003 NO PHAI TRA+VON CHU SO HUU sum). Root cause: finalize section classifier drops all unit-0002 rows (pages 4-5 absent from bctc_table_rows) and mistags unit-0003 (8/29 as general); 0 balance_sheet-tagged rows vs VCB 57. RAW-corroborated by dispatcher post-apply. Residual scars carried to QA notes: unit-0002 row-misalignment flags, unit-0035/unit-0051 honest-NULLs (designed PASS).")
]
# 2. Remove W5-FU from in_progress[]
| .task_board.in_progress = [ .task_board.in_progress[] | select(.id != w5fuid) ]
# 3. Follow-up FIX task (idempotent: only append if absent)
| if ([.task_board.backlog[] | select(.id == fuid)] | length) == 0 then
    .task_board.backlog += [{
      id: fuid,
      status: "BACKLOG",
      title: "CTG B02a/TCTDHN: finalize_bctc_refine balance-sheet section classifier drops/mistags rows — total_assets frozen 0 despite correct refined markdown",
      owner: "dev-team",
      next_agent: "dev-mcp-server",
      type: "FIX",
      zone: "apps/mcp-server/",
      priority: "high",
      created_at: $now,
      created_by: "dev-team-dispatcher",
      parent_task: w5fuid,
      related: ["FIX-REE-BS-SECTION-REGEX", "SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO", "FIX-BCTC-BANK-SUMMARY-MAPPING"],
      status_note: "Report 96e36139-5dac-414d-8e4d-20a4725890d1 (CTG 2026-Q1). Markdown->bctc_table_rows materialization in finalize_bctc_refine drops the bank-form balance sheet: unit-0002 (pages 4-5, TAI SAN side, 34 rows, ends TONG TAI SAN CO=2,924,176,928 trieu) entirely absent; unit-0003 (page 6, NGUON VON side) only 8/29 rows survive, mistagged statement_section=general. Post-apply sections: cash_flow=35 general=399 notes=6, balance_sheet=0 (VCB same-form baseline: 57). Suspected trigger: B02a/TCTDHN shape — Roman-numeral item hierarchy, mostly-blank Ma(Code) column, bold section headers (**A. TAI SAN** / **B. NO PHAI TRA VA VON CHU SO HUU**). ALSO fix wrong-row frozen scalars from prior pass: equity_total=244,904,306 is actually Section-7 note total (correct 188,692,158); total_liabilities=24,735,484,770 vs correct 2,735,484,770. DoD: after classifier fix, re-run scripts/migrations/reingest-bctc-report.ts --apply for this report_id -> balance_sheet rows >0 incl. pages 4-5; CTG total_assets=2,924,176,928 (trieu-dong unit as stored per peer VCB=2,550,963,342); equity_total/total_liabilities corrected; FR-5 identity passes; VCB/FPT byte-identical non-regression. Diagnosis evidence: STEP2 worker run 2026-07-02T00:1xZ + dispatcher RAW-probes."
    }]
  else . end
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
