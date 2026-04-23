# Issue: Database Corruption — Row ID Ordering Violation

**Status**: ACTIVE | **Severity**: CRITICAL | **Recurrence**: 1x | **Discovered**: 2026-04-23 13:15 VN

---

## What Broke

SQLite database `/data/market.db` failed PRAGMA integrity_check with B-tree row ID ordering violations.

## Symptom

- Date/Time: 2026-04-23 13:15 VN (06:15 UTC)
- Detected via: Automated ops health check
- Manifestation: `PRAGMA integrity_check` returns 40+ errors
- User impact: None yet (queries still work, but corruption risk exists)

## Database Status

```
File: /Users/admin/Documents/.../data/market.db
Size: 49MB (main) + 1.8MB (WAL) + 32KB (SHM)
Tables: 71
Rows affected: 73337–73417 in Tree 1195

Errors:
  • Freelist: 2nd reference to page 9142
  • Tree 1195: Rowid out-of-order violations (40+ instances)
  • Pages: 8763, 8011, 1195 affected
```

## Root Cause (Hypothesis)

1. **Primary hypothesis**: Ungraceful shutdown without WAL checkpoint
   - Evidence: WAL file 1.8M (suggests active writes at shutdown)
   - Correlation: vn-price-fetch.service restarted 12:09:07 VN (6 min before discovery)
   - Known risk: Previous issue WAL-checkpoint.md (#3 recurrence)
   
2. **Secondary**: Concurrent write conflict or partial page write during crash
   - Pattern: Row ID ordering violation specific to Tree 1195
   - Indicates: Incomplete write or transaction rollback failure

3. **Tertiary**: Recent cron job changes (Task 1289f, 12:00-12:15 VN)
   - Risk: New scheduler code may lack proper signal handlers
   - Action: Audit src/infrastructure/scheduler/ for WAL checkpoint on SIGTERM

## Solution (Required)

### Immediate (Stop Data Loss)
1. **Backup corrupt DB**
   ```bash
   cp data/market.db data/market.db.corrupt.2026-04-23
   ```

2. **Attempt recovery**
   ```bash
   sqlite3 data/market.db ".recover" | sqlite3 data/market.db.recovered
   sqlite3 data/market.db.recovered "PRAGMA integrity_check"  # Verify recovery
   ```

3. **Validate recovered DB**
   ```bash
   sqlite3 data/market.db.recovered "SELECT COUNT(*) FROM market_prices"
   # Should match or exceed existing record count
   ```

4. **Swap in recovered DB**
   ```bash
   cp data/market.db.recovered data/market.db
   # Restart server: launchctl kickstart -k gui/$(id -u)/com.vn-market.mcp
   ```

### Short-term (Prevent Recurrence)
1. **Audit signal handlers** (src/infrastructure/scheduler/)
   - [ ] SIGTERM handler calls `await db.checkpoint()`
   - [ ] SIGINT handler calls `await db.checkpoint()`
   - [ ] Comment: `// WAL checkpoint on graceful shutdown`
   - [ ] Verify Task 1289f changes include checkpoint logic

2. **Check WAL checkpoint code** (src/infrastructure/db/checkpoint.ts)
   - [ ] Verify PRAGMA wal_checkpoint(TRUNCATE) is correct
   - [ ] Check for race conditions (concurrent checkpoint + write)
   - [ ] Ensure error handling (what if checkpoint fails?)

3. **Trace cron modifications** (Task 1289f)
   - [ ] Review all new scheduler code additions (12:00-12:15 VN)
   - [ ] Check for missing imports or signal handler overwrites

### Long-term (Monitoring)
1. **Add automated integrity checks**
   - Weekly `PRAGMA integrity_check` job
   - Alert if errors detected
   - Auto-backup before checkpoint

2. **Monitor WAL growth**
   - Alert if WAL file >100MB
   - Investigate incomplete transactions

3. **Document checklist**
   - Before deploying new scheduler code: verify signal handlers present
   - After any launchctl kickstart: run integrity check
   - Regular manual checkpoint (every 3 days)

## Prevention Checklist

Before adding new scheduler code:

- [ ] Verify all signal handlers (SIGTERM, SIGINT, SIGHUP) are present
- [ ] Check that each handler calls `await db.checkpoint()`
- [ ] Add comment with WAL checkpoint reference
- [ ] Test: launchctl kickstart → kill -SIGTERM → verify .db-wal size ~0

Before deployment to VPS:

- [ ] Run local integrity check
- [ ] Verify WAL file <10MB
- [ ] Run manual checkpoint: `sqlite3 data/market.db "PRAGMA wal_checkpoint(TRUNCATE)"`

## How to Test

**Recovery procedure test:**
```bash
# 1. Create backup of current state
cp data/market.db data/market.db.test-backup

# 2. Simulate corruption (if needed, already present)
sqlite3 data/market.db "PRAGMA integrity_check"  # Should show errors

# 3. Run recovery
sqlite3 data/market.db ".recover" | sqlite3 data/market.db.recovered

# 4. Verify recovery succeeded
sqlite3 data/market.db.recovered "PRAGMA integrity_check"  # Should say "ok"
sqlite3 data/market.db.recovered "SELECT COUNT(*) FROM market_prices" # Check row count

# 5. Restore original if needed
cp data/market.db.test-backup data/market.db
```

---

**Related files**:
- `.claude/knowledge/restart-policy.md` (server restart protocol)
- `.claude/knowledge/ops-incident-response.md` (incident playbooks)
- `docs/agent-memory/issues/WAL-checkpoint.md` (previous WAL issue, #4 recurrence)
- `src/infrastructure/db/checkpoint.ts` (WAL checkpoint implementation)
- `src/infrastructure/scheduler/` (signal handlers)
- `docs/agent-memory/sessions/2026-04-23-ops.md` (incident session log)

