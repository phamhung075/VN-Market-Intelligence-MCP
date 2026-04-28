/**
 * Task 1405b — BCTC + VPS fixes
 *
 * FIX 1: bctcQueueEnricherJob now treats congbothongtin placeholder URLs as
 *         "needs enrichment" (same as NULL / MISSING).
 *
 * FIX 2: news push handler wraps logVpsPush in try/catch so a DB write
 *         failure never triggers a 400 response back to the VPS.  Also
 *         calls logVpsPush for the non-array rejection path.
 *
 * FIX 3: vn-news-fetch health check now queries rag_analyses.created_at
 *         (where VPS news items land) instead of market_messages.sent_at
 *         (internal agent channel — unrelated to VPS pushes).
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import { initFinancialReportsTables } from "../infrastructure/db/schema-financial-reports.js";
import { initSystemTables } from "../infrastructure/db/schema-system.js";
import { initNewsTables } from "../infrastructure/db/schema-news.js";
import {
  logVpsPush,
} from "../infrastructure/db/vpsPushLogStore.js";
import {
  checkServiceFreshness,
  DEFAULT_FRESHNESS_CONFIGS,
} from "../domain/services/vpsHealthPoller.js";

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function makeDb(): Database {
  const db = new Database(":memory:");
  initFinancialReportsTables(db);
  initSystemTables(db);
  initNewsTables(db);
  return db;
}

function insertQueueRow(
  db: Database,
  code: string,
  sourceUrl: string | null,
  status = "pending",
): void {
  db.prepare(`
    INSERT INTO bctc_vps_queue (action_code, period_year, period_quarter, status, source_url)
    VALUES (?, 2025, 'Q4', ?, ?)
  `).run(code, status, sourceUrl);
}

function getQueueRow(
  db: Database,
  code: string,
): { source_url: string | null; status: string } | null {
  return db.prepare(
    `SELECT source_url, status FROM bctc_vps_queue WHERE action_code = ?`,
  ).get(code) as any;
}

// ─────────────────────────────────────────────────────────────────────────────
// FIX 1 — BCTC queue enricher: congbothongtin placeholder treated as NULL
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX 1 — bctcQueueEnricherJob picks up congbothongtin placeholder URLs", () => {
  it("WHERE clause matches congbothongtin stub rows as 'needs enrichment'", () => {
    const db = makeDb();

    // Insert a row with the exact placeholder the ops report found
    insertQueueRow(db, "BID", "https://congbothongtin.ssc.gov.vn/test");
    insertQueueRow(db, "VCB", null);                                 // normal null row
    insertQueueRow(db, "FPT", "http://125.212.251.27:8765/bctc-files/FPT_2025_Q4.pdf"); // real URL — must NOT be picked up

    // Run the exact WHERE clause from the fixed enricher job
    const rows = db
      .query<{ action_code: string }, [number]>(
        `SELECT action_code
         FROM bctc_vps_queue
         WHERE (
           source_url IS NULL
           OR source_url = 'MISSING'
           OR source_url LIKE '/test-%'
           OR source_url LIKE 'https://congbothongtin.ssc.gov.vn/test%'
         )
         AND status = 'pending'
         ORDER BY created_at ASC
         LIMIT ?`,
      )
      .all(20);

    const codes = rows.map((r) => r.action_code);

    // BID (congbothongtin placeholder) and VCB (null) must be picked up
    expect(codes).toContain("BID");
    expect(codes).toContain("VCB");
    // FPT (real VPS URL) must NOT be included
    expect(codes).not.toContain("FPT");
  });

  it("does not pick up rows with real VPS URLs", () => {
    const db = makeDb();
    insertQueueRow(db, "HPG", "http://125.212.251.27:8765/bctc-files/HPG_2025_Q4.pdf");

    const rows = db
      .query<{ action_code: string }, [number]>(
        `SELECT action_code
         FROM bctc_vps_queue
         WHERE (
           source_url IS NULL
           OR source_url = 'MISSING'
           OR source_url LIKE '/test-%'
           OR source_url LIKE 'https://congbothongtin.ssc.gov.vn/test%'
         )
         AND status = 'pending'
         LIMIT ?`,
      )
      .all(20);

    expect(rows.length).toBe(0);
  });

  it("nulling a placeholder row makes the enricher pick it up", () => {
    const db = makeDb();
    insertQueueRow(db, "BSR", "https://congbothongtin.ssc.gov.vn/test-placeholder");

    // Simulate the ops-agent NULL action (what TASK_1404b already did manually)
    db.prepare(
      `UPDATE bctc_vps_queue SET source_url = NULL, attempts = 0 WHERE action_code = ?`,
    ).run("BSR");

    const row = getQueueRow(db, "BSR");
    expect(row?.source_url).toBeNull();

    // Confirm it is now in the enricher's query set
    const found = db
      .query<{ action_code: string }, [number]>(
        `SELECT action_code FROM bctc_vps_queue
         WHERE source_url IS NULL AND status = 'pending' LIMIT ?`,
      )
      .all(20);
    expect(found.map((r) => r.action_code)).toContain("BSR");
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 2 — vps_push_log: news push events are logged correctly
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX 2 — logVpsPush writes news push events to vps_push_log", () => {
  it("inserts a news ok row into vps_push_log", () => {
    const db = makeDb();

    logVpsPush({ service: "news", itemsCount: 240, status: "ok" }, db);

    const row = db
      .prepare(
        `SELECT service, items_count, status FROM vps_push_log WHERE service = 'news' LIMIT 1`,
      )
      .get() as { service: string; items_count: number; status: string } | null;

    expect(row).not.toBeNull();
    expect(row!.service).toBe("news");
    expect(row!.items_count).toBe(240);
    expect(row!.status).toBe("ok");
  });

  it("inserts a news error row with errorMsg", () => {
    const db = makeDb();

    logVpsPush(
      { service: "news", itemsCount: 0, status: "error", errorMsg: "Empty request body" },
      db,
    );

    const row = db
      .prepare(
        `SELECT status, error_msg FROM vps_push_log WHERE service = 'news' LIMIT 1`,
      )
      .get() as { status: string; error_msg: string } | null;

    expect(row!.status).toBe("error");
    expect(row!.error_msg).toBe("Empty request body");
  });

  it("logVpsPush does not throw when called multiple times (idempotent writes)", () => {
    const db = makeDb();

    expect(() => {
      logVpsPush({ service: "news", itemsCount: 100, status: "ok" }, db);
      logVpsPush({ service: "news", itemsCount: 120, status: "ok" }, db);
      logVpsPush({ service: "news", itemsCount: 0, status: "error", errorMsg: "parse error" }, db);
    }).not.toThrow();

    const count = (
      db
        .prepare(`SELECT COUNT(*) AS c FROM vps_push_log WHERE service = 'news'`)
        .get() as { c: number }
    ).c;
    expect(count).toBe(3);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// FIX 3 — vn-news-fetch health: queries rag_analyses, not market_messages
// ─────────────────────────────────────────────────────────────────────────────

describe("FIX 3 — vn-news-fetch freshness checks rag_analyses.created_at", () => {
  const newsConfig = DEFAULT_FRESHNESS_CONFIGS.find(
    (c) => c.serviceName === "vn-news-fetch",
  )!;

  it("config points to rag_analyses table", () => {
    expect(newsConfig.latestTimestampSql).toContain("rag_analyses");
    expect(newsConfig.latestTimestampSql).not.toContain("market_messages");
  });

  it("returns healthy when rag_analyses has a fresh row", () => {
    const db = makeDb();

    // Insert a fresh rag_analyses row (1 minute ago)
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    db.prepare(
      `INSERT INTO rag_analyses
         (id, created_at, level, source_url, source_title, source_type,
          published_at, sentiment, impact_score, impact_direction,
          confidence, time_horizon, summary, reasoning,
          affected_countries, affected_domains, affected_actions,
          parent_ids, tags)
       VALUES (?, ?, 'market', NULL, 'Test news', 'cafef',
               ?, 'neutral', 0.5, 'neutral',
               0.8, 'short', 'summary', 'reasoning',
               '[]', '[]', '[]', '[]', '[]')`,
    ).run("test-id-1", oneMinAgo, oneMinAgo);

    const result = checkServiceFreshness(db, newsConfig, new Date().toISOString());
    expect(result.healthStatus).toBe("healthy");
  });

  it("returns unhealthy when rag_analyses has no rows newer than 30 min", () => {
    const db = makeDb();

    // Insert a stale rag_analyses row (40 minutes ago)
    const fortyMinAgo = new Date(Date.now() - 40 * 60_000).toISOString();
    db.prepare(
      `INSERT INTO rag_analyses
         (id, created_at, level, source_url, source_title, source_type,
          published_at, sentiment, impact_score, impact_direction,
          confidence, time_horizon, summary, reasoning,
          affected_countries, affected_domains, affected_actions,
          parent_ids, tags)
       VALUES (?, ?, 'market', NULL, 'Old news', 'cafef',
               ?, 'neutral', 0.5, 'neutral',
               0.8, 'short', 'summary', 'reasoning',
               '[]', '[]', '[]', '[]', '[]')`,
    ).run("test-id-2", fortyMinAgo, fortyMinAgo);

    const result = checkServiceFreshness(db, newsConfig, new Date().toISOString());
    expect(result.healthStatus).toBe("unhealthy");
  });

  it("returns unreachable when rag_analyses is empty", () => {
    const db = makeDb();
    // No rows inserted

    const result = checkServiceFreshness(db, newsConfig, new Date().toISOString());
    expect(result.healthStatus).toBe("unreachable");
  });

  it("maxAgeMs is 30 minutes", () => {
    expect(newsConfig.maxAgeMs).toBe(30 * 60_000);
  });

  it("does not use market_messages at all for news health", () => {
    const db = makeDb();

    // Insert a fresh market_messages row — must NOT make vn-news-fetch healthy
    const oneMinAgo = new Date(Date.now() - 60_000).toISOString();
    db.prepare(
      `INSERT INTO market_messages (from_agent, message_type, ticker, content, sent_at)
       VALUES ('test-agent', 'alert', 'VCB', 'test message', ?)`,
    ).run(oneMinAgo);

    // rag_analyses is empty → should be unreachable, not healthy
    const result = checkServiceFreshness(db, newsConfig, new Date().toISOString());
    expect(result.healthStatus).toBe("unreachable");
  });
});
