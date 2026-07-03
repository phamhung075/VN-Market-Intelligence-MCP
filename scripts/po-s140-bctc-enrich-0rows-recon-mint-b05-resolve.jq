# po-s140 — single-pass DUAL-mutation single-signal triage (idempotent):
#   M1 id-guarded MINT of a PLAN-ONLY ops recon SPIKE -> .task_board.backlog[] for the
#      B-05 "bctc enrich returns 0 tables" extraction-pipeline stall (distinct root from the
#      pending bank-mapping rebuild and from BCTC-ENRICHER-OLD-QUARTERS 0-URLs case).
#   M2 RESOLVE the source signal_queue row (status NEW/READ -> RESOLVED + resolution note).
# Reusable pattern for "a corroborated-real anomaly signal that is ops/deploy-gated (NOT a
# dev coding lane) -> record it PLAN-ONLY in backlog + resolve its source row, atomic."
# Origin 2026-07-03 dev-team tick T18:37Z, signal sau-1783103887 (system-auditor B-05 WARN).
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ); jq --arg now "$NOW" \
#   -f scripts/po-s140-bctc-enrich-0rows-recon-mint-b05-resolve.jq \
#   docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# (orch-apply does Zod + dup-key + CAS + atomic rename; PUSH HELD — fleet-push timer pushes.)

def has_id($id):
  any(.task_board[]? | select(type == "array") | .[]? | select(type == "object") | .id; . == $id);

.task_board.backlog += (
  if has_id("RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL") then []
  else [{
    id: "RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL",
    title: "bctc enrich returns 0 tables (bctc_table_rows=0 AND bctc_md_tables=0) for ~18 Q4-2025 tickers across ALL sectors — extraction/OCR pipeline stall behind B-05 SLA breach (36-item queue)",
    owner: "ops",
    next_agent: "ops",
    type: "SPIKE",
    status: "BACKLOG",
    zone: "infra-vps",
    priority: "high",
    created_at: $now,
    status_note: "PLAN-ONLY recon. RAW-verified 2026-07-03 via WORK channel: NOT terminal url_not_found — queue actively churning, every enrich_failed with bctc_table_rows=0 AND bctc_md_tables=0 (ACB/BID/DHG/EIB/D2D/GAS/GVR/HCM/HSG/MBB/NKG/POW/SSI/VCI/VHM/VIC/VPB/VRE — all sectors). DISTINCT from pending bank-mapping rebuild (2cd9e105/a46131cf fix wrong VALUES, not 0-tables) and from BCTC-ENRICHER-OLD-QUARTERS (0-URLs pre-Q4-2025). Diagnose extraction path first: VPS PDF-extractor/OCR liveness + PDF-Extract-Kit + bctcPdfPull extraction step. Corroborated by bctc-analyst MBB Q1-2026 coverage-gap. DEPLOY-GATE: any mcp-server code fix batches with the pending ROBUST rebuild (pdfpull-guard + COLUMN-ORDER CTG). Source: sau-1783103887 (B-05 WARN) + telegram 3438 (CRITICAL) / 3440 (B-13).",
    provenance: "(router-dispatched)"
  }]
  end
)
| .signal_queue.rows |= map(
    if .id == "sau-1783103887" and (.status == "NEW" or .status == "READ")
    then .status = "RESOLVED"
       | .resolution = "routed-to RECON-BCTC-ENRICH-0ROWS-EXTRACTION-STALL (PLAN-ONLY backlog, ops); corroborated-real extraction stall; ops/deploy-gated, not a dev coding lane"
       | .resolved_at = $now
    else . end
  )
| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "po"
