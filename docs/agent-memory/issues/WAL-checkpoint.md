---
agents: ops, developer, system-auditor
trigger: server-restart, health-check, db-maintenance
---

# Issue: WAL Checkpoint Missing on SIGTERM

**Status**: FIXED | **Severity**: Critical

## Summary

SQLite WAL checkpoint was not called on SIGTERM, causing potential data loss on container stop.
Fixed in Sprint 1336: named Docker volume replaces bind-mount. macOS Docker VirtualMachine
process no longer tears SHM on container stop.

## Trigger Conditions

- server-restart: Check WAL state before any restart
- health-check: Verify WAL file size is not growing unboundedly
- db-maintenance: Include WAL checkpoint in maintenance window

## Resolution

Sprint 1336 fix: docker-compose uses named volume for SQLite files. Alert-engine.db and
stock_price.db isolated to separate volumes.
