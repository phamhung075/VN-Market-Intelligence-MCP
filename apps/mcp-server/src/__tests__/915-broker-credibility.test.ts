Bun.env["DB_PATH"] = ":memory:";

/**
 * Task 915 — Analyst-credibility discount on sanctioned brokers.
 *
 * Covers:
 *   1. Pure domain function `forecastConfidenceScore`
 *   2. SQLite store `broker_sanctions`
 *   3. MCP tool `get_broker_credibility`
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

import {
  forecastConfidenceScore,
  isSanctionActive,
  pickStrictestActiveSanction,
  SANCTION_MULTIPLIER,
  type BrokerSanction,
} from "../domain/services/forecastConfidenceScore.js";
import {
  insertBrokerSanction,
  listBrokerSanctions,
  listActiveBrokerSanctions,
} from "../infrastructure/db/brokerSanctionStore.js";
import { registerBrokerCredibilityTools } from "../interface/mcp/tools/sector/brokerCredibilityTools.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

// Task 1038: broker_sanctions DDL lives in schema.ts:initDatabase() for
// production. Tests using :memory: databases create the table inline here to
// avoid duplicating the schema in src/infrastructure/db/brokerSanctionStore.ts.
function createBrokerSanctionsSchema(database: Database): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS broker_sanctions (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      broker_name    TEXT NOT NULL,
      sanction_start TEXT NOT NULL,
      sanction_end   TEXT,
      severity       TEXT NOT NULL CHECK (severity IN ('warning','suspension')),
      source         TEXT,
      created_at     TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_broker_sanctions_name ON broker_sanctions(broker_name);
    CREATE INDEX IF NOT EXISTS idx_broker_sanctions_start ON broker_sanctions(sanction_start);
  `);
}

// ─────────────────────────────────────────────────────────────────────────────
// Domain: forecastConfidenceScore
// ─────────────────────────────────────────────────────────────────────────────

describe("forecastConfidenceScore (domain)", () => {
  const tvs: BrokerSanction = {
    brokerName: "Chứng khoán Tân Việt",
    sanctionStart: "2026-04-06",
    sanctionEnd: "2026-10-06",
    severity: "warning",
  };
  const suspended: BrokerSanction = {
    brokerName: "Chứng khoán Tân Việt",
    sanctionStart: "2026-04-06",
    sanctionEnd: null,
    severity: "suspension",
  };

  it("returns full confidence when no sanctions", () => {
    const r = forecastConfidenceScore("Chứng khoán Tân Việt", 0.8, [], "2026-04-07");
    expect(r.adjustedConfidence).toBe(0.8);
    expect(r.multiplier).toBe(1);
    expect(r.activeSanction).toBeNull();
  });

  it("returns full confidence when sanction is not yet active", () => {
    const r = forecastConfidenceScore("Chứng khoán Tân Việt", 1, [tvs], "2026-04-05");
    expect(r.multiplier).toBe(1);
    expect(r.activeSanction).toBeNull();
  });

  it("returns full confidence when sanction has expired", () => {
    const r = forecastConfidenceScore("Chứng khoán Tân Việt", 1, [tvs], "2026-10-07");
    expect(r.multiplier).toBe(1);
  });

  it("applies warning multiplier (0.5) on active warning", () => {
    const r = forecastConfidenceScore("Chứng khoán Tân Việt", 1, [tvs], "2026-04-07");
    expect(r.multiplier).toBe(0.5);
    expect(r.adjustedConfidence).toBe(0.5);
    expect(r.activeSanction).not.toBeNull();
  });

  it("applies suspension multiplier (0.2) on active suspension", () => {
    const r = forecastConfidenceScore(
      "Chứng khoán Tân Việt",
      1,
      [suspended],
      "2026-04-07",
    );
    expect(r.multiplier).toBe(0.2);
    expect(r.adjustedConfidence).toBeCloseTo(0.2);
  });

  it("picks strictest sanction when both warning + suspension active", () => {
    const r = forecastConfidenceScore(
      "Chứng khoán Tân Việt",
      1,
      [tvs, suspended],
      "2026-04-07",
    );
    expect(r.multiplier).toBe(0.2);
    expect(r.activeSanction?.severity).toBe("suspension");
  });

  it("matches broker name case-insensitively", () => {
    const r = forecastConfidenceScore("chứng khoán tân việt", 1, [tvs], "2026-04-07");
    expect(r.multiplier).toBe(0.5);
  });

  it("ignores sanctions for other brokers", () => {
    const r = forecastConfidenceScore("Chứng khoán SSI", 1, [tvs], "2026-04-07");
    expect(r.multiplier).toBe(1);
  });

  it("rejects invalid asOf format", () => {
    expect(() =>
      forecastConfidenceScore("x", 1, [], "not-a-date"),
    ).toThrow();
  });

  it("rejects non-finite baseConfidence", () => {
    expect(() =>
      forecastConfidenceScore("x", Number.NaN, [], "2026-04-07"),
    ).toThrow();
  });

  it("exports SANCTION_MULTIPLIER with expected values", () => {
    expect(SANCTION_MULTIPLIER.warning).toBe(0.5);
    expect(SANCTION_MULTIPLIER.suspension).toBe(0.2);
  });

  describe("isSanctionActive", () => {
    it("returns true on boundary start date", () => {
      expect(isSanctionActive(tvs, "2026-04-06")).toBe(true);
    });
    it("returns true on boundary end date", () => {
      expect(isSanctionActive(tvs, "2026-10-06")).toBe(true);
    });
    it("treats null end as open-ended", () => {
      expect(isSanctionActive(suspended, "2099-01-01")).toBe(true);
    });
  });

  describe("pickStrictestActiveSanction", () => {
    it("returns null when none active", () => {
      expect(pickStrictestActiveSanction([tvs], "2020-01-01")).toBeNull();
    });
    it("picks suspension over warning", () => {
      const s = pickStrictestActiveSanction([tvs, suspended], "2026-04-07");
      expect(s?.severity).toBe("suspension");
    });
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Store: broker_sanctions
// ─────────────────────────────────────────────────────────────────────────────

describe("brokerSanctionStore (infrastructure)", () => {
  let db: Database;

  beforeEach(() => {
    db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    createBrokerSanctionsSchema(db);
  });

  it("createBrokerSanctionsSchema is idempotent", () => {
    expect(() => createBrokerSanctionsSchema(db)).not.toThrow();
    expect(() => createBrokerSanctionsSchema(db)).not.toThrow();
  });

  it("insert + list by broker name", () => {
    insertBrokerSanction(db, {
      brokerName: "Chứng khoán Tân Việt",
      sanctionStart: "2026-04-06",
      sanctionEnd: "2026-10-06",
      severity: "warning",
      source: "cafef.vn/vi-sao-tvs-bi-xu-phat",
    });

    const rows = listBrokerSanctions(db, "Chứng khoán Tân Việt");
    expect(rows).toHaveLength(1);
    expect(rows[0]!.severity).toBe("warning");
    expect(rows[0]!.source).toBe("cafef.vn/vi-sao-tvs-bi-xu-phat");
  });

  it("list is case-insensitive on broker name", () => {
    insertBrokerSanction(db, {
      brokerName: "Chứng khoán Tân Việt",
      sanctionStart: "2026-04-06",
      sanctionEnd: null,
      severity: "warning",
    });
    const rows = listBrokerSanctions(db, "chứng khoán tân việt");
    expect(rows).toHaveLength(1);
  });

  it("listActiveBrokerSanctions filters by asOf", () => {
    insertBrokerSanction(db, {
      brokerName: "Broker A",
      sanctionStart: "2026-01-01",
      sanctionEnd: "2026-03-31",
      severity: "warning",
    });
    insertBrokerSanction(db, {
      brokerName: "Broker B",
      sanctionStart: "2026-04-01",
      sanctionEnd: null,
      severity: "suspension",
    });

    const activeInMarch = listActiveBrokerSanctions(db, "2026-03-15");
    expect(activeInMarch.map((s) => s.brokerName)).toEqual(["Broker A"]);

    const activeInMay = listActiveBrokerSanctions(db, "2026-05-01");
    expect(activeInMay.map((s) => s.brokerName)).toEqual(["Broker B"]);
  });

  it("rejects invalid severity via CHECK constraint", () => {
    expect(() =>
      db
        .prepare(
          `INSERT INTO broker_sanctions (broker_name, sanction_start, severity, created_at)
           VALUES (?, ?, ?, ?)`,
        )
        .run("X", "2026-01-01", "bogus", new Date().toISOString()),
    ).toThrow();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// MCP tool: get_broker_credibility
// ─────────────────────────────────────────────────────────────────────────────

describe("registerBrokerCredibilityTools (interface)", () => {
  it("registers without throwing", () => {
    const db = new Database(":memory:");
    initNewsTables(db);
    initMarketDataTables(db);
    initSystemTables(db);
    createBrokerSanctionsSchema(db);
    const server = new McpServer(
      { name: "test-915", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    expect(() => registerBrokerCredibilityTools(server, db)).not.toThrow();
  });
});
