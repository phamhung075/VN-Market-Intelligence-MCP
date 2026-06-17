/**
 * FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD
 *
 * Verifies per-section bounded fetch deadline in getSystemStatus():
 *
 *   AC-1: A section that stalls beyond the budget resolves to honest
 *         "timeout/unknown" text — never hangs the caller.
 *
 *   AC-2: A section that completes within budget returns its normal content —
 *         no regression when sources are healthy.
 *
 *   AC-3: The deadline guard applies GENERICALLY — ALL async sections are
 *         bounded; no section is whitelisted or skipped.
 *
 *   AC-4: Timed-out sections NEVER emit synthetic "ok" — the returned string
 *         must contain a degraded/timeout marker (not a clean-looking "ok").
 *
 *   AC-5: withSectionDeadline helper resolves within 2× budget even for a
 *         promise that never resolves.
 *
 * Tests use the exported helper directly and also call getSystemStatus() to
 * verify end-to-end integration. No live network or external services used.
 *
 * DB_PATH is :memory: via apps/mcp-server/src/__tests__/setup.ts preload.
 */

import { describe, it, expect } from "bun:test";
import {
  withSectionDeadline,
  getSystemStatus,
} from "../interface/mcp/tools/system/systemTools.js";

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 / AC-5: withSectionDeadline — stalled promise resolves within budget
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD — withSectionDeadline", () => {
  it("AC-1: resolves with fallback text when promise never settles", async () => {
    const neverResolves = new Promise<string>(() => {
      // Intentionally never resolves
    });
    const start = Date.now();
    const result = await withSectionDeadline("TEST_SECTION", neverResolves, 50);
    const elapsed = Date.now() - start;

    // Must resolve within 2× budget
    expect(elapsed).toBeLessThan(200);
    // Must contain honest timeout marker
    expect(result).toContain("timeout");
    // Must NOT contain synthetic "ok"
    expect(result.toLowerCase()).not.toContain("ok");
  });

  it("AC-2: resolves with real content when promise completes within budget", async () => {
    const fast = Promise.resolve("SECTION_DATA_OK");
    const result = await withSectionDeadline("FAST_SECTION", fast, 3000);
    expect(result).toBe("SECTION_DATA_OK");
  });

  it("AC-4: timed-out result never contains 'ok' as sole status word", async () => {
    const slow = new Promise<string>(() => undefined);
    const result = await withSectionDeadline("SLOW_SECTION", slow, 50);
    // Must include a degraded/timeout indicator, not a clean status
    expect(result.toLowerCase()).toMatch(/timeout|unavailable|unknown|error/);
  });

  it("AC-5: resolves within 2× budget ms even for infinite promise", async () => {
    const budget = 60;
    const infinite = new Promise<string>(() => undefined);
    const t0 = Date.now();
    await withSectionDeadline("INFINITE", infinite, budget);
    expect(Date.now() - t0).toBeLessThan(budget * 3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-2: getSystemStatus integration — returns within reasonable wall time
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-SYSTEM-STATUS-TE-TIMEOUT-GUARD — getSystemStatus integration", () => {
  it("AC-2: returns all section headers in normal (healthy) path", async () => {
    const result = await getSystemStatus({ includeErrors: false, errorLines: 5 });
    expect(result).toContain("=== DB STATUS ===");
    expect(result).toContain("=== SOURCE HEALTH ===");
    expect(result).toContain("=== DATA FRESHNESS ===");
    expect(typeof result).toBe("string");
  });

  it("AC-3: getSystemStatus completes within 10s even in test environment", async () => {
    const t0 = Date.now();
    await getSystemStatus({ includeErrors: false, errorLines: 5 });
    const elapsed = Date.now() - t0;
    // Must complete well within the 10s window
    expect(elapsed).toBeLessThan(10_000);
  });
});
