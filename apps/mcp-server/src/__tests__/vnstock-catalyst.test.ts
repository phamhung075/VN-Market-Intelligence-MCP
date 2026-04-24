/**
 * Task 280 — Corporate Events Catalyst Calendar
 * Tests for getUpcomingCatalysts() domain service.
 */

import { describe, it, expect } from "bun:test";
import {
  getUpcomingCatalysts,
  type CatalystEvent,
} from "../domain/services/catalystCalendar.js";
import type { VnstockEvent } from "../infrastructure/fetchers/vnstockBridge.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeEvent(
  code: string,
  eventDate: string,
  eventType: string,
  eventName = "",
  description = "",
): VnstockEvent {
  return {
    code,
    eventName: eventName || eventType,
    eventDate,
    eventType,
    description,
  };
}

const TODAY = "2026-04-03";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 280 — Catalyst Calendar", () => {
  // 1. Empty inputs
  it("returns empty array when no events and no BCTC deadlines", () => {
    const result = getUpcomingCatalysts([], [], TODAY);
    expect(result).toEqual([]);
  });

  // 2. Past events are filtered out
  it("filters out events in the past", () => {
    const events: VnstockEvent[] = [
      makeEvent("VNM", "2026-03-15", "Dividend", "Trả cổ tức"),
      makeEvent("FPT", "2026-04-02", "AGM", "Đại hội cổ đông"),
    ];
    const result = getUpcomingCatalysts(events, [], TODAY);
    expect(result).toHaveLength(0);
  });

  // 3. Future dividend is included
  it("includes upcoming dividend event with positive priceImpact", () => {
    const events: VnstockEvent[] = [
      makeEvent("VNM", "2026-04-15", "Dividend", "Trả cổ tức tiền mặt"),
    ];
    const result = getUpcomingCatalysts(events, [], TODAY);
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("VNM");
    expect(result[0]!.eventType).toBe("dividend");
    expect(result[0]!.priceImpact).toBe("positive");
    expect(result[0]!.daysUntil).toBe(12);
  });

  // 4. AGM event is included
  it("includes upcoming AGM event with neutral priceImpact", () => {
    const events: VnstockEvent[] = [
      makeEvent("FPT", "2026-04-10", "AGM", "Đại hội đồng cổ đông"),
    ];
    const result = getUpcomingCatalysts(events, [], TODAY);
    expect(result).toHaveLength(1);
    expect(result[0]!.eventType).toBe("agm");
    expect(result[0]!.priceImpact).toBe("neutral");
    expect(result[0]!.daysUntil).toBe(7);
  });

  // 5. Share issuance has negative priceImpact
  it("maps Share Issuance to negative priceImpact", () => {
    const events: VnstockEvent[] = [
      makeEvent("VCB", "2026-04-20", "Share Issuance", "Phát hành thêm cổ phiếu"),
    ];
    const result = getUpcomingCatalysts(events, [], TODAY);
    expect(result).toHaveLength(1);
    expect(result[0]!.eventType).toBe("share_issuance");
    expect(result[0]!.priceImpact).toBe("negative");
  });

  // 6. BCTC deadline is included and mapped to bctc_deadline type
  it("includes BCTC deadline within window", () => {
    const bctcDeadlines = [{ code: "VNM", deadline: "2026-04-25" }];
    const result = getUpcomingCatalysts([], bctcDeadlines, TODAY);
    expect(result).toHaveLength(1);
    expect(result[0]!.code).toBe("VNM");
    expect(result[0]!.eventType).toBe("bctc_deadline");
    expect(result[0]!.priceImpact).toBe("neutral");
  });

  // 7. BCTC deadline outside window is excluded
  it("excludes BCTC deadline beyond default 30-day window", () => {
    const bctcDeadlines = [{ code: "FPT", deadline: "2026-06-01" }];
    const result = getUpcomingCatalysts([], bctcDeadlines, TODAY);
    expect(result).toHaveLength(0);
  });

  // 8. Window parameter is respected
  it("respects custom windowDays parameter", () => {
    const bctcDeadlines = [{ code: "FPT", deadline: "2026-06-01" }];
    // 59 days from today — inside 60-day window
    const result = getUpcomingCatalysts([], bctcDeadlines, TODAY, 60);
    expect(result).toHaveLength(1);
  });

  // 9. Multiple events mixed with BCTC deadlines
  it("returns all upcoming events from both sources combined", () => {
    const events: VnstockEvent[] = [
      makeEvent("VNM", "2026-04-15", "Dividend"),
      makeEvent("FPT", "2026-04-20", "AGM"),
    ];
    const bctcDeadlines = [{ code: "VCB", deadline: "2026-04-28" }];
    const result = getUpcomingCatalysts(events, bctcDeadlines, TODAY);
    expect(result).toHaveLength(3);
  });

  // 10. Unknown event types map to "other"
  it("maps unknown event types to 'other'", () => {
    const events: VnstockEvent[] = [
      makeEvent("VEA", "2026-04-10", "BondIssuance", "Phát hành trái phiếu"),
    ];
    const result = getUpcomingCatalysts(events, [], TODAY);
    expect(result).toHaveLength(1);
    expect(result[0]!.eventType).toBe("other");
  });

  // 11. daysUntil is correctly calculated
  it("correctly calculates daysUntil for today event", () => {
    const events: VnstockEvent[] = [
      makeEvent("VNM", TODAY, "Dividend"),
    ];
    const result = getUpcomingCatalysts(events, [], TODAY);
    expect(result).toHaveLength(1);
    expect(result[0]!.daysUntil).toBe(0);
  });

  // 12. Results are sorted by daysUntil ascending
  it("sorts results by daysUntil ascending", () => {
    const events: VnstockEvent[] = [
      makeEvent("FPT", "2026-04-25", "AGM"),
      makeEvent("VNM", "2026-04-08", "Dividend"),
      makeEvent("VCB", "2026-04-15", "Share Issuance"),
    ];
    const result = getUpcomingCatalysts(events, [], TODAY);
    expect(result).toHaveLength(3);
    expect(result[0]!.daysUntil).toBeLessThanOrEqual(result[1]!.daysUntil);
    expect(result[1]!.daysUntil).toBeLessThanOrEqual(result[2]!.daysUntil);
  });

  // 13. description field is populated
  it("populates description field from event description", () => {
    const events: VnstockEvent[] = [
      makeEvent("VNM", "2026-04-15", "Dividend", "Trả cổ tức", "Cổ tức 2.000đ/CP"),
    ];
    const result = getUpcomingCatalysts(events, [], TODAY);
    expect(result[0]!.description).toBe("Cổ tức 2.000đ/CP");
  });

  // 14. Exactly on window boundary (30 days) is included
  it("includes event exactly on the 30-day boundary", () => {
    const events: VnstockEvent[] = [
      makeEvent("FPT", "2026-05-03", "AGM"),  // exactly 30 days from 2026-04-03
    ];
    const result = getUpcomingCatalysts(events, [], TODAY);
    expect(result).toHaveLength(1);
    expect(result[0]!.daysUntil).toBe(30);
  });

  // 15. BCTC deadline past is filtered
  it("filters out BCTC deadline in the past", () => {
    const bctcDeadlines = [{ code: "VNM", deadline: "2026-03-31" }];
    const result = getUpcomingCatalysts([], bctcDeadlines, TODAY);
    expect(result).toHaveLength(0);
  });
});
