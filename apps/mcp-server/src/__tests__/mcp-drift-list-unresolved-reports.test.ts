Bun.env["DB_PATH"] = ":memory:";

/**
 * Task MCP-DRIFT-list-unresolved-reports — list_unresolved_reports MCP tool
 *
 * TDD test file (RED first).
 *
 * Tests:
 *   1. Empty state: returns empty array JSON when no unresolved reports exist
 *   2. Returns only unresolved rows (resolution NOT IN fixed/wontfix/duplicate)
 *   3. Excludes status=processed rows
 *   4. Includes resolution=none and resolution=monitoring rows
 *   5. Each row includes all 11 required fields (C-2 constraint)
 *   6. created_at is returned as ISO 8601 string (not raw unix integer)
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  insertReport,
  markProcessed,
  markResolved,
  listUnresolvedReports,
  serializeReport,
} from "../infrastructure/db/telegramReportStore.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/index.js";

// ─────────────────────────────────────────────────────────────────────────────
// Simulate what the MCP tool does: listUnresolvedReports + serializeReport
// ─────────────────────────────────────────────────────────────────────────────

function simulateListUnresolvedTool(db: Database): Array<Record<string, unknown>> {
  const rows = listUnresolvedReports(db);
  return rows.map(serializeReport);
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Empty state
// ─────────────────────────────────────────────────────────────────────────────

describe("list_unresolved_reports — empty state", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("returns empty array when no reports exist", () => {
    const result = simulateListUnresolvedTool(db);
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it("returns empty array when all reports are resolved (fixed)", () => {
    const id = insertReport(db, "fixed bug", "dev-team", 0, "normal");
    markResolved(db, id, "fixed", new Date().toISOString());
    const result = simulateListUnresolvedTool(db);
    expect(result.length).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2. Filtering: excludes fixed/wontfix/duplicate
// ─────────────────────────────────────────────────────────────────────────────

describe("list_unresolved_reports — excludes terminal resolutions", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("excludes resolution=fixed rows", () => {
    const id = insertReport(db, "Fixed issue", "dev-team", 0, "normal");
    markResolved(db, id, "fixed", new Date().toISOString());
    const result = simulateListUnresolvedTool(db);
    expect(result.find((r) => r["id"] === id)).toBeUndefined();
  });

  it("excludes resolution=wontfix rows", () => {
    const id = insertReport(db, "Wontfix issue", "dev-team", 0, "normal");
    markResolved(db, id, "wontfix", new Date().toISOString());
    const result = simulateListUnresolvedTool(db);
    expect(result.find((r) => r["id"] === id)).toBeUndefined();
  });

  it("excludes resolution=duplicate rows", () => {
    const id = insertReport(db, "Duplicate issue", "dev-team", 0, "normal");
    markResolved(db, id, "duplicate", new Date().toISOString());
    const result = simulateListUnresolvedTool(db);
    expect(result.find((r) => r["id"] === id)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 3. Excludes status=processed rows
// ─────────────────────────────────────────────────────────────────────────────

describe("list_unresolved_reports — excludes processed rows", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("excludes status=processed rows even with resolution=none", () => {
    const id = insertReport(db, "Processed report", "dev-team", 0, "normal");
    markProcessed(db, id);
    const result = simulateListUnresolvedTool(db);
    expect(result.find((r) => r["id"] === id)).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4. Includes resolution=none and resolution=monitoring
// ─────────────────────────────────────────────────────────────────────────────

describe("list_unresolved_reports — includes non-terminal resolutions", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("includes resolution=none (default) rows", () => {
    const id = insertReport(db, "Open bug", "dev-alert-engine", 0, "high");
    const result = simulateListUnresolvedTool(db);
    expect(result.find((r) => r["id"] === id)).toBeDefined();
  });

  it("includes resolution=monitoring rows", () => {
    const id = insertReport(db, "Monitoring issue", "dev-mcp-server", 0, "normal");
    markResolved(db, id, "monitoring", new Date().toISOString());
    const result = simulateListUnresolvedTool(db);
    expect(result.find((r) => r["id"] === id)).toBeDefined();
  });

  it("mixed: returns none+monitoring, excludes fixed", () => {
    const idNone = insertReport(db, "Open", "agent", 0, "normal");
    const idMonitor = insertReport(db, "Monitoring", "agent", 0, "normal");
    const idFixed = insertReport(db, "Fixed", "agent", 0, "normal");
    markResolved(db, idMonitor, "monitoring", new Date().toISOString());
    markResolved(db, idFixed, "fixed", new Date().toISOString());
    const result = simulateListUnresolvedTool(db);
    const ids = result.map((r) => r["id"]);
    expect(ids).toContain(idNone);
    expect(ids).toContain(idMonitor);
    expect(ids).not.toContain(idFixed);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 5. All 11 required fields present (C-2 constraint)
// ─────────────────────────────────────────────────────────────────────────────

describe("list_unresolved_reports — serialized row has all 11 fields", () => {
  let db: Database;

  beforeEach(async () => { closeDb(); await initDatabase(); db = getDb(); });

  it("includes all 11 fields in each serialized row", () => {
    insertReport(db, "Test report", "dev-team", 42, "high");
    const result = simulateListUnresolvedTool(db);
    expect(result.length).toBe(1);
    const row = result[0];
    const requiredFields = [
      "id", "message_id", "text", "from_agent", "priority", "status",
      "created_at", "claimed_by", "claimed_at", "resolution", "resolved_at",
    ];
    for (const field of requiredFields) {
      expect(row).toHaveProperty(field);
    }
  });

  it("created_at is ISO 8601 string (not unix integer)", () => {
    insertReport(db, "Test", "agent", 0, "normal");
    const result = simulateListUnresolvedTool(db);
    expect(result.length).toBeGreaterThan(0);
    const createdAt = result[0]!["created_at"] as string;
    expect(typeof createdAt).toBe("string");
    expect(createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it("resolution defaults to 'none' string in output", () => {
    insertReport(db, "Default resolution", "agent", 0, "normal");
    const result = simulateListUnresolvedTool(db);
    expect(result.length).toBeGreaterThan(0);
    expect(result[0]!["resolution"]).toBe("none");
  });
});
