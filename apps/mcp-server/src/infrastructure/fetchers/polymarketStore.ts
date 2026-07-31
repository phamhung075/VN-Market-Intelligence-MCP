/**
 * Infrastructure — Polymarket SQLite Persistence
 *
 * Upserts fetched `PredictionMarket` snapshots into the `prediction_markets`
 * table. Split out of polymarket.ts (task FIX-CI-SIZELINT-MCPSERVER-SIX-
 * UNCOVERED-OFFENDERS AC-4) to bring that file back under its size-lint
 * baseline tolerance — re-exported from polymarket.ts so existing imports of
 * storePolymarketSnapshot from that path are unaffected.
 *
 * Layer: infrastructure/fetchers — may import config and db; must NOT import domain/.
 */

import { getDb } from "../db/schema.js";
import type { PredictionMarket } from "../../domain/services/predictionSignalDetector.js";

/**
 * Upserts a batch of `PredictionMarket` records into the `prediction_markets`
 * SQLite table (INSERT OR REPLACE — one row per market id).
 *
 * @param markets - Markets to persist (may be empty — no-op in that case).
 */
export async function storePolymarketSnapshot(markets: PredictionMarket[]): Promise<void> {
  if (markets.length === 0) return;

  const db = getDb();
  const stmt = db.prepare(`
    INSERT OR REPLACE INTO prediction_markets
      (id, question, end_date, yes_price, no_price, volume_24h, volume_total,
       liquidity, last_trade_price, unique_wallets, tags, fetched_at, updated_at)
    VALUES
      (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const now = new Date().toISOString();
  const insertMany = db.transaction((rows: PredictionMarket[]) => {
    for (const m of rows) {
      stmt.run(
        m.id,
        m.question,
        m.endDate,
        m.yesPrice,
        m.noPrice,
        m.volume24h,
        m.volumeTotal,
        m.liquidity,
        m.lastTradePrice,
        m.uniqueWalletsCount,
        JSON.stringify(m.tags),
        m.fetchedAt,
        now,
      );
    }
  });

  insertMany(markets);
}
