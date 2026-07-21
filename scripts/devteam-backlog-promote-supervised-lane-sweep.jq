# scripts/devteam-backlog-promote-supervised-lane-sweep.jq
#
# FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (architect, 2026-07-21).
#
# ROOT CAUSE this closes: scripts/devteam-backlog-promote-bounded1.jq's
# SUPERVISED GATE + PLAN-ONLY GATE correctly WITHHOLD every effectively-
# supervised-AND-effectively-plan_only backlog row from BOUNDED-1
# auto-pickup (by design — those rows are a deliberate-dispatch class, not
# an autonomous-code-fix class). But the promote script's own header comment
# claims withheld rows "still launch normally via the router-adjudicated
# path (Step 1 PO triage / manual dispatch)" — CONFIRMED FALSE live
# 2026-07-21: neither docs/agents/po/flow/main.md nor
# docs/agents/dev-team/flow/main.md ever swept task_board.backlog[] for
# supervised/plan_only rows ordered by priority. The gate worked; the
# destination it promised never existed. This script (+ its companion claim
# script + the dev-team/flow/main.md "Supervised-Lane Sweep" wiring) BUILDS
# that destination — it does not disable the gate.
#
# What this is NOT: this is NOT BOUNDED-1's promote script with the
# supervised/plan_only filters inverted-and-relaxed into a second
# auto-pickup lane. It is the OPPOSITE selection (supervised AND plan_only
# BOTH true — the exact doubly-gated class) and it NEVER clears/overrides
# `supervised`/`plan_only` on the picked row (both flags are preserved
# verbatim via the `$picked.row + {...}` merge below — additive stamp only,
# per FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER's explicit constraint: "the
# sweeper must assign a real lane, not disable the gate").
#
# Selection:
#   - candidate lane: .task_board.backlog[]
#   - status in {BACKLOG, TODO} (mirrors BOUNDED-1's own status filter)
#   - effective_supervised == true AND effective_plan_only == true (board-OR-
#     detail precedence, identical defs to devteam-backlog-promote-bounded1.jq
#     — no forked logic)
#   - not an epic wrapper (effective_children, same def as BOUNDED-1)
#   - depends_on eligible (effective_depends_on / deps_satisfied, same def
#     and same cross-lane DONE_VERIFIED-only satisfaction rule as BOUNDED-1)
#   - not detail-authoritative DEFERRED* (is_detail_deferred, same def)
#   - ordered by priority_rank ascending, tiebreak by backlog[] array index
#     (same FIFO-proxy convention as BOUNDED-1)
#   - exactly ONE row promoted per invocation (mirrors BOUNDED-1's own
#     one-at-a-time discipline)
#
# dispatch_lane resolution (the "assign a real lane" requirement):
#   effective_next_agent(detail-first, board-fallback) if present-and-non-
#   empty, ELSE effective_owner(detail-first, board-fallback) if present-and-
#   non-empty, ELSE "developer" (same Tier-3 generic fallback zone-detect
#   itself uses — a legitimate, real, general-purpose lane, never "none").
#   Verified live 2026-07-21 (scripts/audits/bounded1-supervised-lane-
#   report.sh): every one of the 16 live supervised+plan_only rows resolves
#   to a real, non-fallback lane (ba/architect/po/ops/dev-rag-service) — the
#   "developer" fallback exists for defensive completeness, not because any
#   live row needs it today.
#
# Concurrency: shares the pre-existing WIP<=2 invariant
# (docs/agents/dev-team/flow/main.md § Invariants) with BOUNDED-1 — NOT a
# new budget. BOUNDED-1's own header comment already names this: "[WIP<=2]
# is the existing, separate router/PO WIP budget for supervised/manual
# dispatch; this auto-pickup lane [BOUNDED-1] is bounded independently and
# more conservatively [WIP<1]". This script's caller (dev-team/flow/main.md
# § Supervised-Lane Sweep) gates on a FRESH WIP<2 read taken AFTER BOUNDED-1's
# own promote+claim pair has already run and (if it fired) already
# JUMP-TO-execute'd away — so this script's invocation only ever happens on
# BOUNDED-1's own no-op/fallthrough path, when head is still idle. No `.head`
# collision is possible by construction (see caller comment for the
# control-flow argument).
#
# Mutation (single row only, ADDITIVE — never clears supervised/plan_only):
#   backlog[] -> ready[] ; status BACKLOG/TODO -> READY ; stamp promoted_at /
#   promoted_by="dev-team (supervised-lane sweep)" / promotion_note /
#   dispatch_lane. Also stamps .task_board.last_triaged_at/last_triaged_by.
#   `supervised`/`plan_only` fields are carried through UNCHANGED (still
#   `true`) on the promoted row — the claim script and the eventual spawned
#   agent both see the row is still marked supervised/plan_only; only its
#   LANE (who picks it up) has been resolved, not its gate status.
#
# NO hardcoded task-id literals anywhere in this file (grep-verified, mirrors
# BOUNDED-1's own discipline).
#
# Usage (ALWAYS through the orch-apply.sh gate — never raw mv/cp/>):
#   NOW=$(date -u +%Y-%m-%dT%H:%M:%SZ)
#   jq --arg now "$NOW" \
#     --slurpfile detail docs/data/orch/archive/backlog-detail.json \
#     -f scripts/devteam-backlog-promote-supervised-lane-sweep.jq \
#     docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Pointer: docs/agents/dev-team/flow/main.md § Supervised-Lane Sweep (SLS),
# inserted immediately after the BOUNDED-1 Idle-capacity backlog pickup
# block, on the same head-idle fall-through, before Step 1 PO triage.

