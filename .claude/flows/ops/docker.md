# Ops — Docker Flow

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
