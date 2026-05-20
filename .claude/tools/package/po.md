# Tool Package — Product Owner (PO)

**Location:** `.claude/tools/package/po.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read TASKS.md, sprint backlog, requirement docs |
| Edit | Update sprint status, task assignments |
| Write | Create new sprint docs, requirement documents |
| Glob | Find all active tasks and sprint files |
| Grep | Search for task status, blockers, dependencies |
| Bash | Git operations (branch creation, status checks) |

## MCP Tools (via Gateway)

| Tool | Purpose |
|------|---------|
| `read_telegram_reports` | Read latest Telegram reports from MARKET/WORK/BUG channels |
| `get_agent_work_log` | Retrieve agent activity and completed tasks |
| `send_telegram` | Send sprint updates or task notifications |
| `log_agent_work` | Record task completion or sprint milestone — **two-call pattern required** (see recipe below) |

#### `log_agent_work` — Two-Call Recipe

```
// Call 1 — session START (at top of cycle, before any work)
const startResult = call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "po",
  "status": "running"
})
// startResult → { "id": <number> }
const logId = startResult.id

// ... do cycle work ...

// Call 2 — session END (at bottom of cycle, after all work)
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "po",
  "id": logId,
  "status": "completed",
  "summary": "one-line description of what was done",
  "findings": "optional: tasks dispatched, sprint milestones, etc.",
  "actions": ["optional: list of actions taken"]
})
// Returns → { "ok": true, "id": <number> }
```

**Error path:** if cycle errors, pass `status: "error"` in Call 2 instead of `"completed"`. The `id` from Call 1 is always required for Call 2.

---

## Constraints & Permissions

- **Autonomy:** Can self-initiate sprints without user approval (PO autonomy feedback 2026-04-07)
- **Channel audit:** Read last 10 messages from MARKET/WORK/BUG before sprint planning
- **Task-driven:** Always drive tasks to completion, not half-slice shipment
- **User is config admin only:** Never ask user to execute technical tasks

## Usage

**Sprint planning workflow:**
```bash
# Audit channel reports before planning
read_telegram_reports(channels=["MARKET", "WORK", "BUG"], limit=10)

# Create new sprint
Write: docs/sprints/SPRINT_XXX.md with backlog

# Log work start — Call 1 (returns { id } needed for Call 2 at cycle end)
log_agent_work(agent_name="po", status="running")  # → { "id": <logId> }

# Send update to team
send_telegram(channel="work", message="Sprint XXX kickoff...")
```

## Knowledge Loaded at Start

- `docs/references/agent-roster.md` — agent capabilities and autonomy
- `docs/standards/mcp-tools.md` — MCP tools reference
- `docs/TASKS.md` — current task backlog
- `project_sprint_XXX_status.md` — recent sprint completion summaries

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | write | task_assignment_and_status |
| market | write | sprint_planning_only |
| bug | read | escalation_detection |

## Task-Lock Coordination Tools (Phase 3 — ACTIVE)

Flow-level wiring per `.claude/flows/po/sprint-kickoff.md` + `.claude/flows/po/sprint-signoff.md` (see also `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` § 2 + 4).

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim sprint umbrella lock at kickoff | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew held lock at flow-step boundaries | `task_id` |
| `task_release` | Release on sprint-signoff (owner-session scoped) | `task_id` |

Skill: `.claude/skills/task-lock/SKILL.md` (lazy-load when implementing locks).
Protocol: `docs/protocols/task-lock-protocol.md`.

## Pipeline Resume Gate

**Before any agent runs:**
1. Check `docs/pipeline-state.json` status
2. If `in_progress` AND `nextAgent` set AND `updatedAt < 24h` → spawn nextAgent immediately
3. If `in_progress` AND `updatedAt >= 24h` → stale, reset to `idle`
4. If PO initiating: verify TASKS.md not empty OR Telegram reports exist (else ask user for goal)
