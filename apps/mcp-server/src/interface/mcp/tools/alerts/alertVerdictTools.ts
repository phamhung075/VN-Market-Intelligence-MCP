/**
 * Task 1863d — Alert Verdict MCP Tool
 *
 * Provides the `write_alert_verdict` MCP tool.
 * alert-commander calls this after firing a MARKET alert to record a pending
 * verdict row for later accuracy resolution (1863b/c jobs).
 *
 * DDD layer: interface — imports from infrastructure/fileStore (1863a).
 * Must NOT import from domain/.
 *
 * @module interface/mcp/tools/alerts/alertVerdictTools
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

import {
  appendVerdict,
  type AlertVerdict,
} from "../../../../infrastructure/fileStore/alertVerdictStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema (exported for unit tests)
// ─────────────────────────────────────────────────────────────────────────────

export const WRITE_ALERT_VERDICT_SCHEMA = z.object({
  ticker: z.string().toUpperCase(),
  direction: z.enum(["bullish", "bearish"]),
  conviction: z.number().min(0).max(1),
  alertSource: z.enum([
    "urgent_news",
    "verified_chain",
    "chain_catalyst",
    "price_anomaly",
    "position_danger",
    "watchlist_opportunity",
    "legal_risk",
    "crisis_velocity",
  ]),
  firedAt: z.string().datetime(),
});

export type WriteAlertVerdictInput = z.infer<typeof WRITE_ALERT_VERDICT_SCHEMA>;

// ─────────────────────────────────────────────────────────────────────────────
// Minimal store interface — allows dependency injection in tests
// ─────────────────────────────────────────────────────────────────────────────

export interface AlertVerdictStoreDeps {
  store?: {
    appendOne(v: AlertVerdict): Promise<void>;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Handler (exported for unit tests + McpServer registration)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Core handler — validates input, generates UUID, writes pending verdict.
 * Injected `store` is used in tests; production falls back to `appendVerdict`.
 */
export async function writeAlertVerdict(
  input: WriteAlertVerdictInput,
  deps?: AlertVerdictStoreDeps,
): Promise<{ success: boolean; id: string; ticker: string; verdict: string }> {
  const row: AlertVerdict = {
    id: crypto.randomUUID(),
    ticker: input.ticker.toUpperCase(),
    firedAt: input.firedAt,
    alertSource: input.alertSource,
    direction: input.direction,
    conviction: input.conviction,
    verdict: "pending",
    resolvedAt: null,
    priceAtFire: null,
    priceAtResolution: null,
    pctMove: null,
    detail: null,
  };

  if (deps?.store) {
    await deps.store.appendOne(row);
  } else {
    await appendVerdict(row);
  }

  return {
    success: true,
    id: row.id,
    ticker: row.ticker,
    verdict: "pending",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// MCP registration
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Register the `write_alert_verdict` tool on a McpServer instance.
 */
// Raw shape extracted from schema — required by McpServer.tool() API
const WRITE_ALERT_VERDICT_SHAPE = WRITE_ALERT_VERDICT_SCHEMA.shape;

export function registerAlertVerdictTools(server: McpServer): void {
  server.tool(
    "write_alert_verdict",
    "Record a pending verdict after alert-commander fires a MARKET alert. " +
      "Generates a UUID, writes one AlertVerdict row with verdict='pending' to the " +
      "alert-verdicts store. Used by alert-commander at fire time (step 4a). " +
      "alertSource must be one of: urgent_news, verified_chain, chain_catalyst, " +
      "price_anomaly, position_danger, watchlist_opportunity, legal_risk, crisis_velocity.",
    WRITE_ALERT_VERDICT_SHAPE,
    async (rawInput) => {
      try {
        // Re-parse through schema to apply transforms (e.g. toUpperCase on ticker)
        const input = WRITE_ALERT_VERDICT_SCHEMA.parse(rawInput);
        const result = await writeAlertVerdict(input);
        return {
          content: [{ type: "text" as const, text: JSON.stringify(result, null, 2) }],
        };
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        throw new Error(`[write_alert_verdict] ${msg}`);
      }
    },
  );
}
