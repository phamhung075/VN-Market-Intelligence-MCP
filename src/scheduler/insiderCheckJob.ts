/**
 * Insider Check Job — Task 250
 *
 * Daily 19:00 GMT+7 (Mon-Fri): Fetch SSC insider transaction disclosures,
 * store new records, run leadership signal detection, send Telegram alerts
 * for HIGH/CRITICAL insider signals.
 *
 * Layer: interface/scheduler
 */

import { logger } from "../infrastructure/logger.js";
import { fetchInsiderTransactions } from "../infrastructure/fetchers/sscInsider.js";
import { createInsiderStore } from "../infrastructure/db/insiderStore.js";
import { getDb } from "../infrastructure/db/schema.js";
import {
  classifyInsiderTransaction,
  detectMassInsiderBuy,
  type InsiderTransaction,
} from "../domain/services/leadershipSignal.js";
import { sendTelegramMessage } from "../infrastructure/notifiers/telegram.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Default outstanding shares when per-stock data is not available. */
const DEFAULT_OUTSTANDING = 1_000_000_000; // 1 billion — conservative estimate

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
 *   5. Send Telegram alerts for HIGH/CRITICAL signals
 *
 * Never throws — all errors are logged.
 */
export async function runInsiderCheck(): Promise<void> {
  logger.info("[insiderCheckJob] starting insider transaction check");

  try {
    // ── Step 1: Fetch from SSC ─────────────────────────────────────────────
    const scraped = await fetchInsiderTransactions();
    logger.info("[insiderCheckJob] fetched transactions", {
      count: scraped.length,
    });

    if (scraped.length === 0) {
      logger.info("[insiderCheckJob] no new transactions — done");
      return;
    }

    // ── Step 2: Store ──────────────────────────────────────────────────────
    const db = getDb();
    const store = createInsiderStore(db);

    for (const tx of scraped) {
      try {
        store.insert(tx);
      } catch (err) {
        // Duplicate or constraint error — skip silently
        logger.debug("[insiderCheckJob] insert skipped", {
          code: tx.code,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    // ── Step 3: Classify individual signals ───────────────────────────────
    const allAlerts: string[] = [];

    // Map scraped tx to domain InsiderTransaction type
    const domainTxs: InsiderTransaction[] = scraped.map((t) => ({
      code: t.code,
      insiderName: t.insiderName,
      position: t.position as InsiderTransaction["position"],
      type: t.type,
      volume: t.volume,
      registeredVolume: t.registeredVolume,
      price: t.price,
      date: t.transactionDate,
    }));

    for (const tx of domainTxs) {
      const signal = classifyInsiderTransaction(tx, DEFAULT_OUTSTANDING);
      if (!signal) continue; // filtered out (< 0.1% threshold)

      if (signal.severity === "high" || signal.severity === "critical") {
        const emoji = signal.direction === "up" ? "↑" : "↓";
        const severity =
          signal.severity === "critical" ? "NGHIEM TRONG" : "QUAN TRONG";
        allAlerts.push(
          `[${severity}] Giao dich noi bo ${tx.code} ${emoji}\n` +
            `${signal.reasoning}`,
        );
      }
    }

    // ── Step 4: Mass insider buy detection ────────────────────────────────
    // Group by stock code
    const byCode = new Map<string, InsiderTransaction[]>();
    for (const tx of domainTxs) {
      const arr = byCode.get(tx.code) ?? [];
      arr.push(tx);
      byCode.set(tx.code, arr);
    }

    for (const [code, txs] of byCode.entries()) {
      const massSignal = detectMassInsiderBuy(txs, 30);
      if (massSignal && (massSignal.severity === "high" || massSignal.severity === "critical")) {
        allAlerts.push(
          `[QUAN TRONG] Tich luy noi bo ${code}\n` + massSignal.reasoning,
        );
      }
    }

    // ── Step 5: Send Telegram ──────────────────────────────────────────────
    if (allAlerts.length > 0) {
      const msg =
        `SSC Giao Dich Noi Bo — ${new Date().toLocaleDateString("vi-VN")}\n\n` +
        allAlerts.join("\n\n");
      await sendTelegramMessage(msg);
      logger.info("[insiderCheckJob] Telegram alert sent", {
        alertCount: allAlerts.length,
      });
    } else {
      logger.info("[insiderCheckJob] no HIGH/CRITICAL signals — no alert sent");
    }
  } catch (err) {
    logger.error("[insiderCheckJob] unexpected error", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}
