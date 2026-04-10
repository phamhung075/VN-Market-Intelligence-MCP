/**
 * Task 179 — Position Store
 *
 * SQLite CRUD helpers for the `positions` table.
 *
 * All prices in VND (not million VND — positions use raw VND to match
 * the market_prices table which stores raw VND prices).
 *
 * @module infrastructure/db/positionStore
 */

import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Raw SQLite row from the positions table. */
export interface PositionRow {
  id: number;
  code: string;
  shares: number;
  avg_price: number;
  opened_at: string;
  closed_at: string | null;
  notes: string | null;
}

/** Enriched position with live P&L data. */
export interface PositionWithPnl {
  id: number;
  code: string;
  shares: number;
  /** Average purchase price in VND. */
  avgPrice: number;
  openedAt: string;
  notes: string | null;
  /** Latest price from market_prices table, or null if unavailable. */
  currentPrice: number | null;
  /** Total cost basis = shares × avgPrice. */
  costBasis: number;
  /** Current market value = shares × currentPrice (0 if no price). */
  currentValue: number;
  /** Unrealized P&L amount in VND (0 if no current price). */
  unrealizedPnl: number;
  /** Unrealized P&L as a percentage of cost basis (0 if no current price). */
  unrealizedPnlPct: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// upsertPosition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Insert or update a position.
 *
 * Upsert logic: if a row with the same `code` already exists (open or closed),
 * update shares, avg_price, and notes. The UNIQUE(code) constraint drives the
 * ON CONFLICT clause.
 *
 * @throws {Error} if shares <= 0 or avgPrice <= 0.
 */
export function upsertPosition(
  db: Database,
  opts: { code: string; shares: number; avgPrice: number; notes?: string },
): void {
  const { code, shares, avgPrice, notes } = opts;

  if (shares <= 0) {
    throw new Error(`[upsertPosition] shares must be > 0, got ${shares}`);
  }
  if (avgPrice <= 0) {
    throw new Error(`[upsertPosition] avgPrice must be > 0, got ${avgPrice}`);
  }
  // Unit-sanity guard: VN stocks trade in raw VND (>= 1,000). A value
  // below this almost always means the caller passed "thousands VND"
  // (e.g. 80.3 instead of 80300) — reject loudly rather than silently
  // produce absurd P&L like +97,409% (report #1069).
  if (avgPrice < 1000) {
    throw new Error(
      `[upsertPosition] avgPrice ${avgPrice} is implausibly small for a VN stock — ` +
        `prices are in raw VND (e.g. 80300, not 80.3). Reject to prevent unit mismatch.`,
    );
  }

  db.prepare(
    `INSERT INTO positions (code, shares, avg_price, opened_at, notes)
     VALUES (?, ?, ?, datetime('now'), ?)
     ON CONFLICT(code) DO UPDATE SET
       shares    = excluded.shares,
       avg_price = excluded.avg_price,
       notes     = COALESCE(excluded.notes, positions.notes),
       closed_at = NULL`,
  ).run(code.toUpperCase(), shares, avgPrice, notes ?? null);
}

// ─────────────────────────────────────────────────────────────────────────────
// listOpenPositions
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Return all open positions (closed_at IS NULL) enriched with live P&L data
 * from the market_prices table.
 *
 * If no market price is available for a stock, currentPrice is null and
 * unrealizedPnl / unrealizedPnlPct are returned as 0.
 */
export function listOpenPositions(db: Database): PositionWithPnl[] {
  const rows = db
    .prepare<PositionRow & { current_price: number | null }, []>(
      `SELECT p.*,
              COALESCE(
                (SELECT mp.price FROM market_prices mp WHERE mp.code = p.code AND mp.price IS NOT NULL AND mp.price > 0),
                (SELECT d.close FROM daily_ohlcv d WHERE d.code = p.code ORDER BY d.date DESC LIMIT 1)
              ) AS current_price
       FROM positions p
       WHERE p.closed_at IS NULL
       ORDER BY p.opened_at ASC`,
    )
    .all();

  return rows.map((r) => {
    const costBasis = r.shares * r.avg_price;
    const currentPrice = r.current_price ?? null;
    const currentValue = currentPrice != null ? r.shares * currentPrice : 0;
    const unrealizedPnl = currentPrice != null ? currentValue - costBasis : 0;
    const unrealizedPnlPct =
      currentPrice != null && costBasis > 0
        ? (unrealizedPnl / costBasis) * 100
        : 0;

    return {
      id: r.id,
      code: r.code,
      shares: r.shares,
      avgPrice: r.avg_price,
      openedAt: r.opened_at,
      notes: r.notes,
      currentPrice,
      costBasis,
      currentValue,
      unrealizedPnl,
      unrealizedPnlPct,
    };
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// closePosition
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Mark a position as closed by setting `closed_at = datetime('now')`.
 *
 * @returns true if the position existed and was closed, false otherwise.
 */
export function closePosition(db: Database, code: string): boolean {
  const result = db
    .prepare(
      `UPDATE positions SET closed_at = datetime('now')
       WHERE code = ? AND closed_at IS NULL`,
    )
    .run(code.toUpperCase());

  return result.changes > 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// Task 1070 — Position Ledger Commands
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Input for the unified position command dispatcher.
 *
 * - `qty > 0`  → buy
 * - `qty < 0`  → sell (clamped to holdings)
 * - `price == 0 && qty == 0` → clear
 */
export interface PositionCommandInput {
  /** Ticker symbol, e.g. "VCB". Case-insensitive — normalised to uppercase internally. */
  ticker: string;
  /** Price in raw VND (>= 0). */
  price: number;
  /** Share count. Positive = buy, negative = sell, 0 = clear (when price also 0). */
  qty: number;
}

/**
 * Result returned by all position command functions.
 * `message` is a Vietnamese explanation of what happened.
 */
export interface PositionCommandResult {
  ok: boolean;
  message: string;
  /** Present and `true` when a sell was clamped to current holdings. */
  clamped?: boolean;
}

/**
 * Buy shares — computes weighted-average cost and upserts the position.
 *
 * Formula: `avg_price = Math.round((old_shares * old_avg + qty * price) / (old_shares + qty))`
 *
 * If no open position exists the price becomes the initial avg cost.
 *
 * @param db    Database connection
 * @param code  Ticker symbol (case-insensitive)
 * @param price Purchase price in raw VND
 * @param qty   Number of shares to buy (must be > 0)
 */
export function buyPosition(
  db: Database,
  code: string,
  price: number,
  qty: number,
): PositionCommandResult {
  const upper = code.toUpperCase();

  // Read existing open position (if any)
  const existing = db
    .prepare<Pick<PositionRow, "shares" | "avg_price">, [string]>(
      `SELECT shares, avg_price FROM positions WHERE code = ? AND closed_at IS NULL`,
    )
    .get(upper);

  let newShares: number;
  let newAvg: number;
  let message: string;

  if (existing == null || existing.shares === 0) {
    // First buy — use purchase price as avg cost
    newShares = qty;
    newAvg = price;
    message = `Mua ${qty} CP @ ${price} VND → vị thế mới tạo, avg cost: ${price} VND`;
  } else {
    newShares = existing.shares + qty;
    newAvg = Math.round((existing.shares * existing.avg_price + qty * price) / newShares);
    message = `Mua thêm ${qty} @ ${price} VND → avg cost mới: ${newAvg} VND (tổng ${newShares} CP)`;
  }

  upsertPosition(db, { code: upper, shares: newShares, avgPrice: newAvg });

  return { ok: true, message };
}

/**
 * Sell shares — reduces holdings (clamped to current shares).
 *
 * - `avg_price` is **not** changed on partial sells.
 * - If resulting shares == 0, `closePosition` is called.
 *
 * @param db    Database connection
 * @param code  Ticker symbol (case-insensitive)
 * @param price Sale price in raw VND
 * @param qty   Number of shares to sell (must be > 0; supply the absolute value)
 */
export function sellPosition(
  db: Database,
  code: string,
  price: number,
  qty: number,
): PositionCommandResult {
  const upper = code.toUpperCase();
  const sellQty = Math.abs(qty); // normalise in case caller passes negative

  // Read existing open position
  const existing = db
    .prepare<Pick<PositionRow, "shares" | "avg_price">, [string]>(
      `SELECT shares, avg_price FROM positions WHERE code = ? AND closed_at IS NULL`,
    )
    .get(upper);

  const currentShares = existing?.shares ?? 0;

  if (sellQty > currentShares) {
    // Clamped: trying to sell MORE than current holdings
    closePosition(db, upper);
    return {
      ok: true,
      clamped: true,
      message: `Chỉ bán được ${currentShares} CP (không đủ số lượng) → đã thanh lý toàn bộ vị thế`,
    };
  }

  if (sellQty === currentShares) {
    // Exact liquidation: sell precisely the full position
    closePosition(db, upper);
    return {
      ok: true,
      message: `Bán ${sellQty} CP @ ${price} VND → đã thanh lý toàn bộ vị thế`,
    };
  }

  // Partial sell: update shares, avg_price stays the same
  const remaining = currentShares - sellQty;
  const avgPrice = existing!.avg_price;

  upsertPosition(db, { code: upper, shares: remaining, avgPrice });

  return {
    ok: true,
    message: `Bán ${sellQty} CP @ ${price} VND → còn lại ${remaining} CP @ ${avgPrice} VND`,
  };
}

/**
 * Clear a position — marks it closed regardless of shares held.
 *
 * @param db    Database connection
 * @param code  Ticker symbol (case-insensitive)
 */
export function clearPosition(
  db: Database,
  code: string,
): PositionCommandResult {
  const upper = code.toUpperCase();
  closePosition(db, upper);
  return { ok: true, message: `Đã xóa toàn bộ vị thế ${upper}` };
}

/**
 * Unified dispatcher — routes to buyPosition / sellPosition / clearPosition
 * based on the sign of `qty` and whether `price` is zero.
 *
 * Routing:
 * - `qty > 0`                    → buyPosition
 * - `qty < 0`                    → sellPosition (abs qty)
 * - `price == 0 && qty == 0`     → clearPosition
 * - `qty == 0 && price > 0`      → error (invalid input)
 *
 * @param db    Database connection
 * @param input `{ ticker, price, qty }`
 */
export function applyPositionCommand(
  db: Database,
  input: PositionCommandInput,
): PositionCommandResult {
  const { ticker, price, qty } = input;

  if (qty > 0) {
    return buyPosition(db, ticker, price, qty);
  }

  if (qty < 0) {
    return sellPosition(db, ticker, price, Math.abs(qty));
  }

  // qty === 0
  if (price === 0) {
    return clearPosition(db, ticker);
  }

  // qty === 0 && price > 0 — invalid
  return {
    ok: false,
    message: `Không hợp lệ: qty=0 khi price > 0. Để xóa vị thế dùng price=0 qty=0.`,
  };
}
