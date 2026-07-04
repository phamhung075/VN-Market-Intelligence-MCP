/**
 * Interface — Ops debug-trigger routes (Stage 1 of server.ts staged extraction)
 *
 * Extracted from server.ts lines ~1764–2060
 * (docs/architecture-briefs/2026-07-04-server-ts-staged-extraction.md §4 Stage 1).
 *
 * Each exported route function is a thin wrapper around an already-extracted,
 * already-unit-tested handler module:
 *   bctcDebugTriggerHandler.ts / priceDebugTriggerHandler.ts / newsDebugTriggerHandler.ts /
 *   sbvDebugTriggerHandler.ts / foreignFlowDebugTriggerHandler.ts
 * This file owns only the wiring that used to be duplicated 5×:
 *   auth guard -> body parse -> call handler -> (live mode) build+log SSH command -> respond.
 *
 * DI contract: db + log are injected by the caller (server.ts handleRequest).
 * No getDb() calls here — db is DI'd for uniform Pattern-A signature parity across
 * the 5 routes even though only the BCTC handler actually reads it.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import type { createLogger } from "../../../infrastructure/logger.js";
import { requireVpsApiKey } from "./_shared/requireVpsApiKey.js";
import { handleTriggerBctcDebug } from "../bctcDebugTriggerHandler.js";
import { handleTriggerPriceDebug } from "../priceDebugTriggerHandler.js";
import { handleTriggerNewsDebug } from "../newsDebugTriggerHandler.js";
import { handleTriggerSbvDebug } from "../sbvDebugTriggerHandler.js";
import { handleTriggerForeignFlowDebug } from "../foreignFlowDebugTriggerHandler.js";

type Logger = ReturnType<typeof createLogger>;

interface DebugTriggerBody {
  tickers?: string[];
  verbose?: boolean;
  dry_run?: boolean;
}

/**
 * Dedups the 5 near-identical SSH command strings previously copy-pasted per
 * route. The command is only ever appended to `log_tail` / passed to `log.info`
 * for operator visibility — it is never executed by this process in either the
 * pre- or post-extraction code.
 */
function buildSshCommand(vinahostIp: string, script: string, tickerArgs: string, verboseFlag: string): string {
  return [`ssh root@${vinahostIp} /root/${script}`, tickerArgs, verboseFlag]
    .filter((part) => part.length > 0)
    .join(" ");
}

/**
 * Reads + parses the request body as JSON. Returns `{}` for an empty body
 * (matches prior inline behavior), `null` if the body writes its own 400 response
 * (caller must `if (payload === null) return;`), otherwise the parsed payload.
 */
