/**
 * Task 1423e — get_macro_calendar domain service tests
 *
 * Tests:
 *   - isPivotMonth: correct months flagged
 *   - getMacroCalendar: 60-day window returns only events within range
 *   - getMacroCalendar: events sorted by date ascending
 *   - getMacroCalendar: isPivotWindow correctly annotated on each event
 *   - getMacroCalendar: currentMonthIsPivotWindow flag
 *   - nextPivotWindowLabel: returns correct label
 *   - buildPivotWindowWarning: non-null within 14 days of pivot month
 *   - buildPivotWindowWarning: null when more than 14 days away
 *   - custom days parameter respected
 */

import { describe, it, expect } from "bun:test";
import {
  getMacroCalendar,
  isPivotMonth,
  nextPivotWindowLabel,
  buildPivotWindowWarning,
} from "../domain/services/macro/macroCalendar.js";

describe("Task 1423e — macroCalendar domain service", () => {
  // ── isPivotMonth ────────────────────────────────────────────────────────────
  describe("isPivotMonth", () => {
    it("returns true for months 3, 6, 9, 12", () => {
      expect(isPivotMonth(3)).toBe(true);
      expect(isPivotMonth(6)).toBe(true);
      expect(isPivotMonth(9)).toBe(true);
      expect(isPivotMonth(12)).toBe(true);
    });

    it("returns false for non-pivot months", () => {
      expect(isPivotMonth(1)).toBe(false);
      expect(isPivotMonth(2)).toBe(false);
      expect(isPivotMonth(4)).toBe(false);
      expect(isPivotMonth(5)).toBe(false);
      expect(isPivotMonth(7)).toBe(false);
      expect(isPivotMonth(8)).toBe(false);
      expect(isPivotMonth(10)).toBe(false);
      expect(isPivotMonth(11)).toBe(false);
    });
  });

  // ── 60-day window filtering ────────────────────────────────────────────────
  describe("getMacroCalendar - 60-day window filtering", () => {
    it("returns events within the default 60-day window", () => {
      const ref = new Date("2026-01-01");
      const result = getMacroCalendar(ref);

      // All events must be within [2026-01-01, 2026-03-01] (60 days)
      const endDate = "2026-03-01";
      for (const event of result.events) {
        expect(event.date >= "2026-01-01").toBe(true);
        expect(event.date <= endDate).toBe(true);
      }
    });

    it("excludes events outside the window", () => {
      const ref = new Date("2026-01-01");
      const result = getMacroCalendar(ref, 30);

      // No event after 2026-01-30 should appear
      const endDate = "2026-01-30";
      for (const event of result.events) {
        expect(event.date <= endDate).toBe(true);
      }
    });

    it("returns at least some events for a standard 60-day window in Jan 2026", () => {
      const ref = new Date("2026-01-01");
      const result = getMacroCalendar(ref);
      expect(result.events.length).toBeGreaterThan(0);
    });
  });

  // ── Events sorted ascending ────────────────────────────────────────────────
  describe("getMacroCalendar - sort order", () => {
    it("returns events sorted by date ascending", () => {
      const ref = new Date("2026-01-01");
      const result = getMacroCalendar(ref);

      for (let i = 1; i < result.events.length; i++) {
        const curr = result.events[i]!;
        const prev = result.events[i - 1]!;
        expect(curr.date >= prev.date).toBe(true);
      }
    });
  });

  // ── isPivotWindow annotation ───────────────────────────────────────────────
  describe("getMacroCalendar - isPivotWindow annotation", () => {
    it("marks events in March as isPivotWindow=true", () => {
      // Look at a 60-day window starting Feb 20 to capture March events
      const ref = new Date("2026-02-20");
      const result = getMacroCalendar(ref, 60);

      const marchEvents = result.events.filter((e) => e.date.startsWith("2026-03"));
      expect(marchEvents.length).toBeGreaterThan(0);
      for (const event of marchEvents) {
        expect(event.isPivotWindow).toBe(true);
      }
    });

    it("marks events in January as isPivotWindow=false", () => {
      const ref = new Date("2026-01-01");
      const result = getMacroCalendar(ref, 25); // stay in January

      const janEvents = result.events.filter((e) => e.date.startsWith("2026-01"));
      expect(janEvents.length).toBeGreaterThan(0);
      for (const event of janEvents) {
        expect(event.isPivotWindow).toBe(false);
      }
    });

    it("marks June events as isPivotWindow=true", () => {
      const ref = new Date("2026-06-01");
      const result = getMacroCalendar(ref, 30);

      const juneEvents = result.events.filter((e) => e.date.startsWith("2026-06"));
      expect(juneEvents.length).toBeGreaterThan(0);
      for (const event of juneEvents) {
        expect(event.isPivotWindow).toBe(true);
      }
    });
  });

  // ── currentMonthIsPivotWindow ──────────────────────────────────────────────
  describe("getMacroCalendar - currentMonthIsPivotWindow", () => {
    it("is true when referenceDate is in March", () => {
      const ref = new Date("2026-03-10");
      const result = getMacroCalendar(ref);
      expect(result.currentMonthIsPivotWindow).toBe(true);
    });

    it("is false when referenceDate is in January", () => {
      const ref = new Date("2026-01-15");
      const result = getMacroCalendar(ref);
      expect(result.currentMonthIsPivotWindow).toBe(false);
    });

    it("is true when referenceDate is in December", () => {
      const ref = new Date("2026-12-01");
      const result = getMacroCalendar(ref);
      expect(result.currentMonthIsPivotWindow).toBe(true);
    });
  });

  // ── nextPivotWindowLabel ───────────────────────────────────────────────────
  describe("nextPivotWindowLabel", () => {
    it("returns March 2026 when reference is in January 2026", () => {
      const ref = new Date("2026-01-15");
      expect(nextPivotWindowLabel(ref)).toBe("March 2026");
    });

    it("returns June 2026 when reference is in April 2026", () => {
      const ref = new Date("2026-04-10");
      expect(nextPivotWindowLabel(ref)).toBe("June 2026");
    });

    it("returns March 2027 when reference is in December 2026", () => {
      const ref = new Date("2026-12-01");
      expect(nextPivotWindowLabel(ref)).toBe("March 2027");
    });

    it("returns June 2026 when reference is in May 2026", () => {
      const ref = new Date("2026-05-20");
      expect(nextPivotWindowLabel(ref)).toBe("June 2026");
    });
  });

  // ── buildPivotWindowWarning ────────────────────────────────────────────────
  describe("buildPivotWindowWarning", () => {
    it("returns non-null warning within 14 days of a pivot month", () => {
      // Feb 20 is 8 days before March 1
      const ref = new Date("2026-02-20");
      const warning = buildPivotWindowWarning(ref);
      expect(warning).not.toBeNull();
      expect(warning).toContain("March 2026");
    });

    it("returns null when more than 14 days from pivot month", () => {
      // Jan 15 is 44 days before March 1 — well outside the window
      const ref = new Date("2026-01-15");
      const warning = buildPivotWindowWarning(ref);
      expect(warning).toBeNull();
    });

    it("returns non-null warning within 14 days before June", () => {
      // May 20 is 11 days before June 1
      const ref = new Date("2026-05-20");
      const warning = buildPivotWindowWarning(ref);
      expect(warning).not.toBeNull();
      expect(warning).toContain("June 2026");
    });

    it("returns null in early May — 30+ days from June", () => {
      const ref = new Date("2026-05-01");
      const warning = buildPivotWindowWarning(ref);
      expect(warning).toBeNull();
    });
  });

  // ── custom days parameter ──────────────────────────────────────────────────
  describe("getMacroCalendar - custom days parameter", () => {
    it("respects days=7: only events within 7 days", () => {
      const ref = new Date("2026-01-01");
      const result = getMacroCalendar(ref, 7);

      const endDate = "2026-01-07";
      for (const event of result.events) {
        expect(event.date <= endDate).toBe(true);
      }
    });

    it("days=365 returns more events than days=30", () => {
      const ref = new Date("2026-01-01");
      const short = getMacroCalendar(ref, 30);
      const long = getMacroCalendar(ref, 365);
      expect(long.events.length).toBeGreaterThan(short.events.length);
    });
  });

  // ── result shape ───────────────────────────────────────────────────────────
  describe("getMacroCalendar - result shape", () => {
    it("each event has required fields with correct types", () => {
      const ref = new Date("2026-01-01");
      const result = getMacroCalendar(ref, 60);

      expect(result).toHaveProperty("events");
      expect(result).toHaveProperty("currentMonthIsPivotWindow");
      expect(result).toHaveProperty("nextPivotWindow");
      expect(result).toHaveProperty("pivotWindowWarning");

      for (const event of result.events) {
        expect(typeof event.date).toBe("string");
        expect(event.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(typeof event.name).toBe("string");
        expect(typeof event.type).toBe("string");
        expect(typeof event.source).toBe("string");
        expect(typeof event.isPivotWindow).toBe("boolean");
        expect(typeof event.description).toBe("string");
      }
    });
  });
});
