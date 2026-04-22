/**
 * Task 1476 — WAL stuck alert: send WORK Telegram when walCheckpointJob
 * detects remaining frames > 50000.
 *
 * Tests the walCheckpointAlert() helper extracted from jobs.ts.
 * Three assertions:
 *   1. remaining > 50000 → sendTelegram called with channel="work", text contains "WAL stuck"
 *   2. remaining ≤ 50000 (e.g. 50000) → sendTelegram NOT called
 *   3. remaining = 0 (clean WAL) → sendTelegram NOT called
 */

import { describe, it, expect, mock, beforeEach, afterEach } from "bun:test";
import { walCheckpointAlert } from "../scheduler/walCheckpointAlert.js";

describe("walCheckpointAlert", () => {
  let sendWorkCalls: Array<string>;
  let sendWorkFn: (msg: string) => Promise<void>;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    sendWorkCalls = [];
    sendWorkFn = async (msg: string) => { sendWorkCalls.push(msg); };
    // Suppress console.error during error handling tests to prevent
    // output leakage in parallel test suite
    originalConsoleError = console.error;
    console.error = () => {};
  });

  afterEach(() => {
    // Restore console.error to avoid side effects on other tests
    console.error = originalConsoleError;
  });

  it("calls sendWork with 'WAL stuck' when remaining > 50000", async () => {
    // remaining = 80000 - 20000 = 60000 (> 50000)
    await walCheckpointAlert({ walSize: 80000, checkpointed: 20000 }, sendWorkFn);

    expect(sendWorkCalls).toHaveLength(1);
    expect(sendWorkCalls[0]).toContain("WAL stuck");
    expect(sendWorkCalls[0]).toContain("60000");
  });

  it("does NOT call sendWork when remaining = 50000 (boundary, not over)", async () => {
    // remaining = 70000 - 20000 = 50000 (= threshold, not > 50000)
    await walCheckpointAlert({ walSize: 70000, checkpointed: 20000 }, sendWorkFn);

    expect(sendWorkCalls).toHaveLength(0);
  });

  it("does NOT call sendWork when remaining = 0 (clean WAL)", async () => {
    // remaining = 5000 - 5000 = 0
    await walCheckpointAlert({ walSize: 5000, checkpointed: 5000 }, sendWorkFn);

    expect(sendWorkCalls).toHaveLength(0);
  });

  it("does NOT throw when sendWork fn rejects (Telegram failure must not crash cron)", async () => {
    const throwingFn = async (_msg: string) => { throw new Error("Telegram timeout"); };
    // remaining = 200000 - 4 = 199996 (>> 50000) — would normally call sendWork
    await expect(
      walCheckpointAlert({ walSize: 200000, checkpointed: 4 }, throwingFn),
    ).resolves.toBeUndefined();
  });
});
