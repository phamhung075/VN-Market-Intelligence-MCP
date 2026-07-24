/**
 * Interface — /api/push-news route handler
 *
 * Extracted from server.ts lines ~379-467 (Task 1892a).
 * Receives VN news items from VPS proxy (CafeF, VnExpress, VnEconomy, etc.),
 * logs the push to vps_push_log, then fires pollNews asynchronously.
 *
 * DI contract: db + log are injected by the caller (server.ts handleRequest).
 * No getDb() calls here — db is always passed in.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { createLogger } from "../../../infrastructure/logger.js";
import { safeLogVpsPush } from "../../../infrastructure/db/vpsPushLogStore.js";
import { requireVpsApiKey } from "./_shared/requireVpsApiKey.js";

export async function handlePushNews(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  if (!requireVpsApiKey(req, res)) return;

  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    if (!body.trim()) {
      safeLogVpsPush({ service: "news", itemsCount: 0, status: "error", errorMsg: "Empty request body" }, db);
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Empty request body" }));
      return;
    }
    const items: Array<{
      title: string;
      url: string;
      publishedAt: string;
      content: string;
      source: string;
    }> = JSON.parse(body);

    if (!Array.isArray(items) || items.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Expected non-empty JSON array of RssItem" }));
      return;
    }

    // Group items by source for injection into pollNews
    const bySource: Record<string, typeof items> = {};
    for (const item of items) {
      const src = (item.source || "vps").toLowerCase();
      (bySource[src] ??= []).push(item);
    }

    log.info("[push-news] received VN news from VPS", {
      total: items.length,
      sources: Object.keys(bySource).map((s) => `${s}:${bySource[s]!.length}`),
    });

    // Fire-and-forget: run pollNews with VPS items injected as fetchers
    setImmediate(async () => {
      try {
        const { pollNews } = await import("../../../application/usecases/pollNews.js");
        const { recordJobRun } = await import("../../../infrastructure/db/cronJobRunStore.js");
        await recordJobRun(db, "pollNewsJob", async () => {
          const result = await pollNews({
            fetchers: {
              // Build a fetcher for every key present in bySource.
              // This forwards all 9 (or more) VPS-pushed source keys without
              // maintaining a hardcoded list here.
              ...Object.fromEntries(
                Object.keys(bySource).map((src) => [src, async () => bySource[src] ?? []])
              ),
              // FIX-NEWS-CB-FALSE-CLOSED (2nd call site, 2026-07-08): reuters
              // and tradingeconomics are intentionally NOT stubbed here. Both
              // sources are permanently disabled via a one-time
              // recordDisabled() seed (sourceHealthTools.ts). pollNews.ts's
              // health loop treats a fulfilled-but-empty result from a source
              // outside STUB_CAPABLE_KEYS as a real failure, so a stub of
              // `async () => []` for these two keys — fired on every VPS push
              // event, far more often than the 15-min scheduled cycle —
              // silently overwrote the "disabled" status with an
              // ever-climbing recordFailure() count. pollNews.ts's own
              // resolvedFetchers contract (Sprint 1833g) only adds these keys
              // when a caller explicitly provides a fetcher for them, so
              // simply omitting them here (as intelligenceCycleJob.ts's
              // defaultPollNews() now also does) leaves the recordDisabled()
              // seed untouched forever. If a future non-VN source key needs
              // suppressing in this push-news context, add it ABOVE this
              // comment as an explicit no-op override — never reuters/
              // tradingeconomics.
            },
          });
          log.info("[push-news] pipeline complete", {
            fetched: result.fetched,
            inserted: result.inserted,
            duplicates: result.duplicates,
            alerts: result.alerts,
          });
        });
      } catch (err) {
        log.error("[push-news] pipeline failed", {
          error: err instanceof Error ? err.message : String(err),
        });
      }
    });

    safeLogVpsPush({ service: "news", itemsCount: items.length, status: "ok" }, db);
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, received: items.length }));
  } catch (err) {
    log.error("[push-news] parse error", { error: err instanceof Error ? err.message : String(err) });
    safeLogVpsPush({ service: "news", itemsCount: 0, status: "error", errorMsg: err instanceof Error ? err.message : String(err) }, db);
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
  }
}
