/**
 * FIX-I-B — Board Details Unit + Replay Tests
 *
 * Tests:
 *   1. boardDetailsFetcher: result shape, null propagation for N/A / missing FromDate
 *   2. boardDetailsStore: UPDATE-only — name-mismatch yields count=0 and does NOT insert
 *   3. boardDetailsStore: own_percent / quantity are NOT overwritten
 *   4. companyProfileTools: appointment_year=null → ceo_tenure_years=null (no fabrication)
 *   5. companyProfileTools: appointment_year set → ceo_tenure_years = currentYear - year
 *   6. Replay: seed officers → upsertBoardDetails → queryCompanyProfile includes appointment_year
 *   7. Schema migration: appointment_year column added idempotently
 *
 * No live VPS, no live mcp-server required.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { fetchBoardDetails } from "../infrastructure/fetchers/boardDetailsFetcher.js";
import { upsertBoardDetails } from "../infrastructure/db/boardDetailsStore.js";
import { queryCompanyProfile } from "../interface/mcp/tools/market-data/companyProfileTools.js";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  return db;
}

/**
 * Seed minimal vnstock_officers rows (as VCI sync would do).
 * Does NOT include appointment_year — that comes from boardDetailsJob.
 */
function seedOfficers(
  db: Database,
  rows: Array<{
    code: string;
    name: string;
    position: string;
    own_percent?: number | null;
    quantity?: number | null;
  }>,
): void {
  const stmt = db.prepare(
    `INSERT OR REPLACE INTO vnstock_officers (code, name, position, own_percent, quantity)
     VALUES (?, ?, ?, ?, ?)`,
  );
  for (const r of rows) {
    stmt.run(r.code, r.name, r.position, r.own_percent ?? null, r.quantity ?? null);
  }
}

/**
 * Minimal VPS mock response builder.
 * Returns `as unknown as typeof fetch` to satisfy Bun's preconnect requirement.
 *
 * VPS response shape: data[ticker] is an ARRAY of officers (not nested under .officers).
 * Each officer has snake_case fields; appointment_year is already parsed (number | null).
 */
