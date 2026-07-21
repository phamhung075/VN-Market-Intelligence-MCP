#!/usr/bin/env bash
# bounded1-supervised-lane-report.sh
#
# FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER (architect, 2026-07-21).
#
# PROBLEM (as filed): backlog rows carrying BOTH `supervised:true` AND
# `plan_only:true` (board-inline OR backlog-detail.json, either location —
# same effective_* precedence scripts/devteam-backlog-promote-bounded1.jq
# uses) are withheld from BOUNDED-1 auto-promotion AND were, until this fix,
# dependent on a "router-adjudicated dispatch path" that the promote script's
# own header comment claims exists but does not — confirmed live 2026-07-21
# against docs/agents/po/flow/main.md and docs/agents/dev-team/flow/main.md
# (neither ever swept task_board.backlog[] for supervised/plan_only rows by
# priority) and against the PO signal-drain that minted this very task
# (scripts/po-signaldrain-20260721T16-bctcscope-cowork-loopclosure.jq, which
# says so explicitly in its own `question` field).
#
# The companion fix — docs/agents/dev-team/flow/main.md § Supervised-Lane
# Sweep (SLS) + scripts/devteam-backlog-promote-supervised-lane-sweep.jq +
# scripts/devteam-backlog-claim-supervised-lane-sweep.jq — makes the claim
# true going forward: it reuses the existing S4 UNBLOCK dispatch block
# (claim task:<id> -> spawn the row's own resolved specialist -> release),
# spending the pre-existing WIP<=2 budget's second slot (which the BOUNDED-1
# promote script's own header comment already documents as "the existing,
# separate router/PO WIP budget for supervised/manual dispatch" — a named
# but previously unused slot, not a new budget).
#
# THIS script is the acceptance instrument (read-only, never writes back —
# no orch-apply.sh call anywhere). It replays the EXACT SAME
# effective_supervised / effective_plan_only / effective_owner /
# effective_next_agent predicates scripts/devteam-backlog-promote-bounded1.jq
# uses (no forked logic) and:
#   PRIMARY (gates pass/fail) — every row where effective_supervised AND
#     effective_plan_only are BOTH true (the exact doubly-gated class named
#     in the problem statement), regardless of status (BACKLOG/TODO/BLOCKED
#     all included — a supervised+plan_only row does not stop being gated
#     just because something else also blocked it), with its resolved
#     dispatch lane (effective_next_agent, falling back to effective_owner)
#     and age in days. FAILS (exit 1) if ANY such row's dispatch lane is
#     unresolved ("none" — owner and next_agent both empty on board AND
#     detail).
#   SECONDARY (informational only, never fails the gate) — the WIDER set of
#     rows gated by EITHER flag alone (supervised-only or plan_only-only).
#     Printed for visibility (matches CLAUDE.md "detect debt" instruction)
#     but intentionally excluded from the PASS/FAIL predicate: those rows
#     are a different, pre-existing data-hygiene class (some carry no owner
#     AND no next_agent at all — a mint-time gap, not this task's scope) and
#     conflating them here would fail the gate on a defect this task was
#     never scoped to fix.
#
# Usage: bash scripts/audits/bounded1-supervised-lane-report.sh
# Exit 0 = every supervised+plan_only row has a resolved dispatch lane.
# Exit 1 = at least one supervised+plan_only row has dispatch-lane=none.

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

STATE="docs/data/orch/orch-state.json"
DETAIL="docs/data/orch/archive/backlog-detail.json"
SYSMAP="docs/data/system-map.json"

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

NOW_EPOCH=$(date -u +%s)
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Live agent roster (never hardcoded) — id -> type (dev-core|dev-zone|ops|cowork).
jq -c '[.project.agents[] | {id, type}]' "$SYSMAP" > "$WORK/roster.json"

