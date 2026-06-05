<!-- size-justification: 68L — leader-lock claim + own-held/peer-held/orphan-recovery paths. Child of main.md. -->

## Step 0b — Claim cowork-leader lock (DWF-DEV-CROSS-4 Phase 2 — FR-P2-5)

<!-- Leader lock: ensures exactly one session leads each tick.
     WIN (claimed=true)            → proceed immediately.
     OWN-HELD (claimed=false + heartbeat ok=true) → renew + proceed.
       Own-held arises when Step 4.6b extended TTL beyond the next tick (1800s > 900s gap).
       Heartbeat probe is the discriminator: only the holding OS process can renew it
       (server-side owner_session = pid-<pid>-ts-<startupTs>; caller cannot spoof it).
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
if LEADER_CLAIM.claimed == true:
  # Fresh claim — this session just won the lock; proceed
  log "[cowork] leader lock claimed fresh — proceeding"
  → PROCEED (continue to Step 1)

else:
  # Lock held by someone. Disambiguate: own-held vs peer-held via heartbeat probe.
  # task_heartbeat is guarded server-side by owner_session = pid-<pid>-ts-<startupTs>;
  # only the holding OS process gets ok=true — a concurrent peer session gets ok=false.
  LEADER_HB=$(call_tool(server="vn-market", tool="task_heartbeat", arguments={
    task_id: "cowork-leader"
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
