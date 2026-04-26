# VN Market Intelligence MCP

MCP server (TypeScript/Bun) — real-time VN stock intelligence (HOSE/HNX/UPCOM).

---

## Switch — User Request → Agent

Spawn the matching agent. Never do the work yourself.

| Intent | Spawn |
|--------|-------|
| add / build / improve | `po` |
| bug / broken (infra) | `ops` |
| bug / broken (code) | `developer` |
| analyze stock / news | `market-analyst` |
| brainstorm / explore | `idea-forge` |
| sprint status | `pm` |
| system health / audit | `system-auditor` |
| DRY / hardcoded values | `code-janitor` |
| update cowork agents | `cowork-refactory-expert` |
| organize / cleanup | `claude-manager-helper` |

Agent defines who receives next. Full routing rules → `/dispatch`

---

## Agent Chaining Protocol

**Main terminal = entry spawner only.** Spawn the entry agent, then stop. Never re-orchestrate.

Each agent **must** spawn the next agent directly after completing its work — not just send Telegram.

### Pipeline Map

```
FIX      developer ──► qa ◄──► fixer (max 2 rounds)
SPRINT-S architect ──► pm ──► [developer ∥ developer] ──► qa ◄──► fixer
SPRINT-M ba ──► architect ──► pm ──► [developer ∥ developer] ──► qa ◄──► fixer
SPRINT-L same as M + architect post-merge review
UNBLOCK  {route_to} ──► done
```

### Rules

1. **"Notify X"** anywhere in a flow file = **spawn X agent**, passing task ID + handoff file path
2. **Never terminate** without either spawning next OR sending idle: `send_telegram(work, "Done: NNN [brief]")`
3. **Parallel slots**: `pm` spawns ≤ 2 `developer` agents concurrently for independent tasks
4. **Fixer ceiling**: 2 rounds max → still failing → spawn `architect`, open new task, EXIT lane
5. **Entry agent for user requests** = the Spawn column above; for cron = `po` (full triage)

### Spawn Prompt Template

When spawning the next agent, pass:
```
Task [NNN]. Handoff: docs/handoffs/TASK_NNN.md. [One sentence: what previous agent did and what you must do next.]
```
