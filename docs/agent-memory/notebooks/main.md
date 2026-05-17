# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-17T04:24Z (c151 — Docker CLI still hung, all blocked F1 USER)

## c151 (2026-05-17T04:07Z → 2026-05-17T04:24Z, ~17min)

| Step | Action | Result |
|------|--------|--------|
| 0 PREFLIGHT | HEAD.lock (1833s, 0B, no pid) | Removed |
| 0a drain-signals | 3 signal files | All 1928a DNS dup, DB + moved to processed/ |
| 0b pipeline-resume | idle, c150 complete | Fall through |
| Docker CLI probe | `docker ps` timeout 8s | STILL_HUNG — virtiofs deadlock persists |
| Session gate | All tasks blocked on Docker CLI | Idle |

### c151 key state

| Item | State |
|------|-------|
| 1928a (mcp-gateway DNS) | 🔴 F1 USER — alert-commander 6th consecutive block |
| 1929a (alerts table corrupt) | 🔴 HIGH — blocked on Docker CLI |
| 1927a (PMI rebuild) | ⚠️ Code committed, not deployed — blocked |
| 1922i (alert_engine_records) | 🔴 ESCALATED — can't verify without Docker exec |
| Docker CLI | 🔴 Hung since c147 — virtiofs socket deadlock |
| MCP server port 3000 | ✅ 141 tools, uptime ~4.8h |
| Zone-scan Sunday | ⏳ Started 03:00-05:00 UTC — separate Claude sessions |

### c152 carry-forward

Same as c150/c151 — all blocked on F1 USER Docker Desktop restart:
```
pkill -9 Docker && open -a Docker
```
After restart (4 items in order):
1. `docker-compose up -d --build macro-indicators mcp-server`
2. Fix alerts table: DROP alerts/alert_mutes/custom_alert_rules/price_alerts → `docker restart mcp-server`
3. `docker exec alert-engine sqlite3 /app/data/alert_engine.db "SELECT COUNT(*) FROM alert_engine_records"`
4. Find mcp-gateway launch config → add extra_hosts: host-gateway
