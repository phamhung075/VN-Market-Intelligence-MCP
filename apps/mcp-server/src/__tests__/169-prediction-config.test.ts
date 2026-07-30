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

  it("predictionMarkets.enabled reads false from mcp.config.json (FIX-POLYMARKET-FETCH-DEAD-GEOBLOCK-ACTUATOR kill-switch)", async () => {
    // 2026-07-31: flipped true->false. gamma-api.polymarket.com is blocked at
    // the ISP level by France's ANJ gambling regulator (architect RULING:
    // RETIRE, not restore-via-VPS) — mcp.config.json's predictionMarkets.enabled
    // key (which always wins over the code-level fallback default) is now false.
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.enabled).toBe(false);
  });

  it("predictionMarkets.pollingIntervalMinutes defaults to 30", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.pollingIntervalMinutes).toBe(30);
  });

  // ── API URLs ──────────────────────────────────────────────────────────────

  it("predictionMarkets.clobApiUrl has correct default", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.clobApiUrl).toBe("https://clob.polymarket.com");
  });

  it("predictionMarkets.gammaApiUrl has correct default", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.gammaApiUrl).toBe("https://gamma-api.polymarket.com");
  });

  // ── Signal thresholds ─────────────────────────────────────────────────────

  it("predictionMarkets.probabilityShiftPct defaults to 5", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.probabilityShiftPct).toBe(5);
  });

  it("predictionMarkets.volumeSpikeThresholdUsd defaults to 50000", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.volumeSpikeThresholdUsd).toBe(50000);
  });

  it("predictionMarkets.minUniqueWallets defaults to 10", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.minUniqueWallets).toBe(10);
  });

  it("predictionMarkets.whaleTradeThresholdUsd defaults to 10000", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.whaleTradeThresholdUsd).toBe(10000);
  });

  it("predictionMarkets.maxMarketsPerPoll defaults to 50", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.maxMarketsPerPoll).toBe(50);
  });

  it("predictionMarkets.rateLimitDelayMs defaults to 500", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.rateLimitDelayMs).toBe(500);
  });

  // ── Keywords ──────────────────────────────────────────────────────────────

  it("predictionMarkets.relevantKeywords is a non-empty string array", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(Array.isArray(cfg.predictionMarkets.relevantKeywords)).toBe(true);
    expect(cfg.predictionMarkets.relevantKeywords.length).toBeGreaterThan(0);
  });

  it("predictionMarkets.relevantKeywords contains fed, oil, and vietnam", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(cfg.predictionMarkets.relevantKeywords).toContain("fed");
    expect(cfg.predictionMarkets.relevantKeywords).toContain("oil");
    expect(cfg.predictionMarkets.relevantKeywords).toContain("vietnam");
  });

  it("predictionMarkets.curatedMarketIds defaults to empty array", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();
    expect(Array.isArray(cfg.predictionMarkets.curatedMarketIds)).toBe(true);
    expect(cfg.predictionMarkets.curatedMarketIds).toHaveLength(0);
  });

  // ── mcp.config.json file contains the section ─────────────────────────────

  it("mcp.config.json file has predictionMarkets section", () => {
    const raw = readFileSync(MCP_CONFIG_PATH, "utf-8");
    const json = JSON.parse(raw) as Record<string, unknown>;
    expect(json["predictionMarkets"]).toBeDefined();
  });

  it("mcp.config.json predictionMarkets has clobApiUrl field", () => {
    const raw = readFileSync(MCP_CONFIG_PATH, "utf-8");
    const json = JSON.parse(raw) as Record<string, unknown>;
    const pm = json["predictionMarkets"] as Record<string, unknown>;
    expect(pm["clobApiUrl"]).toBe("https://clob.polymarket.com");
  });

  it("mcp.config.json predictionMarkets has gammaApiUrl field", () => {
    const raw = readFileSync(MCP_CONFIG_PATH, "utf-8");
    const json = JSON.parse(raw) as Record<string, unknown>;
    const pm = json["predictionMarkets"] as Record<string, unknown>;
    expect(pm["gammaApiUrl"]).toBe("https://gamma-api.polymarket.com");
  });

  // ── Type shape (structural — TypeScript compile-time check) ───────────────

  it("PredictionMarketsConfig type is exported and structurally valid", async () => {
    const { loadMcpConfig } = await import("../infrastructure/config.js");
    const cfg = loadMcpConfig();

    // Structural check: assign to typed variable — TS will catch any mismatch
    const pm: PredictionMarketsConfig = cfg.predictionMarkets;
    expect(pm.enabled).toBeDefined();
    expect(typeof pm.pollingIntervalMinutes).toBe("number");
    expect(typeof pm.clobApiUrl).toBe("string");
    expect(typeof pm.gammaApiUrl).toBe("string");
    expect(Array.isArray(pm.relevantKeywords)).toBe(true);
    expect(Array.isArray(pm.curatedMarketIds)).toBe(true);
  });
});
