/**
 * Task 1834b — Trading Economics Chromium anti-bot hardening
 *
 * Pure unit tests — no browser launch, no network.
 * All 7 ACs test exported constants and config builders only.
 */
import { describe, it, expect } from "bun:test";
import {
  buildChromiumLaunchConfig,
  TE_USER_AGENT,
  TE_BLOCKED_PATTERNS,
} from "../infrastructure/fetchers/tradingEconomicsChromium.js";

describe("1834b — TE Chromium anti-bot hardening", () => {
  // AC-1: --disable-blink-features=AutomationControlled present in args
  it("AC-1: args contains --disable-blink-features=AutomationControlled", () => {
    const config = buildChromiumLaunchConfig();
    expect(config.args).toBeDefined();
    expect(config.args!.includes("--disable-blink-features=AutomationControlled")).toBe(true);
  });

  // AC-2: --disable-infobars present in args
  it("AC-2: args contains --disable-infobars", () => {
    const config = buildChromiumLaunchConfig();
    expect(config.args!.includes("--disable-infobars")).toBe(true);
  });

  // AC-3: defaultViewport.width is in [1280, 1479]
  it("AC-3: defaultViewport.width is in [1280, 1479] across 20 calls", () => {
    for (let i = 0; i < 20; i++) {
      const config = buildChromiumLaunchConfig();
      expect(config.defaultViewport).toBeDefined();
      const w = (config.defaultViewport as { width: number; height: number }).width;
      expect(w).toBeGreaterThanOrEqual(1280);
      expect(w).toBeLessThan(1480);
    }
  });

  // AC-4: defaultViewport.height is in [800, 999]
  it("AC-4: defaultViewport.height is in [800, 999] across 20 calls", () => {
    for (let i = 0; i < 20; i++) {
      const config = buildChromiumLaunchConfig();
      const h = (config.defaultViewport as { width: number; height: number }).height;
      expect(h).toBeGreaterThanOrEqual(800);
      expect(h).toBeLessThan(1000);
    }
  });

  // AC-5: TE_USER_AGENT is non-empty and matches /Chrome\/\d+/
  it("AC-5: TE_USER_AGENT is non-empty and matches /Chrome\\/\\d+/", () => {
    expect(TE_USER_AGENT.length).toBeGreaterThan(0);
    expect(/Chrome\/\d+/.test(TE_USER_AGENT)).toBe(true);
  });

  // AC-6: TE_BLOCKED_PATTERNS is non-empty and includes a google-analytics pattern
  it("AC-6: TE_BLOCKED_PATTERNS is non-empty and includes a google-analytics pattern", () => {
    expect(TE_BLOCKED_PATTERNS.length).toBeGreaterThan(0);
    const hasGA = TE_BLOCKED_PATTERNS.some((p) => p.includes("google-analytics.com"));
    expect(hasGA).toBe(true);
  });

  // AC-7: TE_BLOCKED_PATTERNS.length >= 4
  it("AC-7: TE_BLOCKED_PATTERNS.length >= 4", () => {
    expect(TE_BLOCKED_PATTERNS.length).toBeGreaterThanOrEqual(4);
  });

  // AC-8: executablePath resolves to PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH env var
  //       or falls back to /usr/bin/chromium — must never be undefined.
  //       Task 1833k — Chromium executable path config verification.
  it("AC-8: executablePath equals Bun.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? '/usr/bin/chromium'", () => {
    const config = buildChromiumLaunchConfig();
    const expected = Bun.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/chromium";
    expect(config.executablePath).toBe(expected);
  });
});
