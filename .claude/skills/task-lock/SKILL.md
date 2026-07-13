# Skill: task-lock

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

## Legacy Backward-Compat Fallback — TRANSITIONAL

During the migration rollout window (TASK_1973–1979), existing pre-P1 lock rows have
`owner_client_session = NULL`. The matching ladder in `heartbeatTask` and `releaseTask` falls through:

```
1. If owner_client_session provided → match on it (canonical — USE THIS)
2. Else if owner_agent provided → legacy owner_agent match (un-migrated callers only)
3. Else owner_session (deepest legacy)
```

**TRANSITIONAL NOTE:** Rung 2 (owner_agent fallback) is removed at step 5 (TASK_1980 / P1-FINAL)
once all callers pass `owner_client_session`. Do NOT rely on rung 2 in new code.

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
`mcp__claude_ai_gateway__call_tool`. Dev-*/qa/ba/pm/architect **specialist** sub-agents do NOT
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

## Phase Status (as of 2026-06-28)

- Phase 1 SHIPPED 2026-05-20: coordination.db + 4 MCP tools (task_claim, task_heartbeat, task_release, task_list_held). Commits: 79ac45e9, b3d6ff80.
- Phase 2 SHIPPED 2026-05-20: cowork-slot wiring (cowork-team Step 4.6 slot-locking). Final commit: 9357ac38.
- Phase 3 SHIPPED 2026-05-20: sprint-task + dashboard-row wiring across dev-team flows.
  - 1960c (10 commits: 448eb7f3, 2a099357, 5e7ada82, dd5e5689, f0687912, a68fb93d, 00a0dd1b, 340a8e39, fa950e08, 31c47ea5): 8 flow .md files wired + tool packages updated.
  - 1960d smoke (commit 335dda54): 10/10 PASS (qa-1960d-approved.json).
  - Model 2 (agent-self heartbeat): TTL=3600s for sprint-task, TTL=1800s for dashboard-row. Heartbeat every TTL/3 by the running agent.
  - `orch-state.json .head` relationship: AUGMENT only (task-lock serializes writes; `.head` state preserved).
- Phase 4 SHIPPED 2026-05-20: dispatcher-wrap (outer Agent() claim before spawn, release after spawn returns).
  - 1962c (7 sites, commits 592fe1c4..5ecf426c): S1 execute-tier, S2/S3/S4 main.md, S5 developer, S6 ba, S7 pm wired.
  - 1962d smoke (commit 404f2f8e): 10/10 PASS (multi-router collision prevention validated).
  - Model 1 (dispatcher holds outer claim): owner_agent = dispatcher identity; inner self-claim (Phase 3) kept as-is.
- **P1 (CROSS-SESSION-MULTI-TEAM-ORCH) — IN FLIGHT 2026-06-28:**
  - TASK_1979: rebind ownership from owner_agent → owner_client_session (this file).
  - TASK_1973: owner_client_session column migration SQL.
  - TASK_1974: coordinationStore matching-ladder rebind.
  - All callers updated to pass owner_client_session=$CLAUDE_CODE_SESSION_ID.
  - Legacy owner_agent fallback (rung 2) removed at TASK_1980 / P1-FINAL.
- **P2 (CROSS-SESSION-MULTI-TEAM-ORCH) — IN FLIGHT 2026-06-28:**
  - TASK_1989: session-presence enum live in 7-kind CHECK + task_list_held returns payload.
  - TASK_1990: dispatcher presence self-registration wired into cowork-team + dev-team flows.

---

## Session-Presence Row — P2 (non-adoptable)

**Scope:** Dispatchers only (cowork-team, dev-team). Specialist sub-agents do NOT claim
presence rows — only the outer dispatcher session that holds the gateway tool surface.

### Claim at session startup

```
# At dispatcher startup (Step 0a via dispatch-claim SKILL)
call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  task_kind:            "session-presence",
  owner_agent:          "<dispatcher-role>",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds:          1800,           # 30 min — heartbeat every 600s (TTL/3)
  payload:              {
    agent_id:     "<dispatcher-id>",   # "dev-team" | "cowork-team"
    host:         $(hostname),
    started_at:   $(date -u +"%Y-%m-%dT%H:%M:%SZ"),
    current_task: "dispatch-init"      # advisory; update via release+reclaim on task change
  }
})
```

Full claim pattern (including re-entrant handling) →
`.claude/skills/dispatch-claim/SKILL.md` § Step 0a

### Heartbeat loop — TTL renewal only

```
# Heartbeat every TTL/3 = 600s alongside other lock heartbeats
hb = call_tool(server="vn-market", tool="task_heartbeat", arguments={
  task_id:              "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})
# hb.ok == false → presence row expired (session ran too long without heartbeat)
# → reclaim with task_claim (do NOT treat as fatal; just re-register)
```

**Note:** `task_heartbeat` updates `heartbeat_at` and `expires_at` only — it does NOT update
payload fields. `payload.current_task` is set at claim time and updated via release+reclaim.

### Updating `payload.current_task` on task change (advisory)

When the dispatcher identifies its active work item, optionally update `current_task`:

```
# Release + immediately reclaim with updated current_task
# Safe: task_id is session-unique — no peer can steal it in the race window
call_tool(server="vn-market", tool="task_release", arguments={
  task_id: "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  owner_client_session: $CLAUDE_CODE_SESSION_ID
})
call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:   "session-presence:" + $CLAUDE_CODE_SESSION_ID,
  task_kind: "session-presence",
  owner_agent: "<dispatcher-role>",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,
  ttl_seconds: 1800,
  payload: { ..., current_task: "<active-task-id>" }
})
```

This is **optional** — `heartbeat_at` freshness is the authoritative liveness signal.

### Non-Adoptable (P2 invariant — do not break)

`session-presence` is explicitly excluded from `ORPHAN_EMIT_ALLOW_LIST`
(coordinationStore.ts:392). A dead session's presence row **silently GCs** when
`expires_at` passes — no `orphan-signal` is emitted, no adoption probe fires.

This is by design: presence row expiry means "session gone" — NOT "work abandoned."
Only `sprint-task`, `cowork-slot`, and `dashboard-row` generate `orphan-signal` rows.
