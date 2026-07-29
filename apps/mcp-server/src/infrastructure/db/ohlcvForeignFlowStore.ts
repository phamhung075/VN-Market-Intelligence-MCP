/**
 * ohlcvForeignFlowStore — ARCH-DAILY-FOREIGN-FLOW-TABLE / TASK_2002 (SUBTASK-DAILY-FF-3, writer cutover)
 *
 * Writes foreign flow data into the authoritative `daily_foreign_flow` table
 * (schema landed in TASK_2000/SUBTASK-DAILY-FF-1, commit fd1d19191; backfill
 * of legacy history landed in TASK_2001/SUBTASK-DAILY-FF-2, commit 878f5414a).
 *
 * UNCONDITIONAL UPSERT strategy (Option F — structural R-1 elimination):
 *   - Always `INSERT ... ON CONFLICT(code, date) DO UPDATE` — no dependency
 *     on a matching `daily_ohlcv` row. `changes` is always >= 1 per non-empty
 *     row; it can NEVER be 0 for a valid row (was the whole point of the
 *     retired merge-only strategy's `changes=0`-as-non-error contract — that
 *     contract is now vacuously satisfied because the deferred case cannot
 *     occur any more).
 *   - `daily_foreign_flow` has no NOT NULL price coupling (unlike
 *     `daily_ohlcv.close`), so there is nothing to defer.
 *
 * Root cause closed (structurally, not windowed): the prior merge-only
 * UPDATE-against-`daily_ohlcv` strategy (Option G, FIX-OHLCV-WRITER-SSOT-DURABLE)
 * dropped the write entirely (`changes=0`, debug log, no row created) whenever
 * no `daily_ohlcv` row existed yet for (code, date) — permanently discarding
 * every foreign-flow snapshot before the real OHLCV bar landed (or forever,
 * if it never landed that day: halt/delist/VPS outage). See
 * `feedback_foreign_flow_deferred_write_race_ohlcv_row.md` and
 * `docs/handoffs/ARCH-DAILY-FOREIGN-FLOW-TABLE-architect-design.md` § Context/R-1.
 *
 * ============================================================================
 * SSOT-FREEZE (R-7 mitigation) — daily_ohlcv.foreign_* columns are FROZEN
 * ============================================================================
 * As of this cutover, this function NO LONGER writes to any of
 * `daily_ohlcv.foreign_buy_vol / foreign_sell_vol / foreign_net_vol /
 * put_through_vol / foreign_buy_value / foreign_sell_value`. Those columns
 * are historical-only from this point forward — populated exactly once by
 * the TASK_2001 one-time backfill (`backfillDailyForeignFlow()` in
 * `./schema.ts`, wired into `initDatabase()`) and never again.
 *
 * Any FUTURE raw write to `daily_ohlcv.foreign_*` outside that one-time,
 * already-shipped backfill is an ARCHITECTURAL VIOLATION of this freeze and
 * must be escalated to the architect — same posture as the
 * `OHLCV-WRITE-BYPASS-ALLOWED` sentinel convention used for `daily_ohlcv`'s
 * price columns in `application/usecases/ohlcvWriteService.ts` (Writer G's
 * inventory row there should be read as superseded: this file no longer
 * touches `daily_ohlcv` at all, in any mode).
 *
 * Reads stay backward-compatible during the multi-file read-site migration
 * (SUBTASK-DAILY-FF-4 Class-A / SUBTASK-DAILY-FF-5 Class-B, both independent
 * follow-on subtasks) via the `daily_ohlcv_with_flow` COALESCE view (Change 3
 * of the design doc), which prefers this table's fresh values and falls back
 * to the frozen legacy columns only for rows this table has never seen.
 *
 * In short (SUBTASK-DAILY-FF-7, optional follow-on, annotation-only —
 * reiterated here per the R-7 mitigation for anyone landing on this file
 * without first reading the schema comment): `daily_ohlcv.foreign_buy_vol` /
 * `foreign_sell_vol` / `foreign_net_vol` / `put_through_vol` are DEPRECATED
 * in favor of `daily_foreign_flow` — frozen historical-only as of 2026-07-10,
 * never written by this function, and not intended to be written by any
 * future code path either. See also the matching schema comment on
 * `daily_ohlcv` in `./schema-market-data.ts`.
 *
 * Callers verified non-error on any `changes` value (unchanged since prior
 * strategy — no caller code change required by this cutover):
 *   - foreignFlowFetcher.ts L136-137, L219-220: const { changes } = await writeForeignFlowToOhlcv(...)
 *   - pushForeignFlowHandler.ts L318-320: ohlcvResult.changes logged, not thrown
 *
 * foreign_net_vol = foreignBuyVol - foreignSellVol (computed at write time,
 * unchanged from the prior strategy).
 */

