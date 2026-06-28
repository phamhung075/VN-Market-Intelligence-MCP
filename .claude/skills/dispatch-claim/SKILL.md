# Skill: dispatch-claim

**Trigger:** router (or any dispatcher) about to spawn an agent for sprint-task, intent, or cowork-slot work

**Related:** `.claude/skills/task-lock/SKILL.md` (inner self-claim — the two tiers coexist)
**Full namespace spec:** `docs/architecture-briefs/2026-06-28-cross-session-multi-team-orchestration.md` §3.1
**Full design (outer wrap origin):** `docs/architecture-briefs/2026-05-21-task-lock-dispatcher-wrap.md`

---

## OWNERSHIP KEY — Authoritative

`owner_client_session = $CLAUDE_CODE_SESSION_ID` is the **sole** authoritative ownership key for
every claim, heartbeat, and release at the router scope. `owner_agent` is a human-readable role
label only (for logs and dashboards); it MUST NOT be used as the ownership discriminator.

Two sessions running the same role (two dev teams, two analysis teams) share `owner_agent`. The
per-session UUID (`CLAUDE_CODE_SESSION_ID`) is the only field that distinguishes them.

If `$CLAUDE_CODE_SESSION_ID` is unset, mint a stable fallback and log a warning:

```bash
if [ -z "$CLAUDE_CODE_SESSION_ID" ]; then
  CLAUDE_CODE_SESSION_ID="host-$(hostname)-pid-$$-ts-$(date +%s)"
  echo "[router-warn] CLAUDE_CODE_SESSION_ID unset, minting fallback: $CLAUDE_CODE_SESSION_ID"
fi
```

Never fall back to `owner_agent` alone.

---

## Canonical `task_id` Namespace (§3.1)

| Scope | Prefix | Period-key rule |
|---|---|---|
| Router user-intent dispatch | `intent:<agent-role>:<intent-key>` | N/A |
| Cron tick (fire-time claim) | `cron:<flow-slug>:<period-key>` | date-range string (`2026-06-23/2026-06-29`), never ISO week label |
| Sprint task (outer dispatcher) | `sprint-task:<task-id>` | must match inner self-claim key exactly |
| Published artifact dedup | `published:<kind>:<period-key>` | same period-key contract as cron |
| Session presence | `session-presence:$CLAUDE_CODE_SESSION_ID` | per-session singleton |

Examples of `intent:` keys:
```
intent:dev-mcp-server:p1-mcp-1          # first migration task
intent:agent-father:p1-af-1             # CLAUDE.md gate
intent:qa:bctc-regression-suite         # QA regression tests
intent:cowork-team:digest-daily         # cowork daily digest intent
```

---

## Pattern — Router-Scope Dispatch Wrap (CLAUDE.md step 2.5)

```
# Step 2.5 — PRE-CLAIM before Agent() spawn (router constitution)
# See: CLAUDE.md §"BEFORE spawning any agent — MANDATORY"

outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "intent:<agent>:<intent-key>",   # canonical namespace
  task_kind:            "intent",
  owner_agent:          "<dispatcher-role>",              # role label, NOT ownership key
  owner_client_session: $CLAUDE_CODE_SESSION_ID,          # REQUIRED — authoritative key
  ttl_seconds:          600,
  payload:              '{"site":"router","intent":"<intent-key>"}'
})

if outer_claim.claimed == true:
  # Exclusively owned. Spawn inside try/finally.
  try:
    Agent(subagent_type=<agent>, prompt="run docs/agents/<agent>/flow/main.md
          coordination_session=$CLAUDE_CODE_SESSION_ID task=<intent-key>")
  finally:
    call_tool(server="vn-market", tool="task_release", arguments={
      task_id:              "intent:<agent>:<intent-key>",
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })

else:
  # claimed:false — compare sessions
  if outer_claim.current_holder.owner_client_session == $CLAUDE_CODE_SESSION_ID:
    # Re-entrant: own prior lock. Heartbeat to renew, then spawn.
    call_tool(server="vn-market", tool="task_heartbeat", arguments={
      task_id:              "intent:<agent>:<intent-key>",
      owner_client_session: $CLAUDE_CODE_SESSION_ID
    })
    # → continue to spawn (same try/finally pattern above)

  else:
    # Peer session holds it — do NOT spawn
    log "[router] PRE-CLAIM collision intent:<agent>:<intent-key> — held by peer session"
    send_telegram(channel="work", "[router] SKIP: intent:<agent>:<intent-key> held by peer session")
    EXIT   # no spawn, no cost
```

---

## Sprint-Task Outer Wrap (unchanged from Phase 4)

For sprint-task dispatch (dev-team, pm fan-out), the same principle applies with `sprint-task:` prefix:

```
outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:              "sprint-task:<task_id>",   # must match inner self-claim key
  task_kind:            "sprint-task",
  owner_agent:          "<dispatcher-agent>",
  owner_client_session: $CLAUDE_CODE_SESSION_ID,   # REQUIRED
  ttl_seconds:          3600,
  payload:              '{"target_agent":"X","flow":"Y"}'
})
```

The outer claim key MUST match the inner self-claim key used by the spawned agent. Mismatch = two
independent locks = no protection. Align on `sprint-task:` prefix everywhere.

---

## Passing `$CLAUDE_CODE_SESSION_ID` to Subagents

**DO:** pass it in the spawn prompt as a coordination parameter:
```
"run docs/agents/dev-team/flow/main.md
 coordination_session=$CLAUDE_CODE_SESSION_ID task=<task_id>"
```

**DO NOT:** echo or log it as a credential. Frame it as an operational coordination parameter in all
SKILL/flow text. A subagent may refuse to echo env vars for security reasons — that posture is
correct and must be preserved. Never instruct subagents to `echo $CLAUDE_CODE_SESSION_ID` or dump it
to logs.

**Inheritance note:** subagents spawned via `Agent()` may inherit `CLAUDE_CODE_SESSION_ID` via env.
Design holds either way: the dispatcher passes it explicitly in the spawn prompt so the subagent
does not need to read it from env.

---

## Two-Tier Model (both layers required)

| Tier | Phase | Who holds it | Prevents |
|---|---|---|---|
| Outer wrap (this SKILL) | Phase 4 / 1962c | Dispatcher (dev-team, pm, router) | Duplicate Agent() spawn |
| Inner self-claim | Phase 3 / 1960c | Spawned agent itself | Stolen-lock work continuation |

Do NOT remove either tier. They protect different race windows.

---

## Reference Commits (Sprint 1962c — outer wrap origin)

- `docs/agents/dev-team/flow/execute-tier.md` (S1) — `592fe1c4`
- `docs/agents/dev-team/flow/main.md` (S2/S3/S4) — `348443d1`
- `.claude/agents/developer.md` (S5) — `587f4265`
- `.claude/agents/ba.md` (S6) — `7ae26e3b`
- pm fan-out (S7) — `5ecf426c`

**LIFTED TO ROUTER SCOPE:** sprint CROSS-SESSION-MULTI-TEAM-ORCH (TASK_1977) —
rebinds from agent-scope `sprint-task:` to router-scope `intent:` namespace; requires
`owner_client_session` on all claims. See brief §3.1.
