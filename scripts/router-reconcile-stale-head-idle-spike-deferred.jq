# orch-state mutation: reconcile stale dual-head -> idle.
# Cause: SPIKE .head.next_agent="ops" is a COMPLETED-WORK RESIDUAL — ops PEK re-seed finished + recorded
# in row.ac2_remediation (pek_reseed SUCCESS, crash_fixed differential proof) at 03:04Z; last tick's
# disposition jq bumped .head.updated_by but never cleared status/next_agent, so pipeline-resume would
# re-spawn ops every tick for ~6h. The SPIKE's only remaining work is the DEFERRED post-market ~09:05Z
# router RAW-verify (not an ops spawn; market open until 08:00Z => /pek-extract 503 guard, no rows land yet).
# Reset head->idle stops the wasteful re-spawn loop; SPIKE stays honestly parked in in_progress lane with
# its PO-authorized close-on-ops-confirm disposition intact (NOT a status certification, dispatch-state only).
# Route: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" -f scripts/router-reconcile-stale-head-idle-spike-deferred.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
.head.status = "idle"
| .head.active_task_id = null
| .head.next_agent = null
| .head.updated_at = $now
| .head.updated_by = "router (stale-head reconcile: SPIKE next_agent=ops was completed-work residual — ops PEK re-seed done+recorded ac2_remediation; SPIKE parked in_progress awaiting DEFERRED post-market ~09:05Z RAW-verify proof, not an ops spawn; head->idle stops per-tick ops re-spawn loop; tick 2026-07-17T03:07Z)"
| .head.note = "SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD parked in_progress; close DEFERRED to post-market ~09:05Z bctcExtractReconcileJob run (close_predicate + pending_proof in in_progress[0].disposition/ac2_remediation). Self-verifying: reconcile-exhausted report flood re-surfaces if fix failed (auto-reopen via triage); if fix worked flood stops. A future post-09:05Z tick RAW-verifies bctc_layout_units MAX advances past 2026-06-10 + new rows land, then flips SPIKE done_verified per PO pre-authorized sign-off."
| (if (.task_board | has("head")) then
     .task_board.head.status = "idle"
     | .task_board.head.active_task_id = null
     | .task_board.head.next_agent = null
     | .task_board.head.updated_at = $now
     | .task_board.head.updated_by = "router (stale-head reconcile to idle; SPIKE parked deferred ~09:05Z; tick 03:07Z)"
   else . end)
