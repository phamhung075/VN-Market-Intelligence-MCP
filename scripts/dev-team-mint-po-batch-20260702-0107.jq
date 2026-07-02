# Dev-team tick 2026-07-02T01:07Z — mint PO triage BATCH (2 tasks) into task_board.in_progress
# Source: PO triage return (6 signals dispositioned; 2 new tasks). RAW-verified by dispatcher:
#   - sprint_goal.entries = 26 (cap 15); exactly 8 terminal entries carry drifted status tokens
#     (CLOSED, COMPLETE, done x4, done_verified x2) that scripts/orch-cold-evict.sh never matches.
#   - apps/mcp-server/~ = 26MB stray bun install cache, untracked, gitignored (.gitignore:5 "~/")
#     — sole source of mock-guard --full exit-1 false positive every post-cycle.
# Usage: jq --arg now "$NOW" -f scripts/dev-team-mint-po-batch-20260702-0107.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: idempotent (append only if id absent board-wide); lane-scoped writes only.

def fixid: "FIX-SPRINT-GOAL-STATUS-DRIFT-EVICT";
def cleanid: "CLEAN-DELETE-STRAY-BUN-CACHE-MCP-SERVER";
def allids: [.task_board | to_entries[] | select(.value | type == "array") | .value[] | .id? // empty];

. as $doc
| (allids) as $ids
| if ($ids | index(fixid)) == null then
    .task_board.in_progress += [{
      id: fixid,
      status: "IN_PROGRESS",
      title: "sprint_goal over cap (26/15): 8 terminal sprints stranded by non-canonical status drift that defeats cold-evict (recurring 8x)",
      owner: "dev-team",
      next_agent: "developer",
      type: "FIX",
      zone: "multi",
      size: "M",
      priority: "medium",
      created_at: $now,
      created_by: "dev-team-dispatcher",
      related: ["FIX-SPRINT-STATUS-ENUM", "feedback_coldevict_complete_status_drift"],
      status_note: "ROOT CAUSE (recurring 8x): sprint sign-off paths write non-canonical status tokens the cold-evict predicate never matches. scripts/orch-cold-evict.sh uses TERMINAL_SPRINT_STATUSES=DONE,DONE_VERIFIED,CANCELLED,DEFERRED,SKIPPED (SSOT apps/mcp-server/src/infrastructure/orchStateSchema.ts TERMINAL_SET) but 8 terminal entries carry drifted tokens -> never evict -> sprint_goal.entries grows unbounded (26, cap 15). The 8: BCTC-PROSE-EXTRACT(CLOSED), GO-FLEET-DEPLOY(COMPLETE), QUE-TOOLTIP-DRY/SSOT-INTEGRITY-PERIMETER/FRONTEND-ANALYSIS-HUB-CONSOLIDATION/DEFERRED-TASK-SCHEDULER-MVP(done), FB-COWORK-FOLD/PREDICTION-EVIDENCE-REVIVAL(done_verified). AC-1 mechanical: normalize the 8 -> canonical DONE/DONE_VERIFIED via jq|orch-apply.sh (bound --arg only), run scripts/orch-cold-evict.sh, verify entries 26->18. AC-2 durable: enforce canonical sprint status at write-time in orch-apply.sh local validation path (container rebuild is user-gated; server-side schema enforcement rides next approved rebuild). Scars: feedback_coldevict_complete_status_drift, feedback_negative_path_test_corrupts_live_ssot (fixtures only, never live SSOT). OUT OF SCOPE: PO sprint-closure review of stale OPEN/active sprints (CI-RED-RECONCILE, CROSS-SESSION-MULTI-TEAM-ORCH close candidates) — separate PO act."
    }]
  else . end
| if ($ids | index(cleanid)) == null then
    .task_board.in_progress += [{
      id: cleanid,
      status: "IN_PROGRESS",
      title: "Delete stray 26MB bun install cache apps/mcp-server/~ (untracked debt; source of mock-guard --full FP)",
      owner: "qa",
      next_agent: "qa",
      type: "CLEAN",
      zone: "apps/mcp-server/",
      size: "S",
      priority: "low",
      created_at: $now,
      created_by: "dev-team-dispatcher",
      related: ["FIX-MOCKGUARD-SCOPE-EXCLUDE-TESTGO"],
      status_note: "RAW-verified: apps/mcp-server/~/.bun/install/cache exists (26MB, untracked, gitignored .gitignore:5 -> no force-add risk). Dead debt + sole source of mock-guard --full exit-1 FALSE POSITIVE tripping every dev-team post-cycle. Fix = rm -rf 'apps/mcp-server/~'. Detector hardening ALREADY tracked as FIX-MOCKGUARD-SCOPE-EXCLUDE-TESTGO (TODO) — do NOT duplicate. Verify: dir gone; scripts/audits/mock-guard.sh --full no longer hits that path. S4 qa chore — outside dev WIP count."
    }]
  else . end
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
