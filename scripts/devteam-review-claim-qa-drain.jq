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
# Selection (PRIORITY-ordered, age tiebreak — FIX-DEVTEAM-QADRAIN-
# THROUGHPUT-CAP, architect brief docs/architecture-briefs/2026-08-06-
# review-lane-qadrain-throughput-unblock.md §2/§3: this was the one lane in
# the entire idle-fallthrough chain still sort_by(.age) with NO priority
# term — BOUNDED-1/SLS/RLC/DRS all already order by [priority_rank, ...].
# Live-demonstrated need: 27 P0 rows in review[], 7 arrived same-day
# (age=0d), would otherwise queue behind a ~226-row FIFO wall (oldest 14d)
# dominated by P2/P3 FACTORY-* cleanup rows under pure age-order):
#   - candidate lanes: .task_board.review[] UNION .task_board.done[]
#     (FIX-DONELANE-NO-DONEVERIFIED-PRODUCER-DEP-STARVATION, architect brief
#     docs/architecture-briefs/2026-08-08-donelane-doneverified-producer.md
#     §1/§2 Component 1 — done[] was a terminal-LOOKING lane with ZERO
#     consumers, so nothing systematically produced the DONE_VERIFIED token
#     that deps_satisfied() requires verbatim, permanently starving every
#     successor of a finished-but-unverified row. done[]'s two blocking-
#     reason classes are structurally IDENTICAL to review[]'s, so the fix is
#     to widen the candidate pool of THIS already-reachability-proven
#     consumer rather than add a new section/call site. The mutation logic is
#     unchanged: this script still only ever moves a row into qa[] at status
#     QA — QA's own independent verify-committed judgment remains the ONLY
#     thing that can ever write DONE_VERIFIED (AC-3 honored by construction).)
#   - status == "REVIEW" for review[]-origin rows, status == "DONE" for
#     done[]-origin rows (excludes BLOCKED rows — a BLOCKED review row is
#     NOT ready for sign-off by construction; negative control, PO AC(4):
#     3 live BLOCKED review rows are structurally excluded by this filter,
#     never touched by this script. Also excludes a DONE_VERIFIED row that
#     happens to sit in done[]: already verified, nothing to drain.)
#   - effective_next_agent($detail_items) == "qa" (PRIMARY set only — PO
#     AC(1): the null/non-qa next_agent subset is a DIFFERENT, NOT-yet-
#     covered class (9 live rows, 2 of them P0) and must NOT be silently
#     treated as "fine" just because this script skips them. Surfaced,
#     non-silently, by scripts/audits/devteam-review-lane-drain-report.sh's
#     SECONDARY section — informational, routed to PO/architect triage, no
#     auto-dispatch (their correct destination is deliberate owner
#     assignment, not a blind qa spawn against a row that was never even
#     ROUTED to qa in the first place).
#   - priority key: `priority_rank` (0=P0/critical ... 9=unset), imported
#     from the already-`include`-d scripts/lib/devteam-eligibility.jq — no
#     new predicate file, same shared def BOUNDED-1/SLS/RLC/DRS already use.
#   - age key (tiebreak within the same priority_rank, unchanged from the
#     original single-priority design): the first present-and-non-null of
#     `updated_at`, then `reviewed_at`, then `created_at`, parsed as epoch
#     seconds. A row carrying NONE of the three is treated as the OLDEST
#     possible (epoch 0 / 1970-01-01) — conservative toward surfacing an
#     indeterminately-stale row rather than silently deprioritizing it
#     behind timestamped peers.
#   - candidates sorted by `sort_by([rank, age])` — full ascending order,
#     not just the head element, since a batch (see below) can now take
#     more than one.
#   - BATCH claim, up to `$take_budget` rows per invocation (was: exactly
#     ONE row, mirroring BOUNDED-1/SLS/RLC's one-at-a-time discipline —
#     superseded here by the same brief's §1/§3: one-row-per-tick throughput
#     cannot drain a ~120+-row backlog faster than it refills).
#     `$take_budget` is read via `$ARGS.named.take_budget` (NOT a bound
#     `--argjson` variable referenced directly) so the script compiles and
#     runs identically whether or not the caller passes it — defaults to
#     `1` (`$ARGS.named.take_budget // 1`) when omitted, which is BOTH the
#     original single-claim behavior AND backward-safe for the pre-existing
#     `docs/agents/dev-team/flow/main.md` call site until its own
#     head-decoupled rewrite (FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED,
#     agent-father) starts passing a real `QA_CAP`/`TAKE_BUDGET` value.
#     Actual take = `min($take_budget, candidates length)` — never errors or
#     pads when fewer than `$take_budget` rows are eligible.
#
# DISPATCH: mirrors SLS/RLC — direct-dispatch `qa`, no zone-detect
# indirection (this lane's next_agent is always literally "qa" by
# selection, zone-detect adds nothing). The caller
# (docs/agents/dev-team/flow/main.md § Review-Lane QA-Drain) sets
# `.head.next_action` to explicitly instruct `verify-committed` mode.
# `claimed_by` MUST stay the LITERAL string "dev-team (review-lane qa-drain)"
# for BOTH source lanes — main.md's dispatch-loop query does an EXACT string
# match on that field, so a source-tagged value would silently drop
# done[]-origin rows out of that tick's BGFAN-1 spawn fan-out. Source
# provenance travels instead on the additive, never-exact-matched
# `drain_source_lane: "review"|"done"` field (audit trail only). Both
# invariants are covered by scripts/test-devteam-donelane-drain.sh (I2/I3).
#
# Concurrency: DEDICATED `qa[] < 1` cap (NOT the shared WIP<=2
# in_progress budget BOUNDED-1/SLS/RLC use) — per the row's own
# SUGGESTED REMEDY ("WIP<=1 for this lane") and because this lane moves
# rows into a DIFFERENT board lane (`task_board.qa[]`, status QA) than the
# in_progress-budget lanes. The caller gates on `.task_board.qa|length < 1`
# read immediately before invoking this script.
#
# Mutation (batch of up to $take_budget rows, was single-row only): each
# candidate in the batch moves review[]/done[] -> qa[] ; status REVIEW/DONE
# -> QA ;
# ALL rows in the batch share the SAME claimed_at/claimed_by stamp
# (batch-correlation idiom, architect brief §3/08-01 brief §1a — lets a
# downstream consumer group them by that stamp) ; CONDITIONALLY set .head
# to the batch's own [rank, age]-highest-ranked row only (see HEAD-SAFE
# CLAIM below — cosmetic narration, does not gate the other rows' move).
# Never touches backlog[]/ready[]/in_progress[] — orthogonal lane,
# orthogonal budget.
#
# HEAD-SAFE CLAIM (FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL,
# docs/architecture-briefs/2026-07-29-qadrain-head-slot-decouple.md §3):
# the review[]->qa[] lane move above ALWAYS happens for every row in the
# batch (selection/lane-move logic is unchanged, just widened from 1 row to
# up to $take_budget) but the `.head` write is now CONDITIONAL on
# `.head` being free ($hs in {idle,done} or $ha == null). PO's live
# dry-run 2026-07-29T19:2xZ against the real board proved the prior
# unconditional `.head = {...}` clobbered a genuinely-running developer
# task's resume pointer (FACTORY-GUARD-CI-METRICMASK-IMPL ->
# overwritten). Mirrors the proven in-repo shape at
# scripts/devteam-wrapper-autoclose.jq:122-128 (same conditional-guard
# idiom, applied in the opposite direction — claiming INTO `.head`
# instead of clearing FROM it). Caller-side impact: NONE for the one
# existing call site (docs/agents/dev-team/flow/main.md §674-726) — that
# site is only ever reached when `.head` is already idle, so
# `$head_free` is always true there today; a future head-busy-safe call
# site (Part 2, FIX-DEVTEAM-QADRAIN-INVOCATION-HEAD-DECOUPLED) instead
# correlates its picked row via `claimed_at`/`claimed_by`, never via
# `.head.next_action` (see brief §3 "Design decision").
#
# If NEITHER lane has an eligible row (nothing REVIEW/DONE with
# next_agent=='qa') this script is a NO-OP (outputs the input document
# unchanged) — safe to re-run every tick without side effects.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>; ALWAYS
# invoked from the project root). `--argjson take_budget` is OPTIONAL — omit
# it entirely for the original single-claim behavior (defaults to 1):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     --argjson take_budget 10 \
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

