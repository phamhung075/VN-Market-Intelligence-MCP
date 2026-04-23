---
agents: ops, developer, system-auditor
trigger: server-restart, health-check, db-maintenance
---

# Issue: WAL Checkpoint Missing on SIGTERM

**Status**: ✅ FIXED | **Severity**: Critical | **Recurrence**: 3x | **Fix commit**: `ff55779`

---

## What broke

SQLite WAL (Write-Ahead Log) file grew unbounded during graceful shutdown, eventually filling disk.

## Symptom

- Server receives SIGTERM/SIGINT
- Checkpoint not called before exit
- `.db-wal` file left on disk, continues growing on next startup
- Disk usage grows 100MB+ per restart cycle

## Root cause

Signal handlers in `src/infrastructure/scheduler/` were not calling `checkpoint()` during graceful shutdown.

## Solution (FIXED in ff55779)

Added checkpoint call in `src/infrastructure/db/checkpoint.ts`:
```typescript
process.on('SIGTERM', async () => {
  await db.checkpoint();  // ← was missing
  process.exit(0);
});
```

Also added daily checkpoint via `src/scheduler/dailyMaintenanceJob.ts`.

## Prevention

✅ **Before adding any new cron job or scheduler:**
1. Check `src/infrastructure/scheduler/` signal handlers
2. Verify SIGTERM/SIGINT both call `await db.checkpoint()`
3. Add comment: `// WAL checkpoint on graceful shutdown`

## How to test

```bash
launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp
kill -SIGTERM $(pgrep -f "bun.*vn-market")
ls -lh *.db-wal  # Should be ~0 bytes or non-existent
```

---

**Related files**:
- `src/infrastructure/db/checkpoint.ts` (WAL management)
- `src/infrastructure/scheduler/` (all signal handlers)
- `.claude/knowledge/restart-policy.md` (server restart protocol)
