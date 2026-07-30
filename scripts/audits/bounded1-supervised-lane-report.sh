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
# DRS / READY-XOR sections RETROFITTED 2026-07-31
# (FIX-PO-NO-PRODUCER-FOR-MANUAL-DISPATCH-ESCAPE-HATCH) to call
# `is_design_router_candidate` / `is_ready_xor_gap`
# (`scripts/lib/po-manual-dispatch-eligibility.jq`) instead of their own
# hand-inlined select-chains — those two chains are now ALSO the exact
# predicate the new `docs/agents/po/flow/manual-dispatch-sweep.md` PO
# sub-flow and its regression verifier consume; leaving this script's copy
# hand-inlined would have created a 2nd hand-copy of the identical
# composition the moment that 2nd consumer landed — exactly the drift class
# `devteam-eligibility.jq`'s own header warns about. Mechanical extraction
# only, no logic change — live-diffed before/after (`git stash` + re-run +
# `diff`) to confirm byte-identical DRS/READY-XOR row sets across the
# retrofit.
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
# READY / REVIEW EXTENSION (AC-5, FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-
# PLANONLY-NO-PICKER, 2026-07-30): this script previously scanned
# `task_board.backlog[]` ONLY — so a supervised+plan_only row that reached
# `ready[]` via any route OTHER than SLS's own promote script (PO hand-
# placement, PM/architect decomposition) was invisible to THIS instrument
# too, the exact "detector shares the blind spot of the thing it audits"
# defect class this fix task itself was minted to close (same shape as
# FIX-BOUNDED1-SUPERVISED-LANE-NO-SWEEPER, one lane over). New sections,
# same LANE-RESOLUTION-ONLY discipline as PRIMARY above (never re-implements
# gate-firing/satisfiability — that instrument is
# scripts/audits/devteam-dispatch-gate-satisfiability.sh, extended
# separately per AC-6):
#   READY-PRIMARY (GATES exit code, mirrors backlog PRIMARY exactly) —
#     every `task_board.ready[]` row where `effective_supervised` AND
#     `effective_plan_only` are BOTH true AND NOT `is_epic_wrapper` (wrapper
#     rows are a documented no-picker-by-design class, see READY-WRAPPER
#     below — they never belong in this gating set). FAILS (exit 1) if any
#     such row's dispatch lane is unresolved ("none") — this is exactly the
#     class `scripts/devteam-backlog-claim-supervised-lane-sweep.jq`'s new
#     FALLBACK path (this task's AC-2 fix) now claims.
#   READY-WRAPPER (informational only) — `ready[]` rows where
#     `effective_supervised && effective_plan_only && is_epic_wrapper` is
#     true: a documented NO-PICKER-BY-DESIGN class (AC-4) — never claimed by
#     BOUNDED-1/SLS/RLC/DRS, closed out instead by
#     `docs/agents/dev-team/flow/post-cycle.md` § Step 4.4 Epic-Wrapper
#     Autoclose Sweep once `all_children_terminal`. Listed for visibility,
#     never gates exit code.
#   READY-XOR (informational only) — `ready[]` rows gated by EITHER flag
#     alone (not both), non-wrapper: the ready[]-lane analog of SECONDARY
#     above. RLC excludes these unconditionally and SLS-claim's FALLBACK
#     requires BOTH flags true (deliberately not widened — out of this
#     task's scope, see main.md's Lane × Gate Coverage Matrix). Surfaced,
#     never silently assumed covered.
#   REVIEW-SUP-PO (informational only, confirms AC-3) — every
#     `task_board.review[]` row carrying `effective_supervised &&
#     effective_plan_only`, split by whether `effective_next_agent=="qa"`
#     (covered by the PRE-EXISTING Review-Lane QA-Drain PRIMARY selector,
#     which has NO supervised/plan_only gate at all — see main.md § Review-
#     Lane QA-Drain AC-3 note) vs not (falls into that lane's own
#     pre-existing SECONDARY/PO-triage set, unchanged). Confirms review[] is
#     NOT a silent gap for this class; never gates exit code (ownership
#     belongs to devteam-review-lane-drain-report.sh, not duplicated here).
#
# Usage: bash scripts/audits/bounded1-supervised-lane-report.sh
# Exit 0 = every supervised+plan_only, non-wrapper row — in EITHER
#          `backlog[]` OR `ready[]` — has a resolved dispatch lane.
# Exit 1 = at least one such row (backlog OR ready) has dispatch-lane=none.
# (SECONDARY/TERTIARY/DRS/READY-WRAPPER/READY-XOR/REVIEW-SUP-PO findings
# never affect the exit code — documented no-picker-by-design or
# out-of-scope residual classes, per main.md's Lane × Gate Coverage Matrix.)

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
  include "scripts/lib/po-manual-dispatch-eligibility";

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
    | select(. | is_design_router_candidate($detail_items; $status_map))
    | report_row_drs($detail_items; $roster_map; $now_epoch; $allowlist)
    ] | sort_by([.rank, (.age_days // -1) * -1])
  ' "$STATE" > "$WORK/drs.json"

# READY-PRIMARY / READY-WRAPPER / READY-XOR / REVIEW-SUP-PO — AC-5,
# FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER (2026-07-30).
# Extends this instrument beyond backlog[]-only (see file header). Same
# report_row()/dispatch_lane() reuse, no forked logic.
jq -c \
  --argjson now_epoch "$NOW_EPOCH" \
  --slurpfile detail "$DETAIL" \
  --slurpfile roster "$WORK/roster.json" \
  "$JQ_DEFS"'
  (detail_items_from($detail)) as $detail_items
  | ($roster[0] | map({(.id): .type}) | add) as $roster_map
  | [ .task_board.ready[]
    | select((. | effective_supervised($detail_items)) and (. | effective_plan_only($detail_items)))
    | select((. | is_epic_wrapper($detail_items)) | not)
    | report_row($detail_items; $roster_map; $now_epoch)
    ] | sort_by([.rank, (.age_days // -1) * -1])
  ' "$STATE" > "$WORK/ready-primary.json"

jq -c \
  --argjson now_epoch "$NOW_EPOCH" \
  --slurpfile detail "$DETAIL" \
  --slurpfile roster "$WORK/roster.json" \
  "$JQ_DEFS"'
  (detail_items_from($detail)) as $detail_items
  | ($roster[0] | map({(.id): .type}) | add) as $roster_map
  | [ .task_board.ready[]
    | select((. | effective_supervised($detail_items)) and (. | effective_plan_only($detail_items)))
    | select(. | is_epic_wrapper($detail_items))
    | report_row($detail_items; $roster_map; $now_epoch)
    ] | sort_by([.rank, (.age_days // -1) * -1])
  ' "$STATE" > "$WORK/ready-wrapper.json"

jq -c \
  --argjson now_epoch "$NOW_EPOCH" \
  --slurpfile detail "$DETAIL" \
  --slurpfile roster "$WORK/roster.json" \
  "$JQ_DEFS"'
  (detail_items_from($detail)) as $detail_items
  | ($roster[0] | map({(.id): .type}) | add) as $roster_map
  | [ .task_board.ready[]
    | select(. | is_ready_xor_gap($detail_items))
    | report_row($detail_items; $roster_map; $now_epoch)
    ] | sort_by([.rank, (.age_days // -1) * -1])
  ' "$STATE" > "$WORK/ready-xor.json"

jq -c \
  --argjson now_epoch "$NOW_EPOCH" \
  --slurpfile detail "$DETAIL" \
  --slurpfile roster "$WORK/roster.json" \
  "$JQ_DEFS"'
  (detail_items_from($detail)) as $detail_items
  | ($roster[0] | map({(.id): .type}) | add) as $roster_map
  | [ .task_board.review[]
    | select((. | effective_supervised($detail_items)) and (. | effective_plan_only($detail_items)))
    | report_row($detail_items; $roster_map; $now_epoch)
    + { qa_routed: ((. | effective_next_agent($detail_items)) == "qa") }
    ] | sort_by([.rank, (.age_days // -1) * -1])
  ' "$STATE" > "$WORK/review-sup-po.json"

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
echo "=== READY-PRIMARY (GATES exit code, same as PRIMARY above): task_board.ready[] supervised:true AND plan_only:true, NOT an epic wrapper ==="
echo "  (FIX-DEVTEAM-READY-REVIEW-LANE-SUPERVISED-PLANONLY-NO-PICKER, 2026-07-30 — the class scripts/devteam-backlog-claim-supervised-lane-sweep.jq's new FALLBACK path now claims, whether or not the row carries this sweep's own promoted_by stamp.)"
print_table "$WORK/ready-primary.json"
READY_PRIMARY_TOTAL=$(jq 'length' "$WORK/ready-primary.json")
READY_PRIMARY_UNRESOLVED=$(jq '[.[] | select(.dispatch_lane == "none")] | length' "$WORK/ready-primary.json")
echo ""
echo "Ready-primary (supervised AND plan_only, non-wrapper) rows: $READY_PRIMARY_TOTAL — dispatch-lane=none: $READY_PRIMARY_UNRESOLVED"

echo ""
echo "=== READY-WRAPPER (informational only, does not gate exit code): task_board.ready[] supervised:true AND plan_only:true AND epic wrapper ==="
echo "  (AC-4 — documented NO-PICKER-BY-DESIGN class: never claimed by BOUNDED-1/SLS/RLC/DRS. Closed out instead by docs/agents/dev-team/flow/post-cycle.md § Step 4.4 Epic-Wrapper Autoclose Sweep once all_children_terminal — the row's own children[] are swept individually per their OWN effective_supervised/effective_plan_only, not this table.)"
print_table "$WORK/ready-wrapper.json"
READY_WRAPPER_TOTAL=$(jq 'length' "$WORK/ready-wrapper.json")
echo ""
echo "Ready-wrapper rows: $READY_WRAPPER_TOTAL"

echo ""
echo "=== READY-XOR (informational only, does not gate exit code): task_board.ready[] supervised XOR plan_only, non-wrapper ==="
echo "  (Out-of-scope residual for this task, same class as SECONDARY above one lane over — RLC excludes any row carrying EITHER flag alone, and SLS-claim's FALLBACK deliberately requires BOTH true, mirroring SLS-promote's own gate. Not silently assumed covered — see main.md's Lane × Gate Coverage Matrix.)"
print_table "$WORK/ready-xor.json"
READY_XOR_TOTAL=$(jq 'length' "$WORK/ready-xor.json")
echo ""
echo "Ready-xor (supervised XOR plan_only, non-wrapper) rows: $READY_XOR_TOTAL"

echo ""
echo "=== REVIEW-SUP-PO (informational only, does not gate exit code — confirms AC-3): task_board.review[] supervised:true AND plan_only:true ==="
echo "  (Review-Lane QA-Drain's PRIMARY selector has NO supervised/plan_only gate at all — every row below with qa_routed=true is ALREADY covered by that pre-existing lane, queued by age like any other REVIEW+next_agent==qa row. qa_routed=false falls into that lane's own pre-existing SECONDARY/PO-triage set — ownership stays with scripts/audits/devteam-review-lane-drain-report.sh, not duplicated here.)"
printf '%-46s %-9s %-9s %-10s\n' "ID" "PRIORITY" "AGE(d)" "QA_ROUTED"
printf '%-46s %-9s %-9s %-10s\n' "----------------------------------------------" "--------" "--------" "----------"
jq -r '.[] | [.id, .priority, ((.age_days // "?") | tostring), (.qa_routed | tostring)] | @tsv' "$WORK/review-sup-po.json" \
  | while IFS=$'\t' read -r id priority age qar; do
      printf '%-46s %-9s %-9s %-10s\n' "$id" "$priority" "$age" "$qar"
    done
REVIEW_SUP_PO_TOTAL=$(jq 'length' "$WORK/review-sup-po.json")
REVIEW_SUP_PO_QA=$(jq '[.[] | select(.qa_routed == true)] | length' "$WORK/review-sup-po.json")
echo ""
echo "Review-sup-po rows: $REVIEW_SUP_PO_TOTAL — qa_routed (covered by QA-Drain PRIMARY): $REVIEW_SUP_PO_QA — not qa_routed (SECONDARY/PO-triage): $((REVIEW_SUP_PO_TOTAL - REVIEW_SUP_PO_QA))"

echo ""
if [ "$PRIMARY_UNRESOLVED" -gt 0 ] || [ "$READY_PRIMARY_UNRESOLVED" -gt 0 ]; then
  echo "[FAIL] $PRIMARY_UNRESOLVED backlog + $READY_PRIMARY_UNRESOLVED ready supervised+plan_only (non-wrapper) row(s) have NO resolvable dispatch lane."
  jq -r '.[] | select(.dispatch_lane == "none") | "  - backlog: " + .id' "$WORK/primary.json"
  jq -r '.[] | select(.dispatch_lane == "none") | "  - ready: " + .id' "$WORK/ready-primary.json"
  exit 1
fi

echo "[PASS] every supervised+plan_only (quarantine) row — in backlog[] OR ready[], non-wrapper — has an assigned dispatch lane. 0 rows with dispatch-lane=none."
exit 0
