# Router board mutation: close TSU-DEV-U6 (SATISFIED-PRE-SHIPPED) + unblock U2-PARITY.
# Pointer: docs/agents/dev-team/flow/main.md (router board-write step).
# Usage: jq --arg now "$NOW" -f scripts/router-u6-close-presshipped-unblock-parity.jq orch-state.json
(.task_board.backlog | map(select(.id=="TSU-DEV-U6"))[0]) as $u6
| .task_board.done_verified += [
    ($u6 + {
        status: "done_verified",
        closed_at: $now,
        closed_by: "router",
        no_rebuild: true,
        review_evidence: {
          disposition: "SATISFIED-PRE-SHIPPED",
          summary: "U6 = description-only updates on 9 TSH-leftover tools (KEEP-SEPARATE verdicts). Already present in HEAD; no server.tool removal (count unchanged). Router-verified in-code + live.",
          test_raw: "bun test TSU-DEV-U6-tsh-leftover-descriptions.test.ts = 17 pass / 0 fail (35 expect) against HEAD; source-text scan.",
          fence_proof: "Deliberate-violation: broke '5003' marker in technicalIndicatorTools.ts -> T-U6-2 RED (16 pass/1 fail); restored -> 17/0 GREEN; tree clean. Test is non-vacuous.",
          source_raw: "Distinctive markers present in correct tool files: 5003 (technicalIndicatorTools.ts), fetch-bctc.sh (priceDebugTriggerTool.ts), SSC (insiderTools.ts), rag_analyses (marketTools.ts).",
          count: "UNCHANGED vs post-U3 — U6 removes no server.tool() block (NFR-U6-3 not triggered).",
          live: "Container built from HEAD ~49min ago (img 1042a2a9) -> updated descriptions served live; no rebuild needed.",
          test_commit: "3dd0d7bd (U6 test + description clarifications), sibling to 06-07 ship 50772c2a"
        }
       })
  ]
| .task_board.backlog |= map(select(.id != "TSU-DEV-U6"))
| .task_board.backlog |= map(
    if .id=="TSU-DEV-U2-PARITY"
    then .status="READY"
       | .blocked_by=[]
       | .unblocked_at=$now
       | .dispatch_note="UNBLOCKED \($now) by router (deps TSU-DEV-U3 + TSU-DEV-U6 both done_verified). FINAL reconcile: re-run scripts/gen-tool-registry.ts, confirm docs/data/tool-registry.json + docs/data/project-stats.json#toolCount match LIVE list_server_tools count. PRE-SHIP CONTEXT: U3/U6 work shipped 06-07; live count already settled (~157). Expect NO drift — verify-and-confirm, regenerate only if artifacts lag. Data-artifact task (not apps/mcp-server runtime) -> no container rebuild."
    else . end)
