# Handoff — FIX-ALERT-ORPHAN-CORRELATION

**Task:** FIX-ALERT-ORPHAN-CORRELATION  
**Sprint:** (standalone fix, P1-HIGH)  
**Zone:** apps/mcp-server/  
**Status:** REVIEW  
**Date:** 2026-06-13  
**Author:** dev-mcp-server  

---

## [Developer] Implementation Record

### Root Cause

The C-08 audit query (in `docs/agents/system-auditor/flow/main.md`, Tier-3 table) performs:

```sql
SELECT count(*) FROM alerts a
LEFT JOIN agent_signals s ON a.id = s.id
WHERE s.id IS NULL
  AND a.triggered_at > datetime('now', '-24 hours')
```

`alerts.id` is TEXT (UUID or deterministic string like `"foreign-flow-ACB-2026-06-12"`).  
`agent_signals.id` is INTEGER AUTOINCREMENT (1, 2, 3...).

In SQLite a TEXT UUID never equals an INTEGER — the JOIN always returns NULL, so **every alert in the last 24 h is counted as orphaned regardless of the write path**. The regression from 3 → 103 is simply that daily alert volume grew ~34× (not a write-path regression).

Secondary root cause: `storeAlerts()` and `storeAlertsFromCommander()` in `alertStore.ts` **never wrote any `agent_signals` rows**. So even with the corrected JOIN query, all pre-fix alerts would still be true orphans.

### Drop Point

File: `apps/mcp-server/src/infrastructure/db/alertStore.ts`  
Functions: `storeAlerts()` (line 89) and `storeAlertsFromCommander()` (line 165)  
Both functions had: `INSERT OR IGNORE INTO alerts … VALUES (…)` only. No `agent_signals` write at all.

### Fix Applied

**Commit:** `7cbca67a`  
**Files changed (3):**

1. `apps/mcp-server/src/infrastructure/db/schema-news.ts`
   - Added idempotent `ALTER TABLE agent_signals ADD COLUMN alert_id TEXT` migration
   - Added `CREATE INDEX IF NOT EXISTS idx_agent_signals_alert_id ON agent_signals(alert_id)`

2. `apps/mcp-server/src/infrastructure/db/alertStore.ts`
   - Both `storeAlerts()` and `storeAlertsFromCommander()` now atomically co-write one `verified_decision` `agent_signals` row per alert **inside the same transaction**
   - `from_agent='alert-engine'`, `to_agent='all'`, `signal_type='verified_decision'`, `alert_id=alert.id`
   - Dedup guard: `SELECT 1 FROM agent_signals WHERE alert_id = ? LIMIT 1` before INSERT (idempotent on double-call)
   - Legacy guard: table/column probe (`hasAgentSignalsTable`, `hasAgentSignalsAlertIdColumn`) — graceful skip if absent (AC-7)
   - MACRO alerts: `stock_code=null`; stock alerts: `stock_code=alert.actionCode`

3. `apps/mcp-server/src/__tests__/FIX-ALERT-ORPHAN-CORRELATION.test.ts` (new)
   - 9 tests covering AC-1 through AC-7 + 2 extras
   - All pass: 9 pass / 0 fail

### Required Action for System-Auditor Maintainer (OUTSIDE dev-mcp-server zone)

The C-08 query in `docs/agents/system-auditor/flow/main.md` **must be updated** from:

```sql
ON a.id = s.id
```

to:

```sql
ON a.id = s.alert_id
```

This is a documentation change in `docs/agents/system-auditor/` — outside dev-mcp-server zone. No code change needed on the mcp-server side.

### Known Gap — Scheduler Direct-INSERT Paths

The following scheduler jobs bypass `storeAlerts()` and write directly to `alerts` via raw SQL `INSERT`. Their alerts will **still be C-08 orphans** until migrated to use `storeAlerts()`:

- `apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts`
- `apps/mcp-server/src/scheduler/market-data/foreignFlowAlertJob.ts`
- `apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts`
- (check for `insiderCheckJob.ts` direct SQL INSERT pattern)

These are NOT fixed in this PR. Recommend follow-up task: migrate direct-INSERT alert paths to use `storeAlerts()`.

### Orphan Characterization (pre-fix)

103 orphans as of 2026-06-13 Tier-3 audit. All were structural orphans due to the TEXT vs INTEGER JOIN type mismatch — the C-08 query **cannot** correlate any alert regardless of whether a signal row exists. The 103 count equals the approximate 24-hour alert volume at the time.

### AC Gate Status

| AC | Description | Status |
|----|-------------|--------|
| AC-1 | storeAlerts writes agent_signals row with alert_id | PASS (unit test) |
| AC-2 | storeAlertsFromCommander same | PASS (unit test) |
| AC-3 | signal_type=verified_decision, from_agent=alert-engine, to_agent=all | PASS (unit test) |
| AC-4 | Corrected C-08 query returns 0 orphans for new alerts | PASS (unit test) |
| AC-5 | Idempotent — double storeAlerts produces 1 signal row | PASS (unit test) |
| AC-6 | ALTER TABLE alert_id migration works | PASS (unit test) |
| AC-7 | storeAlerts works even if agent_signals absent | PASS (unit test) |
| Live gate | New alerts each get matching agent_signals row | PENDING — verify post-rebuild |
| Live gate | Orphan 24h delta ~0 across two consecutive Tier-3 audits | PENDING — long gate |

### Container Rebuild Required

The image must be rebuilt to pick up the alertStore.ts / schema-news.ts changes.  
**Router dispatches ops**: `docker compose up -d --build mcp-server` (NEVER down&&up).

### tsc / Test Status

- `bun tsc --noEmit` — clean (0 errors)
- `bun test src/__tests__/FIX-ALERT-ORPHAN-CORRELATION.test.ts` — 9 pass / 0 fail
- Full suite — exit 0 (background run confirmed)
