/**
 * FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING
 *
 * search_similar_context (analysis.ts ~L511) delegates to rag-service :5002 via
 * ragSearch() (ragHttpClient.ts ~L563). When rag-service is down/restart-looping,
 * ragSearch's fetch (already bounded — AbortSignal.timeout(8_000) inside
 * ragHttpClient.ts, well under the caller's tool-call budget) rejects with a
 * timeout/ECONNREFUSED-style error. Previously this fell through to the outer
 * catch and surfaced as a hard "Error searching context: …" text block —
 * blocking bctc-analyst Step 2b for 4 consecutive cycles (BUG#3397).
 *
 * Part (a) fix: the rag-service call is now wrapped in its own try/catch that
 * mirrors appendStockHexagramHttp's L84 "service-down: omit block entirely"
 * pattern — WARN (not ERROR) log + graceful degrade to "No similar context
 * found." (empty result), never a hard blocking error.
 *
 * These tests mock global.fetch (same pattern as p2-f-rag-http-rewire.test.ts)
 * to exercise the ERROR path directly — timeout (AbortError) and
 * connection-refused — not just the happy path.
 */

// Must be set before ANY import that triggers getDb() or loadConfig()
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, afterEach } from "bun:test";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerAnalysisTools } from "../interface/mcp/tools/news-analysis/analysis.js";
import { closeDb } from "../infrastructure/db/schema.js";
import { logger } from "../infrastructure/logger.js";

// ─── Helpers ────────────────────────────────────────────────────────────────

function makeServer() {
  const server = new McpServer({ name: "test-fix-search-similar-context-timeout", version: "0.0.1" });
  registerAnalysisTools(server);
  return server;
}

