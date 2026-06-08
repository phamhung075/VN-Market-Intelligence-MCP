// apps/mcp-server/src/__tests__/1329a-wal-hardening.test.ts
// Task 1329a — WAL checkpoint mode param, 30min cron, nightly backup
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload
import { describe, it, expect, spyOn } from "bun:test";
import type { Database } from "bun:sqlite";
import type { CheckpointDeps } from "../infrastructure/db/checkpoint.js";

// ── helpers ───────────────────────────────────────────────────────────────────

function makeMockDeps(pragmaResult = { busy: 0, log: 5, checkpointed: 5 }): {
  deps: CheckpointDeps;
  queries: string[];
} {
  const queries: string[] = [];
  const mockDb = {
    query: (sql: string) => {
      queries.push(sql);
      return { get: () => pragmaResult };
    },
  } as unknown as Database;

  const deps: CheckpointDeps = {
    getDb: () => mockDb,
    log: { info: () => {}, error: () => {}, debug: () => {} } as never,
  };
  return { deps, queries };
}

// ── runWalCheckpoint ──────────────────────────────────────────────────────────

describe("Task 1329a — runWalCheckpoint mode parameter", () => {
  it("default mode (undefined) uses PRAGMA wal_checkpoint(FULL)", async () => {
    const { runWalCheckpoint } = await import("../infrastructure/db/checkpoint.js");
    const { deps, queries } = makeMockDeps();

    runWalCheckpoint(undefined, deps);

    expect(queries[0]).toBe("PRAGMA wal_checkpoint(FULL)");
  });

  it("mode='FULL' executes PRAGMA wal_checkpoint(FULL)", async () => {
    const { runWalCheckpoint } = await import("../infrastructure/db/checkpoint.js");
    const { deps, queries } = makeMockDeps();

    runWalCheckpoint("FULL", deps);

    expect(queries[0]).toBe("PRAGMA wal_checkpoint(FULL)");
  });

  it("mode='TRUNCATE' executes PRAGMA wal_checkpoint(TRUNCATE)", async () => {
    const { runWalCheckpoint } = await import("../infrastructure/db/checkpoint.js");
    const { deps, queries } = makeMockDeps();

    runWalCheckpoint("TRUNCATE", deps);

    expect(queries[0]).toBe("PRAGMA wal_checkpoint(TRUNCATE)");
  });

  it("returns walSize and checkpointed from DB result", async () => {
    const { runWalCheckpoint } = await import("../infrastructure/db/checkpoint.js");
    const { deps } = makeMockDeps({ busy: 0, log: 42, checkpointed: 40 });

    const result = runWalCheckpoint("FULL", deps);

    expect(result.walSize).toBe(42);
    expect(result.checkpointed).toBe(40);
  });
});

// ── CRONS.walCheckpoint ───────────────────────────────────────────────────────

describe("Task 1329a — CRONS.walCheckpoint default value", () => {
  it("defaults to '*/30 * * * *'", async () => {
    const { CRONS } = await import("../scheduler/jobs.js");
    expect(CRONS.walCheckpoint).toBe("*/30 * * * *");
  });
});

// ── registerShutdownHook (1329c) ──────────────────────────────────────────────

describe("Task 1329c — registerShutdownHook settle delay", () => {
  it("waits at least 200ms before process.exit on SIGTERM", async () => {
    const { registerShutdownHook } = await import("../infrastructure/db/checkpoint.js");

    const exitCalls: number[] = [];
    const originalExit = process.exit;
    // @ts-ignore — spy
    process.exit = (code: number) => { exitCalls.push(code); };

    const sleepTimes: number[] = [];
    const originalSleep = Bun.sleep;
    // @ts-ignore — spy
    Bun.sleep = (ms: number) => { sleepTimes.push(ms); return Promise.resolve(); };

    registerShutdownHook();
    process.emit("SIGTERM");

    // Allow microtask queue to drain
    await new Promise(r => setTimeout(r, 10));

    expect(sleepTimes).toContain(200);
    expect(exitCalls).toContain(0);

    // Restore
    process.exit = originalExit;
    // @ts-ignore
    Bun.sleep = originalSleep;
  });
});

// ── backupDatabase ────────────────────────────────────────────────────────────

describe("Task 1329a — backupDatabase", () => {
  it("does not throw when source path does not exist", async () => {
    const { backupDatabase } = await import("../infrastructure/db/checkpoint.js");
    const silentLog = { info: () => {}, error: () => {}, debug: () => {} } as never;

    // Should resolve without throwing (Bun.write of missing/empty src is safe)
    await expect(
      backupDatabase("/tmp/nonexistent-1329a-test.db", silentLog),
    ).resolves.toBeUndefined();
  });

  it("calls Bun.write with dbPath + '.backup' as destination", async () => {
    const { backupDatabase } = await import("../infrastructure/db/checkpoint.js");
    const silentLog = { info: () => {}, error: () => {}, debug: () => {} } as never;
    const writeSpy = spyOn(Bun, "write").mockImplementation(async () => 0);

    const dbPath = "/tmp/test-1329a.db";
    await backupDatabase(dbPath, silentLog);

    const firstArg = writeSpy.mock.calls[0]?.[0];
    // BunFile has a .name property set to the path
    expect((firstArg as { name?: string }).name).toBe(dbPath + ".backup");

    writeSpy.mockRestore();
  });
});
