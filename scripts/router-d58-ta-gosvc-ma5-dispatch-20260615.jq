# Router dev-team tick 2026-06-15T08:30Z — dispatch FIX-TA-GOSVC-MA5-PRECISION ready -> in_progress
# per PO BATCH return (agentId a6db2780, this tick). Deferral condition ("holds for next free dev-zone slot")
# now SATISFIED: FIX-ALERT-ENGINE-RSI parked in review (gate next session), dev-technical-analysis coding lane FREE.
#
# ROUTER RAW (get_technical_indicators 08:28Z, NOT a badge): VHM/VIC/VRE all MA5=N/A on 38-candle depth while
# MA20 computes on the SAME depth (VHM 148,079 / VIC 201,129 / VRE 30,354) — a 5-window cannot fail when the
# 20-window succeeds on identical data => latent MA5 length-guard regression in Go TA svc after FIX-TA-GOSVC
# (33e7a094). Also Go RSI(14) agrees with TS report path only within ~1pt not <0.1pt (smoothing-seed divergence).
# Both correctness items live in the SAME Go TA svc / same candle-window code → recon-first one-zone pass.
#
# WIP NOTE: board in_progress goes 2 -> 3, BUT active dev-zone coding lane = 1 after this. The 2 existing holds
# consume NO coding lane (PO re-verified this tick): ARCH-CRON-SCHEDULER-RELIABILITY = QA-LIVE-OUTCOME-OBSERVE
# gate (no dev dispatch); BA-VN-MACRO-TOOLING = WAVE-1 queued (no dev WIP). WIP<=2 invariant guards active coding
# capacity, which stays at 1 dev-zone after this dispatch. PO-authorized (BATCH return), stamped for audit.
#
# GUARD: refuse unless FIX-TA-GOSVC-MA5-PRECISION is in ready[] AND not already in in_progress[].
# CONSERVATION: total task count UNCHANGED (pure move ready->in_progress).
# Usage: jq --arg now "$NOW" -f scripts/router-d58-ta-gosvc-ma5-dispatch-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.ready[]? | select(.id=="FIX-TA-GOSVC-MA5-PRECISION")][0]) as $t
| if ($t==null) then error("FIX-TA-GOSVC-MA5-PRECISION not in ready[] — refuse")
  elif ([.task_board.in_progress[]? | select(.id=="FIX-TA-GOSVC-MA5-PRECISION")]|length>0) then error("already in in_progress[] — refuse")
  else . end
| .task_board.ready = [ .task_board.ready[]? | select(.id!="FIX-TA-GOSVC-MA5-PRECISION") ]
| .task_board.in_progress = (.task_board.in_progress + [ $t + {
      status:"IN_PROGRESS",
      route_to:"dev-technical-analysis",
      mode:"recon-first",
      dispatched_ts:$now,
      dispatched_by:"po",
      dispatch_note:"dev-team tick 2026-06-15T08:30Z per PO BATCH (a6db2780). Deferral cond met (RSI parked review, TA coding lane free). ROUTER RAW get_technical_indicators 08:28Z: VHM/VIC/VRE MA5=N/A on 38-candle depth while MA20 computes same depth — latent MA5 length-guard regression after 33e7a094 + Go RSI ~1pt drift vs TS report path. recon-first: read Go MA/RSI window-guard + smoothing-seed before patching. Generic across all tickers (/goal#2). Gate: MA5 numeric for all watchlist tickers >=5 candles AND Go RSI matches TS report path <0.1pt on a shared ticker. PO-authorized WIP exception: board in_progress=3 but active dev-zone coding lane=1 (ARCH-CRON=QA-observe, BA-MACRO=queued, neither codes)."
    } ])
| .task_board.in_progress = [ .task_board.in_progress[]? |
      if .id=="ARCH-CRON-SCHEDULER-RELIABILITY" then . + {po_gate_day_rechecked_at:$now, po_recheck_disposition:"QA-LIVE-OUTCOME-OBSERVE gate, no dev-zone coding lane — verified parked this tick"}
      elif .id=="BA-VN-MACRO-TOOLING" then . + {po_held_rechecked_at:$now, po_recheck_disposition:"WAVE-1 queued, no dev WIP consumed while held — verified parked this tick"}
      else . end ]
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-TA-GOSVC-MA5-PRECISION", next_agent:"dev-technical-analysis",
    note:"DEV-TEAM TICK 2026-06-15T08:30Z — FIX-TA-GOSVC-MA5-PRECISION DISPATCHED ready->in_progress (dev-technical-analysis, recon-first, bg) per PO BATCH (a6db2780). Deferral condition satisfied: FIX-ALERT-ENGINE-RSI parked in review (behavioral gate next session), dev-technical-analysis coding lane FREE. ROUTER RAW get_technical_indicators 08:28Z: VHM/VIC/VRE all MA5=N/A on 38-candle depth while MA20 computes on SAME depth (VHM 148,079/VIC 201,129/VRE 30,354) — a 5-window cannot fail when the 20-window succeeds on identical data => latent MA5 length-guard regression in Go TA svc after FIX-TA-GOSVC (33e7a094); also Go RSI(14) ~1pt off TS report path (smoothing-seed divergence). recon-first one-zone pass reads MA/RSI window-guard + smoothing-seed together. Gate: MA5 numeric for all watchlist tickers >=5 candles AND Go RSI matches TS report path <0.1pt on a shared ticker — GENERIC all tickers (/goal#2). WIP: board in_progress=3 but active dev-zone coding=1 (PO-authorized — ARCH-CRON=QA-observe, BA-MACRO=queued, neither codes). FIX-ALERT-ENGINE-RSI behavioral gate still fires 2026-06-16 briefing 01:00Z + first TA scan 02:15Z (separate). PUSH of 4 commits held for PO post-RSI-gate."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
