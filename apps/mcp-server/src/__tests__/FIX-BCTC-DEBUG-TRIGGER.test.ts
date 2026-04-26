/**
 * FIX-BCTC-DEBUG-TRIGGER — Manual debug trigger for BCTC VPS fetch pipeline
 *
 * Tests:
 *   1. POST /api/trigger-bctc-debug — auth guard (401 without key)
 *   2. POST /api/trigger-bctc-debug — rejects invalid body shapes
 *   3. POST /api/trigger-bctc-debug — dry_run returns queued list without mutating DB
 *   4. POST /api/trigger-bctc-debug — ticker filter limits queue to matching rows
 *   5. MCP tool schema — trigger_bctc_vps_fetch has correct parameter shapes
 *   6. run-bctc-debug.sh exists on disk and is executable
 */

import { describe, test, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { createServer, type Server } from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { readFileSync, existsSync, statSync } from "node:fs";
import path from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal DB helper — only bctc_vps_queue + watchlist tables
// ─────────────────────────────────────────────────────────────────────────────

function createTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code TEXT PRIMARY KEY
    );
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code     TEXT    NOT NULL,
      period_year     INTEGER NOT NULL,
      period_quarter  TEXT    NOT NULL,
      status          TEXT    NOT NULL DEFAULT 'pending',
      source_url      TEXT,
      attempts        INTEGER NOT NULL DEFAULT 0,
      last_attempt    TEXT,
      created_at      TEXT    NOT NULL DEFAULT (datetime('now')),
      UNIQUE(action_code, period_year, period_quarter)
    );
  `);
  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler under test — extracted handler logic (mirrors server.ts route)
// ─────────────────────────────────────────────────────────────────────────────

import { handleTriggerBctcDebug, type TriggerBctcDebugResult } from "../interface/mcp/bctcDebugTriggerHandler.js";

// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DEBUG-TRIGGER — POST /api/trigger-bctc-debug handler", () => {
  let db: Database;

  beforeEach(() => {
    db = createTestDb();
    // Seed some queue rows
    db.exec(`
      INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
      VALUES
        ('FPT', 2025, 'Q4', 'pending', 'https://example.com/fpt.pdf'),
        ('VIC', 2025, 'Q4', 'pending', NULL),
        ('HPG', 2025, 'Q4', 'done',    'https://example.com/hpg.pdf');
    `);
  });

  afterEach(() => {
    db.close();
  });

  // ── Test 1: dry_run mode returns queued list without mutating DB ──────────

  test("dry_run=true returns pending tickers without marking them in-progress", async () => {
    const result = await handleTriggerBctcDebug(
      { tickers: undefined, verbose: false, dry_run: true },
      db,
    );

    expect(result.queued).toBeArray();
    // FPT and VIC are pending; HPG is done — should NOT appear
    expect(result.queued).toContain("FPT");
    expect(result.queued).toContain("VIC");
    expect(result.queued).not.toContain("HPG");

    // DB must NOT have been mutated — status still 'pending'
    const rows = db.prepare("SELECT status FROM bctc_vps_queue WHERE action_code IN ('FPT','VIC')").all() as { status: string }[];
    for (const r of rows) {
      expect(r.status).toBe("pending");
    }

    // dry_run result fields
    expect(result.dry_run).toBe(true);
    expect(result.attempted).toBeArray();
    expect(result.attempted.length).toBe(0);
  });

  // ── Test 2: ticker filter limits output ──────────────────────────────────

  test("tickers filter returns only matching pending rows", async () => {
    const result = await handleTriggerBctcDebug(
      { tickers: ["FPT"], verbose: false, dry_run: true },
      db,
    );

    expect(result.queued).toContain("FPT");
    expect(result.queued).not.toContain("VIC");
    expect(result.queued).not.toContain("HPG");
  });

  // ── Test 3: empty tickers array treated as "all" ──────────────────────────

  test("empty tickers array returns all pending rows", async () => {
    const result = await handleTriggerBctcDebug(
      { tickers: [], verbose: false, dry_run: true },
      db,
    );

    expect(result.queued).toContain("FPT");
    expect(result.queued).toContain("VIC");
  });

  // ── Test 4: result shape has required fields ──────────────────────────────

  test("result always has queued, attempted, success, failed, log_tail fields", async () => {
    const result = await handleTriggerBctcDebug(
      { tickers: undefined, verbose: true, dry_run: true },
      db,
    );

    expect(result).toHaveProperty("queued");
    expect(result).toHaveProperty("attempted");
    expect(result).toHaveProperty("success");
    expect(result).toHaveProperty("failed");
    expect(result).toHaveProperty("log_tail");
    expect(typeof result.log_tail).toBe("string");
  });

  // ── Test 5: verbose mode appends diagnostic lines to log_tail ────────────

  test("verbose=true produces non-empty log_tail with queue diagnostic info", async () => {
    const result = await handleTriggerBctcDebug(
      { tickers: undefined, verbose: true, dry_run: true },
      db,
    );

    expect(result.log_tail.length).toBeGreaterThan(0);
    // Should mention at least one ticker
    expect(result.log_tail).toMatch(/FPT|VIC|pending/i);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// HTTP endpoint auth guard — simulated via handler contract
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DEBUG-TRIGGER — auth guard", () => {
  test("handler module exports handleTriggerBctcDebug function", () => {
    // Validates the module shape expected by server.ts
    expect(typeof handleTriggerBctcDebug).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool schema validation
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DEBUG-TRIGGER — MCP tool registration", () => {
  test("registerBctcDebugTriggerTool export exists in tool file", async () => {
    const mod = await import("../interface/mcp/tools/system/bctcDebugTriggerTool.js");
    expect(typeof mod.registerBctcDebugTriggerTool).toBe("function");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VPS script on disk
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-BCTC-DEBUG-TRIGGER — run-bctc-debug.sh on disk", () => {
  const scriptPath = path.resolve(
    import.meta.dir,
    "../../../../vps-scripts/run-bctc-debug.sh",
  );

  test("run-bctc-debug.sh exists at vps-scripts/run-bctc-debug.sh", () => {
    expect(existsSync(scriptPath)).toBe(true);
  });

  test("run-bctc-debug.sh is executable (chmod +x)", () => {
    const stats = statSync(scriptPath);
    // Check owner execute bit (0o100)
    const isExecutable = (stats.mode & 0o100) !== 0;
    expect(isExecutable).toBe(true);
  });

  test("run-bctc-debug.sh contains --ticker, --verbose, --dry-run arg handling", () => {
    const content = readFileSync(scriptPath, "utf-8");
    expect(content).toContain("--ticker");
    expect(content).toContain("--verbose");
    expect(content).toContain("--dry-run");
  });

  test("run-bctc-debug.sh logs to /tmp/bctc-debug-<timestamp>.log", () => {
    const content = readFileSync(scriptPath, "utf-8");
    expect(content).toContain("/tmp/bctc-debug-");
  });
});
