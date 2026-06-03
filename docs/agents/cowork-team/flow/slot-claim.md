<!-- size-justification: 88L — Steps 4.6 + 4.6b: per-work-item idempotent token (suffix-free, TTL=180s) + leader heartbeat renewal. Child of main.md. -->

<!-- decision: Step 4.6 REWRITTEN — DWF-DEV-CROSS-4 Phase 2 (R1 + R3 blocking).
  OLD: key = cowork-slot:<agent>:<nominal_tick>; TTL = 900s (stale after next tick).
  NEW: key = cowork-slot:<slot_id> (SUFFIX-FREE — R3); TTL = 180s (EXPLICIT, mandatory — R1).

  R3 rationale: A tick suffix (e.g. cowork-slot:chef-morning@2026-05-30T05:15:00Z) changes
  the lock key at each 15-min boundary. A peer session at the next tick acquires a fresh key
  for the same work — re-launching a job that is still running. Suffix-free key (slot_id only)
  means the lock persists across ticks for as long as the job runs + renews.
  KEY: cowork-slot:<slot_id> — slot_id is stable work identity (NOT agent name alone, because
  same-agent multi-slot fires must get DISTINCT locks per slot_id).

  R1 rationale: Default TTL is 3600s. A crash after 5s would hold the lock for 3595 more
  seconds. TTL=180s (~3 min) frees the lock within one dispatch cycle on crash, preventing
  1-hour starvation. Long-running agents renew via heartbeat (Step 4.6b optional; required
  in future phases with long dev chains). NEVER omit ttl_seconds — the test checks its presence.

  Release: called after each spawn attempt (success OR failure) via try/finally. Per ARCH-DECIDE-B
  the spawned agent's own heartbeat chain extends the lock for long jobs. For short cowork
  jobs (< 3 min) the 180s TTL auto-frees after job completes without explicit release needed. -->

## Step 4.6 — Per-work-item idempotent token (REWRITTEN — DWF-DEV-CROSS-4, R1+R3 blocking)

Initialize tracking arrays:

```bash
WON_SLOTS=[]     # slots where task_claim returned claimed=true
HELD_BY_OTHER=[] # slots where task_claim returned claimed=false
```

For each slot in MATCHES, attempt per-work-item claim:

```
# KEY: suffix-free cowork-slot:<slot_id> — R3 BLOCKING (no nominal_tick, no time suffix)
# TTL: explicit 180s — R1 BLOCKING (never the default 3600s)
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "cowork-slot:" + slot.slot_id,
  task_kind:   "cowork-slot",
  owner_agent: "cowork-dispatcher",
  ttl_seconds: 180,
  payload:     JSON.stringify({ slot_id: slot.slot_id, agent: slot.agent, flow_path: slot.flow_path })
})
```

On claim result:

```
if result.claimed == false:
  log "[cowork] slot " + slot.slot_id + " already claimed — skip duplicate spawn"
  append slot to HELD_BY_OTHER
  continue to next slot

if result.claimed == true:
  append slot to WON_SLOTS
```

All-held guard (after iterating all MATCHES):

```
if WON_SLOTS is empty:
  # Silent exit — write telemetry (Step 6) with all_held=true, then EXIT.
  # Do NOT send a WORK telegram. Do NOT attempt any spawns.
  EXIT (go to Step 6 with all_held=true)
```

---

## Step 4.6b — Heartbeat leader lock (DWF-DEV-CROSS-4 Phase 2 — ARCH-DECIDE-B)

<!-- After all per-work-item slots are processed (win or skip), renew the leader lock TTL.
     This extends expires_at from current time by 1800s so a long dispatch body (tick-snapshot
     write + pressure-state emit + fan-out) does not self-expire the leader lock mid-tick.
     Pattern: explicit task_heartbeat on each tick win (ARCH-DECIDE-B: cleaner than reclaim).
     ok=false: lock was stolen (another session won during this long tick) — log, proceed anyway
     (we already won all per-work-item slots; dispatch body continues; no spawn gate here). -->

Only execute if WON_SLOTS is non-empty (skip on silent-exit path).

```
call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "cowork-leader"
})
```

On heartbeat failure (`ok=false`): log `"[cowork-team] leader heartbeat failed — lock may have been stolen; continuing dispatch"`. Do NOT abort — per-work-item tokens were already won.
