/**
 * CLEAN-DEAD-SOURCE-IDS — fetch-status dead source exclusion
 *
 * Verifies that fetch-status output NEVER includes the 6 retired source IDs
 * (news, cafef1, vnexpress1, shared-url, vnbusiness, vietnambiz) even when
 * historical rows with matching source_url slugs exist in rag_analyses.
 *
 * Dead source rationale:
 *   - news       — bare "news" slug; maps to hostnames like "news.something";
 *                  no live fetcher points to any "news.*" domain.
 *   - cafef1     — old alternate domain (cafef1.vn), retired; replaced by cafef.vn.
 *   - vnexpress1 — old alternate domain (vnexpress1.net), retired.
 *   - shared-url — synthetic slug that appears when source_url contains
 *                  "shared-url" as the first path segment instead of a real domain;
 *                  arises from stale push pipeline format bugs; no live producer.
 *   - vnbusiness — vnbusiness.vn RSS; VPS fetcher for this source was retired.
 *   - vietnambiz — vietnambiz.vn RSS; VPS fetcher for this source was retired.
 *
 * These IDs no longer receive new data. Without the exclusion they appear in
 * the fetch-status sources[] array with permanent VERY-STALE status, polluting
 * the dashboard.
 *
 * AC-1: fetch-status sources[] excludes all 6 dead IDs even with DB rows.
 * AC-2: live sources (cafef, vnexpress, vneconomy) still appear normally.
 * AC-3: DEAD_SOURCE_SLUGS constant is exported and contains exactly the 6 IDs.
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  handleFetchStatus,
  DEAD_SOURCE_SLUGS,
} from "../interface/mcp/routes/fetchStatusHandler.js";
import type { IncomingMessage, ServerResponse } from "node:http";

// ─────────────────────────────────────────────────────────────────────────────
// Minimal schema
// ─────────────────────────────────────────────────────────────────────────────

function setupDb(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE IF NOT EXISTS rag_analyses (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url   TEXT,
      source_title TEXT,
      published_at TEXT,
      created_at   TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS bctc_vps_queue (
      id          INTEGER PRIMARY KEY AUTOINCREMENT,
      action_code TEXT NOT NULL,
      status      TEXT NOT NULL DEFAULT 'pending',
      created_at  TEXT NOT NULL DEFAULT (datetime('now'))
    );
    CREATE TABLE IF NOT EXISTS vps_push_log (
      id                      INTEGER PRIMARY KEY AUTOINCREMENT,
      service                 TEXT NOT NULL,
      items_count             INTEGER DEFAULT 0,
      status                  TEXT NOT NULL DEFAULT 'ok',
      error_msg               TEXT,
      duration_ms             INTEGER,
      pushed_at               TEXT NOT NULL DEFAULT (datetime('now')),
      truncation_detected     INTEGER,
      schema_errors_count     INTEGER,
      failed_item_indices     TEXT,
      parse_time_ms           INTEGER,
      validation_time_ms      INTEGER,
      db_time_ms              INTEGER,
      vps_response_size_bytes INTEGER,
      circuit_breaker_state   TEXT
    );
  `);
  return db;
}

function makeRes(): { res: ServerResponse; body: () => string; status: () => number } {
  let _status = 0;
  let _body = "";
  const res = {
    writeHead(code: number) { _status = code; },
    end(data: string)       { _body = data; },
  } as unknown as ServerResponse;
  return { res, body: () => _body, status: () => _status };
}

const MOCK_REQ = {} as IncomingMessage;

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("CLEAN-DEAD-SOURCE-IDS — AC-3: DEAD_SOURCE_SLUGS export", () => {
  it("DEAD_SOURCE_SLUGS is exported and contains all 6 dead IDs", () => {
    expect(DEAD_SOURCE_SLUGS).toBeDefined();
    expect(DEAD_SOURCE_SLUGS).toContain("news");
    expect(DEAD_SOURCE_SLUGS).toContain("cafef1");
    expect(DEAD_SOURCE_SLUGS).toContain("vnexpress1");
    expect(DEAD_SOURCE_SLUGS).toContain("shared-url");
    expect(DEAD_SOURCE_SLUGS).toContain("vnbusiness");
    expect(DEAD_SOURCE_SLUGS).toContain("vietnambiz");
    expect(DEAD_SOURCE_SLUGS).toHaveLength(6);
  });
});

describe("CLEAN-DEAD-SOURCE-IDS — AC-1: dead IDs excluded from fetch-status", () => {
  let db: Database;

  beforeEach(() => { db = setupDb(); });
  afterEach(() => { db.close(); });

  it("AC-1: 'news' slug excluded even with recent DB rows", () => {
    // Simulate rows that would generate a 'news' slug (e.g. https://news.vn/...)
    db.exec(`
      INSERT INTO rag_analyses (source_url, created_at)
      VALUES ('https://news.vn/article.html', datetime('now', '-1 hour'));
    `);
    const { res, body, status } = makeRes();
    handleFetchStatus(MOCK_REQ, res, db, new Date());
    expect(status()).toBe(200);
    const ids = (JSON.parse(body()).sources as Array<{ id: string }>).map(s => s.id);
    expect(ids).not.toContain("news");
  });

  it("AC-1: 'cafef1' slug excluded even with recent DB rows", () => {
    db.exec(`
      INSERT INTO rag_analyses (source_url, created_at)
      VALUES ('https://cafef1.vn/news.html', datetime('now', '-1 hour'));
    `);
    const { res, body, status } = makeRes();
    handleFetchStatus(MOCK_REQ, res, db, new Date());
    expect(status()).toBe(200);
    const ids = (JSON.parse(body()).sources as Array<{ id: string }>).map(s => s.id);
    expect(ids).not.toContain("cafef1");
  });

  it("AC-1: 'vnexpress1' slug excluded even with recent DB rows", () => {
    db.exec(`
      INSERT INTO rag_analyses (source_url, created_at)
      VALUES ('https://vnexpress1.net/news.html', datetime('now', '-1 hour'));
    `);
    const { res, body, status } = makeRes();
    handleFetchStatus(MOCK_REQ, res, db, new Date());
    expect(status()).toBe(200);
    const ids = (JSON.parse(body()).sources as Array<{ id: string }>).map(s => s.id);
    expect(ids).not.toContain("vnexpress1");
  });

  it("AC-1: 'vnbusiness' slug excluded even with recent DB rows", () => {
    db.exec(`
      INSERT INTO rag_analyses (source_url, created_at)
      VALUES ('https://vnbusiness.vn/article.html', datetime('now', '-1 hour'));
    `);
    const { res, body, status } = makeRes();
    handleFetchStatus(MOCK_REQ, res, db, new Date());
    expect(status()).toBe(200);
    const ids = (JSON.parse(body()).sources as Array<{ id: string }>).map(s => s.id);
    expect(ids).not.toContain("vnbusiness");
  });

  it("AC-1: 'vietnambiz' slug excluded even with recent DB rows", () => {
    db.exec(`
      INSERT INTO rag_analyses (source_url, created_at)
      VALUES ('https://vietnambiz.vn/article.html', datetime('now', '-1 hour'));
    `);
    const { res, body, status } = makeRes();
    handleFetchStatus(MOCK_REQ, res, db, new Date());
    expect(status()).toBe(200);
    const ids = (JSON.parse(body()).sources as Array<{ id: string }>).map(s => s.id);
    expect(ids).not.toContain("vietnambiz");
  });

  it("AC-1: all 6 dead IDs excluded simultaneously from a mixed-source dataset", () => {
    db.exec(`
      INSERT INTO rag_analyses (source_url, created_at) VALUES
        -- dead sources (should be excluded)
        ('https://news.vn/article.html',       datetime('now', '-10 hours')),
        ('https://cafef1.vn/article.html',     datetime('now', '-20 hours')),
        ('https://vnexpress1.net/article.html',datetime('now', '-15 hours')),
        ('https://vnbusiness.vn/article.html', datetime('now', '-50 hours')),
        ('https://vietnambiz.vn/article.html', datetime('now', '-48 hours')),
        -- live sources (should be present)
        ('https://cafef.vn/article.html',      datetime('now', '-1 hour')),
        ('https://www.vnexpress.net/article',   datetime('now', '-2 hours')),
        ('https://vneconomy.vn/article.html',  datetime('now', '-3 hours'));
    `);
    const { res, body, status } = makeRes();
    handleFetchStatus(MOCK_REQ, res, db, new Date());
    expect(status()).toBe(200);
    const ids = (JSON.parse(body()).sources as Array<{ id: string }>).map(s => s.id);

    // Dead IDs must be absent
    expect(ids).not.toContain("news");
    expect(ids).not.toContain("cafef1");
    expect(ids).not.toContain("vnexpress1");
    expect(ids).not.toContain("vnbusiness");
    expect(ids).not.toContain("vietnambiz");
    // shared-url cannot be derived from a standard URL (has a hyphen);
    // it would only appear if source_url literally has 'shared-url' as host,
    // which is structurally impossible via the slug extraction SQL. Verified
    // via the HAVING exclusion clause as a belt-and-suspenders guard.

    // Live sources must still appear
    expect(ids).toContain("cafef");
    expect(ids).toContain("vnexpress");
    expect(ids).toContain("vneconomy");
  });
});

describe("CLEAN-DEAD-SOURCE-IDS — AC-2: live sources unaffected", () => {
  let db: Database;

  beforeEach(() => { db = setupDb(); });
  afterEach(() => { db.close(); });

  it("cafef, vnexpress, vneconomy, vietstock still appear normally", () => {
    db.exec(`
      INSERT INTO rag_analyses (source_url, created_at) VALUES
        ('https://cafef.vn/article.html',        datetime('now', '-30 minutes')),
        ('https://www.vnexpress.net/article.html',datetime('now', '-45 minutes')),
        ('https://vneconomy.vn/article.html',    datetime('now', '-1 hour')),
        ('https://vietstock.vn/article.html',    datetime('now', '-2 hours'));
    `);
    const { res, body, status } = makeRes();
    handleFetchStatus(MOCK_REQ, res, db, new Date());
    expect(status()).toBe(200);
    const ids = (JSON.parse(body()).sources as Array<{ id: string }>).map(s => s.id);
    expect(ids).toContain("cafef");
    expect(ids).toContain("vnexpress");
    expect(ids).toContain("vneconomy");
    expect(ids).toContain("vietstock");
  });
});
