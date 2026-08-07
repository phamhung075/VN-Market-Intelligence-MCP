# scripts/dev-fix-orphan-fr1-fr3-fr6-skill-dispatch-claim-to-review.jq
#
# FIX-ORPHAN-FR1-FR3-FR6-SKILL-DISPATCH-CLAIM — in_progress[] -> review[] after
# implementation (.claude/skills/dispatch-claim/SKILL.md: FR-1 prose sync,
# FR-3 board-state guard, FR-6 escalation owner_agent) + doc-update/notebook
# steps complete, per docs/agents/developer/flow/main.md "Update
# docs/data/orch/orch-state.json .task_board: task status IN_PROGRESS -> REVIEW"
# + CANONICAL:SSOT-STATUSFLIP-LANEMOVE (status flip must move array membership
# into the matching lane in the same orch-apply.sh write). Precedent:
# scripts/dev-fix-auditor-durability-step0b-detection-to-review.jq.
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-fix-orphan-fr1-fr3-fr6-skill-dispatch-claim-to-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.in_progress | map(select(.id == "FIX-ORPHAN-FR1-FR3-FR6-SKILL-DISPATCH-CLAIM"))) as $reviewed
| .task_board.review += ($reviewed | map(. + {
    status: "REVIEW",
    next_agent: "qa",
    reviewed_at: $now,
    reviewed_by: "developer",
    review_note: "3 subtasks landed in .claude/skills/dispatch-claim/SKILL.md (commit 234902038): FR-1 payload_patch prose rewritten to accurately describe backend-landed-but-NOT-YET-tool-schema-exposed state (verified live coordinationTools.ts Zod schema first — deviated from subtask wording of \"now available\", which would have recreated the doc-vs-surface contradiction this ticket exists to close, NFR-3); FR-3 board-state guard inserted in § Orphan-Adoption Probe, runs once per sprint-task signal before redispatch_count>=N_MAX (EC-3), batch-reads .task_board once per tick covering both flat lanes and active_sprints nesting (EC-2/EC-8), strips task: prefix (EC-1), classifies by lane membership per architect ruling (backlog=terminal, no BLOCKED carve-out); FR-6 owner_agent added to escalation heartbeat call, annotated NOT-YET-LIVE pending Task 2 (FIX-ORPHAN-FR2-FR6-FR7-INTERFACE-COORDINATION-TOOLS, still READY) + NFR-3 rebuild. Full detail: docs/handoffs/FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD-PM-decomposition-20260722.md Task 3 Implementation Record. No apps/ TS touched (flow-docs/, pure pseudocode spec) — bun test/tsc structurally N/A. Commits 234902038 (code), 5ac21c593 (docs), 749d0e307 (memory)."
  })
)
| .task_board.in_progress |= map(select(.id != "FIX-ORPHAN-FR1-FR3-FR6-SKILL-DISPATCH-CLAIM"))
| .task_board._updated_at = $now
| .task_board._updated_by = "developer (FIX-ORPHAN-FR1-FR3-FR6-SKILL-DISPATCH-CLAIM -> REVIEW)"
