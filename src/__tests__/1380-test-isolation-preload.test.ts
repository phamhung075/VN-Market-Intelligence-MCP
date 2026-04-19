Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1380 — TDD: test isolation via preload (RED phase)
 *
 * These three assertions prove preload-based isolation does NOT exist yet
 * (RED before setup.ts + bunfig.toml preload are in place).
 *
 * After Task 1381 lands they all turn GREEN:
 *   1. process.env["DB_PATH"] equals ":memory:" — set by preload before module loads
 *   2. After closeDb() + initDatabase(), market_messages table exists and is empty
 *   3. Repeat in second it() — proves beforeEach resets DB between tests
 */

import { describe, it, expect } from "bun:test";
import { getDb, initDatabase, closeDb } from "../infrastructure/db/index.js";

describe("Task 1380 — test isolation via preload", () => {
  it("process.env DB_PATH is :memory: (set by preload before module evaluation)", () => {
    expect(process.env["DB_PATH"]).toBe(":memory:");
  });

  it("fresh DB after closeDb + initDatabase has zero rows in market_messages (first call)", async () => {
    closeDb();
    await initDatabase();
    const db = getDb();
    const row = db
      .prepare("SELECT count(*) as n FROM market_messages")
      .get() as { n: number };
    expect(row.n).toBe(0);
  });

  it("fresh DB after closeDb + initDatabase has zero rows in market_messages (second call — proves beforeEach reset)", async () => {
    closeDb();
    await initDatabase();
    const db = getDb();
    const row = db
      .prepare("SELECT count(*) as n FROM market_messages")
      .get() as { n: number };
    expect(row.n).toBe(0);
  });
});
