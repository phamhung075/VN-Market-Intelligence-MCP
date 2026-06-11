/**
 * vps-not-deployed-discrimination.test.ts
 *
 * Tests the VPS loader's health discrimination logic.
 *
 * GO-FLEET-DEPLOY (2026-06-11): all 12 services are genuinely deployed.
 * "not_deployed" removed from ServiceStatus. Updated to reflect new semantics:
 *
 * Root problem (still valid): api-gateway returns HTTP 503 with body:
 *   {"service":"news","status":"down","error":"dial tcp: lookup news-fetch on ...: no such host"}
 * when a downstream microservice container is missing/crashed.
 *
 * Old semantics: "no such host" → status = "not_deployed" (grey pill, silenced).
 * New semantics:  "no such host" → status = "down" (RED pill, honest).
 *   Rationale: all services are INTENDED to be deployed. If Docker DNS can't
 *   find the container, the container is genuinely missing — that is DOWN, not
 *   an expected absent-by-design state. The anti-false-green invariant applies.
 *
 * Discrimination is still useful to distinguish "container DNS missing" (DOWN)
 * from "connection refused" (also DOWN but different root cause). Both render
 * RED — the error message gives the operator actionable detail.
 *
 * These tests verify the discrimination logic as a pure function,
 * mirroring exactly what fetchVpsServiceHealth() does in the loader.
 */

import { describe, it, expect } from "vitest";
import type { ServiceHealth } from "~/domain/health";

// ---------------------------------------------------------------------------
// Pure discrimination function — mirrors loader logic
// ---------------------------------------------------------------------------

function discriminateVpsHealth(
  httpStatus: number,
  body: Record<string, unknown>,
): ServiceHealth {
  const service = (body["service"] as string | undefined) ?? "unknown";
  const bodyError = typeof body["error"] === "string" ? body["error"] : "";

  // "no such host" = Docker DNS can't resolve the container → container is missing/crashed → DOWN
  if (httpStatus === 503 && bodyError.includes("no such host")) {
    return { service, status: "down", error: "Container not running (DNS: no such host)" };
  }

  // Any other non-2xx with a body.status field → relay it (guarded to ServiceStatus union)
  if (typeof body["status"] === "string") {
    const status =
      body["status"] === "ok"
        ? "ok"
        : body["status"] === "degraded"
          ? "degraded"
          : "down";
    return {
      service,
      status,
      error: bodyError || undefined,
    };
  }

  // Fallback: treat as down
  return {
    service,
    status: "down",
    error: bodyError || `HTTP ${httpStatus}`,
  };
}

// ---------------------------------------------------------------------------
// Suite 1 — 503 "no such host" → DOWN (container genuinely missing)
// ---------------------------------------------------------------------------

describe("VPS health discrimination — 503 no-such-host → DOWN (container missing)", () => {
  const NEWS_503_BODY: Record<string, unknown> = {
    service: "news",
    status: "down",
    latencyMs: 5,
    error: "Get \"http://news-fetch:5008/health\": dial tcp: lookup news-fetch on 127.0.0.11:53: no such host",
  };

  const STOCK_503_BODY: Record<string, unknown> = {
    service: "stock",
    status: "down",
    latencyMs: 6,
    error: "Get \"http://stock-price:5000/health\": dial tcp: lookup stock-price on 127.0.0.11:53: no such host",
  };

  const PDF_503_BODY: Record<string, unknown> = {
    service: "pdf",
    status: "down",
    latencyMs: 6,
    error: "Get \"http://pdf-extractor:5001/health\": dial tcp: lookup pdf-extractor on 127.0.0.11:53: no such host",
  };

  it("news 503 no-such-host → status: down (RED — container missing, not by-design)", () => {
    const result = discriminateVpsHealth(503, NEWS_503_BODY);
    expect(result.status).toBe("down");
  });

  it("stock 503 no-such-host → status: down", () => {
    const result = discriminateVpsHealth(503, STOCK_503_BODY);
    expect(result.status).toBe("down");
  });

  it("pdf 503 no-such-host → status: down", () => {
    const result = discriminateVpsHealth(503, PDF_503_BODY);
    expect(result.status).toBe("down");
  });

  it("service field is preserved correctly (news)", () => {
    const result = discriminateVpsHealth(503, NEWS_503_BODY);
    expect(result.service).toBe("news");
  });

  it("no-such-host result carries a diagnostic error message (actionable for operator)", () => {
    const result = discriminateVpsHealth(503, NEWS_503_BODY);
    expect(result.error).toBeDefined();
    expect(result.error).toContain("no such host");
  });
});

// ---------------------------------------------------------------------------
// Suite 2 — Genuine failures must still show DOWN
// ---------------------------------------------------------------------------

describe("VPS health discrimination — genuine failures stay DOWN", () => {
  it("503 + non-DNS error → status: down (real failure)", () => {
    const body: Record<string, unknown> = {
      service: "news",
      status: "down",
      error: "connection refused",
    };
    const result = discriminateVpsHealth(503, body);
    expect(result.status).toBe("down");
  });

  it("500 → status: down regardless of body", () => {
    const body: Record<string, unknown> = {
      service: "news",
      status: "down",
      error: "internal server error",
    };
    const result = discriminateVpsHealth(500, body);
    expect(result.status).toBe("down");
  });

  it("503 + body.status=ok (odd but possible) → relay ok status", () => {
    const body: Record<string, unknown> = {
      service: "news",
      status: "ok",
    };
    const result = discriminateVpsHealth(503, body);
    // No "no such host" in error, body.status = "ok"
    expect(result.status).toBe("ok");
  });

  it("503 + empty body (no status field) → fallback down", () => {
    const result = discriminateVpsHealth(503, {});
    expect(result.status).toBe("down");
    expect(result.error).toBe("HTTP 503");
  });
});

// ---------------------------------------------------------------------------
// Suite 3 — ServiceHealth status mapping for UI
// ---------------------------------------------------------------------------

describe("ServiceHealth status mapping — down renders red", () => {
  type StatusVariant = "ok" | "degraded" | "down" | "unknown";

  function toStatusVariant(health: ServiceHealth | null, error: string | null): StatusVariant {
    if (error) return "unknown";
    if (!health) return "unknown";
    if (health.status === "ok") return "ok";
    if (health.status === "degraded") return "degraded";
    return "down";
  }

  it("down health + no error → down variant (RED pill)", () => {
    const health: ServiceHealth = { service: "news", status: "down" };
    expect(toStatusVariant(health, null)).toBe("down");
  });

  it("null health + error → unknown variant", () => {
    expect(toStatusVariant(null, "some error")).toBe("unknown");
  });

  it("ok health + no error → ok variant (GREEN pill)", () => {
    const health: ServiceHealth = { service: "macro", status: "ok" };
    expect(toStatusVariant(health, null)).toBe("ok");
  });

  it("degraded health + no error → degraded variant (YELLOW pill)", () => {
    const health: ServiceHealth = { service: "ta", status: "degraded" };
    expect(toStatusVariant(health, null)).toBe("degraded");
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Anti-false-green: no-such-host must NOT be silenced
// ---------------------------------------------------------------------------

describe("Anti-false-green — no-such-host container missing must show DOWN", () => {
  it("503 + no-such-host is DOWN, not silent/grey", () => {
    const body: Record<string, unknown> = {
      service: "kinh-dich",
      status: "down",
      error: "dial tcp: lookup kinh-dich-service on 127.0.0.11:53: no such host",
    };
    const result = discriminateVpsHealth(503, body);
    // Must be red/down — not silenced as a non-alarming "expected" state
    expect(result.status).toBe("down");
  });
});
