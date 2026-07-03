# Router dev-team tick (fire-election 2026-07-03T21:07Z): mint SPIKE-HSX-STRATEGY0-0URLS -> in_progress[] (owner=dev-mcp-server).
# PO a4a28a85e8e135e43 RETURN BATCH (1 SPIKE, read-only) — router mints the board row per PO contract.
# Router RAW-verified PO return (2026-07-03T21:13Z): dev WIP=0 + head idle (room for 1 unit); B-05 done_verified landed;
#   PO files (tnb-audit-latest.md PO ACK, po.md tick entry) 0 UUID leak; SPIKE zone=apps/mcp-server/ -> dev-mcp-server specialist.
#
# SPIKE SCOPE (PO): bctc discovery DEAD 17 days (since 2026-06-16). PRIMARY unfixed root = HSX Strategy-0
#   discoverHosePdfUrls() returns 0 URLs for legitimately-HOSE tickers (B-05 unfroze queue LIFECYCLE only; this SPIKE
#   restores discovery SUCCESS). Tickers ARE HOSE — do NOT chase falsified 'not-listed' theory. Read-only: findings doc +
#   confirmed root + bounded FIX proposal. NO branch (project NO-branches rule + read-only), NO code change this unit.
#   Deliverable: docs/spikes/SPIKE-HSX-STRATEGY0-0URLS.md -> route to PO for sprint decision. Timebox 120m.
#
# Guards: error if already in in_progress[]; error if already in done_verified[].
# Usage: jq --arg now "$NOW" -f scripts/router-mint-spike-hsx-strategy0-inprogress-20260703T2113.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
if ((.task_board.in_progress | map(select(type=="object" and .id=="SPIKE-HSX-STRATEGY0-0URLS")) | length) > 0) then error("SPIKE-HSX-STRATEGY0-0URLS already in in_progress[] -- refuse dup")
elif ((.task_board.done_verified | map(select(type=="object" and .id=="SPIKE-HSX-STRATEGY0-0URLS")) | length) > 0) then error("already in done_verified[] -- refuse dup")
else . end
| .task_board.in_progress += [
    {
      id: "SPIKE-HSX-STRATEGY0-0URLS",
      type: "SPIKE",
      status: "IN_PROGRESS",
      title: "hsx-strategy0-discoverhosepdfurls-returns-0-urls",
      question: "Why does HSX Strategy-0 discoverHosePdfUrls() return 0 URLs for legit-HOSE tickers, and what is the minimal fix?",
      owner: "dev-mcp-server",
      dev_agent: "dev-mcp-server",
      zone: "apps/mcp-server/",
      mode: "spike",
      timebox_min: 120,
      files: [
        "apps/mcp-server/src/domain/services/bctcDiscovery.ts",
        "apps/mcp-server/src/infrastructure/fetchers/hsxBctcFetcher.ts",
        "apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts"
      ],
      dispatched_by: "router",
      dispatched_at: $now,
      dispatch_note: "[router 2026-07-03T21:13Z / fire-tick 21:07Z] dev-team Step 3 SPIKE (mode=spike, feature-spike.md). Spawn dev-mcp-server run_in_background (zone apps/mcp-server/ specialist). READ-ONLY: diagnose why discoverHosePdfUrls() returns 0 URLs for legitimately-HOSE tickers (PRIMARY root of 17-day-dead discovery; B-05 unfroze queue lifecycle only). NO branch, NO code change. Deliverable: docs/spikes/SPIKE-HSX-STRATEGY0-0URLS.md (Question/Approach/Findings/Recommended-next-step) + bounded FIX proposal. Timebox 120m -> write findings even if incomplete. On complete: router RAW-verify findings doc -> route to PO for sprint decision (SPIKE produces proposal, not merge)."
    }
  ]
| .head += {
    status: "in_progress",
    active_task_id: "SPIKE-HSX-STRATEGY0-0URLS",
    next_agent: "dev-mcp-server",
    next_action: "dev-mcp-server executing read-only SPIKE-HSX-STRATEGY0-0URLS (why discoverHosePdfUrls() returns 0 URLs for legit-HOSE tickers; zone apps/mcp-server/; NO branch/NO code; findings doc docs/spikes/SPIKE-HSX-STRATEGY0-0URLS.md). On complete: router RAW-verify findings -> route to PO for sprint decision. This is the PRIMARY discovery-SUCCESS root (B-05 already unfroze queue lifecycle). Pipeline dead 17 days since 2026-06-16.",
    updated_at: $now,
    updated_by: "router",
    note: "21:13Z (fire-tick 21:07Z): SPIKE-HSX-STRATEGY0-0URLS minted ready->in_progress (WIP=1, owner dev-mcp-server) from PO BATCH. SF-1 + fire-election held through execution."
  }
