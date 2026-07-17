# orch-state mutation: record SPIKE AC-2 root-cause finding + reassign to ops for PEK re-seed remediation.
# Route: jq -f scripts/spike-record-ac2-finding-dispatch-ops-po.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
.task_board.in_progress[0].ac2_finding = {
  by: "dev-mcp-server AC-2; router git-verified commit 60bdca243 (doc-only, +115L, no code/peer sweep)",
  at: "2026-07-17T02:59Z",
  verdict: "ROOT CAUSE FOUND — two independent dormant producers feeding bctcExtractReconcileJob 3-way OR success check; neither satisfied since ~06-30 => mass enrich_failed sweep + report-duplicate flood",
  crons_ok: "bctcPdfPullJob(*/30) + bctcExtractReconcileJob(5,35) both registered + firing status=success every tick (RAW cron_job_runs) — NOT a liveness/registration problem",
  pek_cause: "/pek-extract crashes EVERY call: FileNotFoundError doclayout_yolo_ft.pt — pek_model_cache named volume EMPTY (du 12K, stray yolo/settings.yaml only), wiped by SAME 2026-07-15 VM-rebuild that destroyed market_data (AC-1), never re-seeded",
  pek_fix: "ops re-run scripts/pek-fetch-weights.sh (idempotent; commit e418d606d; brief docs/architecture-briefs/2026-05-27-pek-weights-provisioning.md) + verify post-fetch /pek-extract logs successful model load; HF/ModelScope reachable now; low-risk populate-empty-volume, NOT a destructive swap",
  refine_cause: "agentic-refine half still dormant (bctc_refined_units MAX 2026-06-30; refine_status PENDING 181 vs 151 at 07-12) — pre-existing session-scoped-trigger fragility",
  refine_disposition: "FOLD into FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP (backlog, unshipped) — NO new mint; PO to groom",
  dispatch: "ops => PEK volume re-seed (convergence lever); PO => fold refine half + SPIKE disposition",
  unverified: "refine-bctc-slot-1 armed-vs-inert; PaddleOCR lazy-download weights presence; exact crash->rebuild->fix minute sequencing",
  doc: "docs/spikes/SPIKE-BCTC-EXTRACTION-DORMANT-MASS-ENRICHFAIL-FLOOD.md @60bdca243"
}
| .task_board.in_progress[0].owner = "ops"
| .task_board.in_progress[0].next_agent = "ops"
| .head.next_agent = "ops"
| .head.updated_at = "2026-07-17T02:59Z"
| .head.updated_by = "router (AC-2 root-caused: PEK pek_model_cache volume-wipe primary + refine-fold; dispatched ops PEK re-seed + PO fold; tick 2026-07-17T02:37Z)"
| (if (.task_board | has("head")) then
     .task_board.head.next_agent = "ops"
     | .task_board.head.updated_at = "2026-07-17T02:59Z"
     | .task_board.head.updated_by = "router (AC-2 root-caused PEK volume-wipe + refine-fold; ops re-seed + PO fold dispatched)"
   else . end)
