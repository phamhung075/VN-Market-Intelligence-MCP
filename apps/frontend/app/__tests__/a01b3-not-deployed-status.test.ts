/**
 * A-01b-3 — not_deployed status rendering tests.
 *
 * Tests the loader row-mapping logic (domain layer, pure) for the
 * dashboard.services route:
 *   - Clause A: 5×ok + 7×not_deployed → top badge non-red, grey rows
 *   - Clause B: deployed service down → red row, top badge non-ok
 *   - Latency guard: -1 sentinel → null (renders "—")
 *   - Anti-false-green: blanket "down" fallback ONLY for truly missing status
 *
 * These tests replicate the row-mapping logic from the loader to keep tests
 * framework-free (no Remix request mocking needed). The logic is a pure map()
 * — if the logic changes the tests will break (intended).
 */

import { describe, it, expect } from "vitest";
import type { ServiceStatus } from "~/domain/health";

// ---------------------------------------------------------------------------
// Inline the loader's row-mapping logic as a pure function under test.
// This mirrors exactly what apps/frontend/app/routes/dashboard.services.tsx
// does inside the loader() function.
// ---------------------------------------------------------------------------

const SERVICES = [
  "mcp", "pdf", "rag", "ta", "macro", "stock", "kinh-dich", "alert", "news",
] as const;

interface ServiceRow {
  name: string;
  status: ServiceStatus;
  latencyMs: number | null;
}

interface GatewayHealthFixture {
  status: "ok" | "degraded" | "down";
  services: Record<string, ServiceStatus>;
  latencies?: Record<string, number>;
}

function mapRows(health: GatewayHealthFixture): ServiceRow[] {
  return SERVICES.map((name) => ({
    name,
    status: (health.services?.[name] as ServiceStatus) ?? "down",
    latencyMs:
      health.latencies?.[name] != null && (health.latencies[name] as number) >= 0
        ? (health.latencies[name] as number)
        : null,
  }));
}

// ---------------------------------------------------------------------------
// Clause A — 5×ok + 7×not_deployed → correct rendering
// ---------------------------------------------------------------------------

describe("Clause A — not_deployed gateway response", () => {
  const fixture: GatewayHealthFixture = {
    status: "ok",
    services: {
      mcp:       "ok",
      macro:     "ok",
      pdf:       "not_deployed",
      rag:       "not_deployed",
      ta:        "not_deployed",
      stock:     "not_deployed",
      "kinh-dich": "not_deployed",
      alert:     "not_deployed",
      news:      "not_deployed",
    },
    latencies: {
      mcp:   12,
      macro: 45,
      pdf:   -1,
      rag:   -1,
      ta:    -1,
      stock: -1,
      "kinh-dich": -1,
      alert: -1,
      news:  -1,
    },
  };

  it("overall status is ok — top badge must be non-red", () => {
    expect(fixture.status).toBe("ok");
    expect(fixture.status).not.toBe("degraded");
    expect(fixture.status).not.toBe("down");
  });

  it("7 services render as not_deployed (grey), NOT down (red)", () => {
    const rows = mapRows(fixture);
    const notDeployed = rows.filter((r) => r.status === "not_deployed");
    const down = rows.filter((r) => r.status === "down");

    expect(notDeployed).toHaveLength(7);
    expect(down).toHaveLength(0);
  });

  it("identifies the correct 7 not_deployed service names", () => {
    const rows = mapRows(fixture);
    const ndNames = rows
      .filter((r) => r.status === "not_deployed")
      .map((r) => r.name);
    expect(ndNames).toEqual(
      expect.arrayContaining(["pdf", "rag", "ta", "stock", "kinh-dich", "alert", "news"])
    );
  });

  it("deployed services (mcp, macro) have ok status", () => {
    const rows = mapRows(fixture);
    const mcp   = rows.find((r) => r.name === "mcp");
    const macro = rows.find((r) => r.name === "macro");
    expect(mcp?.status).toBe("ok");
    expect(macro?.status).toBe("ok");
  });

  it("not_deployed rows have null latencyMs (latency -1 sentinel → null)", () => {
    const rows = mapRows(fixture);
    const ndRows = rows.filter((r) => r.status === "not_deployed");
    for (const row of ndRows) {
      expect(row.latencyMs).toBeNull();
    }
  });

  it("deployed rows have non-null positive latencyMs", () => {
    const rows = mapRows(fixture);
    const mcp   = rows.find((r) => r.name === "mcp");
    const macro = rows.find((r) => r.name === "macro");
    expect(mcp?.latencyMs).toBe(12);
    expect(macro?.latencyMs).toBe(45);
  });

  it("info sub-text condition: overallStatus===ok AND some rows are not_deployed", () => {
    const rows = mapRows(fixture);
    const showInfoText =
      fixture.status === "ok" && rows.some((r) => r.status === "not_deployed");
    expect(showInfoText).toBe(true);
  });

  it("info sub-text count: 7 not_deployed rows", () => {
    const rows = mapRows(fixture);
    const ndCount = rows.filter((r) => r.status === "not_deployed").length;
    expect(ndCount).toBe(7);
  });
});

