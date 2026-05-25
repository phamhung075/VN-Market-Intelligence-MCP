/**
 * Sandbox Types — Phase 1 (P1-A)
 *
 * Pure-data interfaces for the scenario runner.
 * No class instances, no I/O types — all values are JSON-serialisable primitives.
 *
 * DDD: this file belongs to the sandbox runner layer, which sits ABOVE domain/
 * (it imports pure domain functions to test them). It must NOT import from
 * infrastructure/ or interface/.
 */

/**
 * A single scenario descriptor loaded from a JSON file.
 *
 * Schema:
 *   scenario  — human-readable name (used as trace key + dashboard label)
 *   primitive — function identifier dispatched by runner.ts
 *   input     — raw input value(s) passed to the primitive
 *   expected  — expected output value; runner compares actual vs expected
 */
export interface ScenarioInput {
  scenario: string;
  primitive: string;
  input: unknown;
  expected: unknown;
}

/**
 * The trace written to dashboard/traces/<scenario>.json by the runner.
 *
 * Fields:
 *   scenario  — matches ScenarioInput.scenario
 *   primitive — matches ScenarioInput.primitive
 *   status    — "pass" | "fail"
 *   actual    — actual output of the primitive call
 *   expected  — expected output from the scenario JSON
 *   match     — true if deepEqual(actual, expected)
 *   error     — error message if the primitive threw; null otherwise
 *   timestamp — ISO-8601 run timestamp (UTC)
 *   durationMs — wall-clock runtime of the primitive call in milliseconds
 */
export interface TraceOutput {
  scenario: string;
  primitive: string;
  status: "pass" | "fail";
  actual: unknown;
  expected: unknown;
  match: boolean;
  error: string | null;
  timestamp: string;
  durationMs: number;
}
