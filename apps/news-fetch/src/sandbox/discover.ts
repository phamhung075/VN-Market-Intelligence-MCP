/**
 * news-fetch Sandbox — scenario file discovery
 *
 * Project root / scenarios root resolved relative to this file's own
 * directory (same `src/sandbox/` dir as runner.ts — import.meta.dir
 * resolution preserved post-split, FACTORY-NEWS-split-sandbox). Walks
 * docs/scenarios/news-fetch for primitive + module scenario JSON files.
 */

import { readdirSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';

const PROJECT_ROOT = resolve(import.meta.dir, '../../../..');
const SCENARIOS_ROOT = resolve(PROJECT_ROOT, 'docs/scenarios/news-fetch');

export function discoverScenarioFiles(
  tier_: 'primitive' | 'module' | 'all',
  scenario: string,
): string[] {
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
