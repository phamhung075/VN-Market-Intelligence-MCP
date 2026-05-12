# VN Market Intelligence MCP

MCP server (TypeScript/Bun) — real-time VN stock intelligence (HOSE/HNX/UPCOM).

---

## Init

1. Load `MEMORY.md` index (not all memory files — read individual files on demand)
2. Load docs on demand: `docs/TASKS.md`, `docs/data/project-stats.json`, etc. — only when needed
3. MCP tools: use `mcp__claude_ai_gateway__call_tool` exclusively — never import domain code directly

---

## Main Terminal = Router

Main terminal is the router; sub-agents cannot spawn each other.

**Auto-switch** — for any user demand OR cron tick:
1. Match intent → agent via `.claude/skills/dispatch/SKILL.md` (SSOT dispatch table)
2. Spawn target agent with `run .claude/flows/<agent>/main.md` — every agent has a `main.md` dispatcher that picks the right sub-flow
3. Read RETURN block → if `PIPELINE: continue` and `NEXT: <agent>`, spawn the next agent the same way
4. Loop until `PIPELINE: complete` or `blocked` → idle

Cooperation: cowork agents drop `docs/signals/*.json` (dev-team drains at Step 0a); dev-team agents write `docs/pipeline-state.json` + `docs/handoffs/TASK_NNN.md`.

Protocol: `docs/protocols/agent-chaining-protocol.md` · Routing/cooperation SSOT: `.claude/skills/dispatch/SKILL.md`

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
