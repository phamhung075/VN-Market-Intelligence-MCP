# scripts/devteam-qadrain-skip-revert.jq
# FIX-DEVTEAM-QADRAIN-SKIP-BRANCH-STRANDS-ALREADY-LANEMOVED-ROW-IN-QA
# Architect brief docs/architecture-briefs/2026-08-26-qadrain-shared-hop-
# timegate-conservation-skipstrand.md §3.
#
# Reverses ONE row's qa[] lane-move when the caller's per-row outer_claim
# (task_claim) failed after the batch script (devteam-review-claim-qa-
# drain.jq) already moved it. Defensive: no-op if the row is no longer
# present in qa[] or no longer status==QA (a peer already progressed it
# further — never clobber that).
#
# Routed by the already-stamped `drain_source_lane: "review"|"done"` field
# (stamped by devteam-review-claim-qa-drain.jq on every batch move) — this
# is the exact routing information the reversal needs, already present, no
# new field to mint.
#
# No `redispatch_count` charge — no qa work happened, nothing to penalize
# (same "not charged" convention row 1's AC-4 established for the
# premature-dispatch case).
#
# Usage (invoked identically from BOTH QA-Drain SKIP branches — idle-tick +
# head-decoupled — ALWAYS through the orch-apply.sh gate, ALWAYS from the
# project root, and NEVER piped through `|| true` — a nonzero exit here must
# be logged loudly, not silently discarded; see docs/agents/dev-team/flow/
# main.md § Review-Lane QA-Drain SKIP branch):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg id "<row.id>" --arg now "$NOW" \
#     -f scripts/devteam-qadrain-skip-revert.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
(.task_board.qa // []) as $q
| ([$q[] | select(.id == $id)][0]) as $t
| if $t == null then .
  elif ($t.status // null) != "QA" then .
  else
    ($t.drain_source_lane // "review") as $src_lane
    | ($src_lane | ascii_upcase) as $src_status
    | .task_board.qa = [$q[] | select(.id != $id)]
    | .task_board[$src_lane] = ((.task_board[$src_lane] // []) + [
        ($t + { status: $src_status, status_note: (($t.status_note // "") +
            "\n[dev-team] QA-DRAIN SKIP-REVERT: outer_claim failed (peer-held); "
            + "returned " + $src_lane + "[] unchanged, not charged.") }
          | del(.claimed_at, .claimed_by, .drain_source_lane))
      ])
  end
