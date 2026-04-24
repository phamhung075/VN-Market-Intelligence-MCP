---
agents: ops, developer, system-auditor
trigger: db-health-check, incident-response, audit
severity: CRITICAL
---

# Issue: Database Corruption — SQLite Stepping Error on Complex Queries

**Status**: ACTIVE | **Severity**: CRITICAL | **Recurrence**: 1x (new 2026-04-24) | **Discovered**: 2026-04-24 16:14 VN

---

## What Broke

SQLite database `/data/market.db` fails with **Error 11: disk image is malformed** when executing GROUP BY aggregation on `system_logs` table.

---

## Symptoms

- **When**: 2026-04-24 16:14 VN during system audit anomaly scan
- **Manifestation**: `SELECT message, COUNT(*) FROM system_logs WHERE level='error' GROUP BY message` → stepping error
- **Simple queries work**: `SELECT COUNT(*) FROM system_logs` → OK (95,136 rows)
- **Complex queries fail**: GROUP BY / aggregate functions trigger incremental stepping failure
- **User impact**: Current impact = audit cannot complete; production queries may start failing if they depend on aggregations

---

## Related Contexts

1. **Previous corruption issue** (2026-04-23): PRAGMA integrity_check found 40+ B-tree row ID violations in Tree 1195. This is a manifestation of the same underlying corruption.
2. **Database state**: 49MB main file, 3.5MB WAL, 64KB SHM
3. **Last access**: 2026-04-24 14:11:31 (vps_push_log last entry = healthy)

---

## Recovery Steps

### Option A: PRAGMA VACUUM (recommended)

```sql
PRAGMA integrity_check;           -- If >40 errors, proceed to VACUUM
PRAGMA page_size = 4096;
VACUUM;                            -- Rebuild entire database (may take 2-5 min)
PRAGMA integrity_check;            -- Verify repair
```

### Option B: Copy + Restore (if VACUUM fails)

```bash
cp data/market.db data/market.db.backup.2026-04-24
# On fresh instance:
sqlite3 data/market.db.fresh < <(sqlite3 data/market.db.backup.2026-04-24 .dump)
# Verify:
sqlite3 data/market.db.fresh "PRAGMA integrity_check;"
```

### Option C: WAL Checkpoint (lightweight)

If corruption is WAL-related (not main file):

```bash
sqlite3 data/market.db "PRAGMA wal_checkpoint(TRUNCATE);"
```

---

## Prevention

1. Add daily WAL checkpoint to maintenance job (already active in dailyMaintenanceJob.ts)
2. Monitor PRAGMA integrity_check output (add to ops watchdog)
3. Set PRAGMA auto_vacuum = FULL to prevent B-tree fragmentation
4. Consider PRAGMA journal_mode = WAL + periodic CHECKPOINT (RESTART) for large workloads

---

## Detection Method

**Audit check G (RAG window) → Escalate to check system_logs aggregation → Detect stepping error**

Add to future audits:

```sql
-- Lightweight corruption check (before complex queries)
SELECT PRAGMA integrity_check LIMIT 1;
-- If returns anything other than 'ok', escalate to ops
```

---

## Next Actions

1. **Immediate** (ops-agent): Run PRAGMA integrity_check → determine repair path
2. **24h** (developer): If VACUUM succeeds, add monitoring to system-auditor
3. **Spike** (architect): Assess if B-tree fragmentation is from unbounded tracked_indicators growth (known issue: 803+ rows per indicator|source)

---

**Related files**:
- docs/agent-memory/issues/database-corruption-2026-04-23.md (B-tree violations, original discovery)
- src/infrastructure/db/checkpoint.ts (WAL checkpoint logic)
- docs/ARCHITECTURE.md § Database Layer (backup strategy)

