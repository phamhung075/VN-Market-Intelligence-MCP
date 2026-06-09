/**
 * Task 1189 — get_pipeline_health use case tests
 *
 * TDD: All test cases defined before implementation.
 * Spec: docs/TECH_075.md
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { getPipelineHealth } from "../application/usecases/getPipelineHealth.js";

// ── Fixed clock ────────────────────────────────────────────────────────────────
// 2026-04-13 10:00:00 ICT  =  2026-04-13 03:00:00 UTC
const NOW_MS = Date.parse("2026-04-13T03:00:00.000Z");

// GMT+7 day boundary for 2026-04-13:
//   today start  = midnight 2026-04-13 ICT = 2026-04-12T17:00:00.000Z
//   yest  start  = midnight 2026-04-12 ICT = 2026-04-11T17:00:00.000Z

// ── Minimal schema builder ────────────────────────────────────────────────────
function buildDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id         TEXT PRIMARY KEY,
      created_at TEXT NOT NULL,
      source_url TEXT,
      data_env TEXT
);
    CREATE INDEX idx_rag_created ON rag_analyses(created_at);

    CREATE TABLE IF NOT EXISTS vps_push_log (
      id        INTEGER PRIMARY KEY AUTOINCREMENT,
      service   TEXT NOT NULL,
      status    TEXT NOT NULL DEFAULT 'ok',
      pushed_at TEXT NOT NULL
    );
  `);
  return db;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe("getPipelineHealth", () => {
  it("returns zeros and nulls when rag_analyses is empty", async () => {
    const db = buildDb();
    const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });

    expect(r.ragRows.today).toBe(0);
    expect(r.ragRows.yesterday).toBe(0);
    expect(r.ragRows.lastInsertedAt).toBeNull();
    expect(r.ragRows.staleMins).toBeNull();
    expect(r.sources).toEqual([]);
    expect(r.vpsPushLast24h).toBe(0);       // table exists, no rows
    expect(r.eveningReportLastRun).toBeNull();
    expect(typeof r.generatedAt).toBe("string");
  });

  it("counts today vs yesterday correctly across the GMT+7 boundary", async () => {
    const db = buildDb();

    // 5 rows today (ICT) — created_at >= 2026-04-12T17:00:00Z
    for (let i = 0; i < 5; i++) {
      db.run(
        "INSERT INTO rag_analyses (id, created_at, source_url) VALUES (?, ?, ?)",
        [`today-${i}`, `2026-04-13T0${i}:00:00.000Z`, `https://cafef.vn/story/${i}`],
      );
    }
    // 3 rows yesterday (ICT) — between 2026-04-11T17:00Z and 2026-04-12T17:00Z
    for (let i = 0; i < 3; i++) {
      db.run(
        "INSERT INTO rag_analyses (id, created_at, source_url) VALUES (?, ?, ?)",
        [`yest-${i}`, `2026-04-12T0${i}:00:00.000Z`, `https://vnexpress.net/s/${i}`],
      );
    }
    // 2 ok VPS news pushes in last 24h
    for (let i = 0; i < 2; i++) {
      db.run(
        "INSERT INTO vps_push_log (service, status, pushed_at) VALUES (?, ?, ?)",
        ["news", "ok", `2026-04-13T0${i}:30:00.000Z`],
      );
    }

    const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });

    expect(r.ragRows.today).toBe(5);
    expect(r.ragRows.yesterday).toBe(3);
    expect(r.ragRows.lastInsertedAt).not.toBeNull();
    expect(r.ragRows.staleMins).toBeGreaterThanOrEqual(0);
    expect(r.vpsPushLast24h).toBe(2);

    const total = r.sources.reduce((s, x) => s + x.count, 0);
    expect(total).toBe(5);  // all today's rows accounted for
    expect(r.sources[0]!.count).toBeGreaterThanOrEqual(r.sources.at(-1)!.count);  // DESC
  });

  it("returns vpsPushLast24h=null when vps_push_log table does not exist", async () => {
    const db = new Database(":memory:");
    db.exec(`CREATE TABLE IF NOT EXISTS rag_analyses (
      id TEXT PRIMARY KEY, created_at TEXT NOT NULL, source_url TEXT,
      data_env TEXT
)`);
    // deliberately omit vps_push_log

    const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });
    expect(r.vpsPushLast24h).toBeNull();
  });

  it("groups source_url by hostname and places nulls under (unknown)", async () => {
    const db = buildDb();

    const rows: [string, string | null][] = [
      ["r1", "https://cafef.vn/a/1"],
      ["r2", "https://cafef.vn/a/2"],
      ["r3", "https://vnexpress.net/b/1"],
      ["r4", null],                       // null source_url → (unknown)
    ];
    for (const [id, url] of rows) {
      db.run(
        "INSERT INTO rag_analyses (id, created_at, source_url) VALUES (?, ?, ?)",
        [id, "2026-04-13T02:00:00.000Z", url],
      );
    }

    const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });

    expect(r.sources).toEqual([
      { source: "cafef.vn",      count: 2 },
      { source: "vnexpress.net", count: 1 },
      { source: "(unknown)",     count: 1 },
    ]);
  });

  it("switches today/yesterday correctly at the GMT+7 midnight boundary", async () => {
    const db = buildDb();

    // One row at 23:59 ICT 2026-04-12 = 2026-04-12T16:59:00Z (still yesterday)
    db.run("INSERT INTO rag_analyses (id, created_at) VALUES (?, ?)",
      ["late", "2026-04-12T16:59:00.000Z"]);

    // One row at 00:01 ICT 2026-04-13 = 2026-04-12T17:01:00Z (today)
    db.run("INSERT INTO rag_analyses (id, created_at) VALUES (?, ?)",
      ["early", "2026-04-12T17:01:00.000Z"]);

    const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });
    expect(r.ragRows.today).toBe(1);
    expect(r.ragRows.yesterday).toBe(1);
  });

  it("clamps staleMins to 0 when created_at is in the future (clock drift)", async () => {
    const db = buildDb();

    // Row 5 minutes in the future relative to NOW_MS
    const futureIso = new Date(NOW_MS + 5 * 60_000).toISOString();
    db.run("INSERT INTO rag_analyses (id, created_at) VALUES (?, ?)", ["future", futureIso]);

    const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });
    expect(r.ragRows.staleMins).toBe(0);
  });

  it("excludes failed VPS pushes from vpsPushLast24h count", async () => {
    const db = buildDb();

    db.run("INSERT INTO vps_push_log (service, status, pushed_at) VALUES (?, ?, ?)",
      ["news", "error", "2026-04-13T01:00:00.000Z"]);
    db.run("INSERT INTO vps_push_log (service, status, pushed_at) VALUES (?, ?, ?)",
      ["news", "ok", "2026-04-13T02:00:00.000Z"]);

    const r = await getPipelineHealth({ db, nowMs: NOW_MS, reportsDir: "/nonexistent" });
    expect(r.vpsPushLast24h).toBe(1);  // only the ok row counted
  });
});
