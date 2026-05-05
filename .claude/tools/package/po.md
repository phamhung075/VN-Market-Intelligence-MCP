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
| `log_agent_work` | Record task completion or sprint milestone |

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

# Log work start
log_agent_work(agent="developer", task="TASK_NNN", status="in_progress")

# Send update to team
send_telegram(channel="work", message="Sprint XXX kickoff...")
```

## Knowledge Loaded at Start

- `.claude/knowledge/agent-roster.md` — agent capabilities and autonomy
- `.claude/knowledge/mcp-tools.md` — MCP tools reference
- `docs/TASKS.md` — current task backlog
- `project_sprint_XXX_status.md` — recent sprint completion summaries

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | write | task_assignment_and_status |
| market | write | sprint_planning_only |
| bug | read | escalation_detection |

## Pipeline Resume Gate

**Before any agent runs:**
1. Check `docs/pipeline-state.json` status
2. If `in_progress` AND `nextAgent` set AND `updatedAt < 24h` → spawn nextAgent immediately
3. If `in_progress` AND `updatedAt >= 24h` → stale, reset to `idle`
4. If PO initiating: verify TASKS.md not empty OR Telegram reports exist (else ask user for goal)
