/**
 * kinhDichSignalsHandler.ts — GET /api/kinh-dich-signals
 *
 * TASK17-PAGE11 — "Tín hiệu Kinh Dịch" (I-Ching hexagram trading signals per stock).
 *
 * Key design constraint: STORED DATA ONLY — no live network fan-out.
 * Fast, deterministic read from `kinhdich_readings` table.
 * NOT the same as any kinh-dich-service microservice call.
 *
 * Source table: kinhdich_readings (read via kinhDichStore — infrastructure).
 * This handler maps + aggregates only — NO SQL here.
 *
 * trading_signal TAXONOMY — accent-folding hazard:
 *   Values appear in BOTH accented AND ASCII-folded encodings.
 *   Observed distinct values (38,430 rows, 2026-06-11 probe):
 *     "MUA (tich cuc)"        10586  |  "MUA (tích cực)"       5127
 *     "MUA (tieu cuc)"          145  |  "MUA (tiêu cực)"         84
 *     "THAN TRONG (tích cực)" 5560   |  "THAN TRONG (tich cuc)"  1513
 *     "THAN TRONG (tieu cuc)"  204   |  "THAN TRONG (tiêu cực)"    30
 *     "GIU (tích cực)"        3597   |  "GIU (tiêu cực)"        2611
 *     "GIU (tich cuc)"        2535   |  "GIU (tieu cuc)"         1881
 *     "BAN (tich cuc)"        2247   |  "BAN (tiêu cực)"         1450
 *     "BAN (tích cực)"         296   |  "BAN (tieu cuc)"           260
 *     "CHO (tich cuc)"         268   |  "CHO (tích cực)"            32
 *     "CHO (tiêu cực)"           3   |  "CHO (tieu cuc)"             1
 *
 * PARSE RULE (implemented in parseSignal()):
 *   action  = token(s) before " (" — one of MUA|BAN|GIU|THAN TRONG|CHO; else UNKNOWN
 *   sentiment = text inside "(…)" accent-normalized:
 *     /tic[h]? *c[uự]c/ → "positive"
 *     /ti[eê]u *c[uự]c/ → "negative"
 *     else → "neutral"
 *
 * Query params:
 *   ?source=cycle|manual|all  (default "cycle")
 *
 * Response shape (200 OK):
 *   {
 *     generatedAt: string ISO,
 *     tradingDate: string,            // date portion of MAX(timestamp) in snapshot, "" when empty
 *     source: "cycle"|"manual"|"all",
 *     snapshot: [
 *       { stockCode, timestamp, hexagramNumber, hoQueNumber, bienQueNumber,
 *         hexagramName, action, sentiment, trend, confidence, actionNote, source }
 *     ],
 *     flips: [ { stockCode, fromAction, toAction, toSentiment, confidence, timestamp } ],
 *     summary: {
 *       symbols, mua, ban, giu, thanTrong, cho, unknown,
 *       positive, negative, neutral,
 *       avgConfidence: number|null,
 *       topBuy:  [ up to 5 snapshot items action=MUA, confidence DESC ],
 *       topSell: [ up to 5 snapshot items action=BAN, confidence DESC ]
 *     },
 *     count: number
 *   }
 *
 * actionPriority sort order: MUA(0) < THAN TRONG(1) < GIU(2) < CHO(3) < BAN(4) < UNKNOWN(5)
 * tie-break: confidence DESC, then stockCode ASC
 *
 * 200-on-empty (empty snapshot/flips, zeroed summary, avgConfidence null).
 * 500 JSON on DB error (mirrors foreignFlowHandler catch). db injected by server.ts.
 *
 * DDD Layer: interface — db injected by server.ts (no getDb() call here).
 * Imports ONLY from kinhDichStore (infrastructure/db) — no domain imports.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import {
  getLatestReadingsPerSymbol,
  getPreviousReadingsPerSymbol,
  type KinhDichRow,
} from "../../../infrastructure/db/kinhDichStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TOP_LIST_SIZE = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Normalised action — one of the 5 known actions or UNKNOWN. */
export type KinhDichAction = "MUA" | "BAN" | "GIU" | "THAN TRONG" | "CHO" | "UNKNOWN";

/** Normalised sentiment. */
export type KinhDichSentiment = "positive" | "negative" | "neutral";

/** Result of parseSignal(). */
export interface ParsedSignal {
  action: KinhDichAction;
  sentiment: KinhDichSentiment;
}

