<!-- size-justification: relocated verbatim from docs/agents/dev-team/flow/main.md (TE-T02, 2026-08-05, docs/architecture-briefs/2026-07-12-token-economy-lazyload-audit.md#T-02 — WU-2 verbatim-relocation guarantee: content moved, not deleted). Reached ONLY on ERROR verdict from scripts/agents-flow/dev-team-tick-preflight.sh — the common RUN/RUN-IDLE/SKIP/SKIP-WIDENED path never reads this file. Body below is byte-identical to its prior inline home; do not silently drift it out of sync with the script it falls back to. -->
# Dev Team — Step 0-PREFLIGHT-FALLBACK: Original Presence/SF-1/Fire-Election (ERROR-fallback only)

**Parent flow:** `docs/agents/dev-team/flow/main.md` (Step 0-PREFLIGHT § ERROR / malformed-verdict rows)

<!-- jump:preflight-fallback -->
## Step 0-PREFLIGHT-FALLBACK — Original Presence/SF-1/Fire-Election (ERROR-fallback only)

> Reached ONLY on `ERROR` verdict from `scripts/agents-flow/dev-team-tick-preflight.sh` above (or
> when this flow is run manually / pre-WU-2). Kept verbatim below, never deleted — R6/R7/R8
> fallback guarantee, see `docs/handoffs/TOKEN-ECONOMY-TICK-PREFLIGHT.md` § Design decisions.

```
ts          = $(date -u +%Y%m%dT%H%M%SZ)
start_epoch = $(date +%s)
ts_human    = $(date "+%Y-%m-%d %H:%M:%S %Z")   # local wall-clock for readability
send_telegram(channel="work", message="[dev-team] cron START — actual fire {ts_human} ({ts})")
# Self-arm detect→plan loop (idempotent — skill Step 1 CronList guard makes this a no-op once armed)
→ skill: .claude/skills/cron-detect-loop/SKILL.md
# Guarantees system-auditor Tier-1/2/3 + dev-team crons stay live while this always-on session runs.

# P2-PRESENCE: session-presence self-registration — fires before SF-1 so this session is visible
# even when SF-1 causes an early exit on duplicate-tick guard.
# dispatch-claim SKILL § Step 0a is authoritative — this is the dev-team instantiation.
# Non-adoptable: presence row expiry = liveness GC, NEVER orphan-signal.
presence_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  task_kind:            "session-presence",
  owner_agent:          "dev-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          1800,
  payload:              {
    agent_id:     "dev-team",
    host:         $(hostname),
    started_at:   ts,           # reuse ts set above (UTC ISO string)
    current_task: "preflight"
  }
})
if not presence_result.claimed:
  if presence_result.current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID:
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id: "session-presence:" + $CLAUDE_CODE_SESSION_ID,
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
# Presence result is NEVER a gate — always proceed to SF-1.

# FIX-CRON-REARM-CROSS-SESSION-DEDUP §1.4: renewal heartbeat for the cross-session cron-registration
# marker (.claude/skills/cron-detect-loop/SKILL.md Step 1c). Best-effort, no-op if this session
# doesn't own it (or the marker was never claimed yet) — never a gate. system-auditor/flow/main.md
# Step 0d carries the same addition for cron-registration:detect-loop; multiple flows heartbeating
# the same marker is harmless/idempotent (whichever fires most recently wins).
call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id: "cron-registration:detect-loop",
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})

# SF-1: SINGLE-FLIGHT GUARD — session-level cron overlap prevention (TTL-only, no owner-session binding)
# Survives mcp-server restart: TTL clock continues; orphaned lock expiry is natural. → memory: lock_orphaned_by_rebuild
sf_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "dev-team-cron-singleton",
  task_kind:            "sprint-task",
  owner_agent:          "dev-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,   // REQUIRED — P1-FINAL (TASK_1980)
  ttl_seconds:          5400,          # 90min — 1.5× observed 99th-pct tick duration
  payload:              {"site": "SF-1", "tick": ts}   # structured object — DRAIN-INJECTION-SAFE
})
if not sf_result.claimed:
  log "[dev-team] SF-1 SKIP — session already running (holder: " + sf_result.current_holder.owner_agent + " since " + sf_result.current_holder.claimed_at + ")"
  call_tool(server="vn-market", tool="send_telegram", arguments={channel: "work", message: "[dev-team] cron SKIP — single-flight held by peer (TTL ~" + sf_result.current_holder.expires_in_s + "s)"})
  JUMP TO end   # exit immediately — do NOT run any step

# SF-1 claimed — proceed to fire-time election (Step [3])

# P3-FIRE-ELECTION Step [3] — Cross-session tick dedup (NEW — TASK_1994)
# Fires AFTER SF-1 (session-level guard), BEFORE HEAD.lock guard.
# SF-1 ensures this session is not mid-tick from a prior tick. Fire-election ensures this
# session leads THIS specific tick vs any other session attempting the same tick.
# On election LOSS: release SF-1 (so this session can win SF-1 on next tick) then EXIT.
# On election WIN: proceed with full HEAD.lock guard + dispatch pipeline.
# Spec: addendum §C.2 (ordering), §C.3 (why SF-1 first), §C.4 (deadlock-free).

# compute_tick_boundary for expression "7,37 * * * *" (boundary minutes: 07, 37)
# Largest scheduled minute ≤ current_minute.
CURRENT_MINUTE_FIREELECT=$(date -u +%M)
if [ "$CURRENT_MINUTE_FIREELECT" -ge 37 ]; then
  FIRE_TICK_BOUND="37"
else
  FIRE_TICK_BOUND="07"
fi
FIRE_TICK=$(date -u +"%Y-%m-%dT%H:${FIRE_TICK_BOUND}Z")
# e.g. fire at 14:38Z → FIRE_TICK="2026-06-28T14:37Z"
# e.g. fire at 14:09Z → FIRE_TICK="2026-06-28T14:07Z" (jitter absorbed)

fire_result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "cron:dev-team:" + FIRE_TICK,
  task_kind:            "sprint-task",
  owner_agent:          "dev-team",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          600,
  payload:              {"site": "fire-election", "tick": FIRE_TICK}
})

if not fire_result.claimed:
  fire_peer = fire_result.current_holder.owner_client_session
  if fire_peer == $CLAUDE_CODE_SESSION_ID:
    # Re-entrant: this session already holds this tick's key (restart within same session mid-tick).
    log "[dev-team] fire-election RE-ENTRANT tick=" + FIRE_TICK + " — renewing + proceeding"
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id:              "cron:dev-team:" + FIRE_TICK,
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
    # → proceed (SF-1 is held, fire-election renewed)
  else:
    # Peer session leads this tick — release SF-1 so this session is free for the next tick.
    log "[dev-team] fire-election SKIP tick=" + FIRE_TICK + " — peer=" + fire_peer + " leads; releasing SF-1"
    call_tool(server="vn-market", tool="send_telegram", arguments={
      channel: "work",
      message: "[dev-team] fire-election SKIP tick=" + FIRE_TICK + " (peer session leads)"
    })
    call_tool(server="vn-market", tool="task_release", arguments={
      task_id:              "dev-team-cron-singleton",
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
    JUMP TO end   # EXIT cleanly — no head set, no dispatch, no orphan work
# else: fire_result.claimed == true → won the election → FIRE_TICK is the active tick key
```

**Continue at:** `jump:gcc-preflight` in `docs/agents/dev-team/flow/main.md` (Step 0-PREFLIGHT-CONTINUE — GCC-PREFLIGHT read + HEAD.lock/worktree-GC), same as the natural fallthrough this block had inline.
