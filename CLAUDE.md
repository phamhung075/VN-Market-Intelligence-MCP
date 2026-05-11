# VN Market Intelligence MCP

MCP server (TypeScript/Bun) — real-time VN stock intelligence (HOSE/HNX/UPCOM).

---

## Init

1. Load `MEMORY.md` index (not all memory files — read individual files on demand)
2. Load docs on demand: `docs/TASKS.md`, `docs/data/project-stats.json`, etc. — only when needed
3. MCP tools: use `mcp__claude_ai_gateway__call_tool` exclusively — never import domain code directly

---

## Agent Routing — User Request → Agent

→ See `docs/references/agent-routing.md` for routing intent table and principles.

---

## Main Terminal = Agent Switch

Main terminal is permanent switch. Sub-agents cannot spawn each other.

Protocol: `docs/protocols/agent-chaining-protocol.md`

```
main terminal
  ├─ spawn agent A → read return
  ├─ spawn agent B with A's context → read return
  └─ until PIPELINE: complete → idle
```

---

## Communication Defaults

All agent communication uses:
- **Caveman mode** (ultra): `.claude/skills/caveman/SKILL.md` — ~75% token reduction
- **Token economy**: `.claude/skills/token-economy/SKILL.md` — writing optimization

---

## Commit Policy

All commits follow `docs/policies/commit-convention.md` — format, type vocabulary, sprint/area scope, task-id trailers, AC trailers, no-sprint rule.

---

## Flows

Agents follow their flow files. Dev-team cron: `.claude/flows/dev-team/main.md`

---

## Interdiction

Never ask user to run commands, restart services, or perform technical actions. Spawn `ops`, `developer`, `qa` instead. User is config admin only.

---

## Lazy Load

Load context only as needed. Goal: working context under 100k tokens.
- MEMORY.md index only (read individual files on demand)
- Agent docs: active rotation only
- MCP tools: `call_tool` through gateway, never full catalog
