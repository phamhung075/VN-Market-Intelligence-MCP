/**
 * FIX-CASCADE-CARD-INVALID-DATE — formatDate helper unit tests
 *
 * TDD: RED first (file written before implementation is complete),
 * GREEN after helpers are wired.
 *
 * Suites:
 *   1. parseDate   — null / empty / bare-SQLite / ISO / millis / offset / garbage
 *   2. formatDateVi        — full locale date+time, "—" fallbacks
 *   3. formatDateOnlyVi    — date-only locale, "—" fallbacks
 *   4. formatSignalTimestamp — compact HH:mm / MM-DD HH:mm, "—" fallback
 */

import { describe, it, expect } from "vitest";
import {
  parseDate,
  formatDateVi,
  formatDateOnlyVi,
  formatSignalTimestamp,
} from "~/lib/formatDate";

// ---------------------------------------------------------------------------
// Suite 1 — parseDate
// ---------------------------------------------------------------------------

describe("parseDate", () => {
  it("null → null", () => {
    expect(parseDate(null)).toBeNull();
  });

  it("undefined → null", () => {
    expect(parseDate(undefined)).toBeNull();
  });

  it("empty string → null", () => {
    expect(parseDate("")).toBeNull();
  });

  it("bare SQLite 'YYYY-MM-DD HH:MM:SS' → valid Date", () => {
    const d = parseDate("2026-06-10 14:35:22");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getTime()).not.toBeNaN();
  });

  it("ISO with T and Z → valid Date", () => {
    const d = parseDate("2026-06-10T14:35:22Z");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getTime()).not.toBeNaN();
  });

  it("ISO with milliseconds → valid Date", () => {
    const d = parseDate("2026-06-10T14:35:22.000Z");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getTime()).not.toBeNaN();
  });

  it("ISO with positive offset → valid Date", () => {
    const d = parseDate("2026-06-10T14:35:22+07:00");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getTime()).not.toBeNaN();
  });

  it("ISO with negative offset → valid Date", () => {
    const d = parseDate("2026-06-10T14:35:22-05:00");
    expect(d).toBeInstanceOf(Date);
    expect(d!.getTime()).not.toBeNaN();
  });

  it("garbage string → null", () => {
    expect(parseDate("not-a-date")).toBeNull();
  });

  it("string with only letters → null", () => {
    expect(parseDate("Invalid Date")).toBeNull();
  });

  it("bare SQLite without time component → valid Date", () => {
    // "YYYY-MM-DD" alone becomes "YYYY-MM-DDZ" after our normalization
    // Date("YYYY-MM-DDZ") is valid
    const d = parseDate("2026-06-10");
    // This input has no space → treated as ISO → Date() parses "YYYY-MM-DD" as UTC midnight
    expect(d).toBeInstanceOf(Date);
    expect(d!.getTime()).not.toBeNaN();
  });

  it("already-ISO with T not duplicated", () => {
    // Ensure T-containing strings are NOT double-normalised
    const d = parseDate("2026-06-10T21:35:22+07:00");
    expect(d).toBeInstanceOf(Date);
    // 2026-06-10T21:35:22+07:00 == 2026-06-10T14:35:22Z
    expect(d!.toISOString()).toBe("2026-06-10T14:35:22.000Z");
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — formatDateVi
// ---------------------------------------------------------------------------

describe("formatDateVi", () => {
  it("null → '—'", () => {
    expect(formatDateVi(null)).toBe("—");
  });

  it("undefined → '—'", () => {
    expect(formatDateVi(undefined)).toBe("—");
  });

  it("empty string → '—'", () => {
    expect(formatDateVi("")).toBe("—");
  });

  it("garbage → '—'", () => {
    expect(formatDateVi("garbage value")).toBe("—");
  });

  it("NEVER returns 'Invalid Date'", () => {
    // The whole point of this helper — this must never happen
    expect(formatDateVi("bad")).not.toBe("Invalid Date");
    expect(formatDateVi("2026-99-99 25:99:99")).not.toBe("Invalid Date");
    expect(formatDateVi(null)).not.toBe("Invalid Date");
  });

  it("bare SQLite → non-empty string", () => {
    const result = formatDateVi("2026-06-10 14:35:22");
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
    expect(result.length).toBeGreaterThan(4);
    expect(result).not.toBe("Invalid Date");
  });

  it("ISO with T and Z → non-empty string", () => {
    const result = formatDateVi("2026-06-10T14:35:22.000Z");
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
    expect(result).not.toBe("Invalid Date");
  });

  it("ISO with offset → non-empty string", () => {
    const result = formatDateVi("2026-06-10T14:35:22+07:00");
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
    expect(result).not.toBe("Invalid Date");
  });

  it("bare SQLite and ISO with same UTC instant produce same vi-VN output", () => {
    // "2026-06-10 07:35:22" stored as UTC in SQLite
    // "2026-06-10T07:35:22Z" is the ISO equivalent
    const fromSqlite = formatDateVi("2026-06-10 07:35:22");
    const fromIso = formatDateVi("2026-06-10T07:35:22Z");
    expect(fromSqlite).toBe(fromIso);
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — formatDateOnlyVi
// ---------------------------------------------------------------------------

describe("formatDateOnlyVi", () => {
  it("null → '—'", () => {
    expect(formatDateOnlyVi(null)).toBe("—");
  });

  it("empty string → '—'", () => {
    expect(formatDateOnlyVi("")).toBe("—");
  });

  it("garbage → '—'", () => {
    expect(formatDateOnlyVi("xyz")).toBe("—");
  });

  it("bare SQLite → non-empty date string", () => {
    const result = formatDateOnlyVi("2026-06-10 14:35:22");
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
    expect(result).not.toBe("Invalid Date");
  });

  it("ISO with T → non-empty date string", () => {
    const result = formatDateOnlyVi("2026-06-10T14:35:22Z");
    expect(result).not.toBe("—");
    expect(result).not.toBe("Invalid Date");
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — formatSignalTimestamp
// ---------------------------------------------------------------------------

describe("formatSignalTimestamp", () => {
  it("null → '—'", () => {
    expect(formatSignalTimestamp(null)).toBe("—");
  });

  it("empty string → '—'", () => {
    expect(formatSignalTimestamp("")).toBe("—");
  });

  it("garbage → '—'", () => {
    expect(formatSignalTimestamp("not-a-timestamp")).toBe("—");
  });

  it("bare SQLite timestamp → string (HH:mm or MM-DD HH:mm)", () => {
    const result = formatSignalTimestamp("2026-06-10 14:35:22");
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
    expect(result).not.toBe("Invalid Date");
    // Format is either "HH:mm" (5 chars) or "MM-DD HH:mm" (11 chars)
    expect([5, 11]).toContain(result.length);
  });

  it("ISO with T timestamp → string (HH:mm or MM-DD HH:mm)", () => {
    const result = formatSignalTimestamp("2026-06-10T14:35:22.000Z");
    expect(typeof result).toBe("string");
    expect(result).not.toBe("—");
    expect(result).not.toBe("Invalid Date");
    expect([5, 11]).toContain(result.length);
  });

  it("ISO with offset → valid short format", () => {
    const result = formatSignalTimestamp("2026-06-10T14:35:22+07:00");
    expect(result).not.toBe("—");
    expect(result).not.toBe("Invalid Date");
    expect([5, 11]).toContain(result.length);
  });

  it("NEVER returns 'Invalid Date'", () => {
    expect(formatSignalTimestamp("bad")).not.toBe("Invalid Date");
    expect(formatSignalTimestamp(null)).not.toBe("Invalid Date");
  });
});
