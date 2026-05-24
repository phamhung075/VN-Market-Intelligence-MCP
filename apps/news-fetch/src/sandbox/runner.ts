/**
 * news-fetch Sandbox Runner
 *
 * Runs scenario JSON files against primitive and module functions.
 * Zero infrastructure imports: no Hono, no Playwright, no fetch(), no SQLite.
 * Only imports from src/primitive/* and src/module/*.
 *
 * Usage:
 *   bun run src/sandbox/runner.ts --tier=primitive --module=news-fetch --scenario=all
 *   bun run src/sandbox/runner.ts --tier=module   --module=news-fetch --scenario=all
 *   bun run src/sandbox/runner.ts --tier=all      --module=news-fetch --scenario=all
 *   bun run src/sandbox/runner.ts --tier=primitive --module=news-fetch --scenario=docs/scenarios/news-fetch/primitives/published-at-parser/golden.json
 *   bun run src/sandbox/runner.ts --tier=all --module=news-fetch --scenario=all --output=dashboard/results.json
 */

import { readdirSync, existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';

// ---------------------------------------------------------------------------
// CLI flag parsing
// ---------------------------------------------------------------------------

function getFlag(flag: string): string | null {
  const prefix = `--${flag}=`;
  const arg = process.argv.find((a) => a.startsWith(prefix));
  return arg ? arg.slice(prefix.length) : null;
}

const tier = getFlag('tier') ?? 'all';
const module_ = getFlag('module') ?? 'news-fetch';
const scenarioArg = getFlag('scenario') ?? 'all';
const outputFlag = getFlag('output') ?? null;

// ---------------------------------------------------------------------------
// Env audit gate (AC-6) — must be clean at runner start
// ---------------------------------------------------------------------------

// Match credential-style env var names.
// Excludes CTX_ADVISOR_* (context metrics, not credentials).
// Targets: DB_ prefix, API_KEY suffix, _SECRET suffix, _TOKEN suffix (credential bearer tokens),
//          _PASSWORD suffix, NEWS_API_KEY, PLAYWRIGHT, BROWSER_ (infra deps that should not leak in).
const CREDENTIAL_PATTERN =
  /^(DB_|NEWS_API_KEY|PLAYWRIGHT|BROWSER_)|_(API_KEY|SECRET|TOKEN|PASSWORD)$/i;
const leakedKeys = Object.keys(Bun.env).filter(
  (k) => !k.startsWith('CTX_ADVISOR_') && CREDENTIAL_PATTERN.test(k),
);
if (leakedKeys.length > 0) {
  console.error(
    `[sandbox] SECURITY VIOLATION: credentials detected in env: ${leakedKeys.join(', ')}`,
  );
  process.exit(2);
}

// ---------------------------------------------------------------------------
// Project root resolution
// ---------------------------------------------------------------------------

const PROJECT_ROOT = resolve(import.meta.dir, '../../../..');
const SCENARIOS_ROOT = resolve(PROJECT_ROOT, 'docs/scenarios/news-fetch');

// ---------------------------------------------------------------------------
// Primitive function registry
// Registry maps scenario `primitive` field → import path → function name
// ---------------------------------------------------------------------------

interface PrimitiveEntry {
  importPath: string;
  fnName: string;
}

const PRIMITIVE_REGISTRY: Record<string, PrimitiveEntry> = {
  'published-at-parser': {
    importPath: resolve(import.meta.dir, '../primitive/published-at-parser/index.js'),
    fnName: 'parsePublishedAt',
  },
  'headline-normalizer': {
    importPath: resolve(import.meta.dir, '../primitive/headline-normalizer/index.js'),
    fnName: 'normalizeHeadline',
  },
  'source-dedup-key': {
    importPath: resolve(import.meta.dir, '../primitive/source-dedup-key/index.js'),
    fnName: 'computeArticleKey',
  },
  'article-relevance-filter': {
    importPath: resolve(import.meta.dir, '../primitive/article-relevance-filter/index.js'),
    fnName: 'isRelevantArticle',
  },
};

// Module registry
interface ModuleEntry {
  importPath: string;
  fnName: string;
}

const MODULE_REGISTRY: Record<string, ModuleEntry> = {
  news_ingest: {
    importPath: resolve(import.meta.dir, '../module/news_ingest/index.js'),
    fnName: 'processArticleBatch',
  },
};

// ---------------------------------------------------------------------------
// Scenario file discovery
// ---------------------------------------------------------------------------

function discoverScenarioFiles(tier_: 'primitive' | 'module' | 'all', scenario: string): string[] {
  if (scenario !== 'all') {
    // Direct path to a single scenario file
    const abs = resolve(scenario);
    if (!existsSync(abs)) {
      console.error(`[sandbox] scenario file not found: ${abs}`);
      process.exit(1);
    }
    return [abs];
  }

  const files: string[] = [];

  if (tier_ === 'primitive' || tier_ === 'all') {
    const primDir = resolve(SCENARIOS_ROOT, 'primitives');
    if (existsSync(primDir)) {
      const primitives = readdirSync(primDir);
      for (const prim of primitives) {
        const primPath = resolve(primDir, prim);
        const jsonFiles = readdirSync(primPath).filter((f) => f.endsWith('.json'));
        for (const jf of jsonFiles) {
          files.push(resolve(primPath, jf));
        }
      }
    }
  }

  if (tier_ === 'module' || tier_ === 'all') {
    const modDir = resolve(SCENARIOS_ROOT, 'module');
    if (existsSync(modDir)) {
      const jsonFiles = readdirSync(modDir).filter((f) => f.endsWith('.json'));
      for (const jf of jsonFiles) {
        files.push(resolve(modDir, jf));
      }
    }
  }

  return files;
}

// ---------------------------------------------------------------------------
// Deep equality
// ---------------------------------------------------------------------------

function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a !== typeof b) return false;
  if (a === null || b === null) return false;
  if (typeof a === 'object' && typeof b === 'object') {
    const ka = Object.keys(a as object).sort();
    const kb = Object.keys(b as object).sort();
    if (ka.join(',') !== kb.join(',')) return false;
    return ka.every((k) => deepEqual((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k]));
  }
  return false;
}

