/**
 * Task 1833l — Yahoo Finance 404 Graceful Handling
 *
 * Verifies that a 404 HTTP response for an unknown/delisted ticker is handled
 * gracefully in fetchYahooFinancePrices():
 *   - Does NOT throw
 *   - Sets that symbol's field to 0
 *   - Other symbols are unaffected
 *
 * The mock simulates an axios-style error with a `response.status` of 404.
 *
 * Test IDs: YF404-01, YF404-02
 */

import { describe, it, expect } from "bun:test";
import {
  fetchYahooFinancePrices,
  type HttpClient,
} from "../infrastructure/fetchers/yahooFinance.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildYahooJsonResponse(price: number): string {
  return JSON.stringify({
    chart: {
      result: [{ meta: { regularMarketPrice: price, symbol: "TEST" } }],
      error: null,
    },
  });
}

/** Simulates the error axios throws on a 404 response. */
function make404Error(): Error {
  const err = new Error("Request failed with status code 404") as Error & {
    response?: { status: number };
  };
  err.response = { status: 404 };
  return err;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1833l — Yahoo Finance 404 graceful handling", () => {
  // ── YF404-01: 404 on one symbol → field=0, no throw, others succeed ───────
  it("YF404-01: sets field to 0 when one symbol returns 404 — does not throw", async () => {
    const client: HttpClient = {
      async get(url: string): Promise<string> {
        // BZ=F (brent) returns 404; others succeed
        if (url.includes("BZ%3DF") || url.includes("BZ=F")) {
          throw make404Error();
        }
        return buildYahooJsonResponse(100.0);
      },
    };

    const result = await fetchYahooFinancePrices(client);

    // Does not throw — result may still be non-null (other symbols parsed)
    expect(result).not.toBeNull();
    // The 404 symbol's field is 0
    expect(result!.brentCrudeUSD).toBe(0);
    // Other symbols are unaffected
    expect(result!.goldUSDPerOz).toBeCloseTo(100.0, 2);
  });

  // ── YF404-02: all symbols 404 → returns null, no throw ────────────────────
  it("YF404-02: returns null when all symbols return 404 — does not throw", async () => {
    const client: HttpClient = {
      async get(_url: string): Promise<string> {
        throw make404Error();
      },
    };

    const result = await fetchYahooFinancePrices(client);
    expect(result).toBeNull();
  });
});
