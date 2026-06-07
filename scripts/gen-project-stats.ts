#!/usr/bin/env bun
/**
 * gen-project-stats.ts — Generate docs/data/project-stats.json from source of truth
 *
 * Usage:
 *   bun scripts/gen-project-stats.ts
 *   bun scripts/gen-project-stats.ts --dry-run   # print JSON without writing
 *
 * Invoked automatically by:
 *   - scripts/test-all.sh (post-test hook, optional — see comment there)
 *
 * TOOL COUNT — source of truth: apps/mcp-server/src/interface/mcp/tools/ (.ts files only)
 *   Counts unique tool name strings in server.tool("name", ...) and
 *   server.registerTool("name", ...) calls. This matches what the live /health
 *   endpoint reports via the probe-server technique (toolRegistry → _registeredTools map).
 *
 * CRON JOB COUNT — source of truth: grep cron.schedule across
 *   apps/mcp-server/src/scheduler/**\/*.ts
 *   Counts ALL active cron.schedule() call-sites, including those in
 *   summaryJobs.ts (called from startScheduler.registerSummaryJobs).
 *
 * FAIL LOUD: any unexpected error exits with code 1.
 * Atomic write: temp file → validate JSON → rename to final path.
 */

import { readdirSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";

const DRY_RUN = process.argv.includes("--dry-run");

// ─── Project root ────────────────────────────────────────────────────────────

const PROJECT_ROOT = resolve(import.meta.dir, "..");
const TOOLS_DIR = join(PROJECT_ROOT, "apps/mcp-server/src/interface/mcp/tools");
const SCHEDULER_DIR = join(PROJECT_ROOT, "apps/mcp-server/src/scheduler");
const OUTPUT_PATH = join(PROJECT_ROOT, "docs/data/project-stats.json");
const TEMP_PATH = OUTPUT_PATH + ".tmp";
const REGISTRY_PATH = join(PROJECT_ROOT, "docs/data/tool-registry.json");

// ─── Tool count (source: tools/ .ts files) ───────────────────────────────────

function countToolsFromSource(): number {
  const toolNames = new Set<string>();

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".bak")) {
        const content = readFileSync(fullPath, "utf-8");
        // Match: server.tool( or server.registerTool( followed by optional whitespace/newline then "tool_name"
        const matches = content.matchAll(/server\.(registerTool|tool)\(\s*\n?\s*"([^"]+)"/g);
        for (const m of matches) {
          const name = m[2];
          if (!name) {
            throw new Error(`[gen-project-stats] Matched empty tool name in ${fullPath} — check regex`);
          }
          if (toolNames.has(name)) {
            // Fail loud: duplicate tool names will break the MCP server at startup
            throw new Error(
              `[gen-project-stats] Duplicate tool name "${name}" detected in ${fullPath}. ` +
              "The MCP SDK will throw 'Tool already registered' at startup. Fix the source before generating stats."
            );
          }
          toolNames.add(name);
        }
      }
    }
  }

  if (!existsSync(TOOLS_DIR)) {
    throw new Error(`[gen-project-stats] TOOLS_DIR not found: ${TOOLS_DIR}`);
  }

  walk(TOOLS_DIR);

  if (toolNames.size === 0) {
    throw new Error(`[gen-project-stats] Zero tools found in ${TOOLS_DIR} — this is wrong, aborting`);
  }

  return toolNames.size;
}

// ─── Cron job count (source: scheduler/ .ts files) ───────────────────────────

function countCronJobsFromSource(): number {
  let count = 0;

  function walk(dir: string): void {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
      } else if (entry.isFile() && entry.name.endsWith(".ts") && !entry.name.endsWith(".bak")) {
        const content = readFileSync(fullPath, "utf-8");
        // Count ALL occurrences of cron.schedule in the file
        const matches = content.match(/cron\.schedule\s*\(/g);
        if (matches) {
          count += matches.length;
        }
      }
    }
  }

  if (!existsSync(SCHEDULER_DIR)) {
    throw new Error(`[gen-project-stats] SCHEDULER_DIR not found: ${SCHEDULER_DIR}`);
  }

  walk(SCHEDULER_DIR);

  if (count === 0) {
    throw new Error(`[gen-project-stats] Zero cron jobs found in ${SCHEDULER_DIR} — this is wrong, aborting`);
  }

  return count;
}

// ─── Read existing stats (to preserve non-generated fields) ──────────────────

