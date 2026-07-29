# scripts/dev-mcp-server-task-devteam-idle-chain-1-schema-utilities-to-review.jq
#
# TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES — in_progress[] -> review[] after
# implementation + gate evidence GREEN + commit. Flipped to REVIEW (not
# DONE_VERIFIED — developer never self-flips per DJ-GATE-1 / task
# instructions); next_agent=qa to independently re-verify.
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-mcp-server-task-devteam-idle-chain-1-schema-utilities-to-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.in_progress | map(select(.id == "TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES"))) as $reviewed
| .task_board.review += ($reviewed | map(. + {
    status: "REVIEW",
    next_agent: "qa",
    reviewed_at: $now,
    reviewed_by: "dev-mcp-server",
    review_note: "Task 1 of 5 (pm decomposition of architect brief 2026-07-25-devteam-idle-chain-rotation-durable-inbox.md). Shipped all 3 tightly-coupled deliverables per row note: (1) dev_team_idle_chain: z.record(z.unknown()).optional() on OrchStateSchema root (orchStateSchema.ts), same precedent as narrative/dashboard_section_cache/session_handoff_status; (2) rotation_selected($doc) in scripts/lib/devteam-eligibility.jq — verbatim architect-brief §2.2 aged round-robin (oldest last_served_tick wins, missing/null defaults to epoch, fixed-order tiebreak); (3) new scripts/devteam-idle-chain-stamp.jq per-tick stamp writer (self-healing on bootstrap, guards $c against the fixed 5-id set). PLAN-ONLY constraint honored — docs/agents/dev-team/flow/main.md and drain-signals.md untouched (git status confirmed). Evidence: bun tsc --noEmit clean; direct Zod safeParse probes (with/without/loose-shape dev_team_idle_chain) PASS; bun scripts/orch-validate.mjs Stage 0+1 PASS on live orch-state.json; orchStateSchema.test.ts 104/104 pass; jq -n scenario probes (bootstrap-absent-key default, all-null tie-break, mid-rotation next-oldest-wins, simulated 5-tick cycle selects each of the 5 ids exactly once); stamp-writer probes (bootstrap self-heal, partial update, unrecognized-id no-op, jq -n -f valid-JSON output); toolCount=184/cronJobCount=88 unchanged; live boot (:memory:) health 200 + both dashboard routes 200; full bun test 14885 pass/40 skip/55 fail/1238 files — within the standing FIX-MCP-SUITE-HEALTH-BASELINE band (dev-standards.md:610), confirmed zero overlap with orchStateSchema/dev_team_idle_chain/devteam-eligibility. Handoff: docs/handoffs/TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES.md. Decision journal: docs/agent-memory/decisions/sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server.md STEP dev-mcp-server-S20."
  })
)
| .task_board.in_progress |= map(select(.id != "TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES"))
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-mcp-server (TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES -> REVIEW)"
| .head = {
    status: "review",
    active_task_id: "TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES",
    next_agent: "qa",
    next_action: "TASK-DEVTEAM-IDLE-CHAIN-1-SCHEMA-UTILITIES at REVIEW -- qa: verify the schema addition + 2 jq utilities (jq -n scenario probes reproducible, Zod probes reproducible via bun run against orchStateSchema.ts) then flip DONE_VERIFIED. No rebuild/deploy needed (schema + jq-only change, consumed by dev-team's own future idle-tick rotation wiring, task 2/5 — not yet dispatched).",
    updated_by: "dev-mcp-server",
    updated_at: $now
  }
