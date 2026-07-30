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
# NOT THE DoD/ACCEPTANCE GATE for dispatch reachability (2026-07-22 —
# UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK): this script tests LANE
# RESOLUTION ONLY — it does not, and was never designed to, prove the
# promote/claim scripts that use that resolution are ever actually
# reachable by the flow's own firing gate. It shipped GREEN (16/16 resolved)
# on 2026-07-21 for FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER while that
# fix's own gate `(ready+in_progress) < 2` was permanently false against
# the live board — a false-green on the wrong claim. The satisfiability
# instrument is scripts/audits/devteam-dispatch-gate-satisfiability.sh
# (builds a live-shaped saturated fixture and asserts the gates FIRE and
# DRAIN). This script remains correct and useful for what it actually
# tests (lane resolution) and is kept for that purpose.
#
# jq defs below now `include "scripts/lib/devteam-eligibility"` (migrated
# 2026-07-22, consolidating a 3rd hand-copied set of the same predicates —
# see that file's header for the design-principle rationale, adopted from
# SPIKE-BOUNDED1-ELIGIBILITY-CONTRACT-REVIEW).
#
# TERTIARY section (FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE,
# 2026-07-23, informational only — does not gate exit code, same rationale
# as SECONDARY): lists every `task_board.backlog[]` row where
# `has_unbacked_sequencing_prose($detail_items)` is true — a PO-authored
# `po_sequencing_*` ordering note exists (board or detail) but no
# machine-readable `depends_on`/`depends`/`blocked_by` backs it, so
# `is_bounded1_eligible` now withholds the row (conservative-skip) until
# the dependency is encoded. This section exists so that withholding is
# SURFACED, not a row silently idling forever — nudges PO to install
# `depends_on` the way UC-CDC-P5 was hand-fixed on 2026-07-22.
#
# Usage: bash scripts/audits/bounded1-supervised-lane-report.sh
# Exit 0 = every supervised+plan_only row has a resolved dispatch lane.
# Exit 1 = at least one supervised+plan_only row has dispatch-lane=none.
# (TERTIARY findings never affect the exit code.)

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

STATE="docs/data/orch/orch-state.json"
DETAIL="docs/data/orch/archive/backlog-detail.json"
SYSMAP="docs/data/system-map.json"
DRS_ALLOWLIST='["architect","ba","pm","po","agents-architect"]'

WORK=$(mktemp -d)
trap 'rm -rf "$WORK"' EXIT

NOW_EPOCH=$(date -u +%s)
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

# Live agent roster (never hardcoded) — id -> type (dev-core|dev-zone|ops|cowork).
jq -c '[.project.agents[] | {id, type}]' "$SYSMAP" > "$WORK/roster.json"

# DRS section (is_design_router_eligible) needs dep_status_map($archive) —
# same cold-archive materialization every promote script uses.
ARCHIVE="$WORK/archive.json"
bash scripts/lib/archive-glob-cat.sh > "$ARCHIVE"

JQ_DEFS='
  include "scripts/lib/devteam-eligibility";

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
    # FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE (2026-07-30):
    # the new DRS section below walks a broader backlog array slice than
    # PRIMARY/SECONDARY/TERTIARY ever did, and hit a real live malformed
    # created_at (backlog-detail.json:3820, 2026-06-18T053057Z, missing
    # colons), which crashed fromdateiso8601 and took down the WHOLE script
    # (every section, not just the offending row). try/catch so ONE
    # malformed timestamp degrades to age_days=null for that row only,
    # never a whole-instrument crash -- same conservative-null discipline
    # already used by dispatch_lane() above for missing data.
    | if $created != null then (try (($now_epoch - ($created | fromdateiso8601)) / 86400 | floor) catch null)
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

  def report_row_drs($detail_items; $roster_map; $now_epoch; $allowlist):
    report_row($detail_items; $roster_map; $now_epoch)
    + { on_allowlist: (. | is_design_router_allowed($detail_items; $allowlist)) };
'

