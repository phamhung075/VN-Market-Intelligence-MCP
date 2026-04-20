/**
 * Task 1159 — TDD: Failing tests for Morning Briefing Intelligence Enrichment
 *
 * Tests cover all acceptance criteria AC-1 through AC-6 from REQ-067:
 *   AC-1: insiderRecent populated from insider_transactions (watchlist only, max 3, DESC volume)
 *   AC-2: insiderRecent empty-state (no rows → [], no crash, no phantom header)
 *   AC-3: foreignFlowSummary — top net-buy + top net-sell, zero excluded
 *   AC-4: evidenceTopScores — bullish leaders + bearish warnings, dedup
 *   AC-5: Telegram message includes all three new sections when data present
 *   AC-6: Complete empty-state — all arrays [], no crash, no phantom headers
 *
 * RED PHASE: the three DailyBriefing fields (insiderRecent, foreignFlowSummary,
 * evidenceTopScores), the BEARISH_WARNING_THRESHOLD constant, and the
 * formatBriefingMessage export do NOT exist yet. Tests access them through
 * `as Record<string, unknown>` casts so TypeScript compiles cleanly while
 * the assertions fail at runtime — correct TDD red state.
 *
 * Layer: tests — uses in-memory SQLite; no HTTP, no Telegram sends.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { mkdirSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";

// ─────────────────────────────────────────────────────────────────────────────
// Test DB setup — creates all tables needed by assembleBriefing + new tables
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");

  // Existing tables required by assembleBriefing steps 1-13
  db.exec(`
    CREATE TABLE IF NOT EXISTS watchlist (
      code              TEXT PRIMARY KEY,
      company_name      TEXT,
      exchange          TEXT NOT NULL DEFAULT 'HOSE',
      domain            TEXT NOT NULL DEFAULT 'other',
      notes             TEXT,
      added_at          TEXT NOT NULL DEFAULT (datetime('now')),
      alert_drop_pct    REAL NOT NULL DEFAULT -3,
      alert_rise_pct    REAL NOT NULL DEFAULT 5,
      alert_impact_min  REAL NOT NULL DEFAULT 7,
      alert_report_new  INTEGER NOT NULL DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS market_prices (
      code        TEXT PRIMARY KEY,
      price       REAL,
      change_amt  REAL,
      change_pct  REAL,
      volume      REAL,
      updated_at  TEXT
    );

    CREATE TABLE IF NOT EXISTS daily_ohlcv (
      code       TEXT NOT NULL,
      date       TEXT NOT NULL,
      open       REAL NOT NULL,
      high       REAL NOT NULL,
      low        REAL NOT NULL,
      close      REAL NOT NULL,
      volume     REAL NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (code, date)
    );

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

    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT
    );

    CREATE TABLE IF NOT EXISTS financial_reports (
      id              TEXT PRIMARY KEY,
      action_code     TEXT NOT NULL,
      company_name    TEXT,
      exchange        TEXT,
      domain          TEXT,
      period_year     INTEGER,
      period_type     TEXT,
      period_start    TEXT,
      period_end      TEXT,
      sort_key        TEXT,
      ssc_url         TEXT,
      parsed_at       TEXT,
      balance_sheet_json  TEXT DEFAULT '{}',
      income_stmt_json    TEXT DEFAULT '{}',
      cash_flow_json      TEXT DEFAULT '{}',
      ratios_json         TEXT DEFAULT '{}'
    );
  `);

  // New tables used by the three enrichment steps (Steps 14-16)
  db.exec(`
    CREATE TABLE IF NOT EXISTS insider_transactions (
      id               TEXT PRIMARY KEY,
      code             TEXT NOT NULL,
      type             TEXT NOT NULL,
      executed_volume  INTEGER NOT NULL DEFAULT 0,
      insider_name     TEXT NOT NULL DEFAULT '',
      from_date        TEXT NOT NULL DEFAULT '',
      fetched_at       TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS vnstock_trading_stats (
      id              TEXT PRIMARY KEY,
      code            TEXT NOT NULL,
      date            TEXT NOT NULL,
      foreign_volume  INTEGER,
      fetched_at      TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS evidence_scores (
      id             TEXT PRIMARY KEY,
      stock          TEXT NOT NULL,
      score_date     TEXT NOT NULL,
      bullish_score  REAL NOT NULL DEFAULT 0,
      bearish_score  REAL NOT NULL DEFAULT 0,
      fragment_count INTEGER NOT NULL DEFAULT 0
    );
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

function seedWatchlist(db: Database, code: string, domain = "banking"): void {
  db.prepare(
    `INSERT OR IGNORE INTO watchlist (code, exchange, domain, added_at)
     VALUES (?, 'HOSE', ?, datetime('now'))`,
  ).run(code, domain);
}

/**
 * Seed an insider_transactions row.
 * fetched_at defaults to now (within 24h) unless overridden.
 */
