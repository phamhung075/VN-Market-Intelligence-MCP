/**
 * moneyRadarHandler.ts — GET /api/money-radar
 *
 * MONEY-RADAR-P0-T3B-REST-API
 *
 * REST bridge for the Money Radar composite score. T2 built the
 * `get_money_radar_composite` MCP tool (moneyRadarTools.ts) + the
 * `getMoneyRadarComposite` usecase; T3 (dev-frontend) built the
 * `/dashboard/money-radar` page + a proxy route
 * (apps/frontend/app/routes/api.money-radar.tsx) that forwards
 * GET /api/money-radar to mcp-server — but that REST route never existed on
 * mcp-server (the frontend 404s and renders honest-NULL). This handler is the
 * missing bridge: it calls the SAME getMoneyRadarComposite usecase the MCP
 * tool uses, so the frontend and the tool response NEVER diverge.
 *
 * Interface-only — NO new usecase/domain logic. Reuses
 * application/usecases/getMoneyRadarComposite.ts verbatim (same call as
 * moneyRadarTools.ts registerMoneyRadarTools()).
 *
 * Honest-NULL (HN-1..HN-7): the usecase never fabricates a value — this
 * handler passes the response through unchanged. Never zero-fills a null
 * score/component; divergence.flag stays UNKNOWN (not GREEN) when an axis is
 * null — that is the usecase's job, not this file's.
 *
 * Response shape: docs/architecture-briefs/2026-07-01-money-radar.md §4 —
 * identical to the get_money_radar_composite MCP tool output.
 *
 * DDD Layer: interface — imports from application/usecases + infrastructure.
 *   No domain logic in this file. db is injected by server.ts (same
 *   convention as indicatorGaugesHandler.ts / alertsHandler.ts).
 *
 * @module interface/mcp/routes/moneyRadarHandler
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getMoneyRadarComposite,
  type MoneyRadarCompositeResponse,
} from "../../../application/usecases/getMoneyRadarComposite.js";
import { logger } from "../../../infrastructure/logger.js";

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/money-radar.
 *
 * Always returns HTTP 200 — getMoneyRadarComposite never throws (every reuse
 * call inside the usecase is individually try/caught, degrading only that
 * ONE component to null). Catastrophic handler failure (cannot even
 * construct a response) still returns 200 with all-null fields + error,
 * mirroring the momentum-indicators / indicator-gauges honest-NULL contract.
 * 4xx/5xx never fabricated here — this handler has no upstream HTTP forward
 * of its own; every downstream degrade is already folded into the usecase
 * response as null + null_reason.
 *
 * @param _req - HTTP request (unused — no query params)
 * @param res  - HTTP response
 * @param db   - SQLite database (injected by server.ts)
 */
export async function handleGetMoneyRadar(
  _req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): Promise<void> {
  try {
    const body = await getMoneyRadarComposite(db);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.warn("[GET /api/money-radar] unexpected failure", { error: message });
    // Catastrophic failure — still return 200 with all-null fields + error string.
    // HN-1: never zero-fill — score/delta_5d/components stay null, not 0.
    const body: MoneyRadarCompositeResponse & { error: string } = {
      error: message,
      score: null,
      delta_5d: null,
      divergence: { flag: "UNKNOWN", severity: 0, detectors: [] },
      coverage_pct: 0,
      source_tier: null,
      is_estimate: false,
      null_reason: message,
      components: {},
      generated_at: new Date().toISOString(),
    };
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  }
}
