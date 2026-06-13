# Router board mutation: close TSU-DEV-U2-PARITY (VERIFIED-PARITY-NO-DRIFT) — final TSU fan-out unit.
# Pointer: docs/agents/dev-team/flow/main.md (router board-write step).
# Usage: jq --arg now "$NOW" -f scripts/router-u2parity-close-nodrift.jq orch-state.json
(.task_board.backlog | map(select(.id=="TSU-DEV-U2-PARITY"))[0]) as $p
| .task_board.done_verified += [
    ($p + {
        status: "done_verified",
        closed_at: $now,
        closed_by: "router",
        no_rebuild: true,
        review_evidence: {
          disposition: "VERIFIED-PARITY-NO-DRIFT",
          summary: "Final registry/count reconcile after U3/U6 settled. 4-way parity at 157, zero drift; artifacts already correct -> NO regeneration commit needed.",
          four_way_157: "generator recompute=157 (bun run scripts/gen-tool-registry.ts -> totalCount=157); docs/data/project-stats.json#toolCount=157; docs/data/tool-registry.json totalCount=157; LIVE container /health(:3000) toolCount=157 status=ok.",
          drift_check: "Generator re-run produced byte-identical content (excl. lastUpdated timestamp) for both artifacts; timestamp churn restored via git checkout -> tree clean, no commit.",
          rebuild: "NONE — data-artifact verification only; no apps/mcp-server runtime change.",
          context: "U3/U6 deregistration+description work shipped 06-07 (50772c2a); live count already at settled 157 -> no drift, as anticipated."
        }
       })
  ]
| .task_board.backlog |= map(select(.id != "TSU-DEV-U2-PARITY"))
