# orch-state mutation: record ops PEK re-seed remediation (applied + pre-verified) with post-market proof checkpoint.
# Route: jq -f scripts/spike-record-ac2-remediation-pek-reseed.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
.task_board.in_progress[0].ac2_remediation = {
  by: "ops (PEK re-seed) + router docker-exec RAW spot-check corroborated",
  at: "2026-07-17T03:04Z",
  pek_reseed: "SUCCESS — pek_model_cache 12K→78M; doclayout_yolo_ft.pt present 40,709,302 bytes at /app/PDF-Extract-Kit/models/Layout/YOLO/ + HF-cache blob (router-confirmed); pdf-extractor container Up healthy after plain restart",
  crash_fixed: "DIFFERENTIAL PROOF — /pek-extract now returns HTTP 503 market_open guard (VN 02:00-08:00Z) INSTEAD of pre-fix FileNotFoundError; PekEngineAdapter imports clean. Crash root cause eliminated.",
  restart: "plain single-service docker restart pdf-extractor-1 (allowed); NO rebuild/force-recreate/swap; topology preserved",
  pending_proof: "FINAL producer-resumption proof DEFERRED to post-market-close: next bctcExtractReconcileJob run ~09:05Z 2026-07-17 (after 08:00Z VN close). SUCCESS PREDICATE: MAX(extracted_at) in bctc_layout_units advances past 2026-06-10 AND new rows land. A dev-team tick after ~09:05Z RAW-verifies serving-plane + closes the PEK half. NOT marked un-dormant until rows land (no false green).",
  refine_half: "unchanged — folding into FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP (PO disposition in flight)"
}
| .head.updated_at = "2026-07-17T03:04Z"
| .head.updated_by = "router (AC-2 PEK re-seed APPLIED+pre-verified: crash eliminated, weights 40.7MB present; final producer proof deferred to post-market ~09:05Z reconcile; refine-fold via PO)"
| (if (.task_board | has("head")) then
     .task_board.head.updated_at = "2026-07-17T03:04Z"
     | .task_board.head.updated_by = "router (AC-2 PEK re-seed applied+pre-verified; final proof deferred to ~09:05Z; refine-fold via PO)"
   else . end)
