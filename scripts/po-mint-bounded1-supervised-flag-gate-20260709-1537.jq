# PO triage tick 2026-07-09T15:37Z — mint TWO rows into task_board.backlog[]:
#   (1) FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE  (P0 safety-gate fix — immediate hole-closer)
#   (2) SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW (architect recurrence-escalation, plan-only,
#       NON-BLOCKING to the FIX)
#
# Source: router-driven dev-team tick (router session 5a45feda...). Live near-miss on a
#   safety-critical dispatch guard: scripts/devteam-backlog-promote-bounded1.jq auto-promoted
#   +claimed FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (P0, supervised since 2026-07-04T19:23:49Z /
#   4231a1157, supervised_note "NOT a BOUNDED-1 auto-pickup target") into in_progress at
#   2026-07-09T15:48Z. Root cause: the eligibility filter (~L165) reads .supervised ONLY off the
#   thin task_board.backlog[] row, but supervised:true is authoritatively written to
#   docs/data/orch/archive/backlog-detail.json .items[].supervised — so the check silently
#   evaluated false for every detail_ref'd supervised row. Router already reverted the claim + reset
#   .head to idle + stamped supervised:true onto all 8+ Phase-1 board rows (90e970b47) as a
#   data-hygiene PATCH, not the fix — the board-row stamp must be remembered by hand on every future
#   supervised-set addition. The real fix cross-checks supervised from the same $detail slurpfile the
#   depends_on gate already threads through.
#
# This is the 4th distinct BOUNDED-1 eligibility-gate defect in ~5 days (07-04 stale-already-done,
#   07-08 depends_on, 07-09 array-index shape, 07-09 supervised-flag) -> crosses the
#   feedback_recurring_bug_escalation 2+ threshold -> architect SPIKE minted alongside.
#
# Usage: NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" -f scripts/po-mint-bounded1-supervised-flag-gate-20260709-1537.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
# Invariants: idempotent (each row appended only if its id is absent board-wide); backlog[] lane-scoped
#   write only; no hardcoded head/lane mutation beyond the two appends + _updated stamps.

