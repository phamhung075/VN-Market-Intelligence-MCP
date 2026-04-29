/**
 * Shared Vietnamese severity label map — SSOT for all sector MCP tools.
 *
 * Keys match the `severity` column values used across alert/signal tables:
 *   critical | high | medium | low
 *
 * Format: plain text, no emoji (Telegram-safe).
 *
 * Canonical source — do NOT duplicate inline in tool files.
 * Import: import { SEVERITY_VI } from "./severityLabels.js";
 *
 * @module interface/mcp/tools/sector/severityLabels
 */

export const SEVERITY_VI: Record<string, string> = {
  critical: "NGHIÊM TRỌNG",
  high: "QUAN TRỌNG",
  medium: "LƯU Ý",
  low: "THẤP",
};
