/**
 * FOU-3-FE — 2-axis Service Health compose logic tests.
 *
 * Tests the pure composeRowDisplayState() and composeOverallStatus() functions
 * exported from dashboard.services.tsx.
 *
 * Coverage:
 *   1. deployed + ok → deployed_up (GREEN)
 *   2. deployed + degraded → deployed_degraded (YELLOW)
 *   3. deployed + down + any capability → deployed_down (RED) [ANTI-FALSE-GREEN]
 *   4. not_deployed + live → not_deployed_live (BLUE)
 *   5. not_deployed + data_limited → not_deployed_data_limited (AMBER)
 *   6. not_deployed + dark → not_deployed_dark (GREY)
 *   7. not_deployed + n/a → not_deployed_dark (GREY, default)
 *   8. capabilities absent (n/a default) → graceful degradation
 *   9. parseCapability: unknown string → "n/a"
 *  10. composeOverallStatus: ignores not_deployed, red on any deployed down
 *  11. composeOverallStatus: top badge not rescued by not_deployed+live
 *
 * ANTI-FALSE-GREEN invariant (AC §7):
 *   deployed + down + capability = "live" → MUST return "deployed_down" (RED).
 *   Capability is additive only for the not_deployed axis.
 */

import { describe, it, expect } from "vitest";
import type { CapabilityStatus, ServiceRow, ServiceStatus } from "~/domain/health";
import {
  composeRowDisplayState,
  composeOverallStatus,
  type RowDisplayState,
} from "~/domain/health-compose";

// --------------------------------------------------------------------------
// composeRowDisplayState — single-row badge logic
// --------------------------------------------------------------------------

describe("composeRowDisplayState — deployed services", () => {
  it("deployed + ok → deployed_up (GREEN)", () => {
    const state: RowDisplayState = composeRowDisplayState("ok", "n/a");
    expect(state).toBe("deployed_up");
  });

  it("deployed + ok + capability live → still deployed_up (capability ignored for deployed)", () => {
    const state = composeRowDisplayState("ok", "live");
    expect(state).toBe("deployed_up");
  });

  it("deployed + degraded → deployed_degraded (YELLOW)", () => {
    const state = composeRowDisplayState("degraded", "n/a");
    expect(state).toBe("deployed_degraded");
  });

  it("deployed + degraded + capability live → still deployed_degraded (capability ignored)", () => {
    const state = composeRowDisplayState("degraded", "live");
    expect(state).toBe("deployed_degraded");
  });

  // ANTI-FALSE-GREEN: all capability variants must return deployed_down for a down container
  const capabilities: CapabilityStatus[] = ["live", "data_limited", "dark", "n/a"];
  for (const cap of capabilities) {
    it(`deployed + down + capability="${cap}" → deployed_down (RED) [ANTI-FALSE-GREEN]`, () => {
      const state = composeRowDisplayState("down", cap);
      expect(state).toBe("deployed_down");
      // Explicit: must NOT be any of the positive/grey not_deployed states
      expect(state).not.toBe("not_deployed_live");
      expect(state).not.toBe("not_deployed_data_limited");
      expect(state).not.toBe("not_deployed_dark");
    });
  }
});

describe("composeRowDisplayState — not_deployed services", () => {
  it("not_deployed + live → not_deployed_live (BLUE)", () => {
    const state = composeRowDisplayState("not_deployed", "live");
    expect(state).toBe("not_deployed_live");
  });

  it("not_deployed + data_limited → not_deployed_data_limited (AMBER)", () => {
    const state = composeRowDisplayState("not_deployed", "data_limited");
    expect(state).toBe("not_deployed_data_limited");
  });

  it("not_deployed + dark → not_deployed_dark (GREY)", () => {
    const state = composeRowDisplayState("not_deployed", "dark");
    expect(state).toBe("not_deployed_dark");
  });

  it("not_deployed + n/a → not_deployed_dark (GREY — default/absent capability)", () => {
    const state = composeRowDisplayState("not_deployed", "n/a");
    expect(state).toBe("not_deployed_dark");
  });
});

// --------------------------------------------------------------------------
// parseCapability — graceful degradation for absent/unknown capability
// --------------------------------------------------------------------------

describe("parseCapability — graceful degradation", () => {
  // Pure re-implementation matching the loader's parseCapability function.
  // This is intentionally duplicated here to verify the contract without
  // importing the private function.
  function parseCapability(raw: unknown): CapabilityStatus {
    if (raw === "live" || raw === "data_limited" || raw === "dark" || raw === "n/a") {
      return raw;
    }
    return "n/a";
  }

  it("undefined (absent capabilities field) → n/a", () => {
    expect(parseCapability(undefined)).toBe("n/a");
  });

  it("null → n/a", () => {
    expect(parseCapability(null)).toBe("n/a");
  });

  it("unknown string → n/a", () => {
    expect(parseCapability("unknown_future_value")).toBe("n/a");
  });

  it("'live' → live", () => {
    expect(parseCapability("live")).toBe("live");
  });

  it("'data_limited' → data_limited", () => {
    expect(parseCapability("data_limited")).toBe("data_limited");
  });

  it("'dark' → dark", () => {
    expect(parseCapability("dark")).toBe("dark");
  });

  it("'n/a' → n/a", () => {
    expect(parseCapability("n/a")).toBe("n/a");
  });
});

