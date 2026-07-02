<!-- size-justification: 115L — P3 fire-time election; replaces sticky cowork-leader (TTL=1800s) with per-tick cron:cowork:<tick> claim (TTL=600s, no heartbeat); backstop-window defer gate (AF-1) preserved + reattached to FIRE_CLAIM; activation gate: P3-QA (TASK_1995) smoke-test sign-off required before OBSERVE-ONLY operator conventions are formally retired. -->
<!-- TOKEN-ECONOMY-TICK-PREFLIGHT WU-1 (2026-07-02): on the normal SILENT/WORK path this logic
     now runs deterministically inside scripts/agents-flow/cowork-tick-preflight.sh Step 3
     (fire-time election claim, AF-1 backstop-defer gate, LOST_ELECTION telegram). This file is
     reached only on the preflight script's ERROR verdict (fallback — see main.md § JUMP-TO
     table) or by an agent following the WORK-continuation cross-reference. Kept verbatim as the
     canonical fallback body — never deleted. -->
<!-- AF-1-LEADER-LOCK-BACKSTOP-DEFER — brief: docs/architecture-briefs/2026-06-16-gatherer-doublefire-dedup-cluster.md §Primitive-1 -->
<!-- P3-FIRE-ELECTION (TASK_1994 / CROSS-SESSION-MULTI-TEAM-ORCH):
     REPLACES: sticky cowork-leader TTL=1800s + heartbeat at Step 4.6b (RETIRED in P3).
     NEW KEY: cron:cowork:<TICK> where TICK = floor(fire_time) to 15-min boundary, ISO-8601 UTC minute precision.
     ACTIVATION: this file IS the shipped P3 standard. Old cowork-leader task_id and 1800s sticky design
     are superseded as of TASK_1994 merge. Live sessions started before this commit run the old protocol
     unaffected (they loaded the old file into memory). New sessions/ticks use this file.
     OBSERVE-ONLY retirement: operator conventions (feedback_router_cowork_defer_to_live_leader,
     feedback_router_manual_drive_overlaps_devteam_loop) are superseded by this code-enforced election.
     Memory files remain authoritative FALLBACK until P3-QA (TASK_1995) smoke tests pass.
     See .claude/skills/cron-cowork-team/SKILL.md § P3-OBSERVE-ONLY-RETIREMENT for retirement gate.
     Design: docs/architecture-briefs/2026-06-28-fire-time-leader-election-P3-addendum.md §A §B §D §E -->

## Step 0b.2 — Fire-time election (P3 — replaces cowork-leader lock)

<!-- P3-FIRE-ELECTION PATTERN:
     One claim per tick per session. The winner runs the full dispatch pipeline (Steps 0c–6).
     Loser EXITs cleanly — no work assigned, no spawn.
     Per-slot Step 4.6 claims (slot-claim.md) are UNCHANGED — they remain as intra-dispatch dedup
     within an elected session. Step 4.6b leader heartbeat is RETIRED (no mid-tick heartbeat for fire-election).
     Release: explicit task_release at end of Step 6 in telemetry.md. TTL=600s is crash-safety backstop only.
     task_kind "cowork-slot" preserves consistency with pre-P3 task_list_held queries.
     Spec: addendum §B.3 (dispatcher-level), §D.1 (TTL=600s, no heartbeat), §D.3 (explicit release). -->

### compute_tick_boundary (*/15 * * * * expression)

```
# Floor current UTC minute to nearest 15-min scheduled boundary.
# Scheduled boundaries: :00, :15, :30, :45
# Two sessions firing within ±2min jitter of the same boundary produce the SAME TICK key.
CURRENT_MINUTE=$(date -u +%M)     # 0–59
BOUNDARY_MINUTE=$(( (CURRENT_MINUTE / 15) * 15 ))
TICK=$(date -u +"%Y-%m-%dT%H:$(printf '%02d' $BOUNDARY_MINUTE)Z")
# Example: fire at 14:32Z → BOUNDARY_MINUTE=30 → TICK="2026-06-28T14:30Z"
# Example: fire at 14:45Z → BOUNDARY_MINUTE=45 → TICK="2026-06-28T14:45Z"
```

### Fire claim

```
FIRE_CLAIM=$(call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "cron:cowork:" + TICK,
  task_kind:            "cowork-slot",
  owner_agent:          "cowork-dispatcher",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          600,
  payload:              {"site": "fire-election", "tick": TICK}
}))
```

### Backstop-Window Defer Gate (AF-1 — Root A fix — PRESERVED, reattached to FIRE_CLAIM)

```
# AF-1 gate: triggers on the ERROR path ONLY.
# When FIRE_CLAIM call itself errors or times out (tool threw / no response),
# the lock state is UNREADABLE. Do NOT treat as lock-free — that is the root of the double-fire.
if FIRE_CLAIM call errored or timed out:
  BOUNDARY_HOURS = {0, 4, 8, 12, 16, 20}   # offhours-gatherer "0 */4" cadence
  current_hour   = UTC_now.hour
  current_minute = UTC_now.minute

  if current_hour in BOUNDARY_HOURS AND current_minute < 15:
    log "[cowork] fire-election UNREADABLE within backstop window (hour=" + current_hour + " minute=" + current_minute + ") — DEFER one tick"
    EXIT   # do NOT treat as lock-free; cloud backstop peer presumed to hold it

  else:
    log "[cowork] fire-election call error outside backstop window — PROCEEDING as if uncontested"
    → PROCEED (continue to Step 0c)
```

### Election result

```
# claimed:true is authoritative — no heartbeat probe.
# Ownership discriminated by owner_client_session (per-session UUID), not owner_agent.

if FIRE_CLAIM.claimed == true:
  log "[cowork] fire-election WON tick=" + TICK + " → proceeding"
  → PROCEED (continue to Step 0c)

else:
  peer = FIRE_CLAIM.current_holder.owner_client_session

  if peer == $CLAUDE_CODE_SESSION_ID:
    # Re-entrant: this session already holds the tick key (session restart mid-tick, same session).
    log "[cowork] fire-election RE-ENTRANT tick=" + TICK + " — renewing + proceeding"
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id:              "cron:cowork:" + TICK,
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
    → PROCEED (continue to Step 0c)

  else:
    # Peer session leads this tick — EXIT cleanly (not an error).
    log "[cowork] fire-election LOST tick=" + TICK + " — peer=" + peer + " → EXIT"
    call_tool(server="vn-market", tool="send_telegram", arguments={
      channel: "work",
      message: "[cowork] fire-election SKIP tick=" + TICK + " (peer session leads)"
    })
    EXIT
```

### Release (mandatory — runs in telemetry.md Step 6 after dispatch body completes)

```
# At end of Step 6 (telemetry.md) — the final step of the dispatch body:
call_tool(server="vn-market", tool="task_release", arguments={
  task_id:              "cron:cowork:" + TICK,
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})
# ok=false is acceptable (TTL=600s expired on a very long dispatch body — crash-safety backstop).
# See: docs/agents/cowork-team/flow/telemetry.md § P3 Fire-Election Release
```
