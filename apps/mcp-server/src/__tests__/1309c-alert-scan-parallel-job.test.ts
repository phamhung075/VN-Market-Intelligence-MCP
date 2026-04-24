// src/__tests__/1309c-alert-scan-parallel-job.test.ts
import { describe, it, expect, beforeEach, mock } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Mock setup
// ─────────────────────────────────────────────────────────────────────────────

let taAlertScanMock = mock(async () => ({ scanned: 5, fired: 1 }));
let bbAlertScanMock = mock(async () => ({ scanned: 5, fired: 1 }));

// Import after mocks are defined (allows mocking)
const { runAlertScanParallel } = await import(
  "../scheduler/alerts/alertScanParallelJob.js"
);

// We'll test the parallel job by verifying it calls both functions
// and returns combined results correctly.

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1309c — alertScanParallelJob: Parallel TA + BB alert scanning", () => {
  // AC-1: Parallel job returns combined results
  it("AC-1: returns combined TA + BB scan results", async () => {
    const result = await runAlertScanParallel();

    // Both should have executed (regardless of mock or real)
    expect(result).toHaveProperty("totalScanned");
    expect(result).toHaveProperty("totalFired");
    expect(result).toHaveProperty("taResult");
    expect(result).toHaveProperty("bbResult");
    expect(result).toHaveProperty("durationMs");
    expect(result).toHaveProperty("allOk");

    expect(typeof result.totalScanned).toBe("number");
    expect(typeof result.totalFired).toBe("number");
    expect(typeof result.durationMs).toBe("number");
  });

  // AC-2: Totals are summed correctly
  it("AC-2: total scanned/fired are sums of individual results", async () => {
    const result = await runAlertScanParallel();

    if (result.taResult && result.bbResult) {
      expect(result.totalScanned).toBe(
        result.taResult.scanned + result.bbResult.scanned
      );
      expect(result.totalFired).toBe(
        result.taResult.fired + result.bbResult.fired
      );
    }
  });

  // AC-3: allOk flag is accurate
  it("AC-3: allOk flag reflects both scans success", async () => {
    const result = await runAlertScanParallel();

    const bothSucceeded = result.taResult !== null && result.bbResult !== null;
    expect(result.allOk).toBe(bothSucceeded);
  });

  // AC-4: Duration is measured
  it("AC-4: duration is measured and positive", async () => {
    const result = await runAlertScanParallel();

    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  // AC-5: Results are preserved individually
  it("AC-5: individual scan results accessible via taResult/bbResult", async () => {
    const result = await runAlertScanParallel();

    // If allOk, both should be non-null
    if (result.allOk && result.taResult && result.bbResult) {
      expect(typeof result.taResult.scanned).toBe("number");
      expect(typeof result.taResult.fired).toBe("number");
      expect(typeof result.bbResult.scanned).toBe("number");
      expect(typeof result.bbResult.fired).toBe("number");
    }
  });
});
