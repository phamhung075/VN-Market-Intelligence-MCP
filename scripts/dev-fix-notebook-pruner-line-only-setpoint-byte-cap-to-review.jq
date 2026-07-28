# scripts/dev-fix-notebook-pruner-line-only-setpoint-byte-cap-to-review.jq
#
# FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES —
# in_progress[] -> review[] after implementation + tests GREEN. developer hands
# off to qa per docs/agents/developer/flow/main.md "Update
# docs/data/orch/orch-state.json .task_board: task status IN_PROGRESS -> REVIEW".
#
# qa_verify_mode set to "verify-committed" per dispatch instruction — this row
# carries branch:null (host-script fix on main, no feature branch), so QA's
# normal branch-diff pipeline mode does not apply.
#
# Syncs .head in the SAME write (recurring gap: .head.next_agent must match the
# board row's next_agent, never point back to the flipping agent or go stale).
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-fix-notebook-pruner-line-only-setpoint-byte-cap-to-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.in_progress | map(select(.id == "FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES"))) as $reviewed
| .task_board.review += ($reviewed | map(. + {
    status: "REVIEW",
    next_agent: "qa",
    rebuild_required: false,
    qa_verify_mode: "verify-committed",
    reviewed_at: $now,
    reviewed_by: "developer",
    updated_at: $now,
    updated_by: "developer",
    review_note: "Premise confirmed at source: byte cap (LINE_CAP*60=12000B, TE-T24) already existed via context-bloat-backstop.sh with a detector only; notebook-auto-prune.sh's early-exit (:135) and loop-break (:174) were line-only, so the actuator never fired on the byte axis (alert-commander.md 632 bytes/line vs a 60 bytes/line budget). FIX: both stopping conditions now require lines<=LINE_CAP AND bytes<=BYTE_CAP. LINE_CAP read at runtime from docs/data/file-size-caps.json (same SSOT context-bloat-backstop.sh reads); BYTE_CAP=LINE_CAP*60 — never a second hardcoded 12000 literal (explicitly avoiding the USD/VND three-SSOT duplication class). Loop recount switched echo->printf %s\\n so byte count matches the final atomic write exactly. OPEN QUESTION decided: option [a] — kept the single-section safe-fail path unchanged (honest signal, no truncation), now reachable on the byte axis too; added byte_count/byte_cap to both safe-fail signal payloads for audit parity with the backstop hook. New scripts/agents-flow/notebook-auto-prune.test.sh, 4/4 PASS: T1 byte-axis regression (142L/30403B -> 49L/10166B, 2 sections remain, no safe-fail); T2 line-axis not regressed (250L/3920B -> 167L); T3 within-both-caps untouched (hash-identical); T4 single-section byte-only breach (67L/18145B, line cap NOT tripped -> hash-identical, notebook_single_section_overage_breach emitted with byte_cap:12000, no truncation). Existing test-notebook-auto-prune.sh (5/5) and context-bloat-backstop.test.sh (4/4) re-run clean, unaffected. Live validation: this very fix, applied to itself, correctly byte-pruned docs/agent-memory/notebooks/developer.md (49L/10324B post-prune) when this task own notebook entry pushed it over the byte cap while still under the line cap. CI: full bun test baseline established fresh (the 3-day-old 1-failure note had moved) = 14824 pass/40 skip/53 fail/1231 files/591s; confirmed 1408-tool-diacritics.test.ts:113 (owned by FIX-BDI-SHIPPING-STALE-404-GUARD) still among them, unchanged. Zero net new failures — this change touches 0 files under apps/mcp-server/. Cited as instance 13/sub-class 7 on SPIKE-SATURATED-COUNT-THRESHOLD-GATES-SWEEP — that row NOT closed. FOLLOW-UP FINDING, not fixed (out of this row's enumerated scope): scripts/agents-flow/notebook-linecap-sweep.sh (6h cron TE-T17 backstop) has its own independent line-only pre-filter before delegating to notebook-auto-prune.sh — a byte-over/line-under notebook written via a non-hook path (Bash heredoc/append) still will not reach the fixed logic through that cron path; flagging for PO/dispatcher to decide whether a follow-up task is warranted. Commits: fix(agents-flow/notebook-prune) implementation+test+docs, chore(memory/developer) notebook."
  })
)
| .task_board.in_progress |= map(select(.id != "FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES"))
| .task_board._updated_at = $now
| .task_board._updated_by = "developer (FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES -> REVIEW)"
| .head = {
    status: "review",
    active_task_id: "FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES",
    next_agent: "qa",
    next_action: "FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES at REVIEW — qa: verify-committed mode (branch:null, host scripts on main). Check scripts/agents-flow/notebook-auto-prune.sh dual-axis fix (LINE_CAP+BYTE_CAP derivation, both stopping conditions), run scripts/agents-flow/notebook-auto-prune.test.sh (4/4), test-notebook-auto-prune.sh (5/5), context-bloat-backstop.test.sh (4/4). No rebuild/deploy needed (bash script + test, consumed live by the PostToolUse hook on next notebook write).",
    updated_at: $now,
    updated_by: "developer"
  }
