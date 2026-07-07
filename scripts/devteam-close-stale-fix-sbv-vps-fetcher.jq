# scripts/devteam-close-stale-fix-sbv-vps-fetcher.jq
#
# BOUNDED-1 pre-verify pattern (memory: project_bounded1_first_pickup_stale_backlog_hygiene_debt
# "interim mitigation"): dev-team tick 2026-07-07T16:37Z peeked at the BOUNDED-1 promote
# candidate FIX-SBV-FX-VPS-FETCHER-UNHEALTHY (P1, created 2026-06-08, folded 2026-06-14 — a
# point-in-time incident capture) and cheap raw-verified it against LIVE state before spawning
# a worker:
#   - get_vps_proxy_health(): sbv service Last Push 2026-07-07 16:48:04, status=ok, Stale?=no
#     (checked ~1min after this push — well within the task's own 30min SLA)
#   - get_macro_snapshot(): usdVnd source_tier=1, is_estimate=false, fetchedAt=2026-07-07T16:53:27Z
#   - orch-state.json .signal_queue.rows: zero NEW rows (no recurring B-12 signal)
# AC ("B-12 SBV_FX within 30min SLA + vn-sbv-fetch healthy, no signal_queue B-12 row recurring")
# is satisfied by current live state. Closing NO-CHANGE-NEEDED directly — no worker spawn
# (mirrors the FACTORY-INTERFACE-confidence-score-50-mask close on tick 2026-07-04T09:07Z).
#
# Usage:
#   jq --arg now "$NOW" -f scripts/devteam-close-stale-fix-sbv-vps-fetcher.jq \
#      docs/data/orch/orch-state.json | bash scripts/orch-apply.sh

("FIX-SBV-FX-VPS-FETCHER-UNHEALTHY") as $tid
| (.task_board.backlog[] | select(.id == $tid)) as $row
| .task_board.backlog = (.task_board.backlog | map(select(.id != $tid)))
| .task_board.done_verified = (.task_board.done_verified + [
    $row + {
      status: "DONE_VERIFIED",
      done_verified: true,
      verified_by: "dev-team",
      verified_at: $now,
      signoff_note: ("BOUNDED-1 pre-verify (cheap raw-verify before worker spawn, per memory " +
        "project_bounded1_first_pickup_stale_backlog_hygiene_debt interim mitigation): " +
        "get_vps_proxy_health() sbv Last Push 2026-07-07 16:48:04 status=ok Stale?=no; " +
        "get_macro_snapshot() usdVnd source_tier=1 is_estimate=false fetchedAt=2026-07-07T16:53:27Z; " +
        "signal_queue.rows NEW count=0 (no recurring B-12). AC satisfied by current live state — " +
        "NO-CHANGE-NEEDED, closing without worker spawn. If B-12 recurs, system-auditor will re-emit " +
        "a fresh signal and PO triage will re-open a new task.")
    }
  ])
| .task_board.last_triaged_at = $now
| .task_board.last_triaged_by = "dev-team (bounded-1 pre-verify)"
