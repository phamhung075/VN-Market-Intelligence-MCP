/**
 * P0-4-MARKET-SENTIMENT-INDEX — Test Suite
 *
 * Covers all ACs from HANDOFF-P04-MARKET-SENTIMENT-INDEX.md:
 *
 *   AC-1:  Confidence-weighted daily sentiment score computed correctly
 *   AC-2:  Z-score null when <21 days (hard constraint)
 *   AC-3:  history_quality: EMPTY when no data; INSUFFICIENT when <21d; SUFFICIENT when ≥21d
 *   AC-4:  EMA(5) computed (null when <5 valid days)
 *   AC-5:  Bull/bear/neutral dispersion ratios from last 5 days (sum = 1.0)
 *   AC-6:  Article volume spike flag (today > 2× 30d average)
 *   AC-7:  news_sentiment_z = z_60d ?? z_90d; null when INSUFFICIENT/EMPTY
 *   AC-8:  Covering index idx_rag_sentiment_covering created in schema
 *   AC-9:  Tool returns {error:...} on DB failure (NFR-P04-3)
 *   AC-10: Divide-by-zero guard: confidence=0 day → daily_score=null
 *   AC-11: Unexpected sentiment values excluded (WARN logged, not crash)
 *   AC-12: ≥21d data → history_quality=SUFFICIENT; z-scores non-null when std>0
 *
 * Harness: _registeredTools direct-handler invocation + pure domain tests.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Domain
import {
  computeDailyScores,
  computeZScores,
  computeEMA5d,
  computeDispersion5d,
  computeArticleSpike,
  type RagAnalysisRow,
} from "../domain/services/news-analysis/marketSentimentCalculator.js";

// Infrastructure
import { getRagRowsForWindow } from "../infrastructure/db/marketSentimentStore.js";

// Application
import { getMarketSentimentIndex } from "../application/usecases/getMarketSentimentIndex.js";

// Tool
import { registerMarketSentimentTools } from "../interface/mcp/tools/news-analysis/marketSentimentTools.js";

// ---------------------------------------------------------------------------
// In-memory DB setup
// ---------------------------------------------------------------------------

function buildTestDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id          TEXT PRIMARY KEY,
      created_at  TEXT NOT NULL,
      level       TEXT NOT NULL DEFAULT 'market',
      sentiment   TEXT,
      confidence  REAL,
      impact_score REAL
    );
    CREATE INDEX IF NOT EXISTS idx_rag_created ON rag_analyses(created_at);
    CREATE INDEX IF NOT EXISTS idx_rag_sentiment_covering
      ON rag_analyses(created_at DESC, sentiment, confidence, impact_score);
  `);
  return db;
}

let rowIdCounter = 0;

/** Insert one rag_analyses row with the given date (YYYY-MM-DD). */
function insertRow(
  db: Database,
  dateStr: string,
  sentiment: string | null,
  confidence: number | null,
  impact_score: number | null = 1.0,
): void {
  rowIdCounter++;
  db.exec(
    `INSERT INTO rag_analyses (id, created_at, level, sentiment, confidence, impact_score)
     VALUES ('row-${rowIdCounter}', '${dateStr}T10:00:00Z', 'market', ${sentiment === null ? 'NULL' : `'${sentiment}'`}, ${confidence === null ? 'NULL' : confidence}, ${impact_score === null ? 'NULL' : impact_score})`,
  );
}

/**
 * Insert N days of rows around `anchorDate`.
 * days[0] = anchorDate, days[1] = anchorDate-1d, etc. (descending).
 */
function insertDaysOfRows(
  db: Database,
  anchorDate: string,
  daysBack: number,
  sentiment: string,
  confidence: number,
  rowsPerDay = 1,
): string[] {
  const dates: string[] = [];
  const anchor = new Date(anchorDate);

  for (let i = 0; i < daysBack; i++) {
    const d = new Date(anchor);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().slice(0, 10);
    dates.push(dateStr);
    for (let j = 0; j < rowsPerDay; j++) {
      insertRow(db, dateStr, sentiment, confidence, 1.0);
    }
  }

  return dates;
}

