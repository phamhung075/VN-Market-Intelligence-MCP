/**
 * Mention-velocity aggregator — Poll News (FACTORY-APP-split-pollNews,
 * stage 3: cascade/alert-generation/mention-velocity)
 *
 * Task 1922e — Wire mention_velocity writer. After building all signals for
 * a poll cycle, aggregate raw signals by (code, floorHour) and call
 * recordMention() once per ticker per hour. This feeds
 * getCrisisEarlyWarning's spike detection with live data.
 *
 * Aggregation covers ALL signals (including insider_trading) for
 * completeness, since every signal represents an article that mentioned the
 * ticker. negativeCount: signals with high/critical severity. sourceCount:
 * distinct source hostnames (best-effort, derived from the signal message)
 * in this hour window.
 *
 * Non-fatal: any failure is caught and logged — velocity tracking must
 * never abort the poll cycle.
 *
 * Split out of pollNews.ts's pollNews() body (previously inline, lines
 * 423-484 of the pre-stage-3 orchestrator).
 *
 * Layer: application/usecases — may import from domain/ and infrastructure/.
 */

import type { Database } from "bun:sqlite";
import type { Signal } from "../../../domain/services/signalDetector.js";
import { logger } from "../../../infrastructure/logger.js";

// Snap a timestamp to the start of the UTC hour (ISO format)
function floorToHour(isoTs: string): string {
  const d = new Date(isoTs);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

export async function recordMentionVelocity(db: Database, allSignals: Signal[]): Promise<void> {
  try {
    // Build hourly buckets: key = "CODE::2026-05-16T10:00:00.000Z"
    const hourlyBuckets = new Map<string, {
      code: string;
      hour: string;
      mentionCount: number;
      negativeCount: number;
      sources: Set<string>;
    }>();

    for (const sig of allSignals) {
      const hour = floorToHour(sig.detectedAt ?? new Date().toISOString());
      const bucketKey = `${sig.actionCode}::${hour}`;
      const existing = hourlyBuckets.get(bucketKey);
      // Determine if signal is negative (bearish sentiment)
      const isNegative = sig.severity === "high" || sig.severity === "critical";
      // Derive source domain from the original entry (best-effort via message)
      const sourceHost = sig.message?.split(" — ")[0]?.slice(0, 40) ?? "unknown";
      if (existing) {
        existing.mentionCount += 1;
        if (isNegative) existing.negativeCount += 1;
        existing.sources.add(sourceHost);
      } else {
        hourlyBuckets.set(bucketKey, {
          code: sig.actionCode,
          hour,
          mentionCount: 1,
          negativeCount: isNegative ? 1 : 0,
          sources: new Set([sourceHost]),
        });
      }
    }

    if (hourlyBuckets.size > 0) {
      const { recordMention } = await import("../../../infrastructure/db/mentionVelocityStore.js");
      for (const bucket of hourlyBuckets.values()) {
        recordMention(db, {
          code: bucket.code,
          hour: bucket.hour,
          mentionCount: bucket.mentionCount,
          negativeCount: bucket.negativeCount,
          sourceCount: bucket.sources.size,
        });
      }
      logger.debug("[pollNews] mention_velocity updated", {
        buckets: hourlyBuckets.size,
        codes: [...new Set([...hourlyBuckets.values()].map((b) => b.code))],
      });
    }
  } catch (velErr) {
    // Non-fatal — velocity tracking must never abort the poll cycle
    logger.warn("[pollNews] mention_velocity write failed (non-fatal)", {
      error: velErr instanceof Error ? velErr.message : String(velErr),
    });
  }
}
