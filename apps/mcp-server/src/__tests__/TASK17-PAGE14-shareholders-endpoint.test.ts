/**
 * TASK17-PAGE14 — GET /api/shareholders
 *
 * "Cơ cấu cổ đông tại thời điểm công bố" — Ownership Structure Snapshot.
 * Pure-function unit tests on in-code fixture data.
 * Does NOT hit the real DB — all store calls are replaced by fixture arrays.
 *
 * AC-1:  classifyConcentration thresholds
 *          49.99 → medium; 50 → high; 14.99 → low; 15 → medium; null → low
 * AC-2:  computeCodeMetrics — top1/top5/disclosed math incl. null-as-0 and <5 holders
 * AC-3:  buildRanking — ordered top1Pct DESC, TIE-BREAK code ASC (deterministic)
 * AC-4:  resolveSelectedCode — valid / invalid / lowercase / null / empty-codes fallback
 * AC-5:  mapHolder — rank numbering (rankIndex+1)
 * AC-6:  empty-state shape — empty table produces zeros + empty arrays + null asOf
 * AC-7:  handleGetShareholders — holders cap (HOLDERS_ROW_CAP), count field, selectedSummary
 *
 * DDD layer: interface + infrastructure tested together at the helper seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-PAGE14] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  classifyConcentration,
  computeCodeMetrics,
  buildRanking,
  resolveSelectedCode,
  mapHolder,
  handleGetShareholders,
  handleGetShareholdersHttp,
  HOLDERS_ROW_CAP,
  TOP_N,
  type ShareholdersResponse,
  type HolderItem,
  type CodeMetrics,
  type RankingItem,
} from "../interface/mcp/routes/shareholdersHandler.js";
import type { ShareholderRow } from "../infrastructure/db/shareholdersStore.js";

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

function makeFakeReq(url: string = "/api/shareholders"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/**
 * Insert a vnstock_shareholders row directly via raw SQL.
 */
