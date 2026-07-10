# Dev-team tick 2026-07-08T07:5xZ — mint FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE into task_board.in_progress
# Source: PO daily triage sweep return (agentId ac9e2ff31b2c03f8e). Root cause: BOUNDED-1
#   promote script (scripts/devteam-backlog-promote-bounded1.jq) has no depends_on eligibility
#   filter — auto-promoted+claimed FACTORY-TECHANALYSIS-delete-orphaned-ts-service on 07-08 while
#   both its prerequisites (go-livepath-tests, reconcile-ta-contract) were still BACKLOG. Router
#   caught it pre-dispatch and reverted (see revert_note on that row). 5th confirmed BOUNDED-1
#   mis-pick this cluster; distinct from the sibling stale-already-done class already tracked by
#   BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP (deterministic jq gate vs ground-truth verify-prune sweep —
#   two complementary mechanisms, not a duplicate).
# Usage: jq --arg now "$NOW" -f scripts/dev-team-mint-fix-devteam-bounded1-depends-on-gate-20260708.jq \
#          docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: idempotent (append only if id absent board-wide); lane-scoped write only.

def fixid: "FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE";
def allids: [.task_board | to_entries[] | select(.value | type == "array") | .value[] | .id? // empty];

. as $doc
| (allids) as $ids
| if ($ids | index(fixid)) == null then
    .task_board.in_progress += [{
      id: fixid,
      status: "IN_PROGRESS",
      title: "BOUNDED-1 promote script: add depends_on eligibility gate (skip rows whose prerequisites aren't all DONE_VERIFIED)",
      owner: "dev-team",
      next_agent: "developer",
      type: "FIX",
      zone: "cross-service/",
      size: "S",
      priority: "high",
      created_at: $now,
      created_by: "po (triage 2026-07-08, gateway-blind BATCH relayed by dev-team)",
      related: ["BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP", "FACTORY-TECHANALYSIS-delete-orphaned-ts-service", "FACTORY-MACRO-delete-dead-ts-tree"],
      files: [
        "scripts/devteam-backlog-promote-bounded1.jq",
        "docs/agents/dev-team/flow/main.md",
        "scripts/test-devteam-bounded1-depends-on.sh"
      ],
      status_note: "scripts/devteam-backlog-promote-bounded1.jq selects the top-priority BACKLOG/TODO row with NO depends_on check. On 07-08 it promoted+claimed FACTORY-TECHANALYSIS-delete-orphaned-ts-service while both prerequisites (go-livepath-tests, reconcile-ta-contract) were still BACKLOG -- router manually reverted (row back to backlog[], revert_note stamped, .head reset idle). Same premature-scope class as FACTORY-MACRO-delete-dead-ts-tree (took 3 rounds). APPROACH: (1) depends_on lives in TWO places -- inline on some orch-state rows (detail_ref:null) AND ONLY in docs/data/orch/archive/backlog-detail.json .items[] for detail-ref'd rows (this row included: orch-state carries depends_on:null + detail_ref, backlog-detail.json has the real depends_on array). Resolve effective depends_on = inline .depends_on // (lookup by id in backlog-detail.json .items[]) // []. Pass the detail file via --slurpfile detail docs/data/orch/archive/backlog-detail.json and update BOTH invocation call sites in docs/agents/dev-team/flow/main.md (~L504-506, the promote+claim BOUNDED-1 block) to pass it through. (2) Build a status map by scanning ALL task_board lanes (done_verified, done, review, qa, in_progress, ready, backlog) for each dep id. (3) A dep is satisfied ONLY if found with status=='DONE_VERIFIED' (conservative -- DONE alone does not count, matches repo convention). (4) If a dep id resolves in NO lane, treat as UNSATISFIED and SKIP the candidate (conservative-skip: a stuck row stays in backlog for human grooming, strictly better than auto-dispatching blind). (5) Apply the eligibility filter DURING candidate selection (in the sort/select), NOT just to the final top pick, so a blocked top row does not starve a lower-ranked unblocked one. Keep it orch-apply.sh-gated, no hardcoded task IDs, idempotent/re-run-safe. Add scripts/test-devteam-bounded1-depends-on.sh covering: satisfied depends_on (promotes), unsatisfied depends_on (skips, picks next eligible), no depends_on (unchanged baseline behavior), dep id resolves in no lane (conservative-skip). devteam-backlog-claim-bounded1.jq needs NO change (only claims what promote already stamped) -- verify only, do not edit. DJ-GATE-1 applies before any DONE/REVIEW flip."
    }]
  else . end
| .task_board._updated_at = $now
| .task_board._updated_by = "dev-team"
