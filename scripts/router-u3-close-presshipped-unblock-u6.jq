# Router board mutation: close TSU-DEV-U3 (SATISFIED-PRE-SHIPPED) + unblock U6.
# Pointer: docs/agents/dev-team/flow/main.md (router board-write step).
# Usage: jq --arg now "$NOW" -f scripts/router-u3-close-presshipped-unblock-u6.jq orch-state.json
# - Relocates TSU-DEV-U3 backlog[] -> done_verified[] with router SATISFIED-PRE-SHIPPED evidence.
# - Flips TSU-DEV-U6 BLOCKED -> READY (dep U3 now done) + pre-ship flag on dispatch_note.
# - Leaves TSU-DEV-U2-PARITY BLOCKED (depends on U6 + U3).
(.task_board.backlog | map(select(.id=="TSU-DEV-U3"))[0]) as $u3
| .task_board.done_verified += [
    ($u3
     + {
        status: "done_verified",
        closed_at: $now,
        closed_by: "router",
        no_rebuild: true,
        review_evidence: {
          disposition: "SATISFIED-PRE-SHIPPED",
          summary: "Deregister-5/integrate-7 already shipped + QA-approved 2026-06-07; today PO fan-out re-materialized an already-done id (ARCH-TSU brief designed vs stale pre-06-07 162 baseline). Router re-verified LIVE.",
          prior_ship: "50772c2a (2026-06-07 10:58) feat: deregister 5 weak-claim tools + integrate 7 descriptions",
          prior_qa: "2e321dec (2026-06-07 11:07) QA gate APPROVED + orch-state DONE (old board, lost in consolidation)",
          today_increment: "16ebf1df notebook re-verification; U3 test (TSU-DEV-U3-weak-claim-tools.test.ts) already committed in 50772c2a — 12 pass + FENCE RED->GREEN per dev",
          router_live_raw: "ALL 5 deregistered tools return gateway 'Tool not found' LIVE: is_trading_day, read_bctc_pdf, backfill_bctc_scalars, compute_accruals, get_accuracy_context. Control get_market_foreign_flow alive+correct. mcp-server container Up healthy => clean boot post-deregister, no orphaned-import crash.",
          source_raw: "HEAD: 5 deregistered tools = 0 server.tool() registrations each; 3 integrate controls present (get_bctc_page_text, get_market_foreign_flow, list_flagged_bctc_cells = 1 each).",
          rebuild: "NONE — already live (U5 rebuild image 1042a2a9 ~49min ago built from HEAD incl. 50772c2a). U4 pre-existing-impl pattern.",
          count_parity: "deferred to TSU-DEV-U2-PARITY per gate (not verified here)"
        }
       }
     )
  ]
| .task_board.backlog |= map(select(.id != "TSU-DEV-U3"))
| .task_board.backlog |= map(
    if .id=="TSU-DEV-U6"
    then .status="READY"
       | .blocked_by=[]
       | .unblocked_at=$now
       | .dispatch_note="UNBLOCKED \($now) by router (dep TSU-DEV-U3 done_verified). PRE-SHIP FLAG: U6 likely already shipped — its test TSU-DEV-U6-tsh-leftover-descriptions.test.ts committed at 3dd0d7bd, sibling to the 06-07 50772c2a ship. Handler MUST verify-before-reimplement (live list_server_tools + grep HEAD descriptions) like U3; do NOT blindly re-edit. If already satisfied -> close SATISFIED-PRE-SHIPPED, no rebuild."
    else . end)
| .task_board.backlog |= map(
    if .id=="TSU-DEV-U2-PARITY"
    then .note=((.note // "") + " | [router \($now)] NOTE: U3 closed PRE-SHIPPED (06-07). When U6 settles, U2-PARITY is the final registry/count reconcile vs HEAD — expect counts already at 06-07 settled values; verify, do not assume drift.")
    else . end)
