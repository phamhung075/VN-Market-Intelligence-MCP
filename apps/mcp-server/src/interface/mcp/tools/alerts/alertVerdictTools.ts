/**
 * Task 1863d — Alert Verdict MCP Tool
 * FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK — added pending-duplicate dedup guard
 *
 * Provides the `write_alert_verdict` MCP tool.
 * alert-commander calls this after firing a MARKET alert to record a pending
 * verdict row for later accuracy resolution (1863b/c jobs).
 *
 * Dedup guard (FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK): if a PENDING verdict
 * already exists for the same (ticker, alertSource) pair, a new row is NOT
 * appended — the existing pending row is returned with `duplicate: true`.
 * This stops the same still-unresolved event (e.g. a legal_risk CRITICAL
 * that re-fires across consecutive alert-commander cycles) from blindly
 * accumulating duplicate pending verdict rows. A genuinely NEW event (a
 * different alertSource, or the same pair AFTER its prior verdict has
 * resolved to confirmed/false_positive via verdictResolutionJob) is never
 * suppressed — this preserves alert-policy.md's no-suppression intent for
 * legal_risk / CRITICAL signals.
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
  readVerdicts,
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
    /**
     * Optional — enables the pending-duplicate dedup guard lookup (see
     * module header). Omitted in legacy test fakes: dedup is skipped for
     * that caller (falls straight through to appendOne), matching prior
     * behaviour exactly. The production path (no injected store) always
     * uses the real `readVerdicts()` and always dedups.
     */
    readAll?(): Promise<AlertVerdict[]>;
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
): Promise<{ success: boolean; id: string; ticker: string; verdict: string; duplicate?: boolean }> {
  const ticker = input.ticker.toUpperCase();

  // Dedup guard (FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK) — see module header.
  const existing = deps?.store?.readAll
    ? await deps.store.readAll()
    : deps?.store
      ? [] // legacy fake store with no readAll — dedup skipped, unchanged behaviour
      : await readVerdicts();

  const duplicate = existing.find(
    (r) => r.ticker === ticker && r.alertSource === input.alertSource && r.verdict === "pending",
  );
  if (duplicate) {
    return {
      success: true,
      id: duplicate.id,
      ticker: duplicate.ticker,
      verdict: duplicate.verdict,
      duplicate: true,
    };
  }

  const row: AlertVerdict = {
    id: crypto.randomUUID(),
    ticker,
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
    "Writes a NEW pending AlertVerdict row to docs/data/alert-verdicts.json (file store, " +
      "NOT the SQLite alerts table). Call AT FIRE TIME (alert-commander step 4a). Verdict starts " +
      "as 'pending' and is resolved later by the verdict resolution job. Distinct from " +
      "mark_alert_outcome which scores an existing SQLite alerts row post-hoc. " +
      "Record a pending verdict after alert-commander fires a MARKET alert. " +
      "Generates a UUID, writes one AlertVerdict row with verdict='pending' to the " +
      "alert-verdicts store. " +
      "alertSource must be one of: urgent_news, verified_chain, chain_catalyst, " +
      "price_anomaly, position_danger, watchlist_opportunity, legal_risk, crisis_velocity. " +
      "Dedup guard (FIX-LEGAL-RISK-ALERT-DEDUP-LOOKBACK): if a PENDING verdict already exists " +
      "for the same ticker+alertSource, no new row is appended — response has duplicate:true " +
      "and echoes the existing id instead.",
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
