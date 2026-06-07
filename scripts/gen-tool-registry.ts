#!/usr/bin/env bun
/**
 * gen-tool-registry.ts — Generate docs/data/tool-registry.json from source
 *
 * Usage:
 *   bun scripts/gen-tool-registry.ts
 *   bun scripts/gen-tool-registry.ts --dry-run   # print JSON without writing
 *
 * SOURCE OF TRUTH: apps/mcp-server/src/interface/mcp/tools/ (.ts files only, no .bak)
 *
 * Extracts tool names from BOTH registration patterns:
 *   1. server.tool("tool_name", ...)       — standard pattern (161 tools)
 *   2. server.registerTool("tool_name", .) — legacy pattern (1 tool: sequential_market_analysis)
 *
 * Groups tools by source-folder category (parent directory name).
 * Expected totalCount = 162 (as of TOOL-SURFACE-UPGRADE sprint baseline).
 *
 * ATOMIC WRITE: temp file → validate JSON → rename to final path.
 * FAIL LOUD: any unexpected error exits with code 1.
 *
 * OUTPUT: docs/data/tool-registry.json
 *   _maintained_by: "generator (do not hand-edit)"
 *   lastUpdated: ISO timestamp
 *   totalCount: N
 *   groups[]: { name, tools[], count }
 */

import {
  readdirSync,
  readFileSync,
  writeFileSync,
  renameSync,
  unlinkSync,
  existsSync,
} from "node:fs";
import { join, resolve, relative, dirname, basename } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Paths ────────────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const TOOLS_DIR = join(PROJECT_ROOT, "apps/mcp-server/src/interface/mcp/tools");
const OUTPUT_PATH = join(PROJECT_ROOT, "docs/data/tool-registry.json");
const TEMP_PATH = OUTPUT_PATH + ".tmp";

// ─── Regex patterns ───────────────────────────────────────────────────────────
// Matches both:
//   server.tool("name",       — standard SDK pattern
//   server.registerTool("name", — legacy pattern used by sequential-market-analysis.ts
//
// The pattern allows optional whitespace/newline between ( and " to handle
// multi-line call sites.

const TOOL_PATTERNS = [
  /server\.tool\s*\(\s*\n?\s*["']([^"']+)["']/g,
  /server\.registerTool\s*\(\s*\n?\s*["']([^"']+)["']/g,
];

// ─── Extraction ───────────────────────────────────────────────────────────────

export interface ToolFileEntry {
  file: string;       // relative path from project root
  category: string;   // parent directory name (e.g. "market-data", "sector")
  tools: string[];    // tool names found in this file
}

/**
 * Extract all tool names from a single TypeScript file content.
 * Returns unique names only (duplicate within a file = fail loud).
 */
export function extractToolNamesFromContent(
  content: string,
  filePath: string
): string[] {
  const names = new Set<string>();

  for (const pattern of TOOL_PATTERNS) {
    // Reset lastIndex before each use (global regex)
    pattern.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const name = match[1];
      if (!name) {
        throw new Error(
          `[gen-tool-registry] Empty tool name matched in ${filePath} — check regex`
        );
      }
      names.add(name);
    }
  }

  return Array.from(names).sort();
}

/**
 * Determine the category label for a file.
 * Uses the immediate parent directory name relative to TOOLS_DIR.
 * For files at the root of TOOLS_DIR (registry.ts, index.ts), use "root".
 * For files in nested subdirs (e.g. sector/cross-cutting/), uses the
 * first-level subdirectory under TOOLS_DIR (e.g. "sector").
 */
export function getCategoryForFile(filePath: string, toolsDir: string): string {
  const rel = relative(toolsDir, filePath); // e.g. "sector/correlationTools.ts"
  const parts = rel.split("/");
  if (parts.length <= 1) {
    // File is directly under TOOLS_DIR (e.g. registry.ts)
    return "root";
  }
  // First segment = top-level category folder
  return parts[0];
}

/**
 * Recursively scan TOOLS_DIR for .ts files (no .bak, no .test.ts).
 * Returns one entry per file that contains at least one tool registration.
 */
export function scanToolsDir(toolsDir: string): ToolFileEntry[] {
  if (!existsSync(toolsDir)) {
    throw new Error(
      `[gen-tool-registry] TOOLS_DIR not found: ${toolsDir}`
    );
  }

  const results: ToolFileEntry[] = [];

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory() && !entry.name.startsWith(".")) {
        walk(fullPath);
      } else if (
        entry.isFile() &&
        entry.name.endsWith(".ts") &&
        !entry.name.endsWith(".bak") &&
        !entry.name.endsWith(".test.ts")
      ) {
        const content = readFileSync(fullPath, "utf-8");
        const tools = extractToolNamesFromContent(content, fullPath);
        if (tools.length > 0) {
          results.push({
            file: relative(PROJECT_ROOT, fullPath),
            category: getCategoryForFile(fullPath, toolsDir),
            tools,
          });
        }
      }
    }
  }

  walk(toolsDir);
  return results;
}

