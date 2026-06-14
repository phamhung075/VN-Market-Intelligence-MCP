# Router dev-team dispatcher — advance FIX-REFINE-LOCK-TTL-RECLAIM architect-design-done -> dev-mcp-server IMPL.
# architect abc2f9bd returned: brief a92ed301 + signal dca59971. Router RAW-verified INDEPENDENTLY (not the badge):
#   COMMITS: a92ed301 = brief(246L) + architect notebook + orch-state(+14) — coverage-state.json + cowork-schedule.json
#     NOT captured (still M, concurrent agent's). dca59971 = signal file only. Both clean, explicit-path.
#   ROOT CAUSE RAW-CONFIRMED in source (grep docs/agents/refine_bctc_md/flow/main.md):
#     line 37-38 task_claim HAS owner_agent:"refine-orchestrator" ttl_seconds:1000 (correct);
#     line 82 task_heartbeat OMITS owner_agent (BUG — legacy owner_session path -> zombie after rebuild);
#     line 97 task_release OMITS owner_agent (BUG — lock never deleted -> orphan);
#     line 101 error-boundary task_release also omits it. => Vector 1 (PRIMARY) verified real, architect read source correctly.
#   DESIGN sound: Fix A (add owner_agent to heartbeat+release+error-boundary release) closes the orphan class GENERICALLY
#     for ALL refine slots (the flow is shared by refine-bctc-slot-1/2 + future); Fix C (ttl 1000->1800) slow-chunk headroom;
#     coordinationStore Step 2 TTL-steal already correct (no code change); steal-safety = heartbeat owner_agent liveness +
#     INSERT OR REPLACE UNIQUE(report_id,unit_id) + sequential skip-set idempotency (double-push negligible).
# This write (ONE atomic temp->rename): FIX-REFINE-LOCK-TTL-RECLAIM stays in in_progress[]; status REVIEW->IN_PROGRESS;
#   next_agent stays dev-mcp-server; impl_dispatch_note added; design_brief pointer kept. head -> in_progress/next=dev-mcp-server
#   (architect left head.next_agent stale at "architect" — router corrects). umbrella ARCH-CRON-SCHEDULER-RELIABILITY
#   stays in_progress (passive Mon-market-day gate, not active work). PARKED reaudit untouched. Other agents' dirty files untouched.
# GUARD: refuse unless task in in_progress[] with next_agent=="dev-mcp-server" and design_brief present.
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — architect-done -> zone owner implements).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-refine-lock-architect-to-dev-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.in_progress // []) as $ip
| ([$ip[] | select(type=="object" and .id=="FIX-REFINE-LOCK-TTL-RECLAIM")][0]) as $t
| if $t == null then error("FIX-REFINE-LOCK-TTL-RECLAIM not in in_progress[] — refuse")
  elif (($t.next_agent // null) != "dev-mcp-server") then error("next_agent != dev-mcp-server (\($t.next_agent)) — refuse")
  elif (($t.design_brief // "") == "") then error("design_brief absent — architect handoff incomplete — refuse")
  else . end
| .task_board.in_progress = [
    $ip[]
    | if (type=="object" and .id=="FIX-REFINE-LOCK-TTL-RECLAIM") then
        . + {
          status: "IN_PROGRESS",
          next_agent: "dev-mcp-server",
          impl_dispatched_at: $now,
          impl_dispatched_by: "dev-team",
          impl_dispatch_note: "architect design RAW-verified (brief a92ed301; root cause confirmed in source: flow heartbeat/release omit owner_agent -> legacy owner_session zombie after rebuild -> orphan). IMPLEMENT per docs/architecture-briefs/2026-06-14-fix-refine-lock-ttl-reclaim.md §3-§5: (Fix A) edit docs/agents/refine_bctc_md/flow/main.md — add owner_agent:\"refine-orchestrator\" to the task_heartbeat call (line ~82), the happy-path task_release call (line ~97), AND the error-boundary task_release (line ~101 region, the finalize_bctc_refine FAILED branch). MINIMAL targeted edits only — do NOT refactor the flow doc. (Fix C) change ttl_seconds: 1000 -> 1800 in the task_claim call (line ~37-38). (Tests) add apps/mcp-server/src/__tests__/FIX-REFINE-LOCK-TTL-RECLAIM.test.ts with T1-T5 exactly per brief §5: T1 expired lock IS reclaimed (claimed && stolen, new owner_agent+future expires_at); T2 live-heartbeating lock is NOT stolen (claimed=false, current_holder=original); T3 owner_agent heartbeat survives owner_session change (rebuild) -> ok=true renewed; T4 owner_agent release survives session change -> ok=true, row deleted; T5 double-push INSERT OR REPLACE idempotent (last-write-wins, no dup row, no constraint error). coordinationStore.ts + coordinationTools.ts need NO change (Step 2 TTL-steal already correct) — confirm that before touching them. GATES (router will RAW-re-verify): cd apps/mcp-server && bunx tsc --noEmit exit 0 AND bun test src/__tests__/FIX-REFINE-LOCK-TTL-RECLAIM.test.ts 5/5 green. Commit by EXPLICIT PATH only (the flow doc + the test file + your notebook) — concurrent agent has coverage-state.json + cowork-schedule.json + several docs/signals/*.json dirty; do NOT git add -A. NOTE the flow fix needs NO server rebuild (fleet-cron reads the flow doc live) but the TEST file lives in mcp-server so a rebuild is still needed for qa's LIVE container gate — flag that in your RETURN. After dev-green: ops clears the wedged orphan lock once via call_tool task_force_release_orphan{task_id:'bctc-refine:bdcfa5e0',owner_agent:'refine-orchestrator',orphan_threshold_seconds:120} to unblock the 6 stalled reports. FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP stays sequenced BEHIND (same zone serialized)."
        }
      else . end
  ]
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-REFINE-LOCK-TTL-RECLAIM",
    next_agent: "dev-mcp-server",
    note: "FIX-REFINE-LOCK-TTL-RECLAIM architect design DONE + RAW-verified (brief a92ed301; root cause confirmed in flow source: heartbeat/release omit owner_agent -> orphan after rebuild). -> dev-mcp-server IMPL: Fix A (owner_agent on heartbeat+release+error-release in refine flow main.md), Fix C (ttl 1000->1800), T1-T5 regression tests (apps/mcp-server). Gates tsc 0 + 5/5 green. Flow fix needs no rebuild but test file does -> qa LIVE container gate. ops then clears orphan bctc-refine:bdcfa5e0 to unblock 6 reports. Commit explicit-path only (concurrent dirty tree). Umbrella ARCH-CRON-SCHEDULER-RELIABILITY held for Mon 2026-06-15 G1/G2/G3. ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 active same-zone."
  }
