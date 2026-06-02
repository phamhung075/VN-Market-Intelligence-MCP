/**
 * EI-P2-1 + EI-P2-2 — Startup assertion + data_env column migration
 *
 * EI-P2-1 tests:
 *   A1 — pass-case: production + prod path → no error
 *   A2 — throw-case: production + dev path → error message
 *   A3 — throw-case: dev + prod path → error message
 *   A4 — unset APP_ENV treated as production (safe default)
 *   A5 — dev + dev.db → consistent (no error)
 *   A6 — assertEnvDbConsistency exits on mismatch
 *   A7 — assertEnvDbConsistency no-op on :memory: (test DB bypass)
 *   A8 — currentDataEnv() returns APP_ENV or 'production' fallback
 *
 * EI-P2-2 tests (in-memory DB):
 *   M1 — daily_ohlcv has data_env column after initMarketDataTables
 *   M2 — financial_reports has data_env column after initFinancialReportsTables
 *   M3 — rag_analyses has data_env column after initNewsTables
 *   M4 — tracked_indicators has data_env column after initMacroTables
 *   M5 — pdf_extracted_text has data_env column after initFinancialReportsTables
 *   M6 — migrations are idempotent (calling twice does not crash)
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";

// ---------------------------------------------------------------------------
// EI-P2-1 — Import pure functions (no process.exit side effects)
// ---------------------------------------------------------------------------
import {
  checkEnvDbConsistency,
  isProductionEnv,
  assertEnvDbConsistency,
  currentDataEnv,
  PROD_DB_PATH,
} from "../infrastructure/envCheck.js";

// ---------------------------------------------------------------------------
// EI-P2-2 — Schema modules (lazy import paths with isolate query to avoid
// cross-test module cache pollution)
// ---------------------------------------------------------------------------
const marketDataModPath = Bun.resolveSync(
  "../infrastructure/db/schema-market-data.js",
  import.meta.dir,
);
const { initMarketDataTables } = await import(marketDataModPath + "?isolate=EI-P2-2-market");

const financialReportsModPath = Bun.resolveSync(
  "../infrastructure/db/schema-financial-reports.js",
  import.meta.dir,
);
const { initFinancialReportsTables } = await import(financialReportsModPath + "?isolate=EI-P2-2-fr");

const newsModPath = Bun.resolveSync(
  "../infrastructure/db/schema-news.js",
  import.meta.dir,
);
const { initNewsTables } = await import(newsModPath + "?isolate=EI-P2-2-news");

const macroModPath = Bun.resolveSync(
  "../infrastructure/db/schema-macro.js",
  import.meta.dir,
);
const { initMacroTables } = await import(macroModPath + "?isolate=EI-P2-2-macro");

// ---------------------------------------------------------------------------
// Helper: check whether a column exists in a table
// ---------------------------------------------------------------------------
function hasColumn(db: Database, table: string, column: string): boolean {
  const cols = db
    .prepare<{ name: string }, []>(`PRAGMA table_info(${table})`)
    .all();
  return cols.some((c) => c.name === column);
}

// ===========================================================================
// EI-P2-1 — Startup assertion tests
// ===========================================================================

describe("EI-P2-1 — isProductionEnv()", () => {
  it("undefined → true (unset = production)", () => {
    expect(isProductionEnv(undefined)).toBe(true);
  });
  it("empty string → true (unset = production)", () => {
    expect(isProductionEnv("")).toBe(true);
  });
  it("'production' → true", () => {
    expect(isProductionEnv("production")).toBe(true);
  });
  it("'dev' → false", () => {
    expect(isProductionEnv("dev")).toBe(false);
  });
  it("'development' → false", () => {
    expect(isProductionEnv("development")).toBe(false);
  });
  it("'test' → false", () => {
    expect(isProductionEnv("test")).toBe(false);
  });
  it("'DEV' (uppercase) → false (case-insensitive)", () => {
    expect(isProductionEnv("DEV")).toBe(false);
  });
});

describe("EI-P2-1 — A1: pass-case — production + prod path", () => {
  it("returns null (no error) for APP_ENV=production + PROD_DB_PATH", () => {
    const result = checkEnvDbConsistency("production", PROD_DB_PATH);
    expect(result).toBeNull();
  });
});

describe("EI-P2-1 — A2: throw-case — production + non-prod path", () => {
  it("returns error string for APP_ENV=production + /tmp/dev.db", () => {
    const result = checkEnvDbConsistency("production", "/tmp/dev.db");
    expect(typeof result).toBe("string");
    expect(result).not.toBeNull();
    expect(result!).toContain("EI-P2-1");
    expect(result!).toContain("production");
    expect(result!).toContain("/tmp/dev.db");
  });
});

describe("EI-P2-1 — A3: throw-case — dev + prod path", () => {
  it("returns error string for APP_ENV=dev + PROD_DB_PATH", () => {
    const result = checkEnvDbConsistency("dev", PROD_DB_PATH);
    expect(typeof result).toBe("string");
    expect(result).not.toBeNull();
    expect(result!).toContain("EI-P2-1");
    expect(result!).toContain("dev");
  });
});

describe("EI-P2-1 — A4: unset APP_ENV treated as production", () => {
  it("undefined + PROD_DB_PATH → null (safe default)", () => {
    const result = checkEnvDbConsistency(undefined, PROD_DB_PATH);
    expect(result).toBeNull();
  });

  it("undefined + non-prod path → error (treats unset as production)", () => {
    const result = checkEnvDbConsistency(undefined, "/app/data/market.dev.db");
    expect(result).not.toBeNull();
    expect(result!).toContain("EI-P2-1");
  });
});

describe("EI-P2-1 — A5: dev + dev.db → consistent", () => {
  it("APP_ENV=dev + /app/data/market.dev.db → null", () => {
    const result = checkEnvDbConsistency("dev", "/app/data/market.dev.db");
    expect(result).toBeNull();
  });

  it("APP_ENV=development + /tmp/test.db → null", () => {
    const result = checkEnvDbConsistency("development", "/tmp/test.db");
    expect(result).toBeNull();
  });
});

describe("EI-P2-1 — A6: assertEnvDbConsistency process.exit on mismatch", () => {
  it("calls process.exit(1) when APP_ENV=production but DB_PATH=/tmp/bad.db", () => {
    // Capture process.exit without actually exiting
    const origExit = process.exit;
    let exitCode: number | undefined;
    // @ts-ignore — override for test
    process.exit = (code: number) => { exitCode = code; };
    try {
      assertEnvDbConsistency({ APP_ENV: "production", DB_PATH: "/tmp/bad.db" });
    } finally {
      process.exit = origExit;
    }
    expect(exitCode).toBe(1);
  });

  it("does NOT call process.exit when pair is consistent (production + prod path)", () => {
    const origExit = process.exit;
    let exitCalled = false;
    // @ts-ignore
    process.exit = () => { exitCalled = true; };
    try {
      assertEnvDbConsistency({ APP_ENV: "production", DB_PATH: PROD_DB_PATH });
    } finally {
      process.exit = origExit;
    }
    expect(exitCalled).toBe(false);
  });
});

describe("EI-P2-1 — A7: assertEnvDbConsistency skips :memory:", () => {
  it("does NOT exit for APP_ENV=dev + DB_PATH=:memory: (test DB bypass)", () => {
    const origExit = process.exit;
    let exitCalled = false;
    // @ts-ignore
    process.exit = () => { exitCalled = true; };
    try {
      assertEnvDbConsistency({ APP_ENV: "dev", DB_PATH: ":memory:" });
    } finally {
      process.exit = origExit;
    }
    expect(exitCalled).toBe(false);
  });
});

describe("EI-P2-1 — A8: currentDataEnv()", () => {
  it("returns APP_ENV value when set", () => {
    expect(currentDataEnv({ APP_ENV: "production" })).toBe("production");
    expect(currentDataEnv({ APP_ENV: "dev" })).toBe("dev");
    expect(currentDataEnv({ APP_ENV: "development" })).toBe("development");
  });

  it("returns 'production' when APP_ENV is unset", () => {
    expect(currentDataEnv({})).toBe("production");
  });
});

// ===========================================================================
// EI-P2-2 — Migration column presence tests
// ===========================================================================

describe("EI-P2-2 — M1: daily_ohlcv has data_env column", () => {
  it("data_env column present after initMarketDataTables", () => {
    const db = new Database(":memory:");
    initMarketDataTables(db);
    expect(hasColumn(db, "daily_ohlcv", "data_env")).toBe(true);
  });
});

describe("EI-P2-2 — M2+M5: financial_reports and pdf_extracted_text have data_env", () => {
  it("financial_reports.data_env present after initFinancialReportsTables", () => {
    const db = new Database(":memory:");
    initFinancialReportsTables(db);
    expect(hasColumn(db, "financial_reports", "data_env")).toBe(true);
  });

  it("pdf_extracted_text.data_env present after initFinancialReportsTables", () => {
    const db = new Database(":memory:");
    initFinancialReportsTables(db);
    expect(hasColumn(db, "pdf_extracted_text", "data_env")).toBe(true);
  });
});

describe("EI-P2-2 — M3: rag_analyses has data_env column", () => {
  it("data_env column present after initNewsTables", () => {
    const db = new Database(":memory:");
    initNewsTables(db);
    expect(hasColumn(db, "rag_analyses", "data_env")).toBe(true);
  });
});

describe("EI-P2-2 — M4: tracked_indicators has data_env column", () => {
  it("data_env column present after initMacroTables", () => {
    const db = new Database(":memory:");
    initMacroTables(db);
    expect(hasColumn(db, "tracked_indicators", "data_env")).toBe(true);
  });
});

describe("EI-P2-2 — M6: migrations are idempotent", () => {
  it("calling initMarketDataTables twice does not throw", () => {
    const db = new Database(":memory:");
    initMarketDataTables(db);
    expect(() => initMarketDataTables(db)).not.toThrow();
  });

  it("calling initFinancialReportsTables twice does not throw", () => {
    const db = new Database(":memory:");
    initFinancialReportsTables(db);
    expect(() => initFinancialReportsTables(db)).not.toThrow();
  });

  it("calling initNewsTables twice does not throw", () => {
    const db = new Database(":memory:");
    initNewsTables(db);
    expect(() => initNewsTables(db)).not.toThrow();
  });

  it("calling initMacroTables twice does not throw", () => {
    const db = new Database(":memory:");
    initMacroTables(db);
    expect(() => initMacroTables(db)).not.toThrow();
  });
});

describe("EI-P2-2 — data_env column is TEXT (nullable)", () => {
  it("daily_ohlcv.data_env is TEXT type", () => {
    const db = new Database(":memory:");
    initMarketDataTables(db);
    const cols = db
      .prepare<{ name: string; type: string }, []>("PRAGMA table_info(daily_ohlcv)")
      .all();
    const col = cols.find((c) => c.name === "data_env");
    expect(col).toBeDefined();
    expect(col!.type.toUpperCase()).toBe("TEXT");
  });

  it("rag_analyses.data_env is TEXT type", () => {
    const db = new Database(":memory:");
    initNewsTables(db);
    const cols = db
      .prepare<{ name: string; type: string }, []>("PRAGMA table_info(rag_analyses)")
      .all();
    const col = cols.find((c) => c.name === "data_env");
    expect(col).toBeDefined();
    expect(col!.type.toUpperCase()).toBe("TEXT");
  });
});
