# TASK 1406b — VPS Health 'idle' CHECK Constraint Regression Tests

## Status: DONE

## What was fixed

The root bug (schema-system.ts CHECK constraint not including 'idle') was already
applied in commit e5d7f498 as part of a prior fix that also added the migration
guard for existing deployed DBs.

This task adds the missing regression test file so the fix is verified and cannot
silently regress.

## Files changed

- `apps/mcp-server/src/__tests__/1406b-vps-health-idle-constraint.test.ts` (new)

## Tests

3 regression tests, all pass:

- REG-1: INSERT with health_status='idle' succeeds (the original bug case)
- REG-2: INSERT with 'healthy', 'unhealthy', 'unreachable' all still succeed
- REG-3: INSERT with invalid value 'offline' is rejected by CHECK constraint

## Schema fix summary (already merged)

`schema-system.ts` — `vps_service_health` table:

```sql
health_status TEXT NOT NULL CHECK(
  health_status IN ('healthy', 'unhealthy', 'unreachable', 'idle')
)
```

Migration guard: reads DDL from `sqlite_master`; if `'idle'` is absent, renames
old table, recreates with updated CHECK, copies rows, drops old table.

No changes to `vpsHealthPoller.ts` or `vpsServiceHealthJob.ts` were needed —
the domain service correctly returns `'idle'`, the schema was the only mismatch.
