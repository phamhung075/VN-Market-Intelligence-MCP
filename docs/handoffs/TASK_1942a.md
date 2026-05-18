---
sprint: 1942
branch: task/1942a-startup-backfill-probe
size: S
zone: apps/mcp-server/
depends_on: []
blocks: [1942b]
---

# Handoff: TASK_1942a — Startup Backfill Probe for vnstock Fundamentals

**Task ID:** 1942a-startup-backfill-probe
**Sprint:** 1942
**Status:** Ready-for-Dev
**Owner:** dev-mcp-server
**DDD Zone:** `apps/mcp-server/` — interface/scheduler layer

---

## TLDR

Add a one-time startup probe to `startScheduler.ts` that detects an empty/stale `vnstock_financials` database after Docker restart and fires `runVnstockFundamentalsJob()` after a 90-second delay. Guard condition: `COUNT(DISTINCT code WHERE data_type='financials') < 10` OR last fetch > 7 days old. No new files, no new cron entries.

---

## [PM] Planning Context

### Zone
**`apps/mcp-server/`** — single file modification in the interface/scheduler layer.

### Acceptance Criteria

| ID | Criterion | Verifiable via |
|----|-----------|---|
| AC-1 | Server starts within normal time window — startup probe adds zero synchronous latency | Startup log timestamp diff |
| AC-2 | Probe does NOT fire when `vnstock_fetch_log` has ≥10 DISTINCT `code` values WHERE `data_type = 'financials'` AND last entry < 7 days old | Unit test: mock DB with 15 fresh entries → assert `runVnstockFundamentalsJob` NOT called |
| AC-3 | Probe fires when `COUNT(DISTINCT code WHERE data_type='financials') < 10` | Unit test: mock DB with 5 entries → assert job called once |
| AC-4 | Probe fires when last `financials` fetch is > 7 days ago regardless of count | Unit test: mock DB with 20 entries all dated 8 days ago → assert job called |
| AC-5 | Probe fires after 90-second delay (not immediately) | Unit test: stub `setTimeout`, assert delay arg = 90000 |
| AC-6 | Probe error (DB query throws) is caught — server does not crash | Unit test: mock `getDb()` to throw → assert no unhandled rejection, error logged |
| AC-7 | `_isFundamentalsRunning` guard respected — probe does NOT pass `_resetRunningState: true` | Code review: no `_resetRunningState` in probe block |
| AC-8 | After cold Docker restart + ~10 min: `vnstock_financials` has ≥20 DISTINCT `code` rows | Integration: `SELECT COUNT(DISTINCT code) FROM vnstock_financials` |
| AC-9 | After cold Docker restart + ~10 min: `vnstock_balance_sheet` has ≥20 DISTINCT `code` rows | Integration: same query on `vnstock_balance_sheet` |
| AC-10 | After cold Docker restart + ~10 min: `vnstock_cash_flow` has ≥20 DISTINCT `code` rows | Integration: same query on `vnstock_cash_flow` |
| AC-11 | Monday cron + startup probe overlap does NOT double-fetch or corrupt data | Integration: trigger both within 1 min → verify exactly one completes |

### Files to Read First

- `apps/mcp-server/src/scheduler/startScheduler.ts` — existing file, lines 608–637 (EFFR backfill IIFE pattern to copy)
- `apps/mcp-server/src/scheduler/financial-reports/vnstockFundamentalsJob.ts` — `runVnstockFundamentalsJob()` function signature
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — `vnstock_fetch_log` table definition
- `docs/architecture-briefs/2026-05-18-watchlist-fundamentals-cadence.md` — architect brief (full context)

### Files to Create

None. Single-file task.

### Files to Modify

| File | Lines | Purpose |
|------|-------|---------|
| `apps/mcp-server/src/scheduler/startScheduler.ts` | After `startScheduler()` function def, ~50 lines added | Startup IIFE probe with setTimeout(90s), cold DB guard, log output |

### Dependencies

- None. Task is independent; blocks TASK_1942b until this probe is live (to guarantee vnstock tables are populated for fallback testing).

### Knowledge Needed

- `docs/policies/dev-standards.md` — naming, error handling, logging conventions
- `docs/protocols/fail-loud-protocol.md` — escalation rules
- `docs/handoffs/1942a-ba-spec.md` — full BA spec (7 FRs, 4 NFRs, 6 edge cases, 11 ACs)
- DDD microservices pattern: interface → application → infrastructure layers

---

## Implementation Notes from BA Spec

### Guard Logic (FR-2)

Query `vnstock_fetch_log` for DISTINCT `code` WHERE `data_type = 'financials'`:

```sql
SELECT COUNT(DISTINCT code) FROM vnstock_fetch_log WHERE data_type = 'financials'
```

- If count < 10 → fire (cold DB)
- If last entry is > 7 days old → fire (stale data)
- Otherwise → skip

