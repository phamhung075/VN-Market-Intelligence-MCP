/**
 * TASK17-PAGE11 — GET /api/kinh-dich-signals
 *
 * "Tín hiệu Kinh Dịch" — I-Ching hexagram trading signals per stock.
 *
 * AC-1:  parseSignal — MUA (accented + ASCII folded) → action=MUA
 * AC-2:  parseSignal — BAN (accented + ASCII folded) → action=BAN
 * AC-3:  parseSignal — GIU (accented + ASCII folded) → action=GIU
 * AC-4:  parseSignal — THAN TRONG (two-word, accented + folded) → action=THAN TRONG
 * AC-5:  parseSignal — CHO (accented + ASCII folded) → action=CHO
 * AC-6:  parseSignal — unknown prefix → action=UNKNOWN
 * AC-7:  parseSignal — null/empty → UNKNOWN neutral
 * AC-8:  parseSignal — sentiment "tich cuc"/"tích cực" → "positive"
 * AC-9:  parseSignal — sentiment "tieu cuc"/"tiêu cực" → "negative"
 * AC-10: parseSignal — unknown sentiment → "neutral"
 * AC-11: extractHexagramName — extracts "Quẻ X (" → X; "" fallback
 * AC-12: extractTrend — extracts "xu hướng: Y." → Y; "" fallback
 * AC-13: actionPriority — correct order MUA<THAN TRONG<GIU<CHO<BAN<UNKNOWN
 * AC-14: sortSnapshot — actionPriority ASC, confidence DESC, stockCode ASC
 * AC-15: detectFlips — detects changed actions; ignores unchanged
 * AC-16: buildSummary — correct action counts (mua,ban,giu,thanTrong,cho,unknown)
 * AC-17: buildSummary — correct sentiment counts (positive,negative,neutral)
 * AC-18: buildSummary — avgConfidence mean, null when empty
 * AC-19: buildSummary — topBuy up to 5 action=MUA, confidence DESC
 * AC-20: buildSummary — topSell up to 5 action=BAN, confidence DESC
 * AC-21: handler — 200 JSON envelope with all required fields
 * AC-22: handler — snapshot sorted by actionPriority
 * AC-23: handler — flips array correct (fromAction/toAction)
 * AC-24: handler — summary.symbols matches snapshot.length
 * AC-25: handler — tradingDate derived from MAX(timestamp) in snapshot
 * AC-26: handler — 200-on-empty (no rows → empty snapshot/flips, zeroed counts, avgConfidence null)
 * AC-27: handler — ?source=cycle vs ?source=manual vs ?source=all
 * AC-28: handler — invalid ?source= falls back to "cycle"
 * AC-29: handler — 500 JSON on DB error
 *
 * Production-shape seeds:
 *   - All 5 actions × both accent encodings (positive + negative sentiment)
 *   - Multi-symbol scenario with known signal flips between prev and latest
 *   - Snapshot with varying confidence values (including null)
 *   - Empty DB path (200-on-empty)
 *   - Closed DB path (500 error)
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-PAGE11] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  parseSignal,
  extractHexagramName,
  extractTrend,
  actionPriority,
  sortSnapshot,
  detectFlips,
  buildSummary,
  mapRowToSnapshot,
  handleGetKinhDichSignals,
  type SnapshotItem,
  type KinhDichSignalsResponse,
} from "../interface/mcp/routes/kinhDichSignalsHandler.js";
import type { KinhDichRow } from "../infrastructure/db/kinhDichStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Lifecycle
// ─────────────────────────────────────────────────────────────────────────────

beforeEach(async () => {
  closeDb();
  await initDatabase();
});
afterEach(() => {
  closeDb();
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeMockRes() {
  const mock = {
    statusCode: 0,
    headers: {} as Record<string, string>,
    body: "",
    writeHead(status: number, headers?: Record<string, string>) {
      this.statusCode = status;
      if (headers) Object.assign(this.headers, headers);
    },
    end(data: string) {
      this.body = data;
    },
  };
  return mock;
}

function makeFakeReq(url = "/api/kinh-dich-signals"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/**
 * Insert a kinhdich_readings row.
 * timestamp: "YYYY-MM-DD HH:MM:SS" format matching the real column.
 */