def fixid:   "FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE";
def spikeid: "SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW";
def allids: [.task_board | to_entries[] | select(.value | type == "array") | .value[] | .id? // empty];

. as $doc
| (allids) as $ids
| ( if ($ids | index(fixid)) == null then
      .task_board.backlog += [{
        id: fixid,
        status: "BACKLOG",
        title: "BOUNDED-1 promote script: cross-check supervised from backlog-detail.json .items[] (not just the thin board row) so the Phase-1 supervised set can't be auto-promoted",
        owner: "po",
        next_agent: "developer",
        type: "FIX",
        zone: "cross-service/",
        size: "S",
        priority: "P0",
        severity: "HIGH",
        created_at: $now,
        created_by: "po (triage 2026-07-09T15:37Z, router-driven dev-team tick)",
        related: [
          "FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE",
          "FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX",
          "BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP",
          "FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD",
          "SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW"
        ],
        recurrence_class: "project_bounded1_first_pickup_stale_backlog_hygiene_debt (3rd+ variant: bypasses an explicit safety flag, not just staleness)",
        files: [
          "scripts/devteam-backlog-promote-bounded1.jq",
          "docs/agents/dev-team/flow/main.md",
          "scripts/test-devteam-bounded1-supervised-flag.sh"
        ],
        status_note: "LIVE near-miss on a safety-critical dispatch guard (2026-07-09T15:48Z): scripts/devteam-backlog-promote-bounded1.jq auto-promoted+claimed FIX-ORPHAN-ADOPTION-BOARD-STATE-GUARD (P0, supervised since 2026-07-04T19:23:49Z/4231a1157) into in_progress despite supervised_note='NOT a BOUNDED-1 auto-pickup target'. ROOT CAUSE: the candidate-selection filter (~L165) `select((.value.supervised // false) != true)` reads supervised ONLY off the thin task_board.backlog[] row, but supervised:true is authoritatively written to docs/data/orch/archive/backlog-detail.json .items[].supervised -- so the check silently evaluated false for every detail_ref'd supervised row (all 8 in the Phase-1 set). Router mitigated (90e970b47): reverted the claim (row back to backlog[], .head->idle) + stamped supervised:true onto every Phase-1 board row -- a DATA-HYGIENE PATCH that must be re-applied by hand on every future supervised-set addition, NOT the fix. APPROACH (mirror the depends_on gate that already shipped in this same file): the script ALREADY receives --slurpfile detail docs/data/orch/archive/backlog-detail.json and id-keys it into $detail_items (see the FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX ingest ~L156). Add def effective_supervised($detail_items): true if EITHER `.supervised == true` on the inline board row OR `$detail_items[.id].supervised == true` (detail-authoritative). Change the ~L165 filter to `select((.value | effective_supervised($detail_items)) != true)`. NO new call-site change needed -- the --slurpfile detail is already threaded through BOTH dev-team flow invocations for the depends_on gate; VERIFY (do not re-add). Conservative default: absent/null supervised in both places = NOT supervised (promotable) -- preserves baseline behavior. Add scripts/test-devteam-bounded1-supervised-flag.sh covering: (a) supervised ONLY in backlog-detail.json .items[] (board row has no flag) -> SKIPPED (the exact 07-09 failure), (b) supervised ONLY on the board row (router-stamp case) -> SKIPPED, (c) supervised in neither -> promoted (baseline), (d) supervised in both -> SKIPPED. Keep orch-apply.sh-gated, no hardcoded task IDs, idempotent/re-run-safe. DJ-GATE applies before any DONE/REVIEW flip. This is the 4th distinct BOUNDED-1 eligibility-gate defect in ~5 days (stale 07-04, depends_on 07-08, array-index 07-09, supervised-flag 07-09) -- SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW (architect, non-blocking) asks whether all eligibility metadata should resolve through ONE detail-resolution contract; do NOT wait on it -- ship this hole-closer now."
      }]
    else . end )
| ( if ($ids | index(spikeid)) == null then
      .task_board.backlog += [{
        id: spikeid,
        status: "BACKLOG",
        title: "SPIKE (architect, plan-only): 4 distinct BOUNDED-1 eligibility-gate defects in ~5 days -- should the promote filter resolve ALL gating metadata (depends_on, supervised, future) through one shared detail-resolution contract instead of hole-by-hole patches?",
        owner: "po",
        next_agent: "architect",
        type: "SPIKE",
        mode: "spike",
        plan_only: true,
        zone: "cross-service/",
        size: "S",
        priority: "medium",
        timebox: 120,
        created_at: $now,
        created_by: "po (triage 2026-07-09T15:37Z — feedback_recurring_bug_escalation 2+ threshold)",
        question: "scripts/devteam-backlog-promote-bounded1.jq has taken 4 distinct eligibility-gate defects in ~5 days -- 07-04 stale-already-done (BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP), 07-08 no depends_on check (FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE), 07-09 backlog-detail .items shape crash (FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX), 07-09 supervised read off thin board row only (FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE). Common root: eligibility-gating metadata (depends_on, supervised) is authoritative in docs/data/orch/archive/backlog-detail.json .items[] but the filter has wired each field in ad-hoc. QUESTION: should the eligibility filter be refactored around ONE 'resolve candidate eligibility from detail' contract (single shape-normalizer + a declared set of gating fields) so the Nth field addition can't reintroduce this class? Output: a findings doc + recommendation (refactor vs. status-quo-is-fine). NON-BLOCKING: FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE ships independently and this SPIKE only informs the next iteration.",
        related: [
          "FIX-DEVTEAM-BOUNDED1-SUPERVISED-FLAG-GATE",
          "FIX-DEVTEAM-BOUNDED1-DEPENDS-ON-GATE",
          "FIX-DEVTEAM-BOUNDED1-DETAIL-ITEMS-ARRAY-INDEX",
          "BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP"
        ],
        status_note: "Recurrence-escalation SPIKE per feedback_recurring_bug_escalation (2+ recurrence -> architect). Plan-only findings doc; no code change in this row. Deliberately NOT a blocker on the immediate FIX."
      }]
    else . end )
| .task_board._updated_at = $now
| .task_board._updated_by = "po (triage 2026-07-09T15:37Z)"