jq -c \
  --argjson now_epoch "$NOW_EPOCH" \
  --slurpfile detail "$DETAIL" \
  --slurpfile roster "$WORK/roster.json" \
  "$JQ_DEFS"'
  (detail_items_from($detail)) as $detail_items
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
  (detail_items_from($detail)) as $detail_items
  | ($roster[0] | map({(.id): .type}) | add) as $roster_map
  | [ .task_board.backlog[]
    | select((. | effective_supervised($detail_items)) or (. | effective_plan_only($detail_items)))
    | select((. | effective_supervised($detail_items)) and (. | effective_plan_only($detail_items)) | not)
    | report_row($detail_items; $roster_map; $now_epoch)
    ] | sort_by([.rank, (.age_days // -1) * -1])
  ' "$STATE" > "$WORK/secondary.json"

jq -c \
  --argjson now_epoch "$NOW_EPOCH" \
  --slurpfile detail "$DETAIL" \
  --slurpfile roster "$WORK/roster.json" \
  "$JQ_DEFS"'
  (detail_items_from($detail)) as $detail_items
  | ($roster[0] | map({(.id): .type}) | add) as $roster_map
  | [ .task_board.backlog[]
    | select(. | has_unbacked_sequencing_prose($detail_items))
    | report_row($detail_items; $roster_map; $now_epoch)
    ] | sort_by([.rank, (.age_days // -1) * -1])
  ' "$STATE" > "$WORK/tertiary.json"

# DRS section — FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE
# (2026-07-30). A DIFFERENT, non-equivalent set from SECONDARY above (see
# that section's own architect-brief provenance): SECONDARY requires at
# least one of supervised/plan_only true; the DRS-target set below is
# defined by is_non_dev_next_agent_unrouted() (a next_agent/routing
# condition) minus SLS's own supervised-AND-plan_only-BOTH-true territory —
# it INCLUDES rows carrying NEITHER flag (the majority of the live set).
jq -c \
  --argjson now_epoch "$NOW_EPOCH" \
  --argjson allowlist "$DRS_ALLOWLIST" \
  --slurpfile detail "$DETAIL" \
  --slurpfile archive "$ARCHIVE" \
  --slurpfile roster "$WORK/roster.json" \
  "$JQ_DEFS"'
  (detail_items_from($detail)) as $detail_items
  | dep_status_map($archive) as $status_map
  | ($roster[0] | map({(.id): .type}) | add) as $roster_map
  | [ .task_board.backlog[]
    | select(.status == "BACKLOG" or .status == "TODO")
    | select(. | is_non_dev_next_agent_unrouted($detail_items))
    | select(. | (effective_supervised($detail_items) and effective_plan_only($detail_items)) | not)
    | select(. | is_epic_wrapper($detail_items) | not)
    | select(. | deps_satisfied($detail_items; $status_map))
    | select(. | is_detail_deferred($detail_items) | not)
    | select(. | has_unbacked_sequencing_prose($detail_items) | not)
    | report_row_drs($detail_items; $roster_map; $now_epoch; $allowlist)
    ] | sort_by([.rank, (.age_days // -1) * -1])
  ' "$STATE" > "$WORK/drs.json"

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
echo "=== TERTIARY (informational only, does not gate exit code): prose sequencing (po_sequencing_*) with unbacked depends_on ==="
print_table "$WORK/tertiary.json"
TERTIARY_TOTAL=$(jq 'length' "$WORK/tertiary.json")
echo ""
echo "Tertiary (unbacked prose-sequencing) rows: $TERTIARY_TOTAL"
if [ "$TERTIARY_TOTAL" -gt 0 ]; then
  echo "  (FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE — po_sequencing_* prose exists but depends_on is empty; row is withheld from BOUNDED-1 auto-pickup until PO installs a machine-readable depends_on. Not silent — listed for visibility.)"
  jq -r '.[] | "  - " + .id' "$WORK/tertiary.json"
fi

echo ""
echo "=== DRS (informational only, does not gate exit code): Design-Router Sweep target set — non-dev next_agent, NOT in SLS's supervised+plan_only territory ==="
echo "  (FIX-BOUNDED1-NONDEV-NEXTAGENT-RESIDUAL-NO-DISPATCH-LANE, PO-ratified 2026-07-30. Split below: DRS-ELIGIBLE = on ratified allowlist {architect,ba,pm,po,agents-architect}, auto-dispatched by dev-team's Design-Router Sweep. DRS-STRANDED-OFF-ALLOWLIST = same predicate but next_agent is NOT ratified (e.g. agent-father/ops*/qa) — deliberately excluded by policy, remains reachable only by manual/PO dispatch.)"
DRS_TOTAL=$(jq 'length' "$WORK/drs.json")
DRS_ELIGIBLE_TOTAL=$(jq '[.[] | select(.on_allowlist == true)] | length' "$WORK/drs.json")
DRS_OFFLIST_TOTAL=$(jq '[.[] | select(.on_allowlist != true)] | length' "$WORK/drs.json")
echo ""
echo "--- DRS-ELIGIBLE ($DRS_ELIGIBLE_TOTAL rows, on ratified allowlist) ---"
jq '[.[] | select(.on_allowlist == true)]' "$WORK/drs.json" > "$WORK/drs-eligible.json"
print_table "$WORK/drs-eligible.json"
echo ""
echo "--- DRS-STRANDED-OFF-ALLOWLIST ($DRS_OFFLIST_TOTAL rows, off ratified allowlist — policy exclusion, not a new gap) ---"
jq '[.[] | select(.on_allowlist != true)]' "$WORK/drs.json" > "$WORK/drs-offlist.json"
print_table "$WORK/drs-offlist.json"
echo ""
echo "DRS-target rows: $DRS_TOTAL — eligible (auto-dispatched): $DRS_ELIGIBLE_TOTAL — stranded off-allowlist (policy): $DRS_OFFLIST_TOTAL"

echo ""
if [ "$PRIMARY_UNRESOLVED" -gt 0 ]; then
  echo "[FAIL] $PRIMARY_UNRESOLVED supervised+plan_only row(s) have NO resolvable dispatch lane."
  jq -r '.[] | select(.dispatch_lane == "none") | "  - " + .id' "$WORK/primary.json"
  exit 1
fi

echo "[PASS] every supervised+plan_only (quarantine) row has an assigned dispatch lane. 0 rows with dispatch-lane=none."
exit 0
