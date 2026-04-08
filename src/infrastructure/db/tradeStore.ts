/**
 * Infrastructure — Trade Exposure Store
 *
 * SQLite persistence for trade relationship data.
 * Seeded from hardcoded profiles on first run, then updated by:
 *   - MCP tool `update_trade_exposure` (AI agent or user)
 *   - Auto-learning from news (detectAndLearnTradeRelationship)
 *   - BCTC analysis (future)
 *
 * Table: trade_exposures
 *   code, market, revenue_pct, type, products, source, updated_at
 *
 * Layer: infrastructure/db
 */

import { getDb } from "./schema.js";
import { logger } from "../logger.js";

// Import seed data from domain
import type { TradeExposure, StockTradeProfile } from "../../domain/services/tradeRelationships.js";

// ─────────────────────────────────────────────────────────────────────────────
// Schema
// ─────────────────────────────────────────────────────────────────────────────

// trade_exposures DDL is now canonical in src/infrastructure/db/schema.ts (task 1043).
// ensureTable() is a no-op retained for call-site backward compat.
function ensureTable(): void {
  // DDL created by initDatabase() — nothing to do here.
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed from hardcoded profiles (only if table is empty)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Seeds trade_exposures table from hardcoded domain profiles.
 * Only runs if the table is empty (first startup).
 */
export function seedTradeProfiles(profiles: StockTradeProfile[]): void {
  ensureTable();
  const db = getDb();

  const count = db.query<{ cnt: number }, []>(
    "SELECT COUNT(*) as cnt FROM trade_exposures",
  ).get();

  if ((count?.cnt ?? 0) > 0) return; // already seeded

  const now = new Date().toISOString();
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO trade_exposures (code, market, revenue_pct, type, products, source, updated_at)
     VALUES (?, ?, ?, ?, ?, 'seed', ?)`,
  );

  const insertAll = db.transaction((items: { code: string; exp: TradeExposure }[]) => {
    for (const { code, exp } of items) {
      stmt.run(code, exp.market, exp.revenuePct, exp.type, exp.products, now);
    }
  });

  const items = profiles.flatMap((p) =>
    p.exposures.map((exp) => ({ code: p.code, exp })),
  );
  insertAll(items);

  logger.info("[tradeStore] seeded trade profiles", {
    stocks: profiles.length,
    exposures: items.length,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// CRUD operations
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Get all trade exposures for a stock.
 */
export function getTradeExposures(code: string): TradeExposure[] {
  ensureTable();
  const db = getDb();
  const rows = db
    .query<{ market: string; revenue_pct: number; type: string; products: string }, [string]>(
      "SELECT market, revenue_pct, type, products FROM trade_exposures WHERE code = ? ORDER BY revenue_pct DESC",
    )
    .all(code);

  return rows.map((r) => ({
    market: r.market,
    revenuePct: r.revenue_pct,
    type: r.type as TradeExposure["type"],
    products: r.products,
  }));
}

/**
 * Get all stocks exposed to a specific country/market.
 */
export function getStocksByMarket(
  market: string,
  minPct = 3,
): { code: string; revenuePct: number; type: string; products: string }[] {
  ensureTable();
  const db = getDb();
  return db
    .query<{ code: string; revenue_pct: number; type: string; products: string }, [string, number]>(
      `SELECT code, revenue_pct, type, products FROM trade_exposures
       WHERE market = ? AND revenue_pct >= ?
       ORDER BY revenue_pct DESC`,
    )
    .all(market, minPct)
    .map((r) => ({
      code: r.code,
      revenuePct: r.revenue_pct,
      type: r.type,
      products: r.products,
    }));
}

/**
 * Update or insert a trade exposure.
 * Called by AI agent via MCP tool or by auto-learning.
 *
 * @param source - Who updated: "agent", "news_auto", "bctc_auto", "user"
 */
export function upsertTradeExposure(
  code: string,
  market: string,
  revenuePct: number,
  type: string,
  products: string,
  source: string,
): void {
  ensureTable();
  const db = getDb();
  const now = new Date().toISOString();

  db.run(
    `INSERT INTO trade_exposures (code, market, revenue_pct, type, products, source, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code, market) DO UPDATE SET
       revenue_pct = excluded.revenue_pct,
       type = excluded.type,
       products = excluded.products,
       source = excluded.source,
       updated_at = excluded.updated_at`,
    [code, market, revenuePct, type, products, source, now],
  );

  logger.info("[tradeStore] upserted trade exposure", { code, market, revenuePct, source });
}

// ─────────────────────────────────────────────────────────────────────────────
// Auto-learning from news text
// ─────────────────────────────────────────────────────────────────────────────

/** Patterns that indicate trade relationship mentions in news. */
const TRADE_PATTERNS = [
  // Stock code = 2-4 UPPERCASE letters at word boundary
  /\b([A-Z]{2,4})\b[\s\S]{0,20}(?:ký|signs?|signed)[\s\S]{0,40}(?:với|with)[\s\S]{0,30}(japan|nhật|us |mỹ|china|trung quốc|korea|hàn|eu |châu âu)/i,
  /\b([A-Z]{2,4})\b[\s\S]{0,20}(?:xuất khẩu|exports?)[\s\S]{0,30}(?:sang|to)\s+(japan|nhật|us |mỹ|china|trung quốc|korea|hàn quốc|eu |châu âu|middle east|trung đông|asean)/i,
  /\b([A-Z]{2,4})\b[\s\S]{0,20}(?:mở rộng|expands?)[\s\S]{0,30}(?:tại|in|sang|to)\s+(japan|nhật|us |mỹ|china|eu |asean|đông nam á)/i,
  /\b([A-Z]{2,4})\b[\s\S]{0,30}(?:hợp đồng|contract|deal)[\s\S]{0,30}(japan|nhật bản|us |mỹ|china|trung quốc|eu |châu âu|korea|hàn quốc)/i,
];

/**
 * Scans news text for trade relationship mentions and auto-updates the DB.
 * Called from pollNews on every new article (best-effort).
 *
 * @param text - News title + content
 * @param watchlistCodes - Only learn for watchlist stocks
 */
export function detectAndLearnTradeRelationship(
  text: string,
  watchlistCodes: Set<string>,
): void {
  for (const pattern of TRADE_PATTERNS) {
    const match = text.match(pattern);
    if (!match) continue;

    const code = match[1]!.toUpperCase();
    if (!watchlistCodes.has(code)) continue;

    const countryRaw = match[2]!.toLowerCase();

    // Map to standard country key
    let market: string | null = null;
    if (countryRaw.includes("japan") || countryRaw.includes("nhật")) market = "japan";
    else if (countryRaw.includes("us") || countryRaw.includes("mỹ")) market = "us";
    else if (countryRaw.includes("china") || countryRaw.includes("trung quốc")) market = "china";
    else if (countryRaw.includes("korea") || countryRaw.includes("hàn")) market = "korea";
    else if (countryRaw.includes("eu") || countryRaw.includes("châu âu")) market = "eu";
    else if (countryRaw.includes("asean") || countryRaw.includes("đông nam á")) market = "asean";
    else if (countryRaw.includes("middle east") || countryRaw.includes("trung đông")) market = "middle_east";

    if (!market) continue;

    // Don't overwrite seed data with unknown revenue — just add as "detected"
    try {
      const existing = getTradeExposures(code).find((e) => e.market === market);
      if (!existing) {
        upsertTradeExposure(code, market, 1, "export", `Detected from news: ${text.slice(0, 80)}`, "news_auto");
      }
    } catch {
      // best-effort
    }
  }
}
