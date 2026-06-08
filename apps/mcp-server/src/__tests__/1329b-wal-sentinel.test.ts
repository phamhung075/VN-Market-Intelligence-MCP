/**
 * Task 1329b — WAL Sentinel tests
 *
 * Covers:
 *   A) walCheckpointAlert two-tier logic (WARNING / CRITICAL / silent)
 *   B) checkWalFileSize disk-size guard (WARNING / CRITICAL / silent / absent)
 *
 * Layer compliance: all imports from scheduler + infrastructure/db only.
 */
import { describe, it, expect, mock } from "bun:test";
import { walCheckpointAlert } from "../scheduler/walCheckpointAlert.js";
import { checkWalFileSize } from "../infrastructure/db/checkpoint.js";

// ---------------------------------------------------------------------------
// A) walCheckpointAlert — two-tier threshold tests
// ---------------------------------------------------------------------------
describe("1329b — walCheckpointAlert two-tier thresholds", () => {
  it("sends WAL CRITICAL when remaining > 10,000 frames", async () => {
    const calls: string[] = [];
    const spy = async (msg: string) => { calls.push(msg); };

    await walCheckpointAlert({ walSize: 10_001, checkpointed: 0 }, spy);

    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("WAL CRITICAL");
  });

  it("sends WAL WARNING when remaining is between 5,001 and 10,000 frames", async () => {
    const calls: string[] = [];
    const spy = async (msg: string) => { calls.push(msg); };

    await walCheckpointAlert({ walSize: 6_000, checkpointed: 0 }, spy);

    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("WAL WARNING");
  });

  it("is silent when remaining <= 5,000 frames", async () => {
    const calls: string[] = [];
    const spy = async (msg: string) => { calls.push(msg); };

    await walCheckpointAlert({ walSize: 4_999, checkpointed: 0 }, spy);

    expect(calls.length).toBe(0);
  });

  it("CRITICAL message includes frame count", async () => {
    const calls: string[] = [];
    const spy = async (msg: string) => { calls.push(msg); };

    await walCheckpointAlert({ walSize: 12_000, checkpointed: 500 }, spy);

    expect(calls[0]).toContain("11500");
  });

  it("WARNING message includes frame count", async () => {
    const calls: string[] = [];
    const spy = async (msg: string) => { calls.push(msg); };

    await walCheckpointAlert({ walSize: 8_000, checkpointed: 1_000 }, spy);

    expect(calls[0]).toContain("7000");
  });
});

// ---------------------------------------------------------------------------
// B) checkWalFileSize — disk size guard tests
// ---------------------------------------------------------------------------
describe("1329b — checkWalFileSize disk guard", () => {
  it("returns { bytes:0, warningFired:false } when WAL file does not exist (:memory: path)", async () => {
    const spy = async (_msg: string) => {};
    // :memory:-wal will not exist — Bun.file().size returns 0
    const result = await checkWalFileSize(":memory:", spy);
    expect(result.bytes).toBe(0);
    expect(result.warningFired).toBe(false);
  });

  it("fires WARNING and returns warningFired:true when file size is ~11 MB", async () => {
    const calls: string[] = [];
    const spy = async (msg: string) => { calls.push(msg); };

    // Write an 11 MB temp WAL file
    const tmpPath = "/tmp/1329b-test-warn.db";
    const walPath = tmpPath + "-wal";
    const data = new Uint8Array(11 * 1024 * 1024); // 11 MB
    await Bun.write(walPath, data);

    try {
      const result = await checkWalFileSize(tmpPath, spy);
      expect(result.warningFired).toBe(true);
      expect(calls.length).toBe(1);
      expect(calls[0]).toContain("WARNING");
    } finally {
      // cleanup
      const { unlinkSync } = await import("fs");
      try { unlinkSync(walPath); } catch { /* ignore */ }
    }
  });

  it("fires CRITICAL and returns warningFired:true when file size is ~45 MB", async () => {
    const calls: string[] = [];
    const spy = async (msg: string) => { calls.push(msg); };

    const tmpPath = "/tmp/1329b-test-crit.db";
    const walPath = tmpPath + "-wal";
    const data = new Uint8Array(45 * 1024 * 1024); // 45 MB
    await Bun.write(walPath, data);

    try {
      const result = await checkWalFileSize(tmpPath, spy);
      expect(result.warningFired).toBe(true);
      expect(calls.length).toBe(1);
      expect(calls[0]).toContain("CRITICAL");
    } finally {
      const { unlinkSync } = await import("fs");
      try { unlinkSync(walPath); } catch { /* ignore */ }
    }
  });

  it("is silent and returns warningFired:false when file size is 5 MB (below 10 MB threshold)", async () => {
    const calls: string[] = [];
    const spy = async (msg: string) => { calls.push(msg); };

    const tmpPath = "/tmp/1329b-test-small.db";
    const walPath = tmpPath + "-wal";
    const data = new Uint8Array(5 * 1024 * 1024); // 5 MB
    await Bun.write(walPath, data);

    try {
      const result = await checkWalFileSize(tmpPath, spy);
      expect(result.warningFired).toBe(false);
      expect(calls.length).toBe(0);
    } finally {
      const { unlinkSync } = await import("fs");
      try { unlinkSync(walPath); } catch { /* ignore */ }
    }
  });

  it("alert message includes file size in MB", async () => {
    const calls: string[] = [];
    const spy = async (msg: string) => { calls.push(msg); };

    const tmpPath = "/tmp/1329b-test-mb.db";
    const walPath = tmpPath + "-wal";
    const data = new Uint8Array(12 * 1024 * 1024); // 12 MB
    await Bun.write(walPath, data);

    try {
      await checkWalFileSize(tmpPath, spy);
      expect(calls[0]).toMatch(/\d+\.\d+ MB/);
    } finally {
      const { unlinkSync } = await import("fs");
      try { unlinkSync(walPath); } catch { /* ignore */ }
    }
  });
});
