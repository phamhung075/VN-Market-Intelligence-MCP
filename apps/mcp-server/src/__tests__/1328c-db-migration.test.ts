// apps/mcp-server/src/__tests__/1328c-db-migration.test.ts
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)
import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { postSignal } from "../infrastructure/db/agentSignalStore.js";

let db: Database;

beforeEach(() => {
  db = new Database(":memory:");
  initNewsTables(db);
});

afterEach(() => {
  db.close();
});

describe("Task 1328c — DB migration: 3 new columns on agent_signals", () => {
  it("initDatabase() on fresh DB → agent_signals has news_sentiment column", () => {
    const cols = db.query("PRAGMA table_info(agent_signals)").all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("news_sentiment");
  });

  it("initDatabase() on fresh DB → agent_signals has kinh_dich_confidence column", () => {
    const cols = db.query("PRAGMA table_info(agent_signals)").all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("kinh_dich_confidence");
  });

  it("initDatabase() on fresh DB → agent_signals has agent_signals_majority column", () => {
    const cols = db.query("PRAGMA table_info(agent_signals)").all() as { name: string }[];
    const names = cols.map((c) => c.name);
    expect(names).toContain("agent_signals_majority");
  });

  it("initDatabase() runs idempotently — second call does not throw", () => {
    expect(() => initNewsTables(db)).not.toThrow();
  });

  it("INSERT with all 3 new fields → query back → values match", () => {
    const id = postSignal(db, {
      fromAgent: "test-agent",
      toAgent: "all",
      signalType: "chain_catalyst",
      stockCode: "VNM",
      payload: { title: "test" },
      ttlMinutes: 60,
      newsSentiment: 0.75,
      kinhDichConfidence: 82.5,
      agentSignalsMajority: "BUY",
    });

    expect(id).toBeGreaterThan(0);

    const row = db
      .query("SELECT news_sentiment, kinh_dich_confidence, agent_signals_majority FROM agent_signals WHERE id = ?")
      .get(id) as { news_sentiment: number | null; kinh_dich_confidence: number | null; agent_signals_majority: string | null };

    expect(row).not.toBeNull();
    expect(row.news_sentiment).toBe(0.75);
    expect(row.kinh_dich_confidence).toBe(82.5);
    expect(row.agent_signals_majority).toBe("BUY");
  });

  it("INSERT without new fields → new columns are NULL", () => {
    const id = postSignal(db, {
      fromAgent: "test-agent",
      toAgent: "all",
      signalType: "urgent_news",
      payload: { title: "no context" },
      ttlMinutes: 60,
    });

    const row = db
      .query("SELECT news_sentiment, kinh_dich_confidence, agent_signals_majority FROM agent_signals WHERE id = ?")
      .get(id) as { news_sentiment: number | null; kinh_dich_confidence: number | null; agent_signals_majority: string | null };

    expect(row).not.toBeNull();
    expect(row.news_sentiment).toBeNull();
    expect(row.kinh_dich_confidence).toBeNull();
    expect(row.agent_signals_majority).toBeNull();
  });
});
