# Task Report: 1406 — vps_service_health 'idle' CHECK constraint regression tests
date: 2026-04-28
outcome: APPROVED

## Test Results
- Unit tests (1406b): 3 passed / 0 failed
- TypeScript (1406b file): 0 errors
- Pre-existing TSC errors in 1383/1397c/1406a: NOT regressions from this branch

## DDD Compliance: PASS
- Test file uses infrastructure/db/schema.js via public initDatabase/closeDb/getDb API only
- No domain layer violations introduced

## Security: PASS
- No hardcoded credentials
- No process.env usage
- Parameterized SQL in test helper insertHealthRow()

## Coverage
- REG-1: INSERT with health_status='idle' succeeds (the bug case — off-market-hours poll)
- REG-2: INSERT with healthy/unhealthy/unreachable all accepted
- REG-3: INSERT with invalid value 'offline' rejected by CHECK constraint

## Schema Fix (pre-existing in this branch)
- schema-system.ts line 371: CHECK(health_status IN ('healthy','unhealthy','unreachable','idle'))
- Migration guard present: DROP + re-CREATE table if old constraint detected on existing deployments

## Merge Status
Merged to main via: chore(1406): QA sign-off — vps_service_health 'idle' constraint regression tests (3/3 pass)
Branch fix/1406-vps-health-idle deleted.
