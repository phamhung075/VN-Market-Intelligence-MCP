# Task-Lock Protocol

<!-- size-justification: ~80L — full claim/heartbeat/release contract + TTL table + failure modes. All agents implementing task locks load this once. Cannot split: phases reference each other. -->

**Load trigger:** any agent implementing task_claim, task_heartbeat, or task_release (lazy, not startup).
**Source:** architecture brief `docs/architecture-briefs/2026-05-20-task-lock-system.md`

---

## Purpose

Prevent multi-session agent collisions when two Claude Code terminals fire the same task concurrently. The lock coordinates via `coordination.db` (a dedicated SQLite DB separate from market.db).

---

## Three Lock Kinds

| `task_kind` | `task_id` format | Example | Default TTL |
|-------------|-----------------|---------|-------------|
| `cowork-slot` | `cowork-slot:<slot_id>:<nominal_tick>` | `cowork-slot:news-scout-pre-market:20260520T140000Z` | 900s (15 min) |
| `sprint-task` | `task:<task_id>` | `task:1954b` | 3600s (1h) |
| `dashboard-row` | `dash:<recipient>:<row_id>` | `dash:po:1954-A-29-1` | 1800s (30 min) |

---

## Claim Grammar

```
BEFORE starting exclusive work:

result = task_claim(
  task_id:     "<kind>:<id>",
  task_kind:   "cowork-slot" | "sprint-task" | "dashboard-row",
  owner_agent: "<your-agent-name>",
  ttl_seconds: <see TTL table above>,
  payload:     JSON({...context})   // optional
)

if result.claimed = false:
  log: "SKIP <task_id> — held by " + result.current_holder.owner_agent
  send_telegram(channel=work, "SKIP <task_id> — held by session " + result.current_holder.owner_session[0:8])
  → abort this task, move to next

if result.claimed = true:
  → proceed with work
  → call task_heartbeat every 5 min (see below)
  → call task_release on completion (see below)
```

---

## Heartbeat Cadence

Heartbeat every **5 minutes** while task is in-flight. Missing heartbeats after `ttl_seconds` allow the next claimer to steal the lock (crash recovery).

```
Every 5 minutes of active work:

hb = task_heartbeat(task_id: "<your-task-id>")

if hb.ok = false:
  // Lock was stolen — another session took over (crash recovery)
  send_telegram(channel=bug, "Lock stolen on <task_id> mid-execution. Committing partial state. Aborting.")
  → commit safe partial state (idempotent writes only)
  → EXIT immediately (do not fight the steal)
```

---

## Release Semantics

```
On task completion (normal path):

task_release(task_id: "<your-task-id>")
→ result.ok = true: lock released, row deleted
→ result.ok = false: already expired/stolen (not an error — log at DEBUG level only)
```

Always call `task_release` in the completion path. If the agent crashes, TTL expiry is the fallback — no manual cleanup needed.

---

## Failure Modes (brief §8)

| Mode | Symptom | Response |
|------|---------|---------|
| **F1: heartbeat fails** (DB locked) | 3x retry: 1s, 2s, 4s backoff. All fail → BUG telegram. | Continue work (duplicate risk is acceptable). Do NOT abort. |
| **F2: lock stolen mid-task** | heartbeat returns ok=false | Commit idempotent partial state → BUG telegram → EXIT |
| **F3: coordination.db corrupt** | task_claim returns db_unavailable error | Log BUG, return claimed=false for all claims. Agents run without collision protection — duplicate work is degraded mode, not data loss. |
| **F5: Phase 1 not deployed** | tool-not-found error | Same as F3: agents log BUG and continue. |

---

## TTL Reference

| Agent / kind | Recommended TTL | Rationale |
|--------------|----------------|-----------|
| cowork-slot (any cowork agent) | 900s | One 15-min scheduler cycle |
| sprint-task (dev-* agents) | 3600s | 1h per user request |
| dashboard-row (dev-team drain) | 1800s | 30 min: drain + PO triage cycle |

---

## Phase Availability

| Phase | What ships | Status |
|-------|-----------|--------|
| Phase 1 | DB + 4 MCP tools (`task_claim`, `task_heartbeat`, `task_release`, `task_list_held`) | SHIPPED (2026-05-20) |
| Phase 2 | cowork-team slot locking (main.md Step 4.6) | Pending sprint task |
| Phase 3 | dev-team drain + sprint-task locking | Pending sprint task |

Agents calling these tools in Phases 2/3 MUST load this protocol doc first.
Skill shortcut: `.claude/skills/task-lock/SKILL.md`
