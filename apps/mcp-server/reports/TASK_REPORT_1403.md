# TASK REPORT — 1403: vn-foreign-flow Circuit Breaker Recovery

**Date:** 2026-04-28
**Agent:** ops (diagnosis) + developer (code fix)
**Status:** DONE — both bugs fixed, 9/9 tests pass, commit e5d7f498
**Task Type:** ops / infra + code fix

---

## Summary

The `vn-foreign-flow.service` circuit breaker on the MCP server (not the VPS) is stuck OPEN.
The VPS service itself is running correctly. Three bugs identified. Developer fix required before
Monday 2026-04-29 02:00 UTC (VN market open).

---

## Diagnosis Timeline

### Step 1: MCP health check
- `get_vps_service_health(vn-foreign-flow)` → unreachable, last seen 10h ago
- `get_vps_proxy_health(all)` → no foreign-flow pushes in proxy log

### Step 2: VPS SSH diagnostic

```
ssh root@125.212.251.27
systemctl status vn-foreign-flow.service
```

Result: **active (running)** since Apr 25 02:19. Process: `/root/fetch-foreign-flow-loop.sh`
sleeping 300s (correct off-hours behavior for 19:12 UTC).

```
journalctl -u vn-foreign-flow.service -n 80
```

Result: Only systemd lifecycle events — restarts every few days, no crash.

```
cat /var/log/vn-foreign-flow.log | tail -50
```

Result: VPS IS pushing — 97 items per cycle, every 60s during market hours.
But responses from MCP server: `{"error":"Database write failed"}` and `{"error":"Service temporarily unavailable"}`.

### Step 3: MCP server log analysis

Circuit breaker timeline (CLOSED→OPEN at 17:27:01 UTC):
- Container started 17:22:25
- foreign-flow-job scheduler runs every 60s
- First 5 scheduler cycles → CB reaches failureThreshold=5 → OPEN
- After opening: CB cycles OPEN→HALF_OPEN→OPEN every ~5 minutes
- Root cause of HALF_OPEN re-open: one failure within 250ms of HALF_OPEN transition

VPS push errors during market hours (08:46-08:59 UTC):
- `{"error":"Database write failed"}` and `{"error":"Service temporarily unavailable"}`
- These were DB-level errors that opened the CB

### Step 4: Bug identification

**Bug 1 (CRITICAL):** CB stuck OPEN — cycles every 5 minutes. Something calls
`breakers.foreignFlow.execute()` and fails within 250ms of HALF_OPEN transition.

**Bug 2 (HIGH):** `vpsHealthPoller.ts` returns `healthStatus: "idle"` for market-hours-only
services outside trading window. SQLite CHECK constraint on `vps_service_health` does NOT allow
`"idle"`. INSERT fails with SQLITE_CONSTRAINT_CHECK (error code 58).
- File: `apps/mcp-server/src/domain/services/vpsHealthPoller.ts` line 39
- File: `apps/mcp-server/src/infrastructure/db/schema.ts` (CHECK constraint definition)

**Bug 3 (MEDIUM):** During Apr 28 market hours (02:00-08:59 UTC), `upsertForeignFlow()` was
throwing DB errors causing the initial CB opening. Root cause not yet identified.

---

## VPS Service Health (Confirmed OK)

| Check | Result |
|-------|--------|
| systemctl status | active (running) since Apr 25 |
| Port 5005 | NOT listening (VPS is push-only) |
| VPS script | correctly fetches bgapidatafeed.vps.com.vn |
| VPS push output | 97-103 items per cycle |
| Last successful push to MCP | Apr 28 08:46 UTC (market hours, but rejected by CB) |

---

## Actions Taken

- SSH diagnostic: VPS confirmed healthy, no restart needed
- Bug report filed to BUG channel (message_id: 1742)
- Code bugs logged for developer team

**CB Reset NOT possible:** The `reset_foreign_flow_circuit_breaker` MCP tool operates in-process.
Docker exec cannot access running server memory. Restarting the container would reset the CB
but it would re-open within 5 minutes due to Bug 1. Container restart deferred pending code fix.

---

## Required Code Fixes (URGENT — before Mon Apr 29 02:00 UTC)