// ─── Registry generation ─────────────────────────────────────────────────────

export interface ToolGroup {
  name: string;
  count: number;
  tools: string[];
}

export interface ToolRegistry {
  _maintained_by: string;
  lastUpdated: string;
  totalCount: number;
  groups: ToolGroup[];
}

export function buildRegistry(entries: ToolFileEntry[]): ToolRegistry {
  // Accumulate tools per category — use Set to deduplicate across files in same category
  const groupMap = new Map<string, Set<string>>();

  for (const entry of entries) {
    const existing = groupMap.get(entry.category) ?? new Set<string>();
    for (const tool of entry.tools) {
      if (existing.has(tool)) {
        // Cross-file duplicate = duplicate registration = MCP server will crash
        throw new Error(
          `[gen-tool-registry] Duplicate tool name "${tool}" in category "${entry.category}" ` +
            `(file: ${entry.file}) — fix the source`
        );
      }
      existing.add(tool);
    }
    groupMap.set(entry.category, existing);
  }

  // Sort categories alphabetically for stable output
  const sortedCategories = Array.from(groupMap.keys()).sort();
  const groups: ToolGroup[] = sortedCategories.map((name) => {
    const toolSet = groupMap.get(name)!;
    const tools = Array.from(toolSet).sort();
    return { name, count: tools.length, tools };
  });

  const totalCount = groups.reduce((sum, g) => sum + g.count, 0);

  return {
    _maintained_by: "generator (do not hand-edit)",
    lastUpdated: new Date().toISOString(),
    totalCount,
    groups,
  };
}

// ─── Main ────────────────────────────────────────────────────────────────────

function main(): void {
  console.log("[gen-tool-registry] Scanning source...");

  const entries = scanToolsDir(TOOLS_DIR);
  const registry = buildRegistry(entries);

  console.log(`[gen-tool-registry] totalCount=${registry.totalCount}  groups=${registry.groups.length}`);

  for (const g of registry.groups) {
    console.log(`  ${g.name}: ${g.count} tools`);
  }

  const json = JSON.stringify(registry, null, 2) + "\n";

  if (DRY_RUN) {
    console.log("[gen-tool-registry] DRY RUN — would write:");
    console.log(json);
    return;
  }

  // Atomic write: temp → validate → rename
  writeFileSync(TEMP_PATH, json, "utf-8");

  // Validate: parse the temp file before promoting
  let parsed: ToolRegistry;
  try {
    parsed = JSON.parse(readFileSync(TEMP_PATH, "utf-8")) as ToolRegistry;
  } catch (err) {
    unlinkSync(TEMP_PATH);
    throw new Error(
      `[gen-tool-registry] Temp file failed JSON validation — aborting: ` +
        `${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Sanity-check written values
  if (parsed.totalCount !== registry.totalCount) {
    unlinkSync(TEMP_PATH);
    throw new Error(
      `[gen-tool-registry] Post-write validation mismatch: totalCount=${parsed.totalCount} ` +
        `(expected ${registry.totalCount}) — aborting`
    );
  }

  renameSync(TEMP_PATH, OUTPUT_PATH);
  console.log(`[gen-tool-registry] Written: ${OUTPUT_PATH}`);
  console.log(`[gen-tool-registry] totalCount=${registry.totalCount}  done.`);
}

main();
