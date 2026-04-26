# TASK 1329a — WAL Checkpoint: Mode Param + 30min Cron + Backup

**Sprint:** 1329
**Layer:** infrastructure/db + interface/scheduler
**Size:** S
**Branch:** `task/1329a-wal-hardening`
**Blocks:** 1329d (IMF chain cannot start until this merges)
**Parallel with:** 1329b, 1329c (all three WAL tasks are independent)

---

## Objective

Three changes in one task: (1) add a `mode` parameter to `runWalCheckpoint()` so callers can choose FULL vs TRUNCATE, (2) change the periodic cron from 6-hourly to 30-minute with FULL mode during live hours, and (3) add a `backupDatabase()` helper called from the nightly TRUNCATE cron.

---

## Files to Modify

### `apps/mcp-server/src/infrastructure/db/checkpoint.ts`

**Change 1 — mode parameter on `runWalCheckpoint()`**

Current signature:
```
export function runWalCheckpoint(deps?: CheckpointDeps): { walSize: number; checkpointed: number }
```

New signature:
```
export function runWalCheckpoint(
  mode: 'FULL' | 'TRUNCATE' = 'FULL',
  deps?: CheckpointDeps,
): { walSize: number; checkpointed: number }
```

The PRAGMA string must switch on `mode`:
- `mode === 'FULL'`     → `PRAGMA wal_checkpoint(FULL)`
- `mode === 'TRUNCATE'` → `PRAGMA wal_checkpoint(TRUNCATE)`

The existing `remaining > 10000` log branch stays unchanged. The `registerShutdownHook()` internal `db.exec` call stays as `PRAGMA wal_checkpoint(TRUNCATE)` (it does not use the exported function, so no refactor needed there).

**Change 2 — add `backupDatabase()` function**

Add after `runWalCheckpoint`. Keep backup logic in `checkpoint.ts` (single DB infra file per architecture decision — see TECH_1329.md §4).

```typescript
/**
 * Copies market.db → market.db.backup after nightly TRUNCATE checkpoint.
 * Overwrites any existing backup (single-file rotation; purpose = next-day
 * corruption recovery, not full history).
 * Uses Bun.file() copy — no shell spawn.
 *
 * @param dbPath  e.g. 'market.db' or Bun.env.DB_PATH
 */
export async function backupDatabase(dbPath: string, log = logger): Promise<void> {
  const src = Bun.file(dbPath);
  const dst = Bun.file(dbPath + '.backup');
  try {
    await Bun.write(dst, src);
    log.info('[checkpoint] backup written', { src: dbPath, dst: dbPath + '.backup' });
  } catch (err) {
    log.error('[checkpoint] backup failed', { error: err instanceof Error ? err.message : String(err) });
    // Do NOT re-throw — backup failure must not crash the nightly cron
  }
}
```

`dbPath` is obtained at call site from `Bun.env.DB_PATH ?? 'market.db'` (same pattern already used in `schema.ts`).

---

### `apps/mcp-server/src/scheduler/jobs.ts`

**Change 1 — line 105: update `walCheckpoint` cron default**

```
// Before:
walCheckpoint: Bun.env.CRON_WAL_CHECKPOINT ?? '0 */6 * * *',

// After:
walCheckpoint: Bun.env.CRON_WAL_CHECKPOINT ?? '*/30 * * * *',
```

**Change 2 — lines 370-375: update cron handler**

Replace the current flat handler with a mode-aware version:

```typescript
cron.schedule(CRONS.walCheckpoint, async () => {
  await recordJobRun(getDb(), 'walCheckpointJob', async () => {
    const hour = new Date().getUTCHours();
    // Off-hours 03:00-05:00 UTC: TRUNCATE + backup. Live hours: FULL (non-blocking).
    const isOffHours = hour >= 3 && hour < 5;
    const mode = isOffHours ? 'TRUNCATE' : 'FULL';
    const walResult = runWalCheckpoint(mode);
    await walCheckpointAlert(walResult);
    if (isOffHours) {
      await backupDatabase(Bun.env.DB_PATH ?? 'market.db');
    }
  });
})
```

Add `backupDatabase` to the existing import on line 36:
```
import { runWalCheckpoint, registerShutdownHook, backupDatabase } from '../infrastructure/db/checkpoint.js'
```

---

## Test File

`apps/mcp-server/src/__tests__/1329a-wal-hardening.test.ts`

Required assertions (from AC-WAL-1 and AC-WAL-2):
- `runWalCheckpoint('FULL', mockDeps)` executes `PRAGMA wal_checkpoint(FULL)` — spy on `db.query`
- `runWalCheckpoint('TRUNCATE', mockDeps)` executes `PRAGMA wal_checkpoint(TRUNCATE)`
- `runWalCheckpoint(undefined, mockDeps)` (default) uses FULL — backward compat
- `CRONS.walCheckpoint` default value equals `'*/30 * * * *'`
- `backupDatabase(':memory:')` does not throw when source does not exist (Bun.file on missing path returns 0 bytes — handle gracefully)
- `backupDatabase('market.db')` calls `Bun.write` with correct dst path (spy)

Use the `CheckpointDeps` interface already defined at `checkpoint.ts:21` for injectable mocks.

---

## DDD Compliance

- `checkpoint.ts` is `infrastructure/db` — may import `bun:sqlite`, `Bun.file`, `logger`. No domain imports needed.
- `jobs.ts` is `interface/scheduler` — may import from `infrastructure/db` directly (scheduler is the outermost layer).
- `backupDatabase` uses only Bun built-ins + logger — no new external dependencies (NFR-WAL-3).

---

## Edge Cases

- `Bun.file(dbPath + '-wal').size` returns `0` on fresh DB — treat as healthy (no alert). This applies to 1329b, not here, but note that `backupDatabase` on a fresh `:memory:` DB will silently do nothing (Bun.write of 0-byte source is safe).
- FULL mode returns `{ busy: 1, log: N, checkpointed: M }` when readers are active — `remaining = log - checkpointed` may be non-zero; this is expected behaviour, not an error. The existing `remaining > 10000` log branch handles it.
- The `registerShutdownHook()` body does `db.exec("PRAGMA wal_checkpoint(TRUNCATE)")` directly — do NOT refactor to call `runWalCheckpoint()`. Shutdown hook must be synchronous; the exported function's try/catch wrapper adds unnecessary overhead during SIGTERM.

---

## Production Footguns

- Parameterized queries: no SQL string interpolation added — PRAGMA is a fixed string constant, not user input.
- The cron default change from 6h to 30min increases DB write frequency. Verify that `recordJobRun` insert is lightweight (it is — single row insert by task number).

---

## Commit Format

```
task(1329a): WAL checkpoint mode param, 30min cron, nightly backup

- runWalCheckpoint() gains mode: 'FULL' | 'TRUNCATE' = 'FULL'
- CRONS.walCheckpoint default: 0 */6 → */30 * * * *
- Off-hours window (03:00-05:00 UTC) uses TRUNCATE + triggers backup
- backupDatabase() added to checkpoint.ts (Bun.write, single-file rotation)
```
