# scripts/devteam-backlog-claim-incident-lane-consumer.jq
#
# FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS (P0), sprint
# FIX-READYLANE-NO-SEVERITY-EXPEDITE-FIFO-BURIES-INCIDENT-P0.
# Architect design (followed verbatim, not re-derived):
#   docs/architecture-briefs/2026-08-14-readylane-incident-lane-throughput.md §4a-§4c
# Handoff: docs/handoffs/FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-SCRIPTS.md
#
# ── PROBLEM THIS CLOSES (brief §0-§1) ────────────────────────────────────────
# `ready[]` has exactly ONE generic consumer — the Ready-Lane Consumer (RLC),
# which claims ONE row per invocation and only fires on the idle-chain rotation
# (~1 turn in 6). Against a 68-row queue that is a throughput ceiling of roughly
# one row per six ticks, so a genuinely urgent incident row is buried behind
# whatever FIFO/priority order happens to precede it — no matter how it is
# labelled. The architect measured this explicitly: ORDERING-ONLY fixes
# (comparator changes, new expedite fields) cannot move a BINDING THROUGHPUT
# constraint. What worked on the structurally identical starvation problem was
# QA-Drain's throughput fix (batch claim + dedicated budget: 226 -> 56 PRIMARY
# rows over 8 days), and this lane reuses that proven shape rather than
# inventing a fourth priority tier.
#
# ── SELECTION (brief §4a / §4c) ──────────────────────────────────────────────
#   - candidate lane: .task_board.ready[]
#   - status in {READY, TODO} — identical to RLC (lane-coherence set,
#     apps/mcp-server/src/infrastructure/orchStateSchema.ts)
#   - `is_po_expedited` — the ONLY filter this lane adds on top of RLC's own
#     eligibility chain. It reuses PO's ALREADY-LIVE `po_expedited_at` /
#     `po_expedited_by` convention (5 live rows, 0 code consumers before this
#     script) rather than minting a new `expedite_at`/`incident_ref` field —
#     `always_extend_not_duplicate`, and it makes an existing PO triage habit
#     load-bearing instead of leaving it orphaned.
#   - THE FULL RLC ELIGIBILITY CHAIN IS KEPT, UNRELAXED: not
#     effective_supervised, not effective_plan_only, not is_epic_wrapper,
#     deps_satisfied, not is_detail_deferred, and a resolved
#     effective_next_agent/effective_owner. **Severity changes THROUGHPUT
#     PRIORITY, never SAFETY GATING** (brief §4c, explicit): a
#     `supervised: true` row still needs deliberate dispatch no matter how
#     urgent it is, and PO's existing manual-dispatch escape hatch remains the
#     correct path for that rare intersection.
#   - sort: `sort_by([.rank, .po_expedited_at, .idx])`
#       1. `rank` (priority_rank) FIRST — a stray P1-expedited row can never
#          jump a P0-expedited one.
#       2. `po_expedited_at` OLDEST-FIRST — inside this small bounded pool, a
#          freshly-marked incident must not perpetually cut ahead of one that
#          has already been waiting. Scoped deliberately to the incident pool
#          only, never to the whole ready[] queue.
#       3. `idx` as the final deterministic tiebreak.
#
# ── CONCURRENCY (brief §4b) ──────────────────────────────────────────────────
# Claimed rows land in the SAME `.task_board.in_progress[]` lane every sibling
# consumer uses — adding a 10th lane would be a real `TaskBoardSchema.strict()`
# change, the same "avoid unless forced" constraint SECONDARY-Drain's header
# already documents. They are kept OUT of the shared `WIP<=2` budget by their
# DISTINCT `claimed_by` marker, which `incident_wip_in_progress`
# (scripts/lib/devteam-eligibility.jq) counts and `wip_in_progress` ignores. So
# this lane consumes NEITHER the shared slot NOR competes with
# BOUNDED-1/SLS/RLC/DRS for it.
#
# `INCIDENT_CAP = 2` is the ENTIRE answer to "must not saturate like a 4th
# priority tier": however many rows PO ever marks `po_expedited_at`, at most 2
# are in flight through this lane at once — the rest queue, capped, inside the
# incident pool's own ordering, never inside the shared `ready[]` P0 class. The
# caller owns the cap and passes `$take_budget = INCIDENT_CAP -
# incident_wip_in_progress` (same TAKE_BUDGET idiom QA-Drain already uses).
# `$take_budget` is read via `$ARGS.named.take_budget // 1` so this file
# compiles and runs identically whether or not the caller passes it.
#
# ── MUTATION ─────────────────────────────────────────────────────────────────
# Batch of up to `$take_budget` rows moves ready[] -> in_progress[]; status ->
# IN_PROGRESS; ALL rows in the batch share ONE `claimed_at`/`claimed_by` stamp
# (batch-correlation idiom — the caller groups them by that pair to fan out).
#   - `claimed_by: "dev-team (incident-lane consumer)"` — DISTINCT from RLC's
#     `"dev-team (ready-lane consumer)"`. This exact string is what §4b's
#     budget-exclusion filter keys on, and what the caller's `picked_batch`
#     query exact-matches, so it must never be varied or suffixed.
#   - `po_expedited_at` / `po_expedited_by` are carried through UNCHANGED —
#     provenance preserved, never cleared (same "additive lane assignment,
#     never a gate-clear" convention SLS/DRS use for supervised/plan_only).
#   - `.head` is written through the SAME `$head_free` conditional guard
#     RLC/SLS/DRS/QA-Drain already use — never an unconditional replace. It
#     narrates only the batch's TOP row and is cosmetic: dispatch always
#     correlates via `claimed_at`/`claimed_by`, never via `.head.next_action`.
#     No new write pattern is introduced, only a new caller of the
#     already-proven-safe one — which is what keeps the single-linear
#     head-writer collision-freedom proof intact.
#
# If nothing in ready[] is both `po_expedited_at`-marked and otherwise eligible,
# this script is a NO-OP (outputs the input document unchanged) — safe to re-run
# every tick without side effects.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>; ALWAYS
# invoked from the project root). `--argjson take_budget` is OPTIONAL (defaults
# to 1):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     --argjson take_budget "$((INCIDENT_CAP - INCIDENT_WIP))" \
#     --slurpfile detail docs/data/orch/archive/backlog-detail.json \
#     --slurpfile archive <(bash scripts/lib/archive-glob-cat.sh) \
#     -f scripts/devteam-backlog-claim-incident-lane-consumer.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# `--slurpfile archive` (FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING):
# same cold-archive dep_status_map($archive) fallback as BOUNDED-1/SLS/RLC.
#
# Pointer: docs/agents/dev-team/flow/main.md § Incident-Lane Consumer (ILC) —
# Head-Decoupled Invocation, inserted immediately after the Session Gate
# paragraph and BEFORE § Review-Lane SECONDARY-Drain. That call site is
# FIX-DEVTEAM-INCIDENT-LANE-CONSUMER-MAINFLOW (owner agent-father, docs/agents/
# is its exclusive commit_zone) and lands AFTER this row — until it does, this
# script is shipped and tested but not yet invoked on any tick.

