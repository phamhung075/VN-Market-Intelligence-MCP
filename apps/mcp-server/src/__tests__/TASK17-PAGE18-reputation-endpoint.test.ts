/**
 * TASK17-PAGE18 — GET /api/reputation
 *
 * Corporate-reputation (news-sentiment) risk leaderboard endpoint.
 * Tests the handler against an in-memory SQLite DB seeded with reputation_scores rows.
 * Does NOT hit the real DB — all data seeded into in-memory SQLite via
 * initDatabase() (same pattern as TASK17-PAGE17).
 *
 * Ground-truth live contract (41 tickers × 6 dates, latest 2026-06-09):
 *   asOf "2026-06-09"; summary.total 41; summary.avgScore 56.11;
 *   byRisk {safe:3, watch:37, warning:1, danger:0};
 *   leaderboard[0] = CTG score 70 (ties CTG/SIS/TCH all 70, code ASC → CTG first);
 *   lowest score: GAS 36.0 risk_level "warning".
 *
 * AC list:
 *   AC-a: snapshot returns only latest-date rows sorted score DESC, code ASC.
 *   AC-b: byRisk counts are correct across all four buckets.
 *   AC-c: avgScore rounds to 2dp.
 *   AC-d: history map groups ascending-date arrays per code.
 *   AC-e: empty table → 200 with nulls/zeros (no throw).
 *   AC-f: 405 on POST.
 *
 * DDD layer: interface + infrastructure tested together at the handler seam.
 * Isolation: in-memory SQLite, reset per describe block via initDatabase().
 */

// Must be set before importing schema module
Bun.env["DB_PATH"] = ":memory:";
if (Bun.env["DB_PATH"] !== ":memory:") {
  throw new Error(`[TASK17-PAGE18] DB_PATH must be ':memory:', got: ${Bun.env["DB_PATH"]}`);
}

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";
import {
  handleGetReputation,
  handleGetReputationHttp,
  type ReputationResponse,
} from "../interface/mcp/routes/reputationHandler.js";

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

function makeFakeReq(
  url: string = "/api/reputation",
  method: string = "GET",
): import("node:http").IncomingMessage {
  return { url, method } as import("node:http").IncomingMessage;
}

