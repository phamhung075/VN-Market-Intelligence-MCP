# Skill: task-lock

<!-- size-justification: ~180L (down from 283L, TE-T21 2026-08-01). §Session-Presence Row
     replaced with a ~7L pointer to dispatch-claim/SKILL.md § Step 0a — verified that file (not
     CARD.md, which is itself only a summary pointer at SKILL.md) is the fuller/authoritative
     spec before dedup-ing toward it. §Phase Status (shipped-sprint commit-SHA changelog) and
     §Legacy Backward-Compat Fallback (TRANSITIONAL note for a matching-ladder rung confirmed
     removed at TASK_1980/P1-FINAL — verified live in coordinationStore.ts:716,761) deleted;
     both are recoverable from git history / the TASK_1980 handoff doc, not needed inline. -->

**Trigger:** agent implementing task_claim, task_heartbeat, or task_release
**Full protocol:** `docs/protocols/task-lock-protocol.md` (load if implementing locks)
**Session identity scheme:** `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` §2

---

## OWNERSHIP KEY — Authoritative (P1 — TASK_1979)

`owner_client_session = $CLAUDE_CODE_SESSION_ID` is the **sole authoritative key** for ALL
ownership probes: heartbeat, release, force-release, and "is-it-mine?" checks.

`owner_agent` (role string) is retained as a **human-readable label** for logs, dashboards, and
role-scoped filtering. It is **NON-AUTHORITATIVE** for ownership decisions. Two sessions running the
same role (two dev teams, two analysis teams) share `owner_agent` — it cannot distinguish them.

**Hard constraint (always enforce):** Never use `owner_agent` alone to answer "is this lock mine?"
Always key on `owner_client_session`.

---

## Quick Reference

### Claim before exclusive work

```
result = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "task:<id>",            // e.g. "task:TASK_1974"
  task_kind:            "sprint-task",           // or "cowork-slot" | "dashboard-row" | "intent"
  owner_agent:          "<your-agent-name>",     // role label (NON-AUTHORITATIVE)
  owner_client_session: $CLAUDE_CODE_SESSION_ID, // REQUIRED — authoritative key
  ttl_seconds:          3600,                    // 900 cowork-slot · 3600 sprint-task · 1800 dashboard-row
  payload:              '{"slot_id":"..."}' // optional JSON context
})

if result.claimed == true:   PROCEED + heartbeat every TTL/3
if result.claimed == false:  → see "On claimed:false" below
```

### On claimed:false — session-id comparison (NOT heartbeat probe)

```
# NEVER call task_heartbeat on claimed:false to determine ownership.
# That is the deleted self-held-heartbeat anti-pattern (brief §1.2).
# Use owner_client_session comparison instead.

if result.current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID:
  # Re-entrant: own prior lock from this session. Renew + PROCEED.
  call_tool(server="vn-market", tool="task_heartbeat", arguments={
    task_id:              "<id>",
    owner_client_session: $CLAUDE_CODE_SESSION_ID
  })
  PROCEED

else:
  # Peer session holds it — SKIP/DEFER
  log "[<agent>] SKIP task <task_id> — held by peer session " + current_holder.owner_client_session
  send_telegram(channel="work", "[<agent>] SKIP collision — held by peer session")
  SKIP this task
```

### Heartbeat every TTL/3 (mandatory cadence)

```
hb = call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id:              "<id>",
  owner_client_session: $CLAUDE_CODE_SESSION_ID  // required — session UUID
})
if hb.ok == false: lock stolen → commit partial state → BUG telegram → EXIT
```

Cadence rule: heartbeat_cadence ≤ TTL / 3. Missing a beat before `expires_at + 300s` = orphan risk.

### Release on completion

```
call_tool(server="vn-market", tool="task_release", arguments={
  task_id:              "<id>",
  owner_client_session: $CLAUDE_CODE_SESSION_ID  // required — must match claiming session
})
// Returns: {ok:true, released:1} if released; {ok:true, released:0} if wrong owner (clean no-op)
// ok:false is NOT returned for wrong-owner (P1 return-shape change — see brief §4)
```

Releasing the wrong session's lock is **impossible by construction** — the WHERE clause won't match.

