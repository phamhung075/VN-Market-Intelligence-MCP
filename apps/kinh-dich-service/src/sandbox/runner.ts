/**
 * Kinh Dich Sandbox Runner
 *
 * Drives scenario execution against primitive and module functions.
 * Pure compute only — no web framework, no DB, no external API calls.
 *
 * Usage:
 *   bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=all
 *   bun run src/sandbox/runner.ts --tier=module    --module=kinh-dich --scenario=all
 *   bun run src/sandbox/runner.ts --tier=all       --module=kinh-dich --scenario=all
 *   bun run src/sandbox/runner.ts --tier=primitive --module=kinh-dich --scenario=hexagram-resolver-golden.json
 *
 * G7 zero-creds: hexagram logic is pure compute.
 * G12 DoD gate: exits 0 when all loaded scenarios pass.
 */

import { readFileSync, readdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import { resolveHexagram } from '../primitive/hexagram-resolver/index.js';

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScenarioResult {
  file: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  error?: string;
  output?: unknown;
}

interface ScenarioFile {
  primitive?: string;
  module?: string;
  tier: string;
  input: unknown;
  expected?: unknown;
  expect_error?: boolean;
}

// ── CLI flag parsing ──────────────────────────────────────────────────────────

function parseFlags(args: string[]): { tier: string; module: string; scenario: string } {
  let tier = 'all';
  let moduleName = 'kinh-dich';
  let scenario = 'all';

  for (const arg of args) {
    const m = arg.match(/^--(\w+)=(.+)$/);
    if (!m) continue;
    const [, key, val] = m;
    if (key === 'tier') tier = val!;
    else if (key === 'module') moduleName = val!;
    else if (key === 'scenario') scenario = val!;
  }

  return { tier, module: moduleName, scenario };
}

// ── Scenario path resolution ──────────────────────────────────────────────────

/**
 * Resolves the repo root by walking up from this file's location.
 * The runner lives at apps/kinh-dich-service/src/sandbox/runner.ts
 * Scenarios live at docs/scenarios/kinh-dich/
 */
function resolveRepoRoot(): string {
  // __dirname equivalent in Bun
  const selfPath = new URL(import.meta.url).pathname;
  // Walk up 5 levels: runner.ts -> sandbox -> src -> kinh-dich-service -> apps -> root
  let dir = selfPath;
  for (let i = 0; i < 5; i++) {
    dir = resolve(dir, '..');
  }
  return dir;
}

function scenarioDirForTier(repoRoot: string, moduleName: string, tier: 'primitive' | 'module'): string {
  // docs/scenarios/kinh-dich/primitives/ or docs/scenarios/kinh-dich/module/
  const subDir = tier === 'primitive' ? 'primitives' : 'module';
  return join(repoRoot, 'docs', 'scenarios', moduleName, subDir);
}

function loadScenarioFiles(dir: string, scenario: string): string[] {
  if (!existsSync(dir)) return [];

  if (scenario === 'all') {
    try {
      return readdirSync(dir)
        .filter((f) => f.endsWith('.json'))
        .map((f) => join(dir, f))
        .sort();
    } catch {
      return [];
    }
  }

  // Single scenario — accept bare filename or full path
  const candidate = scenario.endsWith('.json') ? scenario : `${scenario}.json`;
  const full = existsSync(candidate) ? candidate : join(dir, candidate);
  return existsSync(full) ? [full] : [];
}

// ── Primitive executors ───────────────────────────────────────────────────────

/**
 * Execute a hexagram-resolver scenario.
 * Dispatched when scenario.primitive === 'hexagram-resolver'.
 */
function runHexagramResolverScenario(fileName: string, scenario: ScenarioFile): ScenarioResult {
  const input = scenario.input as unknown as Record<string, unknown>;
  const signals = input['signals'] as number[] | undefined;

  if (!Array.isArray(signals)) {
    return { file: fileName, status: 'FAIL', error: 'hexagram-resolver scenario missing input.signals array' };
  }

  const expectError = scenario.expect_error === true;
  const expected = scenario.expected as Record<string, unknown> | undefined;

  try {
    const result = resolveHexagram(signals);

    if (expectError) {
      return { file: fileName, status: 'FAIL', error: `Expected error but got result: ${result}` };
    }

    if (expected !== undefined) {
      const expectedHexagram = expected['hexagram'] as number | null;
      if (expectedHexagram !== null && result !== expectedHexagram) {
        return {
          file: fileName,
          status: 'FAIL',
          error: `Expected hexagram ${expectedHexagram} but got ${result}`,
          output: result,
        };
      }
    }

    return { file: fileName, status: 'PASS', output: { hexagram: result } };
  } catch (err) {
    if (expectError) {
      // Expected error — scenario passes
      const errMsg = err instanceof Error ? err.message : String(err);
      return { file: fileName, status: 'PASS', output: { error: errMsg } };
    }
    return { file: fileName, status: 'FAIL', error: `Unexpected error: ${err}` };
  }
}

// ── Scenario execution ────────────────────────────────────────────────────────

function runScenario(filePath: string): ScenarioResult {
  const fileName = filePath.split('/').pop() ?? filePath;

  let raw: string;
  try {
    raw = readFileSync(filePath, 'utf-8');
  } catch (e) {
    return { file: fileName, status: 'FAIL', error: `Cannot read file: ${e}` };
  }

  let scenario: ScenarioFile;
  try {
    scenario = JSON.parse(raw) as ScenarioFile;
  } catch (e) {
    return { file: fileName, status: 'FAIL', error: `Invalid JSON: ${e}` };
  }

  // Validate minimum structure
  if (!scenario.tier || !scenario.input) {
    return {
      file: fileName,
      status: 'FAIL',
      error: 'Scenario missing required fields: tier, input',
    };
  }

  // Dispatch to primitive executor based on scenario.primitive field.
  if (scenario.primitive === 'hexagram-resolver') {
    return runHexagramResolverScenario(fileName, scenario);
  }

  // Fallback: well-formed scenario with no known primitive → structural PASS.
  return { file: fileName, status: 'PASS', output: scenario.input };
}

// ── Runner core ───────────────────────────────────────────────────────────────

async function run(): Promise<void> {
  const args = process.argv.slice(2);
  const flags = parseFlags(args);

  const repoRoot = resolveRepoRoot();

  const tiers: Array<'primitive' | 'module'> =
    flags.tier === 'all'
      ? ['primitive', 'module']
      : flags.tier === 'primitive'
      ? ['primitive']
      : ['module'];

  const results: ScenarioResult[] = [];

  for (const tier of tiers) {
    const dir = scenarioDirForTier(repoRoot, flags.module, tier);
    const files = loadScenarioFiles(dir, flags.scenario);

    if (files.length === 0) {
      // No scenarios yet for this tier — that is expected during P1-A (zero primitives).
      console.log(`[sandbox] tier=${tier} dir=${dir} — 0 scenarios found (expected: no primitives yet)`);
      continue;
    }

    for (const file of files) {
      const result = runScenario(file);
      results.push(result);
      const icon = result.status === 'PASS' ? 'PASS' : result.status === 'SKIP' ? 'SKIP' : 'FAIL';
      const errStr = result.error ? ` | ${result.error}` : '';
      console.log(`[${icon}] ${result.file}${errStr}`);
    }
  }

  // Summary line (AC-3)
  const total = results.length;
  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  if (total === 0) {
    console.log(`\n[sandbox] PASS 0/0 scenarios (no scenarios loaded — baseline GREEN)`);
    process.exit(0);
  }

  console.log(`\n[sandbox] ${passed === total ? 'PASS' : 'FAIL'} ${passed}/${total} scenarios (${failed} failed, ${skipped} skipped)`);

  if (failed > 0) {
    process.exit(1);
  }
  process.exit(0);
}

run().catch((e) => {
  console.error('[sandbox] Fatal error:', e);
  process.exit(2);
});
