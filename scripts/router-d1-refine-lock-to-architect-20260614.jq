# Router dev-team dispatcher — dispatch FIX-REFINE-LOCK-TTL-RECLAIM ready/TODO -> in_progress/architect.
# Context: T3 done_verified, dev-mcp-server zone FREE. PO S50 triaged this P1 RECURRING defect and handed NEXT to router.
# WHY architect-first (not straight to dev): recurring [Lock orphaned by rebuild] class — the prior LET-EXPIRE remedy
#   demonstrably FAILED (acquire still refused 11.5h past expiry). Per [Recurring bug escalation] a recurring defect routes
#   through architect for a root-cause design. The TTL-steal fix has a real CORRECTNESS risk the architect must resolve:
#   a pure expires_at<now steal can reclaim a lock from a LIVE-but-slow refine worker -> double-processing / corrupt push.
#   Architect must design steal-safety (heartbeat/liveness check, or fencing token, or owner-session liveness) so the reclaim
#   is generic across ALL refine slots (refine-bctc-slot-1/2 + any future) yet never steals from a running worker.
# This write (ONE atomic temp->rename): FIX-REFINE-LOCK-TTL-RECLAIM ready[] -> in_progress[] ; status IN_PROGRESS ;
#   next_agent=architect ; dispatch_note. head -> in_progress/active=FIX-REFINE-LOCK-TTL-RECLAIM/next=architect.
#   umbrella ARCH-CRON-SCHEDULER-RELIABILITY stays in_progress (passive parent, Mon market-day gate — NOT active work,
#   so same-zone active in-flight = just this task = WIP ok). PARKED reaudit untouched. Other agents' dirty files untouched.
# GUARD: refuse unless task in ready[] with status TODO and zone apps/mcp-server/.
# Pointer: docs/agents/dev-team/flow/main.md (Step 3 execute-tier — recurring task -> architect design pass).
# Usage: jq --arg now "$NOW" -f scripts/router-d1-refine-lock-to-architect-20260614.jq docs/data/orch/orch-state.json
($ARGS.named.now) as $now
| (.task_board.ready // []) as $rd
| ([$rd[] | select(type=="object" and .id=="FIX-REFINE-LOCK-TTL-RECLAIM")][0]) as $t
| if $t == null then error("FIX-REFINE-LOCK-TTL-RECLAIM not in ready[] — refuse")
  elif ($t.status != "TODO") then error("status != TODO (\($t.status)) — refuse")
  elif (($t.zone // "") != "apps/mcp-server/") then error("zone != apps/mcp-server/ (\($t.zone)) — refuse")
  else . end
| .task_board.ready = [$rd[] | select((type=="object" and .id=="FIX-REFINE-LOCK-TTL-RECLAIM") | not)]
| .task_board.in_progress = ((.task_board.in_progress // []) + [
    ($t + {
      status: "IN_PROGRESS",
      next_agent: "architect",
      claimed_at: $now,
      claimed_by: "dev-team",
      dispatch_note: "Router dispatched (tick post-T3-done, zone free; PO S50 handoff). RECURRING [Lock orphaned by rebuild] — LET-EXPIRE remedy FAILED (acquire refused 11.5h past TTL expiry). architect: design a GENERIC TTL-reclaim for refine lock-acquire covering ALL refine slots (refine-bctc-slot-1/2 + future), so a lock whose expires_at < now is reclaimable on the next acquire — BUT with steal-safety so it NEVER reclaims from a LIVE-but-slow worker (heartbeat/liveness or fencing token; the refine worker already heartbeats? confirm). Root-cause WHY LET-EXPIRE failed: does acquire even CHECK expires_at, or does it unconditionally refuse on any existing row? Read the refine lock-acquire path (push_bctc_refined_unit / finalize_bctc_refine / the refine task_claim) + the lock table schema. Output a tight brief to docs/architecture-briefs/ + signal dev-mcp-server to implement. Gates for the eventual impl: tsc 0 + a regression test that an expired lock is reclaimed AND a live-heartbeating lock is NOT stolen. Unblocks refine_bctc_md (report bdcfa5e0 VCB Q4.2025 7/26 windows + VCB Q1 / HPG Q4 / GVR_2026_Q1 / HPG_2026_Q1 / HVN_2026_Q1 pending). FIX-DIGEST-PREDICT-ISO-WEEK-DEDUP sequenced BEHIND this (same zone, serialized). Commit by explicit path only — concurrent agent has coverage-state.json + cowork-schedule.json dirty."
    })
  ])
| .head = {
    status: "in_progress",
    updated_at: $now,
    updated_by: "dev-team",
    active_task_id: "FIX-REFINE-LOCK-TTL-RECLAIM",
    next_agent: "architect",
    note: "FIX-REFINE-LOCK-TTL-RECLAIM (P1 recurring, dev-mcp-server zone now free post-T3) -> architect design pass. Recurring [Lock orphaned by rebuild]: LET-EXPIRE remedy FAILED. architect designs generic TTL-reclaim-on-acquire with live-worker steal-safety across ALL refine slots -> brief + signal dev-mcp-server. Unblocks stalled refine_bctc_md (6 reports). FIX-DIGEST-ISO-WEEK-DEDUP queued behind (same zone serialized). Umbrella ARCH-CRON-SCHEDULER-RELIABILITY held for Mon 2026-06-15 G1/G2/G3 market-day gate. ARCH-SHIP-WAVE-REAUDIT PARKED. WIP=1 active same-zone. Commit explicit path only."
  }
