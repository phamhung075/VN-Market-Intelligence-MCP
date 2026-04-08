/**
 * Task 1026 — Startup env self-check
 *
 * Tests for:
 *   - checkRequiredEnv returns empty array when all required vars present
 *   - checkRequiredEnv returns missing var names when vars are blank/absent
 *   - formatEnvWarning produces a plain-text message listing missing vars
 *   - No crash when TELEGRAM_BOT_TOKEN is missing (degraded-mode boot)
 */

import { describe, it, expect } from "bun:test";
import { checkRequiredEnv, formatEnvWarning, REQUIRED_ENV_VARS } from "../infrastructure/envCheck.js";

describe("Task 1026 — Startup env self-check", () => {
  it("exports a non-empty list of required env var names", () => {
    expect(REQUIRED_ENV_VARS.length).toBeGreaterThan(0);
    expect(REQUIRED_ENV_VARS).toContain("TELEGRAM_BOT_TOKEN");
    expect(REQUIRED_ENV_VARS).toContain("TELEGRAM_INFO_WORK_CHANNEL_ID");
    expect(REQUIRED_ENV_VARS).toContain("TELEGRAM_INFO_MARKET_GROUP_ID");
    expect(REQUIRED_ENV_VARS).toContain("TELEGRAM_REPORT_BUG_CHANNEL_ID");
  });

  it("returns empty array when all required vars are present", () => {
    const fakeEnv: Record<string, string> = {
      TELEGRAM_BOT_TOKEN: "1234567890:AAAA",
      TELEGRAM_INFO_MARKET_GROUP_ID: "-1001234567",
      TELEGRAM_INFO_WORK_CHANNEL_ID: "-1001234568",
      TELEGRAM_REPORT_BUG_CHANNEL_ID: "-1001234569",
    };
    const missing = checkRequiredEnv(fakeEnv);
    expect(missing).toEqual([]);
  });

  it("returns missing var names when a var is absent", () => {
    const fakeEnv: Record<string, string> = {
      TELEGRAM_INFO_MARKET_GROUP_ID: "-1001234567",
      TELEGRAM_INFO_WORK_CHANNEL_ID: "-1001234568",
      TELEGRAM_REPORT_BUG_CHANNEL_ID: "-1001234569",
      // TELEGRAM_BOT_TOKEN deliberately absent
    };
    const missing = checkRequiredEnv(fakeEnv);
    expect(missing).toContain("TELEGRAM_BOT_TOKEN");
    expect(missing.length).toBe(1);
  });

  it("returns missing var names when a var is blank string", () => {
    const fakeEnv: Record<string, string> = {
      TELEGRAM_BOT_TOKEN: "",
      TELEGRAM_INFO_MARKET_GROUP_ID: "-1001234567",
      TELEGRAM_INFO_WORK_CHANNEL_ID: "-1001234568",
      TELEGRAM_REPORT_BUG_CHANNEL_ID: "-1001234569",
    };
    const missing = checkRequiredEnv(fakeEnv);
    expect(missing).toContain("TELEGRAM_BOT_TOKEN");
  });

  it("returns all missing var names when multiple vars absent", () => {
    const fakeEnv: Record<string, string> = {};
    const missing = checkRequiredEnv(fakeEnv);
    expect(missing.length).toBe(REQUIRED_ENV_VARS.length);
  });

  it("formatEnvWarning produces a non-empty plain-text message listing missing vars", () => {
    const missing = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_INFO_WORK_CHANNEL_ID"];
    const msg = formatEnvWarning(missing);
    expect(typeof msg).toBe("string");
    expect(msg.length).toBeGreaterThan(0);
    expect(msg).toContain("TELEGRAM_BOT_TOKEN");
    expect(msg).toContain("TELEGRAM_INFO_WORK_CHANNEL_ID");
    // Must be plain text (no Markdown) — Telegram plain_text mode
    expect(msg).not.toContain("**");
    expect(msg).not.toContain("__");
  });

  it("formatEnvWarning returns empty string when missing list is empty", () => {
    const msg = formatEnvWarning([]);
    expect(msg).toBe("");
  });
});