function insertShareholder(opts: {
  code: string;
  name: string;
  quantity?: number | null;
  own_percent?: number | null;
  fetched_at?: string;
}): void {
  const db = getDb();
  const {
    code,
    name,
    quantity = null,
    own_percent = null,
    fetched_at = "2026-04-14T18:08:47.720Z",
  } = opts;
  db.prepare(
    `INSERT OR IGNORE INTO vnstock_shareholders (code, name, quantity, own_percent, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(code, name, quantity, own_percent, fetched_at);
}

/**
 * Seed a small realistic fixture corpus (2 codes, 7 holders total).
 * FPT: 5 holders (Trương Gia Bình 6.89, SCIC 5.67, Red River 4.58, QT 3.69, Deutsche 2.42)
 * ACB: 2 holders (JACCS 9.12, Trần Hùng Huy 5.50)
 */
function seedFixtureCorpus(): void {
  // FPT shareholders
  insertShareholder({ code: "FPT", name: "Trương Gia Bình",                own_percent: 6.89, quantity: 117347966 });
  insertShareholder({ code: "FPT", name: "SCIC",                            own_percent: 5.67, quantity: 96585637  });
  insertShareholder({ code: "FPT", name: "Red River Holding",               own_percent: 4.58, quantity: 21041999  });
  insertShareholder({ code: "FPT", name: "Công ty TNHH QT",                 own_percent: 3.69, quantity: 54303923  });
  insertShareholder({ code: "FPT", name: "Deutsche Bank",                   own_percent: 2.42, quantity: 9604598   });
  // ACB shareholders
  insertShareholder({ code: "ACB", name: "JACCS Co., Ltd.",                 own_percent: 9.12, quantity: 350000000 });
  insertShareholder({ code: "ACB", name: "Trần Hùng Huy",                   own_percent: 5.50, quantity: 211000000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// classifyConcentration unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("classifyConcentration", () => {
  it("AC-1: 50 → high / 'Tập trung cao'", () => {
    const result = classifyConcentration(50);
    expect(result.concentration).toBe("high");
    expect(result.label).toBe("Tập trung cao");
  });

  it("AC-1: 100 → high", () => {
    expect(classifyConcentration(100).concentration).toBe("high");
  });

  it("AC-1: 50.01 → high", () => {
    expect(classifyConcentration(50.01).concentration).toBe("high");
  });

  it("AC-1: 49.99 → medium / 'Tập trung vừa'", () => {
    const result = classifyConcentration(49.99);
    expect(result.concentration).toBe("medium");
    expect(result.label).toBe("Tập trung vừa");
  });

  it("AC-1: 15 → medium", () => {
    expect(classifyConcentration(15).concentration).toBe("medium");
  });

  it("AC-1: 15.0 → medium", () => {
    expect(classifyConcentration(15.0).concentration).toBe("medium");
  });

  it("AC-1: 14.99 → low / 'Phân tán'", () => {
    const result = classifyConcentration(14.99);
    expect(result.concentration).toBe("low");
    expect(result.label).toBe("Phân tán");
  });

  it("AC-1: 0 → low", () => {
    expect(classifyConcentration(0).concentration).toBe("low");
  });

  it("AC-1: null → low", () => {
    expect(classifyConcentration(null).concentration).toBe("low");
  });

  it("AC-1: undefined → low", () => {
    expect(classifyConcentration(undefined).concentration).toBe("low");
  });

  it("AC-1: NaN → low", () => {
    expect(classifyConcentration(NaN).concentration).toBe("low");
  });

  it("AC-1: boundary exactly 15 is medium not low", () => {
    expect(classifyConcentration(15).concentration).toBe("medium");
  });

  it("AC-1: boundary exactly 50 is high not medium", () => {
    expect(classifyConcentration(50).concentration).toBe("high");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeCodeMetrics unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("computeCodeMetrics", () => {
  it("AC-2: correct top1Name and top1Pct from FPT fixture", () => {
    const rows: ShareholderRow[] = [
      { code: "FPT", name: "Trương Gia Bình", quantity: 117347966, own_percent: 6.89 },
      { code: "FPT", name: "SCIC",            quantity: 96585637,  own_percent: 5.67 },
      { code: "FPT", name: "Red River",       quantity: 21041999,  own_percent: 4.58 },
      { code: "FPT", name: "QT",              quantity: 54303923,  own_percent: 3.69 },
      { code: "FPT", name: "Deutsche Bank",   quantity: 9604598,   own_percent: 2.42 },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.code).toBe("FPT");
    expect(m.holderCount).toBe(5);
    expect(m.top1Name).toBe("Trương Gia Bình");
    expect(m.top1Pct).toBe(6.89);
  });

  it("AC-2: top5Pct = sum of first 5 own_percent values (rounded 2dp)", () => {
    const rows: ShareholderRow[] = [
      { code: "FPT", name: "A", quantity: null, own_percent: 6.89 },
      { code: "FPT", name: "B", quantity: null, own_percent: 5.67 },
      { code: "FPT", name: "C", quantity: null, own_percent: 4.58 },
      { code: "FPT", name: "D", quantity: null, own_percent: 3.69 },
      { code: "FPT", name: "E", quantity: null, own_percent: 2.42 },
    ];
    const m = computeCodeMetrics(rows);
    // 6.89 + 5.67 + 4.58 + 3.69 + 2.42 = 23.25
    expect(m.top5Pct).toBe(23.25);
  });

  it("AC-2: top5Pct treats null own_percent as 0", () => {
    const rows: ShareholderRow[] = [
      { code: "X", name: "A", quantity: null, own_percent: 10.00 },
      { code: "X", name: "B", quantity: null, own_percent: null  },
      { code: "X", name: "C", quantity: null, own_percent: 5.00  },
    ];
    const m = computeCodeMetrics(rows);
    // top5: sum of all 3 = 10 + 0 + 5 = 15
    expect(m.top5Pct).toBe(15.00);
    // disclosedPct same — only 3 rows total
    expect(m.disclosedPct).toBe(15.00);
  });

  it("AC-2: top5Pct with fewer than 5 holders sums only available rows", () => {
    const rows: ShareholderRow[] = [
      { code: "Y", name: "A", quantity: null, own_percent: 20.00 },
      { code: "Y", name: "B", quantity: null, own_percent: 15.00 },
      { code: "Y", name: "C", quantity: null, own_percent: 10.00 },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.top5Pct).toBe(45.00);
    expect(m.holderCount).toBe(3);
  });

  it("AC-2: disclosedPct = sum of ALL own_percent (more than 5 rows)", () => {
    const rows: ShareholderRow[] = [
      { code: "Z", name: "A", quantity: null, own_percent: 10.00 },
      { code: "Z", name: "B", quantity: null, own_percent: 10.00 },
      { code: "Z", name: "C", quantity: null, own_percent: 10.00 },
      { code: "Z", name: "D", quantity: null, own_percent: 10.00 },
      { code: "Z", name: "E", quantity: null, own_percent: 10.00 },
      { code: "Z", name: "F", quantity: null, own_percent: 10.00 },
    ];
    const m = computeCodeMetrics(rows);
    // top5 = first 5 × 10 = 50
    expect(m.top5Pct).toBe(50.00);
    // disclosed = all 6 × 10 = 60
    expect(m.disclosedPct).toBe(60.00);
  });

  it("AC-2: disclosedPct can exceed 100 (overlapping disclosures scenario)", () => {
    // Simulate NVL-like overlap (107%)
    const rows: ShareholderRow[] = [
      { code: "NVL", name: "A", quantity: null, own_percent: 40.00 },
      { code: "NVL", name: "B", quantity: null, own_percent: 35.00 },
      { code: "NVL", name: "C", quantity: null, own_percent: 32.00 },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.disclosedPct).toBe(107.00);
  });

  it("AC-2: pcts are rounded to 2dp", () => {
    const rows: ShareholderRow[] = [
      { code: "P", name: "A", quantity: null, own_percent: 3.333 },
      { code: "P", name: "B", quantity: null, own_percent: 3.337 },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.top1Pct).toBe(3.33);
    // 3.333 + 3.337 = 6.67 rounded 2dp
    expect(m.disclosedPct).toBe(6.67);
  });

  it("AC-2: top1Pct null when first row own_percent is null", () => {
    const rows: ShareholderRow[] = [
      { code: "Q", name: "A", quantity: null, own_percent: null },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.top1Pct).toBeNull();
  });

  it("AC-2: concentration reflects top1Pct via classifyConcentration", () => {
    const rowsHigh: ShareholderRow[] = [
      { code: "H", name: "BigHolder", quantity: null, own_percent: 55.00 },
    ];
    expect(computeCodeMetrics(rowsHigh).concentration).toBe("high");

    const rowsMed: ShareholderRow[] = [
      { code: "M", name: "MidHolder", quantity: null, own_percent: 20.00 },
    ];
    expect(computeCodeMetrics(rowsMed).concentration).toBe("medium");

    const rowsLow: ShareholderRow[] = [
      { code: "L", name: "SmallHolder", quantity: null, own_percent: 5.00 },
    ];
    expect(computeCodeMetrics(rowsLow).concentration).toBe("low");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildRanking unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("buildRanking", () => {
  it("AC-3: returns [] for empty input", () => {
    expect(buildRanking([])).toHaveLength(0);
  });

  it("AC-3: single code → single ranking entry", () => {
    const rows: ShareholderRow[] = [
      { code: "FPT", name: "A", quantity: null, own_percent: 6.89 },
      { code: "FPT", name: "B", quantity: null, own_percent: 3.00 },
    ];
    const ranking = buildRanking(rows);
    expect(ranking).toHaveLength(1);
    expect(ranking[0]!.code).toBe("FPT");
    expect(ranking[0]!.top1Pct).toBe(6.89);
    expect(ranking[0]!.holderCount).toBe(2);
  });

  it("AC-3: sorted by top1Pct DESC", () => {
    const rows: ShareholderRow[] = [
      // FPT top1 = 6.89 (alphabetically first but lower pct)
      { code: "FPT", name: "Trương Gia Bình", quantity: null, own_percent: 6.89 },
      // ACB top1 = 9.12 (higher pct)
      { code: "ACB", name: "JACCS",           quantity: null, own_percent: 9.12 },
      { code: "ACB", name: "Trần Hùng Huy",   quantity: null, own_percent: 5.50 },
    ];
    const ranking = buildRanking(rows);
    expect(ranking[0]!.code).toBe("ACB");
    expect(ranking[0]!.top1Pct).toBe(9.12);
    expect(ranking[1]!.code).toBe("FPT");
    expect(ranking[1]!.top1Pct).toBe(6.89);
  });

  it("AC-3 TIE-BREAK: equal top1Pct → code ASC (deterministic)", () => {
    // ZZZ and AAA both top1 = 10.00; AAA must come first
    const rows: ShareholderRow[] = [
      { code: "ZZZ", name: "Holder", quantity: null, own_percent: 10.00 },
      { code: "ZZZ", name: "Other",  quantity: null, own_percent: 5.00  },
      { code: "AAA", name: "Holder", quantity: null, own_percent: 10.00 },
      { code: "AAA", name: "Other",  quantity: null, own_percent: 3.00  },
      { code: "MMM", name: "Holder", quantity: null, own_percent: 10.00 },
    ];
    const ranking = buildRanking(rows);
    // All three codes have top1 = 10.00 → ordered AAA, MMM, ZZZ (code ASC)
    expect(ranking[0]!.code).toBe("AAA");
    expect(ranking[1]!.code).toBe("MMM");
    expect(ranking[2]!.code).toBe("ZZZ");
  });

  it("AC-3: ranking items contain expected fields", () => {
    const rows: ShareholderRow[] = [
      { code: "FPT", name: "A", quantity: null, own_percent: 6.89 },
    ];
    const ranking = buildRanking(rows);
    const item = ranking[0]!;
    expect(typeof item.code).toBe("string");
    expect(typeof item.holderCount).toBe("number");
    expect(typeof item.top5Pct).toBe("number");
    expect(typeof item.disclosedPct).toBe("number");
    expect(typeof item.concentration).toBe("string");
    expect(typeof item.concentrationLabel).toBe("string");
    // top1Pct may be null or number
    expect(item.top1Pct === null || typeof item.top1Pct === "number").toBe(true);
  });

  it("AC-3: ranking item does NOT contain top1Name (omitted from cross-company list)", () => {
    const rows: ShareholderRow[] = [
      { code: "FPT", name: "A", quantity: null, own_percent: 6.89 },
    ];
    const ranking = buildRanking(rows);
    expect("top1Name" in ranking[0]!).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveSelectedCode unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveSelectedCode", () => {
  const codes = ["ACB", "FPT", "VCB"];

  it("AC-4: valid uppercase code → returned as-is", () => {
    expect(resolveSelectedCode("FPT", codes)).toBe("FPT");
  });

  it("AC-4: valid lowercase code → uppercased and returned", () => {
    expect(resolveSelectedCode("fpt", codes)).toBe("FPT");
  });

  it("AC-4: valid mixed-case code → uppercased and returned", () => {
    expect(resolveSelectedCode("Acb", codes)).toBe("ACB");
  });

  it("AC-4: invalid code not in list → fallback to codes[0]", () => {
    expect(resolveSelectedCode("XYZ", codes)).toBe("ACB");
  });

  it("AC-4: null requested → fallback to codes[0]", () => {
    expect(resolveSelectedCode(null, codes)).toBe("ACB");
  });

  it("AC-4: empty string → fallback to codes[0]", () => {
    expect(resolveSelectedCode("", codes)).toBe("ACB");
  });

  it("AC-4: empty codes array → fallback to ''", () => {
    expect(resolveSelectedCode("FPT", [])).toBe("");
  });

  it("AC-4: null requested + empty codes → ''", () => {
    expect(resolveSelectedCode(null, [])).toBe("");
  });

  it("AC-4: first code in list is used as fallback", () => {
    // When requested is invalid, first code alphabetically is returned
    expect(resolveSelectedCode("ZZINVALID", ["ACB", "FPT"])).toBe("ACB");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapHolder unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("mapHolder", () => {
  it("AC-5: rank is rankIndex+1 (1-based)", () => {
    const row: ShareholderRow = { code: "FPT", name: "A", quantity: 100, own_percent: 6.89 };
    expect(mapHolder(row, 0).rank).toBe(1);
    expect(mapHolder(row, 1).rank).toBe(2);
    expect(mapHolder(row, 9).rank).toBe(10);
  });

  it("AC-5: name is preserved", () => {
    const row: ShareholderRow = { code: "FPT", name: "Trương Gia Bình", quantity: 1000, own_percent: 6.89 };
    expect(mapHolder(row, 0).name).toBe("Trương Gia Bình");
  });

  it("AC-5: quantity preserved (non-null)", () => {
    const row: ShareholderRow = { code: "FPT", name: "A", quantity: 117347966, own_percent: 6.89 };
    expect(mapHolder(row, 0).quantity).toBe(117347966);
  });

  it("AC-5: quantity preserved as null", () => {
    const row: ShareholderRow = { code: "FPT", name: "A", quantity: null, own_percent: 6.89 };
    expect(mapHolder(row, 0).quantity).toBeNull();
  });

  it("AC-5: ownPercent is rounded to 2dp", () => {
    const row: ShareholderRow = { code: "FPT", name: "A", quantity: null, own_percent: 6.8900001 };
    expect(mapHolder(row, 0).ownPercent).toBe(6.89);
  });

  it("AC-5: ownPercent null passes through as null", () => {
    const row: ShareholderRow = { code: "FPT", name: "A", quantity: null, own_percent: null };
    expect(mapHolder(row, 0).ownPercent).toBeNull();
  });

  it("AC-5: HolderItem shape — code NOT present (only rank/name/quantity/ownPercent)", () => {
    const row: ShareholderRow = { code: "FPT", name: "A", quantity: null, own_percent: 6.89 };
    const item = mapHolder(row, 0);
    expect("rank" in item).toBe(true);
    expect("name" in item).toBe(true);
    expect("quantity" in item).toBe(true);
    expect("ownPercent" in item).toBe(true);
    expect("code" in item).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetShareholders — integration tests using in-memory DB
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE14 — handleGetShareholders (in-memory DB)", () => {
  it("AC-6: empty table → status 200 + zeroed empty-state shape", () => {
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as ShareholdersResponse;
    expect(body.asOf).toBeNull();
    expect(body.codes).toHaveLength(0);
    expect(body.selectedCode).toBe("");
    expect(body.holders).toHaveLength(0);
    expect(body.selectedSummary).toBeNull();
    expect(body.ranking).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(typeof body.generatedAt).toBe("string");
  });

  it("AC-7: seeded data → response envelope has all required fields", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    expect(res.statusCode).toBe(200);
    expect(typeof body.generatedAt).toBe("string");
    expect(typeof body.asOf).toBe("string");
    expect(Array.isArray(body.codes)).toBe(true);
    expect(typeof body.selectedCode).toBe("string");
    expect(Array.isArray(body.holders)).toBe(true);
    expect(Array.isArray(body.ranking)).toBe(true);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBe(body.holders.length);
  });

  it("AC-7: codes list contains all distinct codes alphabetically", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    // Fixture has ACB and FPT
    expect(body.codes).toContain("ACB");
    expect(body.codes).toContain("FPT");
    // ACB comes first alphabetically
    expect(body.codes[0]).toBe("ACB");
  });

  it("AC-7: default selectedCode = first code (ACB in fixture)", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    // No ?code= param → first code alphabetically = ACB
    expect(body.selectedCode).toBe("ACB");
    expect(body.holders[0]!.name).toBe("JACCS Co., Ltd.");
    expect(body.holders[0]!.rank).toBe(1);
  });

  it("AC-7: ?code=FPT → selectedCode=FPT + correct top1 in holders", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders?code=FPT"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    expect(body.selectedCode).toBe("FPT");
    expect(body.holders[0]!.name).toBe("Trương Gia Bình");
    expect(body.holders[0]!.ownPercent).toBe(6.89);
    expect(body.holders[0]!.rank).toBe(1);
  });

  it("AC-7: ?code=fpt (lowercase) → selectedCode=FPT (case-insensitive)", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders?code=fpt"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    expect(body.selectedCode).toBe("FPT");
  });

  it("AC-7: ?code=INVALID → falls back to first code (ACB)", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders?code=INVALID"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    expect(body.selectedCode).toBe("ACB");
  });

  it("AC-7: selectedSummary for FPT has correct top1Name/top1Pct", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders?code=FPT"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    const summary = body.selectedSummary as CodeMetrics;
    expect(summary.code).toBe("FPT");
    expect(summary.top1Name).toBe("Trương Gia Bình");
    expect(summary.top1Pct).toBe(6.89);
    expect(summary.holderCount).toBe(5);
    // top5 = all 5 (since we only have 5): 6.89+5.67+4.58+3.69+2.42 = 23.25
    expect(summary.top5Pct).toBe(23.25);
  });

  it("AC-7: selectedSummary for ACB has correct values", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders?code=ACB"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    const summary = body.selectedSummary as CodeMetrics;
    expect(summary.code).toBe("ACB");
    expect(summary.top1Name).toBe("JACCS Co., Ltd.");
    expect(summary.top1Pct).toBe(9.12);
    expect(summary.holderCount).toBe(2);
  });

  it("AC-7: ranking has ACB before FPT (ACB top1=9.12 > FPT top1=6.89)", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    expect(body.ranking[0]!.code).toBe("ACB");
    expect(body.ranking[1]!.code).toBe("FPT");
  });

  it("AC-7: count = holders.length", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders?code=FPT"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    expect(body.count).toBe(body.holders.length);
    expect(body.count).toBe(5);
  });

  it("AC-7: holders rank numbers are sequential 1-based", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders?code=FPT"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    body.holders.forEach((h, i) => {
      expect(h.rank).toBe(i + 1);
    });
  });

  it("AC-7: holders capped at HOLDERS_ROW_CAP (200)", () => {
    // Insert 210 holders for one code
    for (let i = 0; i < 210; i++) {
      insertShareholder({
        code: "BIG",
        name: `Holder ${String(i).padStart(3, "0")}`,
        own_percent: 0.5,
      });
    }
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders?code=BIG"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    expect(body.holders.length).toBeLessThanOrEqual(HOLDERS_ROW_CAP);
    expect(body.count).toBeLessThanOrEqual(HOLDERS_ROW_CAP);
  });

  it("AC-7: 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );
    expect(res.statusCode).toBe(500);
    const body = JSON.parse(res.body) as { error: string };
    expect(body.error).toBe("db_error");
  });

  it("AC-7: generatedAt is a valid ISO 8601 string", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("AC-7: asOf is set from fixture fetched_at", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetShareholdersHttp(
      makeFakeReq("/api/shareholders"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as ShareholdersResponse;
    // All fixture rows have fetched_at = "2026-04-14T18:08:47.720Z"
    expect(body.asOf).toBe("2026-04-14T18:08:47.720Z");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Constant guards
// ─────────────────────────────────────────────────────────────────────────────

describe("Constants", () => {
  it("HOLDERS_ROW_CAP = 200", () => {
    expect(HOLDERS_ROW_CAP).toBe(200);
  });

  it("TOP_N = 5", () => {
    expect(TOP_N).toBe(5);
  });
});
