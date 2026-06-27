/**
 * TASK-FFT-L3A — FreshnessBadge unit tests.
 *
 * Coverage:
 *   A. isVnMarketHours helper
 *   B. EC-1: null dataAsof → gray "Chưa có dữ liệu" (never crashes, no ClientTimeString)
 *   C. EC-4: static tier → "Nội dung tĩnh" plain text
 *   D. Color thresholds — all 5 non-static SLA tiers × 3 age zones (15 scenarios)
 *      + red suppression for marketHoursOnly off-hours (EC-3)
 *   E. className forwarding
 *
 * Sprint: FRONTEND-FRESHNESS-TRANSPARENCY
 * Task:   TASK-FFT-L3A
 */

import { describe, it, expect } from "vitest";
import { render, screen, act } from "@testing-library/react";
import {
  FreshnessBadge,
  isVnMarketHours,
  type SlaTierKey,
} from "~/components/FreshnessBadge";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build an ISO string whose age (from _now) is `ageMin` minutes. */
function isoAgo(ageMin: number, now: Date = new Date()): string {
  return new Date(now.getTime() - ageMin * 60_000).toISOString();
}

/** Render FreshnessBadge synchronously and return container text. */
async function render_(props: React.ComponentProps<typeof FreshnessBadge>) {
  const { container } = render(<FreshnessBadge {...props} />);
  await act(async () => {});
  return container;
}

// Fixed reference "now" for deterministic tests
const NOW = new Date("2026-06-27T10:00:00.000Z"); // Saturday 10:00 UTC → outside market hours

// ---------------------------------------------------------------------------
// A. isVnMarketHours
// ---------------------------------------------------------------------------