def as_dep_array:
  if . == null then []
  elif (type == "string") then [.]
  elif (type == "array") then .
  else [] end;

def priority_rank:
  ((.priority // "") | ascii_downcase) as $p
  | if   ($p | test("^p0$|^critical$"))              then 0
    elif ($p | test("^p1$|^high$"))                  then 1
    elif ($p | test("^p2$|^med(ium)?$|^normal$"))    then 2
    elif ($p | test("^p3$|^low$"))                   then 3
    else 9
    end;

def effective_supervised($detail_items):
  (.supervised == true)
    or ( (.id != null) and ($detail_items[.id].supervised // false) == true );

def effective_plan_only($detail_items):
  (.plan_only == true)
    or ( (.id != null) and (($detail_items[.id].plan_only // false) == true) );

def effective_children($detail_items):
  (.children | as_dep_array) as $inline
  | if ($inline | length) > 0 then $inline
    elif (.id != null) then ($detail_items[.id].children | as_dep_array)
    else [] end;

def is_epic_wrapper($detail_items):
  (effective_children($detail_items) | length) > 0;

def is_detail_deferred($detail_items):
  if (.id == null) then false
  else
    ($detail_items[.id].status) as $ds
    | if ($ds == null) or (($ds | type) != "string") then false
      else ($ds | ascii_downcase | startswith("deferred"))
      end
  end;

def effective_depends_on($detail_items):
  ((.depends_on | as_dep_array) + (.depends | as_dep_array) + (.blocked_by | as_dep_array)) as $inline
  | if ($inline | length) > 0 then $inline
    elif (.detail_ref != null) then
      (($detail_items[.id].depends_on | as_dep_array) + ($detail_items[.id].depends | as_dep_array) + ($detail_items[.id].blocked_by | as_dep_array))
    else [] end;

def dep_status_map:
  . as $doc
  | ["backlog", "ready", "in_progress", "qa", "review", "done", "done_verified"] as $lanes
  | reduce $lanes[] as $lane
      ( {}
      ; . + ( [ ($doc.task_board[$lane] // [])[]
                | select(.id != null)
                | { key: .id, value: .status }
              ] | from_entries )
      );

def deps_satisfied($detail_items; $status_map):
  effective_depends_on($detail_items) as $deps
  | ($deps | length) == 0
    or ( [ $deps[] | ($status_map[.] // "MISSING") ] | all(. == "DONE_VERIFIED") );

def effective_owner($detail_items):
  (if (.id != null) then $detail_items[.id].owner else null end) as $detail_owner
  | if ($detail_owner != null) and (($detail_owner | type) == "string") and ($detail_owner != "") then
      $detail_owner
    else (.owner // "") end;

def effective_next_agent($detail_items):
  (if (.id != null) then $detail_items[.id].next_agent else null end) as $detail_na
  | if ($detail_na != null) and (($detail_na | type) == "string") and ($detail_na != "") then
      $detail_na
    else (.next_agent // "") end;

def resolved_dispatch_lane($detail_items):
  (effective_next_agent($detail_items)) as $na
  | (effective_owner($detail_items)) as $ow
  | if ($na | length) > 0 then $na
    elif ($ow | length) > 0 then $ow
    else "developer" end;

(($detail[0].items // []) as $raw_items
  | if ($raw_items | type) == "object" then $raw_items
    else ($raw_items | map(select(.id != null) | {key: .id, value: .}) | from_entries)
    end
) as $detail_items
| dep_status_map as $status_map
| ( [ .task_board.backlog
    | to_entries[]
    | select(.value.status == "BACKLOG" or .value.status == "TODO")
    | select((.value | effective_supervised($detail_items)) == true)
    | select((.value | effective_plan_only($detail_items)) == true)
    | select((.value | is_epic_wrapper($detail_items)) != true)
    | select(.value | deps_satisfied($detail_items; $status_map))
    | select((.value | is_detail_deferred($detail_items)) != true)
    | { idx: .key, row: .value, rank: (.value | priority_rank),
        lane: (.value | resolved_dispatch_lane($detail_items)) }
  ] | sort_by([.rank, .idx])
) as $candidates
| if ($candidates | length) == 0 then
    .   # nothing eligible in the supervised+plan_only quarantine — no-op
  else
    ($candidates[0]) as $picked
    | ($picked.row.id) as $picked_id
    | ($picked.row + {
          status: "READY",
          promoted_at: $now,
          promoted_by: "dev-team (supervised-lane sweep)",
          promotion_note: ("Supervised-Lane Sweep — assigned dispatch_lane='" + $picked.lane
            + "' (priority_rank=" + ($picked.rank | tostring)
            + "); supervised/plan_only flags preserved, gate NOT disabled — see FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER"),
          dispatch_lane: $picked.lane
        }) as $ready_entry
    | .task_board.ready = ((.task_board.ready // []) + [$ready_entry])
    | .task_board.backlog = [ .task_board.backlog | to_entries[]
        | select(.key != $picked.idx) | .value ]
    | .task_board.last_triaged_at = $now
    | .task_board.last_triaged_by = "dev-team (supervised-lane sweep)"
  end
