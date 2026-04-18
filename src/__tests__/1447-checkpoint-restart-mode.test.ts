/**
 * Task 1447 — checkpoint: PASSIVE → RESTART mode
 *
 * Tests:
 *   (a) runWalCheckpoint() issues PRAGMA wal_checkpoint(RESTART), not PASSIVE
 *   (b) returns { walSize, checkpointed } shape
 *   (c) logs a WARN when remaining frames > 1000
 *   (d) does not throw when db.query returns null (error path returns zeros)
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Capture the SQL sent to db.query so we can assert RESTART mode
// ─────────────────────────────────────────────────────────────────────────────

const queryCalls: string[] = [];
let mockQueryReturn: { busy: number; log: number; checkpointed: number } | null = null;

const mockDb = {
  query: (sql: string) => {
    queryCalls.push(sql);
    return {
      get: () => mockQueryReturn,
    };
  },
};

mock.module("../infrastructure/db/schema.js", () => ({
  getDb: () => mockDb,
}));

const warnCalls: Array<{ msg: string; meta: unknown }> = [];
const infoCalls: Array<{ msg: string; meta: unknown }> = [];
const errorCalls: Array<{ msg: string; meta: unknown }> = [];

mock.module("../infrastructure/logger.js", () => ({
  logger: {
    info: (msg: string, meta?: unknown) => infoCalls.push({ msg, meta }),
    warn: (msg: string, meta?: unknown) => warnCalls.push({ msg, meta }),
    error: (msg: string, meta?: unknown) => errorCalls.push({ msg, meta }),
    debug: () => {},
  },
}));

// Import AFTER mocks
import { runWalCheckpoint } from "../infrastructure/db/checkpoint.js";

// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1447 — checkpoint RESTART mode", () => {
  beforeEach(() => {
    queryCalls.length = 0;
    warnCalls.length = 0;
    infoCalls.length = 0;
    errorCalls.length = 0;
  });

  it("(a) uses RESTART mode, not PASSIVE", () => {
    mockQueryReturn = { busy: 0, log: 500, checkpointed: 500 };
    runWalCheckpoint();
    expect(queryCalls.length).toBe(1);
    expect(queryCalls[0]).toContain("RESTART");
    expect(queryCalls[0]).not.toContain("PASSIVE");
  });

  it("(b) returns { walSize, checkpointed } from PRAGMA result", () => {
    mockQueryReturn = { busy: 0, log: 800, checkpointed: 750 };
    const result = runWalCheckpoint();
    expect(result.walSize).toBe(800);
    expect(result.checkpointed).toBe(750);
  });

  it("(c) logs WARN when remaining frames > 1000", () => {
    // log=2000, checkpointed=500 → remaining=1500 > 1000
    mockQueryReturn = { busy: 1, log: 2000, checkpointed: 500 };
    runWalCheckpoint();
    expect(warnCalls.length).toBeGreaterThan(0);
    const warnMsg = warnCalls[0]?.msg ?? "";
    expect(warnMsg).toContain("remaining");
  });

  it("(c2) does NOT warn when remaining frames <= 1000", () => {
    mockQueryReturn = { busy: 0, log: 1200, checkpointed: 1200 };
    runWalCheckpoint();
    expect(warnCalls.length).toBe(0);
  });

  it("(d) returns zeros when query returns null (error fallback)", () => {
    mockQueryReturn = null;
    const result = runWalCheckpoint();
    expect(result.walSize).toBe(0);
    expect(result.checkpointed).toBe(0);
  });
});