/** Insert a single reputation_scores row. */
function insertRepRow(opts: {
  code: string;
  date: string;
  score: number;
  trend?: string;
  risk_level?: string;
  computed_at?: string;
}): void {
  const db = getDb();
  db.prepare(
    `INSERT OR IGNORE INTO reputation_scores (code, date, score, trend, risk_level, computed_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.code,
    opts.date,
    opts.score,
    opts.trend ?? "stable",
    opts.risk_level ?? "watch",
    opts.computed_at ?? "2026-06-09T12:00:00.000Z",
  );
}

/**
 * Seed a small multi-date fixture.
 * Three tickers over two dates — the latest is "2026-06-09".
 * Designed to test snapshot isolation (only latest-date rows returned),
 * byRisk counts, avgScore rounding, and history grouping.
 *
 * Latest date rows (2026-06-09):
 *   CTG  score=70  risk=watch   trend=stable
 *   SIS  score=70  risk=watch   trend=stable
 *   GAS  score=36  risk=warning trend=deteriorating
 *   VCB  score=60  risk=safe    trend=improving
 *
 * Earlier date rows (2026-06-08):
 *   CTG  score=68  risk=watch   trend=stable
 *   GAS  score=38  risk=warning trend=deteriorating
 */
function seedSmallFixture(): void {
  // Earlier date
  insertRepRow({ code: "CTG", date: "2026-06-08", score: 68, trend: "stable", risk_level: "watch" });
  insertRepRow({ code: "GAS", date: "2026-06-08", score: 38, trend: "deteriorating", risk_level: "warning" });

  // Latest date (2026-06-09)
  insertRepRow({ code: "CTG", date: "2026-06-09", score: 70, trend: "stable",        risk_level: "watch"   });
  insertRepRow({ code: "SIS", date: "2026-06-09", score: 70, trend: "stable",        risk_level: "watch"   });
  insertRepRow({ code: "GAS", date: "2026-06-09", score: 36, trend: "deteriorating", risk_level: "warning" });
  insertRepRow({ code: "VCB", date: "2026-06-09", score: 60, trend: "improving",     risk_level: "safe"    });
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-a: snapshot returns only latest-date rows, sorted score DESC / code ASC
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE18 — snapshot isolation and ordering (AC-a)", () => {
  it("AC-a: asOf matches the latest date in the table", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.asOf).toBe("2026-06-09");
  });

  it("AC-a: leaderboard contains only latest-date rows (4 tickers, not 6)", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.leaderboard).toHaveLength(4);
  });

  it("AC-a: leaderboard ordered score DESC — first entry score 70", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.leaderboard[0]!.score).toBe(70);
  });

  it("AC-a: among ties at score 70, code ASC puts CTG before SIS", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.leaderboard[0]!.code).toBe("CTG");
    expect(body.leaderboard[1]!.code).toBe("SIS");
  });

  it("AC-a: lowest score entry is GAS at 36", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    const last = body.leaderboard[body.leaderboard.length - 1]!;
    expect(last.code).toBe("GAS");
    expect(last.score).toBe(36);
  });

  it("AC-a: leaderboard entries have code, score, trend, riskLevel fields", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    const entry = body.leaderboard[0]!;
    expect("code"      in entry).toBe(true);
    expect("score"     in entry).toBe(true);
    expect("trend"     in entry).toBe(true);
    expect("riskLevel" in entry).toBe(true);
  });

  it("AC-a: riskLevel is camelCase (not risk_level)", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    // Every entry should have riskLevel, not risk_level
    for (const entry of body.leaderboard) {
      expect("riskLevel" in entry).toBe(true);
      expect("risk_level" in entry).toBe(false);
    }
  });

  it("AC-a: GAS riskLevel is 'warning'", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    const gas = body.leaderboard.find((e) => e.code === "GAS");
    expect(gas).toBeDefined();
    expect(gas!.riskLevel).toBe("warning");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-b: byRisk counts
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE18 — byRisk counts (AC-b)", () => {
  it("AC-b: byRisk has all four keys", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect("safe"    in body.summary.byRisk).toBe(true);
    expect("watch"   in body.summary.byRisk).toBe(true);
    expect("warning" in body.summary.byRisk).toBe(true);
    expect("danger"  in body.summary.byRisk).toBe(true);
  });

  it("AC-b: safe count = 1 (VCB)", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.summary.byRisk.safe).toBe(1);
  });

  it("AC-b: watch count = 2 (CTG, SIS)", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.summary.byRisk.watch).toBe(2);
  });

  it("AC-b: warning count = 1 (GAS)", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.summary.byRisk.warning).toBe(1);
  });

  it("AC-b: danger count = 0", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.summary.byRisk.danger).toBe(0);
  });

  it("AC-b: unexpected riskLevel value is silently ignored (no crash)", () => {
    // Insert a row with a riskLevel that doesn't exist in the enum
    insertRepRow({ code: "XYZ", date: "2026-06-09", score: 50, risk_level: "unknown_bucket" });
    expect(() => handleGetReputation(getDb())).not.toThrow();
    const body = handleGetReputation(getDb());
    // The total should include the unexpected row, but byRisk buckets should not include it
    const bucketTotal =
      body.summary.byRisk.safe +
      body.summary.byRisk.watch +
      body.summary.byRisk.warning +
      body.summary.byRisk.danger;
    // XYZ's "unknown_bucket" is ignored, so bucketTotal = total - 1
    expect(bucketTotal).toBe(body.summary.total - 1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-c: avgScore rounds to 2dp
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE18 — avgScore rounding (AC-c)", () => {
  it("AC-c: avgScore is not null when table has rows", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.summary.avgScore).not.toBeNull();
  });

  it("AC-c: avgScore for fixture is (70+70+36+60)/4 = 59 rounded to 2dp = 59", () => {
    // CTG=70, SIS=70, GAS=36, VCB=60 → sum=236/4=59.0
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.summary.avgScore).toBe(59);
  });

  it("AC-c: avgScore rounds 2dp — non-whole-number case", () => {
    // Scores that produce a repeating decimal: 70+71+36 / 3 = 59.0 → simple
    // Use scores that force rounding: 70+71+37 = 178/3 = 59.333... → 59.33
    insertRepRow({ code: "A", date: "2026-06-09", score: 70 });
    insertRepRow({ code: "B", date: "2026-06-09", score: 71 });
    insertRepRow({ code: "C", date: "2026-06-09", score: 37 });
    const body = handleGetReputation(getDb());
    expect(body.summary.avgScore).toBe(59.33);
  });

  it("AC-c: summary.total matches leaderboard length", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.summary.total).toBe(body.leaderboard.length);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-d: history grouping and ascending date order
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE18 — history grouping ascending date (AC-d)", () => {
  it("AC-d: history is an object keyed by code", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(typeof body.history).toBe("object");
    expect(Array.isArray(body.history)).toBe(false);
  });

  it("AC-d: CTG history has 2 entries (2 dates)", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.history["CTG"]).toHaveLength(2);
  });

  it("AC-d: CTG history is sorted ascending by date", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    const ctg = body.history["CTG"]!;
    expect(ctg[0]!.date).toBe("2026-06-08");
    expect(ctg[1]!.date).toBe("2026-06-09");
  });

  it("AC-d: CTG history scores match inserted values", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    const ctg = body.history["CTG"]!;
    expect(ctg[0]!.score).toBe(68);
    expect(ctg[1]!.score).toBe(70);
  });

  it("AC-d: SIS history has 1 entry (only latest date seeded)", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.history["SIS"]).toHaveLength(1);
  });

  it("AC-d: GAS history has 2 entries ascending", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    const gas = body.history["GAS"]!;
    expect(gas).toHaveLength(2);
    expect(gas[0]!.date).toBe("2026-06-08");
    expect(gas[0]!.score).toBe(38);
    expect(gas[1]!.date).toBe("2026-06-09");
    expect(gas[1]!.score).toBe(36);
  });

  it("AC-d: history entries have date and score fields", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    const entry = body.history["CTG"]![0]!;
    expect("date"  in entry).toBe(true);
    expect("score" in entry).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-e: empty table → 200 with nulls, no throw
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE18 — empty-state guard (AC-e)", () => {
  it("AC-e: empty table does NOT throw", () => {
    expect(() => handleGetReputation(getDb())).not.toThrow();
  });

  it("AC-e: empty table → asOf null", () => {
    const body = handleGetReputation(getDb());
    expect(body.asOf).toBeNull();
  });

  it("AC-e: empty table → summary.total 0", () => {
    const body = handleGetReputation(getDb());
    expect(body.summary.total).toBe(0);
  });

  it("AC-e: empty table → summary.avgScore null", () => {
    const body = handleGetReputation(getDb());
    expect(body.summary.avgScore).toBeNull();
  });

  it("AC-e: empty table → byRisk all zeros", () => {
    const body = handleGetReputation(getDb());
    expect(body.summary.byRisk.safe).toBe(0);
    expect(body.summary.byRisk.watch).toBe(0);
    expect(body.summary.byRisk.warning).toBe(0);
    expect(body.summary.byRisk.danger).toBe(0);
  });

  it("AC-e: empty table → leaderboard is empty array", () => {
    const body = handleGetReputation(getDb());
    expect(body.leaderboard).toHaveLength(0);
  });

  it("AC-e: empty table → history is empty object", () => {
    const body = handleGetReputation(getDb());
    expect(Object.keys(body.history)).toHaveLength(0);
  });

  it("AC-e: empty table → HTTP response is 200", () => {
    const res = makeMockRes();
    handleGetReputationHttp(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.statusCode).toBe(200);
  });

  it("AC-e: empty table → response body is valid JSON", () => {
    const res = makeMockRes();
    handleGetReputationHttp(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(() => JSON.parse(res.body)).not.toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-f: 405 on POST
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK17-PAGE18 — HTTP method guard (AC-f)", () => {
  it("AC-f: POST → 405", () => {
    const res = makeMockRes();
    handleGetReputationHttp(
      makeFakeReq("/api/reputation", "POST"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.statusCode).toBe(405);
  });

  it("AC-f: GET → 200", () => {
    const res = makeMockRes();
    handleGetReputationHttp(
      makeFakeReq("/api/reputation", "GET"),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.statusCode).toBe(200);
  });

  it("AC-f: Content-Type: application/json on 200", () => {
    const res = makeMockRes();
    handleGetReputationHttp(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(res.headers["Content-Type"]).toBe("application/json");
  });

  it("AC-f: response body is valid JSON on GET", () => {
    seedSmallFixture();
    const res = makeMockRes();
    handleGetReputationHttp(
      makeFakeReq(),
      res as unknown as import("node:http").ServerResponse,
      getDb(),
    );
    expect(() => JSON.parse(res.body)).not.toThrow();
  });

  it("AC-f: response envelope has generatedAt string", () => {
    seedSmallFixture();
    const body = handleGetReputation(getDb());
    expect(body.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});
