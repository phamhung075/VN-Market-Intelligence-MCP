<!-- size-justification: 113L — leader-lock claim + backstop-window defer gate (AF-1) + own-held/peer-held/orphan-recovery paths. Child of main.md. -->
<!-- AF-1-LEADER-LOCK-BACKSTOP-DEFER — brief: docs/architecture-briefs/2026-06-16-gatherer-doublefire-dedup-cluster.md §Primitive-1 -->
<!-- SESSION-SINGLETON GUARD: This leader-lock is the cowork-team equivalent of the dev-team SF-1 session-singleton guard.
     It ensures exactly one cowork-dispatcher session leads each 15-min tick — same role, different mechanism.
     Dev-team uses TTL-only (sprint-task kind, no owner_session). This lock uses owner_session + heartbeat rebind
     + orphan recovery (more sophisticated — handles restart-orphan separately from peer-held).
     Protocol doc: docs/protocols/task-lock-protocol.md § Session-Singleton Subclass. -->

## Step 0b — Claim cowork-leader lock (DWF-DEV-CROSS-4 Phase 2 — FR-P2-5)

<!-- Leader lock: ensures exactly one session leads each tick.
     WIN (claimed=true)            → proceed immediately.
     OWN-HELD (claimed=false + heartbeat ok=true) → renew + proceed.
       Own-held arises when Step 4.6b extended TTL beyond the next tick (1800s > 900s gap).
       Heartbeat probe is the discriminator: renewal matches owner_agent (FIX-CWK-LEADER-LOCK-REBIND;
       survives server restarts). NOTE: same-owner_agent peer could also renew — per-work-item
       slot tokens (Step 4.6) remain the hard dup-spawn gate.
     ORPHAN-RECOVERY (claimed=false + heartbeat ok=false + heartbeat_age > 600s):
       mcp-server restart mints a new SERVER_SESSION_ID; the old lock row's owner_session
       no longer matches → heartbeat returns ok=false, indistinguishable from a live peer.
       Gate: if the lock's heartbeat_at is stale (>600s) the prior process is definitively dead —
       force-release the orphan and re-claim. A live concurrent leader always has heartbeat_age ≤ 600s
       (it heartbeats every tick), so this gate does NOT re-open the dup-spawn window (FU-LEADER-LOCK-OWNER-SESSION).
     PEER-HELD (claimed=false + heartbeat ok=false + heartbeat_age ≤ 600s) → silent exit, no dispatch.
     TTL = 1800s (2 × 15-min heartbeat). MUST be explicit — never rely on default 3600s (AC-P2-5-3).
     Heartbeat: after dispatch body (Step 4.6b), extend TTL from current time.
     Dark window after force-recreate: max 1800s — see docs/protocols/dwf-ops-runbook.md. -->

```
LEADER_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "cowork-leader",
  task_kind:   "cowork-slot",
  ttl_seconds: 1800,
  owner_agent: "cowork-dispatcher"
}))
```

```
# Backstop-Window Defer Gate (AF-1 — Root A fix)
# Key on the ERROR path only: when the task_claim call itself errors or times out
# (tool call threw / no response), the lock state is UNREADABLE.
# Do NOT treat an unreadable lock as lock-free — that is the root of the double-fire.
if LEADER_CLAIM call errored or timed out:
  # Check whether this tick falls inside the cloud backstop window.
  # Gatherer backstop schedule is "0 */4" UTC → boundary hours = multiples of 4.
  # The manual dispatcher fires 7 min after the boundary; cloud backstop fires ~12 min after.
  # If the lock is unreadable within the first 15 min of a 4h-boundary hour, a live cloud
  # peer is the most likely lock holder. Defer one tick (15 min latency << 4h slot cadence).
  BOUNDARY_HOURS = {0, 4, 8, 12, 16, 20}   # offhours-gatherer "0 */4" cadence — generic rule
  current_hour   = UTC_now.hour
  current_minute = UTC_now.minute            # 0–59 within the hour

  if current_hour in BOUNDARY_HOURS AND current_minute < 15:
    log "[cowork] leader-lock UNREADABLE within backstop window (hour=" + current_hour + " minute=" + current_minute + ") — DEFER one tick"
    EXIT   # do NOT treat as lock-free; cloud backstop peer presumed to hold it

  else:
    # Outside the backstop window — lock-unreadable is safe to treat as a transient error.
    log "[cowork] leader-lock call error outside backstop window — PROCEEDING as if lock-free"
    → PROCEED (continue to Step 1)
```

```
if LEADER_CLAIM.claimed == true:
  # Fresh claim — this session just won the lock; proceed
  log "[cowork] leader lock claimed fresh — proceeding"
  → PROCEED (continue to Step 1)

else:
  # Lock held by someone. Disambiguate: own-held vs peer-held via heartbeat probe.
  # task_heartbeat matches owner_agent (FIX-CWK-LEADER-LOCK-REBIND — stable across
  # mcp-server restarts). BARE calls fall back to legacy owner_session → zombie after restart.
  LEADER_HB=$(call_tool(server="vn-market", tool="task_heartbeat", arguments={
    task_id:     "cowork-leader",
    owner_agent: "cowork-dispatcher"
  }))

  if LEADER_HB.ok == true:
    # Heartbeat succeeded — THIS process holds the lock (renewed +1800s from now)
    log "[cowork] leader lock self-held — heartbeated to " + LEADER_HB.expires_at + ", proceeding"
    → PROCEED (continue to Step 1)

  else:
    # Heartbeat rejected — either restart-orphan or genuine live peer.
    # Distinguish via orphan recovery BEFORE concluding peer-held.
    ORPHAN=$(call_tool(server="vn-market", tool="task_force_release_orphan", arguments={
      task_id:                   "cowork-leader",
      owner_agent:               "cowork-dispatcher",
      orphan_threshold_seconds:  600
    }))

    if ORPHAN.released == true:
      # Prior holder was a restart-orphan (heartbeat_age > 600s — dead process).
      # Re-claim immediately; if it succeeds this session becomes leader.
      log "[cowork] orphan lock released (age=" + ORPHAN.heartbeat_age + "s) — re-claiming"
      RECLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
        task_id:     "cowork-leader",
        task_kind:   "cowork-slot",
        ttl_seconds: 1800,
        owner_agent: "cowork-dispatcher"
      }))
      if RECLAIM.claimed == true:
        log "[cowork] leader lock re-claimed after orphan recovery — proceeding"
        → PROCEED (continue to Step 1)
      else:
        log "[cowork] orphan released but re-claim lost race — silent exit"
        EXIT

    else:
      # ORPHAN.released == false → reason: "heartbeat fresh" → live peer holds it.
      log "[cowork] leader lock held by live peer — silent exit"
      EXIT
```
