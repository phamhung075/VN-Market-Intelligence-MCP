/**
 * Task 1378 — Composite alert dedup: suppress bare sub-alert when composite fires
 *
 * Regression test for VCB duplicate alert bug (2026-04-28):
 * - A bare price_drop alert fires first (lower severity, deterministic ID)
 * - A composite price_drop+volume_spike alert with severity="critical" fires
 *   second, bypassing the cooldown check because the critical bypass was
 *   unconditional — it skipped the signal-overlap check entirely.
 *
 * Fix: the critical bypass must NOT fire when there is signal-type overlap
 * with a recently sent alert for the same stock. An escalated composite that
 * shares a sub-signal with an already-sent alert is a duplicate, not a
 * genuinely new event.
 */

import { describe, it, expect } from "bun:test";
import { shouldSuppressAlert } from "../domain/services/alertCooldown.js";

const NOW = new Date().toISOString();
const RECENT = new Date(Date.now() - 2 * 60_000).toISOString(); // 2 min ago

describe("Task 1378 — composite alert dedup", () => {
  const config = { cooldownMinutes: 30, maxAlertsPerStockPerDay: 5 };

  it("suppresses critical composite when bare sub-signal was already sent", () => {
    // Bare price_drop was already sent 2 min ago for VCB
    const history = [
      { stocks: "VCB", signalTypes: "price_drop", triggeredAt: RECENT },
    ];

    // Composite critical alert (price_drop + volume_spike) tries to fire
    const suppress = shouldSuppressAlert(
      {
        stocks: ["VCB"],
        signalTypes: ["price_drop", "volume_spike"],
        severity: "critical",
        actionCode: "VCB",
      },
      history,
      config,
    );

    expect(suppress).toBe(true); // must be suppressed — price_drop already sent
  });

  it("does NOT suppress critical alert when signal types are genuinely new", () => {
    // A different signal (volume_spike) was sent; now a critical price_drop fires
    const history = [
      { stocks: "VCB", signalTypes: "volume_spike", triggeredAt: RECENT },
    ];

    const suppress = shouldSuppressAlert(
      {
        stocks: ["VCB"],
        signalTypes: ["price_drop"],
        severity: "critical",
        actionCode: "VCB",
      },
      history,
      config,
    );

    expect(suppress).toBe(false); // no overlap — genuinely new signal, must fire
  });

  it("still allows critical alert when history is empty", () => {
    const suppress = shouldSuppressAlert(
      {
        stocks: ["VCB"],
        signalTypes: ["price_drop", "volume_spike"],
        severity: "critical",
        actionCode: "VCB",
      },
      [],
      config,
    );

    expect(suppress).toBe(false); // no history — must fire
  });

  it("still allows critical alert when history is outside cooldown window", () => {
    const OLD = new Date(Date.now() - 60 * 60_000).toISOString(); // 60 min ago
    const history = [
      { stocks: "VCB", signalTypes: "price_drop", triggeredAt: OLD },
    ];

    const suppress = shouldSuppressAlert(
      {
        stocks: ["VCB"],
        signalTypes: ["price_drop", "volume_spike"],
        severity: "critical",
        actionCode: "VCB",
      },
      history,
      config,
    );

    expect(suppress).toBe(false); // outside 30-min window — must fire
  });

  it("MACRO critical alerts still use normal cooldown (pre-existing behaviour)", () => {
    const history = [
      { stocks: "MACRO", signalTypes: "macro_deviation", triggeredAt: RECENT },
    ];

    const suppress = shouldSuppressAlert(
      {
        stocks: ["MACRO"],
        signalTypes: ["macro_deviation"],
        severity: "critical",
        actionCode: "MACRO",
      },
      history,
      { cooldownMinutes: 360, maxAlertsPerStockPerDay: 5 },
    );

    expect(suppress).toBe(true); // MACRO cooldown still enforced
  });
});