async function readDebugTriggerBody(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<DebugTriggerBody | null> {
  let body = "";
  for await (const chunk of req) body += chunk;

  if (!body.trim()) return {};

  try {
    return JSON.parse(body) as DebugTriggerBody;
  } catch {
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON body" }));
    return null;
  }
}

// ── POST /api/trigger-bctc-debug ────────────────────────────────────────────

export async function handleTriggerBctcDebugRoute(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  const payload = await readDebugTriggerBody(req, res);
  if (payload === null) return;

  try {
    const result = await handleTriggerBctcDebug(
      {
        tickers: Array.isArray(payload.tickers) ? payload.tickers : undefined,
        verbose: payload.verbose !== false,
        dry_run: payload.dry_run === true,
      },
      db,
    );

    if (!result.dry_run) {
      const vinahostIp = Bun.env["VINAHOST_IP"];
      if (vinahostIp) {
        const tickerArgs =
          Array.isArray(payload.tickers) && payload.tickers.length > 0
            ? payload.tickers.map((t) => `--ticker ${t}`).join(" ")
            : "";
        const verboseFlag = payload.verbose !== false ? "--verbose" : "";
        const cmd = buildSshCommand(vinahostIp, "run-bctc-debug.sh", tickerArgs, verboseFlag);
        result.log_tail += `\n[SSH] Command: ${cmd}`;
        log.info("[trigger-bctc-debug] SSH trigger queued", { cmd });
      } else {
        result.log_tail += `\n[WARN] VINAHOST_IP not set — SSH trigger skipped`;
        log.warn("[trigger-bctc-debug] VINAHOST_IP not set, skipping SSH");
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    log.error("[trigger-bctc-debug] handler error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// ── POST /api/trigger-price-debug ───────────────────────────────────────────

export async function handleTriggerPriceDebugRoute(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  const payload = await readDebugTriggerBody(req, res);
  if (payload === null) return;

  try {
    const result = await handleTriggerPriceDebug({
      tickers: Array.isArray(payload.tickers) ? payload.tickers : undefined,
      verbose: payload.verbose !== false,
      dry_run: payload.dry_run === true,
    });

    if (!result.dry_run) {
      const vinahostIp = Bun.env["VINAHOST_IP"];
      if (vinahostIp) {
        const tickerArgs =
          Array.isArray(payload.tickers) && payload.tickers.length > 0
            ? payload.tickers.map((t) => `--ticker ${t}`).join(" ")
            : "";
        const verboseFlag = payload.verbose !== false ? "--verbose" : "";
        const cmd = buildSshCommand(vinahostIp, "run-price-debug.sh", tickerArgs, verboseFlag);
        result.log_tail += `\n[SSH] Command: ${cmd}`;
        log.info("[trigger-price-debug] SSH trigger queued", { cmd });
      } else {
        result.log_tail += `\n[WARN] VINAHOST_IP not set — SSH trigger skipped`;
        log.warn("[trigger-price-debug] VINAHOST_IP not set, skipping SSH");
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    log.error("[trigger-price-debug] handler error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// ── POST /api/trigger-news-debug ────────────────────────────────────────────

export async function handleTriggerNewsDebugRoute(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  const payload = await readDebugTriggerBody(req, res);
  if (payload === null) return;

  try {
    const result = await handleTriggerNewsDebug({
      verbose: payload.verbose !== false,
      dry_run: payload.dry_run === true,
    });

    if (!result.dry_run) {
      const vinahostIp = Bun.env["VINAHOST_IP"];
      if (vinahostIp) {
        const verboseFlag = payload.verbose !== false ? "--verbose" : "";
        const cmd = buildSshCommand(vinahostIp, "run-news-debug.sh", "", verboseFlag);
        result.log_tail += `\n[SSH] Command: ${cmd}`;
        log.info("[trigger-news-debug] SSH trigger queued", { cmd });
      } else {
        result.log_tail += `\n[WARN] VINAHOST_IP not set — SSH trigger skipped`;
        log.warn("[trigger-news-debug] VINAHOST_IP not set, skipping SSH");
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    log.error("[trigger-news-debug] handler error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// ── POST /api/trigger-sbv-debug ─────────────────────────────────────────────

export async function handleTriggerSbvDebugRoute(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  const payload = await readDebugTriggerBody(req, res);
  if (payload === null) return;

  try {
    const result = await handleTriggerSbvDebug({
      verbose: payload.verbose !== false,
      dry_run: payload.dry_run === true,
    });

    if (!result.dry_run) {
      const vinahostIp = Bun.env["VINAHOST_IP"];
      if (vinahostIp) {
        const verboseFlag = payload.verbose !== false ? "--verbose" : "";
        const cmd = buildSshCommand(vinahostIp, "run-sbv-debug.sh", "", verboseFlag);
        result.log_tail += `\n[SSH] Command: ${cmd}`;
        log.info("[trigger-sbv-debug] SSH trigger queued", { cmd });
      } else {
        result.log_tail += `\n[WARN] VINAHOST_IP not set — SSH trigger skipped`;
        log.warn("[trigger-sbv-debug] VINAHOST_IP not set, skipping SSH");
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    log.error("[trigger-sbv-debug] handler error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

// ── POST /api/trigger-foreign-flow-debug ────────────────────────────────────

export async function handleTriggerForeignFlowDebugRoute(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: Logger,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  const payload = await readDebugTriggerBody(req, res);
  if (payload === null) return;

  try {
    const result = await handleTriggerForeignFlowDebug({
      tickers: Array.isArray(payload.tickers) ? payload.tickers : undefined,
      verbose: payload.verbose !== false,
      dry_run: payload.dry_run === true,
    });

    if (!result.dry_run) {
      const vinahostIp = Bun.env["VINAHOST_IP"];
      if (vinahostIp) {
        const tickerArgs =
          Array.isArray(payload.tickers) && payload.tickers.length > 0
            ? payload.tickers.map((t) => `--ticker ${t}`).join(" ")
            : "";
        const verboseFlag = payload.verbose !== false ? "--verbose" : "";
        const cmd = buildSshCommand(vinahostIp, "run-foreign-flow-debug.sh", tickerArgs, verboseFlag);
        result.log_tail += `\n[SSH] Command: ${cmd}`;
        log.info("[trigger-foreign-flow-debug] SSH trigger queued", { cmd });
      } else {
        result.log_tail += `\n[WARN] VINAHOST_IP not set — SSH trigger skipped`;
        log.warn("[trigger-foreign-flow-debug] VINAHOST_IP not set, skipping SSH");
      }
    }

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(result));
  } catch (err) {
    log.error("[trigger-foreign-flow-debug] handler error", {
      error: err instanceof Error ? err.message : String(err),
    });
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Internal server error" }));
  }
}