function insertReading(opts: {
  stock_code: string;
  timestamp: string;
  hexagram_number?: number;
  ho_que_number?: number;
  bien_que_number?: number;
  hao_states?: string;
  raw_scores?: string;
  ngu_hanh_dynamic?: string | null;
  trading_signal?: string;
  confidence?: number | null;
  action_note?: string;
  source?: string;
}): void {
  getDb()
    .prepare(
      `INSERT INTO kinhdich_readings
         (stock_code, timestamp, hexagram_number, ho_que_number, bien_que_number,
          hao_states, raw_scores, ngu_hanh_dynamic, trading_signal, confidence, action_note, source)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      opts.stock_code,
      opts.timestamp,
      opts.hexagram_number ?? 1,
      opts.ho_que_number ?? 2,
      opts.bien_que_number ?? 3,
      opts.hao_states ?? '["THIEU_AM","THIEU_DUONG","THIEU_AM","THIEU_DUONG","THIEU_AM","THIEU_DUONG"]',
      opts.raw_scores ?? "[0.5,0.5,0.5,0.5,0.5,0.5]",
      opts.ngu_hanh_dynamic ?? null,
      opts.trading_signal ?? "MUA (tich cuc)",
      opts.confidence ?? null,
      opts.action_note ?? "KHUYẾN NGHỊ: MUA — Quẻ Càn (1) tích cực, xu hướng: THUẬN LỢI. Độ tin cậy: 80%.",
      opts.source ?? "cycle",
    );
}

/**
 * Make a minimal SnapshotItem for pure-helper tests.
 */
function makeSnapshotItem(
  stockCode: string,
  action: SnapshotItem["action"],
  confidence: number | null = null,
  sentiment: SnapshotItem["sentiment"] = "positive",
): SnapshotItem {
  return {
    stockCode,
    timestamp: "2026-06-11 08:17:00",
    hexagramNumber: 1,
    hoQueNumber: 2,
    bienQueNumber: 3,
    hexagramName: "",
    action,
    sentiment,
    trend: "",
    confidence,
    actionNote: "",
    source: "cycle",
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1 through AC-10 — parseSignal
// ─────────────────────────────────────────────────────────────────────────────

describe("parseSignal — action parsing", () => {
  it("AC-1: MUA — ASCII folded positive", () => {
    const r = parseSignal("MUA (tich cuc)");
    expect(r.action).toBe("MUA");
    expect(r.sentiment).toBe("positive");
  });

  it("AC-1: MUA — accented positive", () => {
    const r = parseSignal("MUA (tích cực)");
    expect(r.action).toBe("MUA");
    expect(r.sentiment).toBe("positive");
  });

  it("AC-1: MUA — ASCII folded negative", () => {
    const r = parseSignal("MUA (tieu cuc)");
    expect(r.action).toBe("MUA");
    expect(r.sentiment).toBe("negative");
  });

  it("AC-1: MUA — accented negative", () => {
    const r = parseSignal("MUA (tiêu cực)");
    expect(r.action).toBe("MUA");
    expect(r.sentiment).toBe("negative");
  });

  it("AC-2: BAN — ASCII folded positive", () => {
    const r = parseSignal("BAN (tich cuc)");
    expect(r.action).toBe("BAN");
    expect(r.sentiment).toBe("positive");
  });

  it("AC-2: BAN — accented negative", () => {
    const r = parseSignal("BAN (tiêu cực)");
    expect(r.action).toBe("BAN");
    expect(r.sentiment).toBe("negative");
  });

  it("AC-2: BAN — accented positive", () => {
    const r = parseSignal("BAN (tích cực)");
    expect(r.action).toBe("BAN");
    expect(r.sentiment).toBe("positive");
  });

  it("AC-2: BAN — ASCII folded negative", () => {
    const r = parseSignal("BAN (tieu cuc)");
    expect(r.action).toBe("BAN");
    expect(r.sentiment).toBe("negative");
  });

  it("AC-3: GIU — accented positive", () => {
    const r = parseSignal("GIU (tích cực)");
    expect(r.action).toBe("GIU");
    expect(r.sentiment).toBe("positive");
  });

  it("AC-3: GIU — accented negative", () => {
    const r = parseSignal("GIU (tiêu cực)");
    expect(r.action).toBe("GIU");
    expect(r.sentiment).toBe("negative");
  });

  it("AC-3: GIU — ASCII folded positive", () => {
    const r = parseSignal("GIU (tich cuc)");
    expect(r.action).toBe("GIU");
    expect(r.sentiment).toBe("positive");
  });

  it("AC-3: GIU — ASCII folded negative", () => {
    const r = parseSignal("GIU (tieu cuc)");
    expect(r.action).toBe("GIU");
    expect(r.sentiment).toBe("negative");
  });

  it("AC-4: THAN TRONG — two-word, accented positive", () => {
    const r = parseSignal("THAN TRONG (tích cực)");
    expect(r.action).toBe("THAN TRONG");
    expect(r.sentiment).toBe("positive");
  });

  it("AC-4: THAN TRONG — two-word, ASCII folded positive", () => {
    const r = parseSignal("THAN TRONG (tich cuc)");
    expect(r.action).toBe("THAN TRONG");
    expect(r.sentiment).toBe("positive");
  });

  it("AC-4: THAN TRONG — accented negative", () => {
    const r = parseSignal("THAN TRONG (tiêu cực)");
    expect(r.action).toBe("THAN TRONG");
    expect(r.sentiment).toBe("negative");
  });

  it("AC-4: THAN TRONG — ASCII folded negative", () => {
    const r = parseSignal("THAN TRONG (tieu cuc)");
    expect(r.action).toBe("THAN TRONG");
    expect(r.sentiment).toBe("negative");
  });

  it("AC-5: CHO — ASCII folded positive", () => {
    const r = parseSignal("CHO (tich cuc)");
    expect(r.action).toBe("CHO");
    expect(r.sentiment).toBe("positive");
  });

  it("AC-5: CHO — accented positive", () => {
    const r = parseSignal("CHO (tích cực)");
    expect(r.action).toBe("CHO");
    expect(r.sentiment).toBe("positive");
  });

  it("AC-5: CHO — accented negative", () => {
    const r = parseSignal("CHO (tiêu cực)");
    expect(r.action).toBe("CHO");
    expect(r.sentiment).toBe("negative");
  });

  it("AC-5: CHO — ASCII folded negative", () => {
    const r = parseSignal("CHO (tieu cuc)");
    expect(r.action).toBe("CHO");
    expect(r.sentiment).toBe("negative");
  });

  it("AC-6: unknown prefix → UNKNOWN", () => {
    expect(parseSignal("XYZ (tich cuc)").action).toBe("UNKNOWN");
    expect(parseSignal("HOLD (positive)").action).toBe("UNKNOWN");
  });

  it("AC-7: null → UNKNOWN neutral", () => {
    const r = parseSignal(null);
    expect(r.action).toBe("UNKNOWN");
    expect(r.sentiment).toBe("neutral");
  });

  it("AC-7: empty string → UNKNOWN neutral", () => {
    const r = parseSignal("");
    expect(r.action).toBe("UNKNOWN");
    expect(r.sentiment).toBe("neutral");
  });

  it("AC-8: tich cuc variants → positive", () => {
    expect(parseSignal("MUA (tich cuc)").sentiment).toBe("positive");
    expect(parseSignal("MUA (tích cực)").sentiment).toBe("positive");
  });

  it("AC-9: tieu cuc variants → negative", () => {
    expect(parseSignal("MUA (tieu cuc)").sentiment).toBe("negative");
    expect(parseSignal("MUA (tiêu cực)").sentiment).toBe("negative");
  });

  it("AC-10: unknown sentiment → neutral", () => {
    expect(parseSignal("MUA (unknown)").sentiment).toBe("neutral");
    expect(parseSignal("GIU (something else)").sentiment).toBe("neutral");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-11 — extractHexagramName
// ─────────────────────────────────────────────────────────────────────────────

describe("extractHexagramName", () => {
  it("AC-11: extracts name from typical action_note", () => {
    const note = "KHUYẾN NGHỊ: BAN — Quẻ Tập Khảm (29) tiêu cực, xu hướng: BẤT LỢI. Độ tin cậy: 100%.";
    expect(extractHexagramName(note)).toBe("Tập Khảm");
  });

  it("AC-11: extracts single-word name", () => {
    const note = "KHUYẾN NGHỊ: MUA — Quẻ Càn (1) tích cực, xu hướng: THUẬN LỢI. Độ tin cậy: 80%.";
    expect(extractHexagramName(note)).toBe("Càn");
  });

  it("AC-11: null action_note → empty string", () => {
    expect(extractHexagramName(null)).toBe("");
  });

  it("AC-11: no Quẻ pattern → empty string", () => {
    expect(extractHexagramName("KHUYẾN NGHỊ: MUA — some note")).toBe("");
  });

  it("AC-11: empty string → empty string", () => {
    expect(extractHexagramName("")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-12 — extractTrend
// ─────────────────────────────────────────────────────────────────────────────

describe("extractTrend", () => {
  it("AC-12: BẤT LỢI trend", () => {
    const note = "KHUYẾN NGHỊ: BAN — Quẻ Tập Khảm (29) tiêu cực, xu hướng: BẤT LỢI. Độ tin cậy: 100%.";
    expect(extractTrend(note)).toBe("BẤT LỢI");
  });

  it("AC-12: THUẬN LỢI trend", () => {
    const note = "KHUYẾN NGHỊ: MUA — Quẻ Càn (1) tích cực, xu hướng: THUẬN LỢI. Độ tin cậy: 80%.";
    expect(extractTrend(note)).toBe("THUẬN LỢI");
  });

  it("AC-12: TRUNG TÍNH trend", () => {
    const note = "KHUYẾN NGHỊ: GIU — Quẻ X (5) trung tính, xu hướng: TRUNG TÍNH. Độ tin cậy: 60%.";
    expect(extractTrend(note)).toBe("TRUNG TÍNH");
  });

  it("AC-12: null → empty string", () => {
    expect(extractTrend(null)).toBe("");
  });

  it("AC-12: no xu hướng pattern → empty string", () => {
    expect(extractTrend("KHUYẾN NGHỊ: MUA — no trend here")).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-13 — actionPriority
// ─────────────────────────────────────────────────────────────────────────────

describe("actionPriority", () => {
  it("AC-13: MUA < THAN TRONG < GIU < CHO < BAN < UNKNOWN", () => {
    expect(actionPriority("MUA")).toBeLessThan(actionPriority("THAN TRONG"));
    expect(actionPriority("THAN TRONG")).toBeLessThan(actionPriority("GIU"));
    expect(actionPriority("GIU")).toBeLessThan(actionPriority("CHO"));
    expect(actionPriority("CHO")).toBeLessThan(actionPriority("BAN"));
    expect(actionPriority("BAN")).toBeLessThan(actionPriority("UNKNOWN"));
  });

  it("AC-13: exact priority numbers", () => {
    expect(actionPriority("MUA")).toBe(0);
    expect(actionPriority("THAN TRONG")).toBe(1);
    expect(actionPriority("GIU")).toBe(2);
    expect(actionPriority("CHO")).toBe(3);
    expect(actionPriority("BAN")).toBe(4);
    expect(actionPriority("UNKNOWN")).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-14 — sortSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("sortSnapshot", () => {
  it("AC-14: sorts by actionPriority ASC first", () => {
    const items = [
      makeSnapshotItem("BAN_stock", "BAN", 0.9),
      makeSnapshotItem("MUA_stock", "MUA", 0.5),
      makeSnapshotItem("GIU_stock", "GIU", 0.7),
    ];
    const sorted = sortSnapshot(items);
    expect(sorted[0]!.action).toBe("MUA");
    expect(sorted[1]!.action).toBe("GIU");
    expect(sorted[2]!.action).toBe("BAN");
  });

  it("AC-14: tie-break by confidence DESC within same action", () => {
    const items = [
      makeSnapshotItem("A", "MUA", 0.3),
      makeSnapshotItem("B", "MUA", 0.9),
      makeSnapshotItem("C", "MUA", 0.6),
    ];
    const sorted = sortSnapshot(items);
    expect(sorted[0]!.stockCode).toBe("B"); // highest confidence
    expect(sorted[1]!.stockCode).toBe("C");
    expect(sorted[2]!.stockCode).toBe("A"); // lowest confidence
  });

  it("AC-14: null confidence sorts last within same action", () => {
    const items = [
      makeSnapshotItem("A", "MUA", null),
      makeSnapshotItem("B", "MUA", 0.8),
    ];
    const sorted = sortSnapshot(items);
    expect(sorted[0]!.stockCode).toBe("B"); // has confidence
    expect(sorted[1]!.stockCode).toBe("A"); // null confidence last
  });

  it("AC-14: tie-break by stockCode ASC when priority and confidence equal", () => {
    const items = [
      makeSnapshotItem("Z", "GIU", 0.5),
      makeSnapshotItem("A", "GIU", 0.5),
      makeSnapshotItem("M", "GIU", 0.5),
    ];
    const sorted = sortSnapshot(items);
    expect(sorted[0]!.stockCode).toBe("A");
    expect(sorted[1]!.stockCode).toBe("M");
    expect(sorted[2]!.stockCode).toBe("Z");
  });

  it("AC-14: does not mutate input array", () => {
    const items = [
      makeSnapshotItem("B", "BAN", 0.9),
      makeSnapshotItem("A", "MUA", 0.5),
    ];
    const original = [...items];
    sortSnapshot(items);
    expect(items[0]!.stockCode).toBe(original[0]!.stockCode);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-15 — detectFlips
// ─────────────────────────────────────────────────────────────────────────────

describe("detectFlips", () => {
  it("AC-15: detects signal flip between previous and latest", () => {
    const latest = [
      makeSnapshotItem("ACB", "BAN", 0.9),
      makeSnapshotItem("FPT", "MUA", 0.7),
    ];
    const prevMap = new Map<string, SnapshotItem>([
      ["ACB", makeSnapshotItem("ACB", "MUA", 0.6)], // was MUA, now BAN → flip
      ["FPT", makeSnapshotItem("FPT", "MUA", 0.5)], // no change
    ]);
    const flips = detectFlips(latest, prevMap);
    expect(flips).toHaveLength(1);
    expect(flips[0]!.stockCode).toBe("ACB");
    expect(flips[0]!.fromAction).toBe("MUA");
    expect(flips[0]!.toAction).toBe("BAN");
  });

  it("AC-15: no flips when actions unchanged", () => {
    const latest = [makeSnapshotItem("VCB", "GIU", 0.8)];
    const prevMap = new Map([["VCB", makeSnapshotItem("VCB", "GIU", 0.7)]]);
    expect(detectFlips(latest, prevMap)).toHaveLength(0);
  });

  it("AC-15: new symbol (no previous) → no flip", () => {
    const latest = [makeSnapshotItem("NEW", "MUA", 0.6)];
    const prevMap = new Map<string, SnapshotItem>();
    expect(detectFlips(latest, prevMap)).toHaveLength(0);
  });

  it("AC-15: flip carries toSentiment and confidence", () => {
    const latest = [makeSnapshotItem("HPG", "BAN", 0.75, "negative")];
    const prevMap = new Map([["HPG", makeSnapshotItem("HPG", "GIU", 0.5)]]);
    const flips = detectFlips(latest, prevMap);
    expect(flips[0]!.toSentiment).toBe("negative");
    expect(flips[0]!.confidence).toBe(0.75);
    expect(flips[0]!.timestamp).toBe("2026-06-11 08:17:00");
  });

  it("AC-15: multiple flips detected", () => {
    const latest = [
      makeSnapshotItem("A", "BAN", 0.9),
      makeSnapshotItem("B", "MUA", 0.8),
      makeSnapshotItem("C", "GIU", 0.7),
    ];
    const prevMap = new Map([
      ["A", makeSnapshotItem("A", "MUA", 0.6)],   // flip
      ["B", makeSnapshotItem("B", "THAN TRONG", 0.4)], // flip
      ["C", makeSnapshotItem("C", "GIU", 0.5)],   // no flip
    ]);
    const flips = detectFlips(latest, prevMap);
    expect(flips).toHaveLength(2);
    const codes = flips.map((f) => f.stockCode).sort();
    expect(codes).toEqual(["A", "B"]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-16 / AC-17 / AC-18 / AC-19 / AC-20 — buildSummary
// ─────────────────────────────────────────────────────────────────────────────

describe("buildSummary", () => {
  it("AC-16: correct action counts", () => {
    const snapshot = [
      makeSnapshotItem("A", "MUA", 0.9, "positive"),
      makeSnapshotItem("B", "MUA", 0.8, "positive"),
      makeSnapshotItem("C", "BAN", 0.7, "negative"),
      makeSnapshotItem("D", "GIU", 0.6, "positive"),
      makeSnapshotItem("E", "THAN TRONG", 0.5, "positive"),
      makeSnapshotItem("F", "CHO", 0.4, "neutral"),
      makeSnapshotItem("G", "UNKNOWN", null, "neutral"),
    ];
    const s = buildSummary(snapshot);
    expect(s.mua).toBe(2);
    expect(s.ban).toBe(1);
    expect(s.giu).toBe(1);
    expect(s.thanTrong).toBe(1);
    expect(s.cho).toBe(1);
    expect(s.unknown).toBe(1);
    expect(s.symbols).toBe(7);
  });

  it("AC-17: correct sentiment counts", () => {
    const snapshot = [
      makeSnapshotItem("A", "MUA", 0.9, "positive"),
      makeSnapshotItem("B", "BAN", 0.8, "negative"),
      makeSnapshotItem("C", "GIU", 0.7, "negative"),
      makeSnapshotItem("D", "CHO", 0.5, "neutral"),
    ];
    const s = buildSummary(snapshot);
    expect(s.positive).toBe(1);
    expect(s.negative).toBe(2);
    expect(s.neutral).toBe(1);
  });

  it("AC-18: avgConfidence is mean of non-null confidences", () => {
    const snapshot = [
      makeSnapshotItem("A", "MUA", 1.0),
      makeSnapshotItem("B", "BAN", 0.5),
      makeSnapshotItem("C", "GIU", null), // excluded from avg
    ];
    const s = buildSummary(snapshot);
    expect(s.avgConfidence).toBeCloseTo(0.75);
  });

  it("AC-18: avgConfidence null when all confidences are null", () => {
    const snapshot = [
      makeSnapshotItem("A", "MUA", null),
      makeSnapshotItem("B", "BAN", null),
    ];
    expect(buildSummary(snapshot).avgConfidence).toBeNull();
  });

  it("AC-18: avgConfidence null on empty snapshot", () => {
    expect(buildSummary([]).avgConfidence).toBeNull();
  });

  it("AC-19: topBuy — up to 5 MUA items, confidence DESC", () => {
    const snapshot: SnapshotItem[] = [
      makeSnapshotItem("A", "MUA", 0.9),
      makeSnapshotItem("B", "MUA", 0.7),
      makeSnapshotItem("C", "MUA", 0.95),
      makeSnapshotItem("D", "MUA", 0.3),
      makeSnapshotItem("E", "MUA", 0.8),
      makeSnapshotItem("F", "MUA", 0.6), // 6th MUA → excluded from top5
      makeSnapshotItem("G", "BAN", 0.99), // not MUA → excluded
    ];
    const s = buildSummary(snapshot);
    expect(s.topBuy).toHaveLength(5);
    expect(s.topBuy[0]!.confidence).toBe(0.95); // highest first
    expect(s.topBuy[0]!.stockCode).toBe("C");
    // All topBuy items must be MUA
    for (const item of s.topBuy) {
      expect(item.action).toBe("MUA");
    }
  });

  it("AC-20: topSell — up to 5 BAN items, confidence DESC", () => {
    const snapshot: SnapshotItem[] = [
      makeSnapshotItem("A", "BAN", 0.8),
      makeSnapshotItem("B", "BAN", 0.95),
      makeSnapshotItem("C", "BAN", 0.6),
      makeSnapshotItem("D", "MUA", 0.99), // not BAN → excluded
    ];
    const s = buildSummary(snapshot);
    expect(s.topSell).toHaveLength(3); // only 3 BAN
    expect(s.topSell[0]!.confidence).toBe(0.95); // highest first
    for (const item of s.topSell) {
      expect(item.action).toBe("BAN");
    }
  });

  it("AC-20: topBuy/topSell empty when no MUA/BAN items", () => {
    const snapshot = [makeSnapshotItem("A", "GIU", 0.5)];
    const s = buildSummary(snapshot);
    expect(s.topBuy).toHaveLength(0);
    expect(s.topSell).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapRowToSnapshot
// ─────────────────────────────────────────────────────────────────────────────

describe("mapRowToSnapshot", () => {
  it("maps all fields from row including hexagramName and trend", () => {
    const row: KinhDichRow = {
      stock_code: "ACB",
      timestamp: "2026-06-11 08:17:00",
      hexagram_number: 29,
      ho_que_number: 27,
      bien_que_number: 60,
      hao_states: '["THIEU_AM","THIEU_DUONG","THIEU_AM","THIEU_DUONG","THIEU_AM","THIEU_DUONG"]',
      raw_scores: "[0.1,0.2,0.3,0.4,0.5,0.6]",
      ngu_hanh_dynamic: "TUONG_KHAC",
      trading_signal: "BAN (tich cuc)",
      confidence: 1.0,
      action_note: "KHUYẾN NGHỊ: BAN — Quẻ Tập Khảm (29) tiêu cực, xu hướng: BẤT LỢI. Độ tin cậy: 100%.",
      source: "cycle",
    };
    const item = mapRowToSnapshot(row);
    expect(item.stockCode).toBe("ACB");
    expect(item.timestamp).toBe("2026-06-11 08:17:00");
    expect(item.hexagramNumber).toBe(29);
    expect(item.hoQueNumber).toBe(27);
    expect(item.bienQueNumber).toBe(60);
    expect(item.hexagramName).toBe("Tập Khảm");
    expect(item.action).toBe("BAN");
    expect(item.sentiment).toBe("positive");
    expect(item.trend).toBe("BẤT LỢI");
    expect(item.confidence).toBe(1.0);
    expect(item.actionNote).toBe(row.action_note ?? "");
    expect(item.source).toBe("cycle");
  });

  it("handles null fields gracefully", () => {
    const row: KinhDichRow = {
      stock_code: "FPT",
      timestamp: "2026-06-11 08:17:00",
      hexagram_number: 1,
      ho_que_number: 1,
      bien_que_number: 1,
      hao_states: "[]",
      raw_scores: "[]",
      ngu_hanh_dynamic: null,
      trading_signal: null,
      confidence: null,
      action_note: null,
      source: "manual",
    };
    const item = mapRowToSnapshot(row);
    expect(item.action).toBe("UNKNOWN");
    expect(item.sentiment).toBe("neutral");
    expect(item.confidence).toBeNull();
    expect(item.hexagramName).toBe("");
    expect(item.trend).toBe("");
    expect(item.actionNote).toBe("");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-21 through AC-29 — handleGetKinhDichSignals (HTTP handler integration)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Production-shape fixture seed.
 * Seeds 5 symbols × 2 readings each (latest + previous) with varied signals.
 * Symbols: ACB, FPT, VCB, HPG, SSI
 * Signal flips: ACB: GIU→MUA, FPT: MUA→BAN
 * Stable (no flip): VCB: GIU, HPG: THAN TRONG, SSI: CHO
 */
function seedProductionShape(source = "cycle"): void {
  const prev  = "2026-06-10 08:17:00";
  const latest = "2026-06-11 08:17:00";

  // ACB: prev=GIU, latest=MUA (flip)
  insertReading({ stock_code: "ACB", timestamp: prev,   trading_signal: "GIU (tich cuc)", confidence: 0.6, source,
    hexagram_number: 5,  ho_que_number: 1, bien_que_number: 2,
    action_note: "KHUYẾN NGHỊ: GIU — Quẻ Nhu (5) tích cực, xu hướng: THUẬN LỢI. Độ tin cậy: 60%." });
  insertReading({ stock_code: "ACB", timestamp: latest, trading_signal: "MUA (tích cực)", confidence: 0.9, source,
    hexagram_number: 1,  ho_que_number: 1, bien_que_number: 1,
    action_note: "KHUYẾN NGHỊ: MUA — Quẻ Càn (1) tích cực, xu hướng: THUẬN LỢI. Độ tin cậy: 90%." });

  // FPT: prev=MUA, latest=BAN (flip)
  insertReading({ stock_code: "FPT", timestamp: prev,   trading_signal: "MUA (tich cuc)", confidence: 0.7, source,
    hexagram_number: 11, ho_que_number: 2, bien_que_number: 3,
    action_note: "KHUYẾN NGHỊ: MUA — Quẻ Thái (11) tích cực, xu hướng: THUẬN LỢI. Độ tin cậy: 70%." });
  insertReading({ stock_code: "FPT", timestamp: latest, trading_signal: "BAN (tiêu cực)", confidence: 0.85, source,
    hexagram_number: 29, ho_que_number: 3, bien_que_number: 4,
    action_note: "KHUYẾN NGHỊ: BAN — Quẻ Tập Khảm (29) tiêu cực, xu hướng: BẤT LỢI. Độ tin cậy: 85%." });

  // VCB: stable GIU
  insertReading({ stock_code: "VCB", timestamp: prev,   trading_signal: "GIU (tiêu cực)", confidence: 0.5, source,
    hexagram_number: 12, ho_que_number: 4, bien_que_number: 5,
    action_note: "KHUYẾN NGHỊ: GIU — Quẻ Bĩ (12) tiêu cực, xu hướng: BẤT LỢI. Độ tin cậy: 50%." });
  insertReading({ stock_code: "VCB", timestamp: latest, trading_signal: "GIU (tieu cuc)", confidence: 0.55, source,
    hexagram_number: 12, ho_que_number: 4, bien_que_number: 5,
    action_note: "KHUYẾN NGHỊ: GIU — Quẻ Bĩ (12) tiêu cực, xu hướng: BẤT LỢI. Độ tin cậy: 55%." });

  // HPG: stable THAN TRONG
  insertReading({ stock_code: "HPG", timestamp: prev,   trading_signal: "THAN TRONG (tích cực)", confidence: 0.4, source,
    hexagram_number: 7,  ho_que_number: 5, bien_que_number: 6,
    action_note: "KHUYẾN NGHỊ: THAN TRONG — Quẻ Sư (7) tích cực, xu hướng: THUẬN LỢI. Độ tin cậy: 40%." });
  insertReading({ stock_code: "HPG", timestamp: latest, trading_signal: "THAN TRONG (tich cuc)", confidence: 0.42, source,
    hexagram_number: 7,  ho_que_number: 5, bien_que_number: 6,
    action_note: "KHUYẾN NGHỊ: THAN TRONG — Quẻ Sư (7) tích cực, xu hướng: THUẬN LỢI. Độ tin cậy: 42%." });

  // SSI: stable CHO
  insertReading({ stock_code: "SSI", timestamp: prev,   trading_signal: "CHO (tich cuc)", confidence: 0.3, source,
    hexagram_number: 5,  ho_que_number: 6, bien_que_number: 7,
    action_note: "KHUYẾN NGHỊ: CHO — Quẻ Nhu (5) tích cực, xu hướng: TRUNG TÍNH. Độ tin cậy: 30%." });
  insertReading({ stock_code: "SSI", timestamp: latest, trading_signal: "CHO (tích cực)", confidence: 0.32, source,
    hexagram_number: 5,  ho_que_number: 6, bien_que_number: 7,
    action_note: "KHUYẾN NGHỊ: CHO — Quẻ Nhu (5) tích cực, xu hướng: TRUNG TÍNH. Độ tin cậy: 32%." });
}

describe("TASK17-PAGE11 — handleGetKinhDichSignals (production-shape fixture)", () => {
  it("AC-21: returns 200 JSON with all required envelope fields", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetKinhDichSignals(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb());

    expect(res.statusCode).toBe(200);
    expect(res.headers["Content-Type"]).toBe("application/json");
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;

    expect(typeof body.generatedAt).toBe("string");
    expect(typeof body.tradingDate).toBe("string");
    expect(body.source).toBe("cycle");
    expect(Array.isArray(body.snapshot)).toBe(true);
    expect(Array.isArray(body.flips)).toBe(true);
    expect(typeof body.summary).toBe("object");
    expect(typeof body.count).toBe("number");
  });

  it("AC-21: count matches snapshot.length", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetKinhDichSignals(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb());
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;
    expect(body.count).toBe(body.snapshot.length);
  });

  it("AC-22: snapshot sorted by actionPriority (MUA first)", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetKinhDichSignals(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb());
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;

    // MUA must come before THAN TRONG, GIU, CHO, BAN
    const priorities = body.snapshot.map((i) => actionPriority(i.action));
    for (let idx = 0; idx < priorities.length - 1; idx++) {
      expect(priorities[idx]!).toBeLessThanOrEqual(priorities[idx + 1]!);
    }
  });

  it("AC-22: ACB (MUA) is first in snapshot", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetKinhDichSignals(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb());
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;
    expect(body.snapshot[0]!.stockCode).toBe("ACB"); // MUA with highest confidence 0.9
    expect(body.snapshot[0]!.action).toBe("MUA");
  });

  it("AC-23: flips array detects ACB (GIU→MUA) and FPT (MUA→BAN)", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetKinhDichSignals(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb());
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;

    expect(body.flips).toHaveLength(2);
    const flipCodes = body.flips.map((f) => f.stockCode).sort();
    expect(flipCodes).toEqual(["ACB", "FPT"]);

    const acbFlip = body.flips.find((f) => f.stockCode === "ACB");
    expect(acbFlip).toBeDefined();
    expect(acbFlip!.fromAction).toBe("GIU");
    expect(acbFlip!.toAction).toBe("MUA");

    const fptFlip = body.flips.find((f) => f.stockCode === "FPT");
    expect(fptFlip!.fromAction).toBe("MUA");
    expect(fptFlip!.toAction).toBe("BAN");
  });

  it("AC-23: stable symbols (VCB, HPG, SSI) not in flips", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetKinhDichSignals(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb());
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;
    const flipCodes = body.flips.map((f) => f.stockCode);
    expect(flipCodes).not.toContain("VCB");
    expect(flipCodes).not.toContain("HPG");
    expect(flipCodes).not.toContain("SSI");
  });

  it("AC-24: summary.symbols matches snapshot.length", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetKinhDichSignals(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb());
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;
    expect(body.summary.symbols).toBe(body.snapshot.length);
  });

  it("AC-24: summary action counts correct (1 MUA, 1 BAN, 2 GIU+similar, etc.)", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetKinhDichSignals(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb());
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;
    // Snapshot: ACB=MUA, FPT=BAN, VCB=GIU, HPG=THAN TRONG, SSI=CHO
    expect(body.summary.mua).toBe(1);
    expect(body.summary.ban).toBe(1);
    expect(body.summary.giu).toBe(1);
    expect(body.summary.thanTrong).toBe(1);
    expect(body.summary.cho).toBe(1);
    expect(body.summary.unknown).toBe(0);
  });

  it("AC-25: tradingDate derived from MAX(timestamp) in snapshot", () => {
    seedProductionShape();
    const res = makeMockRes();
    handleGetKinhDichSignals(makeFakeReq(), res as unknown as import("node:http").ServerResponse, getDb());
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;
    expect(body.tradingDate).toBe("2026-06-11"); // latest timestamp date
  });

  it("AC-27: ?source=cycle returns only cycle rows (5 rows seeded)", () => {
    seedProductionShape("cycle");
    const res = makeMockRes();
    handleGetKinhDichSignals(
      makeFakeReq("/api/kinh-dich-signals?source=cycle"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;
    expect(body.source).toBe("cycle");
    expect(body.count).toBe(5); // 5 symbols seeded as cycle
    for (const item of body.snapshot) {
      expect(item.source).toBe("cycle");
    }
  });

  it("AC-27: ?source=manual returns only manual rows", () => {
    seedProductionShape("manual");
    const res = makeMockRes();
    handleGetKinhDichSignals(
      makeFakeReq("/api/kinh-dich-signals?source=manual"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;
    expect(body.source).toBe("manual");
    expect(body.count).toBe(5);
    for (const item of body.snapshot) {
      expect(item.source).toBe("manual");
    }
  });

  it("AC-27: ?source=all returns all rows regardless of source", () => {
    seedProductionShape("cycle");
    // Also seed one manual row for a new symbol
    insertReading({ stock_code: "MANUAL_SYM", timestamp: "2026-06-11 09:00:00",
      trading_signal: "MUA (tich cuc)", confidence: 0.5, source: "manual",
      action_note: "KHUYẾN NGHỊ: MUA — Quẻ Càn (1) tích cực, xu hướng: THUẬN LỢI. Độ tin cậy: 50%." });

    const res = makeMockRes();
    handleGetKinhDichSignals(
      makeFakeReq("/api/kinh-dich-signals?source=all"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;
    expect(body.source).toBe("all");
    expect(body.count).toBe(6); // 5 cycle + 1 manual
  });

  it("AC-28: invalid ?source= falls back to 'cycle'", () => {
    seedProductionShape("cycle");
    const res = makeMockRes();
    handleGetKinhDichSignals(
      makeFakeReq("/api/kinh-dich-signals?source=invalid"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;
    expect(body.source).toBe("cycle");
  });

  it("AC-28: missing ?source= defaults to 'cycle'", () => {
    seedProductionShape("cycle");
    const res = makeMockRes();
    handleGetKinhDichSignals(
      makeFakeReq("/api/kinh-dich-signals"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;
    expect(body.source).toBe("cycle");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-26 — 200-on-empty
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE11 — handleGetKinhDichSignals (empty DB)", () => {
  it("AC-26: returns 200 + empty snapshot/flips, zeroed counts, avgConfidence null", () => {
    // No seed — table empty
    const res = makeMockRes();
    handleGetKinhDichSignals(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as KinhDichSignalsResponse;
    expect(body.snapshot).toHaveLength(0);
    expect(body.flips).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(body.tradingDate).toBe("");
    expect(body.summary.symbols).toBe(0);
    expect(body.summary.mua).toBe(0);
    expect(body.summary.ban).toBe(0);
    expect(body.summary.giu).toBe(0);
    expect(body.summary.thanTrong).toBe(0);
    expect(body.summary.cho).toBe(0);
    expect(body.summary.unknown).toBe(0);
    expect(body.summary.positive).toBe(0);
    expect(body.summary.negative).toBe(0);
    expect(body.summary.neutral).toBe(0);
    expect(body.summary.avgConfidence).toBeNull();
    expect(body.summary.topBuy).toHaveLength(0);
    expect(body.summary.topSell).toHaveLength(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-29 — 500 on DB error
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE11 — handleGetKinhDichSignals (DB error)", () => {
  it("AC-29: returns 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb(); // force DB error

    const res = makeMockRes();
    handleGetKinhDichSignals(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      db,
    );

    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });
});
