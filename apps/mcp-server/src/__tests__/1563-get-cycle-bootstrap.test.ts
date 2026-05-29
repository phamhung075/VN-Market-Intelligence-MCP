import { describe, test, expect, beforeAll } from "bun:test";
import { getCycleBootstrap, VALID_AGENT_NAMES } from "../application/usecases/getCycleBootstrap.js";
import { initDatabase, getDb } from "../infrastructure/db/schema.js";

describe("getCycleBootstrap use case", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    await initDatabase();
    db = getDb();
  });

  test("returns all three payload keys for valid agent", async () => {
    const result = await getCycleBootstrap(db, "news-scout");
    expect(result).toHaveProperty("agent_signals");
    expect(result).toHaveProperty("market_context");
    expect(result).toHaveProperty("system_status");
    expect(Array.isArray(result.agent_signals)).toBe(true);
  });

  test("returns string market_context (24h window)", async () => {
    const result = await getCycleBootstrap(db, "market-watcher");
    expect(typeof result.market_context).toBe("string");
    expect(result.market_context).toContain("=== WATCHLIST & PRICES ===");
  });

  test("no error key when all sub-calls succeed", async () => {
    const result = await getCycleBootstrap(db, "alert-commander");
    expect(result.error).toBeUndefined();
  });

  test("VALID_AGENT_NAMES contains exactly 9 entries", () => {
    expect(VALID_AGENT_NAMES).toHaveLength(9);
    expect(VALID_AGENT_NAMES).toContain("news-scout");
    expect(VALID_AGENT_NAMES).toContain("financial-analyst");
    expect(VALID_AGENT_NAMES).toContain("market-watcher");
    expect(VALID_AGENT_NAMES).toContain("alert-commander");
    expect(VALID_AGENT_NAMES).toContain("digest-predict");
    expect(VALID_AGENT_NAMES).toContain("qa-responder");
    expect(VALID_AGENT_NAMES).toContain("unified-agent");
    expect(VALID_AGENT_NAMES).toContain("report-analyzer");
    expect(VALID_AGENT_NAMES).toContain("bctc-analyst");
  });

  test("does NOT include removed agent names", () => {
    expect(VALID_AGENT_NAMES).not.toContain("bctc-collector");
    expect(VALID_AGENT_NAMES).not.toContain("prediction-synthesizer");
  });
});

describe("getCycleBootstrapTool MCP registration", () => {
  let db: ReturnType<typeof getDb>;

  beforeAll(async () => {
    await initDatabase();
    db = getDb();
  });

  test("tool file exists and exports registerCycleBootstrapTool", async () => {
    const mod = await import("../interface/mcp/tools/system/cycleBootstrapTool.js");
    expect(typeof mod.registerCycleBootstrapTool).toBe("function");
  });

  test("use case resolves within 3000ms for valid agent", async () => {
    const start = Date.now();
    await getCycleBootstrap(db, "unified-agent");
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(3000);
  });
});