// ---------------------------------------------------------------------------
// Scenario execution
// ---------------------------------------------------------------------------

interface ScenarioResult {
  file: string;
  status: 'PASS' | 'FAIL' | 'ERROR';
  primitive?: string;
  module?: string;
  scenarioType?: string;
  diff?: string;
}

async function runPrimitiveScenario(
  scenarioFile: string,
  scenario: Record<string, unknown>,
): Promise<ScenarioResult> {
  const primitiveName = scenario['primitive'] as string;
  const fnName = scenario['function'] as string;
  const input = scenario['input'] as Record<string, unknown>;
  const expectedOutput = scenario['expectedOutput'];

  const entry = PRIMITIVE_REGISTRY[primitiveName];
  if (!entry) {
    return {
      file: scenarioFile,
      status: 'ERROR',
      primitive: primitiveName,
      diff: `No registry entry for primitive: ${primitiveName}`,
    };
  }

  // Dynamic import (Bun resolves .js → .ts automatically in dev mode)
  let mod: Record<string, unknown>;
  try {
    mod = await import(entry.importPath) as Record<string, unknown>;
  } catch (err) {
    return {
      file: scenarioFile,
      status: 'ERROR',
      primitive: primitiveName,
      diff: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const fn = mod[fnName];
  if (typeof fn !== 'function') {
    return {
      file: scenarioFile,
      status: 'ERROR',
      primitive: primitiveName,
      diff: `Function '${fnName}' not found in module`,
    };
  }

  // Call the function — primitives take a single positional arg from input
  // Dispatch by function name to handle different signatures
  let actual: unknown;
  try {
    if (fnName === 'parsePublishedAt') {
      actual = fn((input as { rfcDate: string }).rfcDate);
    } else if (fnName === 'normalizeHeadline') {
      actual = fn((input as { raw: string }).raw);
    } else if (fnName === 'computeArticleKey') {
      actual = fn((input as { article: unknown }).article);
    } else if (fnName === 'isRelevantArticle') {
      const i = input as { headline: string; keywords: string[] };
      actual = fn(i.headline, i.keywords);
    } else {
      // Generic: spread all values as positional args
      actual = fn(...Object.values(input));
    }
  } catch (err) {
    return {
      file: scenarioFile,
      status: 'ERROR',
      primitive: primitiveName,
      scenarioType: scenario['scenarioType'] as string,
      diff: `Runtime error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  if (deepEqual(actual, expectedOutput)) {
    return {
      file: scenarioFile,
      status: 'PASS',
      primitive: primitiveName,
      scenarioType: scenario['scenarioType'] as string,
    };
  }

  return {
    file: scenarioFile,
    status: 'FAIL',
    primitive: primitiveName,
    scenarioType: scenario['scenarioType'] as string,
    diff: `expected: ${JSON.stringify(expectedOutput)} | got: ${JSON.stringify(actual)}`,
  };
}

async function runModuleScenario(
  scenarioFile: string,
  scenario: Record<string, unknown>,
): Promise<ScenarioResult> {
  const moduleName = scenario['module'] as string;
  const fnName = scenario['function'] as string;
  const input = scenario['input'] as Record<string, unknown>;
  const expectedOutput = scenario['expectedOutput'] as Record<string, unknown>;

  const entry = MODULE_REGISTRY[moduleName];
  if (!entry) {
    return {
      file: scenarioFile,
      status: 'ERROR',
      module: moduleName,
      diff: `No registry entry for module: ${moduleName}`,
    };
  }

  let mod: Record<string, unknown>;
  try {
    mod = await import(entry.importPath) as Record<string, unknown>;
  } catch (err) {
    return {
      file: scenarioFile,
      status: 'ERROR',
      module: moduleName,
      diff: `Import failed: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  const fn = mod[fnName];
  if (typeof fn !== 'function') {
    return {
      file: scenarioFile,
      status: 'ERROR',
      module: moduleName,
      diff: `Function '${fnName}' not found in module`,
    };
  }

  let actual: unknown;
  try {
    actual = await (fn as (input: unknown) => Promise<unknown>)(input);
  } catch (err) {
    return {
      file: scenarioFile,
      status: 'ERROR',
      module: moduleName,
      scenarioType: scenario['scenarioType'] as string,
      diff: `Runtime error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Module scenarios use partial-match on expectedOutput keys
  if (actual !== null && typeof actual === 'object') {
    const allMatch = Object.entries(expectedOutput).every(([k, v]) =>
      deepEqual((actual as Record<string, unknown>)[k], v),
    );
    if (allMatch) {
      return {
        file: scenarioFile,
        status: 'PASS',
        module: moduleName,
        scenarioType: scenario['scenarioType'] as string,
      };
    }
    return {
      file: scenarioFile,
      status: 'FAIL',
      module: moduleName,
      scenarioType: scenario['scenarioType'] as string,
      diff: `expected: ${JSON.stringify(expectedOutput)} | got: ${JSON.stringify(actual)}`,
    };
  }

  if (deepEqual(actual, expectedOutput)) {
    return {
      file: scenarioFile,
      status: 'PASS',
      module: moduleName,
      scenarioType: scenario['scenarioType'] as string,
    };
  }

  return {
    file: scenarioFile,
    status: 'FAIL',
    module: moduleName,
    scenarioType: scenario['scenarioType'] as string,
    diff: `expected: ${JSON.stringify(expectedOutput)} | got: ${JSON.stringify(actual)}`,
  };
}

async function runScenario(scenarioFile: string): Promise<ScenarioResult> {
  let scenario: Record<string, unknown>;
  try {
    const raw = readFileSync(scenarioFile, 'utf-8');
    scenario = JSON.parse(raw) as Record<string, unknown>;
  } catch (err) {
    return {
      file: scenarioFile,
      status: 'ERROR',
      diff: `JSON parse error: ${err instanceof Error ? err.message : String(err)}`,
    };
  }

  // Dispatch by scenario type
  if ('primitive' in scenario) {
    return runPrimitiveScenario(scenarioFile, scenario);
  } else if ('module' in scenario) {
    return runModuleScenario(scenarioFile, scenario);
  }

  return {
    file: scenarioFile,
    status: 'ERROR',
    diff: 'Unknown scenario type — missing "primitive" or "module" field',
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

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
    const icon = result.status === 'PASS' ? 'PASS' : result.status === 'FAIL' ? 'FAIL' : 'ERROR';
    const label = result.primitive ?? result.module ?? 'unknown';
    const type = result.scenarioType ? ` [${result.scenarioType}]` : '';
    console.log(`  ${icon}  ${label}${type} — ${result.file.split('/').slice(-3).join('/')}`);
    if (result.diff) {
      console.log(`         ${result.diff}`);
    }
  }

  const passCount = results.filter((r) => r.status === 'PASS').length;
  const failCount = results.filter((r) => r.status === 'FAIL').length;
  const errorCount = results.filter((r) => r.status === 'ERROR').length;

  console.log('');
  console.log(`[sandbox] Result: ${passCount} PASS, ${failCount} FAIL, ${errorCount} ERROR`);

  // Write trace JSON if --output flag provided
  if (outputFlag) {
    const trace = {
      runAt: new Date().toISOString(),
      tier,
      module: module_,
      totals: { pass: passCount, fail: failCount, error: errorCount },
      results: results.map((r) => ({
        file: r.file,
        status: r.status,
        primitive: r.primitive,
        module: r.module,
        scenarioType: r.scenarioType,
        diff: r.diff,
      })),
    };
    const outPath = resolve(outputFlag);
    const outDir = dirname(outPath);
    if (!existsSync(outDir)) {
      mkdirSync(outDir, { recursive: true });
    }
    writeFileSync(outPath, JSON.stringify(trace, null, 2), 'utf-8');
    console.log(`[sandbox] Trace written to: ${outPath}`);

    // Write dashboard/data.js — inline sidecar for file:// rendering.
    // Headless Chromium (and all browsers) block file://→file:// XHR as
    // cross-origin (origin null). A <script src="data.js"> tag is NOT
    // blocked — it loads as a same-directory resource without CORS.
    // index.html reads window.__NEWS_FETCH_DATA__ from this file instead
    // of using XHR. This mirrors the kinh-dich fleet precedent (G9 PASS).
    const dataJsPath = resolve(outDir, 'data.js');
    const dataJsContent =
      '// Generated by sandbox runner — DO NOT EDIT BY HAND.\n' +
      '// Inline sidecar: replaces XHR for file:// compatibility (zero CORS).\n' +
      '// Regenerate: bun run src/sandbox/runner.ts --tier=all --module=news-fetch --scenario=all --output=dashboard/results.json\n' +
      'window.__NEWS_FETCH_DATA__ = ' +
      JSON.stringify(trace, null, 2) +
      ';\n';
    writeFileSync(dataJsPath, dataJsContent, 'utf-8');
    console.log(`[sandbox] Inline sidecar written to: ${dataJsPath}`);
  }

  if (failCount > 0 || errorCount > 0) {
    process.exit(1);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('[sandbox] Unhandled error:', err);
  process.exit(1);
});
