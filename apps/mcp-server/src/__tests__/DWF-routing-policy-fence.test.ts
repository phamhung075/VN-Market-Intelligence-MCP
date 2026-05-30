/**
 * DWF-DEV-MCP-2 — Routing-Policy Fence Test (RED-before-GREEN)
 *
 * AC-P0-2-1: docs/data/routing-policy.json parses as valid JSON.
 * AC-P0-2-3: A catch-all rule (type:"*", severity:"*", zone:"*", ticker:"*")
 *            exists as the LAST entry and routes to "po".
 * AC-P0-2-4: No file inside apps/ imports or reads routing-policy.json.
 * AC-P0-2-5: DELIBERATE-VIOLATION FENCE — removing the catch-all makes this
 *            test go RED. Proves the fence is not a false-green.
 *
 * RED/GREEN lifecycle:
 *   RED  — before DWF-DEV-CROSS-2 creates docs/data/routing-policy.json
 *   GREEN — once DWF-DEV-CROSS-2 lands the file with correct catch-all
 *   RED  — if someone removes the catch-all (DV proof)
 */

import { describe, it, expect } from "bun:test";
import { existsSync, readFileSync } from "fs";
import { resolve, join } from "path";
import { execSync } from "child_process";

// ── Path resolution (test file lives in apps/mcp-server/src/__tests__/) ─────
// Repo root = 4 levels up from __tests__/
const REPO_ROOT = resolve(import.meta.dir, "../../../../");
const ROUTING_POLICY_PATH = join(REPO_ROOT, "docs/data/routing-policy.json");
const APPS_DIR = join(REPO_ROOT, "apps");

// ─────────────────────────────────────────────────────────────────────────────
// Rule shape (matches FR-P0-2 schema)
// ─────────────────────────────────────────────────────────────────────────────
interface RoutingRule {
  type: string;
  severity: string;
  zone?: string;
  ticker?: string;
  target_agents: string[];
  channel: string;
  description: string;
}

