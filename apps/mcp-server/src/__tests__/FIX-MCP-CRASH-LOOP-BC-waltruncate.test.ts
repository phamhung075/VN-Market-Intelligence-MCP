// apps/mcp-server/src/__tests__/FIX-MCP-CRASH-LOOP-BC-waltruncate.test.ts
// BC-1 — WAL TRUNCATE checkpoint root fix
// Note: DB_PATH is set to :memory: by setup.ts preload

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: wal_autocheckpoint = 1000 on a fresh connection
// ─────────────────────────────────────────────────────────────────────────────

describe("BC-1 — wal_autocheckpoint is 1000 on fresh connection", () => {
  it("PRAGMA wal_autocheckpoint returns 1000 after schema.ts sets it", async () => {
    // Import fresh DB via getDb after resetting the singleton
    const { closeDb, getDb } = await import("../infrastructure/db/schema.js");
    closeDb();

    // Use :memory: (DB_PATH already set by setup.ts)
    const db = getDb();
    const row = db
      .query<{ wal_autocheckpoint: number }, []>("PRAGMA wal_autocheckpoint")
      .get();

    expect(row?.wal_autocheckpoint).toBe(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: runForcedTruncateCheckpoint issues BEGIN IMMEDIATE then TRUNCATE in order
// ─────────────────────────────────────────────────────────────────────────────

describe("BC-1 — runForcedTruncateCheckpoint call order", () => {
  it("issues BEGIN IMMEDIATE → COMMIT → PRAGMA wal_checkpoint(TRUNCATE) in order", async () => {
    const { runForcedTruncateCheckpoint } = await import(
      "../infrastructure/db/checkpoint.js"
    );

    const calls: string[] = [];

    // Mock db that records exec/query calls in order
    const mockDb = {
      exec: (sql: string) => {
        calls.push(sql.trim());
      },
      query: (sql: string) => {
        calls.push(sql.trim());
        return {
          get: () => ({ busy: 0, log: 0, checkpointed: 0 }),
        };
      },
    } as unknown as Database;

    await runForcedTruncateCheckpoint({ db: mockDb });

    // Verify ordering: BEGIN IMMEDIATE before TRUNCATE, COMMIT before TRUNCATE
    const beginIdx = calls.findIndex((c) => c === "BEGIN IMMEDIATE");
    const commitIdx = calls.findIndex((c) => c === "COMMIT");
    const truncateIdx = calls.findIndex((c) =>
      c === "PRAGMA wal_checkpoint(TRUNCATE)",
    );

    expect(beginIdx).toBeGreaterThanOrEqual(0);
    expect(commitIdx).toBeGreaterThan(beginIdx);
    expect(truncateIdx).toBeGreaterThan(commitIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: runForcedTruncateCheckpoint returns walSize and checkpointed
// ─────────────────────────────────────────────────────────────────────────────

describe("BC-1 — runForcedTruncateCheckpoint returns correct shape", () => {
  it("returns walSize (number >= 0) and checkpointed (boolean)", async () => {
    const { runForcedTruncateCheckpoint } = await import(
      "../infrastructure/db/checkpoint.js"
    );

    // Use a real :memory: DB in WAL mode
    const db = new Database(":memory:");
    db.exec("PRAGMA journal_mode=WAL");

    const result = await runForcedTruncateCheckpoint({ db });

    expect(typeof result.walSize).toBe("number");
    expect(result.walSize).toBeGreaterThanOrEqual(0);
    expect(typeof result.checkpointed).toBe("boolean");

    db.close();
  });

  it("mock: walSize and checkpointed reflect PRAGMA result", async () => {
    const { runForcedTruncateCheckpoint } = await import(
      "../infrastructure/db/checkpoint.js"
    );

    const mockDb = {
      exec: (_sql: string) => {},
      query: (_sql: string) => ({
        get: () => ({ busy: 0, log: 42, checkpointed: 42 }),
      }),
    } as unknown as Database;

    const result = await runForcedTruncateCheckpoint({ db: mockDb });

    expect(result.walSize).toBe(42);
    expect(result.checkpointed).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: 10k-write sustained load — WAL frame count stays < 1000 per cycle
// ─────────────────────────────────────────────────────────────────────────────

describe("BC-1 — 10k-write sustained load: WAL frames < 1000 after truncate", () => {
  it("WAL log frame count < 1000 after runForcedTruncateCheckpoint under 10k inserts", async () => {
    const { runForcedTruncateCheckpoint } = await import(
      "../infrastructure/db/checkpoint.js"
    );

    // Open a dedicated :memory: DB with WAL mode
    const db = new Database(":memory:");
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("PRAGMA wal_autocheckpoint=1000");
    db.exec("CREATE TABLE IF NOT EXISTS load_test (id INTEGER PRIMARY KEY AUTOINCREMENT, val TEXT)");

    const INSERT_COUNT = 10_000;
    const BATCH_SIZE = 500;
    const TRUNCATE_EVERY = 1_000; // truncate every 1000 inserts

    const insertStmt = db.prepare("INSERT INTO load_test (val) VALUES (?)");

    let maxFrameCountAfterTruncate = 0;

    for (let i = 0; i < INSERT_COUNT; i += BATCH_SIZE) {
      // Insert a batch
      db.exec("BEGIN");
      for (let j = 0; j < BATCH_SIZE; j++) {
        insertStmt.run(`row-${i + j}`);
      }
      db.exec("COMMIT");

      // Every TRUNCATE_EVERY inserts, run the forced truncate and check frames
      if ((i + BATCH_SIZE) % TRUNCATE_EVERY === 0) {
        const result = await runForcedTruncateCheckpoint({ db });
        // After truncate, walSize should be < 1000 (autocheckpoint threshold)
        if (result.walSize > maxFrameCountAfterTruncate) {
          maxFrameCountAfterTruncate = result.walSize;
        }
        // The key invariant: frame count after truncate stays below the threshold
        expect(result.walSize).toBeLessThan(1000);
      }
    }

    db.close();
  }, 30_000); // 30s timeout for load test
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 5: BEGIN IMMEDIATE does not throw under concurrent readers
// ─────────────────────────────────────────────────────────────────────────────

describe("BC-1 — runForcedTruncateCheckpoint completes without error under reader", () => {
  it("completes without throwing and returns checkpointed=true with no in-flight writes", async () => {
    const { runForcedTruncateCheckpoint } = await import(
      "../infrastructure/db/checkpoint.js"
    );

    const db = new Database(":memory:");
    db.exec("PRAGMA journal_mode=WAL");
    db.exec("CREATE TABLE IF NOT EXISTS reader_test (id INTEGER PRIMARY KEY, val TEXT)");
    db.exec("INSERT INTO reader_test VALUES (1, 'hello')");

    // Start an async reader task (open a read query but do not hold a transaction)
    const readerPromise = Promise.resolve().then(() => {
      const row = db.query("SELECT * FROM reader_test").all();
      return row.length;
    });

    // Run forced truncate concurrently
    const result = await runForcedTruncateCheckpoint({ db });

    // Wait for reader to complete
    const readerCount = await readerPromise;

    expect(readerCount).toBeGreaterThan(0);
    expect(typeof result.walSize).toBe("number");
    expect(result.checkpointed).toBe(true);

    db.close();
  });
});
