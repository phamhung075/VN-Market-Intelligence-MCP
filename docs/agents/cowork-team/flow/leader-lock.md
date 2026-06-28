<!-- size-justification: 96L — leader-lock claim + backstop-window defer gate (AF-1) + session-id comparison (P1 TASK_1978). Child of main.md. -->
<!-- AF-1-LEADER-LOCK-BACKSTOP-DEFER — brief: docs/architecture-briefs/2026-06-16-gatherer-doublefire-dedup-cluster.md §Primitive-1 -->
<!-- SESSION-SINGLETON GUARD: This leader-lock is the cowork-team equivalent of the dev-team SF-1 session-singleton guard.
     It ensures exactly one cowork-dispatcher session leads each 15-min tick — same role, different mechanism.
     P1 fix (TASK_1978 / CROSS-SESSION-MULTI-TEAM-ORCH): ownership keyed on owner_client_session (per-session UUID),
     not owner_agent (role). claimed:true is unconditionally trusted. Self-held-heartbeat anti-pattern deleted.
     On claimed:false: compare owner_client_session to $CLAUDE_CODE_SESSION_ID — equal = re-entrant, different = DEFER.
     Protocol doc: docs/protocols/task-lock-protocol.md § Session-Singleton Subclass. -->

## Step 0b — Claim cowork-leader lock (DWF-DEV-CROSS-4 Phase 2 — FR-P2-5)

<!-- Leader lock: ensures exactly one session leads each tick.
     P1 protocol (TASK_1978 / CROSS-SESSION-MULTI-TEAM-ORCH):
     WIN (claimed=true)     → proceed immediately. claimed:true is unconditionally trusted.
     REENTRANT (claimed=false + owner_client_session == $CLAUDE_CODE_SESSION_ID)
       → heartbeat to renew + proceed. Own prior lock within same session.
     PEER-HELD (claimed=false + owner_client_session != $CLAUDE_CODE_SESSION_ID)
       → DEFER: log + WORK telegram + EXIT. Do NOT attempt heartbeat for ownership check.
     TTL = 1800s (2 × 15-min heartbeat). MUST be explicit — never rely on default 3600s (AC-P2-5-3).
     Heartbeat: after dispatch body (Step 4.6b), extend TTL from current time using owner_client_session.
     Dark window after force-recreate: max 1800s — see docs/protocols/dwf-ops-runbook.md. -->

```
LEADER_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "cowork-leader",
  task_kind:            "cowork-slot",
  ttl_seconds:          1800,
  owner_agent:          "cowork-dispatcher",
  owner_client_session: $CLAUDE_CODE_SESSION_ID
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
# P1 fix (TASK_1978 — CROSS-SESSION-MULTI-TEAM-ORCH):
# claimed:true is authoritative — no heartbeat probe on claimed:false.
# Self-held-heartbeat anti-pattern DELETED (lines 64-81 in pre-P1 file).
# Ownership discriminated by owner_client_session (per-session UUID), not owner_agent (role).

if LEADER_CLAIM.claimed == true:
  # Fresh claim — this session won the lock exclusively. PROCEED.
  log "[cowork] leader lock claimed fresh — proceeding"
  → PROCEED (continue to Step 1)

else:
  # Lock held. Compare owner_client_session to discriminate:
  # own prior lock (re-entrant within session) vs. live peer session.
  # NEVER call task_heartbeat here for ownership check — deleted anti-pattern.
  owner_session = LEADER_CLAIM.current_holder.owner_client_session

  if owner_session == $CLAUDE_CODE_SESSION_ID:
    # Same session — re-entrant lock. Renew + PROCEED.
    log "[cowork-team] re-entry detected, renewing..."
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id:              "cowork-leader",
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
    → PROCEED (continue to Step 1)

  else:
    # Different session (or NULL transitional row) — peer session holds it. DEFER.
    log "[cowork-team] peer session " + owner_session + " holds lock, deferring"
    send_telegram(channel="work", "[cowork-team] DEFER: peer session holds cowork-slot lock")
    EXIT
```
