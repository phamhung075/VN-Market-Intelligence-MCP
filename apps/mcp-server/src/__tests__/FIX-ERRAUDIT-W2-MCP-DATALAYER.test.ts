/**
 * FIX-ERRAUDIT-W2-MCP-DATALAYER — unit tests for shared helpers
 *
 * Tests for:
 *   1. safeQuery<T> — domain/utils/safeQuery.ts
 *   2. failLoud     — domain/utils/safeQuery.ts
 *   3. runSection   — application/utils/runSection.ts
 *   4. runSectionAsync — application/utils/runSection.ts
 *
 * FORCED-FAILURE tests are labelled with [FORCED-FAILURE] and prove BOTH branches:
 *   - DB error path → db-error (NOT empty-success masquerading as real data)
 *   - Genuine no-rows path → no-rows (legit-empty preserved)
 *
 * ALL tests use :memory: SQLite — no named-volume or host-fs dependency.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { safeQuery, failLoud } from "../domain/utils/safeQuery.js";
import {
  runSection,
  runSectionAsync,
  SECTION_DEGRADE_LABEL,
  isSectionDegrade,
} from "../application/utils/runSection.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE test_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      value REAL
    )
  `);
  return db;
}

interface TestRow {
  id: number;
  name: string;
  value: number | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// safeQuery — happy paths
// ─────────────────────────────────────────────────────────────────────────────

describe("safeQuery — happy paths", () => {
  let db: Database;
  beforeEach(() => {
    db = makeDb();
  });

  it("returns ok:true with rows when query succeeds and returns data", () => {
    db.exec(`INSERT INTO test_rows (name, value) VALUES ('alpha', 1.5)`);
    const result = safeQuery<TestRow>(db, "SELECT * FROM test_rows", [], "test.happy");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]!.name).toBe("alpha");
    }
  });

  it("returns multiple rows when query returns multiple results", () => {
    db.exec(`INSERT INTO test_rows (name, value) VALUES ('a', 1), ('b', 2), ('c', 3)`);
    const result = safeQuery<TestRow>(db, "SELECT * FROM test_rows ORDER BY name", [], "test.multi");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.length).toBe(3);
    }
  });

  it("accepts bound params and filters correctly", () => {
    db.exec(`INSERT INTO test_rows (name, value) VALUES ('x', 10), ('y', 20)`);
    const result = safeQuery<TestRow>(
      db,
      "SELECT * FROM test_rows WHERE name = ?",
      ["x"],
      "test.params",
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.length).toBe(1);
      expect(result.rows[0]!.value).toBe(10);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// safeQuery — forced-failure: db-error path
// ─────────────────────────────────────────────────────────────────────────────

describe("safeQuery — [FORCED-FAILURE] db-error branch", () => {
  it("[FORCED-FAILURE] closed DB returns ok:false reason:db-error — NEVER empty-success", () => {
    const db = new Database(":memory:");
    db.close(); // Force a DB error
    const result = safeQuery<TestRow>(db, "SELECT 1", [], "test.forced-db-error");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("db-error");
    }
    // Prove: does NOT return { ok:true, rows:[] } masquerading as real data
    expect(result.ok).not.toBe(true);
  });

  it("[FORCED-FAILURE] missing table returns ok:false reason:db-error — NEVER empty-success", () => {
    const db = new Database(":memory:");
    // Query a table that does not exist — simulates schema error
    const result = safeQuery<TestRow>(db, "SELECT * FROM nonexistent_table", [], "test.missing-table");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("db-error");
    }
  });

  it("[FORCED-FAILURE] corrupt SQL returns ok:false reason:db-error", () => {
    const db = makeDb();
    const result = safeQuery<TestRow>(db, "SELECT *** INVALID SQL ***", [], "test.corrupt-sql");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("db-error");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// safeQuery — legit-empty path (no-rows)
// ─────────────────────────────────────────────────────────────────────────────

describe("safeQuery — legit-empty path (no-rows preserved)", () => {
  it("empty table returns ok:false reason:no-rows (genuine empty — NOT db-error)", () => {
    const db = makeDb();
    // Table exists but has no rows — legit-empty path MUST be preserved
    const result = safeQuery<TestRow>(db, "SELECT * FROM test_rows", [], "test.genuine-empty");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      // Must be no-rows, NOT db-error — legit empty != broken DB
      expect(result.reason).toBe("no-rows");
    }
  });

  it("parameterised query with no matching rows returns no-rows", () => {
    const db = makeDb();
    db.exec(`INSERT INTO test_rows (name, value) VALUES ('exists', 1)`);
    const result = safeQuery<TestRow>(
      db,
      "SELECT * FROM test_rows WHERE name = ?",
      ["does-not-exist"],
      "test.no-match",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no-rows");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// failLoud
// ─────────────────────────────────────────────────────────────────────────────

describe("failLoud — structured degrade logger", () => {
  it("returns undefined (typed drop-dimension marker)", () => {
    const result = failLoud(new Error("test error"), "test.failLoud");
    expect(result).toBeUndefined();
  });

  it("accepts non-Error thrown values", () => {
    const result = failLoud("a string was thrown", "test.failLoud.string");
    expect(result).toBeUndefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runSection — sync
// ─────────────────────────────────────────────────────────────────────────────

describe("runSection — sync", () => {
  it("returns ok:true with value when fn succeeds with data", () => {
    const result = runSection(() => [1, 2, 3], "test.section.ok");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual([1, 2, 3]);
    }
  });

  it("[FORCED-FAILURE] throwing fn returns ok:false reason:error — NEVER propagates throw", () => {
    const result = runSection(() => {
      throw new Error("simulated DB locked");
    }, "test.section.forced-error");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("error");
      expect(result.ctx).toBe("test.section.forced-error");
    }
    // Prove: does NOT throw up to caller (degrade-not-crash)
  });

  it("returns ok:false reason:no-data for null result (legit-empty path)", () => {
    const result = runSection(() => null as unknown as string[], "test.section.null");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no-data");
    }
  });

  it("returns ok:false reason:no-data for empty array (legit-empty path)", () => {
    const result = runSection(() => [], "test.section.empty-array");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no-data");
    }
  });

  it("isSectionDegrade type-guard correctly discriminates degrade results", () => {
    const ok = runSection(() => "data", "test.ok");
    const bad = runSection(() => null as unknown as string, "test.bad");
    expect(isSectionDegrade(ok)).toBe(false);
    expect(isSectionDegrade(bad)).toBe(true);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// runSectionAsync — async variant
// ─────────────────────────────────────────────────────────────────────────────

describe("runSectionAsync — async", () => {
  it("returns ok:true with value when async fn resolves with data", async () => {
    const result = await runSectionAsync(async () => ({ key: "value" }), "test.async.ok");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toEqual({ key: "value" });
    }
  });

  it("[FORCED-FAILURE] async fn rejection → ok:false reason:error (never re-throws)", async () => {
    const result = await runSectionAsync(async () => {
      throw new Error("async DB locked");
    }, "test.async.forced-error");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("error");
      expect(result.ctx).toBe("test.async.forced-error");
    }
  });

  it("async fn returning null → ok:false reason:no-data", async () => {
    const result = await runSectionAsync(
      async () => null as unknown as string[],
      "test.async.null",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no-data");
    }
  });

  it("async fn returning empty array → ok:false reason:no-data", async () => {
    const result = await runSectionAsync(async () => [], "test.async.empty");
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("no-data");
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// SECTION_DEGRADE_LABEL — Vietnamese user-facing degrade string
// ─────────────────────────────────────────────────────────────────────────────

describe("SECTION_DEGRADE_LABEL — Vietnamese user-facing string", () => {
  it("is a non-empty string (not 'no macro' / not empty-success)", () => {
    expect(typeof SECTION_DEGRADE_LABEL).toBe("string");
    expect(SECTION_DEGRADE_LABEL.length).toBeGreaterThan(0);
    // Must NOT be empty string (which would masquerade as 'no data available')
    expect(SECTION_DEGRADE_LABEL).not.toBe("");
    // Must NOT be 'neutral' or 'no macro' (fabricated defaults)
    expect(SECTION_DEGRADE_LABEL).not.toBe("neutral");
    expect(SECTION_DEGRADE_LABEL).not.toBe("no macro");
  });
});
