# Router board mutation: close EVIDENCE-ACCUM-SILENT-CRON (VERIFIED-LIVE) in-place in its active_sprints[].tasks[].
# Pointer: docs/agents/dev-team/flow/main.md (router board-write step).
# Usage: jq --arg now "$NOW" -f scripts/router-evidence-accum-close-verified-live.jq orch-state.json
.task_board.active_sprints |= map(
  .tasks |= map(
    if .id=="EVIDENCE-ACCUM-SILENT-CRON" then
      .status="done_verified"
      | .closed_at=$now
      | .closed_by="router"
      | .review_evidence={
          disposition: "VERIFIED-LIVE",
          summary: "Stale IN_PROGRESS gate driven to closure. Dev 53d00955 (recoverMissedExecutions+dedup+double-wrap) ancestor of HEAD; container rebuilt (PO adjudication 2026-06-13T08:39:47Z); router live-verified the post-rebuild fire.",
          live_raw: "named-volume DB cron_job_runs: evidenceAccumulatorJob 2026-06-13 16:00:01 status=success rows_written=9 — SINGLE clean run (no duplicate). First scheduled fire after the 06-12 18:36 fix in the rebuilt container.",
          double_log_resolved: "Pre-fix runs (06-05..06-12) double-logged; post-rebuild 06-13 16:00 is single -> dedup/double-wrap fix confirmed working live. (Broader cross-job double-log tracked separately by FIX-CRON-JOB-RUNS-DOUBLE-LOG.)",
          rebuild: "Already done (PO-adjudicated REBUILD_REQUIRED satisfied); no further rebuild."
        }
    else . end
  )
)
