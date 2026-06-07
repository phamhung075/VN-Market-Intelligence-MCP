/**
 * Interface — /api/push-sbv-rates route handler
 *
 * Extracted from server.ts (FIX-SBV-PUSH-TYPE-COERCE).
 * Accepts VPS-pushed SBV/VCB FX rate snapshots and stores them via storeSbvSnapshot.
 *
 * Fix: Number()-coerce usdVndOfficial + 6 optional numeric rate fields BEFORE
 * the NaN/<=0 validation guard. The VPS script sends numeric values as JSON strings;
 * the typeof === "number" check was rejecting valid payloads.
 *
 * Auth and empty-body branches are unchanged from server.ts.
 *
 * DI contract: db + log are injected by the caller (server.ts handleRequest).
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { safeLogVpsPush } from "../../../infrastructure/db/vpsPushLogStore.js";
import { storeSbvSnapshot } from "../../../infrastructure/fetchers/sbv.js";

export async function handlePushSbvRates(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: { info(...args: unknown[]): void; error(...args: unknown[]): void },
): Promise<void> {
  const apiKey = Bun.env.VPS_PUSH_API_KEY;
  const authHeader =
    (req.headers["x-api-key"] as string | undefined) ||
    (req.headers["authorization"] as string | undefined)?.replace("Bearer ", "");
  if (!apiKey || authHeader !== apiKey) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;

  try {
    if (!body.trim()) {
      safeLogVpsPush(
        { service: "sbv", itemsCount: 0, status: "error", errorMsg: "Empty request body" },
        db,
      );
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Empty request body" }));
      return;
    }

    const raw: {
      overnightRatePct?: unknown;
      refinancingRatePct?: unknown;
      usdVndOfficial?: unknown;
      discountRatePct?: unknown;
      maxDepositRatePct?: unknown;
      maxLendingRatePct?: unknown;
      interbankOvernightPct?: unknown;
      fetchedAt?: string;
    } = JSON.parse(body);

    // Coerce string-typed numeric fields to numbers (VPS script may send as strings)
    const usdVndOfficial = Number(raw.usdVndOfficial);
    const overnightRatePct =
      raw.overnightRatePct !== undefined ? Number(raw.overnightRatePct) : undefined;
    const refinancingRatePct =
      raw.refinancingRatePct !== undefined ? Number(raw.refinancingRatePct) : undefined;
    const discountRatePct =
      raw.discountRatePct !== undefined ? Number(raw.discountRatePct) : undefined;
    const maxDepositRatePct =
      raw.maxDepositRatePct !== undefined ? Number(raw.maxDepositRatePct) : undefined;
    const maxLendingRatePct =
      raw.maxLendingRatePct !== undefined ? Number(raw.maxLendingRatePct) : undefined;
    const interbankOvernightPct =
      raw.interbankOvernightPct !== undefined ? Number(raw.interbankOvernightPct) : undefined;

    // Preserve original NaN / <=0 guard
    if (isNaN(usdVndOfficial) || usdVndOfficial <= 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid usdVndOfficial (positive number required)" }));
      return;
    }

    const finalSnapshot = {
      overnightRatePct: overnightRatePct !== undefined ? overnightRatePct : 0,
      refinancingRatePct: refinancingRatePct !== undefined ? refinancingRatePct : 0,
      usdVndOfficial,
      discountRatePct: discountRatePct !== undefined ? discountRatePct : 0,
      maxDepositRatePct: maxDepositRatePct !== undefined ? maxDepositRatePct : 0,
      maxLendingRatePct: maxLendingRatePct !== undefined ? maxLendingRatePct : 0,
      interbankOvernightPct: interbankOvernightPct !== undefined ? interbankOvernightPct : 0,
      fetchedAt: raw.fetchedAt ?? new Date().toISOString(),
    };

    storeSbvSnapshot(finalSnapshot, db);

    log.info("[push-sbv-rates] stored VCB FX rate from VPS", {
      usdVnd: finalSnapshot.usdVndOfficial,
      fetchedAt: finalSnapshot.fetchedAt,
    });
    safeLogVpsPush({ service: "sbv", itemsCount: 1, status: "ok" }, db);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, usdVnd: finalSnapshot.usdVndOfficial }));
  } catch (err) {
    log.error("[push-sbv-rates] error", {
      error: err instanceof Error ? err.message : String(err),
    });
    safeLogVpsPush(
      {
        service: "sbv",
        itemsCount: 0,
        status: "error",
        errorMsg: err instanceof Error ? err.message : String(err),
      },
      db,
    );
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
  }
}
