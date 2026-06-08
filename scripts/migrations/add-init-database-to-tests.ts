#!/usr/bin/env bun
/**
 * CANONICAL SCRIPT: scripts/migrations/add-init-database-to-tests.ts
 *
 * Sprint CI-BUN-TEST-MULTI-CLASS-FIX / B2-RAG-DDL-INITNEWSTABLES
 *
 * Sweeps inline test-setup DDL files and injects targeted schema-guard calls
 * AFTER existing inline DDL.
 *
 * Why targeted guards instead of full initDatabase?
 *   Full initDatabase calls initFinancialReportsTables which runs SSOT DDL
 *   including views (v_chart_timeseries, v_yoy_comparison) that reference
 *   period_quarter. Many test inline DDLs create financial_reports without
 *   period_quarter, which causes SQLiteError on view creation.
 *
 *   Instead we inject only the three safe guards:
 *     initNewsTables(db)       — adds data_env + body_text to rag_analyses (guarded ALTER)
 *     initMarketDataTables(db) — adds data_env to daily_ohlcv (guarded ALTER)
 *     initSystemTables(db)     — creates cron_job_runs, signal_quality_audit etc.
 *
 *   All three are safe (CREATE TABLE IF NOT EXISTS + guarded ALTER TABLE only,
 *   no views, no backfills, no external file reads).
 *
 * Placement strategy:
 *   1. For `function setupXxx(): Database { ... return db; }` pattern:
 *      Inject three calls just BEFORE `return varName;`
 *   2. For `beforeEach(() => { db = new Database(...); db.exec(...); })`  pattern:
 *      Inject after the last `db.exec(...)` block (before closing `})`)
 *   3. Fallback: inject directly after `new Database(":memory:")` line
 *
 * Skip guard:
 *   Files that already import from schema-news.js / schema-market-data.js /
 *   schema-system.js OR call initNewsTables/initMarketDataTables/initSystemTables
 *   are skipped as already-handled.
 *
 * Usage:
 *   bun scripts/migrations/add-init-database-to-tests.ts [--dry-run]
 *   bun scripts/migrations/add-init-database-to-tests.ts --file <path>
 *
 * Owner: dev-mcp-server
 * Sprint: CI-BUN-TEST-MULTI-CLASS-FIX B2-RAG-DDL-INITNEWSTABLES
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const args = process.argv.slice(2);
const DRY_RUN = args.includes("--dry-run");
const SINGLE_FILE = args.includes("--file") ? args[args.indexOf("--file") + 1] : null;

const IMPORT_LINE = `import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";`;

const INJECT_CALLS = (indent: string, dbVar: string): string =>
  `${indent}initNewsTables(${dbVar});\n${indent}initMarketDataTables(${dbVar});\n${indent}initSystemTables(${dbVar});`;

function alreadyHasGuards(content: string): boolean {
  // Check non-comment lines only — avoid matching initDatabase() mentioned in comments.
  // Strategy: filter out lines that start with // or * (JSDoc/block comment lines).
  const executableLines = content
    .split("\n")
    .filter((l) => {
      const trimmed = l.trim();
      return !trimmed.startsWith("//") && !trimmed.startsWith("*") && !trimmed.startsWith("/*");
    })
    .join("\n");

  return (
    executableLines.includes("initNewsTables(") ||
    executableLines.includes("initMarketDataTables(") ||
    executableLines.includes("initSystemTables(") ||
    executableLines.includes("initDatabase(") ||
    executableLines.includes('from "../infrastructure/db/schema-news.js"') ||
    executableLines.includes('from "../infrastructure/db/schema-market-data.js"') ||
    executableLines.includes('from "../infrastructure/db/schema-system.js"')
  );
}

function transformFile(filePath: string): { changed: boolean; reason: string } {
  let content: string;
  try {
    content = readFileSync(filePath, "utf8");
  } catch (e) {
    return { changed: false, reason: `read error: ${e}` };
  }

  // ── Skip if guards already present ────────────────────────────────────────
  if (alreadyHasGuards(content)) {
    return { changed: false, reason: "no changes needed" };
  }

  // ── Skip if no :memory: database usage (not a test with inline DB) ────────
  if (!content.includes(":memory:")) {
    return { changed: false, reason: "no changes needed" };
  }

  const original = content;

  // ── Step 1: Add imports if not already present ────────────────────────────
  {
    const lines = content.split("\n");
    let insertAt = -1;

    // Find last ES import statement
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]!;
      if (line.startsWith("import ") && line.includes(" from ")) {
        insertAt = i;
      }
    }

    // Fallback: after Bun.env line or at top
    if (insertAt === -1) {
      for (let i = 0; i < Math.min(lines.length, 10); i++) {
        if (lines[i]!.includes("Bun.env[")) {
          insertAt = i;
          break;
        }
      }
    }
    if (insertAt === -1) insertAt = 0;

    lines.splice(insertAt + 1, 0, IMPORT_LINE);
    content = lines.join("\n");
  }

  // ── Step 2: Inject guard calls after inline DDL ───────────────────────────
  //
  // Strategy A (preferred): find `return <dbVar>;` in setup functions and inject
  //   guard calls immediately before it. This ensures inline DDL runs first.
  //
  // Strategy B (fallback for beforeEach without return): inject after
  //   `new Database(":memory:")` assignment for vars that never appear in `return`.

  const lines3 = content.split("\n");
  const out: string[] = [];

  // Track db vars seen via new Database(":memory:")
  const activeDbVars = new Set<string>();

  for (let i = 0; i < lines3.length; i++) {
    const line = lines3[i]!;

    // Track new Database(":memory:") assignments
    const memMatch = line.match(
      /^(\s*)(?:(?:const|let|var)\s+)?(\w+)\s*=\s*new\s+(?:Database|BunDatabase)\(["']:memory:["']\)/
    );
    if (memMatch) {
      const varName = memMatch[2]!;
      activeDbVars.add(varName);
    }

    // Check for `return <dbVar>;` pattern — inject BEFORE it (Strategy A)
    let injected = false;
    for (const dbVar of activeDbVars) {
      const returnPattern = new RegExp(`^(\\s*)return\\s+${dbVar}\\s*;\\s*$`);
      const returnMatch = line.match(returnPattern);
      if (returnMatch) {
        const indent = returnMatch[1]!;
        // Only inject if previous line doesn't already call guard
        const prevLine = out[out.length - 1] ?? "";
        if (!prevLine.includes("initNewsTables(") && !prevLine.includes("initSystemTables(")) {
          out.push(INJECT_CALLS(indent, dbVar));
        }
        injected = true;
        // Clear this var since we've handled it
        activeDbVars.delete(dbVar);
        break;
      }
    }

    out.push(line);
  }

  content = out.join("\n");

  // ── Step 3: Handle beforeEach patterns (db var set, no return) ────────────
  // Remaining activeDbVars are beforeEach-style (no `return db`).
  // Inject AFTER `new Database(":memory:")` line.

  if (activeDbVars.size > 0) {
    const lines4 = content.split("\n");
    const out2: string[] = [];

    for (let i = 0; i < lines4.length; i++) {
      const line = lines4[i]!;

      let injectedAfterNew = false;
      for (const dbVar of activeDbVars) {
        const newDbPattern = new RegExp(
          `^(\\s*)(?:(?:const|let|var)\\s+)?${dbVar}\\s*=\\s*new\\s+(?:Database|BunDatabase)\\(["']:memory:["']\\)`
        );
        if (line.match(newDbPattern)) {
          const indent = line.match(/^(\s*)/)?.[1] ?? "";
          out2.push(line);
          // Check next line
          const nextLine = lines4[i + 1] ?? "";
          if (!nextLine.includes("initNewsTables(") && !nextLine.includes("initSystemTables(")) {
            out2.push(INJECT_CALLS(indent, dbVar));
          }
          injectedAfterNew = true;
          break;
        }
      }

      if (!injectedAfterNew) {
        out2.push(line);
      }
    }

    content = out2.join("\n");
  }

  if (content === original) {
    return { changed: false, reason: "no changes needed" };
  }

  if (!DRY_RUN) {
    writeFileSync(filePath, content, "utf8");
  }

  return { changed: true, reason: "added schema guard calls" };
}

async function main() {
  let files: string[];

  if (SINGLE_FILE) {
    files = [resolve(SINGLE_FILE)];
  } else {
    // Find all .test.ts files under apps/mcp-server/src/__tests__/
    const { execSync } = await import("node:child_process");
    const raw = execSync(
      "find apps/mcp-server/src/__tests__ -name '*.test.ts' -not -name '*.js'",
      { encoding: "utf8" }
    );
    files = raw.trim().split("\n").filter(Boolean).map((f) => resolve(f));
  }

  let changed = 0;
  let unchanged = 0;
  let errors = 0;

  for (const file of files) {
    const result = transformFile(file);
    if (result.changed) {
      changed++;
      if (!DRY_RUN || changed <= 20) {
        console.log(`CHANGED: ${file.split("/").slice(-1)[0]}`);
      }
    } else if (result.reason === "no changes needed") {
      unchanged++;
    } else {
      errors++;
      console.error(`ERROR: ${file}: ${result.reason}`);
    }
  }

  if (changed > 20 && DRY_RUN) {
    console.log(`... (${changed - 20} more)`);
  }

  console.log(`\n=== Summary ===`);
  console.log(`Changed:   ${changed}`);
  console.log(`Unchanged: ${unchanged}`);
  console.log(`Errors:    ${errors}`);
  if (DRY_RUN) console.log(`(DRY RUN — no files written)`);
}

main().catch(console.error);
