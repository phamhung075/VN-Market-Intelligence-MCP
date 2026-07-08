# scripts/dev-fix-devteam-bounded1-depends-on-gate-to-review.jq
#
# FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE — in_progress[] -> review[] after
# implementation + tests GREEN + commit. Flipped to REVIEW (not
# DONE_VERIFIED — developer never self-flips per DJ-GATE-1 / task
# instructions); next_agent=qa to independently re-verify.
#
# Usage:
#   jq --arg now "$(date -u +%Y-%m-%dT%H:%M:%SZ)" \
#     -f scripts/dev-fix-devteam-bounded1-depends-on-gate-to-review.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

.task_board as $tb
| ($tb.in_progress | map(select(.id == "FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE"))) as $reviewed
| .task_board.review += ($reviewed | map(. + {
    status: "REVIEW",
    next_agent: "qa",
    reviewed_at: $now,
    reviewed_by: "developer",
    review_note: "Added a depends_on eligibility gate to scripts/devteam-backlog-promote-bounded1.jq's candidate-selection stage (before ranking, not a post-hoc check on the final pick): effective depends_on = inline .depends_on if non-empty, else (for detail_ref'd rows) the lookup in docs/data/orch/archive/backlog-detail.json .items[<id>].depends_on, else []. A dep is satisfied ONLY when it resolves to DONE_VERIFIED in ANY task_board lane (scanned across all 7: done_verified/done/review/qa/in_progress/ready/backlog) -- plain DONE is insufficient, matching repo convention. A dep id resolving in NO lane is conservative-skipped. Threaded --slurpfile detail docs/data/orch/archive/backlog-detail.json through both invocation call sites (docs/agents/dev-team/flow/main.md BOUNDED-1 block + docs/policies/dev-standards.md canonical pointer). Live-data gotcha: 7/321 backlog-detail.json rows carry depends_on as a bare STRING not a 1-element array -- added an as_dep_array normalizer. devteam-backlog-claim-bounded1.jq verified unchanged (only claims whatever promote already stamped). New scripts/test-devteam-bounded1-depends-on.sh: 17/17 checks pass (satisfied/unsatisfied depends_on in both inline+detail_ref shapes, no-depends_on baseline no-regression, dep-resolves-nowhere conservative-skip, DONE-vs-DONE_VERIFIED distinction, string-depends_on drift shape). Manually sanity-checked against a scratch copy of the live orch-state.json + backlog-detail.json (dry-run, never through orch-apply.sh): fixed script now correctly SKIPS FACTORY-TECHANALYSIS-delete-orphaned-ts-service (still unmet deps) and would promote FACTORY-TECHANALYSIS-go-livepath-tests (depends_on: [], the actual next-eligible P1 row) instead. Did NOT touch FACTORY-TECHANALYSIS-go-livepath-tests itself (PO declined manual promotion this cycle -- fixed automation picks it up organically). Commits 70bb222f6 (fix) + 34e5234fd/22435e29e (memory), pushed to main. Decision journal: docs/agent-memory/decisions/sprint-SYSTEMIC-REMAKE-P1-developer.md STEP developer-S5."
  })
)
| .task_board.in_progress |= map(select(.id != "FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE"))
| .task_board._updated_at = $now
| .task_board._updated_by = "developer (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE -> REVIEW)"
| .head = {
    status: "review",
    active_task_id: "FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE",
    next_agent: "qa",
    next_action: "FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE at REVIEW -- qa: verify the depends_on gate (scripts/test-devteam-bounded1-depends-on.sh 17/17, dry-run sanity check against live data confirmed correct skip/pick) then flip DONE_VERIFIED. No rebuild/deploy needed (jq script + doc changes only, consumed by dev-team's own next idle-pickup tick).",
    updated_at: $now,
    updated_by: "developer"
  }
