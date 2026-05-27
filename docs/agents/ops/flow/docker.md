# Ops — Docker Flow

**Tools:** `docs/agents/tools/package/ops.md`

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

## Post-Rebuild Health Verification (MANDATORY)

**Trigger:** any `--force-recreate`, `docker-compose up -d`, `docker-compose down`+`up`, single-service rebuild, or container restart — even when scoped to ONE service.

**Why:** rebuilds can collateral-damage neighbour services (port re-binding, network race). c71 incident (2026-05-13): `--force-recreate macro-indicators` for FRED activation knocked mcp-server gateway port 3000; 3 cowork agents + dev-team blocked ~50 min before detection. Single-service success in isolation ≠ fleet healthy.

**Procedure (run after EVERY rebuild, before declaring success):**

Service port list → `jq '.project.microservices[] | {id, port}' docs/data/system-map.json`
Query patterns → `.claude/skills/system-map-query/SKILL.md`

```bash
docker-compose ps                                    # all services Up? note any Restarting/Exit
docker port mcp-server 3000                          # gateway port still bound?
# curl health check each service at its port from system-map.json:
jq -r '.project.microservices[] | "curl -s -o /dev/null -w \"%{http_code}\\n\" http://localhost:\(.port)/health  # \(.id)"' docs/data/system-map.json
```

**Pass:** all containers `Up`, port 3000 bound, all `/health` return 200.
**Fail:** any container Restarting/Exit OR any `/health` non-200 OR port unbound →
- `send_telegram(channel="bug")` with collateral-damage signal: `🚨 POST-REBUILD COLLATERAL: <service> healthy but <other-service> degraded after rebuild`
- `docker-compose restart <degraded-service>` → re-verify
- If still failing after 1 restart → escalate (do NOT mark rebuild as successful in signal/notebook)

**Notebook write** → `docs/agent-memory/notebooks/ops.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