include "scripts/lib/devteam-eligibility";

($ARGS.named.take_budget // 1) as $take_budget
| (detail_items_from($detail)) as $detail_items
| dep_status_map($archive) as $status_map
| ( [ .task_board.ready
    | to_entries[]
    | select(.value.status == "READY" or .value.status == "TODO")
    | select(.value | is_po_expedited)
    | select((.value | effective_supervised($detail_items)) != true)
    | select((.value | effective_plan_only($detail_items)) != true)
    | select((.value | is_epic_wrapper($detail_items)) != true)
    | select(.value | deps_satisfied($detail_items; $status_map))
    | select((.value | is_detail_deferred($detail_items)) != true)
    | select(
        ((.value | effective_next_agent($detail_items)) | length) > 0
        or ((.value | effective_owner($detail_items)) | length) > 0
      )
    | { idx: .key, row: .value, rank: (.value | priority_rank),
        expedited_at: ((.value.po_expedited_at // "") | tostring),
        lane: (.value | resolved_dispatch_lane($detail_items)) }
  ] | sort_by([.rank, .expedited_at, .idx])
) as $candidates
| if ($candidates | length) == 0 then
    .   # nothing po_expedited_at-marked AND otherwise eligible — no-op
  else
    ([$take_budget, ($candidates | length)] | min) as $take
    | ($candidates[0:$take]) as $batch
    | ($batch[0]) as $head_picked
    | ($head_picked.row.id) as $picked_id
    | ([$batch[].idx]) as $batch_idx
    | .task_board.in_progress = ((.task_board.in_progress // []) + [
        $batch[] | (.row + {
            status: "IN_PROGRESS",
            claimed_at: $now,
            claimed_by: "dev-team (incident-lane consumer)",
            dispatch_lane: .lane
          })
      ])
    | .task_board.ready = [ .task_board.ready | to_entries[] | select((.key as $k | $batch_idx | index($k)) == null) | .value ]
    | ((.head.status // "idle") as $hs
       | (.head.active_task_id // null) as $ha
       | ($hs == "idle" or $hs == "done" or $ha == null)) as $head_free
    | .head = (
        if $head_free then
          {
            status: "in_progress",
            active_task_id: $picked_id,
            next_agent: $head_picked.lane,
            next_action: ("Incident-Lane Consumer claim of " + ($batch | length | tostring)
              + " po_expedited_at row(s), top-ranked " + $picked_id
              + " — spawn " + $head_picked.lane + " DIRECTLY (no zone-detect indirection; row already carried a resolved next_agent/owner). "
              + "Batch of " + ($batch | length | tostring) + " row(s) share this claimed_at stamp with claimed_by=\"dev-team (incident-lane consumer)\" in .task_board.in_progress[] — correlate by that PAIR to dispatch the rest, never by this narration."),
            updated_at: $now,
            updated_by: "dev-team (incident-lane consumer)"
          }
        else
          .head   # FIX-DEVTEAM-CLAIM-SCRIPTS-UNCONDITIONAL-HEAD-OVERWRITE:
                  # a DIFFERENT task is genuinely live in .head — never
                  # clobber a live resume pointer. Identical guard to
                  # scripts/devteam-backlog-claim-ready-lane-consumer.jq and
                  # every other sibling batch consumer; the lane move above
                  # still happens either way.
        end
      )
  end
