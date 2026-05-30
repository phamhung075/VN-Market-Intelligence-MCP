/**
 * VN Trading Calendar — DWF-DEV-MCP-1
 *
 * Pure domain function: determine if a given date is a VN exchange trading day.
 * Uses embedded holiday data (vnHolidayData.ts). No network, no database.
 *
 * GMT+7 timezone handling:
 *   All dates are interpreted as YYYY-MM-DD in VN local time (UTC+7).
 *   Weekend detection: a date is a weekend if it falls on Saturday (day=6)
 *   or Sunday (day=0) in VN local time. We use UTC date arithmetic after
 *   shifting to VN midnight (add 7 × 3600000 ms to get VN midnight in UTC terms).
 *
 * @module domain/services/vnTradingCalendar
 */

import { VN_HOLIDAYS, VN_HALF_DAYS, VN_CALENDAR_LAST_YEAR } from "./vnHolidayData.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type SessionStatus = "open" | "holiday" | "half_day" | "weekend" | "unknown";

export interface TradingDayResult {
  /** The queried date in YYYY-MM-DD format (VN timezone) */
  date: string;
  /** True if HOSE/HNX is open for full or half-day trading */
  is_trading_day: boolean;
  /** Session classification */
  session_status: SessionStatus;
  /** Primary exchange; HOSE is primary, HNX follows the same calendar */
  exchange: "HOSE" | "HNX";
  /** Optional: holiday name in Vietnamese, or reason for closure */
  note?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** GMT+7 offset in milliseconds */
const GMT7_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Last boundary year covered by embedded calendar */
const LAST_CALENDAR_YEAR = VN_CALENDAR_LAST_YEAR;

// ─────────────────────────────────────────────────────────────────────────────
// Core function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Determine whether a given YYYY-MM-DD date is a VN exchange trading day.
 *
 * Rules (evaluated in order):
 *  1. If the year > LAST_CALENDAR_YEAR → "unknown" (calendar not yet loaded)
 *  2. If the date is in VN_HOLIDAYS     → "holiday" (exchange closed)
 *  3. If the date is Saturday or Sunday → "weekend" (exchange closed)
 *  4. If the date is in VN_HALF_DAYS   → "half_day" (open, shortened session)
 *  5. Otherwise                         → "open"
 *
 * Weekend detection uses UTC day-of-week after adjusting for VN midnight:
 *   `new Date(Date.UTC(year, month, day))` gives midnight UTC for the VN date,
 *   which is equivalent to VN midnight minus 7h (i.e. 17:00 UTC day-1).
 *   To get the VN day-of-week we parse the YYYY-MM-DD parts directly — this
 *   is DST-safe and timezone-agnostic.
 *
 * @param date - ISO date string in YYYY-MM-DD format (interpreted as VN timezone)
 * @returns TradingDayResult
 */
export function isVnTradingDay(date: string): TradingDayResult {
  // ── Validate format ────────────────────────────────────────────────────────
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return {
      date,
      is_trading_day: false,
      session_status: "unknown",
      exchange: "HOSE",
      note: "Invalid date format — expected YYYY-MM-DD",
    };
  }

  const year = parseInt(date.slice(0, 4), 10);
  const month = parseInt(date.slice(5, 7), 10) - 1; // 0-indexed for Date
  const day = parseInt(date.slice(8, 10), 10);

  // ── Rule 1: future boundary ────────────────────────────────────────────────
  if (year > LAST_CALENDAR_YEAR) {
    return {
      date,
      is_trading_day: false,
      session_status: "unknown",
      exchange: "HOSE",
      note: `Calendar data not available beyond ${LAST_CALENDAR_YEAR}`,
    };
  }

  // ── Rule 2: holiday ────────────────────────────────────────────────────────
  if (date in VN_HOLIDAYS) {
    const holidayName = VN_HOLIDAYS[date] ?? date;
    return {
      date,
      is_trading_day: false,
      session_status: "holiday",
      exchange: "HOSE",
      note: holidayName,
    };
  }

  // ── Rule 3: weekend ────────────────────────────────────────────────────────
  // Use Date.UTC with parsed YYYY-MM-DD components — avoids local timezone DST
  // ambiguity. getUTCDay() on a UTC midnight Date gives the correct ISO weekday.
  const utcMidnight = new Date(Date.UTC(year, month, day));
  const dayOfWeek = utcMidnight.getUTCDay(); // 0 = Sunday, 6 = Saturday

  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return {
      date,
      is_trading_day: false,
      session_status: "weekend",
      exchange: "HOSE",
      note: dayOfWeek === 6 ? "Thứ Bảy" : "Chủ Nhật",
    };
  }

  // ── Rule 4: half-day ──────────────────────────────────────────────────────
  if (VN_HALF_DAYS.has(date)) {
    return {
      date,
      is_trading_day: true,
      session_status: "half_day",
      exchange: "HOSE",
      note: "Phiên giao dịch rút ngắn (buổi sáng)",
    };
  }

  // ── Rule 5: open ──────────────────────────────────────────────────────────
  return {
    date,
    is_trading_day: true,
    session_status: "open",
    exchange: "HOSE",
  };
}

/**
 * Get today's date in VN timezone (GMT+7) as YYYY-MM-DD.
 *
 * Uses UTC epoch + 7h offset to determine VN calendar date, avoiding
 * reliance on the server's local timezone.
 *
 * @returns YYYY-MM-DD string representing today in VN timezone
 */
export function getTodayVnDate(): string {
  const nowUtcMs = Date.now();
  const vnNowMs = nowUtcMs + GMT7_OFFSET_MS;
  const vnDate = new Date(vnNowMs);
  // toISOString() gives UTC — using the VN-shifted timestamp we get the VN date
  const iso = vnDate.toISOString(); // e.g. "2025-01-27T07:30:00.000Z"
  return iso.slice(0, 10); // "2025-01-27"
}
