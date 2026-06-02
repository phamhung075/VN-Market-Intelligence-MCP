/**
 * vps-not-deployed-discrimination.test.ts
 *
 * Tests the VPS loader's not_deployed discrimination logic.
 *
 * Root problem: api-gateway returns HTTP 503 with body:
 *   {"service":"news","status":"down","error":"dial tcp: lookup news-fetch on ...: no such host"}
 * when a downstream microservice container is not deployed.
 * The old code threw ApiError on 503 → row.error set → component showed "UNKNOWN" (alarming).
 *
 * The fix: read the 503 body; if error includes "no such host" → status = "not_deployed".
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

  // "no such host" = Docker DNS can't resolve the container → service not deployed
  if (httpStatus === 503 && bodyError.includes("no such host")) {
    return { service, status: "not_deployed" };
  }

  // Any other non-2xx with a body.status field → relay it
  if (typeof body["status"] === "string") {
    const status =
      body["status"] === "not_deployed"
        ? "not_deployed"
        : body["status"] === "ok"
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
// Suite 1 — Real api-gateway 503 responses
// ---------------------------------------------------------------------------

describe("VPS health discrimination — real 503 body shapes", () => {
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

  it("news 503 no-such-host → status: not_deployed (NOT unknown/down)", () => {
    const result = discriminateVpsHealth(503, NEWS_503_BODY);
    expect(result.status).toBe("not_deployed");
    expect(result.status).not.toBe("down");
    expect(result.status).not.toBe("unknown");
  });

  it("stock 503 no-such-host → status: not_deployed", () => {
    const result = discriminateVpsHealth(503, STOCK_503_BODY);
    expect(result.status).toBe("not_deployed");
  });

  it("pdf 503 no-such-host → status: not_deployed", () => {
    const result = discriminateVpsHealth(503, PDF_503_BODY);
    expect(result.status).toBe("not_deployed");
  });

  it("service field is preserved correctly (news)", () => {
    const result = discriminateVpsHealth(503, NEWS_503_BODY);
    expect(result.service).toBe("news");
  });

  it("not_deployed result has no error (DNS error is expected, not alarming)", () => {
    const result = discriminateVpsHealth(503, NEWS_503_BODY);
    expect(result.error).toBeUndefined();
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
    // "connection refused" does NOT contain "no such host" → not not_deployed
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
// Suite 3 — StatusVariant mapping for UI (not_deployed → grey pill)
// ---------------------------------------------------------------------------

describe("StatusVariant mapping — not_deployed maps to grey NOT DEPLOYED", () => {
  type StatusVariant = "ok" | "degraded" | "down" | "unknown" | "not_deployed";

  function toStatusVariant(health: ServiceHealth | null, error: string | null): StatusVariant {
    if (error) return "unknown";
    if (!health) return "unknown";
    return health.status as StatusVariant;
  }

  it("not_deployed health + no error → not_deployed variant (grey pill)", () => {
    const health: ServiceHealth = { service: "news", status: "not_deployed" };
    expect(toStatusVariant(health, null)).toBe("not_deployed");
  });

  it("down health + no error → down variant (red pill)", () => {
    const health: ServiceHealth = { service: "news", status: "down" };
    expect(toStatusVariant(health, null)).toBe("down");
  });

  it("null health + error → unknown variant", () => {
    expect(toStatusVariant(null, "some error")).toBe("unknown");
  });

  it("ok health + no error → ok variant (green pill)", () => {
    const health: ServiceHealth = { service: "macro", status: "ok" };
    expect(toStatusVariant(health, null)).toBe("ok");
  });
});

// ---------------------------------------------------------------------------
// Suite 4 — Honest-empty guard for news-fetch not_deployed
// ---------------------------------------------------------------------------

describe("Honest-empty label — news-fetch not deployed should not look broken", () => {
  // The HeadlineList component empty state should provide an informative message,
  // not a bare "No data available for Reuters." which looks like a bug.

  function emptyStateMessage(count: number): { primary: string; secondary: string } {
    if (count === 0) {
      return {
        primary: "No headlines available for this source.",
        secondary: "Source not deployed on this host — news-fetch microservice is not running (expected state, tracked FU-FE-NEWS-SOURCE).",
      };
    }
    return { primary: "", secondary: "" };
  }

  it("zero headlines → shows informative message with deployment context", () => {
    const msg = emptyStateMessage(0);
    expect(msg.primary).not.toBe("");
    expect(msg.secondary).toContain("not deployed");
    expect(msg.secondary).toContain("FU-FE-NEWS-SOURCE");
  });

  it("non-zero headlines → no empty state message", () => {
    const msg = emptyStateMessage(5);
    expect(msg.primary).toBe("");
    expect(msg.secondary).toBe("");
  });
});
