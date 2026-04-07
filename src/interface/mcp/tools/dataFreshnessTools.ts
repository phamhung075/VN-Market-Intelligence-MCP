/**
 * Task 185 — Data Freshness MCP Tool
 *
 * Interface layer: registers `get_data_freshness` on a McpServer instance.
 *
 * The tool queries each data source table in SQLite for its most recent
 * timestamp and renders a formatted table showing:
 *   - Source label (Vietnamese)
 *   - Last update time (human-readable relative time)
 *   - Age in hours
 *   - Status (Tot / Binh thuong / Cu / Rat cu / Chua co du lieu)
 *
 * Status rules:
 *   < 1h    → Tot
 *   1h–6h   → Binh thuong
 *   6h–24h  → Cu
 *   >= 24h  → Rat cu
 *   null    → Chua co du lieu (table missing or empty)
 *
 * @module interface/mcp/tools/dataFreshness
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers (exported for unit testing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Classify a data age (in hours) into a freshness label.
 *
 * @param ageHours - Age in hours, or null if no data exists.
 * @returns Human-readable Vietnamese freshness status.
 */
export function classifyFreshness(ageHours: number | null): string {
  if (ageHours === null) return "Chua co du lieu";
  if (ageHours < 1) return "Tot";
  if (ageHours < 6) return "Binh thuong";
  if (ageHours < 24) return "Cu";
  return "Rat cu";
}

/**
 * Format an age in hours as a human-readable relative time string.
 *
 * Examples:
 *   0.25  → "15 phut truoc"
 *   1.0   → "1.0h"
 *   48    → "2 ngay truoc"
 *   null  → "N/A"
 *
 * @param ageHours - Age in hours, or null.
 */
export function formatAge(ageHours: number | null): string {
  if (ageHours === null) return "N/A";
  if (ageHours < 1) {
    const minutes = Math.round(ageHours * 60);
    return `${minutes} phut truoc`;
  }
  if (ageHours >= 24) {
    const days = Math.round(ageHours / 24);
    return `${days} ngay truoc`;
  }
  return `${ageHours.toFixed(1)}h`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface DataSourceDef {
  /** Vietnamese display label */
  label: string;
  /** SQL query returning a single `ts` column: ISO-8601 timestamp or null */
  query: string;
}

/** Column width constants for the formatted table */
const COL_SOURCE = 22;
const COL_UPDATED = 20;
const COL_AGE = 8;
const COL_STATUS = 16;

// ─────────────────────────────────────────────────────────────────────────────
// Data source definitions
// ─────────────────────────────────────────────────────────────────────────────

const DATA_SOURCES: DataSourceDef[] = [
  {
    label: "Tin tuc (RSS)",
    query: "SELECT MAX(created_at) AS ts FROM rag_analyses",
  },
  {
    label: "Gia co phieu",
    query: "SELECT MAX(updated_at) AS ts FROM market_prices WHERE code NOT IN ('TEST','PROBE')",
  },
  {
    label: "Hang hoa",
    query: "SELECT MAX(fetched_at) AS ts FROM commodity_prices",
  },
  {
    label: "Ty gia SBV",
    query: "SELECT MAX(fetched_at) AS ts FROM sbv_rates",
  },
  {
    label: "Du doan (Poly)",
    query: "SELECT MAX(fetched_at) AS ts FROM prediction_markets",
  },
  {
    label: "BCTC",
    query: "SELECT MAX(created_at) AS ts FROM financial_reports",
  },
  {
    label: "System",
    query: "SELECT MAX(timestamp) AS ts FROM system_logs",
  },
];

// ─────────────────────────────────────────────────────────────────────────────
// Core logic (exported for integration testing)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Query each data source and build the formatted freshness report.
 *
 * @param db - A SQLite Database instance (injectable for testing).
 * @returns Multi-line text report.
 */
export async function getDataFreshness(db: Database): Promise<string> {
  const now = Date.now();

  const lines: string[] = [
    "Do tuoi du lieu",
    "=".repeat(COL_SOURCE + COL_UPDATED + COL_AGE + COL_STATUS + 9),
    [
      "Nguon".padEnd(COL_SOURCE),
      "Cap nhat cuoi".padEnd(COL_UPDATED),
      "Tuoi".padEnd(COL_AGE),
      "Trang thai",
    ].join(" | "),
    "-".repeat(COL_SOURCE + COL_UPDATED + COL_AGE + COL_STATUS + 9),
  ];

  for (const source of DATA_SOURCES) {
    let ageHours: number | null = null;

    try {
      const row = db
        .query<{ ts: string | null }, []>(source.query)
        .get();

      if (row?.ts) {
        const tsMs = new Date(row.ts).getTime();
        if (!isNaN(tsMs)) {
          ageHours = (now - tsMs) / (1000 * 3600);
        }
      }
    } catch {
      // Table does not exist or query failed — treat as no data
      ageHours = null;
    }

    const status = classifyFreshness(ageHours);
    const ageStr = ageHours !== null ? `${ageHours.toFixed(1)}h` : "N/A";
    const updatedStr = formatAge(ageHours);

    const statusIcon =
      status === "Tot" ? "v Tot" :
      status === "Binh thuong" ? "~ Binh thuong" :
      status === "Cu" ? "! Cu" :
      status === "Rat cu" ? "!! Rat cu" :
      "- Chua co du lieu";

    lines.push(
      [
        source.label.padEnd(COL_SOURCE),
        updatedStr.padEnd(COL_UPDATED),
        ageStr.padEnd(COL_AGE),
        statusIcon,
      ].join(" | "),
    );
  }

  lines.push("");
  lines.push(`Kiem tra luc: ${new Date(now).toISOString()}`);

  return lines.join("\n");
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register data freshness tools.
 *
 * NOTE (sprint-036 task 234): `get_data_freshness` has been merged into
 * `get_system_status`. This function is kept as a no-op so that existing
 * imports in server.ts continue to compile without modification.
 *
 * The underlying logic (`getDataFreshness`, `classifyFreshness`, `formatAge`)
 * is still exported and used by `systemTools.ts → getSystemStatus()`.
 *
 * @param _server - The McpServer instance (unused — no tools registered here).
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function registerDataFreshnessTools(_server: McpServer): void {
  // get_data_freshness removed — merged into get_system_status (task 234)
}
