/**
 * TASK17-PAGE15 — GET /api/officers
 *
 * "Ban lãnh đạo & quản trị" — Board of Directors & Management snapshot.
 * Pure-function unit tests on in-code fixture data.
 * Does NOT hit the real DB — all store calls are replaced by fixture arrays.
 *
 * AC-1:  isBoardSeat — true/false cases for "Hội đồng Quản trị" presence
 * AC-2:  computeCodeMetrics — boardSeats count, totalInsiderPct math incl. null-as-0,
 *          all-null-top handling, top* fields, rounding 2dp
 * AC-3:  buildRanking — ordered totalInsiderPct DESC, TIE-BREAK code ASC (deterministic)
 * AC-4:  resolveSelectedCode — valid / invalid / lowercase / null / empty-codes fallback
 * AC-5:  mapOfficer — rank numbering (rankIndex+1), appointmentYear passthrough (incl. null)
 * AC-6:  empty-state shape — empty table produces zeros + empty arrays + null asOf
 * AC-7:  handleGetOfficers — officers cap (OFFICERS_ROW_CAP), count field, selectedSummary,
 *          FPT ground-truth, BID default, ranking head
 *
 * DDD layer: interface + infrastructure tested together at the helper seam.
 * Isolation: in-memory SQLite, reset per test via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-PAGE15] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  isBoardSeat,
  computeCodeMetrics,
  buildRanking,
  resolveSelectedCode,
  mapOfficer,
  handleGetOfficers,
  handleGetOfficersHttp,
  OFFICERS_ROW_CAP,
  type OfficersResponse,
  type OfficerItem,
  type OfficerCodeMetrics,
  type OfficerRankingItem,
} from "../interface/mcp/routes/officersHandler.js";
import type { OfficerRow } from "../infrastructure/db/officersStore.js";

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

function makeFakeReq(url: string = "/api/officers"): import("node:http").IncomingMessage {
  return { url } as import("node:http").IncomingMessage;
}

/**
 * Insert a vnstock_officers row directly via raw SQL.
 */