function seedInsiderTransaction(
  db: Database,
  opts: {
    id?: string;
    code: string;
    type?: string;
    executedVolume?: number;
    insiderName?: string;
    fromDate?: string;
    fetchedAt?: string;
  },
): void {
  const row = {
    id: opts.id ?? `it-${opts.code}-${Date.now()}-${Math.random()}`,
    code: opts.code,
    type: opts.type ?? "buy",
    executed_volume: opts.executedVolume ?? 100_000,
    insider_name: opts.insiderName ?? "Test Insider",
    from_date: opts.fromDate ?? "2026-04-13",
    fetched_at: opts.fetchedAt ?? new Date().toISOString(),
  };
  db.prepare(
    `INSERT OR IGNORE INTO insider_transactions
       (id, code, type, executed_volume, insider_name, from_date, fetched_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.code,
    row.type,
    row.executed_volume,
    row.insider_name,
    row.from_date,
    row.fetched_at,
  );
}

/**
 * Seed a vnstock_trading_stats row.
 * fetched_at defaults to now.
 */
function seedTradingStats(
  db: Database,
  opts: {
    id?: string;
    code: string;
    date?: string;
    foreignVolume?: number;
    fetchedAt?: string;
  },
): void {
  const row = {
    id: opts.id ?? `vs-${opts.code}-${Date.now()}-${Math.random()}`,
    code: opts.code,
    date: opts.date ?? "2026-04-12",
    foreign_volume: opts.foreignVolume ?? 0,
    fetched_at: opts.fetchedAt ?? new Date().toISOString(),
  };
  db.prepare(
    `INSERT OR IGNORE INTO vnstock_trading_stats
       (id, code, date, foreign_volume, fetched_at)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.code,
    row.date,
    row.foreign_volume,
    row.fetched_at,
  );
}

/**
 * Seed an evidence_scores row.
 */
