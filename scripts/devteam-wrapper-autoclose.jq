# scripts/devteam-wrapper-autoclose.jq
#
# FIX-DEVTEAM-EPIC-WRAPPER-AUTOCLOSE-SWEEP (dev-team post-cycle, 2026-07-29).
#
# ROOT CAUSE this closes: docs/agents/dev-team/flow/main.md Step 0b's
# pipeline-resume only fires on `.head.status == "in_progress"` — once pm
# decomposes an epic-wrapper row (non-empty children[]) and `.head` resets
# to idle per the normal decomposition convention, NOTHING re-checks
# whether the wrapper's own children have since ALL reached a terminal
# status. Live incident: BACKLOG-HYGIENE-VERIFY-PRUNE-SWEEP's ready[] row
# sat open for hours after all 11 children reached DONE_VERIFIED — caught
# only by chance during a manual board inspection (2026-07-10). See
# feedback_epic_wrapper_closeout_gap_no_auto_revisit + audit entry
# dev-team-loop-P3, docs/architecture-briefs/
# 2026-07-12-ultracode-workflow-improvement-audit.md.
#
# Distinct from FIX-DEVTEAM-BOUNDED1-EPIC-WRAPPER-GATE (is_epic_wrapper,
# scripts/lib/devteam-eligibility.jq) — that gate stops a wrapper row from
# EVER being auto-promoted/auto-claimed as if it were an atomic autonomous
# fix. This script is the OPPOSITE direction: it closes a wrapper row OUT
# once it has legitimately finished. It never touches backlog[] and never
# claims a wrapper as new dispatchable work.
#
# ELIGIBILITY (per row in .task_board.ready[] UNION .task_board.in_progress[]):
#   - is_epic_wrapper($detail_items) — non-empty effective children[]
#     (inline OR backlog-detail.json items[<id>].children, same board-OR-
#     detail precedence as every other effective_* predicate).
#   - all_children_terminal($detail_items; $status_map) — EVERY child id
#     resolves (in ANY hot task_board lane OR cold-archived
#     docs/data/orch/archive/YYYY-MM.json .done_tasks[]) to a status in
#     TERMINAL_SET = {DONE, DONE_VERIFIED, CANCELLED, DEFERRED, SKIPPED}
#     (case/separator-normalized). A child id found in NEITHER hot NOR cold
#     archive is conservative-skip (row stays open, never assumed done).
#   - NOT carrying a hold_reason (inline OR detail) — a wrapper deliberately
#     held open past children-completion is never swept.
#
# WIP / CONCURRENCY DISCIPLINE (mirrors BOUNDED-1/SLS/RLC's own named
# formula, adapted for a closeout-direction sweep rather than a new-work
# pickup): this sweep is NEVER gated on WIP (`.task_board.in_progress
# |length`) — moving a row OUT of ready[]/in_progress[] into review[] can
# only DECREASE that count, never increase it, so it can never itself
# compete with or starve BOUNDED-1's WIP<1 / SLS+RLC's WIP2<2 budgets; if
# anything it frees a slot a stale wrapper was squatting on. No per-tick row
# cap either — ALL eligible rows are swept in ONE orch-apply.sh write here
# (mirrors post-cycle.md Step 4.2/4.3's own "process everything eligible
# this tick" idiom, not BOUNDED-1's single-pick discipline: a closeout
# sweep is administrative housekeeping, not a new-work concurrency
# decision). The follow-up pm/owner dispatch
# (docs/agents/dev-team/flow/post-cycle.md § Step 4.4) claims each swept
# row's OWN `task:<id>` lock individually before spawning — that per-row
# lock is the only concurrency guard this feature needs.
#
# STATUS-FLIP = LANE-MOVE (CANONICAL:SSOT-STATUSFLIP-LANEMOVE,
# docs/agents/dev-team/flow/execute-tier.md): each swept row's array
# membership moves OUT of its source lane (ready[] or in_progress[]) INTO
# review[] in this SAME write, status set to "REVIEW" (the only non-BLOCKED
# value LANE_ALLOWED_STATUSES permits for review[] —
# apps/mcp-server/src/infrastructure/orchStateSchema.ts:427). `.head` is
# synced ONLY if `.head.active_task_id` equals a swept row's own id (rule
# (b) — conditional guard, mirrors ops-closegate-handoff.jq's own guarded
# pattern; in the ordinary case `.head` already went idle right after pm's
# decomposition, long before this sweep ever runs, so this branch is
# expected to be a no-op on live data — implemented defensively regardless,
# never assumed).
#
# Stamps on each swept row: status="REVIEW", next_agent=
# resolved_dispatch_lane($detail_items) (effective_next_agent ->
# effective_owner -> "developer" fallback — same shared resolver SLS/RLC
# use, no forked logic), autoclosed_at=$now, autoclosed_by="dev-team
# (wrapper autoclose sweep)", status_note="children-all-terminal: <agent>
# closeout" (audit-brief dev-team-loop-P3's own proposed note text).
#
# If nothing in ready[]/in_progress[] is eligible: no-op (outputs the input
# document unchanged) — safe to re-run every post-cycle tick.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate; ALWAYS invoked from the
# project root):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     --slurpfile detail docs/data/orch/archive/backlog-detail.json \
#     --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
#     -f scripts/devteam-wrapper-autoclose.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/dev-team/flow/post-cycle.md § Step 4.4 — Epic-Wrapper
# Autoclose Sweep.

include "scripts/lib/devteam-eligibility";

(detail_items_from($detail)) as $detail_items
| dep_status_map($archive) as $status_map
| (
    [ ["ready", "in_progress"][] as $lane
      | (.task_board[$lane] // []) | to_entries[]
      | select(.value | is_epic_wrapper($detail_items))
      | select(.value | all_children_terminal($detail_items; $status_map))
      | select((.value | has_hold_reason($detail_items)) | not)
      | { lane: $lane, idx: .key, row: .value,
          agent: (.value | resolved_dispatch_lane($detail_items)) }
    ]
  ) as $swept
| if ($swept | length) == 0 then
    .   # nothing eligible — no-op
  else
    ($swept | map(select(.lane == "ready")       | .idx)) as $ready_idx
    | ($swept | map(select(.lane == "in_progress") | .idx)) as $inprog_idx
    | ($swept | map(.row.id)) as $swept_ids
    | .task_board.review = ((.task_board.review // []) + [
        $swept[] | . as $s
        | ($s.row + {
            status: "REVIEW",
            next_agent: $s.agent,
            autoclosed_at: $now,
            autoclosed_by: "dev-team (wrapper autoclose sweep)",
            status_note: ("children-all-terminal: " + $s.agent + " closeout")
          })
      ])
    | .task_board.ready = [ .task_board.ready | to_entries[] | .key as $k | select(($ready_idx | index($k)) == null) | .value ]
    | .task_board.in_progress = [ .task_board.in_progress | to_entries[] | .key as $k | select(($inprog_idx | index($k)) == null) | .value ]
    | .head = (
        (.head.active_task_id // null) as $active
        | if ($active != null) and (($swept_ids | index($active)) != null) then
            { status: "idle", active_task_id: null, next_agent: "router",
              updated_at: $now, updated_by: "dev-team (wrapper autoclose sweep)" }
          else .head end
      )
  end
