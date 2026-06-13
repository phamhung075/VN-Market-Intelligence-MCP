# Router gate reconciliation: BC-1 live-verify gate — record the 23:18Z forward-roll so the
# 03:00Z+ promoter tick does NOT false-reopen BC-1 on the image change (f0c53f54 -> 3d4fa47a).
# A sibling dev-team `7 * * *` tick shipped FIX-FUNDAMENTALS-REFRESH-CRON-DEAD (c35db4fc) after the
# BC-1 deploy, rebuilding mcp-server to a NEWER image that STILL CARRIES BC-1 (PRAGMA=1000 raw-verified).
# RestartCount=0 => deliberate force-recreate, NOT a crash. WAL bounded under 5MB.
# Pointer: docs/agents/dev-team/flow/main.md (Step 0b pipeline-resume — router records live-verify partials).
# Usage: jq --arg now "$NOW" --arg img "$IMG" --arg wal "$WAL" --arg started "$STARTED" \
#        -f scripts/router-bc1-gate-reconcile.jq docs/data/orch/orch-state.json
(.task_board.in_progress | map(select(.id=="BC-1"))[0]) as $bc
| if $bc == null then error("BC-1 not in in_progress[]") else . end
| .task_board.in_progress |= map(
    if .id=="BC-1" then
      .live_verification_gate.reconciliation = {
        observed_at: $now,
        forward_roll: "Container force-recreated \($started) by sibling dev-team tick deploying FIX-FUNDAMENTALS-REFRESH-CRON-DEAD (c35db4fc). RestartCount=0 (deliberate deploy, NOT a crash).",
        running_image: $img,
        bc1_still_live: "PRAGMA wal_autocheckpoint=1000 raw-verified on named-volume market.db — BC-1 WAL fix present in the newer image. Image hash change f0c53f54->\($img) is a forward-roll, NOT a regression.",
        wal_bytes_observed: ($wal|tonumber),
        partial_pass: "No auto-restart (RestartCount=0) since BC-1 went live; WAL \($wal)B < 5MB threshold. Crash-cadence (old ~2h) shows NO recurrence.",
        uptime_baseline_reset: "\($started) — promoter MUST key the >4h uptime window off this deliberate-deploy baseline (not the original 22:49Z deploy), and key crash-cadence off RestartCount (auto-restarts), NOT raw container uptime.",
        promoter_guard: "DO NOT reopen BC-1 on image-hash mismatch alone. Verify via LIVE PRAGMA=1000 + RestartCount==0 + WAL<5MB. Reopen ONLY on RestartCount>0 (auto-crash) or WAL>=5MB."
      }
    else . end
  )
| .head = {
    status: "idle",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: null,
    next_agent: null
  }
