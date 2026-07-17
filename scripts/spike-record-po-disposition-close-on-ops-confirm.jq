# orch-state mutation: record PO disposition (close-on-ops-confirm) into SPIKE row — makes post-market close self-documenting.
# Route: jq -f scripts/spike-record-po-disposition-close-on-ops-confirm.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
.task_board.in_progress[0].disposition = {
  by: "PO final sign-off (router-recorded; router owns SPIKE row write this cycle)",
  at: "2026-07-17T03:10Z",
  decision: "close-on-ops-confirm — SPIKE has NO remaining diagnostic deliverable; all branches tracked outside the SPIKE (AC-1 clear; AC-2 PEK = infra recovery APPLIED+pre-verified; AC-2 refine = folded; AC-3 circuit-breaker already done_verified+archived). NOT converted to FIX — durable-guard hardening lives in its own PLAN-ONLY row.",
  close_predicate: "post-market ~09:05Z bctcExtractReconcileJob run: bctc_layout_units MAX advances past 2026-06-10 AND new rows land => a dev-team tick after ~09:05Z RAW-verifies serving-plane + flips SPIKE to done_verified (executing PO's pre-authorized sign-off, NOT router self-cert). Self-verifying: if fix worked the reconcile-exhausted report flood stops; if not it re-surfaces + anomaly detector re-flags.",
  refine_half: "folded -> FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP.spike_fold_20260717 (PENDING regressed 151->181, 3rd+ recurrence of session-scoped-CronCreate-dormancy class, priority high, schedule immediately after PEK resumes; sole remaining convergence lever for refined bctc_table_rows)",
  durable_guard: "FIX-INFRA-CRITICAL-VOLUME-PRESENCE-HEALTHCHECK minted PLAN-ONLY backlog (ops, high, supervised) — same 2026-07-15 VM-rebuild wiped TWO volumes (market_data + pek_model_cache), only one caught; guard asserts producer-critical volumes contain REQUIRED CONTENT (not just mount/du>0), boot+periodic, fail-loud, optionally auto-invokes scripts/pek-fetch-weights.sh; manifest SSOT-driven"
}
| .head.updated_at = "2026-07-17T03:10Z"
| .head.updated_by = "router (PO disposition recorded: close-on-ops-confirm; PEK proof deferred ~09:05Z; refine folded; volume-presence guard minted PLAN-ONLY; tick 2026-07-17T02:37Z complete)"
| (if (.task_board | has("head")) then
     .task_board.head.updated_at = "2026-07-17T03:10Z"
     | .task_board.head.updated_by = "router (PO disposition close-on-ops-confirm recorded; tick 02:37Z complete)"
   else . end)
