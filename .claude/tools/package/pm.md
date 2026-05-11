# Tool Package — Project Manager (PM)

**Location:** `.claude/tools/package/pm.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read TASKS.md, sprint status, handoff files |
| Edit | Update task status, progress tracking |
| Write | Create sprint summaries, retrospectives |
| Glob | Find all task and sprint documentation |
| Grep | Search task status, blockers, timelines |
| Bash | Git operations, log queries |

## MCP Tools (via Gateway)

| Tool | Purpose |
|------|---------|
| `compare_backtest_runs` | Compare backtest metrics across releases |

## Constraints & Permissions

- **Status tracking:** Monitor sprint progress, identify blockers
- **Handoff routing:** Distribute work to developer, qa, ops agents
- **Escalation detection:** Watch for recurring bugs (≥2 fixes on same module → call Architect)
- **Read-heavy:** Primarily observational reporting

## Usage

**Sprint status workflow:**
```bash
# Read sprint backlog
Read: docs/sprints/SPRINT_XXX.md

# Check task status
Read: docs/TASKS.md

# Compare performance across releases
compare_backtest_runs(run_ids=["v1.0", "v1.1"])

# Write sprint summary
Write: docs/sprints/SPRINT_XXX_summary.md
```

## Knowledge Loaded at Start

- `docs/references/agent-roster.md` — agent routing and responsibilities
- `docs/TASKS.md` — current task backlog
- `.claude/flows/pm/main.md` — PM workflow and escalation rules

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | write | status_updates_only |
| market | read | trend_monitoring |
| bug | read | escalation_tracking |

## Escalation Rules

If same module appears in ≥2 fix commits:
1. Block task from proceeding
2. Call architect agent for root-cause analysis
3. Document finding in task escalation log
4. Resume work after architectural review
