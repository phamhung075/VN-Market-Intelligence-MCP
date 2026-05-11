# Server Restart Policy

**Load when:** deploy, restart, infrastructure changes, code deploy, post-merge verification.

---

## Only Allowed Restart Command

```bash
cd $PROJECT_ROOT && docker-compose down && docker-compose up -d && sleep 5
```

No exceptions. All 9 microservices restart in lockstep.

---

## Banned Mechanisms

`bun --hot` | `bun --watch` | `nodemon` | `pm2` | `forever` | `node --watch` | any hot/live/fast reload — ALL FORBIDDEN in containers.

Manual launchctl commands — DEPRECATED (old monolithic server was decommissioned 2026-04-25).

---

## Why Docker-Compose Only

1. **Deterministic state** — all 9 services restart clean, no half-loaded modules, no stale closures
2. **Clean SQLite state** — single shared database, circuit breaker registry + WAL checkpoint initialized at startup
3. **Service isolation** — failure in one service doesn't pollute another
4. **Lockstep restart** — data consistency across price fetch, BCTC parser, RAG indexer, etc.
5. **Easy health check** — `docker-compose ps` shows all 9 services' status

---

## Microservices Architecture (Phase 3 — Current)

**9 Docker services** + **Shared SQLite database**:

```
MCP Server (port 3000)          TypeScript/Bun
├─ API Gateway (port 4000)      TypeScript/Bun
├─ Stock Price (port 5000)      TypeScript/Bun
├─ PDF Extractor (port 5001)    Python/FastAPI
├─ RAG Service (port 5002)      Python/FastAPI
├─ Technical Analysis (port 5003) TypeScript/Bun
├─ Macro Indicators (port 5004) TypeScript/Bun
├─ Kinh Dich Service (port 5005) TypeScript/Bun
└─ Alert Engine (port 5006)     TypeScript/Bun

Shared Database: /data/market.db (SQLite)
VPS Data Pipeline: Vinahost VPS → zenmidi.com → docker-compose services
```

---

## How to Apply a Code Change

1. Edit code in `apps/mcp-server/src/` (or relevant service directory)
2. Run tests: `cd apps/mcp-server && bun test` — must pass
3. TypeScript check: `bun tsc --noEmit` — must pass
4. Commit + push to main
5. Restart all services:
   ```bash
   cd $PROJECT_ROOT
   docker-compose down
   docker-compose up -d
   sleep 5
   curl http://localhost:3000/health
   ```
6. Verify response: `{"status":"ok","tools":<N>,"jobs":<M>}` — current counts in `docs/data/project-stats.json`

---

## Docker-Compose Health Checks

### Verify All Services Running

```bash
docker-compose ps
# Expected: 9 services showing "Up ... (healthy)"
```

### Check Individual Service Logs

```bash
# MCP Server logs
docker-compose logs mcp-server -f

# PDF Extractor logs
docker-compose logs pdf-extractor -f

# All services
docker-compose logs -f
```

### Full System Restart

```bash
docker-compose down    # Stop all services gracefully
docker-compose up -d   # Start all services in background
sleep 5                # Wait for health checks to pass
docker-compose ps      # Verify all healthy
```

---

## QA Validation After Code Merge

1. `docker-compose ps` — all 9 services showing "Up ... (healthy)"
2. `curl -s http://localhost:3000/health` — returns `{"status":"ok","tools":<N>,"jobs":<M>}` — current counts in `docs/data/project-stats.json`
3. `docker-compose logs mcp-server --tail 30` — no crash, no startup errors
4. `sqlite3 /path/to/data/market.db "SELECT COUNT(*) FROM market_prices WHERE updated_at > datetime('now', '-5 minutes');"` — recent data ingestion ✓

If health endpoint fails or tool count drops → diagnose from logs before marking sprint done.

---

## If Docker-Compose Fails

1. **Service won't start:**
   ```bash
   docker-compose logs mcp-server --tail 50
   # Check for OOM, port conflicts, missing volume mounts
   ```

2. **Port conflict (e.g., 5000 in use):**
   ```bash
   lsof -i :5000  # Find what's using port 5000
   # May be macOS ControlCenter; docker-compose.yml maps it to 5010
   ```

3. **Database locked:**
   ```bash
   # SQLite WAL file may be stale
   rm -f data/market.db-wal data/market.db-shm
   docker-compose down && docker-compose up -d
   ```

4. **Memory/CPU exhausted:**
   ```bash
   docker stats  # Monitor resource usage
   docker-compose down  # Free up resources
   ```

5. **VPS data not flowing:**
   ```bash
   # Check if VPS services are pushing data
   ssh root@$VINAHOST_IP "tail -20 /var/log/vn-price-fetch.log"
   # Verify local endpoint receiving: curl http://localhost:3000/health
   ```

---

## Migration from launchctl (2026-04-25)

**Old system (deprecated):**
- Monolithic Bun server on macOS via launchctl
- Command: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`

**New system (current):**
- 9-service microservices architecture on Docker
- Command: `docker-compose down && docker-compose up -d`

**All code migrated.** Old launchctl plist removed from system.

---

## Reference

| Item | Value |
|------|-------|
| Restart command | `docker-compose down && docker-compose up -d` |
| Config file | `docker-compose.yml` |
| Database path | `/path/to/project/data/market.db` |
| MCP port | 3000 (internal) |
| Health endpoint | `http://localhost:3000/health` |
| Logs command | `docker-compose logs -f` |
| Status check | `docker-compose ps` |
