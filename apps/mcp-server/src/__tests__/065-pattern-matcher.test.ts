// src/__tests__/065-pattern-matcher.test.ts
/**
 * Task 065 — Historical Pattern Matcher
 *
 * Tests use an injected in-memory SQLite database — no singleton, no shared state.
 * The `db` parameter of `getPatternSummary` is always provided explicitly.
 */
import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { getPatternSummary } from "../application/usecases/getPatternSummary.js";

// ── Minimal schema ─────────────────────────────────────────────────────────────

const RAG_DDL = `
  CREATE TABLE IF NOT EXISTS rag_analyses (
    id                 TEXT PRIMARY KEY,
    created_at         TEXT NOT NULL,
    level              TEXT NOT NULL,
    source_url         TEXT,
    source_title       TEXT,
    source_type        TEXT,
    published_at       TEXT,
    sentiment          TEXT,
    impact_score       REAL,
    impact_direction   TEXT,
    confidence         REAL,
    time_horizon       TEXT,
    summary            TEXT,
    reasoning          TEXT,
    affected_countries TEXT,
    affected_domains   TEXT,
    affected_actions   TEXT,
    parent_ids         TEXT,
    tags               TEXT,
    embedding_text     TEXT
  );
`;

// ── Seed helpers ──────────────────────────────────────────────────────────────

function seedRow(
  db: Database,
  opts: {
    id: string;
    stockCodes: string[];
    sourceTitle: string;
    summary: string;
    impactScore: number;
    impactDirection: "up" | "down" | "neutral" | null;
    createdAt: string;
  },
): void {
  db.run(
    `INSERT INTO rag_analyses
       (id, created_at, level, source_title, summary, impact_score, impact_direction, affected_actions)
     VALUES (?, ?, 'action', ?, ?, ?, ?, ?)`,
    [
      opts.id,
      opts.createdAt,
      opts.sourceTitle,
      opts.summary,
      opts.impactScore,
      opts.impactDirection,
      JSON.stringify(opts.stockCodes),
    ],
  );
}

/** Returns ISO timestamp `h` hours in the past. */
function hoursAgo(h: number): string {
  return new Date(Date.now() - h * 60 * 60 * 1000).toISOString();
}

// ── Database per describe block ───────────────────────────────────────────────

let db: Database;

beforeAll(() => {
  db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec(RAG_DDL);

  // 5 seed entries:
  //   r001–r003  — GAS + oil, within 24h (should match 24h window)
  //   r004       — GAS + oil, 800h ago (outside 24h / 720h windows)
  //   r005       — GASC + oil, within 24h (must NOT false-positive on GAS query)

  seedRow(db, {
    id: "r001",
    stockCodes: ["GAS"],
    sourceTitle: "Oil price surges impact GAS earnings",
    summary: "Crude oil rally boosts PetroVietnam Gas profit outlook",
    impactScore: 8,
    impactDirection: "up",
    createdAt: hoursAgo(2),
  });

  seedRow(db, {
    id: "r002",
    stockCodes: ["GAS", "PVD"],
    sourceTitle: "Global oil glut pressures Asian gas stocks",
    summary: "Excess supply may weigh on GAS margins this quarter",
    impactScore: 6,
    impactDirection: "down",
    createdAt: hoursAgo(10),
  });

  seedRow(db, {
    id: "r003",
    stockCodes: ["GAS"],
    sourceTitle: "Vietnam natural gas: oil-linked tariffs under review",
    summary: "Regulatory review of oil-linked gas pricing for downstream users",
    impactScore: 5,
    impactDirection: "neutral",
    createdAt: hoursAgo(20),
  });

  // Row 4 — GAS + oil but 800h ago (> both 24h and 720h windows)
  seedRow(db, {
    id: "r004",
    stockCodes: ["GAS"],
    sourceTitle: "Historic oil shock hits GAS pipeline revenues",
    summary: "Oil price collapse 2020 impact on gas infrastructure",
    impactScore: 9,
    impactDirection: "down",
    createdAt: hoursAgo(800),
  });

  // Row 5 — GASC ticker + oil (must NOT match a 'GAS' query)
  seedRow(db, {
    id: "r005",
    stockCodes: ["GASC"],
    sourceTitle: "GASC oil imports rise amid price weakness",
    summary: "GASC crude oil import volumes increased in Q4",
    impactScore: 7,
    impactDirection: "up",
    createdAt: hoursAgo(5),
  });
});

afterAll(() => {
  db.close();
});

// ── Tests ──────────────────────────────────────────────────────────────────────

