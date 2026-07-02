/**
 * cronStatusHandler.ts — GET /api/cron-status read-only endpoint
 * (DASH-CRON-RECHECK-TABLE Zone 1, TASK-DASH-CRON-1)
 *
 * Mirrors orchestrationHandler.ts's pattern 1:1: one exported pure
 * `buildCronStatusDto()` function + one exported `handleGetCronStatus()` HTTP
 * handler. Read-only (NFR-4) — no mutation of any table, file, or in-process
 * state beyond the CN-5/R1 in-process memoization caches owned by
 * layerBCronRegistry.ts and cronStatusCompute.ts.
 *
 * This is the ONLY Zone-1 file that imports both src/scheduler/ (CRONS,
 * WATCHDOG_MANIFEST — config reads, read-only, no modification) and
 * src/application/cron/ + src/infrastructure/cron/ — the interface layer has
 * no cross-layer import restriction (Fence-A/B only restrict domain and
 * application). This keeps cronStatusCompute.ts (application) decoupled from
 * src/scheduler/ entirely (see that file's header for the Fence-B rationale).
 *
 * AC-25 / NFR-5: shares no mutable state with orchestrationHandler.ts — safe
 * to run concurrently.
 *
 * DDD layer: interface.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { resolve } from "node:path";
import { CRONS } from "../../../scheduler/cronConfig.js";
import { WATCHDOG_MANIFEST } from "../../../scheduler/system/schedulerWatchdogJob.js";
import { getDistinctJobNames } from "../../../infrastructure/db/cronJobRunStore.js";
import {
  getLayerBCronRows,
  type CronStatusRowB,
} from "../../../infrastructure/cron/layerBCronRegistry.js";
import {
  buildLayerARow,
  type CronStatusRowA,
  type CadenceManifest,
} from "../../../application/cron/cronStatusCompute.js";

export type { CronStatusRowA, CronStatusRowB };

export interface CronStatusDto {
  fetched_at: string;
  layer_a_count: number;
  layer_b_count: number;
  layer_a: CronStatusRowA[];
  layer_b: CronStatusRowB[];
}

/**
 * Build the CronStatusDto — pure w.r.t. its inputs (given the same db state +
 * nowMs + cronsMap + watchdogManifest + layerBRows, produces the same output).
 *
 * @param db               Database connection
 * @param nowMs            Server-side "now" in epoch ms (NEVER client time — NFR-2)
 * @param cronsMap         Live CRONS map (key → resolved cron expression)
 * @param watchdogManifest WATCHDOG_MANIFEST (or a CadenceManifest-shaped subset for tests)
 * @param layerBRows       Pre-parsed Layer-B rows (from getLayerBCronRows)
 */
export function buildCronStatusDto(
  db: Database,
  nowMs: number,
  cronsMap: Record<string, string>,
  watchdogManifest: CadenceManifest,
  layerBRows: CronStatusRowB[],
): CronStatusDto {
  const distinctDbJobNames = getDistinctJobNames(db);

  const layer_a: CronStatusRowA[] = Object.entries(cronsMap).map(([cronsKey, cronExpr]) =>
    buildLayerARow({ cronsKey, cronExpr, nowMs, db, watchdogManifest, distinctDbJobNames }),
  );

  return {
    fetched_at: new Date(nowMs).toISOString(),
    layer_a_count: layer_a.length,
    layer_b_count: layerBRows.length,
    layer_a,
    layer_b: layerBRows,
  };
}

/**
 * Handle GET /api/cron-status.
 *
 * FR-3.4: 503 JSON `{error}` on any unhandled exception — never crashes the
 * HTTP server.
 *
 * @param req            Incoming HTTP request (unused — read-only, no query params)
 * @param res            HTTP response
 * @param db             Database connection (injected by caller — server.ts)
 * @param now            Current time (injected for testability; defaults to real now)
 * @param commandsDirArg Absolute path to `.claude/commands/crons/` (injected for testability)
 */
export function handleGetCronStatus(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  now: Date = new Date(),
  commandsDirArg?: string,
): void {
  try {
    const commandsDir = commandsDirArg ?? resolve(process.cwd(), ".claude", "commands", "crons");
    const layerBRows = getLayerBCronRows(commandsDir);
    const dto = buildCronStatusDto(db, now.getTime(), CRONS, WATCHDOG_MANIFEST, layerBRows);

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(dto));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    res.writeHead(503, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: msg }));
  }
}
