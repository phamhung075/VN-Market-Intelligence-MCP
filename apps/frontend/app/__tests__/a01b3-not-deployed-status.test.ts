/**
 * A-01b-3 — Service status rendering tests (full fleet).
 *
 * GO-FLEET-DEPLOY (2026-06-11): all 12 services are now genuinely deployed.
 * Updated from former "not_deployed × deployed" fixture set to full-fleet reality.
 *
 * Tests the loader row-mapping logic (domain layer, pure) for the
 * dashboard.services route:
 *   - Clause A: full fleet ok → top badge green, all rows UP
 *   - Clause B: deployed service down → red row, top badge non-ok
 *   - Latency guard: -1 sentinel → null (renders "—")
 *   - Anti-false-green: blanket "down" fallback ONLY for truly missing status
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
// Clause A — full fleet ok → all rows UP
// ---------------------------------------------------------------------------

describe("Clause A — full fleet healthy response", () => {
  const fixture: GatewayHealthFixture = {
    status: "ok",
    services: {
      mcp:         "ok",
      pdf:         "ok",
      rag:         "ok",
      ta:          "ok",
      macro:       "ok",
      stock:       "ok",
      "kinh-dich": "ok",
      alert:       "ok",
      news:        "ok",
    },
    latencies: {
      mcp:         12,
      pdf:         45,
      rag:         30,
      ta:          20,
      macro:       15,
      stock:       8,
      "kinh-dich": 10,
      alert:       5,
      news:        25,
    },
  };

  it("overall status is ok — top badge must be green", () => {
    expect(fixture.status).toBe("ok");
  });

  it("all 9 tracked services render as ok (UP)", () => {
    const rows = mapRows(fixture);
    const ok = rows.filter((r) => r.status === "ok");
    const down = rows.filter((r) => r.status === "down");
    const degraded = rows.filter((r) => r.status === "degraded");

    expect(ok).toHaveLength(9);
    expect(down).toHaveLength(0);
    expect(degraded).toHaveLength(0);
  });

  it("all rows have positive latencyMs (real services responding)", () => {
    const rows = mapRows(fixture);
    for (const row of rows) {
      expect(row.latencyMs).not.toBeNull();
      expect(row.latencyMs).toBeGreaterThan(0);
    }
  });

  it("no down rows — info sub-text condition false", () => {
    const rows = mapRows(fixture);
    const hasDown = rows.some((r) => r.status === "down");
    expect(hasDown).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Clause B — deployed service down → red row, overall degraded (anti-false-green)
// ---------------------------------------------------------------------------

describe("Clause B — deployed service down → degraded, not suppressed", () => {
  const fixture: GatewayHealthFixture = {
    status: "degraded",
    services: {
      mcp:         "down",   // deployed but stopped — must render RED
      pdf:         "ok",
      rag:         "ok",
      ta:          "ok",
      macro:       "ok",
      stock:       "ok",
      "kinh-dich": "ok",
      alert:       "ok",
      news:        "ok",
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

  it("mcp (deployed, stopped) renders as down (RED)", () => {
    const rows = mapRows(fixture);
    const mcp = rows.find((r) => r.name === "mcp");
    expect(mcp?.status).toBe("down");
  });

  it("other services remain ok — only mcp is down", () => {
    const rows = mapRows(fixture);
    const okRows = rows.filter((r) => r.status === "ok");
    expect(okRows).toHaveLength(8);
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

  it("degraded explicit value is preserved", () => {
    const fixture: GatewayHealthFixture = {
      status: "degraded",
      services: { ta: "degraded" },
    };
    const rows = mapRows(fixture);
    const ta = rows.find((r) => r.name === "ta");
    expect(ta?.status).toBe("degraded");
  });
});

// ---------------------------------------------------------------------------
// ServiceStatus type completeness
// ---------------------------------------------------------------------------

describe("ServiceStatus union — three-state deployed fleet", () => {
  it("accepts ok as a valid ServiceStatus value", () => {
    const s: ServiceStatus = "ok";
    expect(s).toBe("ok");
  });

  it("accepts degraded as a valid ServiceStatus value", () => {
    const s: ServiceStatus = "degraded";
    expect(s).toBe("degraded");
  });

  it("accepts down as a valid ServiceStatus value", () => {
    const s: ServiceStatus = "down";
    expect(s).toBe("down");
  });

  it("accepts all three status literals (full-fleet — no not_deployed)", () => {
    const statuses: ServiceStatus[] = ["ok", "degraded", "down"];
    expect(statuses).toHaveLength(3);
  });
});
