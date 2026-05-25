/**
 * Sandbox Runner — Phase 1 (P1-A)
 *
 * Loads a scenario JSON file, dispatches to the corresponding pure domain
 * function, compares actual output vs expected, and writes a trace JSON to
 * dashboard/traces/<scenario-name>.json.
 *
 * Usage:
 *   bun run src/sandbox/runner.ts --scenario=<path-to-scenario.json>
 *   bun run src/sandbox/runner.ts --emit-traces   # run ALL scenarios in src/sandbox/scenarios/
 *
 * Exit codes:
 *   0 — all scenarios pass (or no failure scenarios in the run)
 *   1 — one or more scenarios fail (actual !== expected) or an error occurred
 *
 * AC-1: Imports ONLY from domain/services/ pure functions.
 *       ZERO infrastructure imports — verified by grep.
 *
 * Security (AC-5): runner has zero DB credentials or API keys.
 *   Verify: env | grep -E "DB_|API_KEY|SECRET|TOKEN|PASSWORD" returns empty
 *   when running the sandbox in isolation.
 */

import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from "fs";
import { resolve, dirname, basename } from "path";

// ── Domain imports (pure functions only — zero infrastructure) ────────────────
import { generateSparkline } from "../domain/services/sparkline.js";

import type { ScenarioInput, TraceOutput } from "./types.js";

// ─────────────────────────────────────────────────────────────────────────────
// Primitive dispatch registry
// Maps scenario.primitive string → pure function
// ─────────────────────────────────────────────────────────────────────────────

type PrimitiveInput = unknown;
type PrimitiveOutput = unknown;

interface PrimitiveFn {
  (input: PrimitiveInput): PrimitiveOutput;
}

const PRIMITIVES: Record<string, PrimitiveFn> = {
  generateSparkline: (input: PrimitiveInput): PrimitiveOutput => {
    if (input === null || input === undefined) {
      throw new Error("generateSparkline: input must not be null/undefined");
    }
    const { prices, width } = input as { prices: number[]; width?: number };
    if (!Array.isArray(prices)) {
      throw new Error("generateSparkline: input.prices must be an array");
    }
    return generateSparkline(prices, width);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Deep equality check (pure — no external deps)
// ─────────────────────────────────────────────────────────────────────────────

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === null || b === null) return false;
  if (typeof a !== typeof b) return false;
  if (typeof a !== "object") return false;
  const aObj = a as Record<string, unknown>;
  const bObj = b as Record<string, unknown>;
  const aKeys = Object.keys(aObj);
  const bKeys = Object.keys(bObj);
  if (aKeys.length !== bKeys.length) return false;
  return aKeys.every((k) => deepEqual(aObj[k], bObj[k]));
}

// ─────────────────────────────────────────────────────────────────────────────
// Failure scenario detection
// A scenario is a "failure scenario" if expected is { error: true }
// The runner expects the primitive to throw in this case.
// ─────────────────────────────────────────────────────────────────────────────

function isFailureExpected(expected: unknown): boolean {
  if (expected === null || typeof expected !== "object") return false;
  return (expected as Record<string, unknown>)["error"] === true;
}

// ─────────────────────────────────────────────────────────────────────────────
// Run one scenario
// ─────────────────────────────────────────────────────────────────────────────

function runScenario(scenarioPath: string, tracesDir: string): TraceOutput {
  const raw = readFileSync(scenarioPath, "utf-8");
  const scenario = JSON.parse(raw) as ScenarioInput;

  const fn = PRIMITIVES[scenario.primitive];
  if (!fn) {
    const trace: TraceOutput = {
      scenario: scenario.scenario,
      primitive: scenario.primitive,
      status: "fail",
      actual: null,
      expected: scenario.expected,
      match: false,
      error: `Unknown primitive: "${scenario.primitive}". Register it in PRIMITIVES map.`,
      timestamp: new Date().toISOString(),
      durationMs: 0,
    };
    writeTrace(tracesDir, trace);
    return trace;
  }

  const start = performance.now();
  let actual: unknown = undefined;
  let error: string | null = null;
  let threw = false;

  try {
    actual = fn(scenario.input);
  } catch (err) {
    threw = true;
    error = err instanceof Error ? err.message : String(err);
  }

  const durationMs = Math.round((performance.now() - start) * 100) / 100;

  const expectedError = isFailureExpected(scenario.expected);
  let match: boolean;
  let status: "pass" | "fail";

  if (expectedError) {
    // Failure scenario: pass iff the primitive threw
    match = threw;
    status = match ? "pass" : "fail";
  } else {
    // Happy/edge scenario: pass iff actual === expected (deep)
    if (threw) {
      match = false;
      status = "fail";
    } else {
      match = deepEqual(actual, scenario.expected);
      status = match ? "pass" : "fail";
    }
  }

  const trace: TraceOutput = {
    scenario: scenario.scenario,
    primitive: scenario.primitive,
    status,
    actual: threw ? null : actual,
    expected: scenario.expected,
    match,
    error,
    timestamp: new Date().toISOString(),
    durationMs,
  };

  writeTrace(tracesDir, trace);
  return trace;
}

// ─────────────────────────────────────────────────────────────────────────────
// Write trace file
// ─────────────────────────────────────────────────────────────────────────────

function writeTrace(tracesDir: string, trace: TraceOutput): void {
  if (!existsSync(tracesDir)) {
    mkdirSync(tracesDir, { recursive: true });
  }
  const outPath = resolve(tracesDir, `${trace.scenario}.json`);
  writeFileSync(outPath, JSON.stringify(trace, null, 2) + "\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Main entrypoint
// ─────────────────────────────────────────────────────────────────────────────

function main(): void {
  const args = process.argv.slice(2);
  const emitAll = args.includes("--emit-traces");
  const scenarioArg = args.find((a) => a.startsWith("--scenario="));

  // Determine paths relative to runner.ts location
  const runnerDir = dirname(import.meta.url.replace("file://", ""));
  const scenariosDir = resolve(runnerDir, "scenarios");
  const tracesDir = resolve(runnerDir, "../../dashboard/traces");

  if (emitAll) {
    // Run ALL .json files in scenarios/
    const files = readdirSync(scenariosDir).filter((f) => f.endsWith(".json"));
    let anyFail = false;
    for (const file of files) {
      const scenarioPath = resolve(scenariosDir, file);
      const trace = runScenario(scenarioPath, tracesDir);
      const icon = trace.status === "pass" ? "PASS" : "FAIL";
      console.log(`[${icon}] ${trace.scenario} (${trace.durationMs}ms)`);
      if (trace.error) console.log(`       error: ${trace.error}`);
      if (trace.status === "fail") anyFail = true;
    }
    process.exit(anyFail ? 1 : 0);
  } else if (scenarioArg) {
    // Run a single scenario
    const scenarioPath = resolve(process.cwd(), scenarioArg.replace("--scenario=", ""));
    const trace = runScenario(scenarioPath, tracesDir);
    const icon = trace.status === "pass" ? "PASS" : "FAIL";
    console.log(`[${icon}] ${trace.scenario} (${trace.durationMs}ms)`);
    if (trace.error) console.log(`       error: ${trace.error}`);
    // Exit non-zero only for genuine FAIL (not for expected-error scenarios)
    process.exit(trace.status === "fail" ? 1 : 0);
  } else {
    console.error("Usage:");
    console.error("  bun run src/sandbox/runner.ts --scenario=<path>");
    console.error("  bun run src/sandbox/runner.ts --emit-traces");
    process.exit(1);
  }
}

main();
