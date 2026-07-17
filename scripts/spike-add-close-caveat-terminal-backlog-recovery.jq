# orch-state mutation: add a no-false-green close_caveat to the in-flight SPIKE row.
# Grounded in disposed duplicate reports 3498 (SAB 2024-Q1) + 3499 (VND 2024-Q1): both say the reconcile
# job marks queue rows enrich_failed=TERMINAL during the market-hours PEK-503 window, and advise "consider
# manual /api/trigger-pek-extract re-fire once root cause fixed" => terminal rows may NOT auto-retry post-market.
# This TIGHTENS PO's close-on-ops-confirm predicate (verify BACKLOG recovery, not just new rows) — does NOT
# override PO's decision to close, does NOT re-activate dispatch (head stays idle).
# Route: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/spike-add-close-caveat-terminal-backlog-recovery.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
.task_board.in_progress[0].close_caveat = {
  by: "router (tick 2026-07-17T04:07Z; from disposed dup reports 3498 SAB / 3499 VND, both 2024-Q1 enrich_failed=terminal)",
  at: $now,
  concern: "bctcExtractReconcileJob marks queue rows enrich_failed=TERMINAL after 8 passes during the market-hours PEK-503 window (SAB report_id 1f6cbffe-7383-4be2-85bd-676a5183c5ae, VND report_id 11d8b60f-69e8-4f7e-8e3c-034d44249c70, + earlier VJC/DBC/VIX/SHB/BSR cluster). Reports advise manual /api/trigger-pek-extract re-fire once root cause fixed => terminal rows may NOT auto-retry after PEK resumes post-market.",
  verify_at_close: "post-market ~09:05Z close must ALSO confirm the terminal enrich_failed BACKLOG rows re-extract (bctc_layout_units gains rows for the failed 2024-Q1 tickers), NOT ONLY that MAX(extracted_at) advances + fresh PDFs land. Else FALSE-GREEN: close goes green off new PDFs while the ~2-day dormancy backlog stays permanently enrich_failed. If terminal rows do not auto-recover, an ops manual re-fire is required BEFORE flipping done_verified.",
  scope: "verification-rigor addition to PO close-on-ops-confirm (no-false-green); NOT a decision override, NOT a re-dispatch — head stays idle, SPIKE stays parked until the deferred proof."
}
| .head.updated_at = $now
| .head.updated_by = "router (added no-false-green close_caveat to SPIKE: verify terminal enrich_failed backlog recovery at ~09:05Z close, not just new-rows; head stays idle; tick 2026-07-17T04:07Z)"
