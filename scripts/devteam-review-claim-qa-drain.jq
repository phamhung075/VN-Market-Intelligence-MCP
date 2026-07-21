# scripts/devteam-review-claim-qa-drain.jq
#
# UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (architect, 2026-07-22),
# PO ruling item (3): "review[] gets a QA-drain consumer" — FOLDS
# FIX-DEVTEAM-REVIEW-LANE-QA-DRAIN (backlog since 2026-07-12, ready since
# 2026-07-21, never dispatched — this script + its main.md wiring IS the
# implementation of that row's own SUGGESTED REMEDY).
#
# ROOT CAUSE this closes: review[] is a WRITE-ONLY lane in the dev-team tick
# loop — every developer DONE pushes a row INTO review[], nothing ever
# takes one OUT. Grep-confirmed (2026-07-12, re-confirmed 2026-07-21) across
# every dev-team/flow/*.md file: qa is spawned in exactly two places
# (execute-tier.md merge-gate, inline, needs a live developer->qa handoff in
# the SAME tick; main.md S4 CLEAN, branch cleanup only) — neither scans
# `.task_board.review[]` for a stranded row whose inline qa dispatch never
# ran (dev session died, host wedge, etc). Live 2026-07-21: 32 review rows,
# 11 with next_agent=='qa' and qa[]==0, oldest frozen since 2026-07-10.
#
# HARD PREREQUISITE (PO AC, 2026-07-21 — do not treat as separable): EVERY
# live review[] row has `branch: null` (grep-verified, all 32) — they were
# committed straight to `main` by the FIX-direct-execute path (PO triage
# skip-PM-decomposition convention), never on a `task/NNN-*` branch, and
# most have no `docs/handoffs/TASK_NNN.md` at all. qa/flow/main.md's normal
# `pipeline` JUMP-TO REQUIRES `git checkout task/NNN-*` (line ~113) — it
# CANNOT run against any of these rows. Dispatching qa via the normal
# pipeline here would spawn 32 guaranteed-failing sessions, not drain
# anything. This is why docs/agents/qa/flow/main.md now carries an
# additive `verify-committed` JUMP-TO entry (§ Direct-Commit Verify) that
# skips the checkout and verifies the row's own inline `commit`/`files`/
# `review_note` fields directly against current `main` HEAD — spawn THIS
# script's claimed rows with that mode, never the normal `pipeline` mode.
#
# Selection (AGE-ordered, not priority-ordered — mirrors the row's own
# 2026-07-12 SUGGESTED REMEDY verbatim: "pick oldest by (updated_at //
# reviewed_at // created_at)"):
#   - candidate lane: .task_board.review[]
#   - status == "REVIEW" (excludes BLOCKED rows — a BLOCKED review row is
#     NOT ready for sign-off by construction; negative control, PO AC(4):
#     3 live BLOCKED review rows are structurally excluded by this filter,
#     never touched by this script)
#   - effective_next_agent($detail_items) == "qa" (PRIMARY set only — PO
#     AC(1): the null/non-qa next_agent subset is a DIFFERENT, NOT-yet-
#     covered class (9 live rows, 2 of them P0) and must NOT be silently
#     treated as "fine" just because this script skips them. Surfaced,
#     non-silently, by scripts/audits/devteam-review-lane-drain-report.sh's
#     SECONDARY section — informational, routed to PO/architect triage, no
#     auto-dispatch (their correct destination is deliberate owner
#     assignment, not a blind qa spawn against a row that was never even
#     ROUTED to qa in the first place).
#   - age key: the first present-and-non-null of `updated_at`, then
#     `reviewed_at`, then `created_at`, parsed as epoch seconds. A row
#     carrying NONE of the three is treated as the OLDEST possible
#     (epoch 0 / 1970-01-01) — conservative toward surfacing an
#     indeterminately-stale row rather than silently deprioritizing it
#     behind timestamped peers.
#   - exactly ONE row claimed per invocation (mirrors BOUNDED-1/SLS/RLC's
#     one-at-a-time discipline)
#
# DISPATCH: mirrors SLS/RLC — direct-dispatch `qa`, no zone-detect
# indirection (this lane's next_agent is always literally "qa" by
# selection, zone-detect adds nothing). The caller
# (docs/agents/dev-team/flow/main.md § Review-Lane QA-Drain) sets
# `.head.next_action` to explicitly instruct `verify-committed` mode.
#
# Concurrency: DEDICATED `qa[] < 1` cap (NOT the shared WIP<=2
# in_progress budget BOUNDED-1/SLS/RLC use) — per the row's own
# SUGGESTED REMEDY ("WIP<=1 for this lane") and because this lane moves
# rows into a DIFFERENT board lane (`task_board.qa[]`, status QA) than the
# in_progress-budget lanes. The caller gates on `.task_board.qa|length < 1`
# read immediately before invoking this script.
#
# Mutation (single row only): review[] -> qa[] ; status REVIEW -> QA ;
# stamp claimed_at/claimed_by ; set .head to "qa" directly. Never touches
# backlog[]/ready[]/in_progress[] — orthogonal lane, orthogonal budget.
#
# If review[] has no eligible row (nothing REVIEW+next_agent=='qa') this
# script is a NO-OP (outputs the input document unchanged) — safe to
# re-run every tick without side effects.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>; ALWAYS
# invoked from the project root):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     --slurpfile detail docs/data/orch/archive/backlog-detail.json \
#     -f scripts/devteam-review-claim-qa-drain.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/dev-team/flow/main.md § Review-Lane QA-Drain,
# inserted immediately after the Ready-Lane Consumer block, on the same
# head-idle fall-through, before Step 1 PO triage.

include "scripts/lib/devteam-eligibility";

def age_epoch:
  (.updated_at // .reviewed_at // .created_at) as $ts
  | if $ts == null then 0
    else ( try ($ts | fromdateiso8601) catch 0 )
    end;

(detail_items_from($detail)) as $detail_items
| ( [ .task_board.review
    | to_entries[]
    | select(.value.status == "REVIEW")
    | select((.value | effective_next_agent($detail_items)) == "qa")
    | { idx: .key, row: .value, age: (.value | age_epoch) }
  ] | sort_by(.age)
) as $candidates
| if ($candidates | length) == 0 then
    .   # nothing REVIEW+next_agent==qa waiting — no-op
  else
    ($candidates[0]) as $picked
    | ($picked.row.id) as $picked_id
    | .task_board.qa = ((.task_board.qa // []) + [
        ($picked.row + {
            status: "QA",
            claimed_at: $now,
            claimed_by: "dev-team (review-lane qa-drain)"
          })
      ])
    | .task_board.review = [ .task_board.review | to_entries[] | select(.key != $picked.idx) | .value ]
    | .head = {
        status: "in_progress",
        active_task_id: $picked_id,
        next_agent: "qa",
        next_action: ("Review-Lane QA-Drain claim of " + $picked_id
          + " — spawn qa in verify-committed mode (branch:null direct-commit row, no task branch/handoff — "
          + "see docs/agents/qa/flow/main.md § Direct-Commit Verify; do NOT use the normal pipeline JUMP-TO, it requires a branch this row does not have)."),
        updated_at: $now,
        updated_by: "dev-team (review-lane qa-drain)"
      }
  end
