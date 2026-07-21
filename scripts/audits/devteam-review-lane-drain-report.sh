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
# Usage: bash scripts/audits/devteam-review-lane-drain-report.sh [STALE_DAYS]
# Exit 0 = PRIMARY set is empty, OR at least one PRIMARY row is younger than
#          STALE_DAYS (evidence the drain is reachable/being invoked).
# Exit 1 = PRIMARY set is non-empty AND every row in it is >= STALE_DAYS old
#          (evidence the drain mechanism is wired but not firing).

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
trap 'rm -f /tmp/devteam-review-drain-primary.$$.json /tmp/devteam-review-drain-secondary.$$.json' EXIT

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
if [ "$PRIMARY_TOTAL" -gt 0 ] && [ "$PRIMARY_ALL_STALE" = "true" ]; then
  echo "[FAIL] $PRIMARY_TOTAL primary row(s) all >= ${STALE_DAYS}d old — QA-drain consumer appears wired but not firing on live ticks."
  exit 1
fi

echo "[PASS] primary set is empty, or contains at least one row younger than ${STALE_DAYS}d (drain is reaching this lane)."
exit 0
