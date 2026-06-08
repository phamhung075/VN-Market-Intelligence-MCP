Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 1102 — get_cron_health MCP tool
 *
 * Tests cover:
 *   - get_cron_health() with data returns job summaries with expected fields
 *   - get_cron_health() with empty DB returns no-data message
 *   - get_cron_health({ job_name }) returns only the requested job
 *   - get_cron_health({ days: 1 }) filters to the last 24h
 *   - registers exactly 1 tool: get_cron_health
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerCronHealthTools } from "../interface/mcp/tools/alerts/cronHealthTools.js";
import {
  insertCronJobRunStart,
  updateCronJobRunEnd,
} from "../infrastructure/db/cronJobRunStore.js";

// ─── In-memory DB helper ───────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT    NOT NULL,
      started_at   TEXT    NOT NULL DEFAULT (datetime('now')),
      finished_at  TEXT,
      status       TEXT    NOT NULL DEFAULT 'running'
        CHECK(status IN ('running','success','error')),
      rows_written INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    );
  `);
  return db;
}

// ─── Tool call helper ──────────────────────────────────────────────────────

async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const registry = (server as unknown as {
    _registeredTools: Record<string, {
      handler: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;

  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler(args) as Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}

function firstText(result: { content: Array<{ type: string; text: string }> }): string {
  const item = result.content[0];
  if (!item) throw new Error("No content item in tool result");
  return item.text;
}

// ─── Seed helpers ──────────────────────────────────────────────────────────

/** Insert a completed success run for a job. */
function seedSuccessRun(db: Database, jobName: string, durationMs = 500): void {
  const id = insertCronJobRunStart(db, jobName);
  updateCronJobRunEnd(db, id, "success", 10, null, durationMs);
}

/** Insert a completed error run for a job. */
function seedErrorRun(db: Database, jobName: string, errorMsg = "timeout"): void {
  const id = insertCronJobRunStart(db, jobName);
  updateCronJobRunEnd(db, id, "error", null, errorMsg, 1200);
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1102 — get_cron_health MCP tool", () => {
  let db: Database;
  let server: McpServer;

  beforeEach(() => {
    db = makeDb();
    server = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerCronHealthTools(server, db);
  });

  // ── registers exactly 1 tool ──────────────────────────────────────────────

  it("registers exactly 1 tool: get_cron_health", () => {
    const freshServer = new McpServer(
      { name: "test", version: "0.0.1" },
      { capabilities: { tools: {} } },
    );
    registerCronHealthTools(freshServer, db);
    const tools = (freshServer as unknown as {
      _registeredTools: Record<string, unknown>;
    })._registeredTools;
    expect(Object.keys(tools)).toContain("get_cron_health");
    expect(Object.keys(tools)).toHaveLength(1);
  });

  // ── empty DB ──────────────────────────────────────────────────────────────

  it("returns no-data message when DB is empty", async () => {
    const result = await callTool(server, "get_cron_health", {});
    const text = firstText(result);
    // Should indicate no data — either "no data" / "(none)" / empty list text
    expect(text.toLowerCase()).toMatch(/no data|no cron|none|0 jobs|empty/);
  });

  // ── with data — fields present ────────────────────────────────────────────

  it("returns health summary with required fields when jobs have run", async () => {
    seedSuccessRun(db, "pollNewsJob", 400);
    seedSuccessRun(db, "pollNewsJob", 600);
    seedErrorRun(db, "pollNewsJob");

    const result = await callTool(server, "get_cron_health", {});
    const text = firstText(result);

    expect(text).toContain("pollNewsJob");
    // success_rate or equivalent
    expect(text).toMatch(/success_rate|success rate/i);
    // total_runs
    expect(text).toMatch(/total_runs|total runs|3/i);
    // avg_duration
    expect(text).toMatch(/avg_duration|avg duration/i);
    // last_status
    expect(text).toMatch(/last_status|last status/i);
  });

  // ── success_rate value ────────────────────────────────────────────────────

  it("calculates correct success_rate (2 success / 3 total = 0.67)", async () => {
    seedSuccessRun(db, "marketScanJob");
    seedSuccessRun(db, "marketScanJob");
    seedErrorRun(db, "marketScanJob");

    const result = await callTool(server, "get_cron_health", {});
    const text = firstText(result);

    // success_rate_7d ≈ 0.67 or 66.7%
    expect(text).toMatch(/0\.6[67]|66\.?[67]?%/);
  });

  // ── job_name filter ────────────────────────────────────────────────────────

  it("filters to specific job when job_name is provided", async () => {
    seedSuccessRun(db, "pollNewsJob");
    seedSuccessRun(db, "marketScanJob");

    const result = await callTool(server, "get_cron_health", {
      job_name: "pollNewsJob",
    });
    const text = firstText(result);

    expect(text).toContain("pollNewsJob");
    expect(text).not.toContain("marketScanJob");
  });

  // ── days filter ────────────────────────────────────────────────────────────

  it("returns no data when days=1 and all runs are older than 24h", async () => {
    // Insert runs with started_at forced to 2 days ago
    db.exec(
      `INSERT INTO cron_job_runs (job_name, started_at, finished_at, status, duration_ms)
       VALUES ('oldJob', datetime('now', '-2 days'), datetime('now', '-2 days'), 'success', 100)`,
    );

    const result = await callTool(server, "get_cron_health", { days: 1 });
    const text = firstText(result);

    // Either no mention of 'oldJob' or explicit no-data message
    const hasOldJob = text.includes("oldJob");
    const hasNoData = /no data|no cron|none|0 jobs|empty/i.test(text);
    expect(hasOldJob || hasNoData).toBe(true);
    // Specifically: if it does mention the job, the result is wrong
    if (hasNoData) {
      expect(text.toLowerCase()).toMatch(/no data|no cron|none|0 jobs|empty/);
    } else {
      // days=1 filtered out the 2-day-old run — oldJob should NOT appear
      expect(text).not.toContain("oldJob");
    }
  });

  it("includes jobs from within the days window", async () => {
    seedSuccessRun(db, "freshJob", 300);

    const result = await callTool(server, "get_cron_health", { days: 7 });
    const text = firstText(result);
    expect(text).toContain("freshJob");
  });

  // ── multiple jobs ──────────────────────────────────────────────────────────

  it("returns all jobs sorted by job_name when no filter", async () => {
    seedSuccessRun(db, "zzLastJob");
    seedSuccessRun(db, "aaFirstJob");
    seedSuccessRun(db, "mmMidJob");

    const result = await callTool(server, "get_cron_health", {});
    const text = firstText(result);

    expect(text).toContain("zzLastJob");
    expect(text).toContain("aaFirstJob");
    expect(text).toContain("mmMidJob");

    // aaFirstJob should appear before zzLastJob (ASC sort)
    const aaIdx = text.indexOf("aaFirstJob");
    const zzIdx = text.indexOf("zzLastJob");
    expect(aaIdx).toBeLessThan(zzIdx);
  });

  // ── default days parameter ────────────────────────────────────────────────

  it("uses default window of 7 days when days is omitted", async () => {
    seedSuccessRun(db, "defaultWindowJob");

    const result = await callTool(server, "get_cron_health", {});
    const text = firstText(result);
    expect(text).toContain("defaultWindowJob");
  });
});
