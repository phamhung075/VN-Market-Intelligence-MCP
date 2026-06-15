# Router dev-team tick 2026-06-15T07:31Z — dispatch FIX-ALERT-ENGINE-RSI-SINGLEDIGIT ready -> in_progress
# per PO BATCH return (agentId afc7f746, this tick). The LAST OPEN consumer of the user-flagged single-digit
# RSI class — LIVE-confirmed publishing daily at market-open (PO RAW get_unreviewed_market_messages this tick:
# msg 753 morning-briefing echo 'VHM RSI 9.8, VIC RSI 7.4'; msg 752 TA-Alert stream 'DAG RSI=100.0' — vs the
# now-fixed canonical get_technical_indicators VHM ~35.5 / VIC ~34.7). /goal#1 highest-value open item.
#
# WIP NOTE: board in_progress goes 2 -> 3, BUT the two existing holds consume NO active dev-zone coding lane —
# PO verified both parked this tick: ARCH-CRON-SCHEDULER-RELIABILITY = QA-LIVE-OUTCOME-OBSERVE gate (G1/G2/G3
# accrue across today's session, po_gate_day_checked_at 06:35Z, "NOT a dev dispatch, consumes NO dev WIP lane");
# BA-VN-MACRO-TOOLING = WAVE-1 queued behind the RSI pair ("NO dev WIP consumed while held"). The dev-alert-engine
# coding lane is FREE. WIP<=2 invariant guards active coding capacity, which stays at 1 dev-zone after this.
# This exception is PO-authorized (BATCH return) and stamped on the dispatched task for audit.
#
# GUARD: refuse unless FIX-ALERT-ENGINE-RSI-SINGLEDIGIT is in ready[] AND not already in in_progress[].
# CONSERVATION: total task count UNCHANGED (pure move ready->in_progress).
# Usage: jq --arg now "$NOW" -f scripts/router-d56-alert-rsi-dispatch-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.ready[]? | select(.id=="FIX-ALERT-ENGINE-RSI-SINGLEDIGIT")][0]) as $t
| if ($t==null) then error("FIX-ALERT-ENGINE-RSI-SINGLEDIGIT not in ready[] — refuse")
  elif ([.task_board.in_progress[]? | select(.id=="FIX-ALERT-ENGINE-RSI-SINGLEDIGIT")]|length>0) then error("already in in_progress[] — refuse")
  else . end
| .task_board.ready = [ .task_board.ready[]? | select(.id!="FIX-ALERT-ENGINE-RSI-SINGLEDIGIT") ]
| .task_board.in_progress = (.task_board.in_progress + [ $t + {
      status:"IN_PROGRESS",
      route_to:"dev-alert-engine",
      dispatched_ts:$now,
      dispatched_by:"po",
      dispatch_note:"dev-team tick 2026-06-15T07:31Z — last-open single-digit-RSI consumer, LIVE-confirmed msg 752/753 this tick; /goal#1 highest-value. PO-authorized WIP exception: board in_progress=3 but active dev-zone coding lane=1 (ARCH-CRON=QA-observe, BA-MACRO=queued, neither codes)."
    } ])
| .task_board.in_progress = [ .task_board.in_progress[]? |
      if .id=="ARCH-CRON-SCHEDULER-RELIABILITY" then . + {po_gate_day_rechecked_at:$now, po_recheck_disposition:"QA-LIVE-OUTCOME-OBSERVE gate, no dev-zone coding lane — verified parked this tick"}
      elif .id=="BA-VN-MACRO-TOOLING" then . + {po_held_rechecked_at:$now, po_recheck_disposition:"WAVE-1 queued behind RSI pair, no dev WIP consumed while held — verified parked this tick"}
      else . end ]
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:"FIX-ALERT-ENGINE-RSI-SINGLEDIGIT", next_agent:"dev-alert-engine",
    note:"DEV-TEAM TICK 2026-06-15T07:31Z — FIX-ALERT-ENGINE-RSI-SINGLEDIGIT DISPATCHED ready->in_progress (dev-alert-engine, recon-first, bg) per PO BATCH (afc7f746). THE LAST OPEN consumer of the user-flagged single-digit RSI class: PO RAW-confirmed this tick it still publishes daily at market-open (msg 753 morning-briefing echo 'VHM RSI 9.8/VIC RSI 7.4', msg 752 TA-Alert 'DAG RSI=100.0') contradicting the now-fixed canonical get_technical_indicators (VHM ~35.5/VIC ~34.7). /goal#1 highest-value. Recon-first: trace alert-engine + morning-briefing RSI source, confirm it reads the corrupt pre-fix path (not the canonical tool), wire BOTH consumers to get_technical_indicators. Verification gate = next TA-Alert + morning-briefing show NO single-digit/clamped RSI, match canonical within 0.1pt, GENERIC all tickers. WIP: board in_progress=3 but active dev-zone coding=1 (PO-authorized — ARCH-CRON=QA-observe, BA-MACRO=queued, neither codes). DEFERRED ready: FIX-TA-GOSVC-MA5-PRECISION (medium/S) — no user-MARKET surface, holds for next free dev-zone slot. PUSH: PO-authorized (origin 0-behind/9-ahead, clean linear fast-forward, all report-analyzer-authored, no cloud-chore divergence) — router pushes this tick. SF-1 release at tick end."
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
