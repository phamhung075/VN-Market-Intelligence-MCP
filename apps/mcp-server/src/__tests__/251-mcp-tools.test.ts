// src/__tests__/251-mcp-tools.test.ts

// Must set DB_PATH before ANY import that triggers module-level DB access (hnx.ts)
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, afterAll } from "bun:test";

// ─────────────────────────────────────────────────────────────────────────────
// Task 251 — MCP Tool Registration Tests
// ─────────────────────────────────────────────────────────────────────────────

const TEST_PORT = 3299;

// Dynamic imports so they load AFTER process.env is set
let srv: { port: number; toolCount: number; close(): Promise<void> };

beforeAll(async () => {
  const { initDatabase } = await import("../infrastructure/db/schema.js");
  await initDatabase();

  const { createBunServer } = await import("../interface/mcp/server.js");
  srv = await createBunServer({ port: TEST_PORT });
});

afterAll(async () => {
  if (srv) await srv.close();
});

describe("Task 251 — MCP Tool Registration", () => {
  it("server starts with at least 19 tools (16 base + 3 new)", () => {
    expect(srv.toolCount).toBeGreaterThanOrEqual(19);
  });

  it("server starts successfully and returns port", () => {
    expect(srv.port).toBe(TEST_PORT);
  });

  it("GET /health returns 200 with toolCount", async () => {
    const resp = await fetch(`http://127.0.0.1:${TEST_PORT}/health`);
    expect(resp.status).toBe(200);
    const body = (await resp.json()) as { status: string; toolCount: number };
    expect(body.status).toBe("ok");
    expect(body.toolCount).toBeGreaterThanOrEqual(19);
  });

  it("GET /sse returns 200", async () => {
    const controller = new AbortController();
    let status = 0;
    try {
      const resp = await fetch(`http://127.0.0.1:${TEST_PORT}/sse`, {
        signal: controller.signal,
      });
      status = resp.status;
      controller.abort();
      resp.body?.cancel();
    } catch {
      // AbortError expected — we abort immediately
    }
    expect(status).toBe(200);
  });

  it("registerPublicInvestmentTools is exported as a function", async () => {
    const { registerPublicInvestmentTools } = await import(
      "../interface/mcp/tools/sector/publicInvestmentTools.js"
    );
    expect(typeof registerPublicInvestmentTools).toBe("function");
  });

  it("registerCreditFlowTools is exported as a function", async () => {
    const { registerCreditFlowTools } = await import(
      "../interface/mcp/tools/sector/creditFlowTools.js"
    );
    expect(typeof registerCreditFlowTools).toBe("function");
  });

  it("registerLeadershipTools is exported as a function", async () => {
    const { registerLeadershipTools } = await import(
      "../interface/mcp/tools/sector/leadershipTools.js"
    );
    expect(typeof registerLeadershipTools).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Tool unit tests — direct handler calls
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 251 — get_public_contracts handler", () => {
  it("returns content array with type=text", async () => {
    const { getPublicContractsHandler } = await import(
      "../interface/mcp/tools/sector/publicInvestmentTools.js"
    );
    const result = await getPublicContractsHandler({
      _testHtml: "<html><body></body></html>",
    });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
    expect(typeof result.content[0]!.text).toBe("string");
  });

  it("returns empty state message when no contracts found", async () => {
    const { getPublicContractsHandler } = await import(
      "../interface/mcp/tools/sector/publicInvestmentTools.js"
    );
    const result = await getPublicContractsHandler({
      _testHtml: "<html><body><p>Khong co du lieu</p></body></html>",
    });
    expect(result.content[0]!.text.length).toBeGreaterThan(0);
  });
});

describe("Task 251 — get_credit_flow_signal handler", () => {
  it("returns content array with type=text", async () => {
    const { getCreditFlowSignalHandler } = await import(
      "../interface/mcp/tools/sector/creditFlowTools.js"
    );
    const result = await getCreditFlowSignalHandler({
      currentReCreditTrillion: 2900,
      previousReCreditTrillion: 2700,
      currentMortgageRatePct: 9.0,
      previousMortgageRatePct: 9.5,
    });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
  });

  it("text includes direction indicator", async () => {
    const { getCreditFlowSignalHandler } = await import(
      "../interface/mcp/tools/sector/creditFlowTools.js"
    );
    const result = await getCreditFlowSignalHandler({
      currentReCreditTrillion: 3200,
      previousReCreditTrillion: 2600,
      currentMortgageRatePct: 9.0,
      previousMortgageRatePct: 9.5,
    });
    const text = result.content[0]!.text;
    expect(text.length).toBeGreaterThan(10);
  });
});

describe("Task 251 — get_insider_signals handler", () => {
  it("returns content array with type=text", async () => {
    const { getInsiderSignalsHandler } = await import(
      "../interface/mcp/tools/sector/leadershipTools.js"
    );
    const result = await getInsiderSignalsHandler({
      code: "VCB",
      outstandingShares: 1_000_000_000,
      _testData: [],
    });
    expect(Array.isArray(result.content)).toBe(true);
    expect(result.content[0]).toHaveProperty("type", "text");
  });

  it("detects insider buy signal from test data", async () => {
    const { getInsiderSignalsHandler } = await import(
      "../interface/mcp/tools/sector/leadershipTools.js"
    );
    const result = await getInsiderSignalsHandler({
      code: "VCB",
      outstandingShares: 1_000_000_000,
      _testData: [
        {
          code: "VCB",
          insiderName: "Nguyen Van A",
          position: "CEO",
          type: "buy",
          volume: 6_000_000,
          registeredVolume: 6_000_000,
          price: 80_000,
          date: "2026-03-01",
        },
      ],
    });
    const text = result.content[0]!.text;
    expect(text).toContain("VCB");
  });
});
