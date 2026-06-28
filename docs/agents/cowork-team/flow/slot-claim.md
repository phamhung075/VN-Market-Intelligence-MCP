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
  task_id:              "cowork-slot:" + slot.slot_id,
  task_kind:            "cowork-slot",
  owner_agent:          "cowork-dispatcher",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
  ttl_seconds:          180,
  payload:              JSON.stringify({ slot_id: slot.slot_id, agent: slot.agent, flow_path: slot.flow_path })
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

## Step 4.6b — P3 RETIRED (leader heartbeat removed)

<!-- P3-FIRE-ELECTION (TASK_1994): the sticky cowork-leader heartbeat is RETIRED.
     The fire-time election lock (cron:cowork:<TICK>, TTL=600s) has NO mid-tick heartbeat
     per the P3 design (addendum §D.2 — no heartbeat for per-fire locks).
     The fire-election is held for the dispatch window only and released explicitly at
     end of Step 6 (telemetry.md § P3 Fire-Election Release).
     Per-slot Step 4.6 claims (above) are unchanged — they are intra-dispatch dedup
     and are NOT affected by the retirement of the dispatcher-level leader heartbeat. -->

<!-- Step 4.6b is a NO-OP in P3. No action required here.
     The fire-election (cron:cowork:<TICK>) was claimed in leader-lock.md Step 0b.2.
     Release is in telemetry.md Step 6. -->