### Force-release stale orphan (heartbeat-age-only, not owner_agent)

```
call_tool(server="vn-market", tool="task_force_release_orphan", arguments={
  task_id:                  "<id>",
  owner_client_session:     $CLAUDE_CODE_SESSION_ID,  // must be provided
  orphan_threshold_seconds: 600                       // refuses if heartbeat_age ≤ 120s
})
// A peer may only force-release a lock if it is truly stale (heartbeat_age > threshold)
// AND the holding session is dead. Cannot force-release a live session's lock.
```

### List held locks (debug)

```
call_tool(server="vn-market", tool="task_list_held", arguments={
  kind:    "cowork-slot",  // optional filter
  expired: true            // optional: show only stale locks
})
// Output now includes owner_client_session + payload (P2 extension)
```

---

## On claim-fail: stale-lock takeover check

When `task_claim` returns `claimed:false` and session-id differs, check for stale-lock before
treating as live peer:

```
result = task_claim({task_id, task_kind, owner_agent, owner_client_session, ttl_seconds, payload})

if not result.claimed:
  current = result.current_holder
  now_s = unix epoch seconds

  is_stale = (now_s - current.heartbeat_at) > 300   // heartbeat stale >5 min

  if is_stale AND current.owner_client_session != $CLAUDE_CODE_SESSION_ID:
    log "[<agent>] stale-lock takeover detected for " + task_id + " — awaiting natural TTL expiry"
    send_telegram(channel="work", "[<agent>] takeover pending — TTL expires in " + (current.expires_at - now_s) + "s")
    EXIT cycle (return PIPELINE: blocked, NEXT: idle, reason: stale-lock-takeover)
    // Next cron tick retries; by then TTL expired → stale-steal succeeds
  else:
    // Live peer — do not disturb
    log "[<agent>] SKIP task " + task_id + " — held by live peer session " + current.owner_client_session
    SKIP this task
```

Full design rationale: `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` §3.

---

## Dispatcher-Wrap Pattern (outer claim before Agent() spawn)

→ See `.claude/skills/dispatch-claim/SKILL.md` — prevents duplicate spawn in multi-router race.
Lifted to router scope (Phase 4 / Sprint 1962c → TASK_1977 router lift).

---

## INV-GATEWAY-1 — Lock Ops Require Gateway Access: Dispatcher-Scope Only

**Ruling:** 2026-06-07, WF-3 spike. See `docs/protocols/dev-star-gateway-binding.md`.

`task_claim`, `task_heartbeat`, `task_release`, and `commit-mutex:main` calls all require
`mcp__gateway__call_tool`. Dev-*/qa/ba/pm/architect **specialist** sub-agents do NOT
have this tool in their spawned tool surface (package omission, not an inheritance bug).

**Invariant (enforced):**
- All lock operations for dev-* specialist work are the SOLE responsibility of the outer
  **dispatcher session** (dev-team flow runner or developer team-lead).
- Specialist flows MUST NOT call `task_claim`, `task_release`, or invoke `commit-mutex` skill.
- Specialists write pipeline state via `.head` atomic jq + temp-rename (no MCP needed).
- The dispatcher-wrap `finally` block releases the sprint-task lock after the spawn returns.
- Phase 4 parallel worktree sessions MUST add gateway binding to specialist packages before
  enabling direct lock ops in specialists (gated in WF-3-IMPL).

→ Full ruling and options table: `docs/protocols/dev-star-gateway-binding.md`
→ commit-mutex scope note: `.claude/skills/commit-mutex/SKILL.md` (INV-GATEWAY-1 header)

---

## Session-Presence Row — P2 (non-adoptable)

**Scope:** Dispatchers only (cowork-team, dev-team). Specialist sub-agents do NOT claim
presence rows — only the outer dispatcher session that holds the gateway tool surface.

Claim/heartbeat/`current_task`-update protocol + the non-adoptable invariant (excluded from
`ORPHAN_EMIT_ALLOW_LIST` — expiry means "session gone," never "work abandoned," so it is never
converted to an `orphan-signal`) is the sole SSOT at `.claude/skills/dispatch-claim/SKILL.md`
§ Step 0a — Session-Presence Self-Registration.