function insertOfficer(opts: {
  code: string;
  name: string;
  position: string;
  own_percent?: number | null;
  quantity?: number | null;
  fetched_at?: string;
  appointment_year?: number | null;
}): void {
  const db = getDb();
  const {
    code,
    name,
    position,
    own_percent = null,
    quantity = null,
    fetched_at = "2026-06-10T12:00:00.000Z",
    appointment_year = null,
  } = opts;
  db.prepare(
    `INSERT OR IGNORE INTO vnstock_officers
       (code, name, position, own_percent, quantity, fetched_at, appointment_year)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(code, name, position, own_percent, quantity, fetched_at, appointment_year);
}

/**
 * Seed a small realistic fixture corpus (2 codes).
 * BID: 3 officers (all own_percent 0 → totalInsiderPct 0.0)
 * FPT: 3 officers including board seats
 *   "Trương Gia Bình" / "Chủ tịch Hội đồng Quản trị" / 6.89
 *   "Nguyễn Văn A"    / "Thành viên Hội đồng Quản trị" / 2.00
 *   "CEO FPT"         / "Tổng Giám đốc" / 1.56
 */
function seedFixtureCorpus(): void {
  // BID officers — all 0 own_percent, no board seats in fixture
  insertOfficer({ code: "BID", name: "Trần Phương Bình", position: "Chủ tịch", own_percent: 0, quantity: 0, appointment_year: 2015 });
  insertOfficer({ code: "BID", name: "Lê Ngọc Lâm",      position: "Tổng Giám đốc", own_percent: 0, quantity: 0 });
  insertOfficer({ code: "BID", name: "Phan Thanh Tân",   position: "Phó Tổng Giám đốc", own_percent: 0, quantity: 0 });
  // FPT officers — mix of board seats and management
  insertOfficer({ code: "FPT", name: "Trương Gia Bình",  position: "Chủ tịch Hội đồng Quản trị", own_percent: 6.89, quantity: 117347966, appointment_year: 1999 });
  insertOfficer({ code: "FPT", name: "Nguyễn Văn A",     position: "Thành viên Hội đồng Quản trị", own_percent: 2.00, quantity: 5000000 });
  insertOfficer({ code: "FPT", name: "CEO FPT",          position: "Tổng Giám đốc", own_percent: 1.56, quantity: 3000000 });
}

// ─────────────────────────────────────────────────────────────────────────────
// isBoardSeat unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("isBoardSeat", () => {
  it("AC-1: 'Hội đồng Quản trị' exact → true", () => {
    expect(isBoardSeat("Hội đồng Quản trị")).toBe(true);
  });

  it("AC-1: 'Thành viên Hội đồng Quản trị' → true", () => {
    expect(isBoardSeat("Thành viên Hội đồng Quản trị")).toBe(true);
  });

  it("AC-1: 'Chủ tịch Hội đồng Quản trị' → true", () => {
    expect(isBoardSeat("Chủ tịch Hội đồng Quản trị")).toBe(true);
  });

  it("AC-1: 'Thành viên độc lập Hội đồng Quản trị' → true", () => {
    expect(isBoardSeat("Thành viên độc lập Hội đồng Quản trị")).toBe(true);
  });

  it("AC-1: 'Tổng Giám đốc' → false", () => {
    expect(isBoardSeat("Tổng Giám đốc")).toBe(false);
  });

  it("AC-1: 'Chủ tịch' alone → false (no Hội đồng Quản trị)", () => {
    expect(isBoardSeat("Chủ tịch")).toBe(false);
  });

  it("AC-1: 'Phó Tổng Giám đốc' → false", () => {
    expect(isBoardSeat("Phó Tổng Giám đốc")).toBe(false);
  });

  it("AC-1: empty string → false", () => {
    expect(isBoardSeat("")).toBe(false);
  });

  it("AC-1: partial substring 'Hội đồng' alone → false", () => {
    expect(isBoardSeat("Thành viên Hội đồng Cổ đông")).toBe(false);
  });

  it("AC-1: 'Kiểm soát viên' → false", () => {
    expect(isBoardSeat("Kiểm soát viên")).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// computeCodeMetrics unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("computeCodeMetrics", () => {
  it("AC-2: correct officerCount, boardSeats, totalInsiderPct from FPT fixture", () => {
    const rows: OfficerRow[] = [
      { code: "FPT", name: "Trương Gia Bình", position: "Chủ tịch Hội đồng Quản trị",    own_percent: 6.89, quantity: 117347966, appointment_year: 1999 },
      { code: "FPT", name: "Nguyễn Văn A",    position: "Thành viên Hội đồng Quản trị",   own_percent: 2.00, quantity: 5000000,   appointment_year: null },
      { code: "FPT", name: "CEO FPT",         position: "Tổng Giám đốc",                  own_percent: 1.56, quantity: 3000000,   appointment_year: null },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.code).toBe("FPT");
    expect(m.officerCount).toBe(3);
    expect(m.boardSeats).toBe(2); // Trương Gia Bình + Nguyễn Văn A
    // totalInsiderPct = 6.89 + 2.00 + 1.56 = 10.45
    expect(m.totalInsiderPct).toBe(10.45);
  });

  it("AC-2: top* = row with highest own_percent (non-null), name + position preserved", () => {
    const rows: OfficerRow[] = [
      { code: "FPT", name: "Trương Gia Bình", position: "Chủ tịch Hội đồng Quản trị", own_percent: 6.89, quantity: null, appointment_year: null },
      { code: "FPT", name: "Nguyễn Văn A",    position: "Thành viên HĐQT",             own_percent: 2.00, quantity: null, appointment_year: null },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.topName).toBe("Trương Gia Bình");
    expect(m.topPosition).toBe("Chủ tịch Hội đồng Quản trị");
    expect(m.topPct).toBe(6.89);
  });

  it("AC-2: null own_percent treated as 0 in totalInsiderPct sum", () => {
    const rows: OfficerRow[] = [
      { code: "BID", name: "A", position: "Chủ tịch", own_percent: null, quantity: null, appointment_year: null },
      { code: "BID", name: "B", position: "CEO",       own_percent: null, quantity: null, appointment_year: null },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.totalInsiderPct).toBe(0);
  });

  it("AC-2: all-null own_percent → topPct is null, topName/topPosition are null", () => {
    const rows: OfficerRow[] = [
      { code: "XYZ", name: "A", position: "Chủ tịch", own_percent: null, quantity: null, appointment_year: null },
      { code: "XYZ", name: "B", position: "CEO",       own_percent: null, quantity: null, appointment_year: null },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.topPct).toBeNull();
    expect(m.topName).toBeNull();
    expect(m.topPosition).toBeNull();
  });

  it("AC-2: boardSeats count is correct when no board seats present", () => {
    const rows: OfficerRow[] = [
      { code: "X", name: "A", position: "Tổng Giám đốc",       own_percent: 1.0, quantity: null, appointment_year: null },
      { code: "X", name: "B", position: "Phó Tổng Giám đốc",   own_percent: 0.5, quantity: null, appointment_year: null },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.boardSeats).toBe(0);
  });

  it("AC-2: boardSeats count is correct when all are board seats", () => {
    const rows: OfficerRow[] = [
      { code: "X", name: "A", position: "Chủ tịch Hội đồng Quản trị",    own_percent: 5.0, quantity: null, appointment_year: null },
      { code: "X", name: "B", position: "Thành viên Hội đồng Quản trị",  own_percent: 3.0, quantity: null, appointment_year: null },
      { code: "X", name: "C", position: "Thành viên Hội đồng Quản trị",  own_percent: 1.0, quantity: null, appointment_year: null },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.boardSeats).toBe(3);
  });

  it("AC-2: totalInsiderPct is rounded to 2dp", () => {
    const rows: OfficerRow[] = [
      { code: "P", name: "A", position: "CEO", own_percent: 3.333, quantity: null, appointment_year: null },
      { code: "P", name: "B", position: "CFO", own_percent: 3.337, quantity: null, appointment_year: null },
    ];
    const m = computeCodeMetrics(rows);
    // 3.333 + 3.337 = 6.67
    expect(m.totalInsiderPct).toBe(6.67);
  });

  it("AC-2: topPct is rounded to 2dp", () => {
    const rows: OfficerRow[] = [
      { code: "P", name: "A", position: "Chủ tịch Hội đồng Quản trị", own_percent: 6.8900001, quantity: null, appointment_year: null },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.topPct).toBe(6.89);
  });

  it("AC-2: single officer with board seat → boardSeats=1, officerCount=1", () => {
    const rows: OfficerRow[] = [
      { code: "Z", name: "Chủ tịch", position: "Chủ tịch Hội đồng Quản trị", own_percent: 10.0, quantity: null, appointment_year: null },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.officerCount).toBe(1);
    expect(m.boardSeats).toBe(1);
    expect(m.totalInsiderPct).toBe(10.0);
  });

  it("AC-2: top* uses first non-null own_percent row (store sorts DESC)", () => {
    // Store sorts own_percent DESC nulls last — simulate that ordering
    const rows: OfficerRow[] = [
      { code: "Y", name: "TopPerson", position: "CEO", own_percent: 8.0,  quantity: null, appointment_year: null },
      { code: "Y", name: "NullPct",   position: "CFO", own_percent: null, quantity: null, appointment_year: null },
    ];
    const m = computeCodeMetrics(rows);
    expect(m.topName).toBe("TopPerson");
    expect(m.topPct).toBe(8.0);
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
    const rows: OfficerRow[] = [
      { code: "FPT", name: "A", position: "Chủ tịch HĐQT", own_percent: 6.89, quantity: null, appointment_year: null },
      { code: "FPT", name: "B", position: "CEO",             own_percent: 2.00, quantity: null, appointment_year: null },
    ];
    const ranking = buildRanking(rows);
    expect(ranking).toHaveLength(1);
    expect(ranking[0]!.code).toBe("FPT");
    expect(ranking[0]!.totalInsiderPct).toBe(8.89);
    expect(ranking[0]!.officerCount).toBe(2);
  });

  it("AC-3: sorted by totalInsiderPct DESC", () => {
    const rows: OfficerRow[] = [
      { code: "BID", name: "A", position: "Chủ tịch", own_percent: 0.0, quantity: null, appointment_year: null },
      { code: "FPT", name: "B", position: "Chủ tịch Hội đồng Quản trị", own_percent: 6.89, quantity: null, appointment_year: null },
      { code: "FPT", name: "C", position: "CEO",       own_percent: 2.00, quantity: null, appointment_year: null },
    ];
    const ranking = buildRanking(rows);
    // FPT totalInsiderPct = 8.89 > BID = 0.0
    expect(ranking[0]!.code).toBe("FPT");
    expect(ranking[1]!.code).toBe("BID");
  });

  it("AC-3 TIE-BREAK: equal totalInsiderPct → code ASC (deterministic)", () => {
    const rows: OfficerRow[] = [
      { code: "ZZZ", name: "A", position: "CEO", own_percent: 10.00, quantity: null, appointment_year: null },
      { code: "AAA", name: "A", position: "CEO", own_percent: 10.00, quantity: null, appointment_year: null },
      { code: "MMM", name: "A", position: "CEO", own_percent: 10.00, quantity: null, appointment_year: null },
    ];
    const ranking = buildRanking(rows);
    expect(ranking[0]!.code).toBe("AAA");
    expect(ranking[1]!.code).toBe("MMM");
    expect(ranking[2]!.code).toBe("ZZZ");
  });

  it("AC-3: ranking items contain expected fields", () => {
    const rows: OfficerRow[] = [
      { code: "FPT", name: "A", position: "Chủ tịch HĐQT", own_percent: 6.89, quantity: null, appointment_year: null },
    ];
    const ranking = buildRanking(rows);
    const item = ranking[0]!;
    expect(typeof item.code).toBe("string");
    expect(typeof item.officerCount).toBe("number");
    expect(typeof item.boardSeats).toBe("number");
    expect(typeof item.totalInsiderPct).toBe("number");
  });

  it("AC-3: ranking item does NOT contain topName/topPct (omitted from cross-company list)", () => {
    const rows: OfficerRow[] = [
      { code: "FPT", name: "A", position: "CEO", own_percent: 6.89, quantity: null, appointment_year: null },
    ];
    const ranking = buildRanking(rows);
    expect("topName" in ranking[0]!).toBe(false);
    expect("topPct" in ranking[0]!).toBe(false);
  });

  it("AC-3: all-null own_percent → totalInsiderPct=0 (not negative)", () => {
    const rows: OfficerRow[] = [
      { code: "X", name: "A", position: "CEO", own_percent: null, quantity: null, appointment_year: null },
      { code: "X", name: "B", position: "CFO", own_percent: null, quantity: null, appointment_year: null },
    ];
    const ranking = buildRanking(rows);
    expect(ranking[0]!.totalInsiderPct).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// resolveSelectedCode unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveSelectedCode", () => {
  const codes = ["BID", "FPT", "VCB"];

  it("AC-4: valid uppercase code → returned as-is", () => {
    expect(resolveSelectedCode("FPT", codes)).toBe("FPT");
  });

  it("AC-4: valid lowercase code → uppercased and returned", () => {
    expect(resolveSelectedCode("fpt", codes)).toBe("FPT");
  });

  it("AC-4: valid mixed-case code → uppercased and returned", () => {
    expect(resolveSelectedCode("Bid", codes)).toBe("BID");
  });

  it("AC-4: invalid code not in list → fallback to codes[0]", () => {
    expect(resolveSelectedCode("XYZ", codes)).toBe("BID");
  });

  it("AC-4: null requested → fallback to codes[0]", () => {
    expect(resolveSelectedCode(null, codes)).toBe("BID");
  });

  it("AC-4: empty string → fallback to codes[0]", () => {
    expect(resolveSelectedCode("", codes)).toBe("BID");
  });

  it("AC-4: empty codes array → fallback to ''", () => {
    expect(resolveSelectedCode("FPT", [])).toBe("");
  });

  it("AC-4: null requested + empty codes → ''", () => {
    expect(resolveSelectedCode(null, [])).toBe("");
  });

  it("AC-4: first code in list is used as fallback (no hardcoded default)", () => {
    // When requested is invalid, first code alphabetically is returned
    expect(resolveSelectedCode("ZZINVALID", ["BID", "FPT"])).toBe("BID");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// mapOfficer unit tests
// ─────────────────────────────────────────────────────────────────────────────

describe("mapOfficer", () => {
  it("AC-5: rank is rankIndex+1 (1-based)", () => {
    const row: OfficerRow = { code: "FPT", name: "A", position: "CEO", own_percent: 6.89, quantity: 100, appointment_year: 2010 };
    expect(mapOfficer(row, 0).rank).toBe(1);
    expect(mapOfficer(row, 1).rank).toBe(2);
    expect(mapOfficer(row, 9).rank).toBe(10);
  });

  it("AC-5: name and position are preserved", () => {
    const row: OfficerRow = { code: "FPT", name: "Trương Gia Bình", position: "Chủ tịch Hội đồng Quản trị", own_percent: 6.89, quantity: null, appointment_year: null };
    const item = mapOfficer(row, 0);
    expect(item.name).toBe("Trương Gia Bình");
    expect(item.position).toBe("Chủ tịch Hội đồng Quản trị");
  });

  it("AC-5: quantity preserved (non-null)", () => {
    const row: OfficerRow = { code: "FPT", name: "A", position: "CEO", own_percent: 6.89, quantity: 117347966, appointment_year: null };
    expect(mapOfficer(row, 0).quantity).toBe(117347966);
  });

  it("AC-5: quantity preserved as null", () => {
    const row: OfficerRow = { code: "FPT", name: "A", position: "CEO", own_percent: 6.89, quantity: null, appointment_year: null };
    expect(mapOfficer(row, 0).quantity).toBeNull();
  });

  it("AC-5: ownPercent is rounded to 2dp", () => {
    const row: OfficerRow = { code: "FPT", name: "A", position: "CEO", own_percent: 6.8900001, quantity: null, appointment_year: null };
    expect(mapOfficer(row, 0).ownPercent).toBe(6.89);
  });

  it("AC-5: ownPercent null passes through as null", () => {
    const row: OfficerRow = { code: "FPT", name: "A", position: "CEO", own_percent: null, quantity: null, appointment_year: null };
    expect(mapOfficer(row, 0).ownPercent).toBeNull();
  });

  it("AC-5: appointmentYear passthrough (non-null)", () => {
    const row: OfficerRow = { code: "FPT", name: "A", position: "CEO", own_percent: null, quantity: null, appointment_year: 2010 };
    expect(mapOfficer(row, 0).appointmentYear).toBe(2010);
  });

  it("AC-5: appointmentYear passthrough as null", () => {
    const row: OfficerRow = { code: "FPT", name: "A", position: "CEO", own_percent: null, quantity: null, appointment_year: null };
    expect(mapOfficer(row, 0).appointmentYear).toBeNull();
  });

  it("AC-5: OfficerItem shape — code NOT present (only rank/name/position/ownPercent/quantity/appointmentYear)", () => {
    const row: OfficerRow = { code: "FPT", name: "A", position: "CEO", own_percent: 6.89, quantity: null, appointment_year: null };
    const item = mapOfficer(row, 0);
    expect("rank" in item).toBe(true);
    expect("name" in item).toBe(true);
    expect("position" in item).toBe(true);
    expect("ownPercent" in item).toBe(true);
    expect("quantity" in item).toBe(true);
    expect("appointmentYear" in item).toBe(true);
    expect("code" in item).toBe(false);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetOfficers — integration tests using in-memory DB
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE15 — handleGetOfficers (in-memory DB)", () => {
  it("AC-6: empty table → status 200 + zeroed empty-state shape", () => {
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.statusCode).toBe(200);
    const body = JSON.parse(res.body) as OfficersResponse;
    expect(body.asOf).toBeNull();
    expect(body.codes).toHaveLength(0);
    expect(body.selectedCode).toBe("");
    expect(body.officers).toHaveLength(0);
    expect(body.selectedSummary).toBeNull();
    expect(body.ranking).toHaveLength(0);
    expect(body.count).toBe(0);
    expect(typeof body.generatedAt).toBe("string");
  });

  it("AC-7: seeded data → response envelope has all required fields", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    expect(res.statusCode).toBe(200);
    expect(typeof body.generatedAt).toBe("string");
    expect(typeof body.asOf).toBe("string");
    expect(Array.isArray(body.codes)).toBe(true);
    expect(typeof body.selectedCode).toBe("string");
    expect(Array.isArray(body.officers)).toBe(true);
    expect(Array.isArray(body.ranking)).toBe(true);
    expect(typeof body.count).toBe("number");
    expect(body.count).toBe(body.officers.length);
  });

  it("AC-7: codes list contains all distinct codes alphabetically", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    expect(body.codes).toContain("BID");
    expect(body.codes).toContain("FPT");
    // BID comes first alphabetically
    expect(body.codes[0]).toBe("BID");
  });

  it("AC-7: default selectedCode = first code (BID in fixture — mirrors live BID default)", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    // No ?code= param → first code alphabetically = BID (mirrors live where BID is MIN code ASC)
    expect(body.selectedCode).toBe("BID");
  });

  it("AC-7: ?code=FPT → selectedCode=FPT + correct top officer in officers list", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers?code=FPT"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    expect(body.selectedCode).toBe("FPT");
    // FPT top officer by own_percent = Trương Gia Bình (6.89)
    expect(body.officers[0]!.name).toBe("Trương Gia Bình");
    expect(body.officers[0]!.ownPercent).toBe(6.89);
    expect(body.officers[0]!.rank).toBe(1);
    expect(body.officers[0]!.position).toBe("Chủ tịch Hội đồng Quản trị");
  });

  it("AC-7: ?code=fpt (lowercase) → selectedCode=FPT (case-insensitive)", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers?code=fpt"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    expect(body.selectedCode).toBe("FPT");
  });

  it("AC-7: ?code=INVALID → falls back to first code (BID)", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers?code=INVALID"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    expect(body.selectedCode).toBe("BID");
  });

  it("AC-7: selectedSummary for FPT has correct metrics", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers?code=FPT"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    const summary = body.selectedSummary as OfficerCodeMetrics;
    expect(summary.code).toBe("FPT");
    expect(summary.officerCount).toBe(3);
    expect(summary.boardSeats).toBe(2); // Trương Gia Bình + Nguyễn Văn A
    // totalInsiderPct = 6.89 + 2.00 + 1.56 = 10.45
    expect(summary.totalInsiderPct).toBe(10.45);
    expect(summary.topName).toBe("Trương Gia Bình");
    expect(summary.topPosition).toBe("Chủ tịch Hội đồng Quản trị");
    expect(summary.topPct).toBe(6.89);
  });

  it("AC-7: selectedSummary for BID has totalInsiderPct = 0.0", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers?code=BID"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    const summary = body.selectedSummary as OfficerCodeMetrics;
    expect(summary.code).toBe("BID");
    expect(summary.totalInsiderPct).toBe(0);
  });

  it("AC-7: ranking — FPT (10.45) ranks above BID (0.0)", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    expect(body.ranking[0]!.code).toBe("FPT");
    expect(body.ranking[0]!.totalInsiderPct).toBe(10.45);
    expect(body.ranking[1]!.code).toBe("BID");
    expect(body.ranking[1]!.totalInsiderPct).toBe(0);
  });

  it("AC-7: count = officers.length", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers?code=FPT"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    expect(body.count).toBe(body.officers.length);
    expect(body.count).toBe(3);
  });

  it("AC-7: officers rank numbers are sequential 1-based", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers?code=FPT"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    body.officers.forEach((o, i) => {
      expect(o.rank).toBe(i + 1);
    });
  });

  it("AC-7: officers capped at OFFICERS_ROW_CAP (200)", () => {
    // Insert 210 officers for one code
    for (let i = 0; i < 210; i++) {
      insertOfficer({
        code: "BIG",
        name: `Officer ${String(i).padStart(3, "0")}`,
        position: "Thành viên",
        own_percent: 0.1,
      });
    }
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers?code=BIG"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    expect(body.officers.length).toBeLessThanOrEqual(OFFICERS_ROW_CAP);
    expect(body.count).toBeLessThanOrEqual(OFFICERS_ROW_CAP);
  });

  it("AC-7: 500 JSON on DB error (closed DB)", () => {
    const db = getDb();
    closeDb();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers"),
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
    handleGetOfficersHttp(
      makeFakeReq("/api/officers"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("AC-7: asOf is set from fixture fetched_at", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    // All fixture rows have fetched_at = "2026-06-10T12:00:00.000Z"
    expect(body.asOf).toBe("2026-06-10T12:00:00.000Z");
  });

  it("AC-7: officers contain appointmentYear field (null or number)", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers?code=FPT"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    body.officers.forEach((o) => {
      expect(o.appointmentYear === null || typeof o.appointmentYear === "number").toBe(true);
    });
    // Trương Gia Bình has appointment_year 1999
    const tgb = body.officers.find((o) => o.name === "Trương Gia Bình");
    expect(tgb).toBeDefined();
    expect(tgb!.appointmentYear).toBe(1999);
  });

  it("AC-7: ranking items have boardSeats field", () => {
    seedFixtureCorpus();
    const res = makeMockRes();
    handleGetOfficersHttp(
      makeFakeReq("/api/officers"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    const body = JSON.parse(res.body) as OfficersResponse;
    expect(body.ranking.every((r) => typeof r.boardSeats === "number")).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Constant guards
// ─────────────────────────────────────────────────────────────────────────────

describe("Constants", () => {
  it("OFFICERS_ROW_CAP = 200", () => {
    expect(OFFICERS_ROW_CAP).toBe(200);
  });
});
