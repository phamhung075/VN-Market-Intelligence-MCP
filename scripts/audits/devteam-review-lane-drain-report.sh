#!/usr/bin/env bash
# devteam-review-lane-drain-report.sh
#
# UNBLOCK-DEVTEAM-DISPATCH-GATE-STAGING-DEADLOCK (architect, 2026-07-22),
# PO ruling item (3) + AC(1) ("a drain reaching only next_agent=='qa' rows
# is incomplete and must not be silently equivalent to fine").
#
# PRIMARY set — status==REVIEW AND effective_next_agent=='qa': exactly the
# class scripts/devteam-review-claim-qa-drain.jq auto-dispatches. FAILS
# (exit 1) if this script finds this set non-empty AND every row in it has
# been sitting for > STALE_DAYS days (default 3) — a signal the QA-drain
# consumer is not actually being invoked by dev-team ticks (mirrors
# bounded1-supervised-lane-report.sh's dispatch-lane=none gate, but for
# THIS lane the failure mode is "nothing ever ran the claim script", not
# "the claim script can't resolve a lane" — there is nothing to resolve
# here, next_agent is always literally "qa").
#
# SECONDARY set (informational, never gates exit code) — status==REVIEW AND
# effective_next_agent is null/absent/not-"qa": the subset PO's AC(1) says
# must not be silently uncovered. Printed for PO/architect triage; this
# script does NOT dispatch anything (read-only, no orch-apply.sh call
# anywhere, mirrors bounded1-supervised-lane-report.sh's own read-only
# discipline).
#
# BLOCKED rows are excluded from BOTH sets by construction (status filter
# is status=="REVIEW" only) — negative control, PO AC(4): a review row that
# is not ready for sign-off must never appear as a drain candidate.
#
# DONE-LANE PRIMARY / DONE-LANE SECONDARY (FIX-DONELANE-NO-DONEVERIFIED-
# PRODUCER-DEP-STARVATION, architect brief docs/architecture-briefs/
# 2026-08-08-donelane-doneverified-producer.md §2 Component 4): mirrors the
# two REVIEW sections above exactly (same age_days/print_table shape), but
# scoped to task_board.done[] (status=="DONE" — a DONE_VERIFIED row is
# already terminal-verified and excluded by construction, same negative
# control as BLOCKED above). DONE-LANE PRIMARY = the exact class
# scripts/devteam-review-claim-qa-drain.jq's widened `review[] ∪ done[]`
# candidate gathering now also auto-dispatches into qa[]. DONE-LANE
# SECONDARY = the class scripts/devteam-review-claim-secondary-drain.jq's
# widened gathering now stamps in place — displayed via
# resolved_secondary_dispatch_target (not raw next_agent), since a done[]
# row's null/absent next_agent resolves to the "po" triage fallback rather
# than staying silently unrouted (AC-4). The staleness FAIL predicate below
# is extended to ALSO fail if DONE-LANE PRIMARY is non-empty and every row
# in it is >= STALE_DAYS old — same "is the drain actually reachable"
# semantics as REVIEW PRIMARY, now covering both source lanes with one flag.
#
# Usage: bash scripts/audits/devteam-review-lane-drain-report.sh [STALE_DAYS]
# Exit 0 = REVIEW PRIMARY and DONE-LANE PRIMARY are both either empty or
#          contain at least one row younger than STALE_DAYS (evidence the
#          drain is reachable/being invoked on that lane).
# Exit 1 = REVIEW PRIMARY and/or DONE-LANE PRIMARY is non-empty AND every
#          row in that set is >= STALE_DAYS old (evidence the drain
#          mechanism is wired but not firing on that lane).

set -euo pipefail
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$PROJECT_ROOT"

STATE="docs/data/orch/orch-state.json"
DETAIL="docs/data/orch/archive/backlog-detail.json"
STALE_DAYS="${1:-3}"

NOW_EPOCH=$(date -u +%s)
NOW_ISO=$(date -u +%Y-%m-%dT%H:%M:%SZ)

JQ_PROG='
include "scripts/lib/devteam-eligibility";