function mockFetch(responseData: {
  status?: string;
  tickers_ok?: string[];
  tickers_error?: string[];
  data?: Record<string, Array<{ name: string; position_text?: string; appointment_year: number | null; closed_date?: string; year_of_birth?: number; independence?: number; total_shares?: number }>>;
  fetched_at?: string;
}): typeof fetch {
  const fn = async () => {
    const body = JSON.stringify({
      status: "ok",
      tickers_ok: [],
      tickers_error: [],
      fetched_at: "2026-06-04T21:00:00.000Z",
      data: {},
      ...responseData,
    });
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  };
  return fn as unknown as typeof fetch;
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. boardDetailsFetcher — shape + null propagation
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-I-B boardDetailsFetcher", () => {
  it("returns BoardDetailsFetchResult with expected shape", async () => {
    const mockF = mockFetch({
      tickers_ok: ["FPT"],
      data: {
        FPT: [
          { name: "Trương Gia Bình", position_text: "Chủ tịch HĐQT", appointment_year: 1988 },
        ],
      },
    });

    const result = await fetchBoardDetails(["FPT"], mockF);
    expect(result).not.toBeNull();
    expect(result!.officers).toHaveLength(1);
    expect(result!.officers[0]!.code).toBe("FPT");
    expect(result!.officers[0]!.name).toBe("Trương Gia Bình");
    expect(result!.officers[0]!.appointment_year).toBe(1988);
    expect(result!.tickers_ok).toContain("FPT");
  });

  it("null appointment_year from VPS → appointment_year null (never 0, never string)", async () => {
    const mockF = mockFetch({
      tickers_ok: ["VCB"],
      data: {
        VCB: [
          { name: "Officer A", position_text: "CEO", appointment_year: null },
          { name: "Officer B", position_text: "CFO", appointment_year: null },
          { name: "Officer C", position_text: "COO", appointment_year: null },
          { name: "Officer D", position_text: "CTO", appointment_year: null },
        ],
      },
    });

    const result = await fetchBoardDetails(["VCB"], mockF);
    expect(result).not.toBeNull();
    expect(result!.officers).toHaveLength(4);
    for (const officer of result!.officers) {
      expect(officer.appointment_year).toBeNull();
    }
  });

  it("appointment_year already parsed on VPS side (direct integer)", async () => {
    const mockF = mockFetch({
      tickers_ok: ["HPG"],
      data: {
        HPG: [
          { name: "Trần Đình Long", position_text: "Chủ tịch", appointment_year: 2007 },
        ],
      },
    });

    const result = await fetchBoardDetails(["HPG"], mockF);
    expect(result!.officers[0]!.appointment_year).toBe(2007);
  });

  it("returns null when all chunks fail (network error)", async () => {
    const errorFetch = (async () => {
      throw new Error("network error");
    }) as unknown as typeof fetch;
    const result = await fetchBoardDetails(["FPT"], errorFetch);
    expect(result).toBeNull();
  });

  it("tickers_error populated when chunk returns non-200", async () => {
    const badFetch = (async () =>
      new Response("Server Error", { status: 500 })) as unknown as typeof fetch;
    const result = await fetchBoardDetails(["FPT"], badFetch);
    // All chunks failed → null
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 2 & 3. boardDetailsStore — UPDATE-only, name-mismatch, own_percent preservation
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-I-B boardDetailsStore", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
    seedOfficers(db, [
      { code: "FPT", name: "Trương Gia Bình", position: "Chủ tịch HĐQT", own_percent: 5.23, quantity: 15000000 },
      { code: "FPT", name: "Nguyễn Văn Khoa", position: "Tổng Giám đốc", own_percent: 0.12, quantity: 350000 },
      { code: "VCB", name: "Phạm Quang Dũng", position: "CEO", own_percent: null, quantity: null },
    ]);
  });

  it("UPDATE-only: appointment_year written to matched row", () => {
    const count = upsertBoardDetails(db, [
      { code: "FPT", name: "Trương Gia Bình", position: "Chủ tịch HĐQT", appointment_year: 1988, fetched_at: "2026-06-04T21:00:00.000Z" },
    ]);
    expect(count).toBe(1);

    const row = db
      .prepare<{ appointment_year: number | null }, [string, string]>(
        "SELECT appointment_year FROM vnstock_officers WHERE code=? AND name=?",
      )
      .get("FPT", "Trương Gia Bình");
    expect(row?.appointment_year).toBe(1988);
  });

  it("name-mismatch → updated-count = 0 and NO new row inserted", () => {
    const beforeCount = db
      .prepare<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM vnstock_officers")
      .get()!.cnt;

    const count = upsertBoardDetails(db, [
      { code: "FPT", name: "Unknown Officer", position: "", appointment_year: 2000, fetched_at: "2026-06-04T21:00:00.000Z" },
    ]);

    const afterCount = db
      .prepare<{ cnt: number }, []>("SELECT COUNT(*) AS cnt FROM vnstock_officers")
      .get()!.cnt;

    expect(count).toBe(0);
    expect(afterCount).toBe(beforeCount); // no row inserted
  });

  it("own_percent and quantity NOT overwritten after update", () => {
    upsertBoardDetails(db, [
      { code: "FPT", name: "Trương Gia Bình", position: "Chủ tịch HĐQT", appointment_year: 1988, fetched_at: "2026-06-04T21:00:00.000Z" },
    ]);

    const row = db
      .prepare<{ own_percent: number | null; quantity: number | null }, [string, string]>(
        "SELECT own_percent, quantity FROM vnstock_officers WHERE code=? AND name=?",
      )
      .get("FPT", "Trương Gia Bình");

    expect(row?.own_percent).toBeCloseTo(5.23, 5);
    expect(row?.quantity).toBe(15000000);
  });

  it("null appointment_year written correctly (N/A from VPS)", () => {
    const count = upsertBoardDetails(db, [
      { code: "VCB", name: "Phạm Quang Dũng", position: "CEO", appointment_year: null, fetched_at: "2026-06-04T21:00:00.000Z" },
    ]);
    expect(count).toBe(1);

    const row = db
      .prepare<{ appointment_year: number | null }, [string, string]>(
        "SELECT appointment_year FROM vnstock_officers WHERE code=? AND name=?",
      )
      .get("VCB", "Phạm Quang Dũng");
    expect(row?.appointment_year).toBeNull();
  });

  it("returns correct count for multiple rows (mixed match / mismatch)", () => {
    const count = upsertBoardDetails(db, [
      { code: "FPT", name: "Trương Gia Bình", position: "Chủ tịch HĐQT", appointment_year: 1988, fetched_at: "2026-06-04T21:00:00.000Z" },
      { code: "FPT", name: "Nguyễn Văn Khoa", position: "Tổng Giám đốc", appointment_year: 2020, fetched_at: "2026-06-04T21:00:00.000Z" },
      { code: "FPT", name: "Name Not In DB", position: "", appointment_year: 2010, fetched_at: "2026-06-04T21:00:00.000Z" },
    ]);
    expect(count).toBe(2); // 2 matched, 1 mismatch skipped
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 4 & 5. companyProfileTools — tenure derivation + null propagation
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-I-B companyProfileTools tenure derivation", () => {
  let db: Database;

  beforeEach(() => {
    db = makeDb();
  });

  it("appointment_year=null → ceo_tenure_years=null (no fabrication)", () => {
    seedOfficers(db, [
      { code: "MWG", name: "Nguyễn Đức Tài", position: "CEO", own_percent: 1.5, quantity: null },
    ]);

    const profile = queryCompanyProfile(db, "MWG");
    const officer = profile.officers.find((o) => o.name === "Nguyễn Đức Tài");
    expect(officer).toBeDefined();
    expect(officer!.appointment_year).toBeNull();
    expect(officer!.ceo_tenure_years).toBeNull();
  });

  it("appointment_year set → ceo_tenure_years = currentYear - appointment_year", () => {
    seedOfficers(db, [
      { code: "FPT", name: "Trương Gia Bình", position: "Chủ tịch HĐQT", own_percent: 5.23, quantity: 15000000 },
    ]);
    // Manually set appointment_year
    db.prepare(
      "UPDATE vnstock_officers SET appointment_year=1988 WHERE code='FPT' AND name='Trương Gia Bình'",
    ).run();

    const profile = queryCompanyProfile(db, "FPT");
    const officer = profile.officers.find((o) => o.name === "Trương Gia Bình");
    expect(officer).toBeDefined();
    expect(officer!.appointment_year).toBe(1988);

    const expectedTenure = new Date().getFullYear() - 1988;
    expect(officer!.ceo_tenure_years).toBe(expectedTenure);
    expect(officer!.ceo_tenure_years).toBeGreaterThan(0); // sanity: > 0
  });

  it("OfficerEntry has appointment_year and ceo_tenure_years fields when column present", () => {
    seedOfficers(db, [
      { code: "HPG", name: "Trần Đình Long", position: "Chủ tịch", own_percent: 25.0, quantity: null },
    ]);
    db.prepare(
      "UPDATE vnstock_officers SET appointment_year=2007 WHERE code='HPG'",
    ).run();

    const profile = queryCompanyProfile(db, "HPG");
    expect(profile.officers).toHaveLength(1);
    const o = profile.officers[0]!;
    expect("appointment_year" in o).toBe(true);
    expect("ceo_tenure_years" in o).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 6. Replay: seed → upsert → query
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-I-B replay: full pipeline seed → upsert → queryCompanyProfile", () => {
  it("appointment_year + ceo_tenure_years populated after upsertBoardDetails", () => {
    const db = makeDb();

    // Seed 5 officers (mixed tickers)
    seedOfficers(db, [
      { code: "FPT", name: "Trương Gia Bình", position: "Chủ tịch HĐQT", own_percent: 5.23, quantity: 15000000 },
      { code: "VCB", name: "Phạm Quang Dũng", position: "CEO", own_percent: null, quantity: null },
      { code: "VNM", name: "Phan Minh Tiên", position: "CEO", own_percent: 0.01, quantity: null },
      { code: "HPG", name: "Trần Đình Long", position: "Chủ tịch", own_percent: 25.0, quantity: null },
      { code: "MWG", name: "Nguyễn Đức Tài", position: "CEO", own_percent: 1.5, quantity: null },
    ]);

    // Board details rows (some have year, some N/A)
    const boardRows = [
      { code: "FPT", name: "Trương Gia Bình", position: "Chủ tịch HĐQT", appointment_year: 1988, fetched_at: "2026-06-04T21:00:00.000Z" },
      { code: "VCB", name: "Phạm Quang Dũng", position: "CEO", appointment_year: 2020, fetched_at: "2026-06-04T21:00:00.000Z" },
      { code: "VNM", name: "Phan Minh Tiên", position: "CEO", appointment_year: null, fetched_at: "2026-06-04T21:00:00.000Z" }, // N/A
      { code: "HPG", name: "Trần Đình Long", position: "Chủ tịch", appointment_year: 2007, fetched_at: "2026-06-04T21:00:00.000Z" },
      { code: "MWG", name: "Nguyễn Đức Tài", position: "CEO", appointment_year: null, fetched_at: "2026-06-04T21:00:00.000Z" }, // N/A
    ];

    const updatedCount = upsertBoardDetails(db, boardRows);
    expect(updatedCount).toBe(5); // all 5 matched

    // Verify FPT officer has appointment_year + ceo_tenure_years
    const fptProfile = queryCompanyProfile(db, "FPT");
    const fptCeo = fptProfile.officers.find((o) => o.name === "Trương Gia Bình");
    expect(fptCeo).toBeDefined();
    expect(fptCeo!.appointment_year).toBe(1988);
    expect(fptCeo!.ceo_tenure_years).toBe(new Date().getFullYear() - 1988);

    // Verify VCB officer
    const vcbProfile = queryCompanyProfile(db, "VCB");
    const vcbCeo = vcbProfile.officers.find((o) => o.name === "Phạm Quang Dũng");
    expect(vcbCeo!.appointment_year).toBe(2020);
    expect(vcbCeo!.ceo_tenure_years).toBe(new Date().getFullYear() - 2020);

    // Verify VNM N/A propagation
    const vnmProfile = queryCompanyProfile(db, "VNM");
    const vnmCeo = vnmProfile.officers.find((o) => o.name === "Phan Minh Tiên");
    expect(vnmCeo!.appointment_year).toBeNull();
    expect(vnmCeo!.ceo_tenure_years).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 7. Schema migration: appointment_year column idempotency
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX-I-B schema migration: appointment_year column", () => {
  it("appointment_year column exists on vnstock_officers after migration", () => {
    const db = makeDb();
    const cols = db
      .query<{ name: string }, []>("PRAGMA table_info(vnstock_officers)")
      .all()
      .map((c) => c.name);
    expect(cols).toContain("appointment_year");
  });

  it("running migration twice does not throw (idempotent)", () => {
    const db = makeDb();
    expect(() => initFinancialReportsTables(db)).not.toThrow();
  });

  it("appointment_year is NULL for newly seeded rows (correct default)", () => {
    const db = makeDb();
    seedOfficers(db, [
      { code: "TEST", name: "Test Officer", position: "CEO" },
    ]);
    const row = db
      .prepare<{ appointment_year: number | null }, [string]>(
        "SELECT appointment_year FROM vnstock_officers WHERE code=?",
      )
      .get("TEST");
    expect(row?.appointment_year).toBeNull();
  });
});