function seedEvidenceScore(
  db: Database,
  opts: {
    id?: string;
    stock: string;
    scoreDate?: string;
    bullishScore?: number;
    bearishScore?: number;
    fragmentCount?: number;
  },
): void {
  const row = {
    id: opts.id ?? `es-${opts.stock}-${Date.now()}-${Math.random()}`,
    stock: opts.stock,
    score_date: opts.scoreDate ?? "2026-04-12",
    bullish_score: opts.bullishScore ?? 0.5,
    bearish_score: opts.bearishScore ?? 0.1,
    fragment_count: opts.fragmentCount ?? 3,
  };
  db.prepare(
    `INSERT OR IGNORE INTO evidence_scores
       (id, stock, score_date, bullish_score, bearish_score, fragment_count)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    row.id,
    row.stock,
    row.score_date,
    row.bullish_score,
    row.bearish_score,
    row.fragment_count,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared test infrastructure
// ─────────────────────────────────────────────────────────────────────────────

const TEST_BRIEFINGS_DIR = join(
  process.cwd(),
  "data",
  "__test-briefings-1159__",
);

function cleanupBriefingsDir(): void {
  if (existsSync(TEST_BRIEFINGS_DIR)) {
    rmSync(TEST_BRIEFINGS_DIR, { recursive: true, force: true });
  }
}

function noop() {
  return Promise.resolve({ fetched: 0, inserted: 0, duplicates: 0, alerts: 0, errors: 0 });
}

// ─────────────────────────────────────────────────────────────────────────────
// Type helpers — cast to wide type to access not-yet-existent fields without
// TypeScript errors. Tests fail at runtime when fields are absent (red phase).
// ─────────────────────────────────────────────────────────────────────────────

/** Typed view for new DailyBriefing enrichment fields (runtime check only). */
interface EnrichedBriefing {
  date: string;
  vnIndex?: { price: number; changePct: number };
  watchlistSummary: unknown[];
  /** Not present before Task 1160 — tests fail when undefined */
  insiderRecent?: Array<{
    code: string;
    type: string;
    executedVolume: number;
    insiderName: string;
    fromDate: string;
  }>;
  /** Not present before Task 1160 — tests fail when undefined */
  foreignFlowSummary?: Array<{
    code: string;
    direction: "net_buy" | "net_sell";
    foreignVolume: number;
    date: string;
  }>;
  /** Not present before Task 1160 — tests fail when undefined */
  evidenceTopScores?: Array<{
    code: string;
    netScore: number;
    bullishScore: number;
    bearishScore: number;
    fragmentCount: number;
    scoreDate: string;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 1159 — Morning Briefing Intelligence Enrichment", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
    mkdirSync(TEST_BRIEFINGS_DIR, { recursive: true });
  });

  afterEach(() => {
    db.close();
    cleanupBriefingsDir();
  });

  // ── AC-1: insiderRecent populated from insider_transactions ─────────────────
  describe("AC-1: insiderRecent — watchlist filtering + ordering", () => {
    it("includes only watchlist stocks (VCB, FPT) — excludes non-watchlist ACB", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");
      seedWatchlist(db, "FPT");

      seedInsiderTransaction(db, { code: "VCB", executedVolume: 2_000_000, insiderName: "Nguyen A" });
      seedInsiderTransaction(db, { code: "VCB", executedVolume: 1_500_000, insiderName: "Nguyen B" });
      seedInsiderTransaction(db, { code: "FPT", executedVolume: 800_000, insiderName: "Tran C" });
      // Non-watchlist stock — must be excluded
      seedInsiderTransaction(db, { code: "ACB", executedVolume: 5_000_000, insiderName: "Le D" });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      expect(Array.isArray(briefing.insiderRecent)).toBe(true);

      const codes = (briefing.insiderRecent ?? []).map((r) => r.code);
      expect(codes).not.toContain("ACB");
      expect(codes.every((c) => c === "VCB" || c === "FPT")).toBe(true);
    });

    it("returns at most 3 rows ordered by executedVolume DESC", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");
      seedWatchlist(db, "FPT");

      // 5 rows in the last 24h — should return top 3 by executed_volume
      seedInsiderTransaction(db, { id: "it-1", code: "VCB", executedVolume: 5_000_000 });
      seedInsiderTransaction(db, { id: "it-2", code: "VCB", executedVolume: 3_000_000 });
      seedInsiderTransaction(db, { id: "it-3", code: "FPT", executedVolume: 2_000_000 });
      seedInsiderTransaction(db, { id: "it-4", code: "FPT", executedVolume: 1_000_000 });
      seedInsiderTransaction(db, { id: "it-5", code: "VCB", executedVolume:   500_000 });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      const rows = briefing.insiderRecent ?? [];
      expect(rows.length).toBeLessThanOrEqual(3);
      expect(rows.length).toBe(3);

      // Ordered DESC by executedVolume
      expect(rows[0]!.executedVolume).toBe(5_000_000);
      expect(rows[1]!.executedVolume).toBe(3_000_000);
      expect(rows[2]!.executedVolume).toBe(2_000_000);
    });

    it("each row carries all required fields: code, type, executedVolume, insiderName, fromDate", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");
      seedInsiderTransaction(db, {
        code: "VCB",
        type: "sell",
        executedVolume: 1_200_000,
        insiderName: "Pham Van E",
        fromDate: "2026-04-12",
      });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      const rows = briefing.insiderRecent ?? [];
      expect(rows.length).toBeGreaterThan(0);
      const row = rows[0]!;
      expect(typeof row.code).toBe("string");
      expect(typeof row.type).toBe("string");
      expect(typeof row.executedVolume).toBe("number");
      expect(typeof row.insiderName).toBe("string");
      expect(typeof row.fromDate).toBe("string");
      expect(row.code).toBe("VCB");
      expect(row.type).toBe("sell");
      expect(row.executedVolume).toBe(1_200_000);
      expect(row.insiderName).toBe("Pham Van E");
      expect(row.fromDate).toBe("2026-04-12");
    });

    it("excludes rows where fetched_at is older than 24h", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");

      const old = new Date(Date.now() - 25 * 3600_000).toISOString();
      seedInsiderTransaction(db, {
        code: "VCB",
        executedVolume: 9_999_999,
        fetchedAt: old, // older than 24h — must be excluded
      });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      expect(briefing.insiderRecent).toEqual([]);
    });
  });

  // ── AC-2: insiderRecent empty-state ─────────────────────────────────────────
  describe("AC-2: insiderRecent empty-state", () => {
    it("insiderRecent is [] when no rows match (empty table)", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");
      // No insider_transactions rows

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      expect(briefing.insiderRecent).toEqual([]);
    });

    it("insiderRecent is [] when watchlist is empty", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      // No watchlist entries at all
      seedInsiderTransaction(db, { code: "VCB", executedVolume: 1_000_000 });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      expect(briefing.insiderRecent).toEqual([]);
    });

    it("briefing is still returned (no exception) when insiderRecent is empty", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      expect(briefing).toBeDefined();
      expect(typeof briefing.date).toBe("string");
      expect(briefing.insiderRecent).toEqual([]);
    });
  });

  // ── AC-3: foreignFlowSummary — net-buy/sell split + zero exclusion ──────────
  describe("AC-3: foreignFlowSummary — net-buy and net-sell classification", () => {
    it("includes top 3 net-buy and top 3 net-sell; excludes foreign_volume = 0", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      for (const code of ["VCB", "FPT", "VNM", "HPG", "MSN", "MWG"]) {
        seedWatchlist(db, code);
      }

      const now = new Date().toISOString();
      seedTradingStats(db, { code: "VCB", foreignVolume:  2_000_000, fetchedAt: now });
      seedTradingStats(db, { code: "FPT", foreignVolume:  1_500_000, fetchedAt: now });
      seedTradingStats(db, { code: "VNM", foreignVolume:    800_000, fetchedAt: now });
      seedTradingStats(db, { code: "HPG", foreignVolume: -3_000_000, fetchedAt: now });
      seedTradingStats(db, { code: "MSN", foreignVolume: -1_200_000, fetchedAt: now });
      seedTradingStats(db, { code: "MWG", foreignVolume:          0, fetchedAt: now }); // excluded

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      const rows = briefing.foreignFlowSummary ?? [];
      expect(Array.isArray(rows)).toBe(true);

      // MWG (foreign_volume=0) must not appear
      const codes = rows.map((r) => r.code);
      expect(codes).not.toContain("MWG");

      // Total: 3 net-buy + 2 net-sell = 5 rows
      expect(rows.length).toBe(5);
    });

    it("net-buy rows have direction='net_buy', net-sell rows have direction='net_sell'", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");
      seedWatchlist(db, "HPG");

      const now = new Date().toISOString();
      seedTradingStats(db, { code: "VCB", foreignVolume:  2_000_000, fetchedAt: now });
      seedTradingStats(db, { code: "HPG", foreignVolume: -3_000_000, fetchedAt: now });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      const rows = briefing.foreignFlowSummary ?? [];
      const vcb = rows.find((r) => r.code === "VCB");
      const hpg = rows.find((r) => r.code === "HPG");

      expect(vcb).toBeDefined();
      expect(vcb!.direction).toBe("net_buy");
      expect(vcb!.foreignVolume).toBe(2_000_000); // raw signed value

      expect(hpg).toBeDefined();
      expect(hpg!.direction).toBe("net_sell");
      expect(hpg!.foreignVolume).toBe(-3_000_000); // raw negative, abs applied only in display
    });

    it("uses most-recent fetched_at per stock (not older rows)", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");

      const older = new Date(Date.now() - 2 * 24 * 3600_000).toISOString();
      const newer = new Date().toISOString();

      // Older row with positive volume — should NOT be used
      seedTradingStats(db, { id: "vs-old", code: "VCB", foreignVolume: 9_999_999, fetchedAt: older });
      // Newer row with negative volume — should be used
      seedTradingStats(db, { id: "vs-new", code: "VCB", foreignVolume: -500_000, fetchedAt: newer });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      const rows = briefing.foreignFlowSummary ?? [];
      const vcb = rows.find((r) => r.code === "VCB");
      expect(vcb).toBeDefined();
      expect(vcb!.foreignVolume).toBe(-500_000);
      expect(vcb!.direction).toBe("net_sell");
    });

    it("foreignFlowSummary is [] when watchlist is empty", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      // No watchlist entries
      seedTradingStats(db, { code: "VCB", foreignVolume: 2_000_000 });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      expect(briefing.foreignFlowSummary).toEqual([]);
    });

    it("foreignFlowSummary is [] when all rows have zero foreign_volume", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");
      seedTradingStats(db, { code: "VCB", foreignVolume: 0 });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      expect(briefing.foreignFlowSummary).toEqual([]);
    });
  });

  // ── AC-4: evidenceTopScores — bullish leaders + bearish warnings ────────────
  describe("AC-4: evidenceTopScores — bullish leaders and bearish warnings", () => {
    it("top 3 bullish leaders (netScore > 0) + bearish warnings (netScore < -2.0)", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      // AC-4 spec fixtures:
      //   VCB: bullish=0.8, bearish=0.1 → net=0.70 (bullish leader)
      //   FPT: bullish=0.7, bearish=0.2 → net=0.50 (bullish leader)
      //   HPG: bullish=0.5, bearish=0.4 → net=0.10 (bullish leader)
      //   VNM: bullish=0.3, bearish=3.5 → net=-3.20 (bearish warning)
      for (const code of ["VCB", "FPT", "VNM", "HPG"]) {
        seedWatchlist(db, code);
      }

      seedEvidenceScore(db, { stock: "VCB", bullishScore: 0.8, bearishScore: 0.1, fragmentCount: 2 });
      seedEvidenceScore(db, { stock: "FPT", bullishScore: 0.7, bearishScore: 0.2, fragmentCount: 3 });
      seedEvidenceScore(db, { stock: "HPG", bullishScore: 0.5, bearishScore: 0.4, fragmentCount: 1 });
      seedEvidenceScore(db, { stock: "VNM", bullishScore: 0.3, bearishScore: 3.5, fragmentCount: 4 });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      const rows = briefing.evidenceTopScores ?? [];
      expect(Array.isArray(rows)).toBe(true);
      expect(rows.length).toBe(4);

      const codes = rows.map((r) => r.code);
      expect(codes).toContain("VCB");
      expect(codes).toContain("FPT");
      expect(codes).toContain("HPG");
      expect(codes).toContain("VNM");
    });

    it("netScore = bullishScore - bearishScore", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");
      seedEvidenceScore(db, { stock: "VCB", bullishScore: 0.8, bearishScore: 0.1, fragmentCount: 2 });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      const rows = briefing.evidenceTopScores ?? [];
      const vcb = rows.find((r) => r.code === "VCB");
      expect(vcb).toBeDefined();
      // 0.8 - 0.1 = 0.7
      expect(vcb!.netScore).toBeCloseTo(0.7, 5);
      expect(vcb!.bullishScore).toBeCloseTo(0.8, 5);
      expect(vcb!.bearishScore).toBeCloseTo(0.1, 5);
    });

    it("excludes stocks with fragment_count = 0", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");
      seedWatchlist(db, "HPG");

      seedEvidenceScore(db, { stock: "VCB", bullishScore: 0.9, bearishScore: 0.1, fragmentCount: 3 });
      // fragment_count = 0 → must be excluded
      seedEvidenceScore(db, { stock: "HPG", bullishScore: 0.8, bearishScore: 0.1, fragmentCount: 0 });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      const rows = briefing.evidenceTopScores ?? [];
      const codes = rows.map((r) => r.code);
      expect(codes).toContain("VCB");
      expect(codes).not.toContain("HPG");
    });

    it("VNM is NOT duplicated in bullish leaders when it qualifies as bearish warning", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VNM");
      // netScore = 0.3 - 3.5 = -3.2 → bearish warning (< -2.0)
      seedEvidenceScore(db, { stock: "VNM", bullishScore: 0.3, bearishScore: 3.5, fragmentCount: 4 });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      const rows = briefing.evidenceTopScores ?? [];
      const vnmRows = rows.filter((r) => r.code === "VNM");
      // Must appear exactly once
      expect(vnmRows.length).toBe(1);
      // Must be bearish (netScore < -2.0)
      expect(vnmRows[0]!.netScore).toBeLessThan(-2.0);
    });

    it("uses most-recent score_date per stock", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");

      // Older row — bullish
      seedEvidenceScore(db, {
        id: "es-old",
        stock: "VCB",
        scoreDate: "2026-04-10",
        bullishScore: 0.9,
        bearishScore: 0.1,
        fragmentCount: 2,
      });
      // Newer row — bearish warning (net = -3.0) — should be used
      seedEvidenceScore(db, {
        id: "es-new",
        stock: "VCB",
        scoreDate: "2026-04-12",
        bullishScore: 0.2,
        bearishScore: 3.2,
        fragmentCount: 5,
      });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      const rows = briefing.evidenceTopScores ?? [];
      const vcb = rows.find((r) => r.code === "VCB");
      expect(vcb).toBeDefined();
      expect(vcb!.scoreDate).toBe("2026-04-12");
      expect(vcb!.netScore).toBeCloseTo(-3.0, 5);
    });

    it("evidenceTopScores is [] when watchlist is empty", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      // No watchlist
      seedEvidenceScore(db, { stock: "VCB", bullishScore: 0.9, bearishScore: 0.1 });

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      expect(briefing.evidenceTopScores).toEqual([]);
    });

    it("evidenceTopScores is [] when no evidence_scores rows exist for watchlist", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");
      // No evidence_scores rows

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      expect(briefing.evidenceTopScores).toEqual([]);
    });
  });

  // ── AC-5: Telegram message includes all three new sections ──────────────────
  // These tests import `formatBriefingMessage` which does NOT exist yet.
  // They will fail at runtime with "undefined is not a function" (red phase).
  describe("AC-5: Telegram message includes three new sections when data present", () => {
    it("message contains '👤 Insider Mới:' header when insiderRecent is non-empty", async () => {
      const mod = await import("../scheduler/briefings/morningBriefingJob.js");
      // formatBriefingMessage does not exist yet → fails here (red phase)
      const formatBriefingMessage = (mod as Record<string, unknown>)["formatBriefingMessage"] as
        | ((b: unknown) => string)
        | undefined;
      expect(typeof formatBriefingMessage).toBe("function");

      const briefing = {
        date: "2026-04-13",
        topStories: [],
        alerts: [],
        watchlistSummary: [],
        newReports: [],
        macroSnapshot: [],
        sensitiveWarnings: [],
        trackedCommodities: [],
        unresolvedAlerts: [],
        topConviction: null,
        predictionSignals: [],
        generatedAt: new Date().toISOString(),
        insiderRecent: [
          { code: "VCB", type: "buy", executedVolume: 1_500_000, insiderName: "Nguyen Van A", fromDate: "2026-04-12" },
        ],
        foreignFlowSummary: [],
        evidenceTopScores: [],
      };

      const message = formatBriefingMessage!(briefing);
      expect(message).toContain("👤 Insider Mới:");
      expect(message).toContain("VCB");
    });

    it("message contains '🌊 Dòng Tiền Ngoại:' header when foreignFlowSummary is non-empty", async () => {
      const mod = await import("../scheduler/briefings/morningBriefingJob.js");
      const formatBriefingMessage = (mod as Record<string, unknown>)["formatBriefingMessage"] as
        | ((b: unknown) => string)
        | undefined;
      expect(typeof formatBriefingMessage).toBe("function");

      const briefing = {
        date: "2026-04-13",
        topStories: [],
        alerts: [],
        watchlistSummary: [],
        newReports: [],
        macroSnapshot: [],
        sensitiveWarnings: [],
        trackedCommodities: [],
        unresolvedAlerts: [],
        topConviction: null,
        predictionSignals: [],
        generatedAt: new Date().toISOString(),
        insiderRecent: [],
        foreignFlowSummary: [
          { code: "VCB", direction: "net_buy", foreignVolume: 2_000_000, date: "2026-04-12" },
          { code: "HPG", direction: "net_sell", foreignVolume: -3_000_000, date: "2026-04-12" },
        ],
        evidenceTopScores: [],
      };

      const message = formatBriefingMessage!(briefing);
      expect(message).toContain("🌊 Dòng Tiền Ngoại:");
      expect(message).toContain("MUA RÒNG");
      expect(message).toContain("BÁN RÒNG");
    });

    it("message contains '🧠 Tích Lũy Bằng Chứng:' header when evidenceTopScores is non-empty", async () => {
      const mod = await import("../scheduler/briefings/morningBriefingJob.js");
      const formatBriefingMessage = (mod as Record<string, unknown>)["formatBriefingMessage"] as
        | ((b: unknown) => string)
        | undefined;
      expect(typeof formatBriefingMessage).toBe("function");

      const briefing = {
        date: "2026-04-13",
        topStories: [],
        alerts: [],
        watchlistSummary: [],
        newReports: [],
        macroSnapshot: [],
        sensitiveWarnings: [],
        trackedCommodities: [],
        unresolvedAlerts: [],
        topConviction: null,
        predictionSignals: [],
        generatedAt: new Date().toISOString(),
        insiderRecent: [],
        foreignFlowSummary: [],
        evidenceTopScores: [
          { code: "VCB", netScore: 0.70, bullishScore: 0.8, bearishScore: 0.1, fragmentCount: 3, scoreDate: "2026-04-12" },
        ],
      };

      const message = formatBriefingMessage!(briefing);
      expect(message).toContain("🧠 Tích Lũy Bằng Chứng:");
      expect(message).toContain("VCB");
    });

    it("type_label mapping: buy→MUA, sell→BÁN, other→KHÁC", async () => {
      const mod = await import("../scheduler/briefings/morningBriefingJob.js");
      const formatBriefingMessage = (mod as Record<string, unknown>)["formatBriefingMessage"] as
        | ((b: unknown) => string)
        | undefined;
      expect(typeof formatBriefingMessage).toBe("function");

      const briefing = {
        date: "2026-04-13",
        topStories: [],
        alerts: [],
        watchlistSummary: [],
        newReports: [],
        macroSnapshot: [],
        sensitiveWarnings: [],
        trackedCommodities: [],
        unresolvedAlerts: [],
        topConviction: null,
        predictionSignals: [],
        generatedAt: new Date().toISOString(),
        insiderRecent: [
          { code: "VCB", type: "buy", executedVolume: 1_000_000, insiderName: "A", fromDate: "2026-04-12" },
          { code: "FPT", type: "sell", executedVolume: 500_000, insiderName: "B", fromDate: "2026-04-12" },
          { code: "HPG", type: "other", executedVolume: 200_000, insiderName: "C", fromDate: "2026-04-12" },
        ],
        foreignFlowSummary: [],
        evidenceTopScores: [],
      };

      const message = formatBriefingMessage!(briefing);
      expect(message).toContain("MUA");
      expect(message).toContain("BÁN");
      expect(message).toContain("KHÁC");
    });

    it("executedVolume is formatted with comma thousands separator (en-US)", async () => {
      const mod = await import("../scheduler/briefings/morningBriefingJob.js");
      const formatBriefingMessage = (mod as Record<string, unknown>)["formatBriefingMessage"] as
        | ((b: unknown) => string)
        | undefined;
      expect(typeof formatBriefingMessage).toBe("function");

      const briefing = {
        date: "2026-04-13",
        topStories: [],
        alerts: [],
        watchlistSummary: [],
        newReports: [],
        macroSnapshot: [],
        sensitiveWarnings: [],
        trackedCommodities: [],
        unresolvedAlerts: [],
        topConviction: null,
        predictionSignals: [],
        generatedAt: new Date().toISOString(),
        insiderRecent: [
          { code: "VCB", type: "buy", executedVolume: 1_500_000, insiderName: "A", fromDate: "2026-04-12" },
        ],
        foreignFlowSummary: [],
        evidenceTopScores: [],
      };

      const message = formatBriefingMessage!(briefing);
      // 1,500,000 in en-US locale
      expect(message).toContain("1,500,000");
    });

    it("evidence icon: 🟢 for netScore > 0, 🔴 for netScore < -2.0", async () => {
      const mod = await import("../scheduler/briefings/morningBriefingJob.js");
      const formatBriefingMessage = (mod as Record<string, unknown>)["formatBriefingMessage"] as
        | ((b: unknown) => string)
        | undefined;
      expect(typeof formatBriefingMessage).toBe("function");

      const briefing = {
        date: "2026-04-13",
        topStories: [],
        alerts: [],
        watchlistSummary: [],
        newReports: [],
        macroSnapshot: [],
        sensitiveWarnings: [],
        trackedCommodities: [],
        unresolvedAlerts: [],
        topConviction: null,
        predictionSignals: [],
        generatedAt: new Date().toISOString(),
        insiderRecent: [],
        foreignFlowSummary: [],
        evidenceTopScores: [
          { code: "VCB", netScore: 0.70, bullishScore: 0.8, bearishScore: 0.1, fragmentCount: 3, scoreDate: "2026-04-12" },
          { code: "VNM", netScore: -3.20, bullishScore: 0.3, bearishScore: 3.5, fragmentCount: 4, scoreDate: "2026-04-12" },
        ],
      };

      const message = formatBriefingMessage!(briefing);
      expect(message).toContain("🟢");
      expect(message).toContain("🔴");
    });
  });

  // ── AC-6: Complete empty-state ──────────────────────────────────────────────
  describe("AC-6: Complete empty-state — no data, no crash, no phantom headers", () => {
    it("all three arrays are [] when DB has no enrichment data", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");
      // No insider_transactions, no vnstock_trading_stats, no evidence_scores rows

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      expect(briefing.insiderRecent).toEqual([]);
      expect(briefing.foreignFlowSummary).toEqual([]);
      expect(briefing.evidenceTopScores).toEqual([]);
    });

    it("no exception thrown when all enrichment tables are empty", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      let error: unknown = null;
      try {
        await assembleBriefing({
          db,
          pollNewsFn: noop,
          fetchVnIndexFn: async () => null,
          briefingsDir: TEST_BRIEFINGS_DIR,
        });
      } catch (e) {
        error = e;
      }

      expect(error).toBeNull();
    });

    it("no phantom headers in Telegram message when all three arrays are empty", async () => {
      const mod = await import("../scheduler/briefings/morningBriefingJob.js");
      const formatBriefingMessage = (mod as Record<string, unknown>)["formatBriefingMessage"] as
        | ((b: unknown) => string)
        | undefined;
      expect(typeof formatBriefingMessage).toBe("function");

      const briefing = {
        date: "2026-04-13",
        topStories: [],
        alerts: [],
        watchlistSummary: [],
        newReports: [],
        macroSnapshot: [],
        sensitiveWarnings: [],
        trackedCommodities: [],
        unresolvedAlerts: [],
        topConviction: null,
        predictionSignals: [],
        generatedAt: new Date().toISOString(),
        insiderRecent: [],
        foreignFlowSummary: [],
        evidenceTopScores: [],
      };

      const message = formatBriefingMessage!(briefing);
      expect(message).not.toContain("👤 Insider Mới:");
      expect(message).not.toContain("🌊 Dòng Tiền Ngoại:");
      expect(message).not.toContain("🧠 Tích Lũy Bằng Chứng:");
    });

    it("existing briefing sections render normally even when new arrays are empty", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      seedWatchlist(db, "VCB");

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => ({ price: 1285.5, changePct: 0.72 }),
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as EnrichedBriefing;

      // Existing fields still present
      expect(typeof briefing.date).toBe("string");
      expect(briefing.vnIndex).toBeDefined();
      expect(briefing.vnIndex!.price).toBe(1285.5);
      expect(Array.isArray(briefing.watchlistSummary)).toBe(true);
      expect(briefing.watchlistSummary.length).toBe(1);
      // New fields present and empty
      expect(briefing.insiderRecent).toEqual([]);
      expect(briefing.foreignFlowSummary).toEqual([]);
      expect(briefing.evidenceTopScores).toEqual([]);
    });
  });

  // ── Type contract ─────────────────────────────────────────────────────────
  describe("Type contract — exported constants from assembleBriefing.ts", () => {
    it("BEARISH_WARNING_THRESHOLD is exported as -2.0", async () => {
      // If the export does not exist, this check will fail (red phase)
      const mod = await import(
        "../application/usecases/assembleBriefing.js"
      );

      expect(typeof (mod as Record<string, unknown>)["BEARISH_WARNING_THRESHOLD"]).toBe("number");
      expect((mod as Record<string, unknown>)["BEARISH_WARNING_THRESHOLD"]).toBe(-2.0);
    });

    it("DailyBriefing has the three new optional array fields after Task 1160", async () => {
      const { assembleBriefing } = await import(
        "../application/usecases/assembleBriefing.js"
      );

      const briefing = (await assembleBriefing({
        db,
        pollNewsFn: noop,
        fetchVnIndexFn: async () => null,
        briefingsDir: TEST_BRIEFINGS_DIR,
      })) as unknown as Record<string, unknown>;

      // Fields must be present (either [] or populated array, never undefined after Task 1160)
      expect("insiderRecent" in briefing).toBe(true);
      expect("foreignFlowSummary" in briefing).toBe(true);
      expect("evidenceTopScores" in briefing).toBe(true);
    });
  });
});
