// apps/mcp-server/src/__tests__/1349e-job-metrics.test.ts
// Task 1349e — Job cycle timings + ops metrics
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect, beforeEach } from "bun:test";
import {
  recordJobMetrics,
  getJobMetrics,
  clearJobMetrics,
} from "../infrastructure/observability/jobMetrics.js";

describe("Task 1349e — Job Metrics Collector", () => {
  beforeEach(() => {
    clearJobMetrics();
  });

  // 1. Metric recorded per job cycle
  it("records a metric entry on each call", () => {
    recordJobMetrics("taAlertScan", 1200, 0, 5);
    const all = getJobMetrics();
    expect(all.length).toBe(1);
  });

  // 2. All required fields are present in recorded metric
  it("records all required fields in metric entry", () => {
    const before = new Date().toISOString();
    recordJobMetrics("taAlertScan", 1500, 0, 3);
    const after = new Date().toISOString();

    const metrics = getJobMetrics();
    expect(metrics.length).toBe(1);
    const m = metrics[0]!;

    expect(typeof m.timestamp).toBe("string");
    expect(m.timestamp >= before).toBe(true);
    expect(m.timestamp <= after).toBe(true);
    expect(m.job).toBe("taAlertScan");
    expect(m.cycle_duration_ms).toBe(1500);
    expect(m.error_count).toBe(0);
    expect(m.success_count).toBe(3);
  });

  // 3. Multiple jobs accumulate in buffer independently
  it("accumulates metrics across multiple job calls", () => {
    recordJobMetrics("taAlertScan", 2000, 0, 10);
    recordJobMetrics("bbAlertScan", 1800, 0, 4);
    recordJobMetrics("macroRefresh", 3200, 0, 1);
    expect(getJobMetrics().length).toBe(3);
  });

  // 4. Query by job name returns only matching entries
  it("filters metrics by job name", () => {
    recordJobMetrics("taAlertScan", 1000, 0, 5);
    recordJobMetrics("bbAlertScan", 900, 0, 2);
    recordJobMetrics("taAlertScan", 1100, 0, 3);

    const ta = getJobMetrics("taAlertScan");
    expect(ta.length).toBe(2);
    expect(ta.every((m) => m.job === "taAlertScan")).toBe(true);

    const bb = getJobMetrics("bbAlertScan");
    expect(bb.length).toBe(1);
    expect(bb[0]!.job).toBe("bbAlertScan");
  });

  // 5. getJobMetrics() with no arg returns all
  it("returns all metrics when no job filter provided", () => {
    recordJobMetrics("taAlertScan", 500, 0, 1);
    recordJobMetrics("macroRefresh", 2000, 1, 0);
    const all = getJobMetrics();
    expect(all.length).toBe(2);
  });

  // 6. Error count tracked correctly
  it("records error_count accurately", () => {
    recordJobMetrics("taAlertScan", 5000, 3, 7);
    const m = getJobMetrics("taAlertScan")[0]!;
    expect(m.error_count).toBe(3);
    expect(m.success_count).toBe(7);
  });

  // 7. Slow cycle threshold: duration > 10000ms
  it("returns metric with cycle_duration_ms above 10s threshold correctly", () => {
    recordJobMetrics("bbAlertScan", 12000, 0, 5);
    const m = getJobMetrics("bbAlertScan")[0]!;
    expect(m.cycle_duration_ms).toBeGreaterThan(10000);
  });

  // 8. clearJobMetrics resets buffer (test isolation)
  it("clearJobMetrics empties the buffer", () => {
    recordJobMetrics("taAlertScan", 1000, 0, 1);
    clearJobMetrics();
    expect(getJobMetrics().length).toBe(0);
  });

  // 9. Metrics from query by unknown job name return empty array
  it("returns empty array for unknown job name", () => {
    recordJobMetrics("taAlertScan", 1000, 0, 1);
    expect(getJobMetrics("unknownJob")).toEqual([]);
  });

  // 10. timestamp is a valid ISO 8601 string
  it("timestamp is valid ISO 8601", () => {
    recordJobMetrics("macroRefresh", 800, 0, 1);
    const m = getJobMetrics()[0]!;
    expect(isNaN(new Date(m.timestamp).getTime())).toBe(false);
  });
});