($ARGS.named.take_budget // 1) as $take_budget
| (detail_items_from($detail)) as $detail_items
| ( [ ( (.task_board.review // [])
        | to_entries[]
        | select(.value.status == "REVIEW")
        | { idx: .key, row: .value, lane: "review" }
      ),
      ( (.task_board.done // [])
        | to_entries[]
        | select(.value.status == "DONE")
        | { idx: .key, row: .value, lane: "done" }
      )
    ]
    | map(select((.row | effective_next_agent($detail_items)) == "qa"))
    | map(. + { rank: (.row | priority_rank), age: (.row | age_epoch) })
    | sort_by([.rank, .age])
) as $candidates
| if ($candidates | length) == 0 then
    .   # nothing REVIEW+next_agent==qa waiting — no-op
  else
    ([$take_budget, ($candidates | length)] | min) as $take
    | ($candidates[0:$take]) as $batch
    | ($batch[0]) as $head_picked
    | ($head_picked.row.id) as $picked_id
    # TWO INDEPENDENT index sets, one per source lane — `idx` is only unique
    # WITHIN one array, so a single shared list would delete the wrong row out
    # of the other lane (e.g. picking done[] idx 0 would drop review[] idx 0).
    | ([$batch[] | select(.lane == "review") | .idx]) as $review_idx
    | ([$batch[] | select(.lane == "done")   | .idx]) as $done_idx
    | .task_board.qa = ((.task_board.qa // []) + [
        $batch[] | (.row + {
            status: "QA",
            claimed_at: $now,
            claimed_by: "dev-team (review-lane qa-drain)",
            drain_source_lane: .lane
          })
      ])
    | ( if ($review_idx | length) > 0 then
          .task_board.review = [ (.task_board.review // []) | to_entries[] | select((.key as $k | $review_idx | index($k)) == null) | .value ]
        else . end )
    | ( if ($done_idx | length) > 0 then
          .task_board.done = [ (.task_board.done // []) | to_entries[] | select((.key as $k | $done_idx | index($k)) == null) | .value ]
        else . end )
    | ((.head.status // "idle") as $hs
       | (.head.active_task_id // null) as $ha
       | ($hs == "idle" or $hs == "done" or $ha == null)) as $head_free
    | .head = (
        if $head_free then
          {
            status: "in_progress",
            active_task_id: $picked_id,
            next_agent: "qa",
            next_action: ("Review-Lane QA-Drain claim of " + ($batch | length | tostring) + " row(s) ("
              + ($review_idx | length | tostring) + " from review[], " + ($done_idx | length | tostring) + " from done[]"
              + "), highest-ranked " + $picked_id
              + " — spawn qa in verify-committed mode (branch:null direct-commit row, no task branch/handoff — "
              + "see docs/agents/qa/flow/main.md § Direct-Commit Verify; do NOT use the normal pipeline JUMP-TO, it requires a branch this row does not have). "
              + "Batch of " + ($batch | length | tostring) + " row(s) share this claimed_at stamp in .task_board.qa[] — correlate by claimed_at to dispatch the rest."),
            updated_at: $now,
            updated_by: "dev-team (review-lane qa-drain)"
          }
        else
          .head   # FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL: a DIFFERENT task is
                  # genuinely live in .head (status in_progress, active_task_id set —
                  # e.g. a developer session actively running) — never clobber it.
                  # Mirrors scripts/devteam-wrapper-autoclose.jq:122-128's own
                  # conditional guard, applied to the claim-INTO-head direction
                  # instead of clear-FROM-head.
        end
      )
  end
