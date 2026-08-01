# scripts/devteam-review-claim-secondary-drain.jq
#
# FIX-DEVTEAM-REVIEW-LANE-SECONDARY-DRAIN (architect brief 2026-08-01,
# docs/architecture-briefs/2026-08-01-review-lane-drain-throughput-and-
# secondary-sweep.md §2). Implements Remedy (b) — the SECONDARY
# owner-triage sweep. Design is decided in the brief; this file follows §2b
# verbatim, not re-derived.
#
# ROOT CAUSE this closes (brief §0/§2, PO's own AC(1)): review[] rows whose
# effective_next_agent is null/absent OR anything other than "qa" (routed
# to ops/po/architect/agent-father/developer/dev-team/etc, or never routed
# at all) have NO automated sweep — scripts/devteam-review-claim-qa-drain.jq
# (the PRIMARY lane) only ever fires on effective_next_agent == "qa"; grep
# confirmed (brief §2a) that no agent's own flow (po/architect/pm/...) scans
# review[] either — every one of the 14+ distinct non-null next_agent
# values sits with no dedicated triage surface. Live re-measured at
# implementation time (2026-08-01, jq against the live board — do not trust
# any hardcoded count, the board churns tick to tick): review[]=249 rows
# total (246 status=="REVIEW", 3 BLOCKED excluded by construction);
# PRIMARY(next_agent=="qa")=202, SECONDARY(next_agent!="qa")=44 across 12
# distinct non-null next_agent values (ops=8, dev-team=5, po=5,
# agent-father=3, architect=3, developer=3, dev-mcp-server=2, pm=2, ba=1,
# cowork-refactory-expert=1, dev-kinh-dich=1, + 10 null).
#
# Selection (age-ordered, mirrors devteam-review-claim-qa-drain.jq's own
# age key EXACTLY — same `updated_at // reviewed_at // created_at`
# precedence, missing timestamp treated as oldest):
#   - candidate lane: .task_board.review[]
#   - status == "REVIEW" (excludes BLOCKED rows — same negative control as
#     PRIMARY QA-Drain, PO AC(4): a BLOCKED review row is not ready for
#     triage by construction)
#   - effective_next_agent($detail_items) != "qa" (single predicate covers
#     null/absent AND every other non-qa value — identical partition
#     scripts/audits/devteam-review-lane-drain-report.sh already uses for
#     its own SECONDARY table, reused here, not forked)
#   - exactly ONE row claimed per invocation (MVP per brief §2b — this
#     lane's DoD bar is "exists + drained >=1 row," not PRIMARY's 5-tick
#     throughput trend; batching can follow later if the single-row rate
#     proves insufficient, same "measure, then batch" sequencing the brief's
#     own §1 followed for PRIMARY)
#
# dispatch_target = resolved_secondary_dispatch_target($detail_items)
# (scripts/lib/devteam-eligibility.jq): effective_next_agent if
# present-non-empty, ELSE "po" — see that def's own header for the full
# reasoning (PO is the designated no-resolvable-owner triage role; null
# rows are deliberately NOT routed to architect, to avoid concentrating
# load on the agent already carrying the largest single non-null share).
#
# Mutation — DELIBERATELY DOES NOT move the row to a new board lane (brief
# §2b): TaskBoardSchema (apps/mcp-server/src/infrastructure/
# orchStateSchema.ts) is `.strict()` with exactly the 9 enumerated lanes —
# adding a 10th (e.g. triage[]) is a real schema change (TypeScript +
# validator + coherence-map updates), out of this task's scope, and the
# task's own explicit constraint is "do NOT let (b) piggyback on qa[]"
# either. TaskSchema itself uses `.passthrough()` (grep-verified,
# orchStateSchema.ts:136) — arbitrary new fields on a row are schema-safe.
# So: stamp secondary_claimed_at/secondary_claimed_by/
# secondary_dispatch_target on the row IN PLACE inside .task_board.review[]
# — no lane move, no .status change, no schema change.
#
# NEVER writes .head — the load-bearing design choice (brief §2b): because
# this mechanism never touches the single-slot resume pointer, it carries
# none of the coordination risk that forced PRIMARY QA-Drain's own Part 1/2
# retrofit (FIX-DEVTEAM-QADRAIN-HEAD-WRITE-CONDITIONAL /
# -INVOCATION-HEAD-DECOUPLED) — it ships head-decoupled from day one. The
# caller (docs/agents/dev-team/flow/main.md § Review-Lane SECONDARY-Drain)
# runs this UNCONDITIONALLY on every tick reaching that point (no
# head.status gate — there is nothing to gate) and ALWAYS falls through to
# Step 1 PO Triage afterward, regardless of outcome (never JUMP TO end —
# this lane's own single-row cap is the throttle, not a tick-consuming
# JUMP, per this task's own AC).
#
# Known, accepted, flagged residual (brief §2b, not mitigated here): two
# SECONDARY rows resolving to the SAME dispatch_target on adjacent ticks
# could spawn two concurrent sessions of that same agent before the first
# resolves. Re-picking the SAME oldest row every tick until its
# next_agent/status changes is EXPECTED behavior, not a bug, because this
# script never removes a claimed row from review[] — the row stays
# selectable until its resolution moves it out of REVIEW status (same
# "measure before adding a 2nd mutex layer" posture this whole flow-doc
# already applies elsewhere; fast-follow if observed live: reuse the
# existing task:on-demand:<agent>:<date> mutex pattern).
#
# If review[] has no eligible row (nothing REVIEW + next_agent != "qa")
# this script is a NO-OP (outputs the input document unchanged) — safe to
# re-run every tick without side effects.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>; ALWAYS
# invoked from the project root):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     --slurpfile detail docs/data/orch/archive/backlog-detail.json \
#     -f scripts/devteam-review-claim-secondary-drain.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/dev-team/flow/main.md § Review-Lane SECONDARY-Drain
# (owner-triage sweep), inserted immediately after the Session Gate
# paragraph, before Step 1 — PO Triage.

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
    | select((.value | effective_next_agent($detail_items)) != "qa")
    | { idx: .key, row: .value, age: (.value | age_epoch),
        dispatch_target: (.value | resolved_secondary_dispatch_target($detail_items)) }
  ] | sort_by(.age)
) as $candidates
| if ($candidates | length) == 0 then
    .   # nothing REVIEW + next_agent != "qa" waiting — no-op
  else
    ($candidates[0]) as $picked
    | .task_board.review = [
        .task_board.review
        | to_entries[]
        | if .key == $picked.idx then
            (.value + {
              secondary_claimed_at: $now,
              secondary_claimed_by: "dev-team (review-lane secondary-drain)",
              secondary_dispatch_target: $picked.dispatch_target
            })
          else .value end
      ]
    # .head deliberately untouched — see header "NEVER writes .head"
  end
