# po-s141 — dev-team fire-tick 2026-07-03T21:37Z PO triage (router-dispatched)
# ENRICH + PROMOTE the existing SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO backlog row.
# Trigger: bctc-analyst data-quality-scope-update signal (rotation probe c076) —
#   newly-confirmed corrupt zero total_assets on HSG + MWG (scope 6->8 non-bank
#   tickers). No dup minted — enrich the single existing zero-assets SPIKE row.
# Decision: promote BACKLOG->TODO (recurring-bug-escalation + ~45% coverage loss;
#   architect-first root-cause SPIKE, low-cost single time-boxed agent).
# Apply via: jq -f scripts/po-s141-...jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
.task_board.backlog |= map(
  if .id == "SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO" then
    .status = "TODO"
    | .title = "Consolidate root-cause of Q1-2026 total_assets=0 across 8 non-bank tickers (VHM/REE/VIC/VNM/VRE/POW/HSG/MWG)"
    | .question = "Do the now-8 non-bank tickers VHM/REE/VIC/VNM/VRE/POW + newly-confirmed HSG/MWG (Q1-2026 total_assets EXACTLY 0) share ONE root cause? Signature = total_assets=0 / confidence forced 0% / CORRUPT-SKIP served by get_bctc_full. Test the COMMON-ROOT-CAUSE hypothesis FIRST (same reparse batch/date — bctc-analyst c076 flag): are these reports all from one failed reparse cohort? Then classify each residual (column-separated OCR layout / missing BS section-total codes 100-400 / failed refine windows / OCR quality) and map to existing owners (FIX-REE-BS-SECTION-REGEX for REE, SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT for VNM, W5-FU/CTG agentic-refine-repass pattern) OR flag NEW. DISTINCT from FIX-BCTC-BANK-SUMMARY-MAPPING (a46131cf/2cd9e105 — that produced implausible NONZERO bank totals; THIS is exactly ZERO, a different extraction-failure mode). Output a CONSOLIDATED remediation batch — do NOT mint duplicate per-ticker FIX tasks."
    | .scope_widened = "6->8 non-bank tickers: added HSG, MWG (bctc-analyst rotation probe c076, 2026-07-03)"
    | .promoted_at = "2026-07-03T21:37:00Z"
    | .promoted_by = "po"
    | .promotion_reason = "recurring-bug-escalation (BCTC zero-total-assets class >2 cycles) + ~45% BCTC-coverage loss on DA NOP tickers; architect-first SPIKE is low-cost single time-boxed agent; in_progress lane empty (no contention)"
    | .status_note = "Self-initiated from telegram#3368 (bctc-analyst WARNING, 2026-07-01T21:21Z): 6 non-bank tickers all total_assets=0 for Q1-2026, same signature as CTG (c069), DISTINCT from the bank-only FIX-BCTC-BANK-SUMMARY-MAPPING sprint. No task owns this holistically today; coverage is piecemeal (REE-regex, VNM-column-spike). Time-box 120m diagnosis -> consolidated remediation plan; reconcile against existing partial tasks before any per-ticker FIX. Report_ids: VHM/REE/VIC/VNM/VRE/POW-Q1-2026. | 2026-07-03T21:37Z ENRICH+PROMOTE (router-dispatched): bctc-analyst data-quality-scope-update (rotation probe c076, 11 tickers, 0/11 usable except known-good GVR) newly CONFIRMED corrupt zero total_assets on HSG + MWG -> scope widened 6->8 non-bank tickers. Combined corrupt+empty now ~13+/29 DA NOP tickers (~45%) unusable for BCTC analysis. Telegram corroboration: reports 3487 (VCI 2025-Q4 composite=0.10) + 3488 (DHG 2025-Q4 composite=0.00) same OCR-corruption class (perpetual-resurface per FIX-TELEGRAM-REPORT-ACK-STATUS-STOP-RESURFACE; NO new task). Promoted BACKLOG->TODO: recurring-bug-escalation (>2 fix cycles in BCTC zero-assets class) + high coverage impact justify dispatching the architect-first root-cause SPIKE now."
  else . end
)
| .task_board.last_triaged_at = "2026-07-03T21:37:00Z"
| .task_board.last_triaged_by = "po"
