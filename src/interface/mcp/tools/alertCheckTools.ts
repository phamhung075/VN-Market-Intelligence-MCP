/**
 * Task 176 — trigger_alert_check MCP Tool
 *
 * Registers one MCP tool: `trigger_alert_check`
 *
 * Purpose: On-demand stock signal check that the investor can invoke via Claude,
 * bypassing the 15-min intelligence cycle wait.
 *
 * Behaviour:
 *   1. Read watchlist from SQLite (filtered to actionCode if provided).
 *   2. Fetch latest prices for those stocks via injected or real fetcher.
 *   3. Run `detectSignals` + `generateAlerts` (pure domain functions).
 *   4. For HIGH/CRITICAL alerts: attempt Telegram notification (graceful no-op
 *      when TELEGRAM_BOT_TOKEN / TELEGRAM_INFO_MARKET_GROUP_ID env vars are absent).
 *   5. Return a formatted Vietnamese text summary.
 *
 * READ-ONLY: does NOT persist alerts to the database (avoids dedup collisions
 * with the 15-min background cycle).
 *
 * @module interface/mcp/tools/alertCheckTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import { initDatabase, getDb } from "../../../infrastructure/db/schema.js";
import { detectSignals } from "../../../domain/services/signalDetector.js";
import type { MarketSnapshot } from "../../../domain/services/signalDetector.js";
import { generateAlerts } from "../../../domain/services/alertGenerator.js";
import type { Alert } from "../../../domain/services/alertGenerator.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal price record expected from the price fetcher. */
export interface PriceRecord {
  code: string;
  exchange: string;
  price: number;
  previousPrice: number;
  changePct: number;
  volume: number;
  avgVolume: number;
  fetchedAt: string;
}

/** Watchlist row shape from SQLite. */
interface WatchlistRow {
  code: string;
  exchange: string;
  domain: string;
  alert_drop_pct: number;
  alert_rise_pct: number;
  alert_impact_min: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Severity labels (Vietnamese)
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_VI: Record<string, string> = {
  critical: "NGHIEM TRONG",
  high: "QUAN TRONG",
  medium: "LUU Y",
  low: "THAP",
};

// ─────────────────────────────────────────────────────────────────────────────
// Formatting helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Format a single Alert for Vietnamese display.
 */
function formatAlertVi(alert: Alert): string {
  const severityLabel = SEVERITY_VI[alert.severity] ?? alert.severity.toUpperCase();
  const signalTypes = alert.signals.map((s) => s.type).join(", ");
  return `[${severityLabel}] ${alert.actionCode}: ${signalTypes} — ${alert.message}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tool registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `trigger_alert_check` tool on an McpServer instance.
 *
 * @param server - The McpServer instance to register the tool on.
 */
// trigger_alert_check — REMOVED from MCP registration (sprint-036 task 230).
// Internal signal-check logic (detectSignals, generateAlerts, formatAlertVi) is still
// available via domain services. The tool is no longer exposed to Claude.
export function registerAlertCheckTools(_server: McpServer): void {
  // No-op: trigger_alert_check is no longer exposed as an MCP tool.
}