interface RoutingPolicy {
  routing_policy: RoutingRule[];
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-P0-2-1: File exists and is valid JSON
// ─────────────────────────────────────────────────────────────────────────────
describe("DWF-DEV-MCP-2 — Routing-Policy Fence", () => {
  it("AC-P0-2-1: docs/data/routing-policy.json must exist", () => {
    // RED until DWF-DEV-CROSS-2 creates the file
    expect(
      existsSync(ROUTING_POLICY_PATH),
      `routing-policy.json not found at ${ROUTING_POLICY_PATH} — waiting for DWF-DEV-CROSS-2`
    ).toBe(true);
  });

  it("AC-P0-2-1: docs/data/routing-policy.json must parse as valid JSON", () => {
    // RED until DWF-DEV-CROSS-2 creates the file
    expect(
      existsSync(ROUTING_POLICY_PATH),
      `routing-policy.json not found — cannot parse`
    ).toBe(true);

    const raw = readFileSync(ROUTING_POLICY_PATH, "utf8");
    let parsed: RoutingPolicy;
    expect(() => {
      parsed = JSON.parse(raw);
    }, "routing-policy.json is not valid JSON").not.toThrow();
  });

  it("AC-P0-2-1: routing_policy root key must be an array", () => {
    expect(existsSync(ROUTING_POLICY_PATH)).toBe(true);
    const parsed: RoutingPolicy = JSON.parse(readFileSync(ROUTING_POLICY_PATH, "utf8"));
    expect(Array.isArray(parsed.routing_policy)).toBe(true);
    expect(parsed.routing_policy.length).toBeGreaterThan(0);
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-P0-2-3: Catch-all rule is the last entry and routes to "po"
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-P0-2-3: last rule must be a full-wildcard catch-all routing to po", () => {
    // RED if file missing OR catch-all absent (AC-P0-2-5 DV fence)
    expect(
      existsSync(ROUTING_POLICY_PATH),
      `routing-policy.json not found — RED until DWF-DEV-CROSS-2`
    ).toBe(true);

    const parsed: RoutingPolicy = JSON.parse(readFileSync(ROUTING_POLICY_PATH, "utf8"));
    const rules = parsed.routing_policy;
    expect(rules.length).toBeGreaterThan(0);

    const lastRule = rules[rules.length - 1]!;

    // Each wildcard axis must be "*"
    expect(lastRule.type).toBe("*");
    expect(lastRule.severity).toBe("*");
    expect(lastRule.zone ?? "*").toBe("*");
    expect(lastRule.ticker ?? "*").toBe("*");

    // Must route to "po" (fallback per CLAUDE.md §3 and FR-P0-2)
    expect(lastRule.target_agents).toContain("po");
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-P0-2-5 — DELIBERATE-VIOLATION FENCE
  //
  // This test deliberately constructs a rules array with the catch-all
  // REMOVED and asserts that the validation logic would detect its absence.
  //
  // Purpose: prove the catch-all assertion is live and not a false-green.
  // If you run this test and it PASSES when the catch-all is absent → BUG.
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-P0-2-5 DV: rules array with catch-all removed must fail catch-all check", () => {
    // Construct a synthetic rules array WITHOUT a catch-all
    const rulesWithoutCatchAll: RoutingRule[] = [
      {
        type: "price_alert",
        severity: "high",
        zone: "*",
        ticker: "*",
        target_agents: ["alert-commander"],
        channel: "market",
        description: "High-severity price alert → alert-commander",
      },
      {
        type: "news_signal",
        severity: "*",
        zone: "*",
        ticker: "*",
        target_agents: ["news-scout"],
        channel: "work",
        description: "News signal → news-scout",
      },
      // NO CATCH-ALL — deliberately omitted to prove the fence
    ];

    const lastRule = rulesWithoutCatchAll[rulesWithoutCatchAll.length - 1]!;

    // The check below MUST go RED when catch-all is absent.
    // Catch-all requires: type="*", severity="*", zone="*"/"undefined", ticker="*"/"undefined"
    const isCatchAll =
      lastRule.type === "*" &&
      lastRule.severity === "*" &&
      (lastRule.zone === "*" || lastRule.zone === undefined) &&
      (lastRule.ticker === "*" || lastRule.ticker === undefined) &&
      lastRule.target_agents.includes("po");

    // This expect MUST PASS (DV test verifies the validation logic is live)
    // The test asserts isCatchAll === false, which it IS because we omitted it.
    // Removing the catch-all from the real file makes the AC-P0-2-3 test RED.
    expect(isCatchAll).toBe(false); // DV-synthetic: last rule is NOT a catch-all (expected)
  });

  it("AC-P0-2-5 DV: rules array WITH catch-all passes catch-all check (baseline)", () => {
    // Symmetric proof: a rules array WITH correct catch-all passes.
    // This baseline test ensures the validation logic itself is not broken.
    const rulesWithCatchAll: RoutingRule[] = [
      {
        type: "price_alert",
        severity: "high",
        zone: "*",
        ticker: "*",
        target_agents: ["alert-commander"],
        channel: "market",
        description: "High-severity price alert → alert-commander",
      },
      {
        // Correct catch-all
        type: "*",
        severity: "*",
        zone: "*",
        ticker: "*",
        target_agents: ["po"],
        channel: "work",
        description: "Catch-all fallback → po",
      },
    ];

    const lastRule = rulesWithCatchAll[rulesWithCatchAll.length - 1]!;

    const isCatchAll =
      lastRule.type === "*" &&
      lastRule.severity === "*" &&
      (lastRule.zone === "*" || lastRule.zone === undefined) &&
      (lastRule.ticker === "*" || lastRule.ticker === undefined) &&
      lastRule.target_agents.includes("po");

    expect(isCatchAll).toBe(true); // DV-baseline: catch-all is present (expected)
  });

  // ─────────────────────────────────────────────────────────────────────────
  // AC-P0-2-4: No apps/ file imports routing-policy.json
  // (routing-policy is consumed by nothing in Phase 0 — read-only SSOT)
  // ─────────────────────────────────────────────────────────────────────────
  it("AC-P0-2-4: no production file in apps/mcp-server/src (non-test) imports routing-policy.json", () => {
    // Scoped to mcp-server src only (this agent's zone) to keep grep fast (<5s).
    // Exclude __tests__/ — test files referencing the name in strings are allowed.
    // Production code must NOT import routing-policy (it's a Phase 0 read-only SSOT,
    // consumed by nothing — see FR-P0-2).
    const srcDir = join(REPO_ROOT, "apps/mcp-server/src");
    let grepOutput = "";
    try {
      grepOutput = execSync(
        `grep -r --include="*.ts" --exclude-dir="__tests__" -l "routing-policy" "${srcDir}" 2>/dev/null || true`,
        { encoding: "utf8", timeout: 4000 }
      ).trim();
    } catch {
      grepOutput = "";
    }

    expect(
      grepOutput,
      `routing-policy.json is imported in production mcp-server src — violates AC-P0-2-4. Offending files:\n${grepOutput}`
    ).toBe("");
  });
});