### Pattern (FR-1)

Copy the EFFR backfill IIFE from `startScheduler.ts` lines 608–637:

```typescript
void (async () => {
  try {
    // Guard query
    // Log output
    // setTimeout(90000, () => {
    //   runVnstockFundamentalsJob()
    // })
  } catch (err) {
    // Log error, do not re-throw
  }
})();
```

- Wrapped in `void` IIFE — fire-and-forget
- Internal `setTimeout` of 90 seconds
- All errors caught and logged (no uncaught promise rejection)
- Server starts immediately; probe runs in background

### Log Messages (FR-5)

| Event | Level | Message |
|-------|-------|---------|
| Cold DB detected | INFO | `[vnstock-startup] cold DB detected (N distinct financials entries < 10 threshold) — scheduling sweep in 90s` |
| Stale data detected | INFO | `[vnstock-startup] stale data detected (last fetch > 7 days) — scheduling sweep in 90s` |
| DB warm (skip) | INFO | `[vnstock-startup] DB warm (N distinct financials entries ≥ 10, age < 7d) — skipping startup sweep` |
| Sweep fired | INFO | `[vnstock-startup] firing runVnstockFundamentalsJob after 90s delay` |
| Error | ERROR | `[vnstock-startup] startup probe error: <error message>` |

### Error Handling (FR-6)

- DB query failure → catch, log at WARN, fire job anyway (safe: job is idempotent)
- `vnstock_fetch_log` table missing → catch, fire anyway
- Job throws → already caught inside job's own try/catch

### Idempotency (FR-4)

The existing `_isFundamentalsRunning` flag in `vnstockFundamentalsJob.ts` prevents double-stack. Do NOT add a second guard in the probe. Do NOT pass `_resetRunningState: true`.

### Edge Cases

- EC-1 — Docker restart mid-sweep: OK, tickers already fetched have fresh `vnstock_fetch_log` entries
- EC-2 — Monday cron fires while probe running: `_isFundamentalsRunning` guard absorbs conflict
- EC-3 — `startScheduler()` called twice: `_isFundamentalsRunning` guard absorbs second call
- EC-4 — `vnstock_fetch_log` table missing on first boot: catch, fire anyway
- EC-5 — VEA/UPCOM tickers with no API coverage: handled inside `runVnstockFundamentalsJob()`, not probe responsibility
- EC-6 — Vietnamese data quirks (tỷ đồng, quarterly gaps): handled by existing `syncVnstockData()`

---

## Success Criteria (Integration Test)

After a cold Docker restart:

1. Server starts within normal time window (no blocking in startup logs)
2. Startup logs show `[vnstock-startup]` entries (cold DB detected OR skip message)
3. If cold DB detected, 90-second delay fires the job
4. After ~10 minutes, `SELECT COUNT(DISTINCT code) FROM vnstock_financials` returns ≥20
5. After ~10 minutes, same query on `vnstock_balance_sheet` returns ≥20
6. After ~10 minutes, same query on `vnstock_cash_flow` returns ≥20
7. Monday cron can overlap with probe without data loss

---

## Testing

Unit tests required:

- T1: Cold DB (count < 10) → fires job
- T2: Stale data (last fetch > 7 days) → fires job
- T3: Warm DB → skips job
- T4: DB query error → caught, doesn't crash server
- T5: Job error → caught inside job, probe outer catch handles
- T6: Delay is exactly 90000ms

Integration test (manual or E2E):

- Cold Docker restart → wait 90s → verify tables populated with ≥20 tickers

---

## Constraints

- NFR-1: No new files, no new cron entries, no new scheduler files
- NFR-2: Server startup latency = 0 (async timeout, not synchronous)
- NFR-3: API rate limit respected (job internally uses 2500ms inter-call delay)
- NFR-4: Watchlist SSOT = `docs/data/stock-classification.json` (delegated to job)

---

## Not In Scope

- SSOT consolidation (Sprint 1888 series) — probe doesn't change watchlist lookup
- Tuning the 10-ticker or 7-day thresholds (architectural decision, confirmed in ARCH-1942 brief)
- New cron entries or scheduling logic (fire-and-forget IIFE only)
- Domain layer changes (probe is interface/scheduler layer only)

---

## Handoff to Developer

**Ready to implement.** BA spec fully specced, no blockers, no PO decisions needed. Architect brief in `docs/architecture-briefs/2026-05-18-watchlist-fundamentals-cadence.md` confirms all design choices.

Copy the EFFR backfill pattern from lines 608–637 in the same file. Add ~50 lines for the probe logic, guard query, logging, and error handling. Unit tests required (6 tests, all low-complexity mocks).

AC-8 through AC-11 are integration tests (can be verified manually after cold restart or added to an E2E suite).

---

**Task created:** 2026-05-18 | **PM:** Claude (Project Manager) | **Handoff source:** docs/handoffs/1942a-ba-spec.md
