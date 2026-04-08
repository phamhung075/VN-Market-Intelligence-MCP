/**
 * Task 1019 — SSC fetch network timeout not tripping circuit breaker
 *
 * Bug (report 1015, 2026-04-07 12:25 UTC): the listSscDocuments wrap was
 * already fixed by 13db1f7, but the *PDF download* path in
 * downloadAndExtractPdf still caught errors internally and returned
 * { text: "", confidence: 0 }, so the registered breakers.ssc never saw
 * the failure. Network timeouts during BCTC PDF fetch silently degraded
 * freshness without ever tripping the breaker.
 *
 * Fix: downloadAndExtractPdf accepts an optional CircuitBreaker; when
 * present, HTTP errors are recorded against the breaker (via execute())
 * before the outer catch swallows them.
 */
import { describe, test, expect } from "bun:test";
import { downloadAndExtractPdf } from "../infrastructure/fetchers/pdf.js";
import { CircuitBreaker } from "../infrastructure/circuitBreaker.js";
import type { HttpClient } from "../infrastructure/fetchers/ssc.js";

describe("Task 1019 — downloadAndExtractPdf records HTTP failure on breaker", () => {
  test("network timeout records a failure on the provided breaker", async () => {
    const breaker = new CircuitBreaker("ssc-test", { failureThreshold: 5 });
    const failingClient: HttpClient = {
      async get(): Promise<string> {
        throw new Error("Network timeout");
      },
    };

    expect(breaker.stats.failures).toBe(0);

    const result = await downloadAndExtractPdf(
      "https://example.com/x.pdf",
      failingClient,
      breaker,
    );

    // Outer contract preserved: never throws, returns empty on failure.
    expect(result.text).toBe("");
    expect(result.confidence).toBe(0);

    // New behaviour: breaker observed the failure.
    expect(breaker.stats.failures).toBe(1);
    expect(breaker.stats.lastFailure).not.toBeNull();
  });

  test("repeated failures trip the breaker after threshold", async () => {
    const breaker = new CircuitBreaker("ssc-test", { failureThreshold: 3 });
    const failingClient: HttpClient = {
      async get(): Promise<string> {
        throw new Error("Network timeout");
      },
    };

    for (let i = 0; i < 3; i++) {
      await downloadAndExtractPdf("https://example.com/x.pdf", failingClient, breaker);
    }

    expect(breaker.stats.state).toBe("open");
  });

  test("breaker parameter is optional — backward compatible", async () => {
    const failingClient: HttpClient = {
      async get(): Promise<string> {
        throw new Error("Network timeout");
      },
    };

    // No breaker — must still swallow + return empty
    const result = await downloadAndExtractPdf(
      "https://example.com/x.pdf",
      failingClient,
    );
    expect(result.text).toBe("");
    expect(result.confidence).toBe(0);
  });
});
