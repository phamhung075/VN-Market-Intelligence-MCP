/**
 * 1948e-dispatch-kill-switch.test.ts
 *
 * Acceptance criteria TASK-5: per-path kill-switch (C-4 HARD)
 * AC-T5-1 through AC-T5-5
 *
 * All tests manipulate Bun.env directly to test env-based kill-switch behavior.
 * Cleanup restores env after each test.
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  DISPATCH_PATHS,
  isAutoDispatchEnabled,
  type DispatchPath,
} from "../scheduler/audits/selfImproveOrchestratorJob.js";

// ─────────────────────────────────────────────────────────────────────────────
// Env cleanup helpers
// ─────────────────────────────────────────────────────────────────────────────

const DISPATCH_ENV_KEYS = DISPATCH_PATHS.map(
  (p) => `SELF_IMPROVE_AUTO_DISPATCH_${p.toUpperCase()}`,
);

function clearDispatchEnvVars(): void {
  for (const key of DISPATCH_ENV_KEYS) {
    delete Bun.env[key];
  }
  // Also clear the bare global flag used in AC-T5-4
  delete Bun.env["SELF_IMPROVE_AUTO_DISPATCH"];
}

beforeEach(() => {
  clearDispatchEnvVars();
});

afterEach(() => {
  clearDispatchEnvVars();
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T5-1: All paths false by default (C-4)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T5-1: all paths return false by default (no env override)", () => {
  test("all DISPATCH_PATHS return false when no env vars set", () => {
    for (const path of DISPATCH_PATHS) {
      expect(isAutoDispatchEnabled(path)).toBe(false);
    }
  });

  test("DISPATCH_PATHS contains the 4 expected paths", () => {
    expect(DISPATCH_PATHS).toContain("price_confirmation");
    expect(DISPATCH_PATHS).toContain("chain_catalyst");
    expect(DISPATCH_PATHS).toContain("volume_spike");
    expect(DISPATCH_PATHS).toContain("coverage_gap");
    expect(DISPATCH_PATHS).toHaveLength(4);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T5-2: Path-specific enable
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T5-2: setting one path env var enables ONLY that path", () => {
  test("SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION=true → only price_confirmation is true", () => {
    Bun.env["SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION"] = "true";

    expect(isAutoDispatchEnabled("price_confirmation")).toBe(true);
    expect(isAutoDispatchEnabled("chain_catalyst")).toBe(false);
    expect(isAutoDispatchEnabled("volume_spike")).toBe(false);
    expect(isAutoDispatchEnabled("coverage_gap")).toBe(false);
  });

  test("SELF_IMPROVE_AUTO_DISPATCH_COVERAGE_GAP=true → only coverage_gap is true", () => {
    Bun.env["SELF_IMPROVE_AUTO_DISPATCH_COVERAGE_GAP"] = "true";

    expect(isAutoDispatchEnabled("coverage_gap")).toBe(true);
    expect(isAutoDispatchEnabled("price_confirmation")).toBe(false);
    expect(isAutoDispatchEnabled("chain_catalyst")).toBe(false);
    expect(isAutoDispatchEnabled("volume_spike")).toBe(false);
  });

  test("value='false' (explicit) → false (not true)", () => {
    Bun.env["SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION"] = "false";
    expect(isAutoDispatchEnabled("price_confirmation")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T5-3: Unknown type via type assertion returns false (fail-safe)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T5-3: unknown type cast via type assertion returns false (fail-safe)", () => {
  test("isAutoDispatchEnabled with unknown path cast returns false, not throw", () => {
    // TypeScript compile error (expected — tests runtime behavior)
    let result: boolean;
    expect(() => {
      result = isAutoDispatchEnabled(
        "totally_unknown_type_xyz" as DispatchPath,
      );
    }).not.toThrow();

    // The function reads Bun.env['SELF_IMPROVE_AUTO_DISPATCH_TOTALLY_UNKNOWN_TYPE_XYZ']
    // which is undefined → returns false
    expect(
      isAutoDispatchEnabled("totally_unknown_type_xyz" as DispatchPath),
    ).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T5-4: Global flag REJECTED (C-4 hard)
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T5-4: bare global SELF_IMPROVE_AUTO_DISPATCH=true REJECTED (C-4 hard)", () => {
  test("global flag with no path suffix does NOT enable any dispatch path", () => {
    // Set the bare global — this must NOT enable any path
    Bun.env["SELF_IMPROVE_AUTO_DISPATCH"] = "true";

    for (const path of DISPATCH_PATHS) {
      expect(isAutoDispatchEnabled(path)).toBe(false);
    }
  });

  test("global flag + per-path explicitly false → per-path still false", () => {
    Bun.env["SELF_IMPROVE_AUTO_DISPATCH"] = "true";
    Bun.env["SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION"] = "false";

    expect(isAutoDispatchEnabled("price_confirmation")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-T5-5: Kill-switch type is exported and visible with DispatchPath parameter
// ─────────────────────────────────────────────────────────────────────────────

describe("AC-T5-5: isAutoDispatchEnabled has typed DispatchPath parameter", () => {
  test("function is exported and callable", () => {
    expect(typeof isAutoDispatchEnabled).toBe("function");
  });

  test("DISPATCH_PATHS is exported and is a readonly tuple", () => {
    expect(Array.isArray(DISPATCH_PATHS)).toBe(true);
    expect(DISPATCH_PATHS.length).toBe(4);
  });

  test("source file declares isAutoDispatchEnabled(path: DispatchPath): boolean", () => {
    const filePath = resolve(
      __dirname,
      "../scheduler/audits/selfImproveOrchestratorJob.ts",
    );
    const content = readFileSync(filePath, "utf8");

    // Verify typed signature is in the source
    expect(content).toContain("isAutoDispatchEnabled(path: DispatchPath)");
    expect(content).toContain("export function isAutoDispatchEnabled");
    expect(content).toContain("export const DISPATCH_PATHS");
    expect(content).toContain("export type DispatchPath");
  });
});
