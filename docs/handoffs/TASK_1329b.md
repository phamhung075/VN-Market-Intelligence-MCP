# TASK 1329b — WAL Size Sentinel: Lower Threshold + Disk Guard

**Sprint:** 1329
**Layer:** interface/scheduler + infrastructure/db
**Size:** S
**Branch:** `task/1329b-wal-sentinel`
**Parallel with:** 1329a, 1329c

---

## Objective

Two independent hardening changes: (1) lower the `WAL_STUCK_THRESHOLD` in `walCheckpointAlert.ts` from 50,000 to 10,000 frames and add a 5,000-frame warning tier; (2) add `checkWalFileSize()` to `checkpoint.ts` that reads the `.db-wal` file size from disk and fires an alert before checkpointing if thresholds are exceeded.

---

## Files to Modify

### `apps/mcp-server/src/scheduler/walCheckpointAlert.ts`

**Change 1 — threshold constants**

Replace:
```typescript
const WAL_STUCK_THRESHOLD = 50_000;
```
With:
```typescript
const WAL_WARN_THRESHOLD  = 5_000;   // ~20 MB — warning
const WAL_STUCK_THRESHOLD = 10_000;  // ~40 MB — critical (incident happened at ~11,000)
```

**Change 2 — two-tier alert logic**

Replace the current single `if (remaining <= WAL_STUCK_THRESHOLD) return;` guard with:

```typescript
const remaining = result.walSize - result.checkpointed;

if (remaining <= WAL_WARN_THRESHOLD) return;

const isCritical = remaining > WAL_STUCK_THRESHOLD;
const prefix = isCritical ? 'WAL CRITICAL' : 'WAL WARNING';
const message = `${prefix}: ${remaining} frames un-flushed`
  + ` (WAL=${result.walSize}, checkpointed=${result.checkpointed})`
  + isCritical ? ' — manual restart may be needed' : ' — monitoring';
```

The `send(message)` call and dynamic-import pattern remain unchanged.

---

### `apps/mcp-server/src/infrastructure/db/checkpoint.ts`

**Add `checkWalFileSize()` function**

Insert after `runWalCheckpoint`. This function is called by the cron handler in `jobs.ts` _before_ running the checkpoint, allowing an alert to fire even when the PRAGMA result shows 0 (e.g. no active checkpoint has run yet but WAL file has grown).

```typescript
/**
 * Checks the .db-wal file size on disk and fires WORK channel alerts at:
 *   > 10 MB (40%) : log error + send alert, then proceed with FULL checkpoint
 *   > 40 MB (CRITICAL): log critical + send alert with severity CRITICAL
 *
 * Returns { bytes, warningFired } — bytes = 0 when WAL file does not exist (fresh DB).
 *
 * Injectable sendWorkFn for unit tests.
 */
export async function checkWalFileSize(
  dbPath: string,
  sendWorkFn?: (msg: string) => Promise<void>,
  log = logger,
): Promise<{ bytes: number; warningFired: boolean }> {
  const walPath = dbPath + '-wal';
  const walFile = Bun.file(walPath);
  const bytes = walFile.size;          // 0 when file absent — safe

  if (bytes === 0) return { bytes: 0, warningFired: false };

  const MB = bytes / (1024 * 1024);
  const WARN_MB  = 10;
  const CRIT_MB  = 40;

  if (MB <= WARN_MB) return { bytes, warningFired: false };

  const isCritical = MB > CRIT_MB;
  const severity = isCritical ? 'CRITICAL' : 'WARNING';
  const msg = `WAL file ${severity}: ${MB.toFixed(1)} MB on disk (${walPath})`
    + (isCritical ? ' — potential corruption risk, restart recommended' : '');

  log.error('[checkpoint] WAL file size alert', { bytes, MB: MB.toFixed(1), severity });

  const send = sendWorkFn ?? (async (m: string) => {
    const { sendTelegramWork } = await import('../notifiers/telegram.js');
    await sendTelegramWork(m, { parseMode: '' });
  });

  try {
    await send(msg);
  } catch (err) {
    log.error('[checkpoint] failed to send WAL file size alert', {
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { bytes, warningFired: true };
}
```

**Note on `Bun.file().size`:** In Bun, `Bun.file(path).size` is synchronous and returns 0 for non-existent files — no try/catch needed.

---

### `apps/mcp-server/src/scheduler/jobs.ts`

Update the cron handler (same block modified by 1329a) to call `checkWalFileSize` before `runWalCheckpoint`. Add import:

```typescript
import { runWalCheckpoint, registerShutdownHook, backupDatabase, checkWalFileSize } from '../infrastructure/db/checkpoint.js'
```

Inside the `recordJobRun` callback, add before `runWalCheckpoint`:
```typescript
await checkWalFileSize(Bun.env.DB_PATH ?? 'market.db');
```

**Coordination with 1329a:** 1329b modifies the same `jobs.ts` handler block as 1329a. These tasks run on parallel branches. Developer must rebase 1329b onto 1329a before merging, or both can be merged in sequence with a trivial conflict resolution (same block, additive changes).

---

## Test File

`apps/mcp-server/src/__tests__/1329a-wal-hardening.test.ts` (shared test file for all three WAL tasks per AC-WAL-1)

Add to the existing describe block:

- `walCheckpointAlert({ walSize: 10001, checkpointed: 0 })` calls `sendWorkFn` with `'WAL CRITICAL'` prefix
- `walCheckpointAlert({ walSize: 6000, checkpointed: 0 })` calls `sendWorkFn` with `'WAL WARNING'` prefix
- `walCheckpointAlert({ walSize: 4999, checkpointed: 0 })` does NOT call `sendWorkFn`
- `checkWalFileSize(':memory:', mockSend)` returns `{ bytes: 0, warningFired: false }` when Bun.file size is 0 (mock `Bun.file`)
- `checkWalFileSize('market.db', mockSend)` with mocked size = 11 MB calls `mockSend` with `'WARNING'`
- `checkWalFileSize('market.db', mockSend)` with mocked size = 45 MB calls `mockSend` with `'CRITICAL'`

For mocking `Bun.file().size`, use a `sendWorkFn` spy and pass a mock `dbPath` pointing to a temp file created with `Bun.write` of known size, or mock at module level per the existing `CheckpointDeps` pattern.

Also verify AC-WAL-3: alert message includes frame count AND file size in MB.

---

## DDD Compliance

- `checkWalFileSize` lives in `infrastructure/db` — correct. Uses `Bun.file` (infrastructure), `logger` (infrastructure), dynamic import of Telegram notifier (infrastructure). No domain imports.
- `walCheckpointAlert.ts` is `interface/scheduler` — threshold constants are configuration, not business logic. Correct placement.

---

## Edge Cases

- WAL file does not exist (fresh DB after `PRAGMA wal_checkpoint(TRUNCATE)` clears it): `Bun.file(path).size === 0` → return early, no alert. Confirmed safe.
- WAL file between 0 and 10 MB: return `{ bytes, warningFired: false }` — no alert. Normal operating range.
- `PRAGMA wal_checkpoint(FULL)` returns `remaining > 0` due to active readers: expected. The disk-size guard fires independently of the PRAGMA result, catching cases where the WAL has grown before any checkpoint runs.
