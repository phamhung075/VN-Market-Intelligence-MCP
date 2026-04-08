/**
 * Task 1033 — Deduplicate mention_velocity CREATE TABLE in schema.ts
 *
 * Verifies that:
 * 1. schema.ts only contains ONE `CREATE TABLE IF NOT EXISTS mention_velocity`
 *    statement (previously there were two identical blocks, Task 265 + Sprint 031).
 * 2. After initDatabase(), the mention_velocity table + its two indexes exist
 *    and inserts/selects work — i.e. removing the duplicate did not break the
 *    schema.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

beforeAll(async () => {
  process.env["DB_PATH"] = ":memory:";
  await initDatabase();
});

afterAll(() => {
  try {
    closeDb();
  } catch {}
});

describe("Task 1033 — mention_velocity schema dedup", () => {
  it("schema.ts defines mention_velocity CREATE TABLE exactly once", () => {
    const schemaPath = resolve(
      import.meta.dir,
      "../infrastructure/db/schema.ts",
    );
    const src = readFileSync(schemaPath, "utf8");
    const matches = src.match(
      /CREATE TABLE IF NOT EXISTS mention_velocity/g,
    );
    expect(matches).not.toBeNull();
    expect(matches!.length).toBe(1);
  });

  it("mention_velocity table + indexes exist after initDatabase", () => {
    const db = getDb();
    const table = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='mention_velocity'",
      )
      .get() as { name: string } | undefined;
    expect(table?.name).toBe("mention_velocity");

    const indexes = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='index' AND tbl_name='mention_velocity' ORDER BY name",
      )
      .all() as Array<{ name: string }>;
    const names = indexes.map((i) => i.name);
    expect(names).toContain("idx_mv_code");
    expect(names).toContain("idx_mv_hour");
  });

  it("mention_velocity supports basic insert + select", () => {
    const db = getDb();
    db.prepare(
      `INSERT INTO mention_velocity (code, hour, mention_count, negative_count, source_count)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("VNM", "2026-04-08T10", 5, 1, 3);

    const row = db
      .prepare(
        `SELECT code, hour, mention_count, negative_count, source_count
         FROM mention_velocity WHERE code = ?`,
      )
      .get("VNM") as Record<string, unknown> | undefined;

    expect(row).toBeDefined();
    expect(row!["mention_count"]).toBe(5);
    expect(row!["negative_count"]).toBe(1);
    expect(row!["source_count"]).toBe(3);
  });
});
