# TASK 1329c — WAL Shutdown Settle: 200ms Grace Period

**Sprint:** 1329
**Layer:** infrastructure/db
**Size:** S
**Branch:** `task/1329c-wal-shutdown`
**Parallel with:** 1329a, 1329b

---

## Objective

Add a 200ms `Bun.sleep` settle delay inside `registerShutdownHook()` in `checkpoint.ts` before `process.exit(0)`. This closes the race condition where docker-compose sends SIGTERM, the checkpoint starts, but a concurrent scheduler write is mid-transaction and the WAL page is not fully synced before exit.

---

## Files to Modify

### `apps/mcp-server/src/infrastructure/db/checkpoint.ts`

**Current `registerShutdownHook()` body (lines 83-98):**

```typescript
export function registerShutdownHook(): void {
  const shutdown = (signal: string) => {
    logger.info(`[checkpoint] ${signal} received — running TRUNCATE checkpoint before exit`);
    try {
      const db = getDb();
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      logger.info("[checkpoint] TRUNCATE checkpoint complete — WAL flushed");
    } catch { /* best-effort */ }
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  logger.debug("[checkpoint] shutdown hooks registered");
}
```

**Required change:** The `shutdown` callback must become async and await `Bun.sleep(200)` before `process.exit(0)`. Because `process.on` accepts async callbacks in Bun, no wrapper is needed.

```typescript
export function registerShutdownHook(): void {
  const shutdown = async (signal: string) => {
    logger.info(`[checkpoint] ${signal} received — running TRUNCATE checkpoint before exit`);
    try {
      const db = getDb();
      db.exec("PRAGMA wal_checkpoint(TRUNCATE)");
      logger.info("[checkpoint] TRUNCATE checkpoint complete — WAL flushed");
    } catch { /* best-effort */ }
    await Bun.sleep(200);   // 200ms settle — allow in-flight writes to complete
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT",  () => shutdown("SIGINT"));

  logger.debug("[checkpoint] shutdown hooks registered");
}
```

This is a one-line addition (`await Bun.sleep(200);`) plus making the arrow function `async`. No interface changes, no new imports.

---

## Test File

`apps/mcp-server/src/__tests__/1329a-wal-hardening.test.ts` (shared WAL test file per AC-WAL-1)

Add to the existing describe block:

```typescript
it("registerShutdownHook waits at least 200ms before process.exit", async () => {
  const exitCalls: number[] = [];
  const originalExit = process.exit;
  // @ts-ignore — spy
  process.exit = (code: number) => { exitCalls.push(code); };

  const sleepTimes: number[] = [];
  // Patch Bun.sleep to record call and resolve immediately
  const originalSleep = Bun.sleep;
  // @ts-ignore
  Bun.sleep = (ms: number) => { sleepTimes.push(ms); return Promise.resolve(); };

  registerShutdownHook();
  process.emit("SIGTERM");

  // Allow microtask queue to drain
  await new Promise(r => setTimeout(r, 10));

  expect(sleepTimes).toContain(200);
  expect(exitCalls).toContain(0);

  // Restore
  process.exit = originalExit;
  Bun.sleep = originalSleep;
});
```

**Note:** The test must restore both `process.exit` and `Bun.sleep` after the test. If the test environment does not allow patching `Bun.sleep` at the global level, use the `CheckpointDeps` injection pattern: add an optional `sleep?: (ms: number) => Promise<void>` field to `CheckpointDeps` and pass it into `registerShutdownHook(deps?)`.

---

## DDD Compliance

- Entirely within `infrastructure/db/checkpoint.ts`. No layer boundary touched.
- `Bun.sleep` is a Bun built-in — no new external dependencies (NFR-WAL-3).

---

## Edge Cases

- docker-compose sends SIGTERM to the process. Bun processes async callbacks on SIGTERM. The 200ms delay is well within the docker-compose default stop timeout (10s). No risk of docker force-killing before the checkpoint completes.
- Double SIGTERM (docker sends SIGTERM twice): the second signal fires a second `shutdown()` call. SQLite serializes concurrent `PRAGMA` executions; the second checkpoint is a no-op (`remaining = 0`). Both calls exit with `process.exit(0)` — idempotent.
- `Bun.sleep` during SIGINT (Ctrl+C in local dev): same behaviour. 200ms is imperceptible to the developer.

---

## Commit Format

```
task(1329c): add 200ms settle delay before process.exit in shutdown hook

- registerShutdownHook() shutdown callback becomes async
- await Bun.sleep(200) before process.exit(0)
- closes race: concurrent scheduler write mid-tx during SIGTERM
```
