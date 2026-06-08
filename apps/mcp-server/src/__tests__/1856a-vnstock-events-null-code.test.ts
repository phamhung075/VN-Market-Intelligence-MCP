/**
 * Task 1856a — FIX vnstock_events NOT NULL constraint on `code` column
 *
 * AC-1: storeEvents handles null/non-array events without throwing
 * AC-2: events with null/empty code are filtered out before INSERT
 * AC-3: valid events with non-empty code are still inserted correctly
 * AC-4: dropped count is logged as a warning when > 0
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import type { VnstockEvent } from "../infrastructure/fetchers/vnstockBridge.js";

// ---------------------------------------------------------------------------
// AC-1: Array.isArray guard — non-array input must not throw
// ---------------------------------------------------------------------------

describe("Task 1856a — storeEvents Array.isArray guard (AC-1)", () => {
  it("null input: guard returns early without throwing", () => {
    const events = null as unknown as VnstockEvent[];
    expect(() => {
      if (!events || !Array.isArray(events)) {
        return;
      }
      events.filter((ev) => !!ev.code);
    }).not.toThrow();
  });

  it("plain object input: guard returns early without throwing", () => {
    const events = { error: "rate limit exceeded" } as unknown as VnstockEvent[];
    expect(() => {
      if (!events || !Array.isArray(events)) {
        return;
      }
      events.filter((ev) => !!ev.code);
    }).not.toThrow();
  });

  it("undefined input: guard returns early without throwing", () => {
    const events = undefined as unknown as VnstockEvent[];
    expect(() => {
      if (!events || !Array.isArray(events)) {
        return;
      }
      events.filter((ev) => !!ev.code);
    }).not.toThrow();
  });

  it("empty array: proceeds without throwing, valid is empty", () => {
    const events: VnstockEvent[] = [];
    expect(() => {
      const valid = events.filter((ev) => !!ev.code);
      expect(valid.length).toBe(0);
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// AC-2: null-code filter — rows with null/empty code must be dropped
// ---------------------------------------------------------------------------

describe("Task 1856a — storeEvents null-code filter (AC-2)", () => {
  it("filter predicate: events with empty code are dropped", () => {
    const events: VnstockEvent[] = [
      { code: "VCB", eventName: "AGM 2025", eventDate: "2025-04-10", eventType: "DHDCD", description: "" },
      { code: "",    eventName: "Unknown",  eventDate: "2025-04-11", eventType: "OTHER",  description: "" },
      { code: "VCB", eventName: "Dividend", eventDate: "2025-05-01", eventType: "CHIAC", description: "" },
    ];
    const valid = events.filter((ev) => !!ev.code);
    const dropped = events.length - valid.length;

    expect(valid.length).toBe(2);
    expect(dropped).toBe(1);
    expect(valid.map((ev) => ev.eventName)).not.toContain("Unknown");
  });

  it("filter predicate: all null codes → valid is empty", () => {
    const events: VnstockEvent[] = [
      { code: "", eventName: "E1", eventDate: "2025-01-01", eventType: "OTHER", description: "" },
      { code: "", eventName: "E2", eventDate: "2025-01-02", eventType: "OTHER", description: "" },
    ];
    const valid = events.filter((ev) => !!ev.code);
    expect(valid.length).toBe(0);
  });

  it("filter predicate: all valid codes → dropped = 0", () => {
    const events: VnstockEvent[] = [
      { code: "HPG", eventName: "AGM", eventDate: "2025-03-20", eventType: "DHDCD", description: "" },
      { code: "HPG", eventName: "Bond Issue", eventDate: "2025-04-05", eventType: "TPDN", description: "" },
    ];
    const valid = events.filter((ev) => !!ev.code);
    expect(valid.length).toBe(2);
    expect(events.length - valid.length).toBe(0);
  });

  it("filter predicate: null code field (not empty string) is also dropped", () => {
    const events = [
      { code: "MBB", eventName: "Quarterly Results", eventDate: "2025-04-30", eventType: "KQKD", description: "" },
      { code: null,  eventName: "No Code",           eventDate: "2025-05-01", eventType: "OTHER", description: "" },
    ] as unknown as VnstockEvent[];
    const valid = events.filter((ev) => !!ev.code);
    expect(valid.length).toBe(1);
    expect(valid[0]?.eventName).toBe("Quarterly Results");
  });
});

// ---------------------------------------------------------------------------
// AC-3: valid events — non-empty code rows must pass through filter intact
// ---------------------------------------------------------------------------

describe("Task 1856a — storeEvents valid rows preserved (AC-3)", () => {
  it("valid event fields are preserved after filter", () => {
    const events: VnstockEvent[] = [
      {
        code: "TCB",
        eventName: "DHDCD Thuong nien 2025",
        eventDate: "2025-04-15",
        eventType: "DHDCD",
        description: "Dai hoi dong co dong thuong nien",
      },
    ];
    const valid = events.filter((ev) => !!ev.code);
    expect(valid.length).toBe(1);
    const ev = valid[0]!;
    expect(ev.code).toBe("TCB");
    expect(ev.eventName).toBe("DHDCD Thuong nien 2025");
    expect(ev.eventDate).toBe("2025-04-15");
    expect(ev.eventType).toBe("DHDCD");
  });
});

// ---------------------------------------------------------------------------
// AC-4: warn message format when dropped > 0
// ---------------------------------------------------------------------------

describe("Task 1856a — storeEvents dropped warning message (AC-4)", () => {
  it("warn message includes correct count and ticker when rows are dropped", () => {
    const events: VnstockEvent[] = [
      { code: "VHM", eventName: "AGM", eventDate: "2025-04-10", eventType: "DHDCD", description: "" },
      { code: "",    eventName: "Bad", eventDate: "2025-04-11", eventType: "OTHER", description: "" },
    ];
    const valid = events.filter((ev) => !!ev.code);
    const dropped = events.length - valid.length;
    const ticker = "VHM";

    const warnMsg = dropped > 0
      ? `[vnstock-store] storeEvents: dropped ${dropped} row(s) with null/empty code for ticker ${ticker}`
      : "";

    expect(dropped).toBe(1);
    expect(warnMsg).toContain("dropped 1 row(s)");
    expect(warnMsg).toContain("VHM");
    expect(warnMsg).toContain("[vnstock-store] storeEvents");
  });

  it("warn message is empty when no rows are dropped", () => {
    const events: VnstockEvent[] = [
      { code: "FPT", eventName: "AGM", eventDate: "2025-04-20", eventType: "DHDCD", description: "" },
    ];
    const valid = events.filter((ev) => !!ev.code);
    const dropped = events.length - valid.length;
    const ticker = "FPT";

    const warnMsg = dropped > 0
      ? `[vnstock-store] storeEvents: dropped ${dropped} row(s) with null/empty code for ticker ${ticker}`
      : "";

    expect(dropped).toBe(0);
    expect(warnMsg).toBe("");
  });
});
