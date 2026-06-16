/**
 * Interface — /api/push-foreign-flow route handler
 *
 * Extracted from server.ts lines ~375–679 (Task 1406b).
 * Receives foreign flow data from VPS proxy, validates, upserts to DB,
 * and writes to daily OHLCV table.
 *
 * DI contract: db + log are injected by the caller (server.ts handleRequest).
 * No getDb() calls here — db is always passed in.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { createLogger } from "../../../infrastructure/logger.js";
import { logVpsPush, type VpsPushLogEntry } from "../../../infrastructure/db/vpsPushLogStore.js";
import { upsertForeignFlow } from "../../../infrastructure/db/vnstockStore.js";
import type { WriteForeignFlowItem } from "../../../domain/models/shared-types.js";
import { writeForeignFlowToOhlcv } from "../../../infrastructure/db/ohlcvForeignFlowStore.js";
import { validateForeignFlowPayload } from "../../../domain/services/market-data/foreignFlowValidator.js";
import { breakers } from "../../../infrastructure/circuitBreakerRegistry.js";
import { CircuitOpenError } from "../../../infrastructure/circuitBreaker.js";
import { ensureForeignFlowMigration } from "../server-startup.js";

export async function handlePushForeignFlow(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  const apiKey = Bun.env.VPS_PUSH_API_KEY;
  const authHeader = req.headers["x-api-key"] || req.headers["authorization"]?.replace("Bearer ", "");
  if (!apiKey || authHeader !== apiKey) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  const startTime = Date.now();
  let body = "";
  for await (const chunk of req) body += chunk;

  const MAX_PAYLOAD_SIZE = 1_000_000; // 1MB max
  let parseTimeMs = 0;
  let validationTimeMs = 0;
  let dbTimeMs = 0;

  try {
    // Step 1: Detect truncation — if body is huge and doesn't end with ']', likely truncated
    if (body.length >= MAX_PAYLOAD_SIZE && !body.trim().endsWith("]")) {
      logVpsPush({
        service: "foreign-flow",
        itemsCount: 0,
        status: "error",
        errorMsg: "Payload truncated: exceeds max size and missing closing bracket",
        vpsResponseSizeBytes: body.length,
        truncationDetected: true,
      });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Payload truncated" }));
      return;
    }

    if (body.trim().length <= 1) {
      logVpsPush({
        service: "foreign-flow",
        itemsCount: 0,
        status: "error",
        errorMsg: "Empty or truncated body",
        vpsResponseSizeBytes: body.length,
      });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Empty or truncated body" }));
      return;
    }

    // Step 2: Parse JSON with timing
    const parseStart = Date.now();
    let rawItems: unknown[];
    try {
      rawItems = JSON.parse(body) as unknown[];
    } catch (parseErr) {
      parseTimeMs = Date.now() - parseStart;
      const errMsg =
        parseErr instanceof SyntaxError
          ? `JSON parse error at position ${parseErr.message}`
          : `JSON parse error: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}`;

      logVpsPush({
        service: "foreign-flow",
        itemsCount: 0,
        status: "error",
        errorMsg: errMsg,
        vpsResponseSizeBytes: body.length,
        parseTimeMs,
      });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Invalid JSON" }));
      return;
    }
    parseTimeMs = Date.now() - parseStart;

    if (!Array.isArray(rawItems) || rawItems.length === 0) {
      logVpsPush({
        service: "foreign-flow",
        itemsCount: 0,
        status: "error",
        errorMsg: "Expected non-empty array",
        vpsResponseSizeBytes: body.length,
        parseTimeMs,
      });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Expected non-empty array" }));
      return;
    }

    // Step 3a: Normalize VPS payload format → ForeignFlowUpsertItem
    // VPS script (fetch-foreign-flow.sh) sends camelCase fields without `date`:
    //   { code, foreignBuyVol, foreignSellVol, foreignRoom }
    // ForeignFlowUpsertItem expects snake_case + date:
    //   { code, date, foreign_volume, foreign_room, holding_ratio, fetched_at }
    const todayUtc = new Date().toISOString().slice(0, 10);
    const normalizedItems: unknown[] = (rawItems as Record<string, unknown>[]).map((raw) => {
      const buyVol = typeof raw.foreignBuyVol === "number" ? raw.foreignBuyVol : 0;
      const sellVol = typeof raw.foreignSellVol === "number" ? raw.foreignSellVol : 0;
      return {
        code: typeof raw.code === "string" ? raw.code : String(raw.code ?? ""),
        date: typeof raw.date === "string" && raw.date ? raw.date : todayUtc,
        foreign_volume: typeof raw.foreign_volume === "number" ? raw.foreign_volume : buyVol - sellVol,
        foreign_room:
          typeof raw.foreign_room === "number"
            ? raw.foreign_room
            : typeof raw.foreignRoom === "number"
              ? raw.foreignRoom
              : null,
        holding_ratio: typeof raw.holding_ratio === "number" ? raw.holding_ratio : null,
        fetched_at: typeof raw.fetched_at === "string" ? raw.fetched_at : null,
      };
    });

    // Step 3b: Validate normalized payload with timing
    const validationStart = Date.now();
    const validationResult = validateForeignFlowPayload(normalizedItems);
    validationTimeMs = Date.now() - validationStart;

    const { valid: validItems, errors: validationErrors } = validationResult;

    // Collect indices of failed items
    const failedIndices = validationErrors.map((e) => e.itemIndex);
    const failedItemIndices = failedIndices.length > 0 ? JSON.stringify(failedIndices) : null;

    // If validation failed on all items, return error early
    if (validItems.length === 0) {
      const logEntry: VpsPushLogEntry = {
        service: "foreign-flow",
        itemsCount: 0,
        status: "error",
        errorMsg: `All ${rawItems.length} items failed validation`,
        vpsResponseSizeBytes: body.length,
        parseTimeMs,
        validationTimeMs,
        schemaErrorsCount: validationErrors.length,
      };
      if (failedItemIndices) logEntry.failedItemIndices = failedItemIndices;
      logVpsPush(logEntry);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Validation failed for all items", details: validationErrors }));
      return;
    }

    // Step 4: (guard removed — Task 1413b)
    // The early-return on state === "open" was intentionally removed.
    // Checking state BEFORE calling execute() bypasses the CB's own
    // _checkTimeout() / HALF_OPEN promotion mechanism, keeping the CB
    // permanently OPEN even after the reset window elapses.
    // execute() calls _checkTimeout() internally — if the timeout has
    // elapsed it promotes OPEN→HALF_OPEN and allows the write as a probe.
    // CircuitOpenError is now caught in the catch block below.

    // Step 5: Upsert valid items to DB with timing.
    // Guard: ensure UNIQUE(code, date) migration has run before first write.
    // Wrap in breakers.foreignFlow.execute() so DB failures increment the
    // circuit breaker failure counter (previously the bare try/catch swallowed
    // errors without notifying the breaker — FIX: foreign-flow-unique-constraint).
    ensureForeignFlowMigration();
    const dbStart = Date.now();
    let upserted = 0;
    try {
      upserted = await breakers.foreignFlow.execute(async () => upsertForeignFlow(validItems));
    } catch (dbErr) {
      dbTimeMs = Date.now() - dbStart;

      // CB is OPEN and reset timeout has NOT elapsed — return 503 with Retry-After
      // so the VPS knows when to retry rather than backing off indefinitely.
      if (dbErr instanceof CircuitOpenError) {
        const cbStats = breakers.foreignFlow.stats;
        const retryAfterSec = cbStats.openedAt
          ? Math.max(
              Math.ceil((cbStats.resetTimeoutMs - (Date.now() - new Date(cbStats.openedAt).getTime())) / 1000),
              60,
            )
          : Math.ceil(cbStats.resetTimeoutMs / 1000);
        logVpsPush({
          service: "foreign-flow",
          itemsCount: 0,
          status: "error",
          errorMsg: "Circuit breaker OPEN — backing off",
          vpsResponseSizeBytes: body.length,
          parseTimeMs,
          validationTimeMs,
          dbTimeMs,
          circuitBreakerState: cbStats.state,
        });
        res.writeHead(503, {
          "Content-Type": "application/json",
          "Retry-After": String(retryAfterSec),
        });
        res.end(JSON.stringify({ error: "Service temporarily unavailable", retryAfterSec }));
        return;
      }

      const errMsg = dbErr instanceof Error ? dbErr.message : String(dbErr);

      const logEntry: VpsPushLogEntry = {
        service: "foreign-flow",
        itemsCount: 0,
        status: "error",
        errorMsg: `DB write failed: ${errMsg}`,
        vpsResponseSizeBytes: body.length,
        parseTimeMs,
        validationTimeMs,
        dbTimeMs,
        schemaErrorsCount: validationErrors.length,
        circuitBreakerState: breakers.foreignFlow.stats.state,
      };
      if (failedItemIndices) logEntry.failedItemIndices = failedItemIndices;
      logVpsPush(logEntry);
      res.writeHead(500, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Database write failed" }));
      return;
    }
    dbTimeMs = Date.now() - dbStart;

    log.info("[push-foreign-flow] upserted rows", {
      count: upserted,
      source: "vps-proxy",
      validationErrors: validationErrors.length,
    });

    // Step 6: Write foreign flow cols to daily_ohlcv (Task 1503, 1288f) — best-effort, no crash on failure.
    // Use validated items from Step 3b; extract buy/sell volumes from raw payload at original indices.
    // Validate foreignBuyVol and foreignSellVol are present before writing (don't silently coerce to 0).
    let extractionErrors = 0;
    try {
      // Build a map of failed item indices for quick lookup
      const failedIndicesSet = new Set(validationErrors.map((e) => e.itemIndex));

      // Map valid items to WriteForeignFlowItem format by extracting from raw payload
      const ohlcvItems: WriteForeignFlowItem[] = [];
      for (let i = 0; i < normalizedItems.length; i++) {
        // Skip items that failed validation
        if (failedIndicesSet.has(i)) continue;

        const raw = (rawItems as Record<string, unknown>[])[i];
        if (!raw) continue;

        // Validate foreignBuyVol and foreignSellVol BEFORE extraction (don't coerce to 0)
        if (typeof raw.foreignBuyVol !== "number") {
          log.error("[push-foreign-flow] Step 6 extraction error: missing foreignBuyVol", {
            itemIndex: i,
            field: "foreignBuyVol",
            reason: `missing or non-numeric foreignBuyVol for ${raw.code}`,
            originalValue: raw.foreignBuyVol,
          });
          extractionErrors++;
          continue;
        }

        if (typeof raw.foreignSellVol !== "number") {
          log.error("[push-foreign-flow] Step 6 extraction error: missing foreignSellVol", {
            itemIndex: i,
            field: "foreignSellVol",
            reason: `missing or non-numeric foreignSellVol for ${raw.code}`,
            originalValue: raw.foreignSellVol,
          });
          extractionErrors++;
          continue;
        }

        // FIX-FOREIGN-FLOW-COVERAGE: extract VND value fields from bgapidatafeed.
        // fBValue / fSValue are returned as scientific-notation strings (e.g. "1.54033825E8").
        // Parse via parseFloat — handles both string and numeric forms; null when absent.
        const buyValueRaw = raw.foreignBuyValue ?? raw.fBValue;
        const sellValueRaw = raw.foreignSellValue ?? raw.fSValue;
        const foreignBuyValue =
          typeof buyValueRaw === "number"
            ? buyValueRaw
            : typeof buyValueRaw === "string"
              ? parseFloat(buyValueRaw)
              : null;
        const foreignSellValue =
          typeof sellValueRaw === "number"
            ? sellValueRaw
            : typeof sellValueRaw === "string"
              ? parseFloat(sellValueRaw)
              : null;

        ohlcvItems.push({
          code: typeof raw.code === "string" ? raw.code : String(raw.code ?? ""),
          date: typeof raw.date === "string" && raw.date ? raw.date : todayUtc,
          foreignBuyVol: raw.foreignBuyVol,
          foreignSellVol: raw.foreignSellVol,
          putThroughVol: typeof raw.putThroughVol === "number" ? raw.putThroughVol : 0,
          foreignBuyValue: foreignBuyValue !== null && !isNaN(foreignBuyValue) ? foreignBuyValue : null,
          foreignSellValue: foreignSellValue !== null && !isNaN(foreignSellValue) ? foreignSellValue : null,
        });
      }

      if (ohlcvItems.length > 0) {
        const ohlcvResult = await writeForeignFlowToOhlcv(ohlcvItems);
        log.info("[push-foreign-flow] ohlcv rows updated", { changes: ohlcvResult.changes });
      }

      if (extractionErrors > 0) {
        log.warn("[push-foreign-flow] Step 6 extraction errors found", {
          count: extractionErrors,
        });
      }
    } catch (ohlcvErr) {
      log.warn("[push-foreign-flow] writeForeignFlowToOhlcv failed (non-fatal)", {
        error: ohlcvErr instanceof Error ? ohlcvErr.message : String(ohlcvErr),
      });
    }

    // Step 7: Log success with full metrics
    const successLogEntry: VpsPushLogEntry = {
      service: "foreign-flow",
      itemsCount: upserted,
      status: "ok",
      vpsResponseSizeBytes: body.length,
      parseTimeMs,
      validationTimeMs,
      dbTimeMs,
      schemaErrorsCount: validationErrors.length,
      circuitBreakerState: breakers.foreignFlow.stats.state,
    };
    if (failedItemIndices) successLogEntry.failedItemIndices = failedItemIndices;
    logVpsPush(successLogEntry);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, upserted, validationErrors: validationErrors.length }));
  } catch (err) {
    log.error("[push-foreign-flow] unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
    logVpsPush({
      service: "foreign-flow",
      itemsCount: 0,
      status: "error",
      errorMsg: err instanceof Error ? err.message : String(err),
      vpsResponseSizeBytes: body.length,
      parseTimeMs,
      validationTimeMs,
      dbTimeMs,
      circuitBreakerState: breakers.foreignFlow.stats.state,
    });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
