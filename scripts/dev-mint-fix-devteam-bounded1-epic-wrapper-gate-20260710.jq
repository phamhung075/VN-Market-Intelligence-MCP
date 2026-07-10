# Self-registration mint 2026-07-10 — FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE
# into task_board.in_progress.
#
# Source: PO triage 2026-07-10T00:07Z tick, routed straight to Step 3
#   execution per the dev-team routing table (FIX type = skip PM decomposition,
#   direct execute). No PM-minted board row exists for this task — the
#   executing agent (developer) self-registers it here, consistent with the
#   precedent set by scripts/dev-team-mint-fix-devteam-bounded1-depends-on-gate-20260708.jq.
#
# Root cause: scripts/devteam-backlog-promote-bounded1.jq had WIP +
#   effective_supervised + deps_satisfied gates but NO gate excluding
#   epic-wrapper rows (non-null/non-empty children[]). On 2026-07-09T23:17Z it
#   auto-claimed the P1 epic AUDIT-FETCH-COMPLETE (mode=audit-epic, children=4)
#   for direct dispatch; dev-team reverted + point-fixed supervised:true on
#   that ONE row. A second children[]-bearing row, FACTORY-GUARD-CI-
#   REGRESSION-SPIKE (children=7, supervised:null), stayed exposed — the
#   supervised gate does not catch supervised:null, only a structural
#   children!=null gate protects it. 4th BOUNDED-1 eligibility-gate defect in
#   this class this session (feedback_recurring_bug_escalation).
#
# Usage: jq --arg now "$NOW" \
#   -f scripts/dev-mint-fix-devteam-bounded1-epic-wrapper-gate-20260710.jq \
#   docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: idempotent (append only if id absent board-wide); lane-scoped
#   write only; does NOT touch .head (this is a router/PO-supervised direct
#   dispatch, separate from the BOUNDED-1 auto-pickup lane which already owns
#   .head for TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-CTG-CARRY-FORWARD).

def fixid: "FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE";
def allids: [.task_board | to_entries[] | select(.value | type == "array") | .value[] | .id? // empty];

. as $doc
| (allids) as $ids
| if ($ids | index(fixid)) == null then
    .task_board.in_progress += [{
      id: fixid,
      status: "IN_PROGRESS",
      title: "BOUNDED-1 promote script: exclude epic-wrapper rows (non-null children[]) from auto-promotion",
      owner: "developer",
      next_agent: "developer",
      type: "FIX",
      zone: "cross-service/",
      size: "S",
      priority: "P0",
      severity: "HIGH",
      created_at: $now,
      created_by: "po (triage 2026-07-10T00:07Z, direct-execute FIX routing)",
      claimed_by: "developer",
      claimed_at: $now,
      related: [
        "FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE",
        "FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE",
        "FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX",
        "BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP",
        "AUDIT-FETCH-COMPLETE",
        "SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW"
      ],
      recurrence_class: "project_bounded1_first_pickup_stale_backlog_hygiene_debt (4th variant: epic-wrapper container rows bypass both supervised and depends_on gates)",
      files: [
        "scripts/devteam-backlog-promote-bounded1.jq",
        "scripts/test-devteam-bounded1-epic-wrapper.sh",
        "docs/agents/dev-team/flow/main.md",
        "docs/policies/dev-standards.md"
      ],
      status_note: "ROOT CAUSE (verified by PO reading scripts/devteam-backlog-promote-bounded1.jq): the BOUNDED-1 idle-pickup promote gate had WIP + effective_supervised + deps_satisfied filters but NO gate excluding epic-wrapper rows (rows carrying a non-null/non-empty children[] array). On 2026-07-09T23:17Z it auto-claimed the P1 epic AUDIT-FETCH-COMPLETE (mode=audit-epic, children=4, no own next_agent/probe) for direct dispatch; dev-team reverted + point-fixed supervised:true on that ONE row. docs/data/orch/archive/backlog-detail.json has a SECOND children[]-bearing row still exposed: FACTORY-GUARD-CI-REGRESSION-SPIKE (children=7, supervised:null) -- the supervised gate does NOT catch supervised:null, so only a structural children!=null gate protects it. FIX: added effective_children/is_epic_wrapper predicate mirroring the shipped effective_supervised precedence (inline .children OR $detail_items[.id].children, no .detail_ref precondition) -- reused the already-threaded --slurpfile detail. Applied the select() filter at candidate-selection time alongside the existing supervised/deps filters. Added scripts/test-devteam-bounded1-epic-wrapper.sh (15/15 pass) covering detail-only children (the exact FACTORY-GUARD-CI-REGRESSION-SPIKE reproducer with supervised:null), board-only children, both-signal (AUDIT-FETCH-COMPLETE shape), empty children[] (not a wrapper), missing key (conservative-default promotable), and ARRAY-shaped $detail_items (no crash). Verified baseline suites unregressed: test-devteam-bounded1-supervised-flag.sh (15/15) + test-devteam-bounded1-depends-on.sh (18/18), all green after the change. Live-data dry-run (never through orch-apply.sh) confirmed the shipped gate now skips both FACTORY-GUARD-CI-REGRESSION-SPIKE and AUDIT-FETCH-COMPLETE and promotes a legitimate non-epic row instead when WIP is forced to 0 on a scratch copy. This is the 4th BOUNDED-1 eligibility-gate defect in the same class -- SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW (architect, non-blocking, already minted 2026-07-09) covers whether a shared detail-resolution contract should replace hole-by-hole patches; not re-escalated again here, same open spike already tracks it. DJ-GATE-1 entry required before DONE/REVIEW flip."
    }]
  else . end
| .task_board._updated_at = $now
| .task_board._updated_by = "developer"