/** One item in the snapshot array. */
export interface SnapshotItem {
  stockCode: string;
  timestamp: string;
  hexagramNumber: number;
  hoQueNumber: number;
  bienQueNumber: number;
  /** Hexagram name extracted from action_note ("Quẻ … ("), e.g. "Tập Khảm". "" if not parseable. */
  hexagramName: string;
  action: KinhDichAction;
  sentiment: KinhDichSentiment;
  /** Trend from action_note after "xu hướng: " → "THUẬN LỢI"|"BẤT LỢI"|"TRUNG TÍNH"|"" */
  trend: string;
  confidence: number | null;
  actionNote: string;
  source: string;
}

/** One flip item (signal changed between previous and latest reading). */
export interface FlipItem {
  stockCode: string;
  fromAction: KinhDichAction;
  toAction: KinhDichAction;
  toSentiment: KinhDichSentiment;
  confidence: number | null;
  timestamp: string;
}

/** Summary block in response. */
export interface KinhDichSummary {
  symbols: number;
  mua: number;
  ban: number;
  giu: number;
  thanTrong: number;
  cho: number;
  unknown: number;
  positive: number;
  negative: number;
  neutral: number;
  avgConfidence: number | null;
  topBuy: SnapshotItem[];
  topSell: SnapshotItem[];
}

