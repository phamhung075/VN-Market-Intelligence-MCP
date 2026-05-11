/**
 * FIX-VPS-DEBUG-TRIGGERS — Manual debug triggers for price/news/sbv/foreign-flow VPS services
 *
 * Tests:
 *   1. Handler exports — all 4 handler modules export their handler functions
 *   2. Handler shape — all 4 handlers return correct result shape
 *   3. dry_run mode — dry_run=true returns status without side effects
 *   4. verbose mode — log_tail contains diagnostic info
 *   5. MCP tool exports — all 4 tool registration functions exist
 *   6. VPS scripts on disk — all 4 run-*.sh scripts exist, are executable, have correct args
 */

import { describe, test, expect } from "bun:test";
import { existsSync, statSync, readFileSync } from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Handler imports
// ─────────────────────────────────────────────────────────────────────────────

import {
  handleTriggerPriceDebug,
  type TriggerPriceDebugResult,
} from "../interface/mcp/priceDebugTriggerHandler.js";

import {
  handleTriggerNewsDebug,
  type TriggerNewsDebugResult,
} from "../interface/mcp/newsDebugTriggerHandler.js";

import {
  handleTriggerSbvDebug,
  type TriggerSbvDebugResult,
} from "../interface/mcp/sbvDebugTriggerHandler.js";

