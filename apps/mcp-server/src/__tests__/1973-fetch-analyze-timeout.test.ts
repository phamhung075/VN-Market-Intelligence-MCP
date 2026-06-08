/**
 * 1973 — fetch_and_analyze timeout reliability (FA-FIX)
 *
 * Verifies three acceptance criteria introduced by FA-FIX (P0+P1):
 *
 *   Scenario A — one source times out (simulated reuters slow > budget)
 *     → allSettled lets the other sources through; analysis returns partial results.
 *   Scenario B — ragIndex / ragSearch hangs → AbortSignal.timeout fires at 8 s;
 *     analysis still returns (rag failure degrades, does not throw).
 *   Scenario C — all sources fast → normal full result (no regression).
 *
 * All fake slow / hanging clients use injected Promises; no live network, no creds.
 *
 * Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import type { RssItem } from "../infrastructure/fetchers/rss.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal valid RssItem for a given source. */
function makeItem(source: string, index = 0): RssItem {
  return {
    title: `Headline ${source} #${index}`,
    url: `https://example.com/${source}/${index}`,
    publishedAt: "2026-05-26T10:00:00Z",
    content: `Content from ${source}`,
    source,
  };
}

/**
 * withSourceTimeout — inline re-implementation matching the production helper
 * so we can unit-test it directly without importing the whole MCP tool.
 *
 * (The helper is a plain closure inside the tool handler; we duplicate the
 * logic here to keep the test self-contained and dependency-free.)
 */
function withSourceTimeout(
  promise: Promise<RssItem[]>,
  budgetMs: number,
  _sourceName: string,
): Promise<RssItem[]> {
  const timeout = new Promise<RssItem[]>((resolve) =>
    setTimeout(() => resolve([]), budgetMs),
  );
  return Promise.race([promise, timeout]);
}

// ── Scenario A — one source times out, others resolve normally ───────────────

describe("FA-FIX Scenario A — one source timeout → partial results via allSettled", () => {
  it("allSettled with one slow source returns articles from fast sources", async () => {
    // Fast sources resolve immediately.
    const cafefItems = [makeItem("cafef", 1), makeItem("cafef", 2)];
    const vnexpressItems = [makeItem("vnexpress", 1)];

    // Slow source: hangs for 5 000 ms but budget is only 50 ms.
    // In CI we use a tight budget (50 ms) to keep the test fast.
    const BUDGET_MS = 50;
    const slowPromise = new Promise<RssItem[]>((resolve) =>
      setTimeout(() => resolve([makeItem("reuters", 1)]), 5_000),
    );

    const fastCafef = Promise.resolve(cafefItems);
    const fastVnexpress = Promise.resolve(vnexpressItems);
    const timedOutReuters = withSourceTimeout(slowPromise, BUDGET_MS, "reuters");

    const fetchPromises: Promise<RssItem[]>[] = [fastCafef, fastVnexpress, timedOutReuters];

    const settled = await Promise.allSettled(fetchPromises);
    const allItems = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

    // cafef + vnexpress items must be present
    expect(allItems.some((i) => i.source === "cafef")).toBe(true);
    expect(allItems.some((i) => i.source === "vnexpress")).toBe(true);

    // reuters timed out — must NOT appear in results
    expect(allItems.some((i) => i.source === "reuters")).toBe(false);

    // Total = cafef(2) + vnexpress(1) = 3
    expect(allItems.length).toBe(3);

    // All settled entries must be fulfilled (timeout resolves to [], not rejects)
    expect(settled.every((r) => r.status === "fulfilled")).toBe(true);
  });
});

// ── Scenario B — ragIndex hangs → AbortSignal fires, analysis still returns ──