def age_days($now_epoch):
  (.updated_at // .reviewed_at // .created_at) as $ts
  | if $ts == null then null
    else ( try (($now_epoch - ($ts | fromdateiso8601)) / 86400 | floor) catch null )
    end;

(detail_items_from($detail)) as $detail_items
| .task_board.review
  | map(select(.status == "REVIEW"))
  | map({
      id: .id,
      next_agent: ((. | effective_next_agent($detail_items)) as $na | if $na == "" then null else $na end),
      branch: (.branch // null),
      age_days: (. | age_days($now_epoch))
    })
'

jq -c --argjson now_epoch "$NOW_EPOCH" --slurpfile detail "$DETAIL" \
  "$JQ_PROG"' | map(select(.next_agent == "qa")) | sort_by((.age_days // 999999) * -1)' \
  "$STATE" > /tmp/devteam-review-drain-primary.$$.json

jq -c --argjson now_epoch "$NOW_EPOCH" --slurpfile detail "$DETAIL" \
  "$JQ_PROG"' | map(select(.next_agent != "qa")) | sort_by((.age_days // 999999) * -1)' \
  "$STATE" > /tmp/devteam-review-drain-secondary.$$.json

# DONE-LANE PRIMARY / SECONDARY — same shape as REVIEW above, scoped to
# task_board.done[] (status=="DONE" only; DONE_VERIFIED already terminal).
DONE_JQ_PROG='
include "scripts/lib/devteam-eligibility";

def age_days($now_epoch):
  (.updated_at // .reviewed_at // .created_at) as $ts
  | if $ts == null then null
    else ( try (($now_epoch - ($ts | fromdateiso8601)) / 86400 | floor) catch null )
    end;

(detail_items_from($detail)) as $detail_items
| .task_board.done
  | map(select(.status == "DONE"))
  | map({
      id: .id,
      next_agent: ((. | resolved_secondary_dispatch_target($detail_items)) as $t
        | (. | effective_next_agent($detail_items)) as $na
        | if $na == "qa" then "qa" else $t end),
      branch: (.branch // null),
      age_days: (. | age_days($now_epoch))
    })
'

jq -c --argjson now_epoch "$NOW_EPOCH" --slurpfile detail "$DETAIL" \
  "$DONE_JQ_PROG"' | map(select(.next_agent == "qa")) | sort_by((.age_days // 999999) * -1)' \
  "$STATE" > /tmp/devteam-done-drain-primary.$$.json

jq -c --argjson now_epoch "$NOW_EPOCH" --slurpfile detail "$DETAIL" \
  "$DONE_JQ_PROG"' | map(select(.next_agent != "qa")) | sort_by((.age_days // 999999) * -1)' \
  "$STATE" > /tmp/devteam-done-drain-secondary.$$.json

trap 'rm -f /tmp/devteam-review-drain-primary.$$.json /tmp/devteam-review-drain-secondary.$$.json /tmp/devteam-done-drain-primary.$$.json /tmp/devteam-done-drain-secondary.$$.json' EXIT

print_table() {
  printf '%-52s %-9s %-9s %-8s\n' "ID" "NEXT_AGENT" "AGE(d)" "BRANCH"
  printf '%-52s %-9s %-9s %-8s\n' "----------------------------------------------------" "---------" "--------" "--------"
  jq -r '.[] | [.id, (.next_agent // "null"), ((.age_days // "?") | tostring), (.branch // "null")] | @tsv' "$1" \
    | while IFS=$'\t' read -r id na age br; do
        printf '%-52s %-9s %-9s %-8s\n' "$id" "$na" "$age" "$br"
      done
}

echo "=== PRIMARY: status==REVIEW AND next_agent=='qa' (auto-dispatched by devteam-review-claim-qa-drain.jq) ==="
print_table /tmp/devteam-review-drain-primary.$$.json
PRIMARY_TOTAL=$(jq 'length' /tmp/devteam-review-drain-primary.$$.json)
PRIMARY_ALL_STALE=$(jq --argjson d "$STALE_DAYS" '[.[] | select((.age_days // 999999) < $d)] | length == 0' /tmp/devteam-review-drain-primary.$$.json)

echo ""
echo "Generated: $NOW_ISO — stale threshold: ${STALE_DAYS}d"
echo "Primary rows: $PRIMARY_TOTAL"

echo ""
echo "=== SECONDARY (informational only, does not gate exit code): status==REVIEW AND next_agent != 'qa' — PO/architect triage queue ==="
print_table /tmp/devteam-review-drain-secondary.$$.json
SECONDARY_TOTAL=$(jq 'length' /tmp/devteam-review-drain-secondary.$$.json)
echo ""
echo "Secondary rows: $SECONDARY_TOTAL — NOT auto-dispatched by the QA-drain consumer (unresolved owner class, PO AC(1))"

echo ""
echo "=== DONE-LANE PRIMARY: status==DONE AND next_agent=='qa' (auto-dispatched by devteam-review-claim-qa-drain.jq's widened review[] ∪ done[] gathering) ==="
print_table /tmp/devteam-done-drain-primary.$$.json
DONE_PRIMARY_TOTAL=$(jq 'length' /tmp/devteam-done-drain-primary.$$.json)
DONE_PRIMARY_ALL_STALE=$(jq --argjson d "$STALE_DAYS" '[.[] | select((.age_days // 999999) < $d)] | length == 0' /tmp/devteam-done-drain-primary.$$.json)
echo ""
echo "Done-lane primary rows: $DONE_PRIMARY_TOTAL"

echo ""
echo "=== DONE-LANE SECONDARY (informational only, does not gate exit code): status==DONE AND next_agent != 'qa' — resolved via resolved_secondary_dispatch_target (null/absent falls to 'po', AC-4) ==="
print_table /tmp/devteam-done-drain-secondary.$$.json
DONE_SECONDARY_TOTAL=$(jq 'length' /tmp/devteam-done-drain-secondary.$$.json)
echo ""
echo "Done-lane secondary rows: $DONE_SECONDARY_TOTAL — stamped in place by devteam-review-claim-secondary-drain.jq's widened gathering, never auto-promoted (AC-3)"

echo ""
if [ "$PRIMARY_TOTAL" -gt 0 ] && [ "$PRIMARY_ALL_STALE" = "true" ]; then
  echo "[FAIL] $PRIMARY_TOTAL REVIEW primary row(s) all >= ${STALE_DAYS}d old — QA-drain consumer appears wired but not firing on live ticks."
  exit 1
fi

if [ "$DONE_PRIMARY_TOTAL" -gt 0 ] && [ "$DONE_PRIMARY_ALL_STALE" = "true" ]; then
  echo "[FAIL] $DONE_PRIMARY_TOTAL DONE-LANE primary row(s) all >= ${STALE_DAYS}d old — QA-drain consumer's widened done[] gathering appears wired but not firing on live ticks."
  exit 1
fi

echo "[PASS] REVIEW primary and DONE-LANE primary sets are each either empty or contain at least one row younger than ${STALE_DAYS}d (drain is reaching both lanes)."
exit 0
