# po-s53-builder-prune-codify-triage.jq
# Weekend (market-independent / infra) triage for the 3rd-recurrence host-disk-full
# caused by Docker build-cache accumulation from repeated `build --no-cache mcp-server`.
#
# Durable fix = codify `docker builder prune -f` as the MANDATORY FINAL STEP of the
# shared ops rebuild sequence in docs/agents/ops/flow/docker.md (the SSOT for the
# rebuild procedure), so it is AUTOMATIC not remembered. Generic mandate: applies to
# EVERY service rebuild, not just mcp-server.
#
# Two idempotent mutations in one atomic pass:
#   1. PROMOTE FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY -> .task_board.ready (full spec),
#      skipped if id already present in ANY board array (ready/backlog/in_progress/
#      review/done/done_verified).
#   2. APPEND the codify task to .task_board.backlog ONLY if it is also absent there
#      (kept out — ready is the live lane; backlog dup avoided).
#
# Usage:
#   NOW=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
#   jq --arg now "$NOW" -f scripts/po-s53-builder-prune-codify-triage.jq \
#      docs/data/orch/orch-state.json > /tmp/orch.tmp && [ -s /tmp/orch.tmp ] \
#      && mv /tmp/orch.tmp docs/data/orch/orch-state.json
#   git add docs/data/orch/orch-state.json   # EXPLICIT PATH ONLY

def board_arrays: [.task_board.ready, .task_board.backlog, .task_board.in_progress,
                   .task_board.review, .task_board.done, .task_board.done_verified];

def id_present($id):
  ([ board_arrays[] // [] | .[]? | select(.id == $id) ] | length) > 0;

($ENV.TASK_ID // "FIX-OPS-REBUILD-BUILDER-PRUNE-CODIFY") as $tid
| (id_present($tid)) as $exists
| if $exists then .
  else
    .task_board.ready += [{
      "id": $tid,
      "title": "Codify `docker builder prune -f` as the mandatory final step of the shared ops rebuild flow",
      "type": "FIX",
      "owner": "developer",
      "zone": "cross-service/",
      "status": "READY",
      "priority": "P2",
      "size": "S",
      "market_independent": true,
      "weekend_safe": true,
      "root_cause": "3rd recurrence (2026-05-27, 2026-06-07, 2026-06-14) of host disk-full from Docker build-cache accumulation produced by repeated `docker compose build --no-cache mcp-server`. Today (2026-06-14) it hit 97% / 6.7Gi free and ENOSPC-blocked a qa agent; router reclaimed 18.62GB via `docker builder prune -f`. A documented RULE exists ('>=2 rebuilds/day -> builder prune as final step') but was NEVER codified into the rebuild flow, so it relies on memory and keeps recurring. Memory ref: project_disk_full_lancedb_bloat RECURRENCE 2026-06-14.",
      "fix_spec": "Edit the rebuild-sequence SSOT in docs/agents/ops/flow/docker.md. In the § Docker Commands REBUILD block and the § Post-Rebuild Health Verification procedure, append `docker builder prune -f` as the MANDATORY FINAL STEP of the rebuild sequence: it runs AFTER `docker compose up -d --no-deps <service>` (force-recreate variants), AFTER post-rebuild health verification passes, and BEFORE handing off to qa. Make it unconditional (every rebuild) rather than the conditional '>=2/day' heuristic so it cannot be forgotten. Also update the § FORBIDDEN/correct-scoped-patterns 'Rebuild after code change' snippet so the canonical one-liner ends with `&& docker builder prune -f`. Add a one-line WHY note citing the 3 recurrences + 18.62GB reclaim so the step is self-justifying.",
      "generic_mandate": "Apply to the SHARED rebuild sequence so EVERY service rebuild prunes build-cache, not just mcp-server. The prune target is the host-wide builder cache (`docker builder prune -f`), so a single codified step covers all 6 host_runtime_set services. Do NOT scope the new step to mcp-server only.",
      "verification_gate": "1) docs/agents/ops/flow/docker.md rebuild sequence (both the § Docker Commands block and the § Post-Rebuild procedure) ends with `docker builder prune -f` as an explicit mandatory final step, generically worded for any <service>. 2) The 'Rebuild after code change' scoped one-liner in § FORBIDDEN includes the prune. 3) WHY note present citing the recurrences. 4) No service-specific (mcp-server-only) scoping of the prune step. Reviewer reads the doc raw to confirm. This is a doc-only change (no container action) -> weekend-safe; no LIVE market verification required.",
      "depends_on": [],
      "blocks": [],
      "created_at": $now,
      "created_by": "po",
      "source": "router 2026-06-14 ENOSPC recovery; PO weekend triage"
    }]
  end
