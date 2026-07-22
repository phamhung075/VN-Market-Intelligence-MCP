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
//
// FIX-PROJECT-STATS-CRONJOBCOUNT-SSOT-DRIFT (2026-07-22 cron audit item, LOW):
// The old implementation counted literal `cron.schedule(` occurrences across
// apps/mcp-server/src/scheduler/**/*.ts. That was correct BEFORE the
// T2-ARCH-CRON-RECOVER-JITTER refactor introduced the `scheduleCron()` wrapper
// (startupHelpers.ts) as the ONE place that calls the raw node-cron
// `cron.schedule()` — after that refactor there are only 2 literal
// `cron.schedule(` textual occurrences in the ENTIRE scheduler/ tree (a code
// comment + the wrapper's own single internal call), so the naive regex
// silently collapsed from ~81 to ~2 and nobody noticed because the generator
// had no sanity floor. docs/data/project-stats.json's own `cronJobCount: 2`
// with `lastUpdated: "2026-07-04"` is the live artifact of this drift.
// A second layer of indirection (FACTORY-SCHEDULER-job-table-registry) makes
// even a naive `scheduleCron(` occurrence count wrong too: registerJobTable()
// calls `scheduleCron(j.cron, ...)` ONCE inside a generic loop that iterates
// buildJobTable()'s array at runtime — 61 logical registrations collapse to a
// single textual call site. The correct count is the SUM of:
//   1. buildJobTable() array entries in schedulerJobTable.ts — each is a
//      `name: '...'` object-literal field (table-driven jobs; same detection
//      technique as ARCH-CRON-watchdog.test.ts WD-11's JOB_TABLE_NAME_RE).
//   2. registerBespokeJobs()'s own scheduleCron(...) call sites in
//      schedulerJobTable.ts — these ARE one-to-one with real registrations
//      (no generic loop indirection).
//   3. summaryJobs.ts's scheduleCron(...) call sites (5 period types) — also
//      one-to-one, no indirection.
// This is inherently coupled to the current two-tier (table + bespoke)
// architecture — if it changes again, this function must change with it. The
// MIN_PLAUSIBLE_CRON_COUNT floor below is the structural guard against a
// repeat of THIS EXACT SSOT-drift class: any future refactor that silently
// collapses the count to near-zero fails loud here instead of shipping a
// value nobody double-checks (feedback_ssot_toolcount_drift_after_waves).

const MIN_PLAUSIBLE_CRON_COUNT = 50;

function countLiteralCallsInRange(content: string, pattern: RegExp, startMarker: string, endMarker: string | null): number {
  const startIdx = content.indexOf(startMarker);
  if (startIdx === -1) {
    throw new Error(`[gen-project-stats] countCronJobsFromSource: marker "${startMarker}" not found — architecture drifted, update this generator`);
  }
  const endIdx = endMarker ? content.indexOf(endMarker, startIdx + startMarker.length) : content.length;
  const slice = content.slice(startIdx, endIdx === -1 ? content.length : endIdx);
  const matches = slice.match(pattern);
  return matches ? matches.length : 0;
}

function countCronJobsFromSource(): number {
  const jobTablePath = join(SCHEDULER_DIR, "schedulerJobTable.ts");
  const summaryJobsPath = join(SCHEDULER_DIR, "summaryJobs.ts");

  if (!existsSync(jobTablePath)) {
    throw new Error(`[gen-project-stats] schedulerJobTable.ts not found at ${jobTablePath} — architecture drifted, update this generator`);
  }
  if (!existsSync(summaryJobsPath)) {
    throw new Error(`[gen-project-stats] summaryJobs.ts not found at ${summaryJobsPath} — architecture drifted, update this generator`);
  }

  const jobTableSrc = readFileSync(jobTablePath, "utf-8");
  const summaryJobsSrc = readFileSync(summaryJobsPath, "utf-8");

  // 1. Table-driven jobs: `name: '...'` fields inside buildJobTable()'s returned array.
  const tableDrivenCount = countLiteralCallsInRange(
    jobTableSrc,
    /\bname:\s*['"][^'"]+['"]/g,
    "export function buildJobTable",
    "export function registerJobTable",
  );

  // 2. Bespoke jobs: literal scheduleCron(...) call sites in registerBespokeJobs().
  const bespokeCount = countLiteralCallsInRange(
    jobTableSrc,
    /scheduleCron\s*\(/g,
    "export function registerBespokeJobs",
    null,
  );

  // 3. summaryJobs.ts: literal scheduleCron(...) call sites (5 period types).
  const summaryJobsMatches = summaryJobsSrc.match(/scheduleCron\s*\(/g);
  const summaryJobsCount = summaryJobsMatches ? summaryJobsMatches.length : 0;

  const count = tableDrivenCount + bespokeCount + summaryJobsCount;

  if (count < MIN_PLAUSIBLE_CRON_COUNT) {
    throw new Error(
      `[gen-project-stats] cronJobCount=${count} (table-driven=${tableDrivenCount} + bespoke=${bespokeCount} + ` +
      `summaryJobs=${summaryJobsCount}) is below the sanity floor of ${MIN_PLAUSIBLE_CRON_COUNT} — this is almost ` +
      `certainly a counting-logic bug (see FIX-PROJECT-STATS-CRONJOBCOUNT-SSOT-DRIFT comment above), not a real drop ` +
      `in registered jobs. Aborting rather than writing a silently-wrong value.`
    );
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