/** Full response body for GET /api/kinh-dich-signals. */
export interface KinhDichSignalsResponse {
  generatedAt: string;
  tradingDate: string;
  source: "cycle" | "manual" | "all";
  snapshot: SnapshotItem[];
  flips: FlipItem[];
  summary: KinhDichSummary;
  count: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Pure helpers — exported for unit testing
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Accent-normalise a Vietnamese string for case-insensitive matching.
 * Strips common diacritics so that "tích cực" and "tich cuc" both normalise
 * to the same ASCII form for regex matching.
 *
 * Approach: replace known Vietnamese diacritic combos with their ASCII base.
 * Only the characters needed for the sentiment taxonomy are handled.
 */
function foldViet(s: string): string {
  return s
    .toLowerCase()
    // ư/ướ/ứ/ừ/ử/ự → u
    .replace(/[ưừứửữự]/g, "u")
    // ô/ố/ồ/ổ/ỗ/ộ → o
    .replace(/[ôồốổỗộ]/g, "o")
    // ê/ề/ế/ể/ễ/ệ → e
    .replace(/[êềếểễệ]/g, "e")
    // à/á/ả/ã/ạ/ă/ằ/ắ/ẳ/ẵ/ặ/â/ầ/ấ/ẩ/ẫ/ậ → a
    .replace(/[àáảãạăằắẳẵặâầấẩẫậ]/g, "a")
    // ị/í/ì/ỉ/ĩ → i
    .replace(/[ịíìỉĩ]/g, "i")
    // ọ/ò/ó/ỏ/õ → o (non-ô already covered above)
    .replace(/[ọòóỏõ]/g, "o")
    // ụ/ù/ú/ủ/ũ → u (non-ư already covered above)
    .replace(/[ụùúủũ]/g, "u")
    // đ → d
    .replace(/đ/g, "d");
}

/**
 * Parse a trading_signal string into { action, sentiment }.
 *
 * action: token(s) BEFORE the first " (" in the signal string,
 *   case-insensitively matched against known actions:
 *   MUA | BAN | GIU | THAN TRONG (two words) | CHO | → UNKNOWN
 *
 * sentiment: text inside "(...)", accent-normalised:
 *   matches folded /tich *cuc/ → "positive"
 *   matches folded /tieu *cuc/ → "negative"
 *   else → "neutral"
 *
 * Handles all accent variants observed in the live DB:
 *   "MUA (tich cuc)", "MUA (tích cực)", "MUA (tiêu cực)", ...
 *   "THAN TRONG (tích cực)", "THAN TRONG (tich cuc)", ...
 *   etc.
 *
 * Exported for unit testing.
 */
export function parseSignal(tradingSignal: string | null): ParsedSignal {
  if (!tradingSignal) return { action: "UNKNOWN", sentiment: "neutral" };

  const parenIdx = tradingSignal.indexOf(" (");
  const rawAction = parenIdx >= 0
    ? tradingSignal.slice(0, parenIdx).trim().toUpperCase()
    : tradingSignal.trim().toUpperCase();

  let action: KinhDichAction;
  // THAN TRONG must be tested before single-word actions (two words with space)
  if (rawAction === "THAN TRONG") {
    action = "THAN TRONG";
  } else if (rawAction === "MUA") {
    action = "MUA";
  } else if (rawAction === "BAN") {
    action = "BAN";
  } else if (rawAction === "GIU") {
    action = "GIU";
  } else if (rawAction === "CHO") {
    action = "CHO";
  } else {
    action = "UNKNOWN";
  }

  let sentiment: KinhDichSentiment = "neutral";
  if (parenIdx >= 0) {
    const closeIdx = tradingSignal.indexOf(")", parenIdx);
    const inside = closeIdx >= 0
      ? tradingSignal.slice(parenIdx + 2, closeIdx)
      : tradingSignal.slice(parenIdx + 2);
    const folded = foldViet(inside);
    if (/tich *cuc/.test(folded)) {
      sentiment = "positive";
    } else if (/tieu *cuc/.test(folded)) {
      sentiment = "negative";
    }
  }

  return { action, sentiment };
}

/**
 * Extract the hexagram name from action_note.
 * Pattern: text between "Quẻ " and the next " (" in action_note.
 * Example: "KHUYẾN NGHỊ: BAN — Quẻ Tập Khảm (29) tiêu cực..."
 *   → "Tập Khảm"
 * Falls back to "" if not parseable.
 *
 * Exported for unit testing.
 */
export function extractHexagramName(actionNote: string | null): string {
  if (!actionNote) return "";
  const queIdx = actionNote.indexOf("Quẻ ");
  if (queIdx < 0) return "";
  const afterQue = actionNote.slice(queIdx + 4); // skip "Quẻ "
  const parenIdx = afterQue.indexOf(" (");
  if (parenIdx < 0) return afterQue.trim();
  return afterQue.slice(0, parenIdx).trim();
}

/**
 * Extract the trend from action_note.
 * Pattern: text after "xu hướng: " up to the next "." (or end of string).
 * Example: "...xu hướng: BẤT LỢI. Độ..." → "BẤT LỢI"
 * Falls back to "".
 *
 * Exported for unit testing.
 */
export function extractTrend(actionNote: string | null): string {
  if (!actionNote) return "";
  // Match both accented "hướng" and possible fallback
  const marker = "xu hướng: ";
  const idx = actionNote.indexOf(marker);
  if (idx < 0) return "";
  const after = actionNote.slice(idx + marker.length);
  const dotIdx = after.indexOf(".");
  return (dotIdx >= 0 ? after.slice(0, dotIdx) : after).trim();
}

/**
 * Return the action priority sort number.
 * MUA(0) < THAN TRONG(1) < GIU(2) < CHO(3) < BAN(4) < UNKNOWN(5)
 *
 * Exported for unit testing.
 */
export function actionPriority(action: KinhDichAction): number {
  switch (action) {
    case "MUA":       return 0;
    case "THAN TRONG": return 1;
    case "GIU":       return 2;
    case "CHO":       return 3;
    case "BAN":       return 4;
    default:          return 5;
  }
}

/**
 * Map a single KinhDichRow to a SnapshotItem.
 * Exported for unit testing.
 */
export function mapRowToSnapshot(row: KinhDichRow): SnapshotItem {
  const { action, sentiment } = parseSignal(row.trading_signal);
  return {
    stockCode: row.stock_code,
    timestamp: row.timestamp,
    hexagramNumber: row.hexagram_number,
    hoQueNumber: row.ho_que_number,
    bienQueNumber: row.bien_que_number,
    hexagramName: extractHexagramName(row.action_note),
    action,
    sentiment,
    trend: extractTrend(row.action_note),
    confidence: row.confidence ?? null,
    actionNote: row.action_note ?? "",
    source: row.source,
  };
}

/**
 * Sort snapshot by actionPriority ASC, then confidence DESC (null last), then stockCode ASC.
 * Returns a new array (does not mutate input).
 * Exported for unit testing.
 */
export function sortSnapshot(items: SnapshotItem[]): SnapshotItem[] {
  return [...items].sort((a, b) => {
    const pa = actionPriority(a.action);
    const pb = actionPriority(b.action);
    if (pa !== pb) return pa - pb;

    // confidence DESC — null sorts last
    const ca = a.confidence ?? -Infinity;
    const cb = b.confidence ?? -Infinity;
    if (cb !== ca) return cb - ca;

    return a.stockCode.localeCompare(b.stockCode);
  });
}

/**
 * Detect signal flips: symbols whose latest action !== previous action.
 * prevMap is keyed by stockCode → previous SnapshotItem.
 * Exported for unit testing.
 */
export function detectFlips(
  snapshot: SnapshotItem[],
  prevMap: Map<string, SnapshotItem>,
): FlipItem[] {
  const flips: FlipItem[] = [];
  for (const item of snapshot) {
    const prev = prevMap.get(item.stockCode);
    if (prev && prev.action !== item.action) {
      flips.push({
        stockCode: item.stockCode,
        fromAction: prev.action,
        toAction: item.action,
        toSentiment: item.sentiment,
        confidence: item.confidence,
        timestamp: item.timestamp,
      });
    }
  }
  return flips;
}

/**
 * Build the summary block from the snapshot array (must already be sorted or
 * sortSnapshot applied before calling).
 * Exported for unit testing.
 */
export function buildSummary(snapshot: SnapshotItem[]): KinhDichSummary {
  let mua = 0, ban = 0, giu = 0, thanTrong = 0, cho = 0, unknown = 0;
  let positive = 0, negative = 0, neutral = 0;
  let totalConf = 0;
  let confCount = 0;

  for (const item of snapshot) {
    switch (item.action) {
      case "MUA":       mua++;       break;
      case "BAN":       ban++;       break;
      case "GIU":       giu++;       break;
      case "THAN TRONG": thanTrong++; break;
      case "CHO":       cho++;       break;
      default:          unknown++;   break;
    }
    switch (item.sentiment) {
      case "positive": positive++; break;
      case "negative": negative++; break;
      default:         neutral++;  break;
    }
    if (item.confidence !== null) {
      totalConf += item.confidence;
      confCount++;
    }
  }

  const avgConfidence = confCount > 0 ? totalConf / confCount : null;

  // topBuy: action=MUA, confidence DESC (null last)
  const topBuy = snapshot
    .filter((i) => i.action === "MUA")
    .sort((a, b) => {
      const ca = a.confidence ?? -Infinity;
      const cb = b.confidence ?? -Infinity;
      return cb - ca;
    })
    .slice(0, TOP_LIST_SIZE);

  // topSell: action=BAN, confidence DESC (null last)
  const topSell = snapshot
    .filter((i) => i.action === "BAN")
    .sort((a, b) => {
      const ca = a.confidence ?? -Infinity;
      const cb = b.confidence ?? -Infinity;
      return cb - ca;
    })
    .slice(0, TOP_LIST_SIZE);

  return {
    symbols: snapshot.length,
    mua,
    ban,
    giu,
    thanTrong,
    cho,
    unknown,
    positive,
    negative,
    neutral,
    avgConfidence,
    topBuy,
    topSell,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// HTTP handler
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Handle GET /api/kinh-dich-signals.
 *
 * Produces "Tín hiệu Kinh Dịch" — latest I-Ching hexagram trading signal per
 * stock (stored data only), with flip detection, action priority sort, and
 * summary (topBuy/topSell, action/sentiment counts, avgConfidence).
 *
 * @param req - Incoming HTTP request (reads ?source= query param)
 * @param res - HTTP response
 * @param db  - SQLite database instance (injected by server.ts)
 */
export function handleGetKinhDichSignals(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
): void {
  try {
    const url = new URL(req.url ?? "/", "http://localhost");

    // Parse ?source= param — default "cycle", validate against allowed values
    const rawSource = url.searchParams.get("source") ?? "cycle";
    const source: "cycle" | "manual" | "all" =
      rawSource === "manual" ? "manual"
      : rawSource === "all"    ? "all"
      : "cycle"; // default: "cycle"; invalid values fall back to "cycle"

    // ── 1. Fetch latest + previous rows from store ────────────────────────
    const latestRows = getLatestReadingsPerSymbol(db, source);
    const prevRows = getPreviousReadingsPerSymbol(db, source);

    // ── 2. Map to snapshot items ──────────────────────────────────────────
    const rawSnapshot: SnapshotItem[] = latestRows.map(mapRowToSnapshot);

    // ── 3. Sort by actionPriority, confidence DESC, stockCode ASC ─────────
    const snapshot = sortSnapshot(rawSnapshot);

    // ── 4. Build previous map for flip detection ──────────────────────────
    const prevMap = new Map<string, SnapshotItem>(
      prevRows.map(mapRowToSnapshot).map((item) => [item.stockCode, item]),
    );

    // ── 5. Detect flips ───────────────────────────────────────────────────
    const flips = detectFlips(snapshot, prevMap);

    // ── 6. Build summary ──────────────────────────────────────────────────
    const summary = buildSummary(snapshot);

    // ── 7. Derive tradingDate from MAX(timestamp) in snapshot ─────────────
    let tradingDate = "";
    if (snapshot.length > 0) {
      const maxTs = snapshot.reduce(
        (max, item) => (item.timestamp > max ? item.timestamp : max),
        snapshot[0]!.timestamp,
      );
      tradingDate = maxTs.slice(0, 10); // "YYYY-MM-DD"
    }

    const body: KinhDichSignalsResponse = {
      generatedAt: new Date().toISOString(),
      tradingDate,
      source,
      snapshot,
      flips,
      summary,
      count: snapshot.length,
    };

    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify(body));
  } catch (err) {
    res.writeHead(500, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        error: "db_error",
        detail: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}
