> Parent: [./restart-policy.md](./restart-policy.md)

# Restart Policy — Troubleshooting

Diagnostic steps if Docker-Compose fails.

## Service Won't Start

Check logs for root cause:

```bash
docker-compose logs mcp-server --tail 50
# Check for OOM, port conflicts, missing volume mounts
```

## Port Conflict (e.g., 5000 in use)

```bash
lsof -i :5000  # Find what's using port 5000
# May be macOS ControlCenter; docker-compose.yml maps it to 5010
```

Kill the conflicting process or restart Docker Desktop.

## Database Locked

SQLite WAL file may be stale:

```bash
# Remove stale WAL files
rm -f data/market.db-wal data/market.db-shm

# Restart all services
docker-compose down && docker-compose up -d
```

## Memory/CPU Exhausted

Monitor resource usage:

```bash
docker stats  # Monitor resource usage
docker-compose down  # Free up resources
```

Check: Docker Desktop memory limit set to at least 4GB. If running multiple projects, consider 8GB+.

## VPS Data Not Flowing

Check if VPS services are pushing data:

```bash
# SSH to Vinahost VPS
ssh root@$VINAHOST_IP "tail -20 /var/log/vn-price-fetch.log"

# Verify local endpoint receiving
curl http://localhost:3000/health

# Check if data is being written to SQLite
sqlite3 /path/to/data/market.db "SELECT COUNT(*) FROM market_prices WHERE updated_at > datetime('now', '-10 minutes');"
```

If VPS logs show data being pushed but local DB is empty, network routing through VPS proxy is broken.

---

## Migration from launchctl (2026-04-25)

**Old system (deprecated):**
- Monolithic Bun server on macOS via launchctl
- Command: `launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp`

**New system (current):**
- Microservices architecture on Docker
- Command: `docker-compose down && docker-compose up -d`

All code migrated. Old launchctl plist removed from system.
