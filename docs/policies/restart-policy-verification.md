> Parent: [./restart-policy.md](./restart-policy.md)

# Restart Policy — Verification

Health checks and verification steps after restart.

## Docker-Compose Health Checks

### Verify All Services Running

```bash
docker-compose ps
# Expected: all services showing "Up ... (healthy)"
# Live service count: jq '.project.microservices | length' docs/data/system-map.json
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

## QA Validation Checklist

After code merge and restart:

1. **Services healthy:** `docker-compose ps` — all services showing "Up ... (healthy)"

2. **Health endpoint:** `curl -s http://localhost:3000/health` — returns `{"status":"ok","tools":<N>,"jobs":<M>}`
   - Current tool/job counts in `docs/data/project-stats.json`

3. **No startup errors:** `docker-compose logs mcp-server --tail 30` — no crash, no startup errors

4. **Recent data ingestion:** `sqlite3 /path/to/data/market.db "SELECT COUNT(*) FROM market_prices WHERE updated_at > datetime('now', '-5 minutes');"` — returns >0 rows

If health endpoint fails or tool count drops → diagnose from logs before marking sprint done.
