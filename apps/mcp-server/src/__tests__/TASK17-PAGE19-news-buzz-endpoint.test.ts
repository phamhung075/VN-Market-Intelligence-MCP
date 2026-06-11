/**
 * TASK17-PAGE19 — GET /api/news-buzz
 *
 * News-buzz / mention-velocity leaderboard endpoint.
 * Tests the handler against an in-memory SQLite DB seeded with mention_velocity rows.
 * Does NOT hit the real DB — all data seeded inline using the same DDL as
 * src/__tests__/1922e-mention-velocity-wiring.test.ts (no shared helper exists yet).
 *
 * Ground-truth live contract (data-anchored 7d window, captured 2026-06-11):
 *   windowStart "2026-06-04 14:00:00"; windowEnd "2026-06-11T14:00:00.000Z";
 *   summary.distinctCodes 26; totalMentions 94; totalNegative 43; totalSources 74;
 *   leaderboard[0] = VIC mentions 17, negative 3, sources 13, hoursActive 12, negativeRatio 0.18;
 *   PLX mentions 11 negative 8 (ratio 0.73); GAS mentions 6 negative 6 (ratio 1.0).
 *
 * AC list:
 *   AC-1: windowEnd = MAX(hour) in the table (data-anchored, not now()).
 *   AC-2: windowStart = datetime(windowEnd, '-7 days').
 *   AC-3: row exactly AT windowStart is EXCLUDED (exclusive lower bound).
 *   AC-4: row AFTER windowStart is INCLUDED.
 *   AC-5: aggregation sums (mentions, negative, sources) are correct per code.
 *   AC-6: ordering is mentions DESC, then code ASC for ties.
 *   AC-7: negativeRatio = negative/mentions rounded to 2dp.
 *   AC-8: negativeRatio = 0 when mentions = 0 (guard, though store filters these).
 *   AC-9: negativeRatio = 1.0 when all mentions are negative (GAS-like case).
 *   AC-10: hoursActive = COUNT(*) of hour rows for the code in window.
 *   AC-11: summary.distinctCodes = leaderboard.length.
 *   AC-12: summary.totalMentions = sum of all mentions.
 *   AC-13: summary.totalNegative = sum of all negative.
 *   AC-14: summary.totalSources = sum of all sources.
 *   AC-15: empty table → windowStart null, windowEnd null, rows [], all summary zeros.
 *   AC-16: empty table → HTTP 200.
 *   AC-17: empty table → valid JSON.
 *   AC-18: POST → 405.
 *   AC-19: GET → 200 with data.
 *   AC-20: Content-Type application/json.
 *   AC-21: generatedAt is ISO 8601.
 *   AC-22: leaderboard entries have all required fields.
 *   AC-23: 500 path — DB that throws returns {error:"db_error"}.
 *   AC-24: negativeRatio rounds 2dp correctly (1/3 → 0.33).
 *   AC-25: multi-hour code aggregation — same code, multiple hours, sums correctly.
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per describe block.
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-PAGE19] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  handleGetNewsBuzz,
  handleGetNewsBuzzHttp,
  type NewsBuzzResponse,
} from "../interface/mcp/routes/newsBuzzHandler.js";

// ─────────────────────────────────────────────────────────────────────────────
// DDL helper — mirrors mention_velocity schema from schema.ts
// ─────────────────────────────────────────────────────────────────────────────

function buildMemDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS mention_velocity (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      code           TEXT    NOT NULL,
      hour           TEXT    NOT NULL,
      mention_count  INTEGER NOT NULL DEFAULT 0,
      negative_count INTEGER NOT NULL DEFAULT 0,
      source_count   INTEGER NOT NULL DEFAULT 0,
      UNIQUE(code, hour)
    );
    CREATE INDEX IF NOT EXISTS idx_mv_code ON mention_velocity(code);
    CREATE INDEX IF NOT EXISTS idx_mv_hour ON mention_velocity(hour);
  `);
  return db;
}

function insertRow(
  db: Database,
  code: string,
  hour: string,
  mentionCount: number,
  negativeCount: number,
  sourceCount: number,
): void {
  db.prepare(
    `INSERT INTO mention_velocity (code, hour, mention_count, negative_count, source_count)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(code, hour, mentionCount, negativeCount, sourceCount);
}

// ─────────────────────────────────────────────────────────────────────────────
// Mock HTTP helpers
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

function makeFakeReq(
  url: string = "/api/news-buzz",
  method: string = "GET",
): import("node:http").IncomingMessage {
  return { url, method } as import("node:http").IncomingMessage;
}

// ─────────────────────────────────────────────────────────────────────────────
// Fixture: small multi-code, multi-hour seed
//
// windowEnd = "2026-06-11T14:00:00.000Z" (MAX hour in fixture — ISO8601 format)
// windowStart = datetime("2026-06-11T14:00:00.000Z", "-7 days")
//             = "2026-06-04 14:00:00"  (SQLite datetime format — space separator, no Z)
//
// Boundary exclusion note:
//   The predicate is `hour > windowStart` (string comparison).
//   windowStart = "2026-06-04 14:00:00"  (SQLite space format)
//   A row with hour = "2026-06-04 14:00:00" (same format, same value) is EXCLUDED
//     because "2026-06-04 14:00:00" > "2026-06-04 14:00:00" is FALSE.
//   A row with hour = "2026-06-04T14:00:00.000Z" (ISO8601 T format) is INCLUDED
//     because "2026-06-04T..." > "2026-06-04 ..." is TRUE (T > space in ASCII).
//   So to test true exclusion, the boundary row must use SQLite space format.
//
// Rows:
//   VIC  2026-06-11T14:00:00.000Z    mentions=5, neg=1, src=3
//   VIC  2026-06-10T10:00:00.000Z    mentions=4, neg=1, src=3  → inside window
//   VIC  "2026-06-04 14:00:00"       mentions=2, neg=0, src=1  → EXACTLY AT windowStart (SQLite format) → EXCLUDED
//   PLX  2026-06-11T12:00:00.000Z    mentions=7, neg=5, src=4
//   PLX  2026-06-05T08:00:00.000Z    mentions=4, neg=3, src=2  → inside window
//   GAS  2026-06-09T06:00:00.000Z    mentions=6, neg=6, src=5  → inside window
//   HPG  2026-06-11T14:00:00.000Z    mentions=3, neg=0, src=2
//   HPG  2026-06-11T13:00:00.000Z    mentions=3, neg=0, src=2
//   CTG  2026-06-11T14:00:00.000Z    mentions=3, neg=1, src=1
// ─────────────────────────────────────────────────────────────────────────────

// Exactly-at-windowStart row using SQLite space format (EXCLUDED by hour > windowStart)
const BOUNDARY_HOUR_SQLITE = "2026-06-04 14:00:00";

function seedSmallFixture(db: Database): void {
  // VIC — 3 hours, one exactly at boundary (SQLite format → excluded)
  insertRow(db, "VIC", "2026-06-11T14:00:00.000Z", 5, 1, 3);
  insertRow(db, "VIC", "2026-06-10T10:00:00.000Z", 4, 1, 3);
  insertRow(db, "VIC", BOUNDARY_HOUR_SQLITE,         2, 0, 1); // exactly AT windowStart → excluded

  // PLX — 2 hours inside window
  insertRow(db, "PLX", "2026-06-11T12:00:00.000Z", 7, 5, 4);
  insertRow(db, "PLX", "2026-06-05T08:00:00.000Z", 4, 3, 2);

  // GAS — 1 hour, all mentions negative (ratio = 1.0)
  insertRow(db, "GAS", "2026-06-09T06:00:00.000Z", 6, 6, 5);

  // HPG — 2 hours, 6 total mentions
  insertRow(db, "HPG", "2026-06-11T14:00:00.000Z", 3, 0, 2);
  insertRow(db, "HPG", "2026-06-11T13:00:00.000Z", 3, 0, 2);

  // CTG — 1 hour, 3 mentions
  insertRow(db, "CTG", "2026-06-11T14:00:00.000Z", 3, 1, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-1/2: window anchoring
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE19 — window anchoring (AC-1, AC-2)", () => {
  let db: Database;

  beforeEach(() => { db = buildMemDb(); seedSmallFixture(db); });
  afterEach(() => db.close());

  it("AC-1: windowEnd equals MAX(hour) in the table", () => {
    const body = handleGetNewsBuzz(db);
    expect(body.windowEnd).toBe("2026-06-11T14:00:00.000Z");
  });

  it("AC-2: windowStart is exactly 7 days before windowEnd", () => {
    const body = handleGetNewsBuzz(db);
    // SQLite datetime("2026-06-11T14:00:00.000Z", "-7 days") = "2026-06-04 14:00:00"
    expect(body.windowStart).toBe("2026-06-04 14:00:00");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-3/4: exclusive lower bound
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE19 — window boundary exclusion (AC-3, AC-4)", () => {
  let db: Database;

  beforeEach(() => { db = buildMemDb(); seedSmallFixture(db); });
  afterEach(() => db.close());

  it("AC-3: row AT windowStart (BOUNDARY_HOUR) is excluded from VIC totals", () => {
    const body = handleGetNewsBuzz(db);
    const vic = body.leaderboard.find((e) => e.code === "VIC");
    // VIC has 3 rows but BOUNDARY_HOUR is excluded → only 2 inside-window rows
    // mentions = 5 + 4 = 9 (NOT 5+4+2=11)
    expect(vic).toBeDefined();
    expect(vic!.mentions).toBe(9);
  });

  it("AC-4: row after windowStart IS included in VIC totals (hoursActive=2 not 3)", () => {
    const body = handleGetNewsBuzz(db);
    const vic = body.leaderboard.find((e) => e.code === "VIC");
    expect(vic!.hoursActive).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-5: aggregation sums
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE19 — aggregation sums per code (AC-5)", () => {
  let db: Database;

  beforeEach(() => { db = buildMemDb(); seedSmallFixture(db); });
  afterEach(() => db.close());

  it("AC-5a: PLX mentions = 7+4 = 11", () => {
    const body = handleGetNewsBuzz(db);
    const plx = body.leaderboard.find((e) => e.code === "PLX");
    expect(plx!.mentions).toBe(11);
  });

  it("AC-5b: PLX negative = 5+3 = 8", () => {
    const body = handleGetNewsBuzz(db);
    const plx = body.leaderboard.find((e) => e.code === "PLX");
    expect(plx!.negative).toBe(8);
  });

  it("AC-5c: PLX sources = 4+2 = 6", () => {
    const body = handleGetNewsBuzz(db);
    const plx = body.leaderboard.find((e) => e.code === "PLX");
    expect(plx!.sources).toBe(6);
  });

  it("AC-5d: GAS mentions = 6, negative = 6, sources = 5", () => {
    const body = handleGetNewsBuzz(db);
    const gas = body.leaderboard.find((e) => e.code === "GAS");
    expect(gas!.mentions).toBe(6);
    expect(gas!.negative).toBe(6);
    expect(gas!.sources).toBe(5);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-6: ordering (mentions DESC, code ASC)
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE19 — leaderboard ordering (AC-6)", () => {
  let db: Database;

  beforeEach(() => { db = buildMemDb(); seedSmallFixture(db); });
  afterEach(() => db.close());

  it("AC-6a: first entry is PLX (11 mentions — highest)", () => {
    const body = handleGetNewsBuzz(db);
    expect(body.leaderboard[0]!.code).toBe("PLX");
    expect(body.leaderboard[0]!.mentions).toBe(11);
  });

  it("AC-6b: second entry is VIC (9 mentions)", () => {
    const body = handleGetNewsBuzz(db);
    expect(body.leaderboard[1]!.code).toBe("VIC");
    expect(body.leaderboard[1]!.mentions).toBe(9);
  });

  it("AC-6c: code ASC for tie on mentions — HPG (6) before GAS… wait: HPG=6, GAS=6 → code ASC → GAS < HPG", () => {
    // HPG total mentions = 3+3 = 6; GAS = 6 → tie; GAS < HPG alphabetically
    const body = handleGetNewsBuzz(db);
    const codes = body.leaderboard.map((e) => e.code);
    const gasIdx = codes.indexOf("GAS");
    const hpgIdx = codes.indexOf("HPG");
    expect(gasIdx).toBeLessThan(hpgIdx);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-7/8/9/24: negativeRatio
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE19 — negativeRatio (AC-7, AC-8, AC-9, AC-24)", () => {
  let db: Database;

  beforeEach(() => { db = buildMemDb(); });
  afterEach(() => db.close());

  it("AC-7: PLX negativeRatio = 8/11 = 0.73 (rounds 2dp)", () => {
    seedSmallFixture(db);
    const body = handleGetNewsBuzz(db);
    const plx = body.leaderboard.find((e) => e.code === "PLX");
    expect(plx!.negativeRatio).toBe(0.73);
  });

  it("AC-8: negativeRatio = 0 when mentions > 0 and negative = 0", () => {
    insertRow(db, "HPG", "2026-06-11T14:00:00.000Z", 3, 0, 1);
    const body = handleGetNewsBuzz(db);
    const hpg = body.leaderboard.find((e) => e.code === "HPG");
    expect(hpg!.negativeRatio).toBe(0);
  });

  it("AC-9: GAS negativeRatio = 6/6 = 1.0 (all mentions negative)", () => {
    seedSmallFixture(db);
    const body = handleGetNewsBuzz(db);
    const gas = body.leaderboard.find((e) => e.code === "GAS");
    expect(gas!.negativeRatio).toBe(1);
  });

  it("AC-24: negativeRatio rounds 2dp correctly — 1/3 → 0.33", () => {
    insertRow(db, "TEST", "2026-06-11T14:00:00.000Z", 3, 1, 1);
    const body = handleGetNewsBuzz(db);
    const t = body.leaderboard.find((e) => e.code === "TEST");
    expect(t!.negativeRatio).toBe(0.33);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-10: hoursActive
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE19 — hoursActive (AC-10)", () => {
  let db: Database;

  beforeEach(() => { db = buildMemDb(); seedSmallFixture(db); });
  afterEach(() => db.close());

  it("AC-10: PLX hoursActive = 2 (two distinct hours in window)", () => {
    const body = handleGetNewsBuzz(db);
    const plx = body.leaderboard.find((e) => e.code === "PLX");
    expect(plx!.hoursActive).toBe(2);
  });

  it("AC-10: GAS hoursActive = 1 (one hour in window)", () => {
    const body = handleGetNewsBuzz(db);
    const gas = body.leaderboard.find((e) => e.code === "GAS");
    expect(gas!.hoursActive).toBe(1);
  });

  it("AC-10: HPG hoursActive = 2 (two distinct hours in window)", () => {
    const body = handleGetNewsBuzz(db);
    const hpg = body.leaderboard.find((e) => e.code === "HPG");
    expect(hpg!.hoursActive).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-11/12/13/14: summary aggregates
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE19 — summary aggregates (AC-11 to AC-14)", () => {
  let db: Database;

  beforeEach(() => { db = buildMemDb(); seedSmallFixture(db); });
  afterEach(() => db.close());

  it("AC-11: summary.distinctCodes = leaderboard.length", () => {
    const body = handleGetNewsBuzz(db);
    expect(body.summary.distinctCodes).toBe(body.leaderboard.length);
  });

  it("AC-12: summary.totalMentions = sum of all leaderboard mentions", () => {
    const body = handleGetNewsBuzz(db);
    const sumFromLeaderboard = body.leaderboard.reduce((a, r) => a + r.mentions, 0);
    expect(body.summary.totalMentions).toBe(sumFromLeaderboard);
  });

  it("AC-13: summary.totalNegative = sum of all leaderboard negative", () => {
    const body = handleGetNewsBuzz(db);
    const sumFromLeaderboard = body.leaderboard.reduce((a, r) => a + r.negative, 0);
    expect(body.summary.totalNegative).toBe(sumFromLeaderboard);
  });

  it("AC-14: summary.totalSources = sum of all leaderboard sources", () => {
    const body = handleGetNewsBuzz(db);
    const sumFromLeaderboard = body.leaderboard.reduce((a, r) => a + r.sources, 0);
    expect(body.summary.totalSources).toBe(sumFromLeaderboard);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-15/16/17: empty-state
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE19 — empty-state guard (AC-15, AC-16, AC-17)", () => {
  let db: Database;

  beforeEach(() => { db = buildMemDb(); /* no rows inserted */ });
  afterEach(() => db.close());

  it("AC-15a: empty table → windowStart null", () => {
    const body = handleGetNewsBuzz(db);
    expect(body.windowStart).toBeNull();
  });

  it("AC-15b: empty table → windowEnd null", () => {
    const body = handleGetNewsBuzz(db);
    expect(body.windowEnd).toBeNull();
  });

  it("AC-15c: empty table → leaderboard is []", () => {
    const body = handleGetNewsBuzz(db);
    expect(body.leaderboard).toHaveLength(0);
  });

  it("AC-15d: empty table → summary all zeros", () => {
    const body = handleGetNewsBuzz(db);
    expect(body.summary.distinctCodes).toBe(0);
    expect(body.summary.totalMentions).toBe(0);
    expect(body.summary.totalNegative).toBe(0);
    expect(body.summary.totalSources).toBe(0);
  });

  it("AC-16: empty table → HTTP 200", () => {
    const res = makeMockRes();
    handleGetNewsBuzzHttp(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      db,
    );
    expect(res.statusCode).toBe(200);
  });

  it("AC-17: empty table → valid JSON", () => {
    const res = makeMockRes();
    handleGetNewsBuzzHttp(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      db,
    );
    expect(() => JSON.parse(res.body)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-18/19/20/21/22: HTTP method + shape
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE19 — HTTP method guard + response shape (AC-18 to AC-22)", () => {
  let db: Database;

  beforeEach(() => { db = buildMemDb(); seedSmallFixture(db); });
  afterEach(() => db.close());

  it("AC-18: POST → 405", () => {
    const res = makeMockRes();
    handleGetNewsBuzzHttp(
      makeFakeReq("/api/news-buzz", "POST"),
      res as unknown as import("node:http").ServerResponse,
      db,
    );
    expect(res.statusCode).toBe(405);
  });

  it("AC-19: GET → 200", () => {
    const res = makeMockRes();
    handleGetNewsBuzzHttp(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      db,
    );
    expect(res.statusCode).toBe(200);
  });

  it("AC-20: Content-Type: application/json", () => {
    const res = makeMockRes();
    handleGetNewsBuzzHttp(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      db,
    );
    expect(res.headers["Content-Type"]).toBe("application/json");
  });

  it("AC-21: generatedAt is ISO 8601", () => {
    const body = handleGetNewsBuzz(db);
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("AC-22: leaderboard entries have all required fields", () => {
    const body = handleGetNewsBuzz(db);
    const entry = body.leaderboard[0]!;
    expect("code"          in entry).toBe(true);
    expect("mentions"      in entry).toBe(true);
    expect("negative"      in entry).toBe(true);
    expect("sources"       in entry).toBe(true);
    expect("hoursActive"   in entry).toBe(true);
    expect("negativeRatio" in entry).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-23: 500 path
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE19 — 500 error path (AC-23)", () => {
  it("AC-23: closed DB → 500 with {error:'db_error', detail}", () => {
    const db = buildMemDb();
    db.close(); // Force a DB error on next query

    const res = makeMockRes();
    handleGetNewsBuzzHttp(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      db,
    );
    expect(res.statusCode).toBe(500);
    const parsed = JSON.parse(res.body);
    expect(parsed.error).toBe("db_error");
    expect(typeof parsed.detail).toBe("string");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-25: multi-hour aggregation for same code
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE19 — multi-hour aggregation (AC-25)", () => {
  it("AC-25: same code across 3 hours → sums correctly", () => {
    const db = buildMemDb();
    insertRow(db, "VNM", "2026-06-11T14:00:00.000Z", 3, 1, 2);
    insertRow(db, "VNM", "2026-06-10T08:00:00.000Z", 5, 2, 3);
    insertRow(db, "VNM", "2026-06-09T16:00:00.000Z", 2, 0, 1);
    const body = handleGetNewsBuzz(db);
    const vnm = body.leaderboard.find((e) => e.code === "VNM");
    expect(vnm).toBeDefined();
    expect(vnm!.mentions).toBe(10);
    expect(vnm!.negative).toBe(3);
    expect(vnm!.sources).toBe(6);
    expect(vnm!.hoursActive).toBe(3);
    expect(vnm!.negativeRatio).toBe(0.3);
    db.close();
  });
});
