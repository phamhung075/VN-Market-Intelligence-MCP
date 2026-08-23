# scripts/architect-fix-newsscout-offhours-selfcommit-design-20260823.jq
#
# Architect design-complete stamp for FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-
# RECIPE-INTERMITTENT (ready[], PO-mint, no BA spec, no handoff file — per
# architect/flow/main.md Step 5, findings go into the row's own
# architect_review_note + a full docs/architecture-briefs/ file, next_agent
# hands to pm for the two-owner split (developer script author + agent-father
# flow-doc rewire), same shape as the live FIX-AUDITOR-C04-PARSEDAT-RECENCY-
# PREDICATE / FIX-AUDITOR-C04-FLOWDOC-REPOINT precedent.
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/architect-fix-newsscout-offhours-selfcommit-design-20260823.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

(.task_board.ready | map(.id == "FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-RECIPE-INTERMITTENT") | index(true)) as $idx
| if $idx == null then error("FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-RECIPE-INTERMITTENT not found in .task_board.ready[]") else . end
| .task_board.ready[$idx] += {
    architect_design_complete: true,
    architect_completed_at: $now,
    architect_handoff: "docs/architecture-briefs/2026-08-23-newsscout-marketwatcher-offhours-selfcommit-mechanize.md",
    architect_review_note: "DESIGN COMPLETE 2026-08-23 (architect). Root cause: the 26-line prose recipe (task_claim mutex + same-tick clean-diff guard + git_commit_retry w/ RULE-2.5 pathspec + task_release + BUG escalation) is not deterministically executable by an LLM every cycle -- same class scripts/agents-flow/coverage-stamp.sh already solved (sources mcp-call.sh for the MCP mutex calls, not requiring the calling agent to issue call_tool itself). FIX: one new script scripts/agents-flow/offhours-notebook-self-commit.sh --agent <news-scout|market-watcher>, mechanizing every branch including the BUG-channel send_telegram escalation (the LAST prose-interpreted surface); both docs/agents/news-scout/flow/stage-log-notify.md and docs/agents/market-watcher/flow/cycle.md collapse their block to one Bash call (AC1+AC2, same script prevents re-divergence). AC3 (stale notebook header) + AC4 (recover uncommitted c273): explicitly NOT actioned this session -- the uncommitted c273 section is this row's own live evidence and must not be hand-committed; both auto-resolve on the cutover's first real off-hours tick via the new script's own clean-diff guard, header bump bundled into that same commit. Full design + test strategy + risk flags: see architect_handoff.",
    next_agent: "pm",
    updated_by: "architect"
  }
| .task_board._updated_at = $now
| .task_board._updated_by = "architect (FIX-NEWSSCOUT-OFFHOURS-SELFCOMMIT-PROSE-RECIPE-INTERMITTENT design)"