JQ_DEFS='
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

  def dispatch_lane($detail_items; $roster_map):
    (effective_next_agent($detail_items)) as $na
    | (effective_owner($detail_items)) as $ow
    | ( if ($na | length) > 0 then $na
        elif ($ow | length) > 0 then $ow
        else "" end ) as $lane
    | ( if ($lane | length) == 0 then "none"
        elif ($roster_map[$lane] // null) != null then $lane
        else $lane + " (off-roster)" end );

  def age_days($detail_items; $now_epoch):
    ( (.created_at // $detail_items[.id].created_at // null) ) as $created
    | if $created != null then (($now_epoch - ($created | fromdateiso8601)) / 86400 | floor)
      else null end;

  def report_row($detail_items; $roster_map; $now_epoch):
    {
      id: .id,
      priority: (.priority // "unset"),
      rank: (. | priority_rank),
      status: .status,
      supervised: (. | effective_supervised($detail_items)),
      plan_only: (. | effective_plan_only($detail_items)),
      dispatch_lane: (. | dispatch_lane($detail_items; $roster_map)),
      age_days: (. | age_days($detail_items; $now_epoch))
    };
'

jq -c \
  --argjson now_epoch "$NOW_EPOCH" \
  --slurpfile detail "$DETAIL" \
  --slurpfile roster "$WORK/roster.json" \
  "$JQ_DEFS"'
  (($detail[0].items // []) as $raw_items
    | if ($raw_items | type) == "object" then $raw_items
      else ($raw_items | map(select(.id != null) | {key: .id, value: .}) | from_entries)
      end
  ) as $detail_items
  | ($roster[0] | map({(.id): .type}) | add) as $roster_map
  | [ .task_board.backlog[]
    | select((. | effective_supervised($detail_items)) and (. | effective_plan_only($detail_items)))
    | report_row($detail_items; $roster_map; $now_epoch)
    ] | sort_by([.rank, (.age_days // -1) * -1])
  ' "$STATE" > "$WORK/primary.json"

jq -c \
  --argjson now_epoch "$NOW_EPOCH" \
  --slurpfile detail "$DETAIL" \
  --slurpfile roster "$WORK/roster.json" \
  "$JQ_DEFS"'
  (($detail[0].items // []) as $raw_items
    | if ($raw_items | type) == "object" then $raw_items
      else ($raw_items | map(select(.id != null) | {key: .id, value: .}) | from_entries)
      end
  ) as $detail_items
  | ($roster[0] | map({(.id): .type}) | add) as $roster_map
  | [ .task_board.backlog[]
    | select((. | effective_supervised($detail_items)) or (. | effective_plan_only($detail_items)))
    | select((. | effective_supervised($detail_items)) and (. | effective_plan_only($detail_items)) | not)
    | report_row($detail_items; $roster_map; $now_epoch)
    ] | sort_by([.rank, (.age_days // -1) * -1])
  ' "$STATE" > "$WORK/secondary.json"

print_table() {
  local file="$1"
  printf '%-46s %-9s %-9s %-28s\n' "ID" "PRIORITY" "AGE(d)" "DISPATCH-LANE"
  printf '%-46s %-9s %-9s %-28s\n' "----------------------------------------------" "--------" "--------" "----------------------------"
  jq -r '.[] | [.id, .priority, ((.age_days // "?") | tostring), .dispatch_lane] | @tsv' "$file" \
    | while IFS=$'\t' read -r id priority age lane; do
        printf '%-46s %-9s %-9s %-28s\n' "$id" "$priority" "$age" "$lane"
      done
}

echo "=== PRIMARY: supervised:true AND plan_only:true (the named quarantine class) ==="
print_table "$WORK/primary.json"

PRIMARY_TOTAL=$(jq 'length' "$WORK/primary.json")
PRIMARY_UNRESOLVED=$(jq '[.[] | select(.dispatch_lane == "none")] | length' "$WORK/primary.json")

echo ""
echo "Generated: $NOW_ISO"
echo "Primary (supervised AND plan_only) rows: $PRIMARY_TOTAL — dispatch-lane=none: $PRIMARY_UNRESOLVED"

echo ""
echo "=== SECONDARY (informational only, does not gate exit code): supervised XOR plan_only ==="
print_table "$WORK/secondary.json"
SECONDARY_TOTAL=$(jq 'length' "$WORK/secondary.json")
SECONDARY_UNRESOLVED=$(jq '[.[] | select(.dispatch_lane == "none")] | length' "$WORK/secondary.json")
echo ""
echo "Secondary (supervised XOR plan_only) rows: $SECONDARY_TOTAL — dispatch-lane=none: $SECONDARY_UNRESOLVED"
if [ "$SECONDARY_UNRESOLVED" -gt 0 ]; then
  echo "  (out-of-scope for this task's PASS/FAIL gate — pre-existing mint-time owner/next_agent gap, not the supervised+plan_only quarantine; listed for visibility)"
  jq -r '.[] | select(.dispatch_lane == "none") | "  - " + .id' "$WORK/secondary.json"
fi

echo ""
if [ "$PRIMARY_UNRESOLVED" -gt 0 ]; then
  echo "[FAIL] $PRIMARY_UNRESOLVED supervised+plan_only row(s) have NO resolvable dispatch lane."
  jq -r '.[] | select(.dispatch_lane == "none") | "  - " + .id' "$WORK/primary.json"
  exit 1
fi

echo "[PASS] every supervised+plan_only (quarantine) row has an assigned dispatch lane. 0 rows with dispatch-lane=none."
exit 0
