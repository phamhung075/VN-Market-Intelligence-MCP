# Router dev-team dispatcher — FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP ready -> in_progress (dev-mcp-server IMPL).
# Predecessor FIX-REFINE-LOCK-TTL-RECLAIM cleared in_progress (done_verified 67cad7ae) -> same-zone (apps/mcp-server) slot free.
# The task's own wip_rule: "Picked up only after FIX-REFINE-LOCK-TTL-RECLAIM clears in_progress." -> condition MET.
# ARCH-CRON-SCHEDULER-RELIABILITY in in_progress is the PASSIVE Mon-2026-06-15 G1/G2/G3 LIVE gate (no active agent — its impl
#   child T3-ARCH-CRON-WATCHDOG already done_verified per po-S50 head note) -> does NOT consume the active dev-mcp-server slot.
# PO (po-S50) fully specified root_cause + fix + generic_mandate + verification_gate; size=S; design fork (B) resolved by
#   generic_mandate (date-range key, NOT derived week label) -> no architect pass, direct to zone owner.
# This write (ONE atomic temp->rename): FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP ready[] -> in_progress[]; status TODO->IN_PROGRESS;
#   next_agent -> dev-mcp-server; impl_dispatched_at + impl_dispatch_note added. head -> in_progress/active=FIX-DIGEST-PREDICT.
#   ARCH-CRON-SCHEDULER-RELIABILITY (passive) + ARCH-SHIP-WAVE-REAUDIT (PARKED) untouched. Concurrent dirty tree untouched.
# GUARD: refuse unless task in ready[] with status TODO and owner=="dev-mcp-server".
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — ready -> zone owner implements).
# Usage: jq --arg now "$NOW" -f scripts/router-d2-digest-dedup-ready-to-dev-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.ready // []) as $rd
| ([$rd[] | select(type=="object" and .id=="FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP")][0]) as $t
| if $t == null then error("FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP not in ready[] — refuse")
  elif ($t.status != "TODO") then error("status != TODO (\($t.status)) — refuse")
  elif (($t.owner // null) != "dev-mcp-server") then error("owner != dev-mcp-server (\($t.owner)) — refuse")
  else . end
| .task_board.ready = [$rd[] | select((type=="object" and .id=="FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP") | not)]
| .task_board.in_progress = ((.task_board.in_progress // []) + [
    ($t + {
      status: "IN_PROGRESS",
      next_agent: "dev-mcp-server",
      impl_dispatched_at: $now,
      impl_dispatched_by: "dev-team",
      impl_dispatch_note: "Predecessor FIX-REFINE-LOCK-TTL-RECLAIM done_verified (67cad7ae) -> same-zone slot free, wip_rule condition met. IMPLEMENT per PO spec (root_cause A+B, fix, generic_mandate, verification_gate): (A) ONE canonical ISO-week helper (date +%V / ISO-8601 semantics — Sun 2026-06-14 MUST resolve to W24 not W25) shared by EVERY digest-predict publish-gate path; no path recomputes its own week label. (B) per generic_mandate, key the guaranteed-weekly slot mutex on the calendar period date-RANGE (period start/end), NOT a derived week-label string, so a one-label divergence cannot defeat dedup; ALSO have the RemoteTrigger path write cowork-schedule.json .last_fired on fire if cheap (belt-and-suspenders against the stale-last_fired re-fire). Apply to ALL guaranteed weekly slots, not just digest-sunday. TESTS (verification_gate): unit — both dispatch paths derive the SAME key for Sun 2026-06-14 (=W24) AND adjacent week-boundary Sundays; integration — simulate RemoteTrigger fire then CLI dispatcher tick within the same period -> EXACTLY ONE publish (marker dedup holds). Gates: cd apps/mcp-server && bunx tsc --noEmit exit 0 AND bun test <new test> green. Commit by EXPLICIT PATH only (concurrent agent dirty tree: bctc-analyst.md, coverage-state.json, cowork-schedule.json M + docs/signals + digest-predict session ?? — do NOT git add -A; if you legitimately edit cowork-schedule.json for fix B, stage ONLY that file by explicit path and verify the M-from-other-agent delta is yours). RECURRENCE-PREVENTION ONLY — the 2026-06-14 digest already delivered (twice) to MARKET; do NOT re-post. Flag whether a server rebuild is needed (digest code in mcp-server -> likely yes for the test + runtime helper; the cowork-schedule.json data change reads live)."
    })
  ])
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP",
    next_agent: "dev-mcp-server",
    note: "FIX-REFINE-LOCK-TTL-RECLAIM done_verified (67cad7ae) -> apps/mcp-server zone free. Dispatch FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP (ready->in_progress, dev-mcp-server): canonical shared ISO-week helper (Sun 2026-06-14=W24) + date-range-keyed slot mutex across ALL guaranteed weekly slots (generic_mandate) + RemoteTrigger last_fired write; unit+integration dedup tests. Recurrence-prevention only (no re-post). ARCH-CRON-SCHEDULER-RELIABILITY passive Mon-2026-06-15 G1/G2/G3 gate (no active agent). ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 active same-zone. Commit explicit path only."
  }
