Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 003 — Env config + structured logging
 *
 * Verifies:
 *   1. Config loads PORT with default 3000
 *   2. Config loads DB_PATH with default './data/market.db'
 *   3. Config loads LOG_LEVEL with default 'info'
 *   4. Missing required env var throws AppConfigError
 *   5. Logger outputs correct format with timestamp, level, message
 *   6. Logger respects log level (debug messages hidden when level=info)
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// --- Helper to reload config in isolation via dynamic import ---
// We manipulate Bun.env directly before importing to simulate env states.

describe("Task 003 — Env config + structured logging", () => {
  // ── Config defaults ────────────────────────────────────────────────────────

  it("PORT defaults to 3000 when not set", async () => {
    const saved = Bun.env["PORT"];
    delete Bun.env["PORT"];

    const { loadConfig } = await import("../infrastructure/config.js");
    const cfg = loadConfig();
    expect(cfg.port).toBe(3000);

    if (saved !== undefined) Bun.env["PORT"] = saved;
  });

  it("PORT is parsed from Bun.env when set", async () => {
    Bun.env["PORT"] = "8080";

    const { loadConfig } = await import("../infrastructure/config.js");
    const cfg = loadConfig();
    expect(cfg.port).toBe(8080);

    delete Bun.env["PORT"];
  });

  it("DB_PATH defaults to './data/market.db' when not set", async () => {
    const saved = Bun.env["DB_PATH"];
    delete Bun.env["DB_PATH"];

    const { loadConfig } = await import("../infrastructure/config.js");
    const cfg = loadConfig();
    expect(cfg.dbPath).toBe("./data/market.db");

    if (saved !== undefined) Bun.env["DB_PATH"] = saved;
  });

  it("DB_PATH is read from Bun.env when set", async () => {
    Bun.env["DB_PATH"] = "/tmp/test.db";

    const { loadConfig } = await import("../infrastructure/config.js");
    const cfg = loadConfig();
    expect(cfg.dbPath).toBe("/tmp/test.db");

    delete Bun.env["DB_PATH"];
  });

  it("LOG_LEVEL defaults to 'info' when not set", async () => {
    const saved = Bun.env["LOG_LEVEL"];
    delete Bun.env["LOG_LEVEL"];

    const { loadConfig } = await import("../infrastructure/config.js");
    const cfg = loadConfig();
    expect(cfg.logLevel).toBe("info");

    if (saved !== undefined) Bun.env["LOG_LEVEL"] = saved;
  });

  it("LOG_LEVEL is read from Bun.env when set", async () => {
    Bun.env["LOG_LEVEL"] = "debug";

    const { loadConfig } = await import("../infrastructure/config.js");
    const cfg = loadConfig();
    expect(cfg.logLevel).toBe("debug");

    delete Bun.env["LOG_LEVEL"];
  });

  // ── Missing required var throws AppConfigError ────────────────────────────

  it("throws AppConfigError when a required env var is missing", async () => {
    const { AppConfigError, requireEnv } = await import(
      "../infrastructure/config.js"
    );

    const saved = Bun.env["REQUIRED_TEST_VAR"];
    delete Bun.env["REQUIRED_TEST_VAR"];

    expect(() => requireEnv("REQUIRED_TEST_VAR")).toThrow(AppConfigError);

    if (saved !== undefined) Bun.env["REQUIRED_TEST_VAR"] = saved;
  });

  it("requireEnv returns the value when the var is present", async () => {
    const { requireEnv } = await import("../infrastructure/config.js");

    Bun.env["REQUIRED_TEST_VAR"] = "hello";
    const val = requireEnv("REQUIRED_TEST_VAR");
    expect(val).toBe("hello");

    delete Bun.env["REQUIRED_TEST_VAR"];
  });

  it("AppConfigError message names the missing variable", async () => {
    const { AppConfigError, requireEnv } = await import(
      "../infrastructure/config.js"
    );

    delete Bun.env["MISSING_VAR_XYZ"];

    try {
      requireEnv("MISSING_VAR_XYZ");
      expect(true).toBe(false); // should not reach here
    } catch (err) {
      expect(err).toBeInstanceOf(AppConfigError);
      expect((err as InstanceType<typeof AppConfigError>).message).toContain("MISSING_VAR_XYZ");
    }
  });

  // ── Logger format ─────────────────────────────────────────────────────────

  it("logger createLogger returns an object with info, warn, error, debug methods", async () => {
    const { createLogger } = await import("../infrastructure/logger.js");
    const log = createLogger("info");
    expect(typeof log.info).toBe("function");
    expect(typeof log.warn).toBe("function");
    expect(typeof log.error).toBe("function");
    expect(typeof log.debug).toBe("function");
  });

  it("logger output is valid JSON with timestamp, level, message fields", async () => {
    const { createLogger } = await import("../infrastructure/logger.js");

    const lines: string[] = [];
    const log = createLogger("info", (line) => lines.push(line));

    log.info("test message");

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(typeof parsed["timestamp"]).toBe("string");
    expect(parsed["level"]).toBe("info");
    expect(parsed["message"]).toBe("test message");
  });

  it("logger includes context/meta fields when provided", async () => {
    const { createLogger } = await import("../infrastructure/logger.js");

    const lines: string[] = [];
    const log = createLogger("info", (line) => lines.push(line));

    log.info("event fired", { taskId: 42, stock: "VCB" });

    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed["taskId"]).toBe(42);
    expect(parsed["stock"]).toBe("VCB");
  });

  it("logger timestamp is a valid ISO 8601 string", async () => {
    const { createLogger } = await import("../infrastructure/logger.js");

    const lines: string[] = [];
    const log = createLogger("info", (line) => lines.push(line));

    log.warn("check timestamp");

    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    const ts = new Date(parsed["timestamp"] as string);
    expect(ts.getTime()).not.toBeNaN();
  });

  // ── Logger level filtering ────────────────────────────────────────────────

  it("debug messages are suppressed when level is 'info'", async () => {
    const { createLogger } = await import("../infrastructure/logger.js");

    const lines: string[] = [];
    const log = createLogger("info", (line) => lines.push(line));

    log.debug("this should be hidden");

    expect(lines.length).toBe(0);
  });

  it("debug messages appear when level is 'debug'", async () => {
    const { createLogger } = await import("../infrastructure/logger.js");

    const lines: string[] = [];
    const log = createLogger("debug", (line) => lines.push(line));

    log.debug("this should appear");

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed["level"]).toBe("debug");
  });

  it("warn messages appear when level is 'info'", async () => {
    const { createLogger } = await import("../infrastructure/logger.js");

    const lines: string[] = [];
    const log = createLogger("info", (line) => lines.push(line));

    log.warn("warning message");

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed["level"]).toBe("warn");
  });

  it("error messages appear when level is 'warn'", async () => {
    const { createLogger } = await import("../infrastructure/logger.js");

    const lines: string[] = [];
    const log = createLogger("warn", (line) => lines.push(line));

    log.error("error message");
    log.info("info — should be suppressed");
    log.debug("debug — should be suppressed");

    expect(lines.length).toBe(1);
    const parsed = JSON.parse(lines[0]!) as Record<string, unknown>;
    expect(parsed["level"]).toBe("error");
  });

  it("info messages are suppressed when level is 'error'", async () => {
    const { createLogger } = await import("../infrastructure/logger.js");

    const lines: string[] = [];
    const log = createLogger("error", (line) => lines.push(line));

    log.info("should not appear");
    log.warn("should not appear either");
    log.error("only this appears");

    expect(lines.length).toBe(1);
  });
});
