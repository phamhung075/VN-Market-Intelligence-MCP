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

import { describe, it, expect, mock, beforeEach } from "bun:test";
import { walCheckpointAlert } from "../scheduler/walCheckpointAlert.js";

describe("walCheckpointAlert", () => {
  let sendWorkCalls: Array<string>;
  let sendWorkFn: (msg: string) => Promise<void>;

  beforeEach(() => {
    sendWorkCalls = [];
    sendWorkFn = async (msg: string) => { sendWorkCalls.push(msg); };
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
});