describe("isVnMarketHours", () => {
  it("returns false on Saturday", () => {
    // 2026-06-27 is a Saturday
    expect(isVnMarketHours(new Date("2026-06-27T04:00:00Z"))).toBe(false);
  });

  it("returns false on Sunday", () => {
    expect(isVnMarketHours(new Date("2026-06-28T04:00:00Z"))).toBe(false);
  });

  it("returns true on Monday within 02:00–08:59 UTC", () => {
    // 2026-06-29 is a Monday
    expect(isVnMarketHours(new Date("2026-06-29T02:00:00Z"))).toBe(true);
    expect(isVnMarketHours(new Date("2026-06-29T08:59:59Z"))).toBe(true);
  });

  it("returns false on Monday before 02:00 UTC", () => {
    expect(isVnMarketHours(new Date("2026-06-29T01:59:59Z"))).toBe(false);
  });

  it("returns false on Monday at 09:00 UTC (after session)", () => {
    expect(isVnMarketHours(new Date("2026-06-29T09:00:00Z"))).toBe(false);
  });

  it("returns true on Friday within market hours", () => {
    // 2026-07-03 is a Friday
    expect(isVnMarketHours(new Date("2026-07-03T06:00:00Z"))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// B. EC-1: null dataAsof → gray badge, no crash
// ---------------------------------------------------------------------------

describe("FreshnessBadge — EC-1: null dataAsof", () => {
  it("renders gray 'Chưa có dữ liệu' when dataAsof is null", async () => {
    const c = await render_({ dataAsof: null, slaTierKey: "realtime", _now: NOW });
    expect(c.textContent).toContain("Chưa có dữ liệu");
  });

  it("does not render green/amber/red class when dataAsof is null", async () => {
    const c = await render_({ dataAsof: null, slaTierKey: "intraday", _now: NOW });
    const span = c.querySelector("span");
    expect(span?.className).not.toContain("green");
    expect(span?.className).not.toContain("amber");
    expect(span?.className).not.toContain("red");
    expect(span?.className).toContain("slate");
  });

  it("does NOT throw when dataAsof is null (RISK-5: no ClientTimeString(null))", () => {
    expect(() =>
      render(<FreshnessBadge dataAsof={null} slaTierKey="daily" _now={NOW} />)
    ).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// C. EC-4: static tier → "Nội dung tĩnh"
// ---------------------------------------------------------------------------

describe("FreshnessBadge — EC-4: static tier", () => {
  it("renders 'Nội dung tĩnh' plain text for static tier", async () => {
    const c = await render_({
      dataAsof: new Date().toISOString(),
      slaTierKey: "static",
      _now: NOW,
    });
    expect(c.textContent).toContain("Nội dung tĩnh");
  });

  it("renders plain text (no badge classes) for static tier", async () => {
    const c = await render_({
      dataAsof: null,
      slaTierKey: "static",
      _now: NOW,
    });
    const span = c.querySelector("span");
    expect(span?.className).toContain("text-slate-500");
    expect(span?.className).not.toContain("rounded-full");
  });

  it("does not render 'Chưa có dữ liệu' for static with null dataAsof", async () => {
    const c = await render_({
      dataAsof: null,
      slaTierKey: "static",
      _now: NOW,
    });
    expect(c.textContent).not.toContain("Chưa có dữ liệu");
    expect(c.textContent).toContain("Nội dung tĩnh");
  });
});

// ---------------------------------------------------------------------------
// D. Color thresholds — 5 tiers × 3 age zones = 15 scenarios
// ---------------------------------------------------------------------------

/**
 * SLA tier configs (mirrors SLA_TIERS constant in FreshnessBadge.tsx):
 *   realtime:  max=15 min  → green ≤7.5, amber ≤15, red >15
 *   intraday:  max=60 min  → green ≤30, amber ≤60, red >60
 *   daily:     max=1560min → green ≤780, amber ≤1560, red >1560
 *   weekly:    max=11520min→ green ≤5760, amber ≤11520, red >11520
 *   event:     max=1560min → green ≤780, amber ≤1560, red >1560
 */

type TierThreshold = { tier: SlaTierKey; max: number };

const TIER_THRESHOLDS: TierThreshold[] = [
  { tier: "realtime", max: 15 },
  { tier: "intraday", max: 60 },
  { tier: "daily", max: 1560 },
  { tier: "weekly", max: 11520 },
  { tier: "event", max: 1560 },
];

describe("FreshnessBadge — color threshold matrix (15 scenarios)", () => {
  for (const { tier, max } of TIER_THRESHOLDS) {
    // GREEN zone: age = 0.4 × max (within 0.5×)
    it(`${tier}: age=0.4×max → green badge`, async () => {
      const age = Math.floor(0.4 * max);
      const c = await render_({
        dataAsof: isoAgo(age, NOW),
        slaTierKey: tier,
        _now: NOW,
      });
      const span = c.querySelector("span");
      expect(span?.className).toContain("green");
    });

    // AMBER zone: age = 0.7 × max (between 0.5× and 1×)
    it(`${tier}: age=0.7×max → amber badge`, async () => {
      const age = Math.floor(0.7 * max);
      const c = await render_({
        dataAsof: isoAgo(age, NOW),
        slaTierKey: tier,
        _now: NOW,
      });
      const span = c.querySelector("span");
      expect(span?.className).toContain("amber");
    });

    // RED zone: age = 1.5 × max (beyond threshold)
    it(`${tier}: age=1.5×max → red badge (marketHoursOnly=false)`, async () => {
      const age = Math.floor(1.5 * max);
      // Use a weekday within market hours to ensure red (not amber) fires
      const nowMarketHours = new Date("2026-06-29T04:00:00Z"); // Monday 04:00 UTC
      const c = await render_({
        dataAsof: isoAgo(age, nowMarketHours),
        slaTierKey: tier,
        marketHoursOnly: false,
        _now: nowMarketHours,
      });
      const span = c.querySelector("span");
      expect(span?.className).toContain("red");
    });
  }
});

// ---------------------------------------------------------------------------
// EC-3: STALE_RISK off-hours → amber + qualifier (not red)
// ---------------------------------------------------------------------------

describe("FreshnessBadge — EC-3: marketHoursOnly outside market hours", () => {
  it("shows amber 'Số liệu phiên gần nhất' when stale + off-hours (weekend)", async () => {
    // NOW is Saturday → off-hours; age >> 15min to trigger stale for realtime
    const c = await render_({
      dataAsof: isoAgo(60, NOW),  // 60 min > 15 min realtime max
      slaTierKey: "realtime",
      marketHoursOnly: true,
      _now: NOW,
    });
    expect(c.textContent).toContain("Số liệu phiên gần nhất");
    const span = c.querySelector("span");
    expect(span?.className).toContain("amber");
    expect(span?.className).not.toContain("red");
  });

  it("shows amber when stale off-hours for event tier", async () => {
    // event max = 1560 min; age = 3000 min → stale; NOW = weekend
    const c = await render_({
      dataAsof: isoAgo(3000, NOW),
      slaTierKey: "event",
      marketHoursOnly: true,
      _now: NOW,
    });
    const span = c.querySelector("span");
    expect(span?.className).toContain("amber");
    expect(c.textContent).toContain("Số liệu phiên gần nhất");
  });

  it("shows RED when marketHoursOnly=true but within market hours (Mon 04:00 UTC)", async () => {
    const nowInHours = new Date("2026-06-29T04:00:00Z"); // Monday → in VN market hours
    const c = await render_({
      dataAsof: isoAgo(60, nowInHours), // stale for realtime
      slaTierKey: "realtime",
      marketHoursOnly: true,
      _now: nowInHours,
    });
    const span = c.querySelector("span");
    expect(span?.className).toContain("red");
    expect(c.textContent).not.toContain("Số liệu phiên gần nhất");
  });
});

// ---------------------------------------------------------------------------
// E. className forwarding
// ---------------------------------------------------------------------------

describe("FreshnessBadge — className prop", () => {
  it("forwards className to the outer span (null path)", async () => {
    const c = await render_({
      dataAsof: null,
      slaTierKey: "realtime",
      className: "my-custom-class",
      _now: NOW,
    });
    const span = c.querySelector("span");
    expect(span?.className).toContain("my-custom-class");
  });

  it("forwards className to the outer span (static path)", async () => {
    const c = await render_({
      dataAsof: null,
      slaTierKey: "static",
      className: "static-extra",
      _now: NOW,
    });
    const span = c.querySelector("span");
    expect(span?.className).toContain("static-extra");
  });
});

// ---------------------------------------------------------------------------
// F. Label content
// ---------------------------------------------------------------------------

describe("FreshnessBadge — label content", () => {
  it("contains 'Cập nhật lúc' in the green path", async () => {
    const c = await render_({
      dataAsof: isoAgo(1, NOW), // 1 min old — fresh for any tier
      slaTierKey: "realtime",
      _now: NOW,
    });
    expect(c.textContent).toContain("Cập nhật lúc");
  });

  it("contains 'Cập nhật lúc' in the amber path", async () => {
    // realtime max=15; 10 min = amber zone (0.5×15=7.5 < 10 ≤ 15)
    const c = await render_({
      dataAsof: isoAgo(10, NOW),
      slaTierKey: "realtime",
      _now: NOW,
    });
    expect(c.textContent).toContain("Cập nhật lúc");
  });
});
