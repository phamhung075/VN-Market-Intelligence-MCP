/**
 * Tests for classifyCheckVerification — FE-PG-QUALITY-AUDIT-LASTVERIFIED-RENDER-FIX
 *
 * Live docs/data/quality-checklist.json carries FOUR distinct last_verified
 * timestamp shapes across its 442 checks:
 *   - bare date              "2026-06-10"                        (4 rows)
 *   - second precision       "2026-06-10T09:11:30Z"               (413 rows)
 *   - millisecond precision  "2026-06-10T19:26:29.419Z"            (24 rows)
 *   - microsecond precision  "2026-06-10T09:18:46.945489Z"          (1 row — FR-FRESH-02)
 * All four must classify without NaN/crash. Missing/unparseable/non-string
 * must classify "unknown" — never a silent "fresh".
 *
 * All tests inject `now` explicitly — no vi.useFakeTimers() needed.
 */
import { describe, it, expect } from "vitest";
import {
  classifyCheckVerification,
  CHECK_VERIFICATION_WINDOW_MINUTES,
} from "./check-verification";

describe("CHECK_VERIFICATION_WINDOW_MINUTES", () => {
  it("is exactly 7 days in minutes (page-freshness.md D-PAGE window=7d)", () => {
    expect(CHECK_VERIFICATION_WINDOW_MINUTES).toBe(7 * 24 * 60);
  });
});

describe("classifyCheckVerification", () => {
  // Reference "now" — matches the live 2026-07-25 stamp in the router prompt.
  const NOW = new Date("2026-07-25T13:47:58.000Z");

  it("bare date 45d stale (2026-06-10) → stale", () => {
    expect(classifyCheckVerification("2026-06-10", NOW)).toBe("stale");
  });

  it("second-precision 45d stale (2026-06-10T09:11:30Z) → stale", () => {
    expect(classifyCheckVerification("2026-06-10T09:11:30Z", NOW)).toBe("stale");
  });

  it("millisecond-precision 45d stale (2026-06-10T19:26:29.419Z) → stale", () => {
    expect(classifyCheckVerification("2026-06-10T19:26:29.419Z", NOW)).toBe(
      "stale",
    );
  });

  it("microsecond-precision 45d stale (FR-FRESH-02 shape) → stale, no NaN/crash", () => {
    expect(() =>
      classifyCheckVerification("2026-06-10T09:18:46.945489Z", NOW),
    ).not.toThrow();
    expect(
      classifyCheckVerification("2026-06-10T09:18:46.945489Z", NOW),
    ).toBe("stale");
  });

  it("second-precision same-day (2026-07-25T07:00:40Z) → fresh", () => {
    expect(classifyCheckVerification("2026-07-25T07:00:40Z", NOW)).toBe(
      "fresh",
    );
  });

  it("bare date same-day (2026-07-25) → fresh", () => {
    expect(classifyCheckVerification("2026-07-25", NOW)).toBe("fresh");
  });

  it("exactly 7 days ago → fresh (boundary is > not >=)", () => {
    const sevenDaysAgo = new Date(
      NOW.getTime() - 7 * 24 * 60 * 60_000,
    ).toISOString();
    expect(classifyCheckVerification(sevenDaysAgo, NOW)).toBe("fresh");
  });

  it("7 days + 1 minute ago → stale", () => {
    const justOverSevenDays = new Date(
      NOW.getTime() - (7 * 24 * 60 + 1) * 60_000,
    ).toISOString();
    expect(classifyCheckVerification(justOverSevenDays, NOW)).toBe("stale");
  });

  it("undefined → unknown", () => {
    expect(classifyCheckVerification(undefined, NOW)).toBe("unknown");
  });

  it("null → unknown", () => {
    expect(classifyCheckVerification(null, NOW)).toBe("unknown");
  });

  it("empty string → unknown", () => {
    expect(classifyCheckVerification("", NOW)).toBe("unknown");
  });

  it("unparseable garbage string → unknown, not fresh", () => {
    expect(classifyCheckVerification("not-a-date", NOW)).toBe("unknown");
  });

  it("non-string runtime value (number) → unknown, does not throw", () => {
    // The served payload is a raw pass-through cast (`raw as QualityChecklist`
    // in dashboard.quality-audit.tsx) — last_verified could in principle be
    // any JSON type at runtime even though the DTO type says string.
    expect(() => classifyCheckVerification(12345, NOW)).not.toThrow();
    expect(classifyCheckVerification(12345, NOW)).toBe("unknown");
  });

  it("non-string runtime value (object) → unknown, does not throw", () => {
    expect(() => classifyCheckVerification({}, NOW)).not.toThrow();
    expect(classifyCheckVerification({}, NOW)).toBe("unknown");
  });

  it("non-string runtime value (array) → unknown, does not throw", () => {
    expect(classifyCheckVerification([], NOW)).toBe("unknown");
  });
});
