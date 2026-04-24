/**
 * @vn-market/shared-config
 *
 * Loader for mcp.config.json — the single configuration source
 * shared across all VN Market Intelligence services.
 *
 * Usage (TypeScript/Bun):
 *   import { loadMcpConfig, getMcpConfig } from "@vn-market/shared-config";
 *   const config = loadMcpConfig(); // reads mcp.config.json from CWD
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export interface McpConfig {
  server: {
    port: number;
    host: string;
    name: string;
    version: string;
    logLevel: string;
  };
  logging: {
    maxFileSizeMb: number;
    lancedbLevel: string;
  };
  data: {
    dbPath: string;
    lancedbPath: string;
    briefingsDir: string;
    reportsDir: string;
  };
  embedding: {
    model: string;
    cacheDir: string;
    dimensions: number;
    maxTextLength: number;
  };
  alerts?: Record<string, unknown>;
  alertQuality?: Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * Load mcp.config.json from the given directory (defaults to process.cwd()).
 * Throws if the file is missing or invalid JSON.
 */
export function loadMcpConfig(baseDir: string = process.cwd()): McpConfig {
  const configPath = resolve(baseDir, "mcp.config.json");
  if (!existsSync(configPath)) {
    throw new Error(`mcp.config.json not found at: ${configPath}`);
  }
  const raw = readFileSync(configPath, "utf-8");
  return JSON.parse(raw) as McpConfig;
}

/**
 * Lazy singleton — loads config once on first call.
 * Services should call this at startup, not in hot paths.
 */
let _cached: McpConfig | null = null;

export function getMcpConfig(): McpConfig {
  if (!_cached) {
    _cached = loadMcpConfig();
  }
  return _cached;
}

/** Clear cache (useful in tests). */
export function resetMcpConfigCache(): void {
  _cached = null;
}
