/**
 * Task 1293c: Signal Rejection Audit Log — Database Layer
 *
 * Tests for signal rejection tracking:
 * - logSignalRejection() inserts records correctly
 * - SQL uses parameterized binding (no SQL injection)
 * - getSignalRejectionSummary() aggregates by agent
 * - getSignalRejectionDetails() returns rejection details for an agent
 * - Time-based filtering works correctly
 */

import { describe, it, expect, beforeAll } from "bun:test";
import Database from "bun:sqlite";
import {
  logSignalRejection,
  getSignalRejectionSummary,
  getSignalRejectionDetails,
  type SignalRejection,
} from "../infrastructure/db/signalRejectionStore";
import { initDatabase } from "../infrastructure/db/schema";

describe("1293c: Signal Rejection Audit Log", () => {
  let db: Database;

  beforeAll(() => {
    // Create in-memory test database
    db = new Database(":memory:");
    initDatabase(db);
  });

  describe("logSignalRejection", () => {
    it("should insert rejection record with all fields", () => {
      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        stock_code: "VIC",
        reason: "finding_data.confidence: expected number, received undefined",
        payload_preview: '{"title": "test event"}',
      });

      const rows = db.prepare("SELECT * FROM signal_rejections").all();
      expect(rows.length).toBe(1);
      expect((rows[0] as any).from_agent).toBe("news_scout");
      expect((rows[0] as any).signal_type).toBe("chain_catalyst");
      expect((rows[0] as any).stock_code).toBe("VIC");
      expect((rows[0] as any).reason).toContain("confidence");
    });

    it("should handle null stock_code gracefully", () => {
      logSignalRejection(db, {
        from_agent: "market_watcher",
        signal_type: "price_confirmation",
        reason: "finding_data.volume_ratio: required",
        payload_preview: "{}",
      });

      const rows = db.prepare("SELECT * FROM signal_rejections WHERE from_agent = ?").all("market_watcher");
      expect(rows.length).toBeGreaterThan(0);
      expect((rows[rows.length - 1] as any).stock_code).toBeNull();
    });

    it("should use parameterized binding (SQL injection safety)", () => {
      // Try to inject SQL via from_agent field
      const maliciousAgent = "test'; DROP TABLE signal_rejections;--";
      logSignalRejection(db, {
        from_agent: maliciousAgent,
        signal_type: "chain_catalyst",
        reason: "test",
        payload_preview: "{}",
      });

      // Table should still exist and contain the injection attempt as data
      const rows = db.prepare("SELECT * FROM signal_rejections").all();
      expect(rows.length).toBeGreaterThan(0);

      // Verify the injection string was stored as literal data, not executed
      const injectedRow = rows.find((r: any) => r.from_agent === maliciousAgent);
      expect(injectedRow).toBeDefined();
      expect((injectedRow as any).from_agent).toBe(maliciousAgent);
    });

    it("should set created_at timestamp automatically", () => {
      const before = new Date().toISOString();
      logSignalRejection(db, {
        from_agent: "report_analyzer",
        signal_type: "urgent_news",
        reason: "finding_data.headline: required",
        payload_preview: "{}",
      });
      const after = new Date().toISOString();

      const rows = db.prepare("SELECT * FROM signal_rejections WHERE from_agent = ?").all("report_analyzer");
      const createdAt = (rows[rows.length - 1] as any).created_at;
      expect(createdAt).toBeDefined();
      // created_at should be a timestamp string
      expect(typeof createdAt).toBe("string");
    });
  });

  describe("getSignalRejectionSummary", () => {
    it("should return rejection counts by agent (24h default)", () => {
      // Clear table and insert fresh data
      db.prepare("DELETE FROM signal_rejections").run();

      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        reason: "test",
        payload_preview: "{}",
      });
      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        reason: "test",
        payload_preview: "{}",
      });
      logSignalRejection(db, {
        from_agent: "market_watcher",
        signal_type: "price_confirmation",
        reason: "test",
        payload_preview: "{}",
      });

      const summary = getSignalRejectionSummary(db, 24);
      expect(summary["news_scout"]).toBe(2);
      expect(summary["market_watcher"]).toBe(1);
    });

    it("should respect hours parameter for time filtering", () => {
      db.prepare("DELETE FROM signal_rejections").run();

      // Insert a rejection with a fixed timestamp
      db.prepare(`
        INSERT INTO signal_rejections
          (from_agent, signal_type, reason, payload_preview, created_at)
        VALUES (?, ?, ?, ?, datetime('now', '-25 hours'))
      `).run("old_agent", "chain_catalyst", "old", "{}");

      // Insert a fresh rejection
      logSignalRejection(db, {
        from_agent: "new_agent",
        signal_type: "chain_catalyst",
        reason: "new",
        payload_preview: "{}",
      });

      // 24h lookback should not include the old one
      const summary24 = getSignalRejectionSummary(db, 24);
      expect(summary24["old_agent"]).toBeUndefined();
      expect(summary24["new_agent"]).toBe(1);

      // 48h lookback should include both
      const summary48 = getSignalRejectionSummary(db, 48);
      expect(summary48["old_agent"]).toBe(1);
      expect(summary48["new_agent"]).toBe(1);
    });

    it("should return empty object when no rejections match filter", () => {
      db.prepare("DELETE FROM signal_rejections").run();

      const summary = getSignalRejectionSummary(db, 24);
      expect(Object.keys(summary).length).toBe(0);
    });
  });

  describe("getSignalRejectionDetails", () => {
    it("should return full rejection records for an agent", () => {
      db.prepare("DELETE FROM signal_rejections").run();

      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        stock_code: "VIC",
        reason: "finding_data.confidence: expected number",
        payload_preview: '{"title": "test"}',
      });

      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        stock_code: "NVL",
        reason: "finding_data.affected_stocks: expected array",
        payload_preview: '{"title": "test2"}',
      });

      const details = getSignalRejectionDetails(db, "news_scout", 24);
      expect(details.length).toBe(2);
      expect(details[0]?.reason).toContain("confidence");
      expect(details[1]?.reason).toContain("affected_stocks");
    });

    it("should return details in reverse chronological order (newest first)", () => {
      db.prepare("DELETE FROM signal_rejections").run();

      // Insert with explicit timestamps
      db.prepare(`
        INSERT INTO signal_rejections
          (from_agent, signal_type, reason, payload_preview, created_at)
        VALUES (?, ?, ?, ?, datetime('now', '-2 hours'))
      `).run("test_agent", "chain_catalyst", "reason1", "{}");

      db.prepare(`
        INSERT INTO signal_rejections
          (from_agent, signal_type, reason, payload_preview, created_at)
        VALUES (?, ?, ?, ?, datetime('now'))
      `).run("test_agent", "chain_catalyst", "reason2", "{}");

      const details = getSignalRejectionDetails(db, "test_agent", 24);
      expect(details[0]?.reason).toBe("reason2");
      expect(details[1]?.reason).toBe("reason1");
    });

    it("should limit results to 50 records per query", () => {
      db.prepare("DELETE FROM signal_rejections").run();

      // Insert 60 records
      for (let i = 0; i < 60; i++) {
        logSignalRejection(db, {
          from_agent: "prolific_agent",
          signal_type: "chain_catalyst",
          reason: `reason_${i}`,
          payload_preview: "{}",
        });
      }

      const details = getSignalRejectionDetails(db, "prolific_agent", 24);
      expect(details.length).toBe(50);
    });

    it("should respect hours parameter for time filtering", () => {
      db.prepare("DELETE FROM signal_rejections").run();

      db.prepare(`
        INSERT INTO signal_rejections
          (from_agent, signal_type, reason, payload_preview, created_at)
        VALUES (?, ?, ?, ?, datetime('now', '-25 hours'))
      `).run("test_agent", "chain_catalyst", "old", "{}");

      logSignalRejection(db, {
        from_agent: "test_agent",
        signal_type: "chain_catalyst",
        reason: "new",
        payload_preview: "{}",
      });

      // 24h lookback should exclude the old record
      const details24 = getSignalRejectionDetails(db, "test_agent", 24);
      expect(details24.length).toBe(1);
      expect(details24[0]?.reason).toBe("new");

      // 48h lookback should include both
      const details48 = getSignalRejectionDetails(db, "test_agent", 48);
      expect(details48.length).toBe(2);
    });
  });

  describe("Database schema and indexes", () => {
    it("should have signal_rejections table with correct schema", () => {
      const tableInfo = db.prepare("PRAGMA table_info(signal_rejections)").all() as Array<{
        cid: number;
        name: string;
        type: string;
        notnull: number;
        dflt_value: unknown;
        pk: number;
      }>;

      const columnNames = tableInfo.map((col) => col.name);
      expect(columnNames).toContain("id");
      expect(columnNames).toContain("from_agent");
      expect(columnNames).toContain("signal_type");
      expect(columnNames).toContain("stock_code");
      expect(columnNames).toContain("reason");
      expect(columnNames).toContain("payload_preview");
      expect(columnNames).toContain("created_at");
    });

    it("should have index on from_agent for query performance", () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='signal_rejections'").all() as Array<{ name: string }>;
      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames.some((name) => name.includes("agent"))).toBe(true);
    });

    it("should have index on created_at for time-based queries", () => {
      const indexes = db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='signal_rejections'").all() as Array<{ name: string }>;
      const indexNames = indexes.map((idx) => idx.name);
      expect(indexNames.some((name) => name.includes("created_at"))).toBe(true);
    });
  });
});
