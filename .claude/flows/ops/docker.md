# Ops — Docker Flow

**Tools:** `.claude/tools/package/ops.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

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
