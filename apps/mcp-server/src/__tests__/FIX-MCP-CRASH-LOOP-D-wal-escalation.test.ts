/**
 * FIX-MCP-CRASH-LOOP-D-wal-escalation.test.ts
 *
 * Unit tests for the D-1 WAL escalation gate:
 *   checkWalFileSize() escalateFn injection via 4th optional parameter.
 *
 * Acceptance criteria (all 4 must pass):
 *   1. escalateFn NOT called when WAL <= 10 MB
 *   2. escalateFn called exactly once when WAL > 10 MB
 *   3. escalateFn receives the exact byte count
 *   4. escalateFn rejection is non-fatal (checkpoint does not throw)
 *
 * Pattern: follows 1329b-wal-sentinel.test.ts (real temp files on disk
 * to drive Bun.file().size; cleaned up in finally blocks).
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { unlinkSync } from "node:fs";
import { checkWalFileSize } from "../infrastructure/db/checkpoint.js";

// Shared log suppressor (silence error output during tests)
const silentLog = {
  info: () => {},
  error: () => {},
  debug: () => {},
} as never;

// Shared sendWorkFn — captures alert strings but otherwise silent
const makeSendFn = () => {
  const calls: string[] = [];
  return {
    fn: async (msg: string) => { calls.push(msg); },
    calls,
  };
};

// ─────────────────────────────────────────────────────────────────────────────
// Helpers: write a temp WAL file at a known size, then remove it after test
// ─────────────────────────────────────────────────────────────────────────────

async function writeTempWal(tmpDb: string, sizeBytes: number): Promise<string> {
  const walPath = tmpDb + "-wal";
  const data = new Uint8Array(sizeBytes);
  await Bun.write(walPath, data);
  return walPath;
}

function cleanupWal(walPath: string): void {
  try { unlinkSync(walPath); } catch { /* already removed or never written */ }
}

// ─────────────────────────────────────────────────────────────────────────────
// Test 1: escalateFn NOT called when WAL <= 10 MB (5 MB file)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-MCP-CRASH-LOOP-D-1 — escalateFn gate: small WAL", () => {
  const tmpDb = "/tmp/d1-test-small.db";
  let walPath: string;

  beforeEach(async () => {
    walPath = await writeTempWal(tmpDb, 5 * 1024 * 1024); // 5 MB — below threshold
  });

  afterEach(() => {
    cleanupWal(walPath);
  });

  it("escalateFn is NOT called when WAL file is 5 MB (below 10 MB threshold)", async () => {
    const escalateCalls: number[] = [];
    const escalateFn = async (walBytes: number) => {
      escalateCalls.push(walBytes);
    };

    const { fn: sendWorkFn } = makeSendFn();
    await checkWalFileSize(tmpDb, sendWorkFn, silentLog, escalateFn);

    expect(escalateCalls).toHaveLength(0);
  });

  it("escalated field is undefined (or absent) when WAL is below threshold", async () => {
    const escalateFn = async (_walBytes: number) => {};

    const { fn: sendWorkFn } = makeSendFn();
    const result = await checkWalFileSize(tmpDb, sendWorkFn, silentLog, escalateFn);

    // escalated is only set to true when alert fires (bytes > 10 MB)
    expect(result.escalated).not.toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 2: escalateFn called exactly once when WAL > 10 MB
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-MCP-CRASH-LOOP-D-1 — escalateFn gate: large WAL", () => {
  const tmpDb = "/tmp/d1-test-large.db";
  let walPath: string;

  beforeEach(async () => {
    walPath = await writeTempWal(tmpDb, 15 * 1024 * 1024); // 15 MB — above threshold
  });

  afterEach(() => {
    cleanupWal(walPath);
  });

  it("escalateFn is called exactly once when WAL file is 15 MB (above 10 MB threshold)", async () => {
    const escalateCalls: number[] = [];
    const escalateFn = async (walBytes: number) => {
      escalateCalls.push(walBytes);
    };

    const { fn: sendWorkFn } = makeSendFn();
    await checkWalFileSize(tmpDb, sendWorkFn, silentLog, escalateFn);

    expect(escalateCalls).toHaveLength(1);
  });

  it("escalated is true when WAL exceeds 10 MB and escalateFn is provided", async () => {
    const escalateFn = async (_walBytes: number) => {};

    const { fn: sendWorkFn } = makeSendFn();
    const result = await checkWalFileSize(tmpDb, sendWorkFn, silentLog, escalateFn);

    expect(result.escalated).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 3: escalateFn receives the exact byte count
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-MCP-CRASH-LOOP-D-1 — escalateFn receives byte count", () => {
  const tmpDb = "/tmp/d1-test-bytes.db";
  const TARGET_BYTES = 15_000_000; // 15 MB exactly
  let walPath: string;

  beforeEach(async () => {
    walPath = await writeTempWal(tmpDb, TARGET_BYTES);
  });

  afterEach(() => {
    cleanupWal(walPath);
  });

  it("escalateFn receives the WAL file byte count as its argument", async () => {
    let receivedBytes: number | undefined;
    const escalateFn = async (walBytes: number) => {
      receivedBytes = walBytes;
    };

    const { fn: sendWorkFn } = makeSendFn();
    await checkWalFileSize(tmpDb, sendWorkFn, silentLog, escalateFn);

    // Bun.file().size may vary slightly due to filesystem alignment;
    // assert it equals exactly TARGET_BYTES (we wrote exactly that many bytes).
    expect(receivedBytes).toBe(TARGET_BYTES);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Test 4: escalateFn rejection is non-fatal (function does not throw)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-MCP-CRASH-LOOP-D-1 — escalateFn error is non-fatal", () => {
  const tmpDb = "/tmp/d1-test-throw.db";
  let walPath: string;
  let originalConsoleError: typeof console.error;

  beforeEach(async () => {
    walPath = await writeTempWal(tmpDb, 15 * 1024 * 1024); // 15 MB
    originalConsoleError = console.error;
    console.error = () => {}; // suppress error output during this test
  });

  afterEach(() => {
    cleanupWal(walPath);
    console.error = originalConsoleError;
  });

  it("checkWalFileSize does not throw when escalateFn rejects", async () => {
    const escalateFn = async (_walBytes: number) => {
      throw new Error("orch-state write failure");
    };

    const { fn: sendWorkFn } = makeSendFn();

    // Must resolve without throwing, even though escalateFn throws
    await expect(
      checkWalFileSize(tmpDb, sendWorkFn, silentLog, escalateFn),
    ).resolves.toBeDefined();
  });

  it("escalated is true when escalateFn throws (attempt was made)", async () => {
    const escalateFn = async (_walBytes: number) => {
      throw new Error("orch-state write failure");
    };

    const { fn: sendWorkFn } = makeSendFn();
    const result = await checkWalFileSize(tmpDb, sendWorkFn, silentLog, escalateFn);

    // escalated=true because escalateFn was called (attempt made), even though it threw
    expect(result.escalated).toBe(true);
  });
});
