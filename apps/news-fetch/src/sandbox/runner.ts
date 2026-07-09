/**
 * news-fetch Sandbox Runner
 *
 * Thin orchestrator: parses CLI flags, runs the env-audit gate, discovers
 * scenario files, executes each, and reports results. Implementation split
 * across cli.ts / registry.ts / discover.ts / equal.ts / execute.ts /
 * report.ts (FACTORY-NEWS-split-sandbox) — this file owns only the main
 * loop and process exit codes.
 *
 * Usage:
 *   bun run src/sandbox/runner.ts --tier=primitive --module=news-fetch --scenario=all
 *   bun run src/sandbox/runner.ts --tier=module   --module=news-fetch --scenario=all
 *   bun run src/sandbox/runner.ts --tier=all      --module=news-fetch --scenario=all
 *   bun run src/sandbox/runner.ts --tier=primitive --module=news-fetch --scenario=docs/scenarios/news-fetch/primitives/published-at-parser/golden.json
 *   bun run src/sandbox/runner.ts --tier=all --module=news-fetch --scenario=all --output=dashboard/results.json
 */

import { parseCliArgs, runEnvAuditGate } from './cli.js';
import { discoverScenarioFiles } from './discover.js';
import { runScenario, type ScenarioResult } from './execute.js';
import { printScenarioResult, printSummary, writeTraceOutput } from './report.js';

const { tier, module_, scenarioArg, outputFlag } = parseCliArgs();

// Env audit gate (AC-6) — must be clean before any scenario executes.
runEnvAuditGate();

async function main() {
  if (module_ !== 'news-fetch') {
    console.error(`[sandbox] Unknown module: ${module_}. Expected: news-fetch`);
    process.exit(1);
  }

  const validTiers = ['primitive', 'module', 'all'];
  if (!validTiers.includes(tier)) {
    console.error(`[sandbox] Unknown tier: ${tier}. Expected: primitive | module | all`);
    process.exit(1);
  }

  const files = discoverScenarioFiles(tier as 'primitive' | 'module' | 'all', scenarioArg);

  if (files.length === 0) {
    console.log('[sandbox] No scenario files found — 0 scenarios run.');
    console.log('[sandbox] Result: 0 PASS, 0 FAIL, 0 ERROR');
    // Exit 0 — no files is not a failure (primitives may not exist yet)
    process.exit(0);
  }

  console.log(`[sandbox] Running ${files.length} scenario(s) — tier=${tier}, module=${module_}`);
  console.log('');

  const results: ScenarioResult[] = [];
  for (const file of files) {
    const result = await runScenario(file);
    results.push(result);
    printScenarioResult(result);
  }

  const counts = printSummary(results);

  if (outputFlag) {
    writeTraceOutput(outputFlag, tier, module_, results, counts);
  }

  if (counts.failCount > 0 || counts.errorCount > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[sandbox] Unhandled error:', err);
  process.exit(1);
});
