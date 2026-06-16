# Router 2026-06-16 — dev-team tick: FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS code landed -> flip head to AWAIT-REBUILD.
#
# dev-mcp-server (agent ac710bf1) committed the fix at 75e7a80f (code) + 4836b21b (notebook): generic composite
# fingerprint key scan:{ticker}:{alertType}:{YYYY-MM-DD}, fingerprint TEXT UNIQUE constraint, both scan jobs ->
# INSERT OR IGNORE. 125 tests pass, tsc clean. BUT apps/mcp-server /app/src is COPY-baked => NOT live until a real
# `docker compose build mcp-server` + force-recreate (force-recreate alone ships nothing — feedback_force_recreate_no_build_stale_image).
#
# This is a HEAD-ONLY guarded move (crash-resume correctness): record fix_commit + flip rebuild_required=true +
# next_agent=ops so a mid-rebuild crash resumes to "dispatch ops rebuild", NOT "re-code". The board task stays in
# in_progress[] (live gate not yet met — promotion to review waits on router RAW live-verify post-rebuild).
#
# GUARD: refuse unless the tid is uniquely in in_progress[]. CONSERVATION: total UNCHANGED (no array move, head-only).
# Usage: jq --arg now "$NOW" -f scripts/router-d84-alert-fingerprint-rebuild-head-20260616.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS" as $tid
| . as $root
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.in_progress[]?|select(.id==$tid)]|length) as $ip
| if $ip != 1 then error("tid not uniquely in in_progress[] — refuse head flip: " + ($ip|tostring)) else . end
| .task_board.in_progress = [ .task_board.in_progress[] | if .id==$tid then . + {fix_commit:"75e7a80f", code_landed_ts:$now, tests:"125 pass / tsc clean"} else . end ]
| .head = {
    status:"in_progress", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"ops", rebuild_required:true,
    next_action:"Code for FIX-ALERT-FINGERPRINT-WIRE-SCANJOBS landed at 75e7a80f. COPY-baked /app/src => ops MUST run real `docker compose build mcp-server` THEN force-recreate --no-deps (force-recreate alone ships nothing). Then ROUTER RAW-verifies LIVE on named-volume market.db: (a) image .Created epoch > commit 75e7a80f epoch, (b) container /app/src markers computeScanAlertFingerprint + INSERT OR IGNORE + fingerprint, (c) alerts table has fingerprint TEXT UNIQUE column, (d) no duplicate scan:% fingerprints. Dedup-under-parallel-load proof is MONITORED until next market-open scan (market currently closed; no-fake-data — cannot force a scan). Then in_progress -> review.",
    note:("ROUTER " + $now + " — dev-team tick: all 3 workers done+RAW-verified. dev-mcp-server FIX-ALERT-FINGERPRINT code landed 75e7a80f (125 tests, tsc clean, GENERIC key, no HVN special-case) -> AWAIT-REBUILD (ops dispatched). agent-father Fix1 system-auditor emit-schema rewrite 220b48c5 VERIFIED sound (post_agent_signal full contract: from_agent/to_agent/signal_type=signal_feedback/payload.passthrough; finding_data null->{} validates) + Fix2 fb-poster STALE-no-edit confirmed correct; mutex released. ops-vps-fetch BCTC-VPS verdict RAW-corroborated: NOT dead — pipeline functional since 5947f3f9 (afrLoop regex), vn-bctc-fetch healthy live, last-done 2026-06-15 22:40:49Z; current 0-URLs = source-side non-filing (9/10 not filed); 2 hardening follow-ups (SSC-503-retry, queue-maxage-gate) -> PO triage next tick via signal file. PUSH held (PO out-of-band).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a head-only move") else . end
