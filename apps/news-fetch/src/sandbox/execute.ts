/**
 * news-fetch Sandbox — scenario executors (primitive-tier, module-tier) + per-file dispatcher.
 * Primitive args come from each registry entry's `argAdapter` (registry.ts) — replaces the
 * by-name if/else signature switch. Split out of runner.ts (FACTORY-NEWS-split-sandbox).
 */

import { readFileSync } from 'node:fs';
import { PRIMITIVE_REGISTRY, MODULE_REGISTRY } from './registry.js';
import { deepEqual } from './equal.js';

export interface ScenarioResult {
  file: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  primitive?: string;
  module?: string;
  scenarioType?: string;
  diff?: string;
}

type ResultTag = Omit<ScenarioResult, 'file' | 'status' | 'diff'>;

function mkResult(file: string, status: ScenarioResult['status'], extra: Omit<ScenarioResult, 'file' | 'status'> = {}): ScenarioResult {
  return { file, status, ...extra };
}

// Shared by both executors: dynamic-import the registry entry's module + resolve fnName.
async function resolveFn(importPath: string, fnName: string, scenarioFile: string, tag: ResultTag) {
  let mod: Record<string, unknown>;
  try {
    mod = (await import(importPath)) as Record<string, unknown>;
  } catch (err) {
    return { error: mkResult(scenarioFile, 'ERROR', { ...tag, diff: `Import failed: ${err instanceof Error ? err.message : String(err)}` }) };
  }
  const fn = mod[fnName];
  if (typeof fn !== 'function') {
    return { error: mkResult(scenarioFile, 'ERROR', { ...tag, diff: `Function '${fnName}' not found in module` }) };
  }
  return { fn: fn as (...args: unknown[]) => unknown };
}

// Shared by both executors: PASS if matched, else FAIL with an expected/got diff.
function finalize(scenarioFile: string, matched: boolean, tag: ResultTag, actual: unknown, expectedOutput: unknown): ScenarioResult {
  if (matched) return mkResult(scenarioFile, 'PASS', tag);
  return mkResult(scenarioFile, 'FAIL', { ...tag, diff: `expected: ${JSON.stringify(expectedOutput)} | got: ${JSON.stringify(actual)}` });
}

export async function runPrimitiveScenario(scenarioFile: string, scenario: Record<string, unknown>): Promise<ScenarioResult> {
  const primitiveName = scenario['primitive'] as string;
  const fnName = scenario['function'] as string;
  const input = scenario['input'] as Record<string, unknown>;
  const expectedOutput = scenario['expectedOutput'];
  const scenarioType = scenario['scenarioType'] as string;
  const tag = { primitive: primitiveName, scenarioType };

  const entry = PRIMITIVE_REGISTRY[primitiveName];
  if (!entry) {
    return mkResult(scenarioFile, 'ERROR', { primitive: primitiveName, diff: `No registry entry for primitive: ${primitiveName}` });
  }

  const resolved = await resolveFn(entry.importPath, fnName, scenarioFile, tag);
  if (resolved.error) return resolved.error;

  // Args built by the registry's per-entry argAdapter (registry.ts) — no by-name switch here.
  let actual: unknown;
  try {
    actual = resolved.fn!(...entry.argAdapter(input));
  } catch (err) {
    return mkResult(scenarioFile, 'ERROR', { ...tag, diff: `Runtime error: ${err instanceof Error ? err.message : String(err)}` });
  }

  return finalize(scenarioFile, deepEqual(actual, expectedOutput), tag, actual, expectedOutput);
}

export async function runModuleScenario(scenarioFile: string, scenario: Record<string, unknown>): Promise<ScenarioResult> {
  const moduleName = scenario['module'] as string;
  const fnName = scenario['function'] as string;
  const input = scenario['input'] as Record<string, unknown>;
  const expectedOutput = scenario['expectedOutput'] as Record<string, unknown>;
  const scenarioType = scenario['scenarioType'] as string;
  const tag = { module: moduleName, scenarioType };

  const entry = MODULE_REGISTRY[moduleName];
  if (!entry) {
    return mkResult(scenarioFile, 'ERROR', { module: moduleName, diff: `No registry entry for module: ${moduleName}` });
  }

  const resolved = await resolveFn(entry.importPath, fnName, scenarioFile, tag);
  if (resolved.error) return resolved.error;

  let actual: unknown;
  try {
    actual = await (resolved.fn! as (input: unknown) => Promise<unknown>)(input);
  } catch (err) {
    return mkResult(scenarioFile, 'ERROR', { ...tag, diff: `Runtime error: ${err instanceof Error ? err.message : String(err)}` });
  }

  // Module scenarios use partial-match on expectedOutput keys
  if (actual !== null && typeof actual === 'object') {
    const allMatch = Object.entries(expectedOutput).every(([k, v]) => deepEqual((actual as Record<string, unknown>)[k], v));
    return finalize(scenarioFile, allMatch, tag, actual, expectedOutput);
  }

  return finalize(scenarioFile, deepEqual(actual, expectedOutput), tag, actual, expectedOutput);
}

export async function runScenario(scenarioFile: string): Promise<ScenarioResult> {
  let scenario: Record<string, unknown>;
  try {
    const raw = readFileSync(scenarioFile, 'utf-8');
    scenario = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    return mkResult(scenarioFile, 'ERROR', { diff: `JSON parse error: ${err instanceof Error ? err.message : String(err)}` });
  }

  // Dispatch by scenario type
  if ('primitive' in scenario) return runPrimitiveScenario(scenarioFile, scenario);
  if ('module' in scenario) return runModuleScenario(scenarioFile, scenario);

  return mkResult(scenarioFile, 'ERROR', { diff: 'Unknown scenario type — missing "primitive" or "module" field' });
}
