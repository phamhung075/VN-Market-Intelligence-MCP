/**
 * Task 1248 — BDI data staleness: route through VPS proxy for geo-blocked sources
 *
 * The Baltic Dry Index fetcher hits Yahoo Finance which can be geo-blocked
 * from France. Fix: support routing through VPS proxy when BDI_VPS_PROXY_URL
 * is set, using the same pattern as other geo-blocked sources.
 *
 * Also adds a /api/push-shipping-index endpoint that the VPS can push to
 * directly (same pattern as push-prices, push-sbv-rates, etc.).
 *
 * TDD: Tests written first (RED), then implementation.
 */

Bun.env["DB_PATH"] = ":memory:";
import { describe, it, expect } from "bun:test";
import {
  fetchShippingIndices,
  buildShippingIndexUrl,
  type ShippingIndex,
} from "../infrastructure/fetchers/shippingIndex.js";

// ---------------------------------------------------------------------------
// Mock HTTP clients
// ---------------------------------------------------------------------------

function makeOkClient(price: number, symbol: string = "^BDI") {
  return {
    async get(_url: string): Promise<string> {
      return JSON.stringify({
        chart: {
          result: [
            {
              meta: {
                regularMarketPrice: price,
                previousClose: price * 0.98,
                regularMarketTime: 1704067200,
                symbol,
              },
            },
          ],
        },
      });
    },
  };
}

function makeErrorClient() {
  return {
    async get(_url: string): Promise<string> {
      throw new Error("Connection refused: geo-blocked from France");
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1248 — BDI VPS proxy route", () => {
  // ── buildShippingIndexUrl ─────────────────────────────────────────────────

  it("buildShippingIndexUrl uses YAHOO_FINANCE_API_URL when BDI_VPS_PROXY_URL is not set", () => {
    delete process.env["BDI_VPS_PROXY_URL"];
    const url = buildShippingIndexUrl("^BDI", "https://query1.finance.yahoo.com/v8/finance/chart");
    expect(url).toContain("query1.finance.yahoo.com");
    expect(url).toContain("BDI");
  });

  it("buildShippingIndexUrl uses BDI_VPS_PROXY_URL when set", () => {
    process.env["BDI_VPS_PROXY_URL"] = "http://localhost:8080/proxy/yahoo";
    const url = buildShippingIndexUrl("^BDI", "https://query1.finance.yahoo.com/v8/finance/chart");
    expect(url).toContain("localhost:8080/proxy/yahoo");
    delete process.env["BDI_VPS_PROXY_URL"];
  });

  it("buildShippingIndexUrl encodes the symbol correctly", () => {
    const url = buildShippingIndexUrl("^BDI", "https://query1.finance.yahoo.com/v8/finance/chart");
    // ^BDI should be URL-encoded as %5EBDI
    expect(url).toContain("%5EBDI");
  });

  // ── fetchShippingIndices with proxy override ──────────────────────────────

  it("fetchShippingIndices uses injected client (existing behaviour unchanged)", async () => {
    const indices = await fetchShippingIndices(makeOkClient(1400));
    expect(Array.isArray(indices)).toBe(true);
    expect(indices.length).toBeGreaterThan(0);
    const bdi = indices.find((i) => i.name === "BDI");
    expect(bdi).toBeDefined();
    expect(bdi!.value).toBe(1400);
  });

  it("fetchShippingIndices returns empty array when client throws (geo-block)", async () => {
    const indices = await fetchShippingIndices(makeErrorClient());
    expect(Array.isArray(indices)).toBe(true);
    // Empty due to network error — never throws
  });

  it("fetchShippingIndices accepts proxyBaseUrl override parameter", async () => {
    let capturedUrl = "";
    const interceptClient = {
      async get(url: string): Promise<string> {
        capturedUrl = url;
        return JSON.stringify({
          chart: {
            result: [{ meta: { regularMarketPrice: 1500, previousClose: 1470, regularMarketTime: 1704067200 } }],
          },
        });
      },
    };

    await fetchShippingIndices(interceptClient, "http://vps-proxy.example.com/yahoo");
    expect(capturedUrl).toContain("vps-proxy.example.com");
  });

  it("fetchShippingIndices falls back to direct fetch when proxyBaseUrl is not provided", async () => {
    let capturedUrl = "";
    const interceptClient = {
      async get(url: string): Promise<string> {
        capturedUrl = url;
        return JSON.stringify({
          chart: {
            result: [{ meta: { regularMarketPrice: 1500, previousClose: 1470, regularMarketTime: 1704067200 } } ],
          },
        });
      },
    };

    delete process.env["BDI_VPS_PROXY_URL"];
    await fetchShippingIndices(interceptClient);
    expect(capturedUrl).toContain("finance.yahoo.com");
  });

  it("BDI_VPS_PROXY_URL env variable is used when no proxyBaseUrl parameter given", async () => {
    process.env["BDI_VPS_PROXY_URL"] = "http://vinahost-proxy/bdi";

    let capturedUrl = "";
    const interceptClient = {
      async get(url: string): Promise<string> {
        capturedUrl = url;
        return JSON.stringify({ chart: { result: null } });
      },
    };

    await fetchShippingIndices(interceptClient);
    expect(capturedUrl).toContain("vinahost-proxy/bdi");

    delete process.env["BDI_VPS_PROXY_URL"];
  });

  // ── Structure validation (regression) ────────────────────────────────────

  it("returned ShippingIndex entries have all required fields", async () => {
    const indices = await fetchShippingIndices(makeOkClient(1500));
    for (const idx of indices) {
      expect(typeof idx.name).toBe("string");
      expect(typeof idx.value).toBe("number");
      expect(typeof idx.change).toBe("number");
      expect(typeof idx.changePct).toBe("number");
      expect(typeof idx.date).toBe("string");
    }
  });
});
