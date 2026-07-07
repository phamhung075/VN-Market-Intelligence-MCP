# scripts/devteam-signalqueue-prune-bounded.jq
#
# Dev-team Step 0a-D-PRUNE: archive .signal_queue.rows[] entries that are
# status ∈ {RESOLVED, READ} AND ts older than 48h, per
# docs/agents/dev-team/flow/drain-signals.md § 0a-D-PRUNE. NEW rows are
# NEVER pruned. Idempotent — a second run with the same cutoff is a no-op
# once nothing else qualifies.
#
# Usage:
#   jq --arg now "$NOW" --arg cutoff_epoch "$CUTOFF_EPOCH" \
#      -f scripts/devteam-signalqueue-prune-bounded.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh
#
# Required --arg:
#   now           — current UTC ISO ("$(date -u +%Y-%m-%dT%H:%M:%SZ)")
#   cutoff_epoch  — epoch seconds for the 48h cutoff ("$(( $(date -u +%s) - 172800 ))")

def to_epoch:
  if test("^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}Z$") then
    (sub("Z$"; ":00Z") | fromdateiso8601)
  else
    fromdateiso8601
  end;

def is_stale($cutoff):
  (.status == "RESOLVED" or .status == "READ") and (.ts | to_epoch) < $cutoff;

($cutoff_epoch | tonumber) as $cutoff
| (.signal_queue.rows | map(select(is_stale($cutoff)))) as $to_archive
| (.signal_queue.rows | map(select(is_stale($cutoff) | not))) as $remaining_rows
| (.signal_queue.archive // []) as $existing_archive
| .signal_queue.archive = ($existing_archive + $to_archive)
| .signal_queue.rows = $remaining_rows
| .signal_queue._updated_at = $now
| .signal_queue._updated_by = "dev-team"
| .dashboard_section_cache.po.last_mtime = $now
| .dashboard_section_cache.po.last_linecount = ($remaining_rows | length)
