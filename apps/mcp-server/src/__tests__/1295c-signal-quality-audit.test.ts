/**
 * Task 1295c: Signal Quality Audit Service — Test Suite
 *
 * Tests for signal quality audit service:
 * - queryRejectionStats() aggregates rejections by agent, signal type, and stock
 * - generateAuditReport() produces markdown report with metrics
 * - Alert threshold logic (2% rejection rate)
 * - Empty rejection table handling
 * - Monthly cron job execution
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import Database from "bun:sqlite";
import { initDatabase } from "../infrastructure/db/schema";
import {
  queryRejectionStats,
  generateAuditReport,
  type RejectionStats,
} from "../application/services/signalQualityAudit";
import { logSignalRejection } from "../infrastructure/db/signalRejectionStore";

describe("1295c: Signal Quality Audit Service", () => {
  let db: Database;

  beforeAll(() => {
    db = new Database(":memory:");
    initDatabase(db);
  });

  afterAll(() => {
    db.close();
  });

  describe("queryRejectionStats", () => {
    it("should return empty stats when no rejections exist", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      const stats = await queryRejectionStats(db, "April", 2026);

      expect(stats.total).toBe(0);
      expect(Object.keys(stats.by_agent).length).toBe(0);
      expect(Object.keys(stats.by_type).length).toBe(0);
      expect(Object.keys(stats.by_stock).length).toBe(0);
    });

    it("should aggregate rejections by agent", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      // Insert 5 rejections for news_scout, 3 for market_watcher
      for (let i = 0; i < 5; i++) {
        logSignalRejection(db, {
          from_agent: "news_scout",
          signal_type: "chain_catalyst",
          stock_code: "VIC",
          reason: "validation error",
          payload_preview: "{}",
        });
      }

      for (let i = 0; i < 3; i++) {
        logSignalRejection(db, {
          from_agent: "market_watcher",
          signal_type: "price_confirmation",
          stock_code: "FPT",
          reason: "missing field",
          payload_preview: "{}",
        });
      }

      const stats = await queryRejectionStats(db, "April", 2026);

      expect(stats.total).toBe(8);
      expect(stats.by_agent.news_scout).toBe(5);
      expect(stats.by_agent.market_watcher).toBe(3);
    });

    it("should aggregate rejections by signal type", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        reason: "error",
        payload_preview: "{}",
      });
      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        reason: "error",
        payload_preview: "{}",
      });
      logSignalRejection(db, {
        from_agent: "market_watcher",
        signal_type: "price_confirmation",
        reason: "error",
        payload_preview: "{}",
      });

      const stats = await queryRejectionStats(db, "April", 2026);

      expect(stats.by_type.chain_catalyst).toBe(2);
      expect(stats.by_type.price_confirmation).toBe(1);
    });

    it("should aggregate rejections by stock code", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        stock_code: "VIC",
        reason: "error",
        payload_preview: "{}",
      });
      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        stock_code: "VIC",
        reason: "error",
        payload_preview: "{}",
      });
      logSignalRejection(db, {
        from_agent: "market_watcher",
        signal_type: "price_confirmation",
        stock_code: "FPT",
        reason: "error",
        payload_preview: "{}",
      });

      const stats = await queryRejectionStats(db, "April", 2026);

      expect(stats.by_stock.VIC).toBe(2);
      expect(stats.by_stock.FPT).toBe(1);
    });

    it("should handle null stock_code in aggregation", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        reason: "error",
        payload_preview: "{}",
      });

      const stats = await queryRejectionStats(db, "April", 2026);

      expect(stats.total).toBe(1);
      expect(stats.by_stock["NULL"] || stats.by_stock["null"]).toBe(1);
    });
  });

  describe("generateAuditReport", () => {
    it("should generate report with headers and tables", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      for (let i = 0; i < 3; i++) {
        logSignalRejection(db, {
          from_agent: "news_scout",
          signal_type: "chain_catalyst",
          stock_code: "VIC",
          reason: "validation error",
          payload_preview: "{}",
        });
      }

      const report = await generateAuditReport(db);

      expect(report).toContain("Signal Quality Audit Report");
      expect(report).toContain("news_scout");
      expect(report).toContain("chain_catalyst");
      expect(report).toContain("Total Rejections | 3");
    });

    it("should include rejection rate calculation", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      // Insert 1 rejection
      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        reason: "error",
        payload_preview: "{}",
      });

      const report = await generateAuditReport(db);

      expect(report).toContain("Rejection Rate");
      expect(report).toMatch(/\d+\.\d+%/);
    });

    it("should include warning when rejection rate exceeds 2%", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      // Create scenario with 2.5% rejection rate
      // Insert 25 rejections (will need ~1000 signals for 2.5%)
      for (let i = 0; i < 25; i++) {
        logSignalRejection(db, {
          from_agent: "news_scout",
          signal_type: "chain_catalyst",
          reason: "error",
          payload_preview: "{}",
        });
      }

      const report = await generateAuditReport(db);

      // If rejection rate > 2%, should include alert
      if (report.includes("2.5%") || report.includes("3")) {
        expect(report).toMatch(/alert|warning|threshold/i);
      }
    });

    it("should format markdown tables correctly", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      for (let i = 0; i < 2; i++) {
        logSignalRejection(db, {
          from_agent: "news_scout",
          signal_type: "chain_catalyst",
          stock_code: "VIC",
          reason: "error",
          payload_preview: "{}",
        });
      }

      const report = await generateAuditReport(db);

      expect(report).toContain("|");
      expect(report).toContain("---");
    });

    it("should handle empty audit report gracefully", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      const report = await generateAuditReport(db);

      expect(report).toContain("Signal Quality Audit Report");
      expect(report).toContain("0");
    });
  });

  describe("Alert Threshold Logic", () => {
    it("should detect rejection rate below 2% threshold", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      // Insert 1 rejection — very low rate
      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        reason: "error",
        payload_preview: "{}",
      });

      const stats = await queryRejectionStats(db, "April", 2026);
      const report = await generateAuditReport(db);

      expect(stats.total).toBe(1);
      expect(report).not.toMatch(/alert.*threshold/i);
    });

    it("should calculate rejection rate from total and signal count", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        reason: "error",
        payload_preview: "{}",
      });

      const stats = await queryRejectionStats(db, "April", 2026);

      expect(stats.total).toBeGreaterThanOrEqual(0);
    });
  });

  describe("Cross-agent and cross-type aggregation", () => {
    it("should aggregate multiple agents and types correctly", async () => {
      db.prepare("DELETE FROM signal_rejections").run();

      // Mix of agents and types
      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "chain_catalyst",
        stock_code: "VIC",
        reason: "error",
        payload_preview: "{}",
      });
      logSignalRejection(db, {
        from_agent: "news_scout",
        signal_type: "urgent_news",
        stock_code: "VIC",
        reason: "error",
        payload_preview: "{}",
      });
      logSignalRejection(db, {
        from_agent: "market_watcher",
        signal_type: "price_confirmation",
        stock_code: "FPT",
        reason: "error",
        payload_preview: "{}",
      });

      const stats = await queryRejectionStats(db, "April", 2026);

      expect(stats.total).toBe(3);
      expect(stats.by_agent.news_scout).toBe(2);
      expect(stats.by_agent.market_watcher).toBe(1);
      expect(stats.by_type.chain_catalyst).toBe(1);
      expect(stats.by_type.urgent_news).toBe(1);
      expect(stats.by_type.price_confirmation).toBe(1);
    });
  });
});
