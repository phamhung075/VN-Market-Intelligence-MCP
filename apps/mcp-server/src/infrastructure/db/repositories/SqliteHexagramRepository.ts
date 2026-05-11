// apps/mcp-server/src/infrastructure/db/repositories/SqliteHexagramRepository.ts
// Task 1838b — SQLite adapter for IHexagramRepository.
// Wraps existing hexagramStore queries verbatim. No schema changes.

import type { Database } from "bun:sqlite";
import type {
  IHexagramRepository,
  KinhDichReadingRow,
  TransitionRow,
} from "../../../domain/repositories/IHexagramRepository.js";

export class SqliteHexagramRepository implements IHexagramRepository {
  constructor(private readonly db: Database) {}

  storeReading(row: KinhDichReadingRow): void {
    try {
      this.db
        .prepare(
          `INSERT INTO kinhdich_readings (
             stock_code, hexagram_number, ho_que_number, bien_que_number,
             hao_states, raw_scores, ngu_hanh_dynamic, trading_signal,
             confidence, action_note, source
           ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          row.stockCode,
          row.hexagramNumber,
          row.hoQueNumber,
          row.bienQueNumber,
          row.haoStates,
          row.rawScores,
          row.nguHanhDynamic ?? null,
          row.tradingSignal ?? null,
          row.confidence ?? null,
          row.actionNote ?? null,
          row.source ?? "manual",
        );
    } catch {
      // best-effort — table may not exist yet
    }
  }

  getLatestReading(stockCode: string): KinhDichReadingRow | null {
    try {
      const row = this.db
        .prepare(
          `SELECT hexagram_number, ho_que_number, bien_que_number, hao_states,
                  raw_scores, ngu_hanh_dynamic, trading_signal, confidence, action_note, source
           FROM kinhdich_readings
           WHERE stock_code = ?
           ORDER BY timestamp DESC
           LIMIT 1`,
        )
        .get(stockCode) as {
          hexagram_number: number;
          ho_que_number: number;
          bien_que_number: number;
          hao_states: string;
          raw_scores: string;
          ngu_hanh_dynamic: string | null;
          trading_signal: string | null;
          confidence: number | null;
          action_note: string | null;
          source: string | null;
        } | null;

      if (!row) return null;

      return {
        stockCode,
        hexagramNumber: row.hexagram_number,
        hoQueNumber: row.ho_que_number,
        bienQueNumber: row.bien_que_number,
        haoStates: row.hao_states,
        rawScores: row.raw_scores,
        ...(row.ngu_hanh_dynamic != null ? { nguHanhDynamic: row.ngu_hanh_dynamic } : {}),
        ...(row.trading_signal != null ? { tradingSignal: row.trading_signal } : {}),
        ...(row.confidence != null ? { confidence: row.confidence } : {}),
        ...(row.action_note != null ? { actionNote: row.action_note } : {}),
        ...(row.source != null ? { source: row.source as 'manual' | 'cycle' } : {}),
      } as KinhDichReadingRow;
    } catch {
      return null;
    }
  }

  recordTransition(stockCode: string, fromHexagram: number, toHexagram: number): void {
    try {
      this.db
        .prepare(
          `INSERT OR IGNORE INTO hexagram_transitions
             (from_hexagram, to_hexagram, stock_code, count, total_price_change_5d, win_count)
           VALUES (?, ?, ?, 0, 0, 0)`,
        )
        .run(fromHexagram, toHexagram, stockCode);

      this.db
        .prepare(
          `UPDATE hexagram_transitions
           SET count = count + 1,
               last_seen = datetime('now')
           WHERE from_hexagram = ? AND to_hexagram = ? AND stock_code = ?`,
        )
        .run(fromHexagram, toHexagram, stockCode);
    } catch {
      // best-effort
    }
  }

  getTopTransitions(stockCode: string, fromHexagram: number, topN: number): TransitionRow[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT from_hexagram, to_hexagram, count
           FROM hexagram_transitions
           WHERE from_hexagram = ? AND stock_code = ? AND count > 0
           ORDER BY count DESC
           LIMIT ?`,
        )
        .all(fromHexagram, stockCode, topN) as Array<{
          from_hexagram: number;
          to_hexagram: number;
          count: number;
        }>;

      return rows.map((r) => ({
        fromHexagram: r.from_hexagram,
        toHexagram: r.to_hexagram,
        count: r.count,
      }));
    } catch {
      return [];
    }
  }

  getReadingsForBacktest(stockCode: string): KinhDichReadingRow[] {
    try {
      const rows = this.db
        .prepare(
          `SELECT hexagram_number, ho_que_number, bien_que_number, hao_states,
                  raw_scores, ngu_hanh_dynamic, trading_signal, confidence, action_note, source
           FROM kinhdich_readings
           WHERE stock_code = ?
           ORDER BY timestamp ASC`,
        )
        .all(stockCode) as Array<{
          hexagram_number: number;
          ho_que_number: number;
          bien_que_number: number;
          hao_states: string;
          raw_scores: string;
          ngu_hanh_dynamic: string | null;
          trading_signal: string | null;
          confidence: number | null;
          action_note: string | null;
          source: string | null;
        }>;

      return rows.map((r) => ({
        stockCode,
        hexagramNumber: r.hexagram_number,
        hoQueNumber: r.ho_que_number,
        bienQueNumber: r.bien_que_number,
        haoStates: r.hao_states,
        rawScores: r.raw_scores,
        ...(r.ngu_hanh_dynamic != null ? { nguHanhDynamic: r.ngu_hanh_dynamic } : {}),
        ...(r.trading_signal != null ? { tradingSignal: r.trading_signal } : {}),
        ...(r.confidence != null ? { confidence: r.confidence } : {}),
        ...(r.action_note != null ? { actionNote: r.action_note } : {}),
        ...(r.source != null ? { source: r.source as 'manual' | 'cycle' } : {}),
      } as KinhDichReadingRow));
    } catch {
      return [];
    }
  }
}
