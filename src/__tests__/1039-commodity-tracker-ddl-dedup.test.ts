/**
 * Task 1039 — code-janitor: remove duplicate `tracked_indicators` DDL from
 * commodityTracker.ts. The canonical DDL lives in schema.ts:initDatabase().
 *
 * Contract:
 *   1. commodityTracker.ts must NOT contain a CREATE TABLE for tracked_indicators.
 *   2. commodityTracker.ts must NOT contain an `ensureTable` helper or
 *      `_tableCreated` flag (they were the local DDL guards).
 *   3. extractAndStoreIndicators() / getIndicatorHistory() / listTrackedIndicators()
 *      still work against a DB initialised via initDatabase() — i.e. the table
 *      is already there from the canonical schema.
 */

// Must be set BEFORE importing schema module so module-level DB_PATH picks it up.
process.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll } from "bun:test";
import { readFileSync } from "fs";
import { join } from "path";
import { initDatabase, getDb } from "../infrastructure/db/schema.js";
import {
  extractAndStoreIndicators,
  getIndicatorHistory,
  listTrackedIndicators,
} from "../infrastructure/db/commodityTracker.js";

const SRC = readFileSync(
  join(import.meta.dir, "..", "infrastructure", "db", "commodityTracker.ts"),
  "utf8",
);

describe("Task 1039 — commodityTracker DDL deduplication", () => {
  it("does not contain a CREATE TABLE for tracked_indicators", () => {
    expect(SRC).not.toMatch(/CREATE TABLE[\s\S]*?tracked_indicators/i);
  });

  it("does not declare a local ensureTable() helper", () => {
    expect(SRC).not.toMatch(/function\s+ensureTable\b/);
  });

  it("does not declare a _tableCreated guard", () => {
    expect(SRC).not.toMatch(/_tableCreated/);
  });

  describe("runtime — table is already present after initDatabase()", () => {
    beforeAll(async () => {
      await initDatabase();
      // Clear any rows from previous tests sharing this in-memory DB.
      getDb().exec(`DELETE FROM tracked_indicators`);
    });

    it("extractAndStoreIndicators stores into the canonical table", () => {
      const out = extractAndStoreIndicators(
        "Gold hit $2,400/oz this morning amid risk-off flows.",
        "reuters",
      );
      expect(out.length).toBeGreaterThan(0);
      expect(out[0]?.indicator).toBe("gold_usd_oz");

      const hist = getIndicatorHistory("gold_usd_oz", 5);
      expect(hist.length).toBeGreaterThan(0);
      expect(hist[0]?.value).toBe(2400);
    });

    it("listTrackedIndicators returns inserted rows", () => {
      extractAndStoreIndicators(
        "Wheat $6.50/bushel as harvest pressures ease.",
        "reuters",
      );
      const list = listTrackedIndicators();
      expect(list.find((r) => r.indicator === "wheat_usd_bushel")).toBeDefined();
    });
  });
});
