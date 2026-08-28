# scripts/architect-bctc-data-gap-family-lane-move.jq
# FIX-BCTC-DATA-GAP-FAMILY: architect design complete → lane-move backlog[] → review[],
# next_agent=developer (chain contract: po → architect → developer → qa).
# Corrects the stale files[] hint ("tools/bctc" does not exist; actual tools live in
# tools/financial-reports/) and stamps architect_review_note + updated_by.
# Applied via: jq -f <this> docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.backlog[] | select(.id == "FIX-BCTC-DATA-GAP-FAMILY")) as $row
| .task_board.backlog = [.task_board.backlog[] | select(.id != "FIX-BCTC-DATA-GAP-FAMILY")]
| .task_board.review = (.task_board.review + [
    {
      id: "FIX-BCTC-DATA-GAP-FAMILY",
      title: $row.title,
      owner: "po",
      next_agent: "developer",
      zone: "multi",
      priority: "P1",
      size: "L",
      type: "FIX",
      status: "REVIEW",
      files: [
        "apps/mcp-server/src/interface/mcp/tools/financial-reports",
        "apps/mcp-server/src/application/usecases",
        "apps/mcp-server/src/scheduler/financial-reports",
        "apps/mcp-server/src/infrastructure/db",
        "apps/mcp-server/src/domain/services/financial-reports"
      ],
      status_note: $row.status_note,
      origin_signal_id: $row.origin_signal_id,
      architect_review_note: "DESIGN COMPLETE — brief: docs/architecture-briefs/2026-08-28-fix-bctc-data-gap-family.md. 7 work units (U1-U7) from LIVE root-cause evidence (data/live/market.db + container logs): U1 queue-liveness (enricher Arm-2 attempts<6 bound excludes the url_not_found rows it terminalizes at attempts=6; 293 deferred_infra NULL-URL rows unreachable by all arms; pull-job URL prefix excludes owa.hnx.vn) — do FIRST; U2 governance-report discovery filter (BID 2025-Q4 queue row poisoned with BaoCaoQuanTri URL); U3 period-mismatch durable quarantine + recovery (BID runPipeline-null loop, live 2026-08-27/28); U4 income-broken-with-assets corrupt guard (HPG OP=0 42nd+; SUPERSEDES sibling FIX-BCTC-NONBANK-OPERATING-PROFIT-EBITDA-SCALAR-ZERO-HPG — do not land both); U5 scale-corruption guard (VNM/VEA assets~1e6x too small pass identity guard); U6 serve-stage diagnostics (keep exact 'Chưa có dữ liệu BCTC' string for true-absent case — bctc-analyst contract); U7 refine-liveness coordination only (defer to ops row FIX-BCTC-REFINE-DURABLE-TRIGGER-BACKSTOP, no duplicate trigger). Sequence U1→U6 in order; U7 coordination. No file collision with size-lint sibling FIX-PREPUSH-SIZELINT-6-OFFENDERS (verified: this design touches none of its 6 offender files; bctcIdentityGuard.ts/ZeroExtractBlocklist.ts near 120L cap — keep <=120L or add size-justification header). Zone correction: row files[] hint 'tools/bctc' does not exist — actual tools in tools/financial-reports/. BUILD-STANDARD: not-applicable. NEXT: developer implements U1→U6.",
      updated_at: "2026-08-28T23:52:00Z",
      updated_by: "architect",
      created_by: "po"
    }
  ])