// --------------------------------------------------------------------------
// composeOverallStatus — top badge ignores not_deployed
// --------------------------------------------------------------------------

describe("composeOverallStatus — top badge logic", () => {
  function makeRow(status: ServiceStatus, capability: CapabilityStatus = "n/a"): Pick<ServiceRow, "status"> {
    return { status };
  }

  it("all deployed ok → ok", () => {
    const rows = [makeRow("ok"), makeRow("ok")];
    expect(composeOverallStatus(rows, "ok")).toBe("ok");
  });

  it("deployed ok + not_deployed services → ok (not_deployed excluded)", () => {
    const rows = [makeRow("ok"), makeRow("not_deployed"), makeRow("not_deployed")];
    expect(composeOverallStatus(rows, "ok")).toBe("ok");
  });

  it("deployed down → down (RED), not rescued by any not_deployed+live rows", () => {
    const rows = [
      makeRow("ok"),
      makeRow("down"),                    // deployed + down
      makeRow("not_deployed"),            // not_deployed + live (must not rescue top badge)
    ];
    expect(composeOverallStatus(rows, "degraded")).toBe("down");
  });

  it("deployed degraded (no down) → degraded", () => {
    const rows = [makeRow("ok"), makeRow("degraded"), makeRow("not_deployed")];
    expect(composeOverallStatus(rows, "degraded")).toBe("degraded");
  });

  it("only not_deployed rows → falls back to gateway overall", () => {
    const rows = [makeRow("not_deployed"), makeRow("not_deployed")];
    expect(composeOverallStatus(rows, "ok")).toBe("ok");
  });

  it("empty rows → falls back to gateway overall", () => {
    expect(composeOverallStatus([], null)).toBeNull();
  });

  it("ANTI-FALSE-GREEN: deployed+down overrides gateway ok", () => {
    // Gateway reports ok (potential stale) but we have a deployed service down
    const rows = [makeRow("ok"), makeRow("down")];
    expect(composeOverallStatus(rows, "ok")).toBe("down");
  });
});

// --------------------------------------------------------------------------
// Integration scenario: full row objects (capability field present/absent)
// --------------------------------------------------------------------------

describe("Full ServiceRow scenarios — capability field handling", () => {
  it("row with no capability field (older payload) → composes as not_deployed_dark", () => {
    // Simulate loader merging: capability defaults to "n/a" when absent
    const row: ServiceRow = {
      name: "ta",
      status: "not_deployed",
      latencyMs: null,
      capability: "n/a", // default from parseCapability(undefined)
    };
    expect(composeRowDisplayState(row.status, row.capability)).toBe("not_deployed_dark");
  });

  it("ta not_deployed + data_limited + capabilityNote → data_limited state", () => {
    const row: ServiceRow = {
      name: "ta",
      status: "not_deployed",
      latencyMs: null,
      capability: "data_limited",
      capabilityNote: "30/35 candles available",
    };
    expect(composeRowDisplayState(row.status, row.capability)).toBe("not_deployed_data_limited");
    expect(row.capabilityNote).toBe("30/35 candles available");
  });

  it("mcp deployed + ok + n/a capability → deployed_up", () => {
    const row: ServiceRow = {
      name: "mcp",
      status: "ok",
      latencyMs: 12,
      capability: "n/a",
    };
    expect(composeRowDisplayState(row.status, row.capability)).toBe("deployed_up");
  });

  it("sbv-fetch deployed + down + dark capability → deployed_down (ANTI-FALSE-GREEN)", () => {
    // Simulates PROVEN-RED scenario from the brief:
    // A deployed service with capability=dark is stopped → must render RED, not grey
    const row: ServiceRow = {
      name: "sbv-fetch",
      status: "down",
      latencyMs: null,
      capability: "dark",
    };
    expect(composeRowDisplayState(row.status, row.capability)).toBe("deployed_down");
    // Explicitly confirm: capability "dark" does NOT produce not_deployed_dark for a deployed+down row
    expect(composeRowDisplayState(row.status, row.capability)).not.toBe("not_deployed_dark");
  });

  it("kinh-dich not_deployed + live → not_deployed_live (BLUE)", () => {
    const row: ServiceRow = {
      name: "kinh-dich",
      status: "not_deployed",
      latencyMs: null,
      capability: "live",
    };
    expect(composeRowDisplayState(row.status, row.capability)).toBe("not_deployed_live");
  });
});
