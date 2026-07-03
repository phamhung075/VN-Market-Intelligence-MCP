# Router board promote: FIX-BCTC-BANK-BS-COLUMN-ORDER in_progress[] -> review[] on dev-mcp-server completion.
# dev-mcp-server a654360318cb56e49 RAW-verified by router:
#   - Commits d69b13f41 (code: refinedMarkdownParser +189, bctcFormType +18, bctcRowRepair +22, new test +406)
#     + e73a53688 (process docs) — scoped to EXACTLY the claimed files, no dirty-tree add, no push, no deploy.
#   - Forbidden probe: only pkill of its OWN ephemeral PORT=3099/src/index.ts test harness (prod is containerized) — CLEAN.
#   - Write/Edit confinement: all paths under apps/mcp-server/src + docs/agent-memory + docs/handoffs — CLEAN.
#   - DJ-GATE-1: decision journal sprint-FIX-BCTC-BANK-BS-COLUMN-ORDER-dev-mcp-server.md committed (e73a53688) — SATISFIED.
#   - Independent re-run of new regression fixture: 16 pass / 0 fail / 54 expect (real CTG report_id ctg-96e36139-real-e2e,
#     total_assets/total_liabilities/equity_total backfilled, identity holds) — GREEN on router's own machine.
# qa (next gate) owns the deep verify: tsc --noEmit, targeted BCTC suite (agent claims 261 pass), FULL suite.
# BASELINE NOTE for qa: router's stated baseline_pass=9408 is STALE vs the current actual suite (~14171 tests); use the
#   repo's documented ceiling testBaselineFail=348. Agent grepped both full-run logs — 0 (fail) lines touch
#   bctc/refinedMarkdown/bankForm/parseVnNumber; the ~57-63 fails are pre-existing network-flaky (news-poll/VPS-proxy/
#   insider/telegram/climate) + a known Bun-1.3.13 teardown panic. qa MUST independently confirm this.
# DEPLOY-GATED FOLLOW-UP (NOT run, correctly flagged by dev): a post-deploy finalize_bctc_refine against the live CTG
#   report in the named-volume market.db is required before the live report's total_assets actually unfreezes.
# W5 chain (.unblocks): TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST + W5-FU-CTG-REFINE-96e36139
#   are code-blocker-cleared by d69b13f41 (both already sit in review[] with empty blocked_by).
# Router owns the board flip; qa is told NOT to touch the board/head.
# Usage: jq --arg now "$NOW" -f scripts/router-promote-column-order-review-20260703T0810.jq docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.in_progress | map(select(.id=="FIX-BCTC-BANK-BS-COLUMN-ORDER"))[0]) as $t
| if $t == null then error("COLUMN-ORDER not in in_progress[] — refuse to promote")
  elif ((.task_board.review | map(select(.id=="FIX-BCTC-BANK-BS-COLUMN-ORDER")) | length) > 0) then error("COLUMN-ORDER already in review[] — refuse dup")
  else . end
| .task_board.review += [
    ($t + {
      status: "REVIEW",
      dev_agent: "dev-mcp-server",
      dev_commits: ["d69b13f41", "e73a53688"],
      moved_to_review_at: $now,
      moved_by: "router",
      router_raw_verify: "[router 2026-07-03T08:10Z] dev-mcp-server RAW-verified: 2 commits scoped exactly to claimed files (code d69b13f41 + docs e73a53688), no push/deploy/dirty-add, only self-test-harness pkill; DJ-GATE-1 journal committed; new real-data CTG fixture 16/0 GREEN on router re-run. qa owns deep verify (tsc + targeted 261 + FULL suite; baseline_pass=9408 is STALE, use testBaselineFail=348). DEPLOY-GATED: post-deploy finalize_bctc_refine on live CTG report still required to unfreeze total_assets (NOT run).",
      qa_gate: "pending"
    })
  ]
| .task_board.in_progress |= map(select(.id != "FIX-BCTC-BANK-BS-COLUMN-ORDER"))
| .head = {
    status: "in_progress",
    active_task_id: "FIX-BCTC-BANK-BS-COLUMN-ORDER",
    next_agent: "qa",
    next_action: "qa deep-verify FIX-BCTC-BANK-BS-COLUMN-ORDER (tsc + targeted BCTC + FULL suite vs testBaselineFail=348); router promotes review->done_verified on PASS. Post-deploy finalize_bctc_refine on live CTG report is a separate deploy-gated follow-up.",
    updated_at: $now,
    updated_by: "router",
    note: "06:37Z tick: both dispatches complete. dev-mcp-server done->review (COLUMN-ORDER, commits d69b13f41+e73a53688, RAW-verified, W5 chain code-cleared). SPIKE-BCTC-DISCOVER-PIPELINE-DEAD done (architect 07:13Z). qa dispatched for COLUMN-ORDER; SF-1 held across the qa gate."
  }
