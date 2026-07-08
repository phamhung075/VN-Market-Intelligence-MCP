/**
 * Insider Check Job — Task 250 / refactored Task 1143
 *
 * Daily 01:00 UTC (08:00 VN) Mon-Sun: Fetch SSC insider transaction disclosures,
 * store new records, run streak detection, insert alert rows + evidence fragments.
 *
 * Alert Commander exclusivity: this job NEVER calls sendTelegramMarket.
 * Alert rows are written to the `alerts` table (INSERT OR IGNORE for same-day dedup).
 * Alert Commander reads unnotified alerts and dispatches to the MARKET channel.
 *
 * Layer: interface/scheduler
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { fetchInsiderTransactions } from "../../infrastructure/fetchers/sscInsider.js";
import type { RawInsiderRow } from "../../infrastructure/fetchers/sscInsider.js";
import { insertInsiderTransaction, hasInsiderTransaction } from "../../infrastructure/db/insiderStore.js";
import type { InsiderRow } from "../../infrastructure/db/insiderStore.js";
import { getDb } from "../../infrastructure/db/schema.js";
import {
  classifyInsiderTransaction,
  type InsiderTransaction,
} from "../../domain/services/leadershipSignal.js";
import { insertEvidenceFragment } from "../../infrastructure/db/evidenceFragmentStore.js";
import { recordJobRun } from "../../infrastructure/db/cronJobRunStore.js";
import { deriveConfidenceFromStrength } from "../../domain/services/alertConfidenceScorer.js";
import {
  INSIDER_STREAK_CONFIDENCE_BASE,
  INSIDER_STREAK_CONFIDENCE_CEILING,
} from "../../domain/services/alertThresholds.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default outstanding shares when per-stock data is not available. */
const DEFAULT_OUTSTANDING = 1_000_000_000; // 1 billion — conservative estimate

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Injectable Telegram overrides for testing (avoids real HTTP calls) */
export interface InsiderCheckOverrides {
  /** Present only for interface symmetry — NEVER called by this job */
  sendMarket?: (msg: string) => Promise<boolean>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generate a stable unique ID for an insider transaction row.
 * Format: {code}-{insiderName-slug}-{fromDate}
 */
function makeRowId(raw: RawInsiderRow): string {
  const namePart = raw.insiderName
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .slice(0, 20);
  return `${raw.code}-${namePart}-${raw.fromDate}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Streak detection (pure data grouping — requires DB I/O so stays in scheduler)
// ─────────────────────────────────────────────────────────────────────────────

interface AccumulationStreak {
  code: string;
  position: string;          // normalised to lowercase
  buyDays: number;           // count of distinct from_date values
  totalExecutedVolume: number;
}

/**
 * Query insider_transactions for buy streaks within the last `windowDays` days.
 * A streak is defined as >= 3 distinct from_date values with executed_volume > 0.
 * Position is normalised to lower(trim(position)) to merge capitalisation variants.
 */
function detectAccumulationStreaks(
  db: Database,
  windowDays: number,
): AccumulationStreak[] {
  const cutoff = new Date(Date.now() - windowDays * 86_400_000)
    .toISOString()
    .slice(0, 10);

  type Row = { code: string; position: string; buy_days: number; total_vol: number };
  const rows = db.prepare<Row, [string]>(`
    SELECT
      code,
      lower(trim(position)) AS position,
      COUNT(DISTINCT from_date) AS buy_days,
      SUM(executed_volume)     AS total_vol
    FROM insider_transactions
    WHERE type = 'buy'
      AND executed_volume > 0
      AND from_date >= ?
    GROUP BY code, lower(trim(position))
    HAVING buy_days >= 3
  `).all(cutoff) as Row[];

  return rows.map((r) => ({
    code:                r.code,
    position:            r.position,
    buyDays:             r.buy_days,
    totalExecutedVolume: r.total_vol,
  }));
}

/**
 * FACTORY-SCHEDULER-alert-confidence-literals: derive streak confidence from
 * the streak's own buyDays magnitude — `min(1, buyDays / 10)` — instead of a
 * frozen literal. A borderline streak (3 distinct buy days, the HAVING floor
 * in detectAccumulationStreaks) lands near INSIDER_STREAK_CONFIDENCE_BASE; a
 * 10+ day streak lands at INSIDER_STREAK_CONFIDENCE_CEILING. Shared by both
 * the evidence-fragment write and the streak-alert write below so the two
 * persisted values always agree for the same streak.
 */
function deriveStreakConfidence(buyDays: number): number {
  return deriveConfidenceFromStrength({
    strength: Math.min(1.0, buyDays / 10),
    base: INSIDER_STREAK_CONFIDENCE_BASE,
    ceiling: INSIDER_STREAK_CONFIDENCE_CEILING,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Run the insider transaction check job.
 *
 * Steps:
 *   1. Fetch latest SSC insider disclosures
 *   2. Store new records in SQLite
 *   3. Classify each transaction via leadershipSignal service
 *   4. Detect mass insider buy patterns
 *   5. Detect accumulation streaks → insert evidence fragments
 *   6. Insert alert rows for significant single buys + streaks (INSERT OR IGNORE)
 *
 * Never calls sendTelegramMarket — Alert Commander exclusivity rule.
 * Wrapped in recordJobRun for observability.
 *
 * @param db               - Optional injected DB (uses production DB when omitted)
 * @param fetchOverride    - Optional injected fetcher (uses real SSC fetch when omitted)
 * @param _overrides       - Reserved for test injection (sendMarket never called)
 */
export async function runInsiderCheck(
  db?: Database,
  fetchOverride?: () => Promise<RawInsiderRow[]>,
  _overrides?: InsiderCheckOverrides,
): Promise<void> {
  const database = db ?? getDb();

  await recordJobRun(database, "insiderCheckJob", async () => {
    logger.info("[insiderCheckJob] starting insider transaction check");

    // ── Step 1: Fetch from SSC ───────────────────────────────────────────────
    const fetch = fetchOverride ?? fetchInsiderTransactions;
    const scraped = await fetch();
    logger.info("[insiderCheckJob] fetched transactions", {
      count: scraped.length,
    });

    // ── Step 2: Store ────────────────────────────────────────────────────────
    const fetchedAt = new Date().toISOString();
    let rowsStored = 0;

    for (const tx of scraped) {
      try {
        const id = makeRowId(tx);
        if (hasInsiderTransaction(database, id)) continue;

        const row: InsiderRow = {
          id,
          code: tx.code,
          insiderName: tx.insiderName,
          position: tx.position,
          type: tx.type,
          registeredVolume: tx.registeredVolume,
          executedVolume: tx.executedVolume,
          price: tx.price,
          fromDate: tx.fromDate,
          toDate: tx.toDate,
          fetchedAt,
        };
        insertInsiderTransaction(database, row);
        rowsStored++;
      } catch (err) {
        // Duplicate or constraint error — skip silently
        logger.debug("[insiderCheckJob] insert skipped", {
          code: tx.code,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Step 3: Classify individual signals ─────────────────────────────────
    // Map scraped tx to domain InsiderTransaction type (skip "other" type)
    const domainTxs: InsiderTransaction[] = scraped
      .filter((t): t is RawInsiderRow & { type: "buy" | "sell" } => t.type === "buy" || t.type === "sell")
      .map((t) => ({
        code: t.code,
        insiderName: t.insiderName,
        position: t.position as InsiderTransaction["position"],
        type: t.type,
        volume: t.executedVolume,
        registeredVolume: t.registeredVolume,
        price: t.price,
        date: t.fromDate,
      }));

    // ── Step 4: Detect mass insider buy (classification only — no Telegram) ──
    const byCode = new Map<string, InsiderTransaction[]>();
    for (const tx of domainTxs) {
      const arr = byCode.get(tx.code) ?? [];
      arr.push(tx);
      byCode.set(tx.code, arr);
    }

    // ── Step 5: Detect accumulation streaks → evidence fragments ─────────────
    const streaks = detectAccumulationStreaks(database, 30);

    for (const streak of streaks) {
      insertEvidenceFragment(database, {
        stock:         streak.code,
        evidence_type: "insider_accumulation",
        direction:     "bullish",
        magnitude:     Math.min(1.0, streak.buyDays / 10),
        confidence:    deriveStreakConfidence(streak.buyDays),
        source_agent:  "insiderCheckJob",
        ttl_days:      30,
      });
      logger.info("[insiderCheckJob] evidence fragment inserted", {
        code: streak.code, buyDays: streak.buyDays,
      });
    }

    // ── Step 6: Insert alert rows (INSERT OR IGNORE for same-day dedup) ──────
    const utcDay = new Date().toISOString().slice(0, 10);
    const triggeredAt = new Date().toISOString();

    const insertAlertStmt = database.prepare(`
      INSERT OR IGNORE INTO alerts
        (id, triggered_at, severity, signals_json, affected_actions_json,
         analysis_ids_json, message, read, user_note, sent_by)
      VALUES
        (?, ?, 'high', ?, ?, NULL, ?, 0, NULL, 'server')
    `);

    let alertsInserted = 0;

    // Streak alerts
    for (const streak of streaks) {
      const id = `insider-streak-${streak.code}-${utcDay}`;
      const msg =
        `Tich luy noi bo ${streak.code}: ${streak.buyDays} ngay mua lien tiep ` +
        `bởi ${streak.position} — có hiệu ứng lớn nhất trong thị trường VN`;
      const result = insertAlertStmt.run(
        id,
        triggeredAt,
        JSON.stringify(["insider_accumulation"]),
        JSON.stringify([{ code: streak.code, expectedImpact: "up", confidence: deriveStreakConfidence(streak.buyDays) }]),
        msg,
      );
      if (result.changes > 0) alertsInserted++;
    }

    // Significant single-transaction alerts (> 1% of DEFAULT_OUTSTANDING, buy only)
    for (const tx of domainTxs) {
      if (tx.type !== "buy") continue;
      const pct = (tx.volume / DEFAULT_OUTSTANDING) * 100;
      if (pct < 1.0) continue;
      const signal = classifyInsiderTransaction(tx, DEFAULT_OUTSTANDING);
      if (!signal || (signal.severity !== "high" && signal.severity !== "critical")) continue;
      const id = `insider-single-${tx.code}-${tx.insiderName.slice(0, 10).replace(/\s/g, "")}-${utcDay}`;
      const result = insertAlertStmt.run(
        id,
        triggeredAt,
        JSON.stringify(["insider_buy"]),
        JSON.stringify([{ code: tx.code, expectedImpact: "up", confidence: signal.confidence }]),
        signal.reasoning,
      );
      if (result.changes > 0) alertsInserted++;
      logger.info("[insiderCheckJob] alert row inserted", { code: tx.code, pct });
    }

    logger.info("[insiderCheckJob] done", {
      rowsStored,
      streaks: streaks.length,
      alertsInserted,
    });

    return { rowsWritten: rowsStored + alertsInserted };
  });
}
