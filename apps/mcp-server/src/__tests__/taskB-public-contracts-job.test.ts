// src/__tests__/taskB-public-contracts-job.test.ts
// Task B: publicContractsJob + publicContractsStore + muasamcong VPS proxy
// Note: DB_PATH is set to :memory: by apps/mcp-server/src/__tests__/setup.ts preload (Bun.env)

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { storePublicContracts } from "../infrastructure/db/publicContractsStore.js";
import { runPublicContractsJob } from "../scheduler/market-data/publicContractsJob.js";
import { getMuasamcongUrl } from "../infrastructure/fetchers/muasamcong.js";
import type { PublicContract } from "../infrastructure/fetchers/muasamcong.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeTestDb(): Database {
  const db = new Database(":memory:");
  db.run(`
    CREATE TABLE IF NOT EXISTS public_contracts (
      id          INTEGER PRIMARY KEY,
      title       TEXT NOT NULL,
      value       REAL NOT NULL DEFAULT 0,
      category    TEXT NOT NULL DEFAULT 'other',
      agency      TEXT NOT NULL DEFAULT '',
      winner      TEXT NOT NULL DEFAULT '',
      award_date  TEXT NOT NULL DEFAULT '',
      related_stocks TEXT NOT NULL DEFAULT '[]',
      fetched_at  TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);
  return db;
}

function makeSampleContracts(n = 2): PublicContract[] {
  return Array.from({ length: n }, (_, i) => ({
    title: `Gói thầu cao tốc số ${i + 1}`,
    value: 1_000_000_000 * (i + 1),
    agency: `Bộ GTVT ${i + 1}`,
    winner: `HHV Construction ${i + 1}`,
    awardDate: `2026-05-0${i + 1}`,
    category: "highway" as const,
    relatedStocks: ["HHV", "CII"],
  }));
}

// ─────────────────────────────────────────────────────────────────────────────
// Store tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task B — publicContractsStore", () => {
  let db: Database;

  beforeEach(() => {
    db = makeTestDb();
  });

  it("inserts contracts into public_contracts table", () => {
    const contracts = makeSampleContracts(3);
    const result = storePublicContracts(db, contracts);
    expect(result.inserted).toBe(3);
    expect(result.attempted).toBe(3);

    const rows = db.query("SELECT * FROM public_contracts").all();
    expect(rows.length).toBe(3);
  });

  it("deduplicates on (title, award_date)", () => {
    const contracts = makeSampleContracts(2);
    storePublicContracts(db, contracts);
    // Second call with same data: should insert 0 new rows
    const result = storePublicContracts(db, contracts);
    expect(result.inserted).toBe(0);
    expect(result.attempted).toBe(2);

    const rows = db.query("SELECT * FROM public_contracts").all();
    expect(rows.length).toBe(2);
  });

  it("stores related_stocks as JSON string", () => {
    const contracts = makeSampleContracts(1);
    storePublicContracts(db, contracts);
    const row = db.query("SELECT related_stocks FROM public_contracts LIMIT 1").get() as { related_stocks: string };
    expect(row.related_stocks).toBe('["HHV","CII"]');
  });

  it("returns inserted=0 and attempted=0 for empty input", () => {
    const result = storePublicContracts(db, []);
    expect(result.inserted).toBe(0);
    expect(result.attempted).toBe(0);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Job tests (DI)
// ─────────────────────────────────────────────────────────────────────────────

describe("Task B — publicContractsJob", () => {
  it("returns rowsWritten and fetched on success", async () => {
    const db = makeTestDb();
    const contracts = makeSampleContracts(3);

    const result = await runPublicContractsJob({
      fetchFn: async () => contracts,
      storeFn: storePublicContracts,
      db,
      sendWorkFn: async () => {},
    });

    expect(result.success).toBe(true);
    expect(result.fetched).toBe(3);
    expect(result.rowsWritten).toBe(3);
  });

  it("returns success=false and rowsWritten=0 when fetchFn returns empty array", async () => {
    const db = makeTestDb();

    const result = await runPublicContractsJob({
      fetchFn: async () => [],
      storeFn: storePublicContracts,
      db,
      sendWorkFn: async () => {},
    });

    expect(result.success).toBe(false);
    expect(result.rowsWritten).toBe(0);
    expect(result.fetched).toBe(0);
  });

  it("sends WORK telegram and returns error on store failure", async () => {
    const db = makeTestDb();
    const contracts = makeSampleContracts(1);
    const sentMessages: string[] = [];

    const result = await runPublicContractsJob({
      fetchFn: async () => contracts,
      storeFn: () => { throw new Error("DB locked"); },
      db,
      sendWorkFn: async (msg) => { sentMessages.push(msg); },
    });

    expect(result.success).toBe(false);
    expect(result.rowsWritten).toBe(0);
    expect(sentMessages.length).toBe(1);
    expect(sentMessages[0]).toContain("store error");
  });

  it("second run with same contracts deduplicates (rowsWritten=0)", async () => {
    const db = makeTestDb();
    const contracts = makeSampleContracts(2);

    await runPublicContractsJob({
      fetchFn: async () => contracts,
      storeFn: storePublicContracts,
      db,
      sendWorkFn: async () => {},
    });

    const result2 = await runPublicContractsJob({
      fetchFn: async () => contracts,
      storeFn: storePublicContracts,
      db,
      sendWorkFn: async () => {},
    });

    expect(result2.success).toBe(true);
    expect(result2.rowsWritten).toBe(0);
    expect(result2.fetched).toBe(2);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// VPS proxy URL resolution test
// ─────────────────────────────────────────────────────────────────────────────

describe("Task B — getMuasamcongUrl (VPS proxy)", () => {
  it("returns origin URL when MUASAMCONG_VPS_PROXY_URL is unset", () => {
    // Remove env var if set
    const original = Bun.env["MUASAMCONG_VPS_PROXY_URL"];
    delete Bun.env["MUASAMCONG_VPS_PROXY_URL"];

    const url = getMuasamcongUrl();
    expect(url).toContain("muasamcong.mpi.gov.vn");

    if (original !== undefined) {
      Bun.env["MUASAMCONG_VPS_PROXY_URL"] = original;
    }
  });

  it("returns VPS proxy URL when MUASAMCONG_VPS_PROXY_URL is set", () => {
    const proxyUrl = "http://125.212.251.27:8765/muasamcong";
    Bun.env["MUASAMCONG_VPS_PROXY_URL"] = proxyUrl;

    const url = getMuasamcongUrl();
    expect(url).toBe(proxyUrl);

    delete Bun.env["MUASAMCONG_VPS_PROXY_URL"];
  });
});
