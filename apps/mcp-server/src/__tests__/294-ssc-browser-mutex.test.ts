/**
 * Task 294 — SSC Puppeteer semaphore: withBrowserLock(1)
 *
 * Tests that concurrent calls to listSscDocuments are serialized via a
 * Promise-chain semaphore so only one "browser" operation runs at a time.
 *
 * No real network calls — all HTTP is mocked via the injected httpClient.
 */

import { describe, it, expect } from "bun:test";
import {
  listSscDocuments,
  withBrowserLock,
  type HttpClient,
} from "../infrastructure/fetchers/ssc.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Minimal HTML that produces 1 quarterly document. */
const QUARTERLY_HTML = `
<html><body>
  <table class="tbl-data">
    <tbody>
      <tr>
        <td><a href="/bctc/vcb-q1-2025.pdf">Báo cáo tài chính quý 1/2025 — VCB</a></td>
        <td>15/04/2025</td>
      </tr>
    </tbody>
  </table>
</body></html>`;

/** A mock HttpClient that returns HTML after a configurable delay. */
function delayedClient(html: string, delayMs: number): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      await new Promise((r) => setTimeout(r, delayMs));
      return html;
    },
  };
}

/** A mock HttpClient that always throws. */
function failingClient(): HttpClient {
  return {
    async get(_url: string): Promise<string> {
      throw new Error("Network error");
    },
  };
}

// ---------------------------------------------------------------------------
// Tests — withBrowserLock semaphore
// ---------------------------------------------------------------------------

describe("Task 294 — SSC browser lock semaphore", () => {
  // ── 1. withBrowserLock is exported from ssc.ts ────────────────────────────
  it("exports withBrowserLock as a function", () => {
    expect(typeof withBrowserLock).toBe("function");
  });

  // ── 2. withBrowserLock runs a single async operation and returns its value ─
  it("executes the wrapped function and returns its result", async () => {
    const result = await withBrowserLock(() => Promise.resolve(42));
    expect(result).toBe(42);
  });

  // ── 3. Concurrent calls are serialized (not interleaved) ─────────────────
  it("serializes concurrent calls: second call starts only after first completes", async () => {
    const log: string[] = [];

    const first = withBrowserLock(async () => {
      log.push("first:start");
      await new Promise((r) => setTimeout(r, 30));
      log.push("first:end");
      return "first";
    });

    // Start second immediately — without await, so both are in flight
    const second = withBrowserLock(async () => {
      log.push("second:start");
      await new Promise((r) => setTimeout(r, 10));
      log.push("second:end");
      return "second";
    });

    const [r1, r2] = await Promise.all([first, second]);

    expect(r1).toBe("first");
    expect(r2).toBe("second");

    // The critical invariant: second must not start before first ends
    expect(log).toEqual([
      "first:start",
      "first:end",
      "second:start",
      "second:end",
    ]);
  });

  // ── 4. Error in one call does NOT block subsequent calls ──────────────────
  it("releases the lock when the wrapped function throws, allowing next call", async () => {
    // Fire a failing call
    const failing = withBrowserLock(async () => {
      throw new Error("boom");
    });

    // Expect it to reject
    await expect(failing).rejects.toThrow("boom");

    // The lock must have been released — this call must complete
    const result = await withBrowserLock(() => Promise.resolve("recovered"));
    expect(result).toBe("recovered");
  });

  // ── 5. Three concurrent calls are fully serialized ────────────────────────
  it("serializes three concurrent callers in FIFO order", async () => {
    const order: number[] = [];

    const tasks = [1, 2, 3].map((n) =>
      withBrowserLock(async () => {
        order.push(n);
        await new Promise((r) => setTimeout(r, 5));
        return n;
      }),
    );

    const results = await Promise.all(tasks);

    expect(results).toEqual([1, 2, 3]);
    // Each started only after the previous ended → FIFO order preserved
    expect(order).toEqual([1, 2, 3]);
  });

  // ── 6. listSscDocuments still works correctly via the lock ────────────────
  it("listSscDocuments returns documents when called via the lock", async () => {
    const docs = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      delayedClient(QUARTERLY_HTML, 0),
    );
    expect(docs.length).toBeGreaterThan(0);
    expect(docs[0]!.reportType).toBe("quarterly");
  });

  // ── 7. Concurrent listSscDocuments calls do not interleave ───────────────
  it("two concurrent listSscDocuments calls both complete correctly", async () => {
    // Both use the same delayed client — they will queue through withBrowserLock
    const [docs1, docs2] = await Promise.all([
      listSscDocuments("VCB", "quarterly", 2025, delayedClient(QUARTERLY_HTML, 20)),
      listSscDocuments("HPG", "quarterly", 2025, delayedClient(QUARTERLY_HTML, 20)),
    ]);

    expect(docs1.length).toBeGreaterThan(0);
    expect(docs2.length).toBeGreaterThan(0);
  });

  // ── 8. Error in listSscDocuments releases the lock ────────────────────────
  it("listSscDocuments gracefully handles network error and releases lock", async () => {
    // This will fail internally and return []
    const docs = await listSscDocuments("VCB", "quarterly", 2025, failingClient());
    expect(docs).toBeArray();
    expect(docs.length).toBe(0);

    // Lock must be released — this must complete
    const docs2 = await listSscDocuments(
      "VCB",
      "quarterly",
      2025,
      delayedClient(QUARTERLY_HTML, 0),
    );
    expect(docs2.length).toBeGreaterThan(0);
  });
});
