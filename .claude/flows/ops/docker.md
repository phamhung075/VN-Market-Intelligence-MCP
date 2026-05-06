# Ops — Docker Flow

**Tools:** `.claude/tools/package/ops.md`

> **MCP call pattern:** Every tool in this flow → `call_tool(server="vn-market", tool="<name>", arguments={...})` via `mcp__claude_ai_gateway__call_tool`.

## Error Boundary

Recovery fails after standard steps → `send_telegram(channel="bug", message="[ops] Docker unrecoverable: {error}")` → EXIT. Do NOT loop or create speculative docs.

---

## Input
Container down, restart loop, unhealthy health check, service unreachable

## Output
All containers healthy, `/health` returns 200 | Escalation if compose down fails

---

## Docker Commands
```bash
docker-compose ps
docker logs -f mcp-server --tail 100
cd $PROJECT_ROOT && docker-compose down && docker-compose up -d && sleep 5
curl http://localhost:3000/health
```

NEVER: `bun --hot` | `bun --watch` | `nodemon` | `pm2` | manual Bun restarts

**Notebook write** → `docs/agent-memory/notebooks/ops.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
