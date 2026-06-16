# Router 2026-06-16 — dev-team tick: PO BATCH dispatch — mint+dispatch ONE new FIX into a coding lane.
#
# PO triage (agent a2eadaea, dev-team manual tick 2026-06-16T12:30Z) RETURNED a single coding dispatch after
# dedup'ing 20 health-recheck telegram reports (ids 3181-3200) against the live board. The ONLY new, untracked,
# high-live-impact dev item: HVN alert-dedup REGRESSION — computeAlertFingerprint exists but is NOT wired into the
# parallel scan path (taAlertScanJob/alertScanParallelJob), so identical alerts bypass dedup (HVN 14-26x/min
# 08:37-08:59Z) and 665 alerts sit pending. All other inbox items dedup'd to existing review/backlog/done_verified
# rows, routed to ops (BCTC-VPS probe, no coding slot) or agent-father (2 agent-.md fixes), or note-only.
#
# This is a FIX (Step 2 routing: direct to Step 3 execute — no ba/architect/pm relay). The dispatcher mints the board
# entry directly in in_progress[] with dispatch metadata and sets head for crash-resume. WIP after = 1/2 coding lanes
# (PO reserved the 2nd slot). rebuild_required=false at dispatch (no code committed yet).
#
# GUARD: refuse if the tid already exists ANYWHERE on the board (no dup-mint). CREATION: total increases by EXACTLY 1
#   (this is a new task, NOT a pure move — conservation guard asserts +1, not unchanged).
# Usage: jq --arg now "$NOW" -f scripts/router-d83-alert-fingerprint-dispatch-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS" as $tid
| . as $root
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]
    | map(.[]?.id) | map(select(. == $tid)) | length) as $existing
| if $existing > 0 then error("tid already on board — refuse dup-mint: " + $tid) else . end
| .task_board.in_progress = ( .task_board.in_progress + [ {
      id: $tid,
      type: "FIX",
      size: "M",
      title: "Wire computeAlertFingerprint into taAlertScanJob/alertScanParallelJob — HVN dedup regression (14-26 identical HIGH alerts/min, 665 pending)",
      desc: "REGRESSION of the 2026-04-28 alertGenerator.ts dedup fix. computeAlertFingerprint exists but is NOT invoked in the parallel scan write path (taAlertScanJob/alertScanParallelJob), so identical alerts bypass the dedup/cooldown gate (HVN fired 14-26x 08:37-08:59Z, unique IDs) and 665 alerts sit pending. GENERIC (/goal#2): the fingerprint+dedup gate must cover EVERY alert-write scan job, keyed on (ticker,signal_type,day) composite, not an HVN special-case. DoD (/goal#1 LIVE): RAW-verify against the named-volume market.db (NOT host decoy) — alerts table shows <=1 row per (ticker,kind,fingerprint) per dedup window after a market-open scan; pending backlog drains; no per-ticker literal.",
      zone: "apps/mcp-server/",
      files: ["apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts","apps/mcp-server/src/scheduler/alerts/alertScanParallelJob.ts","apps/mcp-server/src/alerts/computeAlertFingerprint.ts","apps/mcp-server/src/alerts/storeAlerts.ts"],
      baseline_pass: true,
      route_to: "dev-mcp-server",
      owner_agent: "dev-mcp-server",
      status: "IN_PROGRESS",
      dispatched_ts: $now,
      dispatched_by: "dev-team",
      source: "po-batch-20260616 (agent a2eadaea)",
      origin_reports: ["3199","3200"]
    } ] )
| .head = {
    status:"in_progress", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"dev-mcp-server", rebuild_required:false,
    next_action:"Implement FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS in apps/mcp-server/: wire computeAlertFingerprint into the parallel scan write path (taAlertScanJob + alertScanParallelJob) so identical alerts hit the dedup/cooldown gate. GENERIC composite key (ticker,signal_type,day) — no HVN special-case. RAW-verify on named-volume market.db: <=1 row per (ticker,kind,fingerprint) per window post-scan + 665 backlog drains. Then -> review with rebuild_required=true.",
    note:("ROUTER " + $now + " — dev-team tick: PO BATCH dispatched ONE coding FIX. FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS (HVN dedup regression, 665 pending) -> dev-mcp-server (zone apps/mcp-server/, M). WIP=1/2 coding lanes (2nd reserved). PARALLEL (no coding slot): ops-vps-fetch BCTC-VPS root-isolation probe under FIX-BCTC-VPS-PIPELINE-STALE-5D; agent-father 2 agent-.md fixes (system-auditor post_agent_signal emit-schema + fb-poster L78/L81 noarg). PO caught item#2 vnstockTradingStats as STALE (already done_verified FIX-VNSTOCK-TRADINGSTATS-CRASH; trigger read pre-deploy crash row). All other reports dedup'd/held/note-only. PUSH held (PO out-of-band).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != ($before + 1))
    then error("CREATION GUARD FAIL: total did not increase by exactly 1") else . end
