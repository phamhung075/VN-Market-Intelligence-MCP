/**
 * Task 1129 — get_calibration_report MCP tool
 *
 * Tests cover:
 * - AC-5: Empty calibration_snapshots table → returns "No calibration data" string, no throw
 * - AC-6: Snapshot with total_resolved=23, avg_brier_score=0.142, trend_delta=-0.018 →
 *         output contains all required sections (overall score, direction breakdown,
 *         calibration curve, top/worst predictions)
 * - AC-7: date="2026-04-06" with two snapshots present → returns 2026-04-06 snapshot data
 * - AC-extra: Snapshot with total_resolved=0 → returns "no resolved predictions" message,
 *             not the full formatted report
 * - AC-7b: date= with no matching snapshot → returns no-data message
 *
 * Harness: _registeredTools direct-handler invocation (CI-safe; no InMemoryTransport).
 * Proven CI-green template from sibling 1134-get-foreign-flow-tool.test.ts (commit 8916675a).
 * REWRITE rationale: InMemoryTransport+Client.callTool() stalls on Bun 1.3.13/Ubuntu CI
 * (1124-transport-hang signature); 5 it() x 2 native fails = 10 CI failures cured by
 * removing the transport layer entirely.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Database } from "bun:sqlite";
import { registerCalibrationTools } from "../interface/mcp/tools/macro/calibrationTools.js";
import {
  insertCalibrationSnapshot,
  type CalibrationSnapshotInput,
} from "../infrastructure/db/calibrationSnapshotStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Test server type — exposes _registeredTools for direct handler invocation
// NOTE: Cannot use intersection type (McpServer & { _registeredTools: ... })
// because _registeredTools is private in McpServer; tsc reduces intersection
// to never. Use (server as unknown as RegisteredToolsServer) at call site.
// ─────────────────────────────────────────────────────────────────────────────

interface McpTextResult {
  isError?: boolean;
  content: Array<{ type: string; text: string }>;
}

type RegisteredToolsServer = {
  _registeredTools: Record<string, {
    handler: (args: Record<string, unknown>) => Promise<McpTextResult>;
  }>;
};

// ---------------------------------------------------------------------------
// Module-level fixtures (set in beforeEach, torn down in afterEach)
// ---------------------------------------------------------------------------

let _testDb: Database;
let _testServer: McpServer;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function buildInMemoryDb(): Database {
  const db = new Database(":memory:");

  // Inline calibration_snapshots DDL — 12 columns per schema-system.ts:213
  // Contract-B in-memory pattern: NO initDatabase() call
  db.exec(`
    CREATE TABLE IF NOT EXISTS calibration_snapshots (
      id                     INTEGER PRIMARY KEY AUTOINCREMENT,
      snapshot_date          TEXT NOT NULL,
      total_resolved         INTEGER NOT NULL,
      avg_brier_score        REAL,
      avg_brier_by_agent     TEXT NOT NULL,
      avg_brier_by_stock     TEXT NOT NULL,
      avg_brier_by_direction TEXT NOT NULL,
      calibration_curve      TEXT NOT NULL,
      trend_delta            REAL,
      top_predictions        TEXT NOT NULL,
      worst_predictions      TEXT NOT NULL,
      computed_at            TEXT NOT NULL
    )
  `);

  return db;
}

function makeSnapshot(
  override: Partial<CalibrationSnapshotInput> = {},
): CalibrationSnapshotInput {
  return {
    snapshot_date: "2026-04-06",
    total_resolved: 23,
    avg_brier_score: 0.142,
    avg_brier_by_agent: { "08-prediction-synthesizer": 0.142 },
    avg_brier_by_stock: { VCB: 0.120, VNM: 0.165 },
    avg_brier_by_direction: { bullish: 0.130, bearish: 0.155, neutral: null },
    calibration_curve: [
      { bucket_midpoint: 0.55, predicted_prob: 0.55, actual_hit_rate: 0.60, sample_size: 5 },
      { bucket_midpoint: 0.75, predicted_prob: 0.75, actual_hit_rate: 0.72, sample_size: 8 },
    ],
    trend_delta: -0.018,
    top_predictions: [
      {
        id: 1,
        stock: "VCB",
        agent_id: "08-prediction-synthesizer",
        direction: "bullish",
        confidence: 0.75,
        claim_text: "VCB will rise",
        brier_score: 0.062,
        resolved_at: "2026-04-01",
      },
    ],
    worst_predictions: [
      {
        id: 2,
        stock: "VNM",
        agent_id: "08-prediction-synthesizer",
        direction: "bearish",
        confidence: 0.80,
        claim_text: "VNM will fall",
        brier_score: 0.360,
        resolved_at: "2026-04-01",
      },
    ],
    computed_at: "2026-04-06T13:00:00.000Z",
    ...override,
  };
}

/** Call a registered tool directly via _registeredTools */
async function callTool(
  toolName: string,
  args: Record<string, unknown>,
): Promise<McpTextResult> {
  const tool = (_testServer as unknown as RegisteredToolsServer)._registeredTools[toolName];
  if (!tool) throw new Error(`Tool not registered: ${toolName}`);
  return await tool.handler(args);
}

