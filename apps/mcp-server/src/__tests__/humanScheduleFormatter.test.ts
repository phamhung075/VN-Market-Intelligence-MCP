/**
 * humanScheduleFormatter.test.ts — TASK-DASH-CRON-1 (FR-1.2)
 *
 * Pure domain unit tests for buildHumanSchedule — covers the shapes actually
 * present in apps/mcp-server/src/scheduler/cronConfig.ts, plus the NFR-1
 * honest-passthrough fallback for unrecognized shapes.
 */

import { describe, it, expect } from "bun:test";
import { buildHumanSchedule } from "../domain/cron/humanScheduleFormatter.js";

describe("buildHumanSchedule — FR-1.2", () => {
  it("every-N-min unrestricted", () => {
    expect(buildHumanSchedule("*/15 * * * *")).toBe("every 15 min");
    expect(buildHumanSchedule("*/1 * * * *")).toBe("every 1 min");
  });

  it("every-N-min restricted hour window (EC-2)", () => {
    expect(buildHumanSchedule("*/10 2-8 * * 1-5")).toBe(
      "every 10 min, 02:00-08:59 UTC weekdays",
    );
  });

  it("every-N-hour", () => {
    expect(buildHumanSchedule("0 */6 * * *")).toBe("every 6 hours");
    expect(buildHumanSchedule("0 */4 * * *")).toBe("every 4 hours");
  });

  it("hourly at a fixed minute", () => {
    expect(buildHumanSchedule("7 * * * *")).toBe("hourly at :07");
    expect(buildHumanSchedule("47 * * * *")).toBe("hourly at :47");
  });

  it("comma-list minutes, twice per hour (EC-4)", () => {
    expect(buildHumanSchedule("15,45 * * * *")).toBe("2x/hour at :15, :45 UTC");
  });

  it("daily HH:MM", () => {
    expect(buildHumanSchedule("0 23 * * *")).toBe("daily 23:00 UTC");
    expect(buildHumanSchedule("30 22 * * *")).toBe("daily 22:30 UTC");
  });

  it("weekdays HH:MM", () => {
    expect(buildHumanSchedule("0 8 * * 1-5")).toBe("weekdays 08:00 UTC");
  });

  it("weekly on a single named day", () => {
    expect(buildHumanSchedule("0 23 * * 0")).toBe("Sunday 23:00 UTC");
    expect(buildHumanSchedule("5 1 * * 1")).toBe("Monday 01:05 UTC");
  });

  it("monthly on a fixed day-of-month", () => {
    expect(buildHumanSchedule("0 6 1 * *")).toBe("monthly (day 1) 06:00 UTC");
  });

  it("quarterly (comma-list months, fixed day)", () => {
    expect(buildHumanSchedule("0 1 1 1,4,7,10 *")).toBe("quarterly (day 1) 01:00 UTC");
  });

  it("honest passthrough — unrecognized 5-field shape (NFR-1)", () => {
    // day-of-month range + single dow (last-Friday-ish) is not a covered shape.
    expect(buildHumanSchedule("0 8 25-31 * 5")).toBe("0 8 25-31 * 5");
  });

  it("honest passthrough — non-5-field / malformed expression (NFR-1)", () => {
    expect(buildHumanSchedule("not a cron expr")).toBe("not a cron expr");
    expect(buildHumanSchedule("* * * *")).toBe("* * * *"); // 4 fields
  });

  it("every real CRONS-map expression produces a non-empty string (no crash)", async () => {
    const { CRONS } = await import("../scheduler/cronConfig.js");
    for (const [key, expr] of Object.entries(CRONS)) {
      const result = buildHumanSchedule(expr);
      expect(typeof result).toBe("string");
      expect(result.length).toBeGreaterThan(0);
      void key;
    }
  });
});
