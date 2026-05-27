# Skill: dispatch-claim

**Trigger:** agent about to spawn another agent via `Agent(subagent_type=...)` for sprint-task or dashboard-row work

**Related:** `.claude/skills/task-lock/SKILL.md` (inner self-claim — the two tiers coexist)
**Full design:** `docs/architecture-briefs/2026-05-21-task-lock-dispatcher-wrap.md`

---

## Pattern — Outer Dispatcher Wrap

```
# Before Agent(subagent_type=X, prompt="run flow Y task=Z")

outer_claim = call_tool(server="vn-market", tool="task_claim", arguments={
  task_id:     "sprint-task:<task_id>",   // must match inner self-claim key
  task_kind:   "sprint-task",             // or "dashboard-row"
  owner_agent: "<dispatcher-agent>",      // e.g. "dev-team", "pm"
  ttl_seconds: 3600,
  payload:     '{"target_agent":"X","flow":"Y"}'
})

if not outer_claim.claimed:
  log "[dispatcher] task <task_id> already claimed by " + outer_claim.current_holder.owner_session + " — skip"
  send_telegram(work, "[dispatcher] SKIP collision task:<task_id> — held by peer session")
  continue   // do NOT spawn — another router got it first

# Spawn inside try/finally so outer claim is always released
try:
  Agent(subagent_type=X, prompt="run flow Y task=<task_id>")
finally:
  call_tool(server="vn-market", tool="task_release", arguments={
    task_id: "sprint-task:<task_id>"
  })
  // ok=false acceptable (TTL expired or inner agent already released)
```

---

## Why outer wrap — not just inner self-claim

Multi-router race: two Claude router instances pick the same task from a stale signal at the same instant. Both call `Agent(...)`. Each spawned agent self-claims, but **both spawns have already started** — costing API budget and risking conflicting commits.

Outer claim makes the **spawn itself** the atomic operation. No spawn = no cost.

---

## Two-Tier Model (both layers required)

| Tier | Phase | Who holds it | Prevents |
|---|---|---|---|
| Outer wrap | Phase 4 / 1962c | Dispatcher (dev-team, pm) | Duplicate Agent() spawn |
| Inner self-claim | Phase 3 / 1960c | Spawned agent itself | Stolen-lock work continuation |

Do NOT remove either tier. They protect different race windows.

---

## task_id Grammar

Format: `sprint-task:<sprint>-<row>` or `sprint-task:<task-name>`

The outer claim key MUST match the inner self-claim key used by the spawned agent. When outer holds, the inner self-claim inside the spawned agent becomes a no-op confirming ownership — NOT a collision. Mismatch = two independent locks = no protection.

Example:
```
outer: task_id = "sprint-task:1962-a"
inner: task_id = "task:1962-a"   // ← Phase 3 uses "task:" prefix — VERIFY alignment
```

If inner uses a different prefix (`task:` vs `sprint-task:`), treat as independent locks and align to a single canonical prefix per the task-lock protocol.

---

## Reference Commits (Sprint 1962c)

- `docs/agents/dev-team/flow/execute-tier.md` (S1) — `592fe1c4`
- `docs/agents/dev-team/flow/main.md` (S2/S3/S4) — `348443d1`
- `.claude/agents/developer.md` (S5) — `587f4265`
- `.claude/agents/ba.md` (S6) — `7ae26e3b`
- pm fan-out (S7) — `5ecf426c`
- wire-done signal — `cffb654b`
