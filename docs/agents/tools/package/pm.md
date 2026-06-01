# Tool Package — Project Manager (PM)

**Location:** `docs/agents/tools/package/pm.md`
**Load when:** agent starts

## File System Tools

| Tool | Purpose |
|------|---------|
| Read | Read `docs/data/orch/orch-state.json .task_board`, sprint status, handoff files |
| Edit | Not for orch-state.json (use Bash+atomic write); update handoff files only |
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
Read + jq: docs/data/orch/orch-state.json .task_board

# Compare performance across releases
compare_backtest_runs(run_ids=["v1.0", "v1.1"])

# Write sprint summary
Write: docs/sprints/SPRINT_XXX_summary.md
```

## Knowledge Loaded at Start

- `docs/references/agent-roster.md` — agent routing and responsibilities
- `docs/data/orch/orch-state.json .task_board` — current task backlog
- `docs/agents/pm/flow/main.md` — PM workflow and escalation rules

## Channel Permissions

| Channel | Access | Rules |
|---------|--------|-------|
| work | write | status_updates_only |
| market | read | trend_monitoring |
| bug | read | escalation_tracking |

## Task-Lock Coordination Tools (Phase 3 — ACTIVE)

Flow-level wiring per `docs/agents/pm/flow/main.md` (see also `docs/architecture-briefs/2026-05-21-task-lock-phase3-devteam.md` § 2 + 4).

| Tool | Purpose | Key Params |
|------|---------|-----------|
| `task_claim` | Claim sprint-task lock (if needed) | `task_id, task_kind, owner_agent, ttl_seconds?, payload?` |
| `task_heartbeat` | Renew umbrella lock at plan-emit (step 3d) and in_progress transition (step 4b) | `task_id` |
| `task_release` | Release on completion (owner-session scoped) | `task_id` |

Skill: `.claude/skills/task-lock/SKILL.md` (lazy-load when implementing locks).
Protocol: `docs/protocols/task-lock-protocol.md`.

## Escalation Rules

If same module appears in ≥2 fix commits:
1. Block task from proceeding
2. Call architect agent for root-cause analysis
3. Document finding in task escalation log
4. Resume work after architectural review
