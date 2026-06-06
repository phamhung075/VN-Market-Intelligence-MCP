# Ops — Docker Flow

**Tools:** `docs/agents/tools/package/ops.md`

> Error boundary + MCP call pattern → skill: `.claude/skills/cowork-error-boundary/SKILL.md`

---

## Input
Container down, restart loop, unhealthy health check, service unreachable

## Output
All containers healthy, `/health` returns 200 | Escalation if compose down fails

---

## FORBIDDEN — Scope-Destroying Compose Patterns

> **SSOT for this rule** — other ops flow files point here; do NOT duplicate.

The following patterns are **FORBIDDEN** in all ops flows:

| Forbidden | Why |
|---|---|
| `docker compose down` (bare) | Destroys ALL project containers — kills peer services not under repair (10:53Z 2026-06-05: 4-peer outage) |
| `docker-compose down` (any form) | Same — legacy alias |
| `up -d` without explicit `<service>` | Mass-starts all 12 compose services → 16GB host kernel-panic risk (`project_host_memory_panic`) |
| `--remove-orphans` | Silently kills services not in current compose scope |
| `--force-recreate` without explicit `<service>` | Same blast radius as bare down/up |

**Intended-running set SSOT:** `docs/data/system-map.json` `.project.infrastructure.docker.host_runtime_set` (6 services; 6 are NOT deployed by design).

**Correct scoped patterns:**
```bash
# Relaunch a destroyed/clean-exit container (no code change):
docker compose up -d --no-deps --no-build <service>

# Rebuild after code change:
docker compose build <service> && docker compose up -d --no-deps <service>

# Inspect only:
docker compose ps
docker logs -f <service> --tail 100
```

## Docker Commands
```bash
docker compose ps
docker logs -f mcp-server --tail 100
# REBUILD mcp-server after code change:
docker compose build mcp-server && docker compose up -d --no-deps mcp-server && sleep 5
# RELAUNCH mcp-server (clean-exit, no code change):
docker compose up -d --no-deps --no-build mcp-server && sleep 5
curl http://localhost:3000/health
```

NEVER: `bun --hot` | `bun --watch` | `nodemon` | `pm2` | manual Bun restarts

## Post-Rebuild Health Verification (MANDATORY)

**Trigger:** any `docker compose up -d --no-deps <svc>`, `docker compose build <svc>`, or container restart — even when scoped to ONE service. (Bare `down`/`up -d`/`--force-recreate` are FORBIDDEN — see § FORBIDDEN above.)

**Why:** rebuilds can collateral-damage neighbour services (port re-binding, network race). c71 incident (2026-05-13): `--force-recreate macro-indicators` for FRED activation knocked mcp-server gateway port 3000; 3 cowork agents + dev-team blocked ~50 min before detection. Single-service success in isolation ≠ fleet healthy.

**Procedure (run after EVERY rebuild, before declaring success):**

Service port list → `jq '.project.microservices[] | {id, port}' docs/data/system-map.json`
Query patterns → `.claude/skills/system-map-query/SKILL.md`

```bash
docker compose ps                                    # all services Up? note any Restarting/Exit
docker port mcp-server 3000                          # gateway port still bound?
# count against host_runtime_set (expect 6 Up): jq '.project.infrastructure.docker.host_runtime_set.services' docs/data/system-map.json
# curl health check each intended service at its port from system-map.json:
jq -r '.project.microservices[] | "curl -s -o /dev/null -w \"%{http_code}\\n\" http://localhost:\(.port)/health  # \(.id)"' docs/data/system-map.json
```

**Pass:** all containers `Up`, port 3000 bound, all `/health` return 200.
**Fail:** any container Restarting/Exit OR any `/health` non-200 OR port unbound →
- `send_telegram(channel="bug")` with collateral-damage signal: `🚨 POST-REBUILD COLLATERAL: <service> healthy but <other-service> degraded after rebuild`
- `docker compose up -d --no-deps --no-build <degraded-service>` → re-verify
- If still failing after 1 restart → escalate (do NOT mark rebuild as successful in signal/notebook)

**Notebook write** → `docs/agent-memory/notebooks/ops.md`

**Doc self-heal** → skill: `.claude/skills/doc-self-heal/SKILL.md`
