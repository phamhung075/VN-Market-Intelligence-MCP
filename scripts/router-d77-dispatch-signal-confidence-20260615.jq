# Router 2026-06-15T15:5xZ — dispatch FIX-SIGNAL-CONFIDENCE-DEFAULT-50 ready->in_progress -> dev-mcp-server.
# Coding lane free (in_progress = ARCH-CRON-SCHEDULER-RELIABILITY[design] + BA-VN-MACRO-TOOLING[spec], neither a coding lane). WIP<=2 allows 1.
# PO minted it P1 READY (commit aa3e2c0a) with route_to/zone/mode/size already set; this move flips the lane + stamps dispatch.
# GUARD: refuse unless task in ready[] AND not already past ready. CONSERVATION: total UNCHANGED (pure move).
# Usage: jq --arg now "$NOW" -f scripts/router-d77-dispatch-signal-confidence-20260615.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| "FIX-SIGNAL-CONFIDENCE-DEFAULT-50" as $tid
| ([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) as $before
| ([.task_board.ready[]? | select(.id==$tid)][0]) as $t
| if ($t==null) then error($tid + " not in ready[] — refuse")
  elif ([.task_board.in_progress[]?,.task_board.review[]?,.task_board.done_verified[]? | select(.id==$tid)]|length>0) then error("already past ready[] — refuse")
  else . end
| .task_board.ready = [ .task_board.ready[]? | select(.id!=$tid) ]
| .task_board.in_progress = (.task_board.in_progress + [ $t + {
      status:"IN_PROGRESS",
      lane:"dev-zone",
      dispatched_ts:$now,
      dispatched_by:"dev-team",
      dispatch_note:"Wire EVERY signal producer's already-computed confidence into postSignal confidence_score (0-100 int), generic across ALL 13 call sites — no per-source/per-ticker literal. Seed: agentSignalStore.ts:341 destructuring default 50; column schema-news.ts:104 DEFAULT 50; dashboard server.ts:1393 ?? 50; only agentSignalTools.ts:361 passes a real value. Smoking gun intelligenceCycleJob.ts:1290 posts verified_chain with chain.conviction in scope but omits confidence_score. recon-first: read all 13 postSignal call sites + each producer's existing confidence source (cascade.confidence / news sentiment.confidence / BCTC extraction_confidence / kinh-dich confidence / conviction) before editing. DoD /goal#1: live SIGNALS-last-10 shows a real SPREAD by source+strength (NOT a column of 50), RAW-verified vs named-volume market.db (NOT host ./data decoy) + a live get-signals call AFTER rebuild. /goal#2: generic, no allowlist."
    } ])
| .head = {
    status:"active", updated_at:$now, updated_by:"dev-team",
    active_task_id:$tid, next_agent:"dev-mcp-server",
    note:("DEV-TEAM DISPATCH " + $now + " — FIX-SIGNAL-CONFIDENCE-DEFAULT-50(P1) ready->in_progress -> dev-mcp-server (coding lane free; in_progress holds = ARCH-CRON-SCHEDULER-RELIABILITY[design] + BA-VN-MACRO-TOOLING[spec], 0 coding). Wire real confidence into postSignal for ALL 13 producers (seed agentSignalStore.ts:341 default 50; smoking gun intelligenceCycleJob.ts:1290). GENERIC /goal#2 no allowlist. DoD /goal#1 live SIGNALS-last-10 SPREAD not constant-50 vs named-vol DB post-rebuild. Part of standing no-fake-data/real-fetch directive — 2 read-only audits running to map the rest (numeric metric defaults wf + hardcoded/stub/dead-source wf). review[] gates 2026-06-16: FIX-VNSTOCK-TRADINGSTATS-CRASH (08:30Z), FIX-ALERT-ENGINE-RSI-SINGLEDIGIT (01:00Z/02:15Z). PUSH held (PO post-gates).")
  }
| ._updated_at=$now | ._updated_by="dev-team"
| .task_board._updated_at=$now | .task_board._updated_by="dev-team"
| if (([.task_board.ready,.task_board.in_progress,.task_board.review,.task_board.done_verified,.task_board.done]|map(length)|add) != $before)
    then error("CONSERVATION FAIL: total changed on a pure move") else . end