describe("Task 065 — Historical Pattern Matcher", () => {
  // ── FR-065-1: basic query ──────────────────────────────────────────────────

  it("returns >= 3 matches for GAS + oil within 24h", async () => {
    const result = await getPatternSummary("GAS", "oil", 24, db);
    expect(result).not.toBeNull();
    expect(result!.precedents.length).toBeGreaterThanOrEqual(3);
  });

  it("returns exactly 3 matches for GAS + oil within 24h (rows r001, r002, r003)", async () => {
    const result = await getPatternSummary("GAS", "oil", 24, db);
    expect(result).not.toBeNull();
    expect(result!.precedents.length).toBe(3);
  });

  // ── FR-065-2: aggregate statistics ────────────────────────────────────────

  it("computes avgImpactPct correctly (mean of 8, 6, 5 = 6.333...)", async () => {
    const result = await getPatternSummary("GAS", "oil", 24, db);
    expect(result).not.toBeNull();
    // (8 + 6 + 5) / 3 = 6.333...
    expect(result!.avgImpactPct).toBeCloseTo(19 / 3, 5);
  });

  it("dominantDirection with one of each: up > neutral > down tie-break → up wins", async () => {
    // r001=up, r002=down, r003=neutral — all equal count (1 each) → tie → up wins
    const result = await getPatternSummary("GAS", "oil", 24, db);
    expect(result).not.toBeNull();
    expect(result!.dominantDirection).toBe("up");
  });

  it("reflects dominantDirection correctly when majority is down", async () => {
    // Insert 2 extra down rows temporarily
    seedRow(db, {
      id: "r006-tmp",
      stockCodes: ["GAS"],
      sourceTitle: "oil demand collapse drives GAS down",
      summary: "oil selloff severe",
      impactScore: 7,
      impactDirection: "down",
      createdAt: hoursAgo(1),
    });
    seedRow(db, {
      id: "r007-tmp",
      stockCodes: ["GAS"],
      sourceTitle: "oil price crash hits GAS revenue",
      summary: "oil market disruption Q3",
      impactScore: 6,
      impactDirection: "down",
      createdAt: hoursAgo(3),
    });

    // 5 rows within 24h: up×1, down×3, neutral×1 → dominant = down
    const result = await getPatternSummary("GAS", "oil", 24, db);
    expect(result!.dominantDirection).toBe("down");

    db.run("DELETE FROM rag_analyses WHERE id IN ('r006-tmp', 'r007-tmp')");
  });

  // ── FR-065-3: null when no matches ────────────────────────────────────────

  it("returns null when stock code not found", async () => {
    const result = await getPatternSummary("VCB", "oil", 24, db);
    expect(result).toBeNull();
  });

  it("returns null when keyword does not appear in any row", async () => {
    const result = await getPatternSummary("GAS", "copper", 24, db);
    expect(result).toBeNull();
  });

  // ── lookbackHours filtering ────────────────────────────────────────────────

  it("respects lookbackHours=720 — excludes r004 (800h ago), keeps r001+r002+r003", async () => {
    const result = await getPatternSummary("GAS", "oil", 720, db);
    expect(result).not.toBeNull();
    expect(result!.precedents.length).toBe(3);
  });

  it("lookbackHours=0 means no time limit — includes all 4 GAS+oil rows", async () => {
    const result = await getPatternSummary("GAS", "oil", 0, db);
    expect(result).not.toBeNull();
    expect(result!.precedents.length).toBe(4); // r001 + r002 + r003 + r004
  });

  // ── Stock code false-positive guard ───────────────────────────────────────

  it("does NOT match GASC when querying GAS — quoted JSON prevents false positives", async () => {
    // r005 has affected_actions='["GASC"]' — must NOT match '%"GAS"%' pattern
    const result = await getPatternSummary("GAS", "oil", 24, db);
    expect(result).not.toBeNull();
    // If GASC matched, count would be 4 instead of 3
    expect(result!.precedents.length).toBe(3);
  });

  // ── PatternSummary shape ──────────────────────────────────────────────────

  it("returns correct PatternSummary shape", async () => {
    const result = await getPatternSummary("GAS", "oil", 24, db);
    expect(result).not.toBeNull();
    expect(result!.stockCode).toBe("GAS");
    expect(result!.eventKeyword).toBe("oil");
    expect(result!.lookbackHours).toBe(24);
    expect(typeof result!.generatedAt).toBe("string");
    expect(result!.generatedAt.length).toBeGreaterThan(0);
    expect(Array.isArray(result!.precedents)).toBe(true);
    expect(typeof result!.avgImpactPct).toBe("number");
    expect(["up", "down", "neutral"]).toContain(result!.dominantDirection);
  });

  it("each Precedent has required fields with correct types", async () => {
    const result = await getPatternSummary("GAS", "oil", 24, db);
    expect(result).not.toBeNull();
    for (const p of result!.precedents) {
      expect(typeof p.date).toBe("string");
      expect(typeof p.headline).toBe("string");
      expect(typeof p.impactScore).toBe("number");
      expect(["up", "down", "neutral"]).toContain(p.impactDirection);
    }
  });

  // ── Default lookbackHours (168 = 1 week) ─────────────────────────────────

  it("uses default lookbackHours of 168 when omitted", async () => {
    const result = await getPatternSummary("GAS", "oil", undefined, db);
    // r001, r002, r003 are within 168h; r004 is 800h ago — excluded
    expect(result).not.toBeNull();
    expect(result!.lookbackHours).toBe(168);
    expect(result!.precedents.length).toBe(3);
  });

  // ── NULL impact_direction treated as neutral ──────────────────────────────

  it("treats NULL impact_direction as neutral without crashing", async () => {
    db.run(
      `INSERT INTO rag_analyses
         (id, created_at, level, source_title, summary, impact_score, impact_direction, affected_actions)
       VALUES ('r008-null-dir', ?, 'action', 'oil sector overview', 'oil market summary', 5, NULL, '["GAS"]')`,
      [hoursAgo(1)],
    );

    const result = await getPatternSummary("GAS", "oil", 24, db);
    expect(result).not.toBeNull();
    // NULL direction row is treated as neutral — no crash
    expect(["up", "down", "neutral"]).toContain(result!.dominantDirection);

    db.run("DELETE FROM rag_analyses WHERE id = 'r008-null-dir'");
  });

  // ── Barrel export check ───────────────────────────────────────────────────

  it("is exported from application/usecases/index.ts barrel", async () => {
    const { getPatternSummary: exportedFn } = await import(
      "../application/usecases/index.js"
    );
    expect(typeof exportedFn).toBe("function");
  });
});
