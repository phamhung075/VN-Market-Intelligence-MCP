# Router dev-team tick (fire-election 2026-07-03T21:37Z): dispatch SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO backlog[TODO] -> in_progress[] (owner=dev-mcp-server).
# PO a70bb83abf7e2994c RETURN BATCH (1 SPIKE, enriched+promoted existing row, scope 6->8 +HSG/MWG, no dup). Router RAW-verified PO commit c67cbfc82:
#   backlog row status=TODO type=SPIKE zone=apps/mcp-server/ next_agent=dev-mcp-server; 0 UUID; head idle; WIP=0; tree clean.
#
# SPIKE SCOPE (PO): consolidate root-cause of Q1-2026 total_assets=0 across 8 non-bank tickers (VHM/REE/VIC/VNM/VRE/POW/HSG/MWG).
#   Test COMMON-ROOT-CAUSE (same reparse batch/date, c076 flag) FIRST; classify residuals; map to existing owners
#   (FIX-REE-BS-SECTION-REGEX, SPIKE-BCTC-COLUMN-SEPARATED-LAYOUT, W5-FU repass) OR flag NEW. DISTINCT from FIX-BCTC-BANK-SUMMARY-MAPPING
#   (that = NONZERO bank totals; this = exactly ZERO extraction-failure mode). Output CONSOLIDATED remediation batch, NO per-ticker dup FIX.
#   Read-only architect-first diagnostic SPIKE (mode=spike, feature-spike.md). NO branch (project NO-branches + read-only), NO code change. Timebox 120m.
#   Deliverable: findings doc -> route to PO for consolidated remediation sprint decision.
#
# Guards: error if not in backlog[]; error if already in in_progress[].
# Usage: jq --arg now "$NOW" -f scripts/router-dispatch-spike-bctc-nonbank-zero-inprogress-20260703T2200.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.backlog | map(select(type=="object" and .id=="SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO"))[0]) as $t
| if $t == null then error("SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO not in backlog[] -- refuse to dispatch")
  elif ((.task_board.in_progress | map(select(type=="object" and .id=="SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO")) | length) > 0) then error("already in in_progress[] -- refuse dup")
  else . end
| .task_board.in_progress += [
    ($t + {
      status: "IN_PROGRESS",
      owner: "dev-mcp-server",
      dev_agent: "dev-mcp-server",
      dispatched_by: "router",
      dispatched_at: $now,
      dispatch_note: "[router 2026-07-03T22:00Z / fire-tick 21:37Z] dev-team Step 3 SPIKE (mode=spike, feature-spike.md). Spawn dev-mcp-server run_in_background (zone apps/mcp-server/ specialist). READ-ONLY architect-first diagnostic: do 8 non-bank tickers (VHM/REE/VIC/VNM/VRE/POW/HSG/MWG) with Q1-2026 total_assets=0 share ONE root cause? Test common-root-cause (same reparse batch/date, c076 flag) FIRST, classify residuals, map to existing owners OR flag NEW. DISTINCT from FIX-BCTC-BANK-SUMMARY-MAPPING (NONZERO). NO branch, NO code change. Deliverable: consolidated findings doc + remediation batch (NO per-ticker dup FIX). Timebox 120m -> write findings even if incomplete. On complete: router RAW-verify findings doc -> route to PO for consolidated remediation sprint decision (SPIKE produces proposal, not merge)."
    })
  ]
| .task_board.backlog |= map(select(type != "object" or .id != "SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO"))
| .head += {
    status: "in_progress",
    active_task_id: "SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO",
    next_agent: "dev-mcp-server",
    next_action: "dev-mcp-server executing read-only SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO (root-cause of Q1-2026 total_assets=0 across 8 non-bank tickers; zone apps/mcp-server/; NO branch/NO code; consolidated findings doc). On complete: router RAW-verify findings -> route to PO for consolidated remediation decision (NO per-ticker dup FIX). SPIKE has NO qa gate -> promote directly on RAW-verify. Also pending next-tick drain: docs/signals/bctc-analyst-20260703T215200Z.json (GVR ESC-4 deep_dive_result -> po: verdict LEGITIMATE non-op income, action=hold, recommend ESC-4 whitelist GVR by content-hash). GVR guard esc-deepdive:GVR:Q1-2026:ESC-4 held ~24h (suppresses re-fire until PO whitelists).",
    updated_at: $now,
    updated_by: "router",
    note: "22:00Z (fire-tick 21:37Z): SPIKE-BCTC-NONBANK-TOTAL-ASSETS-ZERO backlog->in_progress (WIP=1, owner dev-mcp-server) from PO BATCH. SF-1 + fire-election held through execution."
  }
