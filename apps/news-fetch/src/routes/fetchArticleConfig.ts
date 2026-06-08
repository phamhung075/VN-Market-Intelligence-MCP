/**
 * fetchArticleConfig — SSRF allowlist loader
 *
 * Loads deepFetch.playwrightAllowedDomains from mcp.config.json at the
 * project root. Never hardcodes the list.
 *
 * Resolution order for mcp.config.json path:
 *   1. MCP_CONFIG_PATH env var (absolute or relative to cwd)
 *   2. Walk up from __dirname to find the project root (contains mcp.config.json)
 *   3. Fallback: process.cwd() + /mcp.config.json
 *
 * The Set is cached after first load. Call loadAllowedDomains() on every request —
 * the cache ensures there is no per-request I/O.
 *
 * DDD: interface layer — infrastructure detail for the fetchArticle route only.
 *
 * NOTE: www. prefix is stripped from URL hostnames before the Set lookup so
 *       both "reuters.com" and "www.reuters.com" match allowlisted "reuters.com".
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

interface McpConfig {
  deepFetch?: {
    playwrightAllowedDomains?: string[];
  };
}

let _cachedDomains: Set<string> | null = null;

/**
 * Return the cached SSRF allowlist Set.
 * Loads + caches mcp.config.json on first call; subsequent calls return the cache.
 */
export function loadAllowedDomains(): Set<string> {
  if (_cachedDomains !== null) return _cachedDomains;
  _cachedDomains = buildAllowedSet();
  return _cachedDomains;
}

/**
 * Invalidate the cache (used only in tests to reset between cases).
 */
export function resetAllowedDomainsCache(): void {
  _cachedDomains = null;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function buildAllowedSet(): Set<string> {
  const configPath = resolveConfigPath();
  if (!configPath) {
    console.error('[fetchArticleConfig] mcp.config.json not found — SSRF allowlist will be EMPTY (all domains blocked)');
    return new Set<string>();
  }

  let raw: string;
  try {
    raw = readFileSync(configPath, 'utf-8');
  } catch (err) {
    console.error(`[fetchArticleConfig] failed to read ${configPath}: ${String(err)}`);
    return new Set<string>();
  }

  let cfg: McpConfig;
  try {
    cfg = JSON.parse(raw) as McpConfig;
  } catch (err) {
    console.error(`[fetchArticleConfig] failed to parse ${configPath}: ${String(err)}`);
    return new Set<string>();
  }

  const domains = cfg?.deepFetch?.playwrightAllowedDomains;
  if (!Array.isArray(domains) || domains.length === 0) {
    console.warn('[fetchArticleConfig] deepFetch.playwrightAllowedDomains missing or empty in mcp.config.json — SSRF allowlist EMPTY');
    return new Set<string>();
  }

  // Normalize: strip www. prefix so rules are domain-level, not host-level
  const normalised = domains.map((d) => d.replace(/^www\./, '').toLowerCase());
  console.info(`[fetchArticleConfig] SSRF allowlist loaded (${normalised.length} domains): ${normalised.join(', ')}`);
  return new Set<string>(normalised);
}

function resolveConfigPath(): string | null {
  // 1. Explicit env override
  const envPath = process.env['MCP_CONFIG_PATH'];
  if (envPath) {
    const abs = resolve(envPath);
    if (existsSync(abs)) return abs;
  }

  // 2. Walk up from this file's directory to find project root
  try {
    const __filename = fileURLToPath(import.meta.url);
    let dir = dirname(__filename);
    for (let i = 0; i < 10; i++) {
      const candidate = join(dir, 'mcp.config.json');
      if (existsSync(candidate)) return candidate;
      const parent = dirname(dir);
      if (parent === dir) break; // reached filesystem root
      dir = parent;
    }
  } catch {
    // import.meta.url not available in some test environments — fall through
  }

  // 3. process.cwd() fallback
  const cwdCandidate = join(process.cwd(), 'mcp.config.json');
  if (existsSync(cwdCandidate)) return cwdCandidate;

  return null;
}
