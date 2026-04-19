/**
 * Task 1447/1458 — checkpoint: PASSIVE → RESTART → TRUNCATE mode
 *
 * Tests:
 *   (a) runWalCheckpoint() issues PRAGMA wal_checkpoint(TRUNCATE), not PASSIVE/RESTART
 *   (b) returns { walSize, checkpointed } shape
 *   (c) logs a WARN when remaining frames > 1000
 *   (d) does not throw when db.query returns null (error path returns zeros)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { runWalCheckpoint } from "../infrastructure/db/checkpoint.js";
import type { CheckpointDeps } from "../infrastructure/db/checkpoint.js";

// ─────────────────────────────────────────────────────────────────────────────
// Injectable fakes — no mock.module, no process-wide side effects
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

const warnCalls: Array<{ msg: string; meta: unknown }> = [];
const infoCalls: Array<{ msg: string; meta: unknown }> = [];
const errorCalls: Array<{ msg: string; meta: unknown }> = [];

const mockLog = {
  info: (msg: string, meta?: unknown) => infoCalls.push({ msg, meta }),
  warn: (msg: string, meta?: unknown) => warnCalls.push({ msg, meta }),
  error: (msg: string, meta?: unknown) => errorCalls.push({ msg, meta }),
  debug: () => {},
};

const deps: CheckpointDeps = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getDb: () => mockDb as any,
  log: mockLog as unknown as CheckpointDeps["log"],
};

// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1447/1458 — checkpoint TRUNCATE mode", () => {
  beforeEach(() => {
    queryCalls.length = 0;
    warnCalls.length = 0;
    infoCalls.length = 0;
    errorCalls.length = 0;
  });

  it("(a) uses TRUNCATE mode, not PASSIVE or RESTART", () => {
    mockQueryReturn = { busy: 0, log: 500, checkpointed: 500 };
    runWalCheckpoint(deps);
    expect(queryCalls.length).toBe(1);
    expect(queryCalls[0]).toContain("TRUNCATE");
    expect(queryCalls[0]).not.toContain("RESTART");
    expect(queryCalls[0]).not.toContain("PASSIVE");
  });

  it("(b) returns { walSize, checkpointed } from PRAGMA result", () => {
    mockQueryReturn = { busy: 0, log: 800, checkpointed: 750 };
    const result = runWalCheckpoint(deps);
    expect(result.walSize).toBe(800);
    expect(result.checkpointed).toBe(750);
  });

  it("(c) logs WARN when remaining frames > 1000", () => {
    // log=2000, checkpointed=500 → remaining=1500 > 1000
    mockQueryReturn = { busy: 1, log: 2000, checkpointed: 500 };
    runWalCheckpoint(deps);
    expect(warnCalls.length).toBeGreaterThan(0);
    const warnMsg = warnCalls[0]?.msg ?? "";
    expect(warnMsg).toContain("remaining");
  });

  it("(c2) does NOT warn when remaining frames <= 1000", () => {
    mockQueryReturn = { busy: 0, log: 1200, checkpointed: 1200 };
    runWalCheckpoint(deps);
    expect(warnCalls.length).toBe(0);
  });

  it("(d) returns zeros when query returns null (error fallback)", () => {
    mockQueryReturn = null;
    const result = runWalCheckpoint(deps);
    expect(result.walSize).toBe(0);
    expect(result.checkpointed).toBe(0);
  });
});
