# scripts/dev-fix-auditor-durability-step0b-detection-to-review.jq
#
# FIX-AUDITOR-DURABILITY-STEP0B-DETECTION — in_progress[] -> review[] after
# implementation + live-bash verification GREEN (no companion .test.sh exists
# for this flow-spec .md file). developer hands off to qa per
# docs/agents/developer/flow/main.md "Update docs/data/orch/orch-state.json
# .task_board: task status IN_PROGRESS -> REVIEW" + CANONICAL:SSOT-STATUSFLIP-
# LANEMOVE (status flip must move array membership into the matching lane in
# the same orch-apply.sh write).
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-fix-auditor-durability-step0b-detection-to-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.in_progress | map(select(.id == "FIX-AUDITOR-DURABILITY-STEP0B-DETECTION"))) as $reviewed
| .task_board.review += ($reviewed | map(. + {
    status: "REVIEW",
    next_agent: "qa",
    reviewed_at: $now,
    reviewed_by: "developer",
    review_note: "po_occurrence_7 correction to architecture-briefs/2026-08-06-fix-system-auditor-cycle-notebook-persistence-lifecycle.md §3a's stale-marker sweep (only caught won-election-then-died-mid-run). docs/agents/system-auditor/flow/main.md Step 0b gains 0b.1 (stale marker sweep, reuses emit-audit-signal.sh's 7-day dedup ledger), 0b.2 (schedule-based missing-cycle detection: reliable tier-2/3 heartbeat staleness + conservative wide-window tier-1 check with documented residual gap on isolated single-tick losses), 0b.3 (structure-only stub for the not-yet-existent draft-file sweep, actuator lands in FIX-AUDITOR-DURABILITY-FLOW-DRAFT-HEAL). Relocated Notebook Write/Commit block to run immediately after tier checks conclude (§3b.1), ahead of Anomaly Reporting/OUTPUT-CONTRACT; Notebook Append Gate condition (b) rewired to read $MARKERS_FILE directly (unavoidable consequence of the reorder). Live-verified: Step 0b.1 sweep found all 6 real pre-existing orphaned marker files in the repo; jq fromdateiso8601 epoch-threshold logic verified against fresh/stale/missing fixtures; new grep regex verified against all 5 non-ABORT emit-signal marker forms audit-output-contract.sh itself counts. No companion .test.sh exists for this flow-spec .md file (confirmed via repo grep) — baseline established via live bash instead. Did NOT touch audit-dimensions.md (own hard 200L cap, PM handoff scoped Files to create: None) — flagged, not actioned. No apps/ TS/Go touched (zone cross-service/, pure .md) — bun test/tsc structurally N/A. Commits 92ef5b3a2 (main.md + WORK.md), af9ad098c (memory). Blocks FIX-AUDITOR-DURABILITY-SKILL-DRAFT-PERSIST and FIX-AUDITOR-DURABILITY-FLOW-DRAFT-HEAL."
  })
)
| .task_board.in_progress |= map(select(.id != "FIX-AUDITOR-DURABILITY-STEP0B-DETECTION"))
| .task_board._updated_at = $now
| .task_board._updated_by = "developer (FIX-AUDITOR-DURABILITY-STEP0B-DETECTION -> REVIEW)"