function getHandler(
  server: McpServer,
  toolName: string,
): (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }> {
  const registry = (server as unknown as {
    _registeredTools: Record<string, {
      handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
    }>;
  })._registeredTools;

  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool '${toolName}' not registered`);
  return entry.handler;
}

// ─── logger spy — object-mutation on the shared `logger` singleton ───────────
// NO mock.module() — same established pattern as
// 1352a-scheduler-job-wrappers-macro-marketscan.test.ts ("Spy on real
// logger.warn via object mutation — NO mock.module needed"). This is
// deliberately NOT a console.log spy: Bun's mock.module() is process-wide and
// permanent (not file-scoped), and at least one other test file in this suite
// (1466-sync-db-corruption-bail.test.ts) re-registers a non-console stub for
// "../infrastructure/logger.js" in its own afterAll without ever restoring the
// genuine console-backed logger — so asserting via console.log interception
// is execution-order-dependent and flaky in the full suite. Patching the
// `logger.warn`/`logger.error` methods directly on whatever object is
// CURRENTLY bound to the shared singleton (real or previously-stubbed) is
// robust regardless of what any other file's mock.module() call left behind,
// because analysis.ts imports the exact same object reference.
function spyOnLogger(): { warnMessages: string[]; errorMessages: string[]; restore: () => void } {
  const warnMessages: string[] = [];
  const errorMessages: string[] = [];
  const origWarn = logger.warn;
  const origError = logger.error;
  logger.warn = (msg: string, ...args: unknown[]) => { warnMessages.push(msg); void args; };
  logger.error = (msg: string, ...args: unknown[]) => { errorMessages.push(msg); void args; };
  return {
    warnMessages,
    errorMessages,
    restore: () => {
      logger.warn = origWarn;
      logger.error = origError;
    },
  };
}

// ─── fetch mock helpers ───────────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetchTimeout(): void {
  // Mirrors AbortSignal.timeout firing: fetch rejects with a DOMException("TimeoutError").
  globalThis.fetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    return new Promise((_resolve, reject) => {
      const signal = init?.signal;
      if (signal) {
        signal.addEventListener("abort", () => {
          reject(new DOMException("The operation was aborted due to timeout", "TimeoutError"));
        });
      }
      // Never resolves on its own — only the AbortSignal settles it, same as a
      // real hung rag-service connection. Guarded by a short fallback so the
      // test suite itself cannot hang if the implementation regresses.
      setTimeout(() => reject(new DOMException("test-fallback: no abort observed", "TimeoutError")), 500);
    });
  }) as typeof fetch;
}

function mockFetchConnectionRefused(): void {
  globalThis.fetch = (async (_url: string | URL | Request, _init?: RequestInit): Promise<Response> => {
    throw new TypeError("fetch failed: connect ECONNREFUSED 127.0.0.1:5002");
  }) as typeof fetch;
}

function mockFetchNon200(): void {
  globalThis.fetch = (async (_url: string | URL | Request, _init?: RequestInit) => {
    return new Response("service unavailable", { status: 503 });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = originalFetch;
  closeDb();
});

// ─── Suite ───────────────────────────────────────────────────────────────────

describe("FIX-SEARCH-SIMILAR-CONTEXT-TIMEOUT-RECURRING — search_similar_context graceful degrade", () => {
  it("degrades to 'No similar context found.' (not a hard error) when rag-service TIMES OUT", async () => {
    mockFetchTimeout();
    const server = makeServer();
    const handler = getHandler(server, "search_similar_context");

    const result = await handler({ query: "VCB credit growth Q1", k: 5 }) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toBe("No similar context found.");
    expect(result.content[0]!.text).not.toContain("Error searching context");
  }, 5000);

  it("degrades to 'No similar context found.' when rag-service connection is REFUSED", async () => {
    mockFetchConnectionRefused();
    const server = makeServer();
    const handler = getHandler(server, "search_similar_context");

    const result = await handler({ query: "GAS oil price impact", k: 5 }) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toBe("No similar context found.");
    expect(result.content[0]!.text).not.toContain("Error searching context");
  });

  it("degrades to 'No similar context found.' when rag-service returns non-200", async () => {
    mockFetchNon200();
    const server = makeServer();
    const handler = getHandler(server, "search_similar_context");

    const result = await handler({ query: "FPT earnings beat", k: 5 }) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toBe("No similar context found.");
  });

  it("emits a WARN log (not ERROR) on rag-service timeout — never blocks the caller", async () => {
    mockFetchTimeout();
    const server = makeServer();
    const handler = getHandler(server, "search_similar_context");

    const spy = spyOnLogger();
    try {
      await handler({ query: "VCB credit growth Q1", k: 5 });
    } finally {
      spy.restore();
    }

    expect(spy.warnMessages.some((m) => m.includes("[search_similar_context]"))).toBe(true);
    expect(spy.errorMessages.some((m) => m.includes("[search_similar_context]"))).toBe(false);
  }, 5000);

  it("emits a WARN log (not ERROR) on rag-service connection-refused", async () => {
    mockFetchConnectionRefused();
    const server = makeServer();
    const handler = getHandler(server, "search_similar_context");

    const spy = spyOnLogger();
    try {
      await handler({ query: "GAS oil price impact", k: 5 });
    } finally {
      spy.restore();
    }

    expect(spy.warnMessages.some((m) => m.includes("[search_similar_context]"))).toBe(true);
    expect(spy.errorMessages.some((m) => m.includes("[search_similar_context]"))).toBe(false);
  });

  it("resolves well within the caller's tool-call budget (bounded fetch, not a hard hang)", async () => {
    mockFetchTimeout();
    const server = makeServer();
    const handler = getHandler(server, "search_similar_context");

    const start = Date.now();
    await handler({ query: "bounded fetch check", k: 5 });
    const elapsedMs = Date.now() - start;

    // The mock's own fallback rejects at 500ms (worst case) — well under any
    // realistic MCP tool-call budget (60s, per fetch_and_analyze precedent).
    expect(elapsedMs).toBeLessThan(2000);
  }, 5000);

  it("still returns real results on the happy path (existing behavior unchanged)", async () => {
    globalThis.fetch = (async (url: string | URL | Request, _init?: RequestInit) => {
      const u = typeof url === "string" ? url : url.toString();
      if (u.includes("/search")) {
        return new Response(
          JSON.stringify({
            results: [
              {
                id: "entry-1",
                level: "action",
                title: "VCB Q1 credit growth beats forecast",
                summary: "VCB reported strong credit growth in Q1.",
                tags: ["banking"],
                action_code: "VCB",
                created_at: new Date().toISOString(),
                distance: 0.1,
                recency_score: 1,
              },
            ],
            total: 1,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      }
      return new Response("not found", { status: 404 });
    }) as typeof fetch;

    const server = makeServer();
    const handler = getHandler(server, "search_similar_context");
    const result = await handler({ query: "VCB credit growth Q1", k: 5 }) as {
      content: Array<{ type: string; text: string }>;
    };

    expect(result.content[0]!.type).toBe("text");
    expect(result.content[0]!.text).toContain("VCB");
    expect(result.content[0]!.text).not.toBe("No similar context found.");
  });
});
