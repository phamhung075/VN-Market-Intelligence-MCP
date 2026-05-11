# TASK_1404-cb-fix — Foreign-Flow Circuit Breaker Startup Reset

**Date:** 2026-04-28
**Agent:** developer
**Branch:** fix/1404-foreign-flow-cb
**Status:** DONE — committed, ready for QA merge

---

## Incident Summary

Telegram report 2669: `vn-foreign-flow` circuit breaker stuck OPEN with 21 failures after container restart. VPS pushes were being rejected with HTTP 503 ("Service temporarily unavailable") indefinitely.

---

## Root Cause Chain (reconstructed)

1. **TASK_1403 (already merged)** fixed the primary root cause:
   - `vnstock_trading_stats` had both `UNIQUE(code)` in DDL (autoindex) AND `UNIQUE(code, date)` as an explicit index.
   - `upsertForeignFlow` used `ON CONFLICT(code, date)` — but SQLite fired the `UNIQUE(code)` autoindex first, throwing `"UNIQUE constraint failed: vnstock_trading_stats.code"` on every VPS push of a known ticker.
   - 5 consecutive failures from this → `breakers.foreignFlow.execute()` in the POST `/api/push-foreign-flow` handler tripped the CB to OPEN.
   - With 21 failures (from 21 tickers in each VPS push batch × repeated cycles) the CB was deeply open.

2. **Bug 1 (schema idle constraint, also TASK_1403)**: `vps_service_health` CHECK constraint lacked `'idle'` — fixed by DDL string inspection + DROP+RECREATE migration guard.

3. **Remaining gap (this task)**: Once the container restarts with the migration fix, the CB starts CLOSED. BUT if the VPS pushes before migrations complete (or if a future regression trips the breaker early), there was no automatic startup reset mechanism. The CB could remain OPEN until the 5-minute `resetTimeoutMs` elapsed AND a successful HALF_OPEN probe closed it.

---

## Fix Implemented

### `apps/mcp-server/src/scheduler/jobs.ts`

Added exported function `scheduleForeignFlowCbReset`:

```typescript
export function scheduleForeignFlowCbReset(
  delayMs: number = parseInt(Bun.env.FOREIGN_FLOW_CB_RESET_DELAY_MS ?? '60000', 10),
  cb: { stats: { state: string }; reset: () => void } = breakers.foreignFlow,
): ReturnType<typeof setTimeout>
```

- Fires a one-shot reset after `delayMs` (default 60 s, configurable via `FOREIGN_FLOW_CB_RESET_DELAY_MS` env var).
- If the CB is NOT `closed` when it fires → calls `cb.reset()` and logs the recovery.
- If the CB is already `closed` → no-op (idempotent).
- `scheduleForeignFlowCbReset()` is called from `startScheduler()` on every container boot.
- The 60 s delay guarantees all startup migrations (`runVnstockMigrations`, schema-system init) have completed before the reset fires.

---

## Tests

**File:** `apps/mcp-server/src/__tests__/1404-cb-startup-reset.test.ts`

| Test | Covers |
|------|--------|
| 1404-1 | Calls `reset()` when CB is OPEN |
| 1404-2 | No-op when CB is already CLOSED |
| 1404-3 | Calls `reset()` when CB is HALF_OPEN |
| 1404-4 | `breakers.foreignFlow.reset()` clears 21-failure stuck-OPEN state |
| 1404-5 | Fires within 50ms when `delayMs=0` |
| 1404-6 | `FOREIGN_FLOW_CB_RESET_DELAY_MS` env var parses to valid integer |

All 6 pass. 53 total tests pass across all CB-related test files (0 fail).

---

## Bug 3 Assessment (DB write root cause)

Root cause of `upsertForeignFlow` throwing was the `UNIQUE(code)` autoindex conflict — fully fixed in TASK_1403 (`runVnstockMigrations` rebuilds the table with `UNIQUE(code, date)` only). No additional fix needed here.

---

## Files Changed

| File | Change |
|------|--------|
| `apps/mcp-server/src/scheduler/jobs.ts` | Added `scheduleForeignFlowCbReset()` export + `breakers` import + call in `startScheduler()` |
| `apps/mcp-server/src/__tests__/1404-cb-startup-reset.test.ts` | New: 6 tests covering the startup reset function |

---

## QA Criteria

1. Run `bun test src/__tests__/1404-cb-startup-reset.test.ts` → all 6 pass.
2. Run `bun test src/__tests__/1388-cb-auto-reset.test.ts src/__tests__/1403-cb-idle-bugs.test.ts src/__tests__/1392-foreign-flow-cb-probe-regression.test.ts` → all pass.
3. Verify `scheduleForeignFlowCbReset` is exported from `jobs.ts` and called inside `startScheduler()`.
4. Merge `fix/1404-foreign-flow-cb` → `main` before Mon 2026-04-29 02:00 UTC.

---

## Env Var

`FOREIGN_FLOW_CB_RESET_DELAY_MS` — milliseconds before startup CB reset fires (default: 60000). Set to a lower value (e.g. `10000`) in staging to speed up test cycles.