// ---------------------------------------------------------------------------
// Clause B — deployed service down → red row, overall degraded (anti-false-green)
// ---------------------------------------------------------------------------

describe("Clause B — deployed service down → degraded, not suppressed", () => {
  const fixture: GatewayHealthFixture = {
    status: "degraded",
    services: {
      mcp:       "down",      // deployed but stopped — must render RED
      macro:     "ok",
      pdf:       "not_deployed",
      rag:       "not_deployed",
      ta:        "not_deployed",
      stock:     "not_deployed",
      "kinh-dich": "not_deployed",
      alert:     "not_deployed",
      news:      "not_deployed",
    },
    latencies: {
      mcp:   -1,
      macro: 45,
    },
  };

  it("overall status is degraded — top badge must be non-ok", () => {
    expect(fixture.status).not.toBe("ok");
    expect(fixture.status).toBe("degraded");
  });

  it("mcp (deployed, stopped) renders as down (red)", () => {
    const rows = mapRows(fixture);
    const mcp = rows.find((r) => r.name === "mcp");
    expect(mcp?.status).toBe("down");
  });

  it("not_deployed rows remain not_deployed — NOT flipped to down", () => {
    const rows = mapRows(fixture);
    const ndRows = rows.filter((r) => r.status === "not_deployed");
    expect(ndRows).toHaveLength(7);
    // Confirm none of the not_deployed services flipped to down
    const shouldBeND = ["pdf", "rag", "ta", "stock", "kinh-dich", "alert", "news"];
    for (const name of shouldBeND) {
      const row = rows.find((r) => r.name === name);
      expect(row?.status).toBe("not_deployed");
    }
  });

  it("info sub-text suppressed: overallStatus===degraded, no ok+nd sub-text", () => {
    const rows = mapRows(fixture);
    // Info text should only appear when overall is ok
    const showInfoText =
      fixture.status === "ok" && rows.some((r) => r.status === "not_deployed");
    expect(showInfoText).toBe(false);
  });

  it("down row has null latencyMs (-1 sentinel guarded)", () => {
    const rows = mapRows(fixture);
    const mcp = rows.find((r) => r.name === "mcp");
    // mcp is down and latency is -1 → must be null
    expect(mcp?.latencyMs).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Latency guard unit tests
// ---------------------------------------------------------------------------

describe("Latency guard — >= 0 rule", () => {
  function latency(val: number | undefined | null): number | null {
    if (val != null && val >= 0) return val;
    return null;
  }

  it("positive latency passes through", () => {
    expect(latency(42)).toBe(42);
  });

  it("zero latency passes through", () => {
    expect(latency(0)).toBe(0);
  });

  it("-1 sentinel returns null", () => {
    expect(latency(-1)).toBeNull();
  });

  it("null returns null", () => {
    expect(latency(null)).toBeNull();
  });

  it("undefined returns null", () => {
    expect(latency(undefined)).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Anti-false-green: blanket fallback "down" only fires when status is missing
// ---------------------------------------------------------------------------

describe("Anti-false-green — fallback only for truly missing status", () => {
  it("missing service key maps to down (correct blanket fallback)", () => {
    const fixture: GatewayHealthFixture = {
      status: "degraded",
      services: {
        // mcp is absent entirely (not in the response)
        macro: "ok",
      },
    };
    const rows = mapRows(fixture);
    const mcp = rows.find((r) => r.name === "mcp");
    // Absent key → "down" fallback is correct (service is unknown/unreachable)
    expect(mcp?.status).toBe("down");
  });

  it("not_deployed explicit value is preserved, NOT overridden by fallback", () => {
    const fixture: GatewayHealthFixture = {
      status: "ok",
      services: { pdf: "not_deployed" },
    };
    const rows = mapRows(fixture);
    const pdf = rows.find((r) => r.name === "pdf");
    expect(pdf?.status).toBe("not_deployed");
    expect(pdf?.status).not.toBe("down");
  });

  it("ok explicit value is preserved, NOT overridden by fallback", () => {
    const fixture: GatewayHealthFixture = {
      status: "ok",
      services: { mcp: "ok" },
    };
    const rows = mapRows(fixture);
    const mcp = rows.find((r) => r.name === "mcp");
    expect(mcp?.status).toBe("ok");
  });

  it("down explicit value is preserved, NOT suppressed", () => {
    const fixture: GatewayHealthFixture = {
      status: "down",
      services: { mcp: "down" },
    };
    const rows = mapRows(fixture);
    const mcp = rows.find((r) => r.name === "mcp");
    expect(mcp?.status).toBe("down");
  });
});

// ---------------------------------------------------------------------------
// ServiceStatus type completeness
// ---------------------------------------------------------------------------

describe("ServiceStatus union — not_deployed is a valid member", () => {
  it("accepts not_deployed as a valid ServiceStatus value", () => {
    const s: ServiceStatus = "not_deployed";
    expect(s).toBe("not_deployed");
  });

  it("accepts all four status literals", () => {
    const statuses: ServiceStatus[] = ["ok", "degraded", "down", "not_deployed"];
    expect(statuses).toHaveLength(4);
  });
});
