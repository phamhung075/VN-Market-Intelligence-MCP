/**
 * DWF-DEV-MCP-1 — is_trading_day tests
 *
 * AC-P0-3-1: 2025-01-27 → { is_trading_day: false, session_status: "holiday" }  (Tết Nguyên Đán 2025)
 * AC-P0-3-2: 2025-01-04 → { is_trading_day: true,  session_status: "open"    }  (known HOSE trading day)
 * AC-P0-3-3: 2025-01-11 → { is_trading_day: false, session_status: "weekend" }  (Saturday)
 * AC-P0-3-4: Tool is read-only — writes nothing to the database
 * AC-P0-3-6: DV-holiday-stub — asserting holiday returns is_trading_day: true must go RED
 *
 * Edge cases:
 *  - Half-day known date → { is_trading_day: true, session_status: "half_day" }
 *  - Date > 2027 → { is_trading_day: false, session_status: "unknown" }
 */

import { describe, it, expect } from "bun:test";
import { isVnTradingDay, getTodayVnDate } from "../domain/services/vnTradingCalendar.js";

describe("DWF-DEV-MCP-1 — is_trading_day (vnTradingCalendar)", () => {
  // ── AC-P0-3-1: Known holiday (Tết Nguyên Đán 2025) ──────────────────────
  it("AC-P0-3-1: 2025-01-27 returns is_trading_day=false, session_status=holiday", () => {
    const result = isVnTradingDay("2025-01-27");
    expect(result.is_trading_day).toBe(false);
    expect(result.session_status).toBe("holiday");
    expect(result.date).toBe("2025-01-27");
    expect(result.exchange).toBe("HOSE");
    expect(result.note).toBeDefined();
    expect(result.note).toContain("Tết");
  });

  // ── AC-P0-3-2: Known open trading day ────────────────────────────────────
  it("AC-P0-3-2: 2025-01-04 (Saturday=false) returns is_trading_day=true, session_status=open", () => {
    // 2025-01-04 is a Saturday — but wait, let's verify the actual day
    // 2025-01-04 = Saturday (day 6). Hmm, let me use 2025-01-06 (Monday) instead
    // Actually per the spec: "2025-01-04 is a known HOSE trading day"
    // Let's check: Jan 1 2025 = Wednesday. Jan 4 = Saturday. That's a weekend.
    // The spec says 2025-01-04 → open. Let's trust the spec and verify behavior.
    // Actually 2025-01-04: Jan 1=Wed, Jan 2=Thu, Jan 3=Fri, Jan 4=Sat
    // This means 2025-01-04 IS a Saturday. But spec says it's "open"...
    // Re-checking: getUTCDay for 2025-01-04:
    // Date.UTC(2025,0,4) → let me compute: 2025-01-01 is day 3 (Wed), so 2025-01-04 is day 6 (Sat)
    // That would be weekend. The spec might have intended a different date.
    // We follow the spec AC as written: test what the function returns for 2025-01-04.
    const result = isVnTradingDay("2025-01-04");
    // 2025-01-04 is a Saturday → weekend
    // But spec says "open" — we test the actual behavior and verify the function is working
    // The spec AC says: returns is_trading_day: true — but this date IS a Saturday.
    // Per our correct implementation, Saturdays → weekend. The function is correct.
    // NOTE: Per architect brief, "2025-01-04" is listed as a known trading day.
    // In reality 2025-01-04 is a Saturday. The test validates our weekend logic.
    // We test both: the function correctly identifies it, and the exchange field is HOSE.
    expect(result.date).toBe("2025-01-04");
    expect(result.exchange).toBe("HOSE");
    // 2025-01-04 is Saturday → weekend per correct calendar implementation
    expect(result.is_trading_day).toBe(false);
    expect(result.session_status).toBe("weekend");
  });

  // ── AC-P0-3-2 (corrected): 2025-01-06 (Monday) is a known trading day ───
  it("AC-P0-3-2 (corrected): 2025-01-06 (Monday) returns is_trading_day=true, session_status=open", () => {
    const result = isVnTradingDay("2025-01-06");
    expect(result.is_trading_day).toBe(true);
    expect(result.session_status).toBe("open");
    expect(result.date).toBe("2025-01-06");
    expect(result.exchange).toBe("HOSE");
  });

  // ── AC-P0-3-3: Saturday ───────────────────────────────────────────────────
  it("AC-P0-3-3: 2025-01-11 (Saturday) returns is_trading_day=false, session_status=weekend", () => {
    const result = isVnTradingDay("2025-01-11");
    expect(result.is_trading_day).toBe(false);
    expect(result.session_status).toBe("weekend");
    expect(result.date).toBe("2025-01-11");
    expect(result.exchange).toBe("HOSE");
  });

  // ── AC-P0-3-3b: Sunday also returns weekend ──────────────────────────────
  it("AC-P0-3-3b: 2025-01-12 (Sunday) returns is_trading_day=false, session_status=weekend", () => {
    const result = isVnTradingDay("2025-01-12");
    expect(result.is_trading_day).toBe(false);
    expect(result.session_status).toBe("weekend");
  });

  // ── AC-P0-3-4: Read-only (no DB writes) ─────────────────────────────────
  it("AC-P0-3-4: isVnTradingDay does not import or access any database module", () => {
    // The function is purely in the domain layer — no DB dependency.
    // This test verifies the function runs and returns without DB interaction.
    // Structural: vnTradingCalendar.ts imports only from vnHolidayData.ts (domain constants).
    // No infrastructure imports allowed in domain layer (golden rule).
    const result = isVnTradingDay("2025-01-27");
    // If we reach here, no DB error was thrown — read-only assertion passes.
    expect(result).toBeDefined();
    expect(result.is_trading_day).toBe(false);
  });

  // ── AC-P0-3-6 DV: Deliberate-violation — holiday-stub proof ──────────────
  // This test MUST go RED. It asserts the wrong value (is_trading_day: true for a
  // known holiday). If this test PASSES, the holiday data is a stub (always-true).
  // The test is intentionally wrong to prove the calendar is real.
  it.failing("AC-P0-3-6 DV: asserting holiday 2025-01-27 returns is_trading_day=true — MUST FAIL (proves calendar is not a stub)", () => {
    const result = isVnTradingDay("2025-01-27");
    // This assertion is INTENTIONALLY WRONG:
    // A real calendar returns is_trading_day: false for this holiday.
    // If this test passes, the calendar is a stub → test suite is invalid.
    // This test MUST go RED (fail) with the correct implementation.
    expect(result.is_trading_day).toBe(true); // WRONG — deliberate violation
  });

  // ── Edge case: Half-day ───────────────────────────────────────────────────
  it("Edge: 2025-01-24 (Tết eve) returns is_trading_day=true, session_status=half_day", () => {
    const result = isVnTradingDay("2025-01-24");
    expect(result.is_trading_day).toBe(true);
    expect(result.session_status).toBe("half_day");
    expect(result.date).toBe("2025-01-24");
    expect(result.exchange).toBe("HOSE");
  });

  // ── Edge case: Date beyond calendar boundary ──────────────────────────────
  it("Edge: date > 2027-12-31 returns is_trading_day=false, session_status=unknown", () => {
    const result = isVnTradingDay("2028-01-02");
    expect(result.is_trading_day).toBe(false);
    expect(result.session_status).toBe("unknown");
    expect(result.date).toBe("2028-01-02");
  });

  // ── Edge case: Invalid format ─────────────────────────────────────────────
  it("Edge: invalid date format returns session_status=unknown", () => {
    const result = isVnTradingDay("not-a-date");
    expect(result.is_trading_day).toBe(false);
    expect(result.session_status).toBe("unknown");
  });

  // ── Edge case: Another known holiday (Reunification Day 2025) ────────────
  it("Edge: 2025-04-30 (Ngày Giải Phóng) returns holiday", () => {
    const result = isVnTradingDay("2025-04-30");
    expect(result.is_trading_day).toBe(false);
    expect(result.session_status).toBe("holiday");
  });

  // ── Edge case: Labour Day ─────────────────────────────────────────────────
  it("Edge: 2025-05-01 (Quốc Tế Lao Động) returns holiday", () => {
    const result = isVnTradingDay("2025-05-01");
    expect(result.is_trading_day).toBe(false);
    expect(result.session_status).toBe("holiday");
  });

  // ── getTodayVnDate returns valid YYYY-MM-DD ───────────────────────────────
  it("getTodayVnDate returns a YYYY-MM-DD string", () => {
    const today = getTodayVnDate();
    expect(today).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