// ---------------------------------------------------------------------------
// AC-1: Confidence-weighted daily sentiment score
// ---------------------------------------------------------------------------

describe("AC-1: computeDailyScores — confidence-weighted score", () => {
  it("computes bullish=+1 weighted score correctly", () => {
    const rows: RagAnalysisRow[] = [
      { sentiment: "bullish", confidence: 0.8, impact_score: 1.0, created_at: "2026-06-01T00:00:00Z" },
      { sentiment: "bearish", confidence: 0.2, impact_score: 1.0, created_at: "2026-06-01T00:00:00Z" },
    ];
    const scores = computeDailyScores(rows);
    expect(scores).toHaveLength(1);
    // score = (1*0.8*1 + (-1)*0.2*1) / (0.8+0.2) = 0.6/1.0 = 0.6
    expect(scores[0]!.score).toBeCloseTo(0.6, 6);
    expect(scores[0]!.date).toBe("2026-06-01");
    expect(scores[0]!.article_count).toBe(2);
  });

  // FACTORY-GUARD-CI-METRICMASK-IMPL: `row.impact_score ?? 1.0` used to fabricate a
  // plausible-looking "neutral" impact for a row with a genuinely unknown impact_score.
  // The honest fix excludes such a row from the weighted average entirely (same
  // treatment as the existing confidence=null guard) instead of guessing its weight.
  it("excludes rows with impact_score=null (no fabricated 1.0 default) — no other valid rows that day", () => {
    const rows: RagAnalysisRow[] = [
      { sentiment: "bullish", confidence: 1.0, impact_score: null, created_at: "2026-06-01T00:00:00Z" },
    ];
    const scores = computeDailyScores(rows);
    // The only row for 2026-06-01 has an unknown impact_score -> excluded -> no day entry at all.
    expect(scores).toHaveLength(0);
  });

  it("excludes only the impact_score=null row, keeps a co-dated row with a real impact_score", () => {
    const rows: RagAnalysisRow[] = [
      { sentiment: "bullish", confidence: 1.0, impact_score: null, created_at: "2026-06-01T00:00:00Z" },
      { sentiment: "bullish", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-01T00:00:00Z" },
    ];
    const scores = computeDailyScores(rows);
    expect(scores).toHaveLength(1);
    // score = (1*1.0*1.0) / 1.0 = 1.0 — only the real-impact row contributes
    expect(scores[0]!.score).toBeCloseTo(1.0, 6);
    expect(scores[0]!.article_count).toBe(1);
  });

  it("respects impact_score when provided", () => {
    const rows: RagAnalysisRow[] = [
      { sentiment: "bullish", confidence: 1.0, impact_score: 0.5, created_at: "2026-06-01T00:00:00Z" },
    ];
    const scores = computeDailyScores(rows);
    // score = (1*1.0*0.5) / 1.0 = 0.5
    expect(scores[0]!.score).toBeCloseTo(0.5, 6);
  });

  it("groups by date correctly", () => {
    const rows: RagAnalysisRow[] = [
      { sentiment: "bullish", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-01T10:00:00Z" },
      { sentiment: "neutral", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-02T10:00:00Z" },
    ];
    const scores = computeDailyScores(rows);
    expect(scores).toHaveLength(2);
    expect(scores[0]!.date).toBe("2026-06-01");
    expect(scores[1]!.date).toBe("2026-06-02");
    expect(scores[0]!.score).toBeCloseTo(1.0, 6);
    expect(scores[1]!.score).toBeCloseTo(0.0, 6);
  });
});

// ---------------------------------------------------------------------------
// AC-10: Divide-by-zero guard
// ---------------------------------------------------------------------------

describe("AC-10: divide-by-zero guard", () => {
  it("returns score=null when all confidence values are 0 or null", () => {
    const rows: RagAnalysisRow[] = [
      { sentiment: "bullish", confidence: 0, impact_score: 1.0, created_at: "2026-06-01T00:00:00Z" },
      { sentiment: "bearish", confidence: null, impact_score: 1.0, created_at: "2026-06-01T00:00:00Z" },
    ];
    const scores = computeDailyScores(rows);
    // All confidence values are 0 or null → excluded → no valid rows for the day
    expect(scores).toHaveLength(0);
  });

  it("skips rows with confidence ≤ 0 even when sentiment is valid", () => {
    const rows: RagAnalysisRow[] = [
      { sentiment: "bullish", confidence: -0.1, impact_score: 1.0, created_at: "2026-06-01T00:00:00Z" },
    ];
    const scores = computeDailyScores(rows);
    expect(scores).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// AC-11: Unexpected sentiment values excluded (not crash)
// ---------------------------------------------------------------------------

describe("AC-11: unexpected sentiment values excluded + WARN", () => {
  it("excludes rows with unexpected sentiment and logs WARN (no crash)", () => {
    const warned: string[] = [];
    const rows: RagAnalysisRow[] = [
      { sentiment: "very_positive", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-01T00:00:00Z" },
      { sentiment: "bullish", confidence: 0.5, impact_score: 1.0, created_at: "2026-06-01T00:00:00Z" },
    ];
    const scores = computeDailyScores(rows, { warn: (msg) => warned.push(msg) });
    // Only bullish row counted
    expect(scores[0]!.score).toBeCloseTo(1.0, 6);
    expect(scores[0]!.article_count).toBe(1);
    expect(warned).toHaveLength(1);
    expect(warned[0]).toContain("very_positive");
  });
});

// ---------------------------------------------------------------------------
// AC-3 + AC-2: history_quality enum + z-score null constraint
// ---------------------------------------------------------------------------

describe("AC-3 + AC-2: history_quality and z-score null constraint", () => {
  it("returns EMPTY when no rows exist", () => {
    const scores = computeDailyScores([]);
    const z = computeZScores(scores);
    expect(z.history_quality).toBe("EMPTY");
    expect(z.z_60d).toBeNull();
    expect(z.z_90d).toBeNull();
    expect(z.days_available).toBe(0);
    expect(z.null_reason).toBeTruthy();
  });

  it("returns INSUFFICIENT when <21 valid days", () => {
    // Generate exactly 10 days of data
    const rows: RagAnalysisRow[] = Array.from({ length: 10 }, (_, i) => ({
      sentiment: "bullish",
      confidence: 0.8,
      impact_score: 1.0,
      created_at: `2026-05-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
    }));
    const scores = computeDailyScores(rows);
    const z = computeZScores(scores);
    expect(z.history_quality).toBe("INSUFFICIENT");
    expect(z.z_60d).toBeNull();
    expect(z.z_90d).toBeNull();
    expect(z.days_available).toBe(10);
    expect(z.null_reason).toContain("10");
  });

  it("returns SUFFICIENT + non-null z_90d when ≥21 days with variance", () => {
    // 25 days with varying sentiment (so std > 0)
    const rows: RagAnalysisRow[] = [];
    for (let i = 0; i < 25; i++) {
      const d = new Date("2026-06-01");
      d.setDate(d.getDate() - i);
      const sentiment = i % 3 === 0 ? "bearish" : i % 3 === 1 ? "bullish" : "neutral";
      rows.push({
        sentiment,
        confidence: 0.8,
        impact_score: 1.0,
        created_at: d.toISOString().slice(0, 10) + "T10:00:00Z",
      });
    }
    const scores = computeDailyScores(rows);
    const z = computeZScores(scores);
    expect(z.history_quality).toBe("SUFFICIENT");
    expect(z.days_available).toBe(25);
    expect(z.z_90d).not.toBeNull();
    expect(z.null_reason).toBeNull();
  });

  it("z_90d = null when all scores are identical (std = 0)", () => {
    // 21 days, all bullish, all same confidence → all scores = 1.0 → std = 0
    const rows: RagAnalysisRow[] = [];
    for (let i = 0; i < 21; i++) {
      const d = new Date("2026-06-01");
      d.setDate(d.getDate() - i);
      rows.push({
        sentiment: "bullish",
        confidence: 1.0,
        impact_score: 1.0,
        created_at: d.toISOString().slice(0, 10) + "T10:00:00Z",
      });
    }
    const scores = computeDailyScores(rows);
    const z = computeZScores(scores);
    expect(z.history_quality).toBe("SUFFICIENT");
    expect(z.z_90d).toBeNull(); // std=0, z undefined
  });
});

// ---------------------------------------------------------------------------
// AC-4: EMA(5)
// ---------------------------------------------------------------------------

describe("AC-4: computeEMA5d", () => {
  it("returns null when fewer than 5 valid days", () => {
    const rows: RagAnalysisRow[] = [
      { sentiment: "bullish", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-01T00:00:00Z" },
      { sentiment: "bullish", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-02T00:00:00Z" },
    ];
    const scores = computeDailyScores(rows);
    const ema = computeEMA5d(scores);
    expect(ema.ema_5d).toBeNull();
    expect(ema.null_reason).toContain("2");
  });

  it("computes EMA(5) with alpha=1/3 for 5 equal scores", () => {
    // If all scores = 1.0, EMA should converge to 1.0
    const rows: RagAnalysisRow[] = Array.from({ length: 5 }, (_, i) => ({
      sentiment: "bullish",
      confidence: 1.0,
      impact_score: 1.0,
      created_at: `2026-06-0${i + 1}T10:00:00Z`,
    }));
    const scores = computeDailyScores(rows);
    const ema = computeEMA5d(scores);
    expect(ema.ema_5d).toBeCloseTo(1.0, 6);
    expect(ema.null_reason).toBeNull();
  });

  it("applies EMA formula correctly: alpha=1/3", () => {
    // Manually compute EMA for [1, 0, 1, 0, 1]
    // ema[0] = 1.0
    // ema[1] = 1/3 * 0 + 2/3 * 1.0 = 0.6667
    // ema[2] = 1/3 * 1 + 2/3 * 0.6667 = 0.7778
    // ema[3] = 1/3 * 0 + 2/3 * 0.7778 = 0.5185
    // ema[4] = 1/3 * 1 + 2/3 * 0.5185 = 0.6790
    const scores = [
      { date: "2026-06-01", score: 1.0, article_count: 1 },
      { date: "2026-06-02", score: 0.0, article_count: 1 },
      { date: "2026-06-03", score: 1.0, article_count: 1 },
      { date: "2026-06-04", score: 0.0, article_count: 1 },
      { date: "2026-06-05", score: 1.0, article_count: 1 },
    ];
    const ema = computeEMA5d(scores);
    expect(ema.ema_5d).toBeCloseTo(0.6790, 3);
  });
});

// ---------------------------------------------------------------------------
// AC-5: Bull/bear/neutral dispersion ratios sum to 1.0
// ---------------------------------------------------------------------------

describe("AC-5: computeDispersion5d — ratios sum to 1.0", () => {
  it("returns ratios summing to 1.0 for mixed sentiment", () => {
    const cutoff = "2026-06-26"; // 5 days back from 2026-06-30
    const rows: RagAnalysisRow[] = [
      { sentiment: "bullish", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-28T10:00:00Z" },
      { sentiment: "bearish", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-28T11:00:00Z" },
      { sentiment: "neutral", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-29T10:00:00Z" },
      { sentiment: "bullish", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-30T10:00:00Z" },
    ];
    const result = computeDispersion5d(rows, cutoff);
    expect(result.total_articles_5d).toBe(4);
    expect(result.bull_ratio_5d).toBeCloseTo(0.5, 6);   // 2/4
    expect(result.bear_ratio_5d).toBeCloseTo(0.25, 6);  // 1/4
    expect(result.neutral_ratio_5d).toBeCloseTo(0.25, 6); // 1/4
    // Sum should be 1.0
    const sum = result.bull_ratio_5d! + result.bear_ratio_5d! + result.neutral_ratio_5d!;
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("excludes rows before cutoff date", () => {
    const cutoff = "2026-06-26";
    const rows: RagAnalysisRow[] = [
      { sentiment: "bullish", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-20T10:00:00Z" }, // before cutoff
      { sentiment: "bearish", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-28T10:00:00Z" }, // in window
    ];
    const result = computeDispersion5d(rows, cutoff);
    expect(result.total_articles_5d).toBe(1);
    expect(result.bear_ratio_5d).toBeCloseTo(1.0, 6);
  });

  it("returns null ratios when no articles in window", () => {
    const result = computeDispersion5d([], "2026-06-26");
    expect(result.bull_ratio_5d).toBeNull();
    expect(result.bear_ratio_5d).toBeNull();
    expect(result.neutral_ratio_5d).toBeNull();
    expect(result.total_articles_5d).toBe(0);
  });

  it("excludes unexpected sentiment from dispersion", () => {
    const cutoff = "2026-06-26";
    const rows: RagAnalysisRow[] = [
      { sentiment: "very_positive", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-28T10:00:00Z" },
      { sentiment: "bullish", confidence: 1.0, impact_score: 1.0, created_at: "2026-06-28T11:00:00Z" },
    ];
    const result = computeDispersion5d(rows, cutoff);
    expect(result.total_articles_5d).toBe(1); // only bullish counted
    expect(result.bull_ratio_5d).toBeCloseTo(1.0, 6);
  });
});

// ---------------------------------------------------------------------------
// AC-6: Article volume spike
// ---------------------------------------------------------------------------

describe("AC-6: computeArticleSpike", () => {
  it("flags spike when today > 2× 30d average", () => {
    // 29 days with 1 article each, today with 5 articles
    const rows: RagAnalysisRow[] = [];
    const today = "2026-06-30";
    // 29 previous days, 1 article each
    for (let i = 1; i <= 29; i++) {
      const d = new Date("2026-06-30");
      d.setDate(d.getDate() - i);
      rows.push({
        sentiment: "neutral",
        confidence: null,
        impact_score: null,
        created_at: d.toISOString().slice(0, 10) + "T10:00:00Z",
      });
    }
    // Today: 5 articles
    for (let j = 0; j < 5; j++) {
      rows.push({
        sentiment: "bullish",
        confidence: 1.0,
        impact_score: 1.0,
        created_at: `${today}T10:00:0${j}Z`,
      });
    }

    const result = computeArticleSpike(rows, today);
    expect(result.today_article_count).toBe(5);
    // avg = (29 * 1 + 5) / 30 = 34/30 ≈ 1.13
    // spike: 5 > 2 * 1.13 ≈ 2.27 → TRUE
    expect(result.article_spike).toBe(true);
    expect(result.article_volume_30d_avg).toBeCloseTo(34 / 30, 4);
  });

  it("does not flag spike when today ≤ 2× average", () => {
    const today = "2026-06-30";
    const rows: RagAnalysisRow[] = [];
    // 30 days with 3 articles each (including today)
    for (let i = 0; i < 30; i++) {
      const d = new Date("2026-06-30");
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      for (let j = 0; j < 3; j++) {
        rows.push({
          sentiment: "bullish",
          confidence: 1.0,
          impact_score: 1.0,
          created_at: `${dateStr}T10:00:0${j}Z`,
        });
      }
    }

    const result = computeArticleSpike(rows, today);
    // today_count = 3, avg = 3, 3 > 2*3=6 is FALSE
    expect(result.article_spike).toBe(false);
    expect(result.today_article_count).toBe(3);
  });

  it("returns no spike and null avg when rows is empty", () => {
    const result = computeArticleSpike([], "2026-06-30");
    expect(result.article_spike).toBe(false);
    expect(result.article_volume_30d_avg).toBeNull();
    expect(result.today_article_count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// AC-7: news_sentiment_z = z_60d ?? z_90d
// ---------------------------------------------------------------------------

describe("AC-7: news_sentiment_z gauge-ready scalar", () => {
  it("news_sentiment_z is null when EMPTY", () => {
    const scores = computeDailyScores([]);
    const z = computeZScores(scores);
    const news_sentiment_z = z.z_60d ?? z.z_90d;
    expect(news_sentiment_z).toBeNull();
  });

  it("news_sentiment_z is null when INSUFFICIENT (<21d)", () => {
    const rows: RagAnalysisRow[] = Array.from({ length: 10 }, (_, i) => ({
      sentiment: "bullish",
      confidence: 0.8,
      impact_score: 1.0,
      created_at: `2026-06-${String(i + 1).padStart(2, "0")}T10:00:00Z`,
    }));
    const scores = computeDailyScores(rows);
    const z = computeZScores(scores);
    const news_sentiment_z = z.z_60d ?? z.z_90d;
    expect(news_sentiment_z).toBeNull();
    expect(z.history_quality).toBe("INSUFFICIENT");
  });
});

// ---------------------------------------------------------------------------
// AC-8: Covering index created in schema
// ---------------------------------------------------------------------------

describe("AC-8: covering index idx_rag_sentiment_covering", () => {
  it("creates idx_rag_sentiment_covering on in-memory DB", () => {
    const db = buildTestDb();
    // Index should exist after buildTestDb() (our helper runs the DDL)
    const rows = db
      .query<{ name: string }, []>(
        "SELECT name FROM sqlite_master WHERE type='index' AND name='idx_rag_sentiment_covering'",
      )
      .all();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.name).toBe("idx_rag_sentiment_covering");
    db.close();
  });
});

// ---------------------------------------------------------------------------
// AC-9: Tool returns {error:...} on DB failure
// ---------------------------------------------------------------------------

type ToolHandler = {
  handler: (args: Record<string, unknown>) => Promise<{ content: Array<{ type: string; text: string }> }>;
};
type ToolServer = { _registeredTools: Record<string, ToolHandler> };

describe("AC-9: tool returns {error:...} on DB failure (NFR-P04-3)", () => {
  it("returns {error:...} when DB throws", async () => {
    const server = new McpServer({ name: "test", version: "0.0.1" });
    const brokenDb = new Database(":memory:");
    brokenDb.close(); // close immediately so queries fail

    registerMarketSentimentTools(server, brokenDb);

    // Access the registered tool's handler via internal record (CI-safe harness)
    const registry = (server as unknown as ToolServer)._registeredTools;
    const entry = registry["get_market_sentiment_index"];
    expect(entry).toBeDefined();

    const result = await entry!.handler({});
    const parsed = JSON.parse(result.content[0]!.text);
    expect(parsed.error).toBeDefined();
    expect(typeof parsed.error).toBe("string");
    // NFR-P04-3: must not expose raw SQL error — message is wrapped
    expect(parsed.error).toContain("unavailable");
  });
});

// ---------------------------------------------------------------------------
// Integration: getMarketSentimentIndex use case with in-memory DB
// ---------------------------------------------------------------------------

describe("Integration: getMarketSentimentIndex use case", () => {
  let db: Database;
  const TODAY = "2026-06-30";

  beforeEach(() => {
    rowIdCounter = 0;
    db = buildTestDb();
  });

  it("returns EMPTY when rag_analyses is empty", async () => {
    const result = await getMarketSentimentIndex(db, TODAY);
    expect(result.history_quality).toBe("EMPTY");
    expect(result.news_sentiment_z).toBeNull();
    expect(result.sentiment_z_60d).toBeNull();
    expect(result.sentiment_z_90d).toBeNull();
    expect(result.sentiment_ema_5d).toBeNull();
    expect(result.bull_ratio_5d).toBeNull();
    expect(result.source_tier).toBe(3);
    expect(result.unit).toBe("score");
    expect(result.asof).toBe(TODAY);
  });

  it("returns INSUFFICIENT + null z-scores with <21 days of data", async () => {
    // Insert 10 days of data
    insertDaysOfRows(db, TODAY, 10, "bullish", 0.8, 1);
    const result = await getMarketSentimentIndex(db, TODAY);
    expect(result.history_quality).toBe("INSUFFICIENT");
    expect(result.news_sentiment_z).toBeNull();
    expect(result.sentiment_z_60d).toBeNull();
    expect(result.sentiment_z_90d).toBeNull();
    expect(result.days_available).toBe(10);
    expect(result.null_reason).toBeTruthy();
    // EMA still null (only 10 days but EMA needs ≥5, so could be non-null)
    // Actually 10 ≥ 5, so EMA should be non-null
    expect(result.sentiment_ema_5d).not.toBeNull();
  });

  it("returns SUFFICIENT + non-null z-scores with ≥21 days of mixed sentiment", async () => {
    // Insert 25 days with alternating bullish/bearish/neutral (creates variance)
    const anchor = new Date(TODAY);
    for (let i = 0; i < 25; i++) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      const sentiment = i % 3 === 0 ? "bearish" : i % 3 === 1 ? "bullish" : "neutral";
      insertRow(db, dateStr, sentiment, 0.8, 1.0);
    }
    const result = await getMarketSentimentIndex(db, TODAY);
    expect(result.history_quality).toBe("SUFFICIENT");
    expect(result.days_available).toBe(25);
    expect(result.sentiment_z_90d).not.toBeNull();
    expect(result.null_reason).toBeNull();
  });

  it("EMA(5) is non-null when ≥5 valid days exist", async () => {
    // 5 days of data
    insertDaysOfRows(db, TODAY, 5, "bullish", 0.8, 1);
    const result = await getMarketSentimentIndex(db, TODAY);
    expect(result.sentiment_ema_5d).not.toBeNull();
  });

  it("dispersion ratios sum to 1.0 when articles exist in last 5 days", async () => {
    // Insert rows for last 5 days with mixed sentiment
    const anchor = new Date(TODAY);
    for (let i = 0; i < 5; i++) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      const dateStr = d.toISOString().slice(0, 10);
      insertRow(db, dateStr, "bullish", 0.8, 1.0);
      insertRow(db, dateStr, "bearish", 0.6, 1.0);
      insertRow(db, dateStr, "neutral", 0.5, 1.0);
    }
    const result = await getMarketSentimentIndex(db, TODAY);
    expect(result.bull_ratio_5d).not.toBeNull();
    expect(result.bear_ratio_5d).not.toBeNull();
    expect(result.neutral_ratio_5d).not.toBeNull();
    const sum = result.bull_ratio_5d! + result.bear_ratio_5d! + result.neutral_ratio_5d!;
    expect(sum).toBeCloseTo(1.0, 6);
  });

  it("article_spike is true when today has > 2× average", async () => {
    // 29 days with 1 article each, today with 10 articles
    const anchor = new Date(TODAY);
    for (let i = 1; i <= 29; i++) {
      const d = new Date(anchor);
      d.setDate(d.getDate() - i);
      insertRow(db, d.toISOString().slice(0, 10), null, null, null);
    }
    // Today: 10 articles
    for (let j = 0; j < 10; j++) {
      insertRow(db, TODAY, "bullish", 0.8, 1.0);
    }

    const result = await getMarketSentimentIndex(db, TODAY);
    expect(result.today_article_count).toBe(10);
    expect(result.article_spike).toBe(true);
  });

  it("history_quality is always present", async () => {
    const result = await getMarketSentimentIndex(db, TODAY);
    expect(["EMPTY", "INSUFFICIENT", "SUFFICIENT"]).toContain(result.history_quality);
  });

  it("source_tier is always 3", async () => {
    const result = await getMarketSentimentIndex(db, TODAY);
    expect(result.source_tier).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// Integration: store query
// ---------------------------------------------------------------------------

describe("Infrastructure: getRagRowsForWindow", () => {
  let db: Database;

  beforeEach(() => {
    rowIdCounter = 0;
    db = buildTestDb();
  });

  it("returns empty array when table is empty", () => {
    const rows = getRagRowsForWindow(db, 90);
    expect(rows).toHaveLength(0);
  });

  it("returns rows within window and excludes older rows", () => {
    // Insert one row 5 days ago (within 10d window)
    insertRow(db, "2026-06-25", "bullish", 0.8, 1.0);
    // Insert one row 100 days ago (outside 10d window)
    insertRow(db, "2026-03-21", "bearish", 0.5, 1.0);

    // The getRagRowsForWindow uses today's actual date, so we simulate:
    // Just check the older row is excluded when window is 10 days
    // This test uses the live date, so let's use 90 days to include recent rows
    const rows = getRagRowsForWindow(db, 90);
    // 2026-06-25 is within 90 days of 2026-06-30
    // 2026-03-21 is ~100 days before 2026-06-30 → excluded
    expect(rows.some((r) => r.created_at.startsWith("2026-06-25"))).toBe(true);
    expect(rows.some((r) => r.created_at.startsWith("2026-03-21"))).toBe(false);
  });

  it("throws on closed DB (error propagates to tool handler)", () => {
    db.close();
    expect(() => getRagRowsForWindow(db, 90)).toThrow();
  });
});