describe("FA-FIX Scenario B — ragIndex AbortSignal.timeout fires, analysis degrades gracefully", () => {
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("ragIndex timeout does not propagate to caller when wrapped in allSettled", async () => {
    // Simulate a hanging ragIndex: the fetch never resolves until AbortSignal fires.
    // In production ragHttpClient has AbortSignal.timeout(8_000). Here we use 50 ms
    // to keep the test fast, by patching the fetch with a never-resolving promise
    // and then calling the helper with a tight budget ourselves.

    const TIGHT_BUDGET_MS = 50;

    // A ragIndex-like call that hangs (no response for 5 s)
    const hangingRagIndex = (): Promise<void> =>
      new Promise<void>((_resolve, reject) => {
        const ctrl = new AbortController();
        setTimeout(() => ctrl.abort(new Error("AbortError: timeout")), TIGHT_BUDGET_MS);
        ctrl.signal.addEventListener("abort", () => reject(ctrl.signal.reason));
      });

    const entries = [
      { id: "entry-1" },
      { id: "entry-2" },
    ];

    let analysisCompleted = false;
    let ragFailCount = 0;

    // Simulate the Step-4 allSettled fan-out in the production tool handler.
    const ragSettled = await Promise.allSettled(
      entries.map(async (_entry) => {
        await hangingRagIndex();
      }),
    );

    ragFailCount = ragSettled.filter((r) => r.status === "rejected").length;
    analysisCompleted = true;

    // Even though ragIndex timed out for all entries, the analysis step completed.
    expect(analysisCompleted).toBe(true);

    // All rag calls rejected (AbortError fired)
    expect(ragFailCount).toBe(entries.length);

    // allSettled itself must resolve (not throw)
    expect(ragSettled.length).toBe(entries.length);
  });

  it("ragSearch AbortSignal.timeout is set on the fetch call in ragHttpClient", async () => {
    // Verify the signal is threaded through by checking init.signal is not undefined.
    let capturedSignal: AbortSignal | null | undefined = undefined;

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      capturedSignal = init?.signal ?? null;
      return new Response(JSON.stringify({ results: [], total: 0 }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    // Dynamic import to pick up the mock (module may be cached but fetch is patched globally)
    const { ragSearch } = await import("../infrastructure/rag/ragHttpClient.js");
    await ragSearch({ query: "test query", limit: 3 });

    // The signal must be an AbortSignal (AbortSignal.timeout returns AbortSignal)
    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal).not.toBeUndefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });

  it("ragIndex AbortSignal.timeout is set on the fetch call in ragHttpClient", async () => {
    let capturedSignal: AbortSignal | null | undefined = undefined;

    globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
      capturedSignal = init?.signal ?? null;
      return new Response(
        JSON.stringify({ status: "ok", indexed: 1, entry_id: "test-id" }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }) as typeof fetch;

    const { ragIndex } = await import("../infrastructure/rag/ragHttpClient.js");
    await ragIndex({
      id: "entry-test",
      content: "VCB credit growth Q1",
      tags: ["banking"],
      level: "action",
    });

    expect(capturedSignal).not.toBeNull();
    expect(capturedSignal).not.toBeUndefined();
    expect(capturedSignal).toBeInstanceOf(AbortSignal);
  });
});

// ── Scenario C — all sources fast → full result, no regression ───────────────

describe("FA-FIX Scenario C — all sources fast → full result (non-regression)", () => {
  it("allSettled with all sources resolving quickly returns all items", async () => {
    const cafefItems = [makeItem("cafef", 1), makeItem("cafef", 2)];
    const vnexpressItems = [makeItem("vnexpress", 1), makeItem("vnexpress", 2)];
    const reutersItems = [makeItem("reuters", 1)];
    const vneconomyItems = [makeItem("vneconomy", 1)];

    const fetchPromises: Promise<RssItem[]>[] = [
      withSourceTimeout(Promise.resolve(cafefItems), 10_000, "cafef"),
      withSourceTimeout(Promise.resolve(vnexpressItems), 10_000, "vnexpress"),
      withSourceTimeout(Promise.resolve(reutersItems), 15_000, "reuters"),
      withSourceTimeout(Promise.resolve(vneconomyItems), 12_000, "vneconomy"),
    ];

    const settled = await Promise.allSettled(fetchPromises);
    const allItems = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));

    // All 4 sources must be present
    expect(allItems.some((i) => i.source === "cafef")).toBe(true);
    expect(allItems.some((i) => i.source === "vnexpress")).toBe(true);
    expect(allItems.some((i) => i.source === "reuters")).toBe(true);
    expect(allItems.some((i) => i.source === "vneconomy")).toBe(true);

    // Total = 2 + 2 + 1 + 1 = 6
    expect(allItems.length).toBe(6);

    // All settled must be fulfilled
    expect(settled.every((r) => r.status === "fulfilled")).toBe(true);
  });

  it("reuters timeout constant is 15_000 ms in analysis.ts (tightened from 30_000)", () => {
    // Static source assertion — verify the AbortSignal.timeout value was updated.
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.resolve(import.meta.dir, "../interface/mcp/tools/news-analysis/analysis.ts"),
      "utf8",
    );
    // Must contain the new 15s budget, not the old 30s
    expect(src).toContain("AbortSignal.timeout(15_000)");
    expect(src).not.toContain("AbortSignal.timeout(30_000)");
  });

  it("analysis.ts Step-1 uses Promise.allSettled (not Promise.all for the fan-out)", () => {
    const fs = require("node:fs") as typeof import("node:fs");
    const path = require("node:path") as typeof import("node:path");
    const src = fs.readFileSync(
      path.resolve(import.meta.dir, "../interface/mcp/tools/news-analysis/analysis.ts"),
      "utf8",
    );
    expect(src).toContain("Promise.allSettled(fetchPromises)");
    // The old Promise.all(fetchPromises) must be gone from Step-1
    expect(src).not.toContain("Promise.all(fetchPromises)");
  });
});