import type { Database } from "bun:sqlite";
import type { WriteForeignFlowItem } from "../../domain/models/shared-types.js";

/** Simple logger shim — uses console.debug when no logger is injected. */
const logger = {
  debug: (msg: string, ctx?: Record<string, unknown>) => {
    if (process.env["NODE_ENV"] !== "test") {
      console.debug(msg, ctx ?? "");
    }
  },
};

/**
 * Persist foreign flow volumes for a set of (code, date) pairs into the
 * authoritative `daily_foreign_flow` table.
 *
 * UNCONDITIONAL UPSERT: unlike the retired merge-only `daily_ohlcv` UPDATE,
 * this `INSERT ... ON CONFLICT DO UPDATE` always lands regardless of whether
 * a `daily_ohlcv` row exists for (code, date) yet. `changes` is always >= 1
 * per row for a non-empty input — it can no longer be 0 for a valid row.
 *
 * @param rows - Foreign flow data items to write.
 * @param db   - SQLite Database instance (defaults to production getDb()).
 * @returns    - Object with total `changes` count across all upsert statements.
 *               `changes=0` only occurs for an empty `rows` array (no-op).
 */
export async function writeForeignFlowToOhlcv(
  rows: WriteForeignFlowItem[],
  db?: Database,
): Promise<{ changes: number }> {
  if (rows.length === 0) return { changes: 0 };

  // Lazy import to avoid pulling in production DB when a test injects its own db.
  const { getDb } = await import("./schema.js");
  const database = db ?? getDb();

  // ARCH-DAILY-FOREIGN-FLOW-TABLE / Change 2 (architect design doc): unconditional
  // upsert into the new authoritative table — no NOT NULL price coupling, so the
  // write structurally cannot be deferred. `changes` is always >= 1 per row.
  const stmt = database.prepare(
    `INSERT INTO daily_foreign_flow
       (code, date, foreign_buy_vol, foreign_sell_vol, foreign_net_vol, put_through_vol,
        foreign_buy_value, foreign_sell_value, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(code, date) DO UPDATE SET
       foreign_buy_vol    = excluded.foreign_buy_vol,
       foreign_sell_vol   = excluded.foreign_sell_vol,
       foreign_net_vol    = excluded.foreign_net_vol,
       put_through_vol    = excluded.put_through_vol,
       foreign_buy_value  = COALESCE(excluded.foreign_buy_value,  foreign_buy_value),
       foreign_sell_value = COALESCE(excluded.foreign_sell_value, foreign_sell_value),
       updated_at         = excluded.updated_at`,
  );

  // Read-only operational-visibility probe — does NOT gate the write above,
  // which always succeeds regardless of daily_ohlcv row presence. Kept purely
  // so operators can distinguish "foreign-flow arrived before the OHLCV bar"
  // from "foreign-flow arrived after" in logs, per R-7 mitigation note.
  const ohlcvProbe = database.prepare(
    `SELECT 1 FROM daily_ohlcv WHERE code = ? AND date = ? LIMIT 1`,
  );

  let totalChanges = 0;
  for (const row of rows) {
    const netVol = row.foreignBuyVol - row.foreignSellVol;
    const now = new Date().toISOString();
    const hasOhlcvRow = ohlcvProbe.get(row.code, row.date) !== null;

    logger.debug(
      `[ohlcvForeignFlowStore] writing daily_foreign_flow for ${row.code} ${row.date} (daily_ohlcv row ${hasOhlcvRow ? "already exists" : "not yet present"}) — write always succeeds, never deferred`,
      { code: row.code, date: row.date, hasOhlcvRow },
    );

    const result = stmt.run(
      row.code,
      row.date,
      row.foreignBuyVol,
      row.foreignSellVol,
      netVol,
      row.putThroughVol,
      row.foreignBuyValue ?? null,
      row.foreignSellValue ?? null,
      now,
    );

    totalChanges += result.changes;
  }

  return { changes: totalChanges };
}
