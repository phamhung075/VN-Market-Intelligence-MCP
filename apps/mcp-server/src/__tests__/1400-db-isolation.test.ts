import { describe, it, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import { initMarketDataTables } from "../infrastructure/db/schema-market-data.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";

describe("Task 1400 — DB isolation: Bun.env namespace", () => {
  it("Bun.env[DB_PATH] is :memory: during test run", () => {
    expect(Bun.env["DB_PATH"]).toBe(":memory:");
  });

  it("production DB path is not the active DB path", async () => {
    const { getDb } = await import("../infrastructure/db/schema.js");
    const db = getDb();
    const PROJECT_ROOT = resolve(import.meta.dir, "..", "..");
    const prodPath = resolve(PROJECT_ROOT, "data", "market.db");
    expect((db as unknown as { filename: string }).filename).not.toBe(prodPath);
  });

  /**
   * This assertion FAILS before the fix (GREEN: step 2).
   * setup.ts must write to Bun.env (not process.env) to make the intent
   * explicit and future-proof against any Bun runtime change that may
   * de-alias the two namespaces. This is the canonical namespace for the
   * Bun runtime and matches schema.ts:64 which reads Bun.env["DB_PATH"].
   */
  it("setup.ts uses Bun.env namespace (not process.env) to set DB_PATH", () => {
    const setupPath = resolve(import.meta.dir, "setup.ts");
    const source = readFileSync(setupPath, "utf8");
    // Must NOT contain Bun.env["DB_PATH"] assignment
    expect(source).not.toMatch(/process\.env\["DB_PATH"\]/);
    // Must contain Bun.env["DB_PATH"] assignment
    expect(source).toMatch(/Bun\.env\["DB_PATH"\]/);
  });
});
