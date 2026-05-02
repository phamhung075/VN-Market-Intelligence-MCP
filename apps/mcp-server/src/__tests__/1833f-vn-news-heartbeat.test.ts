/**
 * Task 1833f — TDD: vn-news-heartbeat on successful push
 *
 * Bug: vn-news-fetch health is determined by MAX(created_at) FROM rag_analyses.
 * When the VPS pushes 90+ times per day but all articles are duplicates,
 * rag_analyses gets no new rows, so health returns "unhealthy" even though
 * the service is actively pushing.
 *
 * Fix: vn-news-fetch freshness config must use vps_push_log.pushed_at
 * (last successful push) so health reflects actual push activity, not
 * just new insertions.
 *
 * AC-1: vn-news-fetch is healthy when vps_push_log has a recent ok push,
 *        even if rag_analyses has not been updated recently.
 * AC-2: vn-news-fetch is unhealthy when vps_push_log has no recent ok push
 *        AND rag_analyses is stale.
 * AC-3: DEFAULT_FRESHNESS_CONFIGS vn-news-fetch SQL targets vps_push_log,
 *        not rag_analyses.
 */

import { describe, it, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import {
  checkServiceFreshness,
  DEFAULT_FRESHNESS_CONFIGS,
} from "../domain/services/vpsHealthPoller.js";
import { initDatabase, getDb, closeDb } from "../infrastructure/db/schema.js";

let db: Database;

beforeAll(async () => {
  Bun.env.DB_PATH = ":memory:";
  await initDatabase();
  db = getDb();
});

afterAll(() => {
  closeDb();
});

describe("Task 1833f — vn-news-fetch heartbeat on successful push", () => {
  it("AC-1: vn-news-fetch is healthy when vps_push_log has a recent ok push (rag_analyses may be stale)", () => {
    // Setup: clear any existing push log entries for news
    db.exec(`DELETE FROM vps_push_log WHERE service = 'news'`);

    // Given: vps_push_log has a recent ok push 5 minutes ago
    const recentPushTime = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO vps_push_log (service, items_count, status, pushed_at)
      VALUES (?, ?, ?, ?)
    `).run("news", 10, "ok", recentPushTime);

    const newsConfig = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-news-fetch",
    )!;

    const nowIso = new Date().toISOString();
    const result = checkServiceFreshness(db, newsConfig, nowIso);

    expect(result.serviceName).toBe("vn-news-fetch");
    expect(result.healthStatus).toBe("healthy");
  });

  it("AC-2: vn-news-fetch is unhealthy when vps_push_log has no recent push (> threshold)", () => {
    // Given: last push to vps_push_log is 60 minutes ago (stale)
    const stalePushTime = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    db.exec(`DELETE FROM vps_push_log WHERE service = 'news'`);
    db.prepare(`
      INSERT INTO vps_push_log (service, items_count, status, pushed_at)
      VALUES (?, ?, ?, ?)
    `).run("news", 5, "ok", stalePushTime);

    const newsConfig = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-news-fetch",
    )!;

    const nowIso = new Date().toISOString();
    const result = checkServiceFreshness(db, newsConfig, nowIso);

    expect(result.serviceName).toBe("vn-news-fetch");
    expect(result.healthStatus).toBe("unhealthy");
  });

  it("AC-3: DEFAULT_FRESHNESS_CONFIGS vn-news-fetch latestTimestampSql includes vps_push_log as heartbeat source", () => {
    const newsConfig = DEFAULT_FRESHNESS_CONFIGS.find(
      (c) => c.serviceName === "vn-news-fetch",
    )!;

    expect(newsConfig.latestTimestampSql).toBeDefined();
    // Must query vps_push_log so that pushes with 0 new insertions still update the heartbeat
    expect(newsConfig.latestTimestampSql).toContain("vps_push_log");
  });
});
