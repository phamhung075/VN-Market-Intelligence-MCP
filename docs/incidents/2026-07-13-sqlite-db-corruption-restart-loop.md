# P0 Incident Recovery: SQLite DB Corruption → mcp-server restart-loop (2026-07-13T15:42–17:51Z)

> Migrated from `docs/agent-memory/notebooks/ops.md` (TE-T17 notebook prune, 2026-07-23) — content unchanged from the original notebook entry.

**Incident:** SQLiteError: database disk image is malformed (SQLITE_CORRUPT, errno 11)  
**Duration:** ~129 min (15:42Z—17:51Z incident window; triage+recovery 7 min)  
**Status:** ✓ RESOLVED — Service restored to healthy, data loss quantified

**Root Cause Hypothesis:** Docker virtualization layer corruption (RECURRING CLASS). No code regression (image unchanged 42h, SHA 1c5845d64406 QA-approved). Crash triggered in `reapZombieJobRuns` (cronJobRunStore.ts:177) during bootstrap — an UPDATE on cron_job_runs table hit corrupt pages (107935–107973 across Trees 8772, 57970, 57984, 49348).

Possibly-relevant concurrent activity: dev-team BOUNDED-1 dispatcher picked `HPG-DISCOVER-CONSOLIDATED-PDF` (peer session, 15:29Z) — peer exec-write on live DB during vulnerable window (~15:41–15:44Z). rag-service restarted ~15:14Z (33 min prior, unrelated).

| Phase | Action | Result | Time |
|-------|--------|--------|------|
| **Triage** | docker logs capture, docker inspect, container --restart=no → stop | Crash cycle halted, no peer impact | <1m |
| **Safety-Copy** | Backup corrupt DB + WAL to scratchpad/db-recovery-20260713T1750Z/ | 423M market.db.corrupt + SHM/WAL captured, timestamped | <1m |
| **Integrity Diagnose** | PRAGMA integrity_check on corrupt copy | FAIL: widespread page corruption (107935–107973), not localized | <1m |
| **Backup Recovery** | Found market.db.backup (2026-07-13T04:30Z, 406.3M) in volume | PRAGMA integrity_check = "ok" — backup CLEAN | <1m |
| **Swap & Restart** | Renamed corrupt → market.db.corrupt-20260713T1548Z, restored backup, docker up -d mcp-server | Container up (23s) → HEALTHY ✓ | 2m |
| **Post-Recovery Verify** | Health check (/health=200, status="ok"), get_watchlist=33/33, get_market_snapshot fresh, all 12 services healthy, no collateral | ALL PASS ✓ | <1m |
| **Builder Prune** | docker builder prune -f | 2.5GB cache reclaimed, freed builder resources | <1m |

**Data Loss:**
- Backup from 04:30Z, corruption at ~15:44Z → ~11.2h market data (OHLCV, trading stats) regenerated on next fetch
- daily_ohlcv 2026-07-13 will be refetched via VPS pipeline (next cron cycle)
- cron_job_runs audit trail incomplete for jobs between 04:30–15:44Z (operational telemetry, non-critical)
- Watchlist + fundamental data (trading halts, company info) regenerated via startup backfill
- NO data loss on OHLCV market tables themselves (backup was clean for daily_ohlcv pre-04:30Z)

**Recurring-Class Escalation:** This is the 2nd SQLITE_CORRUPT incident (1st: 2026-04-25, documented in Docker memory). Per standing escalation rule (2+ occurrences → file recurring-bug block), must file durable-fix: **FIX-SQLITE-DOCKER-VIRT-CORRUPTION** (see docs/signals/processed/ for similar blocks).

Evidence snapshot locations:
- Corrupt DB: `/private/tmp/claude-501/...db-recovery-20260713T1750Z/market.db.corrupt` (423M)
- Backup (restored): Live volume `vn-market-intelligence-mcp_market_data:/data/market.db` (406.3M, verified CLEAN)
- Corrupt marker: `/var/lib/docker/volumes/.../market.db.corrupt-20260713T1548Z` (for forensics)

**Decision Journal:** FIX-SQLITE-DOCKER-VIRT-CORRUPTION (pending post-session, per durable-fix protocol)

Zone: `docker vn-market-intelligence-mcp_market_data volume` | Incident ops recovery: 7 min wall-clock

---
