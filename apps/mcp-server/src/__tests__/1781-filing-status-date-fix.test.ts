/**
 * Task 1781 — Off-by-one in classifyFilingStatus(): deadline day must not be QUA_HAN
 *
 * Root cause: raw millisecond subtraction with a UTC-midnight deadline vs a
 * wall-clock "now" produces negative diffMs on the deadline day itself once
 * any time has elapsed past midnight UTC.  The fix compares YYYY-MM-DD date
 * strings so time-of-day is irrelevant.
 *
 * New acceptance criteria:
 *  - On the deadline day itself (today === deadline date) → SAP_DEN (0 days left), NOT QUA_HAN
 *  - One day after the deadline → QUA_HAN
 *  - Two days before deadline → SAP_DEN
 */

import { describe, it, expect } from "bun:test";
import { classifyFilingStatus } from "../domain/services/financial-reports/earningsCalendar.js";

describe("Task 1781 — classifyFilingStatus same-day off-by-one", () => {
  it("returns SAP_DEN (not QUA_HAN) when today IS the deadline day — 07:29 UTC", () => {
    // Simulates 2026-04-30T07:29:00Z — well past UTC midnight, old code gave -1 days
    const today = new Date("2026-04-30T07:29:00Z");
    const status = classifyFilingStatus(today, {
      filingDate: null,
      quarter: 1,
      year: 2026,
      deadline: new Date("2026-04-30"),
    });
    expect(status.status).toBe("SAP_DEN");
    expect(status.daysUntilDeadline).toBe(0);
  });

  it("returns SAP_DEN (not QUA_HAN) when today IS the deadline day — 23:59 UTC", () => {
    const today = new Date("2026-04-30T23:59:59Z");
    const status = classifyFilingStatus(today, {
      filingDate: null,
      quarter: 1,
      year: 2026,
      deadline: new Date("2026-04-30"),
    });
    expect(status.status).toBe("SAP_DEN");
    expect(status.daysUntilDeadline).toBe(0);
  });

  it("returns QUA_HAN the day AFTER the deadline", () => {
    const today = new Date("2026-05-01T00:00:00Z");
    const status = classifyFilingStatus(today, {
      filingDate: null,
      quarter: 1,
      year: 2026,
      deadline: new Date("2026-04-30"),
    });
    expect(status.status).toBe("QUA_HAN");
  });

  it("returns SAP_DEN two days before the deadline", () => {
    const today = new Date("2026-04-28T15:00:00Z");
    const status = classifyFilingStatus(today, {
      filingDate: null,
      quarter: 1,
      year: 2026,
      deadline: new Date("2026-04-30"),
    });
    expect(status.status).toBe("SAP_DEN");
    expect(status.daysUntilDeadline).toBe(2);
  });
});