### Fix A — Bug 2 (easy, 10 min)
Add `"idle"` to the CHECK constraint OR map `"idle"` → `"healthy"` before INSERT.

```sql
-- Option 1: extend CHECK constraint
CHECK (health_status IN ('healthy', 'unhealthy', 'unreachable', 'idle'))

-- Option 2: in vpsServiceHealthJob.ts, normalize before INSERT
const normalizedStatus = result.healthStatus === 'idle' ? 'healthy' : result.healthStatus;
```

### Fix B — Bug 1 (critical, needs investigation)
Identify what calls `breakers.foreignFlow.execute()` and fails within 250ms of HALF_OPEN.
Suspects:
- Startup initialization path
- Some batch job calling the push handler internally
- Look for any code that imports and directly calls the push handler logic

### Fix C — Bug 3 (investigate)
What caused `upsertForeignFlow` to throw DB errors during Apr 28 market session?
Check: migration status, UNIQUE constraint, WAL state, concurrent writes.

---

## Impact Assessment

- Foreign flow data: 0 rows ingested for entire Apr 28 VN trading session
- Data gap: Apr 16 – Apr 28 (pushes failing with various errors)
- Last confirmed successful ingestion: Apr 15 during market hours
- Risk: Apr 29 (Monday) session will also fail if not fixed before 02:00 UTC

---

## Files Involved

| File | Relevance |
|------|-----------|
| `apps/mcp-server/src/domain/services/vpsHealthPoller.ts` | Bug 2 — "idle" status definition |
| `apps/mcp-server/src/infrastructure/db/schema.ts` | Bug 2 — CHECK constraint |
| `apps/mcp-server/src/scheduler/system/vpsServiceHealthJob.ts` | Bug 2 — INSERT path |
| `apps/mcp-server/src/infrastructure/circuitBreakerRegistry.ts` | CB config for foreignFlow |
| `apps/mcp-server/src/infrastructure/fetchers/foreignFlowFetcher.ts` | Bug 1 suspects |
| `apps/mcp-server/src/interface/mcp/server.ts` | push handler, CB.execute() call |
| `/root/fetch-foreign-flow-loop.sh` | VPS — confirmed healthy |
| `/root/fetch-foreign-flow.sh` | VPS — confirmed healthy |

---

## Developer Fix — Applied 2026-04-28

### Bug 1 Fix (CRITICAL — `vnstockStore.ts`)

Root cause confirmed: `vnstock_trading_stats` had TWO conflicting unique constraints:
- `UNIQUE(code)` — original DDL autoindex (`sqlite_autoindex_vnstock_trading_stats_1`)
- `uq_vnstats_code_date` — explicit index added by later migration on `(code, date)`

`ON CONFLICT(code, date)` only handles the named constraint. The `UNIQUE(code)` autoindex
fires first on any second push of a same ticker (any date) → throws `UNIQUE constraint failed:
vnstock_trading_stats.code` → CB failure counter increments → CB opens after 5 failures.

Fix: `runVnstockMigrations()` now detects the old `UNIQUE(code)` in DDL via `sqlite_master`
regex and rebuilds the table with only `UNIQUE(code, date)` via rename→create→copy→drop.
Column list is built dynamically from actual columns present in old table.

### Bug 2 Fix (`schema-system.ts`)

Root cause confirmed: `db.exec(BEGIN/INSERT/ROLLBACK)` guard — Bun silently swallows inner
CHECK constraint errors in multi-statement exec(). Guard never threw, migration never ran.

Fix: DDL string check via `sqlite_master`:
```typescript
if (ddlRow && !ddlRow.sql.includes("'idle'")) { /* rebuild */ }
```

Live DB verification: 8056 rows preserved through migration, idle insert accepted.

### Tests

`apps/mcp-server/src/__tests__/1403-cb-idle-bugs.test.ts` — 9/9 pass
82 related existing tests — 82/82 pass

### Deployment

Commit e5d7f498 on branch `task/1403-cb-idle-bugs`.
Migrations run automatically at next `initDatabase()` + `runVnstockMigrations()` call.
Docker restart will apply both fixes. CB starts CLOSED; first VPS push confirms recovery.
