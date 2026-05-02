---
agents: ops, developer, system-auditor
trigger: server-restart, health-check, db-maintenance
---

# Issue: WAL Checkpoint Missing on SIGTERM

**Status**: FIXED | **Severity**: Critical

## Root Cause

SQLite WAL mode does not automatically checkpoint on SIGTERM in Docker containers.
The macOS Docker VirtualMachine process tears the SHM on container stop, leaving
the WAL file without a final checkpoint.

## Fix Applied (Sprint 1336)

Named Docker volume replaces bind-mount so the SHM is not torn on container stop.
Explicit `PRAGMA wal_checkpoint(TRUNCATE)` added to graceful shutdown handler.

## Diagnostic Commands

```bash
docker exec mcp-server sqlite3 /data/db.sqlite "PRAGMA wal_checkpoint(TRUNCATE);"
docker logs mcp-server --tail 50 | grep -i checkpoint
```
