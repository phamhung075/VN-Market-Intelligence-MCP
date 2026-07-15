/**
 * ALPHA-S2-OMO-LIQUIDITY-CRON — SBV OMO liquidity trigger cron
 *
 * Pure trigger+observe job. `apps/macro-indicators/` (Go) ALREADY persists
 * `sbv_omo_daily` as a write-on-fetch side effect of every `POST /liquidity-state`
 * call (idempotent `ON CONFLICT(auction_date) DO UPDATE`, write ONLY when
 * `omoInputs.ParseOK === true`) — shipped in P0-3-OMO-CURVE (commit cd8cfcc2).
 * The only gap this job closes is "nobody calls the endpoint on a schedule."
 *
 * This job writes NOTHING to market.db (or any local DB) — it reuses the exact
 * `macroFetch<T>()` HTTP client + `LiquidityStateResponseSchema` already exercised
 * by the on-demand `get_vn_liquidity_state` MCP tool
 * (`interface/mcp/tools/macro/liquidityStateTools.ts`), just cron-triggered
 * instead of agent-triggered.
 *
 * Fail-loud contract (deliberately asymmetric — brief §3):
 *   HARD fail (macroFetch ok:false — transport/endpoint/VPS down): sendTelegramBug()
 *     + logger.error, EVERY occurrence. Unambiguous: the service is unreachable.
 *     Dedup handled by sendTelegramBug's own 4h window, not re-implemented here.
 *   SOFT fail (HTTP 200 but omo.is_estimate===true — SBV OMO parse degraded inside
 *     macro-indicators): logger.warn ONLY, no Telegram BUG alert. Ambiguous: may be
 *     a legitimate no-auction day (SBV skips auction weeks by design) or a real
 *     parser break — elevating every occurrence to a BUG alert would manufacture
 *     false incidents out of normal SBV publishing cadence (the
 *     auditor_freshness_threshold_market_hours_blind / passive_health_masks_dead_data
 *     false-positive classes this codebase has hit before).
 *   Success (omo.is_estimate===false): logger.info, no alert, no local DB write.
 *
 * No new MCP tool, no DDL, no startup one-shot (today's row either exists or it
 * doesn't — calling twice on deploy would just re-fetch the same idempotent row).
 *
 * Design SSOT: docs/architecture-briefs/2026-07-15-alpha-s2-omo-liquidity-cron.md
 *
 * @module scheduler/macro/sbvOmoLiquidityCronJob
 */

import { macroFetch } from "../../infrastructure/fetchers/fetchDeadline.js";
import { getMacroBaseUrl } from "../../interface/mcp/tools/macro/macroHttpClient.js";
import { LiquidityStateResponseSchema } from "../../interface/mcp/tools/macro/liquidityStateTools.js";
import { sendTelegramBug } from "../../infrastructure/notifiers/telegram.js";
import { logger } from "../../infrastructure/logger.js";

export interface SbvOmoLiquidityCronDeps {
  baseUrl?: string;
  deadlineMs?: number;
  notifyBug?: (msg: string) => Promise<unknown>;
}

export interface SbvOmoLiquidityCronResult {
  persisted: boolean;
  reason: string;
}

/**
 * Triggers `POST /liquidity-state` on the macro-indicators microservice so
 * `sbv_omo_daily` accrues today's row (persist happens server-side, in Go).
 * Side-effect-free on `market.db` — this job performs NO local DB read or write.
 */
export async function runSbvOmoLiquidityCron(
  deps?: SbvOmoLiquidityCronDeps,
): Promise<SbvOmoLiquidityCronResult> {
  const baseUrl = deps?.baseUrl ?? getMacroBaseUrl();
  const deadlineMs = deps?.deadlineMs ?? 15_000;
  const notifyBug = deps?.notifyBug ?? ((m: string) => sendTelegramBug(m));

  const result = await macroFetch<unknown>(baseUrl, "/liquidity-state", {}, { deadlineMs });

  if (!result.ok) {
    const msg =
      `[sbv-omo-liquidity-cron] macro-indicators /liquidity-state unreachable ` +
      `(${result.degrade.reason}${result.degrade.status ? " status=" + result.degrade.status : ""}) ` +
      `— sbv_omo_daily did NOT accrue today. Check macro-indicators service / VPS.`;
    logger.error(msg);
    await notifyBug(msg);
    return { persisted: false, reason: `transport:${result.degrade.reason}` };
  }

  const parsed = LiquidityStateResponseSchema.safeParse(result.data);
  if (!parsed.success) {
    const msg = `[sbv-omo-liquidity-cron] macro-indicators response failed schema validation — contract drift?`;
    logger.error(msg);
    await notifyBug(msg);
    return { persisted: false, reason: "schema-mismatch" };
  }

  const { omo } = parsed.data;
  if (omo.is_estimate) {
    logger.warn(
      `[sbv-omo-liquidity-cron] reachable but OMO parse degraded ` +
        `(blocked_reason="${omo.blocked_reason ?? "n/a"}") — no row persisted today ` +
        `(may be a legitimate no-auction day).`,
    );
    return { persisted: false, reason: `omo-degrade:${omo.blocked_reason ?? "unknown"}` };
  }

  logger.info(`[sbv-omo-liquidity-cron] sbv_omo_daily row persisted for auction_date=${omo.auction_date}`);
  return { persisted: true, reason: "ok" };
}
