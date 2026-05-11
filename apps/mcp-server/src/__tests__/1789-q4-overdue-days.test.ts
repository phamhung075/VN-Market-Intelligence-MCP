/**
 * Task 1789 — Q4-2025 overdue shows 16 days instead of 30 at 2026-04-30
 *
 * Root cause: getDeadlineForQuarter() uses new Date(ISO_STRING) + setDate(local)
 * which is sensitive to the server's local timezone and DST transitions.
 * In Paris (UTC+2 in spring), Dec 31 + 105 days via setDate gives 2026-04-14
 * instead of the correct 2026-04-15, because:
 *   - new Date('2025-12-31') = UTC midnight (which is UTC+1 in winter Paris)
 *   - the DST switch on 2026-03-29 causes the local-time arithmetic to land
 *     1 hour short of UTC midnight, yielding toISOString() = 2026-04-14T23:00:00Z
 *   - .slice(0,10) truncates to '2026-04-14'
 *   - classifyFilingStatus then gives -16 days instead of the correct -15
 *
 * For the standard path (90 days), the same bug gives 2026-03-30 instead of
 * 2026-03-31, making the overdue count 31 instead of 30.
 *
 * Fix: use setUTCDate / Date.UTC throughout getDeadlineForQuarter() so that
 * deadline arithmetic is always in UTC and timezone-invariant.
 *
 * VN statutory deadlines (confirmed):
 *   Q1–Q3 standard   : quarter-end + 30 days  (UTC)
 *   Q1–Q3 bank/insur  : quarter-end + 45 days  (UTC)
 *   Q4 standard       : Dec 31 + 90 days = Mar 31 (UTC)
 *   Q4 bank/insur     : Dec 31 + 105 days = Apr 15 (UTC)
 */

import { describe, it, expect } from "bun:test";
import {
  getDeadlineForQuarter,
  classifyFilingStatus,
} from "../domain/services/financial-reports/earningsCalendar.js";

// ─────────────────────────────────────────────────────────────────────────────
// AC-1: getDeadlineForQuarter returns correct UTC deadline regardless of TZ
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1789 AC-1 — getDeadlineForQuarter is timezone-invariant", () => {
  it("standard Q4-2025 deadline = 2026-03-31 (UTC)", () => {
    const deadline = getDeadlineForQuarter(2025, 4);
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-03-31");
  });

  it("banking Q4-2025 deadline = 2026-04-15 (UTC, 105 days)", () => {
    const deadline = getDeadlineForQuarter(2025, 4, "banking");
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("insurance Q4-2025 deadline = 2026-04-15 (UTC, 105 days)", () => {
    const deadline = getDeadlineForQuarter(2025, 4, "insurance");
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-04-15");
  });

  it("standard Q1-2026 deadline = 2026-04-30 (UTC, 30 days after Mar 31)", () => {
    const deadline = getDeadlineForQuarter(2026, 1);
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-04-30");
  });

  it("banking Q1-2026 deadline = 2026-05-15 (UTC, 45 days after Mar 31)", () => {
    const deadline = getDeadlineForQuarter(2026, 1, "banking");
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-05-15");
  });

  it("standard Q2-2026 deadline = 2026-07-30 (UTC, 30 days after Jun 30)", () => {
    const deadline = getDeadlineForQuarter(2026, 2);
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-07-30");
  });

  it("standard Q3-2026 deadline = 2026-10-30 (UTC, 30 days after Sep 30)", () => {
    const deadline = getDeadlineForQuarter(2026, 3);
    expect(deadline.toISOString().slice(0, 10)).toBe("2026-10-30");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: classifyFilingStatus overdue count is correct at 2026-04-30
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1789 AC-2 — overdue day count is correct at 2026-04-30", () => {
  const TODAY = new Date("2026-04-30T00:00:00Z");

  it("standard Q4-2025: daysUntilDeadline = -30 (not -31 or -16)", () => {
    const deadline = getDeadlineForQuarter(2025, 4);
    const status = classifyFilingStatus(TODAY, {
      filingDate: null,
      quarter: 4,
      year: 2025,
      deadline,
    });
    expect(status.status).toBe("QUA_HAN");
    expect(status.daysUntilDeadline).toBe(-30);
  });

  it("banking Q4-2025: daysUntilDeadline = -15 (not -16)", () => {
    const deadline = getDeadlineForQuarter(2025, 4, "banking");
    const status = classifyFilingStatus(TODAY, {
      filingDate: null,
      quarter: 4,
      year: 2025,
      deadline,
    });
    expect(status.status).toBe("QUA_HAN");
    expect(status.daysUntilDeadline).toBe(-15);
  });

  it("insurance Q4-2025: daysUntilDeadline = -15 (not -16)", () => {
    const deadline = getDeadlineForQuarter(2025, 4, "insurance");
    const status = classifyFilingStatus(TODAY, {
      filingDate: null,
      quarter: 4,
      year: 2025,
      deadline,
    });
    expect(status.status).toBe("QUA_HAN");
    expect(status.daysUntilDeadline).toBe(-15);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3: boundary checks — deadline arithmetic is exact (no off-by-one)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1789 AC-3 — deadline boundary checks", () => {
  it("standard Q4-2025 at 2026-03-31: daysUntilDeadline = 0 (on deadline day)", () => {
    const today = new Date("2026-03-31T00:00:00Z");
    const deadline = getDeadlineForQuarter(2025, 4);
    const status = classifyFilingStatus(today, {
      filingDate: null,
      quarter: 4,
      year: 2025,
      deadline,
    });
    expect(status.status).toBe("SAP_DEN");
    expect(status.daysUntilDeadline).toBe(0);
  });

  it("banking Q4-2025 at 2026-04-15: daysUntilDeadline = 0 (on deadline day)", () => {
    const today = new Date("2026-04-15T00:00:00Z");
    const deadline = getDeadlineForQuarter(2025, 4, "banking");
    const status = classifyFilingStatus(today, {
      filingDate: null,
      quarter: 4,
      year: 2025,
      deadline,
    });
    expect(status.status).toBe("SAP_DEN");
    expect(status.daysUntilDeadline).toBe(0);
  });

  it("standard Q4-2025 at 2026-04-01: daysUntilDeadline = -1 (one day overdue)", () => {
    const today = new Date("2026-04-01T00:00:00Z");
    const deadline = getDeadlineForQuarter(2025, 4);
    const status = classifyFilingStatus(today, {
      filingDate: null,
      quarter: 4,
      year: 2025,
      deadline,
    });
    expect(status.status).toBe("QUA_HAN");
    expect(status.daysUntilDeadline).toBe(-1);
  });
});