import {
  handleTriggerForeignFlowDebug,
  type TriggerForeignFlowDebugResult,
} from "../interface/mcp/foreignFlowDebugTriggerHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// 1. Handler exports
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-VPS-DEBUG-TRIGGERS — handler exports", () => {
  test("handleTriggerPriceDebug is exported as a function", () => {
    expect(typeof handleTriggerPriceDebug).toBe("function");
  });

  test("handleTriggerNewsDebug is exported as a function", () => {
    expect(typeof handleTriggerNewsDebug).toBe("function");
  });

  test("handleTriggerSbvDebug is exported as a function", () => {
    expect(typeof handleTriggerSbvDebug).toBe("function");
  });

  test("handleTriggerForeignFlowDebug is exported as a function", () => {
    expect(typeof handleTriggerForeignFlowDebug).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Price debug handler
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-VPS-DEBUG-TRIGGERS — price handler", () => {
  test("dry_run=true returns structured result without side effects", async () => {
    const result: TriggerPriceDebugResult = await handleTriggerPriceDebug({
      tickers: undefined,
      verbose: false,
      dry_run: true,
    });

    expect(result).toHaveProperty("service");
    expect(result.service).toBe("vn-price-fetch");
    expect(result).toHaveProperty("dry_run");
    expect(result.dry_run).toBe(true);
    expect(result).toHaveProperty("log_tail");
    expect(typeof result.log_tail).toBe("string");
    expect(result).toHaveProperty("attempted");
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("failed");
  });

  test("verbose=true produces non-empty log_tail with diagnostic info", async () => {
    const result = await handleTriggerPriceDebug({
      tickers: undefined,
      verbose: true,
      dry_run: true,
    });

    expect(result.log_tail.length).toBeGreaterThan(0);
    expect(result.log_tail).toMatch(/price|vps|dry.?run/i);
  });

  test("ticker filter is reflected in log_tail", async () => {
    const result = await handleTriggerPriceDebug({
      tickers: ["FPT", "VIC"],
      verbose: true,
      dry_run: true,
    });

    expect(result.log_tail).toMatch(/FPT|VIC/);
  });

  test("live mode (dry_run=false) includes SSH command hint in log_tail", async () => {
    const result = await handleTriggerPriceDebug({
      tickers: undefined,
      verbose: false,
      dry_run: false,
    });

    expect(result.dry_run).toBe(false);
    // Should mention SSH or VPS script path
    expect(result.log_tail).toMatch(/SSH|LIVE|run-price-debug\.sh/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. News debug handler
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-VPS-DEBUG-TRIGGERS — news handler", () => {
  test("dry_run=true returns structured result", async () => {
    const result: TriggerNewsDebugResult = await handleTriggerNewsDebug({
      verbose: false,
      dry_run: true,
    });

    expect(result.service).toBe("vn-news-fetch");
    expect(result.dry_run).toBe(true);
    expect(result).toHaveProperty("log_tail");
    expect(result).toHaveProperty("attempted");
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("failed");
  });

  test("verbose=true produces non-empty log_tail", async () => {
    const result = await handleTriggerNewsDebug({
      verbose: true,
      dry_run: true,
    });

    expect(result.log_tail.length).toBeGreaterThan(0);
    expect(result.log_tail).toMatch(/news|rss|source|dry.?run/i);
  });

  test("live mode (dry_run=false) includes SSH command hint", async () => {
    const result = await handleTriggerNewsDebug({
      verbose: false,
      dry_run: false,
    });

    expect(result.dry_run).toBe(false);
    expect(result.log_tail).toMatch(/SSH|LIVE|run-news-debug\.sh/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. SBV debug handler (no ticker param)
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-VPS-DEBUG-TRIGGERS — SBV handler", () => {
  test("dry_run=true returns structured result without ticker param", async () => {
    const result: TriggerSbvDebugResult = await handleTriggerSbvDebug({
      verbose: false,
      dry_run: true,
    });

    expect(result.service).toBe("vn-sbv-fetch");
    expect(result.dry_run).toBe(true);
    expect(result).toHaveProperty("log_tail");
    expect(result).toHaveProperty("attempted");
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("failed");
  });

  test("verbose=true produces diagnostic log_tail with VCB/FX info", async () => {
    const result = await handleTriggerSbvDebug({
      verbose: true,
      dry_run: true,
    });

    expect(result.log_tail.length).toBeGreaterThan(0);
    expect(result.log_tail).toMatch(/sbv|vcb|fx|rate|dry.?run/i);
  });

  test("live mode (dry_run=false) includes SSH command hint", async () => {
    const result = await handleTriggerSbvDebug({
      verbose: false,
      dry_run: false,
    });

    expect(result.dry_run).toBe(false);
    expect(result.log_tail).toMatch(/SSH|LIVE|run-sbv-debug\.sh/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. Foreign flow debug handler
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-VPS-DEBUG-TRIGGERS — foreign flow handler", () => {
  test("dry_run=true returns structured result", async () => {
    const result: TriggerForeignFlowDebugResult = await handleTriggerForeignFlowDebug({
      tickers: undefined,
      verbose: false,
      dry_run: true,
    });

    expect(result.service).toBe("vn-foreign-flow");
    expect(result.dry_run).toBe(true);
    expect(result).toHaveProperty("log_tail");
    expect(result).toHaveProperty("attempted");
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("failed");
  });

  test("verbose=true produces diagnostic log_tail", async () => {
    const result = await handleTriggerForeignFlowDebug({
      tickers: undefined,
      verbose: true,
      dry_run: true,
    });

    expect(result.log_tail.length).toBeGreaterThan(0);
    expect(result.log_tail).toMatch(/foreign.?flow|buy|sell|dry.?run/i);
  });

  test("ticker filter is reflected in log_tail", async () => {
    const result = await handleTriggerForeignFlowDebug({
      tickers: ["HPG", "VNM"],
      verbose: true,
      dry_run: true,
    });

    expect(result.log_tail).toMatch(/HPG|VNM/);
  });

  test("live mode (dry_run=false) includes SSH command hint", async () => {
    const result = await handleTriggerForeignFlowDebug({
      tickers: undefined,
      verbose: false,
      dry_run: false,
    });

    expect(result.dry_run).toBe(false);
    expect(result.log_tail).toMatch(/SSH|LIVE|run-foreign-flow-debug\.sh/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. MCP tool registration exports
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-VPS-DEBUG-TRIGGERS — MCP tool registration exports", () => {
  test("registerPriceDebugTriggerTool is exported from tool file", async () => {
    const mod = await import("../interface/mcp/tools/system/priceDebugTriggerTool.js");
    expect(typeof mod.registerPriceDebugTriggerTool).toBe("function");
  });

  test("registerNewsDebugTriggerTool is exported from tool file", async () => {
    const mod = await import("../interface/mcp/tools/system/newsDebugTriggerTool.js");
    expect(typeof mod.registerNewsDebugTriggerTool).toBe("function");
  });

  test("registerSbvDebugTriggerTool is exported from tool file", async () => {
    const mod = await import("../interface/mcp/tools/system/sbvDebugTriggerTool.js");
    expect(typeof mod.registerSbvDebugTriggerTool).toBe("function");
  });

  test("registerForeignFlowDebugTriggerTool is exported from tool file", async () => {
    const mod = await import("../interface/mcp/tools/system/foreignFlowDebugTriggerTool.js");
    expect(typeof mod.registerForeignFlowDebugTriggerTool).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. VPS scripts on disk
// ─────────────────────────────────────────────────────────────────────────────

const VPS_SCRIPTS_DIR = path.resolve(
  import.meta.dir,
  "../../../../vps-scripts",
);

describe("FIX-VPS-DEBUG-TRIGGERS — VPS debug scripts on disk", () => {
  // ── price ──────────────────────────────────────────────────────────────────

  const priceScript = path.join(VPS_SCRIPTS_DIR, "run-price-debug.sh");

  test("run-price-debug.sh exists", () => {
    expect(existsSync(priceScript)).toBe(true);
  });

  test("run-price-debug.sh is executable", () => {
    const stats = statSync(priceScript);
    expect((stats.mode & 0o100) !== 0).toBe(true);
  });

  test("run-price-debug.sh has --ticker, --verbose, --dry-run args", () => {
    const content = readFileSync(priceScript, "utf-8");
    expect(content).toContain("--ticker");
    expect(content).toContain("--verbose");
    expect(content).toContain("--dry-run");
  });

  test("run-price-debug.sh logs to /tmp/price-debug-*.log", () => {
    const content = readFileSync(priceScript, "utf-8");
    expect(content).toContain("/tmp/price-debug-");
  });

  // ── news ──────────────────────────────────────────────────────────────────

  const newsScript = path.join(VPS_SCRIPTS_DIR, "run-news-debug.sh");

  test("run-news-debug.sh exists", () => {
    expect(existsSync(newsScript)).toBe(true);
  });

  test("run-news-debug.sh is executable", () => {
    const stats = statSync(newsScript);
    expect((stats.mode & 0o100) !== 0).toBe(true);
  });

  test("run-news-debug.sh has --verbose, --dry-run args", () => {
    const content = readFileSync(newsScript, "utf-8");
    expect(content).toContain("--verbose");
    expect(content).toContain("--dry-run");
  });

  test("run-news-debug.sh logs to /tmp/news-debug-*.log", () => {
    const content = readFileSync(newsScript, "utf-8");
    expect(content).toContain("/tmp/news-debug-");
  });

  // ── sbv ───────────────────────────────────────────────────────────────────

  const sbvScript = path.join(VPS_SCRIPTS_DIR, "run-sbv-debug.sh");

  test("run-sbv-debug.sh exists", () => {
    expect(existsSync(sbvScript)).toBe(true);
  });

  test("run-sbv-debug.sh is executable", () => {
    const stats = statSync(sbvScript);
    expect((stats.mode & 0o100) !== 0).toBe(true);
  });

  test("run-sbv-debug.sh has --verbose, --dry-run args", () => {
    const content = readFileSync(sbvScript, "utf-8");
    expect(content).toContain("--verbose");
    expect(content).toContain("--dry-run");
  });

  test("run-sbv-debug.sh logs to /tmp/sbv-debug-*.log", () => {
    const content = readFileSync(sbvScript, "utf-8");
    expect(content).toContain("/tmp/sbv-debug-");
  });

  // ── foreign-flow ──────────────────────────────────────────────────────────

  const ffScript = path.join(VPS_SCRIPTS_DIR, "run-foreign-flow-debug.sh");

  test("run-foreign-flow-debug.sh exists", () => {
    expect(existsSync(ffScript)).toBe(true);
  });

  test("run-foreign-flow-debug.sh is executable", () => {
    const stats = statSync(ffScript);
    expect((stats.mode & 0o100) !== 0).toBe(true);
  });

  test("run-foreign-flow-debug.sh has --ticker, --verbose, --dry-run args", () => {
    const content = readFileSync(ffScript, "utf-8");
    expect(content).toContain("--ticker");
    expect(content).toContain("--verbose");
    expect(content).toContain("--dry-run");
  });

  test("run-foreign-flow-debug.sh logs to /tmp/foreign-flow-debug-*.log", () => {
    const content = readFileSync(ffScript, "utf-8");
    expect(content).toContain("/tmp/foreign-flow-debug-");
  });
});