function readExistingStats(): Record<string, unknown> {
  if (!existsSync(OUTPUT_PATH)) {
    return {};
  }
  try {
    const raw = readFileSync(OUTPUT_PATH, "utf-8");
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return parsed;
  } catch (err) {
    throw new Error(
      `[gen-project-stats] Failed to parse existing ${OUTPUT_PATH}: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

/**
 * Read toolCount from docs/data/tool-registry.json (the SSOT generated by
 * scripts/gen-tool-registry.ts). Falls back to source extraction if the
 * registry file does not exist yet.
 *
 * AC-U2-8: gen-project-stats syncs toolCount FROM registry — registry is
 * the single source of truth for the tool count.
 */
function readToolCountFromRegistry(): number | null {
  if (!existsSync(REGISTRY_PATH)) return null;
  try {
    const raw = readFileSync(REGISTRY_PATH, "utf-8");
    const parsed = JSON.parse(raw) as { totalCount?: number };
    return typeof parsed.totalCount === "number" ? parsed.totalCount : null;
  } catch {
    return null;
  }
}

function main(): void {
  console.log("[gen-project-stats] Scanning source...");

  const sourceToolCount = countToolsFromSource();
  const registryCount = readToolCountFromRegistry();

  // Use registry as primary source (SSOT); fall back to source scan.
  // Warn if registry exists but disagrees with source (stale registry).
  let toolCount: number;
  if (registryCount !== null) {
    if (registryCount !== sourceToolCount) {
      console.warn(
        `[gen-project-stats] WARNING: registry.totalCount=${registryCount} ` +
          `but source scan found ${sourceToolCount} — registry is stale. ` +
          `Run: bun scripts/gen-tool-registry.ts to regenerate.`
      );
    }
    toolCount = registryCount;
  } else {
    toolCount = sourceToolCount;
  }

  const cronJobCount = countCronJobsFromSource();

  console.log(`[gen-project-stats] toolCount=${toolCount}  cronJobCount=${cronJobCount}`);

  const existing = readExistingStats();
  const now = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  // Merge: preserve all non-generated fields; overwrite generated fields
  const updated: Record<string, unknown> = {
    ...existing,
    _generated_by: "bun scripts/gen-project-stats.ts",
    _generation_command: "bun scripts/gen-project-stats.ts",
    _generation_note:
      "toolCount = server.tool() + server.registerTool() unique names in apps/mcp-server/src/interface/mcp/tools/**/*.ts. " +
      "cronJobCount = cron.schedule() call-sites in apps/mcp-server/src/scheduler/**/*.ts (all files, including summaryJobs.ts).",
    _maintained_by: "generator (do not hand-edit toolCount or cronJobCount)",
    lastUpdated: now,
    toolCount,
    cronJobCount,
    // Keep infrastructureStatus.toolCount in sync
    infrastructureStatus: {
      ...(typeof existing.infrastructureStatus === "object" && existing.infrastructureStatus !== null
        ? (existing.infrastructureStatus as Record<string, unknown>)
        : {}),
      toolCount,
      lastUpdated: now,
    },
  };

  const json = JSON.stringify(updated, null, 2) + "\n";

  if (DRY_RUN) {
    console.log("[gen-project-stats] DRY RUN — would write:");
    console.log(json);
    return;
  }

  // Atomic write: temp → validate → rename
  writeFileSync(TEMP_PATH, json, "utf-8");

  // Validate: parse the temp file before promoting
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(TEMP_PATH, "utf-8"));
  } catch (err) {
    unlinkSync(TEMP_PATH);
    throw new Error(
      `[gen-project-stats] Temp file failed JSON validation — aborting (temp removed): ` +
      `${err instanceof Error ? err.message : String(err)}`
    );
  }

  // Sanity-check the written values
  const written = parsed as Record<string, unknown>;
  if (written.toolCount !== toolCount || written.cronJobCount !== cronJobCount) {
    unlinkSync(TEMP_PATH);
    throw new Error(
      `[gen-project-stats] Post-write validation mismatch: toolCount=${written.toolCount} (expected ${toolCount}), ` +
      `cronJobCount=${written.cronJobCount} (expected ${cronJobCount}) — aborting`
    );
  }

  renameSync(TEMP_PATH, OUTPUT_PATH);
  console.log(`[gen-project-stats] Written: ${OUTPUT_PATH}`);
  console.log(`[gen-project-stats] toolCount=${toolCount}  cronJobCount=${cronJobCount}  done.`);
}

main();
