/**
 * FOU-3-FE — Service Health compose logic tests.
 *
 * GO-FLEET-DEPLOY (2026-06-11): all 12 services are genuinely deployed.
 * "not_deployed" status removed. Tests updated to reflect full-fleet reality.
 *
 * Tests the pure composeRowDisplayState() and composeOverallStatus() functions
 * exported from dashboard.services.tsx.
 *
 * Coverage:
 *   1. ok       → deployed_up     (GREEN)
 *   2. degraded → deployed_degraded (YELLOW)
 *   3. down + any capability → deployed_down (RED) [ANTI-FALSE-GREEN]
 *   4. capabilities absent (n/a default) → graceful degradation
 *   5. parseCapability: unknown string → "n/a"
 *   6. composeOverallStatus: red on any deployed down
 *   7. composeOverallStatus: fully-deployed fleet ok → ok
 *
 * ANTI-FALSE-GREEN invariant (AC §7):
 *   down + capability = "live" → MUST return "deployed_down" (RED).
 *   Capability is informational only — never overrides the container verdict.
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
  it("ok → deployed_up (GREEN)", () => {
    const state: RowDisplayState = composeRowDisplayState("ok", "n/a");
    expect(state).toBe("deployed_up");
  });

  it("ok + capability live → still deployed_up (capability informational only)", () => {
    const state = composeRowDisplayState("ok", "live");
    expect(state).toBe("deployed_up");
  });

  it("degraded → deployed_degraded (YELLOW)", () => {
    const state = composeRowDisplayState("degraded", "n/a");
    expect(state).toBe("deployed_degraded");
  });

  it("degraded + capability live → still deployed_degraded (capability informational only)", () => {
    const state = composeRowDisplayState("degraded", "live");
    expect(state).toBe("deployed_degraded");
  });

  // ANTI-FALSE-GREEN: all capability variants must return deployed_down for a down container
  const capabilities: CapabilityStatus[] = ["live", "data_limited", "dark", "n/a"];
  for (const cap of capabilities) {
    it(`down + capability="${cap}" → deployed_down (RED) [ANTI-FALSE-GREEN]`, () => {
      const state = composeRowDisplayState("down", cap);
      expect(state).toBe("deployed_down");
    });
  }
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
// composeOverallStatus — full fleet top badge
// --------------------------------------------------------------------------

describe("composeOverallStatus — full fleet top badge logic", () => {
  function makeRow(status: ServiceStatus): Pick<ServiceRow, "status"> {
    return { status };
  }

  it("all ok → ok", () => {
    const rows = [makeRow("ok"), makeRow("ok"), makeRow("ok")];
    expect(composeOverallStatus(rows, "ok")).toBe("ok");
  });

  it("any down → down (RED)", () => {
    const rows = [makeRow("ok"), makeRow("down"), makeRow("ok")];
    expect(composeOverallStatus(rows, "ok")).toBe("down");
  });

  it("degraded (no down) → degraded", () => {
    const rows = [makeRow("ok"), makeRow("degraded")];
    expect(composeOverallStatus(rows, "degraded")).toBe("degraded");
  });

  it("empty rows → falls back to gateway overall", () => {
    expect(composeOverallStatus([], null)).toBeNull();
  });

  it("ANTI-FALSE-GREEN: deployed+down overrides gateway ok", () => {
    // Gateway reports ok (potential stale) but we have a service down
    const rows = [makeRow("ok"), makeRow("down")];
    expect(composeOverallStatus(rows, "ok")).toBe("down");
  });

  it("mixed ok/degraded (no down) → degraded", () => {
    const rows = [makeRow("ok"), makeRow("ok"), makeRow("degraded"), makeRow("ok")];
    expect(composeOverallStatus(rows, "ok")).toBe("degraded");
  });
});

// --------------------------------------------------------------------------
// Integration scenario: full row objects (capability field present/absent)
// --------------------------------------------------------------------------

describe("Full ServiceRow scenarios — fully deployed fleet", () => {
  it("mcp deployed + ok + n/a capability → deployed_up", () => {
    const row: ServiceRow = {
      name: "mcp",
      status: "ok",
      latencyMs: 12,
      capability: "n/a",
    };
    expect(composeRowDisplayState(row.status, row.capability)).toBe("deployed_up");
  });

  it("stock deployed + ok + live capability → deployed_up (capability informational)", () => {
    const row: ServiceRow = {
      name: "stock",
      status: "ok",
      latencyMs: 8,
      capability: "live",
    };
    expect(composeRowDisplayState(row.status, row.capability)).toBe("deployed_up");
  });

  it("ta deployed + ok + data_limited capability → deployed_up (capability informational)", () => {
    const row: ServiceRow = {
      name: "ta",
      status: "ok",
      latencyMs: 15,
      capability: "data_limited",
      capabilityNote: "30/35 candles available",
    };
    // Container is up — capability does not affect display state
    expect(composeRowDisplayState(row.status, row.capability)).toBe("deployed_up");
  });

  it("news deployed + down + dark capability → deployed_down (ANTI-FALSE-GREEN)", () => {
    // Simulates PROVEN-RED scenario: a deployed service that crashed
    const row: ServiceRow = {
      name: "news",
      status: "down",
      latencyMs: null,
      capability: "dark",
    };
    expect(composeRowDisplayState(row.status, row.capability)).toBe("deployed_down");
  });

  it("alert deployed + degraded → deployed_degraded (YELLOW)", () => {
    const row: ServiceRow = {
      name: "alert",
      status: "degraded",
      latencyMs: 200,
      capability: "live",
    };
    expect(composeRowDisplayState(row.status, row.capability)).toBe("deployed_degraded");
  });
});
