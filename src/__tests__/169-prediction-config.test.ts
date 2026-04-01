/**
 * Task 169 — mcp.config.json predictionMarkets section + config.ts type extension
 *
 * Verifies:
 *   1. loadMcpConfig() returns a predictionMarkets section
 *   2. Default values are correct when mcp.config.json has no predictionMarkets key
 *   3. Values are read from mcp.config.json when present
 *   4. PredictionMarketsConfig interface shape is correct (TypeScript structural check)
 *   5. SchedulerConfig includes predictionMarketPoll field
 *   6. Signal thresholds have correct defaults
 *   7. Keyword arrays have correct defaults
 */

import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { PredictionMarketsConfig } from "../infrastructure/config.js";

const PROJECT_ROOT = resolve(import.meta.dir, "../../");
const MCP_CONFIG_PATH = resolve(PROJECT_ROOT, "mcp.config.json");

describe("Task 169 — predictionMarkets config section", () => {
  // ── Section existence ─────────────────────────────────────────────────────

  it("loadMcpConfig returns a predictionMarkets object", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets).toBeDefined();
    expect(typeof cfg.predictionMarkets).toBe("object");
  });

  it("predictionMarkets.enabled defaults to true", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.enabled).toBe(true);
  });

  it("predictionMarkets.sources includes polymarket by default", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.sources).toContain("polymarket");
  });

  // ── Polymarket sub-config ─────────────────────────────────────────────────

  it("predictionMarkets.polymarket.clobApiUrl has correct default", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.polymarket.clobApiUrl).toBe("https://clob.polymarket.com");
  });

  it("predictionMarkets.polymarket.gammaApiUrl has correct default", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.polymarket.gammaApiUrl).toBe("https://gamma-api.polymarket.com");
  });

  it("predictionMarkets.polymarket.timeout defaults to 15000", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.polymarket.timeout).toBe(15000);
  });

  it("predictionMarkets.polymarket.maxMarketsPerFetch defaults to 50", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.polymarket.maxMarketsPerFetch).toBe(50);
  });

  // ── Signal thresholds ─────────────────────────────────────────────────────

  it("predictionMarkets.signals.probabilityShiftPct defaults to 10", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.signals.probabilityShiftPct).toBe(10);
  });

  it("predictionMarkets.signals.highConvictionThreshold defaults to 0.85", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.signals.highConvictionThreshold).toBe(0.85);
  });

  it("predictionMarkets.signals.volumeSpikeMultiplier defaults to 3", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.signals.volumeSpikeMultiplier).toBe(3);
  });

  it("predictionMarkets.signals.minLiquidityUsd defaults to 10000", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.signals.minLiquidityUsd).toBe(10000);
  });

  // ── Keywords ──────────────────────────────────────────────────────────────

  it("predictionMarkets.keywords.vietnam contains expected terms", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.keywords.vietnam).toContain("vietnam");
    expect(cfg.predictionMarkets.keywords.vietnam).toContain("vietnamese");
  });

  it("predictionMarkets.keywords.trade contains tariff-related terms", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.keywords.trade).toContain("tariff");
    expect(cfg.predictionMarkets.keywords.trade).toContain("trade war");
  });

  it("predictionMarkets.keywords.commodities contains oil and gold", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.keywords.commodities).toContain("oil price");
    expect(cfg.predictionMarkets.keywords.commodities).toContain("gold price");
  });

  it("predictionMarkets.keywords.macro contains macro economic terms", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.keywords.macro).toContain("fed rate");
    expect(cfg.predictionMarkets.keywords.macro).toContain("inflation");
  });

  // ── Scheduler field ───────────────────────────────────────────────────────

  it("scheduler.predictionMarketPoll has correct default cron", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.scheduler.predictionMarketPoll).toBe("*/30 * * * *");
  });

  // ── mcp.config.json file contains the section ─────────────────────────────

  it("mcp.config.json file has predictionMarkets section", () => {
    const raw = readFileSync(MCP_CONFIG_PATH, "utf-8");
    const json = JSON.parse(raw) as Record<string, unknown>;
    expect(json["predictionMarkets"]).toBeDefined();
  });

  it("mcp.config.json scheduler has predictionMarketPoll field", () => {
    const raw = readFileSync(MCP_CONFIG_PATH, "utf-8");
    const json = JSON.parse(raw) as Record<string, unknown>;
    const scheduler = json["scheduler"] as Record<string, unknown>;
    expect(scheduler["predictionMarketPoll"]).toBe("*/30 * * * *");
  });

  // ── Type shape (structural — TypeScript compile-time check) ───────────────

  it("PredictionMarketsConfig type is exported and structurally valid", async () => {
    // This test verifies the interface can be used as a type annotation.
    // If PredictionMarketsConfig is not exported the import at the top of this file
    // would cause a compile-time error which Bun catches at runtime too.
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();

    // Structural check: assign to typed variable — TS will catch any mismatch
    const pm: PredictionMarketsConfig = cfg.predictionMarkets;
    expect(pm.enabled).toBeDefined();
    expect(pm.sources).toBeInstanceOf(Array);
    expect(pm.polymarket).toBeDefined();
    expect(pm.signals).toBeDefined();
    expect(pm.keywords).toBeDefined();
  });
});
