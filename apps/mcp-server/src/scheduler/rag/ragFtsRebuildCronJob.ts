/**
 * ALPHA-S2-RAG-FTS-REBUILD-CRON — rag-service FTS index rebuild cron
 *
 * Pure trigger+observe job. `apps/rag-service/` (Python) already owns and unit-tests
 * `POST /admin/rebuild-fts` (DFR-P3, AC-P3R-5, `__tests__/unit/test_dfr_p3_hybrid_search.py`) —
 * the endpoint rebuilds the LanceDB `title`+`summary` FTS indexes over `rag_entries`
 * server-side. The DFR-P3 blueprint's own design ("Option C: lazy-on-first-hybrid-query +
 * scheduled daily refresh") only ever shipped the lazy half — this cron closes the
 * "scheduled" half the blueprint always intended.
 *
 * This job writes NOTHING to market.db (or any local DB) — it is a pure trigger caller
 * against `ragRebuildFts()` (`infrastructure/rag/ragHttpClient.ts`), same shape as
 * `runSbvOmoLiquidityCron`'s trigger+observe design.
 *
 * Fail-loud contract — single branch, simpler than the OMO sibling (brief §2.3):
 * `POST /admin/rebuild-fts` has no ambiguous state — it either returns 200 `{"status":"ok"}`
 * or raises/500s (generic `except Exception` server-side). So:
 *   HARD fail (non-2xx / network error / 90s timeout) → sendTelegramBug() + logger.error,
 *     EVERY occurrence (dedup handled by the notifier's own 4h window, not re-implemented here).
 *   Success (`{"status":"ok"}`) → logger.info ONLY, no alert, no local DB write.
 * No SOFT branch — unlike OMO, there is no legitimate ambiguous partial-success state to
 * distinguish from a real failure.
 *
 * No new MCP tool, no DDL, no startup one-shot (nothing to backfill — the index either
 * needs rebuilding or the lazy-build fallback already covers it; running twice on deploy
 * would just re-trigger the same idempotent-effect rebuild).
 *
 * Design SSOT: docs/architecture-briefs/2026-07-15-alpha-s2-rag-fts-rebuild-cron.md
 *
 * @module scheduler/rag/ragFtsRebuildCronJob
 */

import { ragRebuildFts } from "../../infrastructure/rag/ragHttpClient.js";
import { sendTelegramBug } from "../../infrastructure/notifiers/telegram.js";
import { logger } from "../../infrastructure/logger.js";

export interface RagFtsRebuildCronDeps {
  notifyBug?: (msg: string) => Promise<unknown>;
  rebuildFn?: () => Promise<{ status: string; message: string }>;
}

export interface RagFtsRebuildCronResult {
  rebuilt: boolean;
  reason: string;
}

/**
 * Triggers `POST /admin/rebuild-fts` on rag-service so the BM25 hybrid-search leg picks up
 * every row indexed via `ragIndex()` since the last rebuild. Side-effect-free on `market.db`
 * — this job performs NO local DB read or write; the LanceDB index mutation happens entirely
 * server-side inside the already-shipped rag-service endpoint.
 */
export async function runRagFtsRebuildCron(
  deps?: RagFtsRebuildCronDeps,
): Promise<RagFtsRebuildCronResult> {
  const notifyBug = deps?.notifyBug ?? ((m: string) => sendTelegramBug(m));
  const rebuildFn = deps?.rebuildFn ?? ragRebuildFts;

  try {
    const result = await rebuildFn();
    logger.info(`[rag-fts-rebuild-cron] FTS indexes rebuilt: ${result.message}`);
    return { rebuilt: true, reason: "ok" };
  } catch (err: unknown) {
    const detail = err instanceof Error ? err.message : String(err);
    const msg =
      `[rag-fts-rebuild-cron] rag-service /admin/rebuild-fts failed (${detail}) — FTS index NOT ` +
      `rebuilt today. Post-boot rows may be missing from the BM25 hybrid-search leg.`;
    logger.error(msg);
    await notifyBug(msg);
    return { rebuilt: false, reason: "http-error" };
  }
}