// ---------------------------------------------------------------------------
// Setup / Teardown
// ---------------------------------------------------------------------------

beforeEach(() => {
  _testDb = buildInMemoryDb();
  _testServer = new McpServer({ name: "test", version: "0.0.1" });
  registerCalibrationTools(_testServer, _testDb);
});

afterEach(() => {
  _testDb.close();
});

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Task 1129 — get_calibration_report tool", () => {
  // ── AC-5 ──────────────────────────────────────────────────────────────────
  it("AC-5: empty table → returns no-data message, no throw", async () => {
    const result = await callTool("get_calibration_report", {});

    expect(result.isError).toBeFalsy();
    const text = result.content
      .map((c) => c.text)
      .join("\n");

    expect(text).toContain("No calibration data available yet");
    expect(text).toContain("Check back next Sunday");
  });

  // ── AC-extra: total_resolved=0 ────────────────────────────────────────────
  it("AC-extra: snapshot with total_resolved=0 → returns no-resolved message (not full report)", async () => {
    insertCalibrationSnapshot(_testDb, makeSnapshot({
      total_resolved: 0,
      avg_brier_score: null,
      snapshot_date: "2026-04-06",
    }));

    const result = await callTool("get_calibration_report", {});

    expect(result.isError).toBeFalsy();
    const text = result.content
      .map((c) => c.text)
      .join("\n");

    expect(text.toLowerCase()).toContain("no resolved predictions");
    expect(text).toContain("2026-04-06");
    // must NOT be the full formatted report (no overall score sections)
    expect(text).not.toContain("Overall Brier Score");
    expect(text).not.toContain("Direction Breakdown");
  });

  // ── AC-6 ──────────────────────────────────────────────────────────────────
  it("AC-6: full snapshot → output contains all required sections", async () => {
    insertCalibrationSnapshot(_testDb, makeSnapshot());

    const result = await callTool("get_calibration_report", {});

    expect(result.isError).toBeFalsy();
    const text = result.content
      .map((c) => c.text)
      .join("\n");

    // Overall score
    expect(text).toContain("0.142");
    expect(text).toContain("23");

    // Trend — -0.018 is < -0.01, should say "improving"
    expect(text).toContain("improving");
    expect(text).toContain("-0.018");

    // Direction breakdown
    expect(text).toContain("bullish");
    expect(text).toContain("bearish");
    // neutral is null in direction map — should show "n/a"
    expect(text).toContain("n/a");

    // Calibration curve — tool formats as "55% confidence → 60.0% actual hit rate"
    expect(text).toContain("55%");
    expect(text).toContain("60.0%");

    // Top predictions
    expect(text).toContain("VCB");
    expect(text).toContain("0.062");

    // Worst predictions
    expect(text).toContain("VNM");
    expect(text).toContain("0.360");
  });

  // ── AC-7 ──────────────────────────────────────────────────────────────────
  it("AC-7: date= param returns the matching snapshot", async () => {
    // Insert two snapshots with different dates
    insertCalibrationSnapshot(
      _testDb,
      makeSnapshot({ snapshot_date: "2026-04-06", avg_brier_score: 0.142 }),
    );
    insertCalibrationSnapshot(
      _testDb,
      makeSnapshot({ snapshot_date: "2026-03-30", avg_brier_score: 0.160 }),
    );

    const result = await callTool("get_calibration_report", { date: "2026-04-06" });

    expect(result.isError).toBeFalsy();
    const text = result.content
      .map((c) => c.text)
      .join("\n");

    expect(text).toContain("2026-04-06");
    expect(text).toContain("0.142");
    // Must NOT contain the other date's score
    expect(text).not.toContain("0.160");
  });

  // ── AC-7b: unknown date ───────────────────────────────────────────────────
  it("AC-7b: date= with no matching snapshot → returns no-data message", async () => {
    insertCalibrationSnapshot(_testDb, makeSnapshot({ snapshot_date: "2026-04-06" }));

    const result = await callTool("get_calibration_report", { date: "2026-01-01" });

    expect(result.isError).toBeFalsy();
    const text = result.content
      .map((c) => c.text)
      .join("\n");

    expect(text).toContain("No calibration data available yet");
  });
});
