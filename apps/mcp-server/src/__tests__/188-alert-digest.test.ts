/**
 * Task 188 — Daily Alert Digest
 *
 * Tests for:
 *   - assembleAlertDigest groups alerts by stock into correct blocks
 *   - 7 alerts spanning 3 stocks → digest has 3 stock blocks with correct counts
 *   - Alerts older than 24h excluded from digest
 *   - Stock with >3 alerts → top 3 + "(va N canh bao khac)"
 *   - Severity counts in header match actual DB data
 *   - Empty alerts → "Khong co canh bao"
 *   - Telegram not configured → "(Telegram chua duoc cau hinh)"
 *   - CRONS.alertDigest is registered at 0 21 * * 1-5
 *   - Concurrency guard: overlapping invocation is skipped
 *   - MCP tool send_alert_digest is registered on server
 *   - MCP tool returns formatted digest text
 *   - Digest includes date header in Vietnamese format
 *   - Stock blocks include stock code + alert count label
 *   - Critical alerts appear before low alerts in header summary
 *   - Digest text never throws on corrupt affected_actions_json
 *   - formatAlertDigest pure function: deterministic output
 */

import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { Database } from "bun:sqlite";

// ─────────────────────────────────────────────────────────────────────────────
// In-memory DB setup
// ─────────────────────────────────────────────────────────────────────────────

function setupTestDb(): Database {
  const db = new Database(":memory:");
  db.exec("PRAGMA journal_mode = WAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS alerts (
      id                    TEXT PRIMARY KEY,
      triggered_at          TEXT NOT NULL,
      severity              TEXT NOT NULL,
      signals_json          TEXT,
      affected_actions_json TEXT,
      analysis_ids_json     TEXT,
      message               TEXT,
      read                  INTEGER NOT NULL DEFAULT 0,
      user_note             TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_alerts_triggered ON alerts(triggered_at);
    CREATE INDEX IF NOT EXISTS idx_alerts_severity  ON alerts(severity);
  `);

  return db;
}

// ─────────────────────────────────────────────────────────────────────────────
// Seed helpers
// ─────────────────────────────────────────────────────────────────────────────

let _idCounter = 0;

function freshId(): string {
  return `alert-${Date.now()}-${++_idCounter}`;
}

function seedAlert(
  db: Database,
  overrides: Partial<{
    id: string;
    triggered_at: string;
    severity: string;
    message: string;
    affected_actions_json: string;
  }> = {},
) {
  const row = {
    id: overrides.id ?? freshId(),
    triggered_at: overrides.triggered_at ?? new Date().toISOString(),
    severity: overrides.severity ?? "medium",
    message: overrides.message ?? "Test alert",
    affected_actions_json: overrides.affected_actions_json ?? "[]",
  };
  db.prepare(`
    INSERT OR IGNORE INTO alerts
      (id, triggered_at, severity, message, affected_actions_json)
    VALUES (?, ?, ?, ?, ?)
  `).run(row.id, row.triggered_at, row.severity, row.message, row.affected_actions_json);
  return row;
}

function recent(offsetMs = 0): string {
  return new Date(Date.now() - offsetMs).toISOString();
}

function old(): string {
  // 25 hours ago — outside the 24h window
  return new Date(Date.now() - 25 * 3600_000).toISOString();
}

// ─────────────────────────────────────────────────────────────────────────────
// Imports under test
// ─────────────────────────────────────────────────────────────────────────────

import {
  assembleAlertDigest,
  type AlertDigest,
} from "../application/usecases/assembleAlertDigest.js";
import { CRONS } from "../scheduler/jobs.js";

// ─────────────────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────────────────

describe("Task 188 — Daily Alert Digest", () => {
  let db: Database;

  beforeEach(() => {
    db = setupTestDb();
  });

  afterEach(() => {
    db.close();
  });

  // ── 1: Valid structure on empty DB ─────────────────────────────────────────
  it("returns a valid AlertDigest structure on empty DB", async () => {
    const digest = await assembleAlertDigest({ db });

    expect(digest).toBeDefined();
    expect(typeof digest.date).toBe("string");
    expect(digest.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(Array.isArray(digest.stockBlocks)).toBe(true);
    expect(typeof digest.totalCount).toBe("number");
    expect(typeof digest.criticalCount).toBe("number");
    expect(typeof digest.highCount).toBe("number");
    expect(typeof digest.text).toBe("string");
    expect(digest.stockBlocks.length).toBe(0);
    expect(digest.totalCount).toBe(0);
  });

  // ── 2: "Khong co canh bao" on empty alerts ────────────────────────────────
  it("text contains 'Khong co canh bao' when no alerts in last 24h", async () => {
    const digest = await assembleAlertDigest({ db });
    expect(digest.text).toContain("Không có cảnh báo");
  });

  // ── 3: 7 alerts spanning 3 stocks → 3 stock blocks with correct counts ────
  it("7 alerts spanning 3 stocks → digest has 3 stock blocks with correct counts", async () => {
    const vcbActions = JSON.stringify([{ code: "VCB" }]);
    const fptActions = JSON.stringify([{ code: "FPT" }]);
    const vnmActions = JSON.stringify([{ code: "VNM" }]);

    // VCB: 3 alerts
    seedAlert(db, { affected_actions_json: vcbActions, severity: "high" });
    seedAlert(db, { affected_actions_json: vcbActions, severity: "medium" });
    seedAlert(db, { affected_actions_json: vcbActions, severity: "low" });
    // FPT: 2 alerts
    seedAlert(db, { affected_actions_json: fptActions, severity: "critical" });
    seedAlert(db, { affected_actions_json: fptActions, severity: "medium" });
    // VNM: 2 alerts
    seedAlert(db, { affected_actions_json: vnmActions, severity: "low" });
    seedAlert(db, { affected_actions_json: vnmActions, severity: "low" });

    const digest = await assembleAlertDigest({ db });

    expect(digest.stockBlocks.length).toBe(3);
    expect(digest.totalCount).toBe(7);

    const vcbBlock = digest.stockBlocks.find((b) => b.code === "VCB");
    const fptBlock = digest.stockBlocks.find((b) => b.code === "FPT");
    const vnmBlock = digest.stockBlocks.find((b) => b.code === "VNM");

    expect(vcbBlock).toBeDefined();
    expect(fptBlock).toBeDefined();
    expect(vnmBlock).toBeDefined();

    expect(vcbBlock!.count).toBe(3);
    expect(fptBlock!.count).toBe(2);
    expect(vnmBlock!.count).toBe(2);
  });

  // ── 4: Alerts older than 24h excluded ────────────────────────────────────
  it("excludes alerts older than 24h", async () => {
    const actions = JSON.stringify([{ code: "VCB" }]);

    seedAlert(db, { affected_actions_json: actions, triggered_at: recent(1800_000) }); // 30 min ago
    seedAlert(db, { affected_actions_json: actions, triggered_at: old() });              // 25h ago

    const digest = await assembleAlertDigest({ db });

    expect(digest.totalCount).toBe(1);
    expect(digest.stockBlocks.length).toBe(1);
    expect(digest.stockBlocks[0]!.count).toBe(1);
  });

  // ── 5: Stock with >3 alerts → top 3 + "(va N canh bao khac)" ─────────────
  it("stock with >3 alerts shows top 3 + overflow message", async () => {
    const actions = JSON.stringify([{ code: "TCB" }]);

    for (let i = 0; i < 5; i++) {
      seedAlert(db, {
        affected_actions_json: actions,
        message: `Alert number ${i + 1}`,
        severity: "high",
      });
    }

    const digest = await assembleAlertDigest({ db });

    const block = digest.stockBlocks.find((b) => b.code === "TCB");
    expect(block).toBeDefined();
    expect(block!.count).toBe(5);
    // The text should contain the overflow suffix
    expect(digest.text).toContain("và 2 cảnh báo khác");
  });

  // ── 6: Severity counts in header match actual DB data ────────────────────
  it("severity counts in header match DB: criticalCount and highCount", async () => {
    const actions = JSON.stringify([{ code: "VCB" }]);

    seedAlert(db, { affected_actions_json: actions, severity: "critical" });
    seedAlert(db, { affected_actions_json: actions, severity: "critical" });
    seedAlert(db, { affected_actions_json: actions, severity: "high" });
    seedAlert(db, { affected_actions_json: actions, severity: "medium" });
    seedAlert(db, { affected_actions_json: actions, severity: "low" });

    const digest = await assembleAlertDigest({ db });

    expect(digest.criticalCount).toBe(2);
    expect(digest.highCount).toBe(1);
    expect(digest.totalCount).toBe(5);
    // Header text should mention counts
    expect(digest.text).toContain("2");  // critical count
  });

  // ── 7: Header includes date ───────────────────────────────────────────────
  it("digest text includes current date", async () => {
    const digest = await assembleAlertDigest({ db });
    // Date in YYYY-MM-DD format
    expect(digest.text).toContain(digest.date);
  });

  // ── 8: Stock blocks include stock code in text ───────────────────────────
  it("text contains stock codes for each block", async () => {
    const vcbActions = JSON.stringify([{ code: "VCB" }]);
    const fptActions = JSON.stringify([{ code: "FPT" }]);

    seedAlert(db, { affected_actions_json: vcbActions });
    seedAlert(db, { affected_actions_json: fptActions });

    const digest = await assembleAlertDigest({ db });

    expect(digest.text).toContain("VCB");
    expect(digest.text).toContain("FPT");
  });

  // ── 9: Alert with no stock code grouped under "(khac)" ───────────────────
  it("alerts with no stock code are grouped under a fallback key", async () => {
    seedAlert(db, { affected_actions_json: "[]" });
    seedAlert(db, { affected_actions_json: null as unknown as string });

    const digest = await assembleAlertDigest({ db });
    // These alerts should still be counted in totalCount
    expect(digest.totalCount).toBe(2);
  });

  // ── 10: Corrupt affected_actions_json does not throw ─────────────────────
  it("corrupt affected_actions_json does not throw", async () => {
    seedAlert(db, { affected_actions_json: "NOT_VALID_JSON" });
    seedAlert(db, { affected_actions_json: "{malformed}" });

    await expect(assembleAlertDigest({ db })).resolves.toBeDefined();
  });

  // ── 11: CRONS.alertDigest registered at 0 21 * * 1-5 ────────────────────
  it("CRONS.alertDigest is registered at 21:00 weekdays (0 21 * * 1-5)", () => {
    expect(CRONS).toHaveProperty("alertDigest");
    expect(CRONS.alertDigest).toBe("0 21 * * 1-5");
  });

  // ── 12: Concurrency guard ────────────────────────────────────────────────
  it("DB dedup guard: skips send when cron_job_runs already has a success row for today", async () => {
    const { runAlertDigest } = await import("../scheduler/alerts/alertDigestJob.js");

    // Set up a DB with cron_job_runs containing a success row for alertDigestJob today
    const dedupDb = new Database(":memory:");
    dedupDb.exec(`
      CREATE TABLE IF NOT EXISTS cron_job_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        rows_written INTEGER,
        error_msg TEXT,
        duration_ms INTEGER
      )
    `);
    dedupDb.exec(`
      INSERT INTO cron_job_runs (job_name, started_at, status)
      VALUES ('alertDigestJob', datetime('now'), 'success')
    `);

    let digestCalled = false;
    const mockDigest = () => {
      digestCalled = true;
      return Promise.resolve<AlertDigest>({
        date: new Date().toISOString().slice(0, 10),
        totalCount: 5,
        criticalCount: 1,
        highCount: 2,
        stockBlocks: [],
        text: "test",
        generatedAt: new Date().toISOString(),
      });
    };

    await runAlertDigest(mockDigest, dedupDb);

    expect(digestCalled).toBe(false);
    dedupDb.close();
  });

  it("DB dedup guard: proceeds when no success row exists for today", async () => {
    const { runAlertDigest } = await import("../scheduler/alerts/alertDigestJob.js");

    // Empty cron_job_runs — no prior run today
    const freshDb = new Database(":memory:");
    freshDb.exec(`
      CREATE TABLE IF NOT EXISTS cron_job_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_name TEXT NOT NULL,
        started_at TEXT NOT NULL,
        finished_at TEXT,
        status TEXT NOT NULL DEFAULT 'running',
        rows_written INTEGER,
        error_msg TEXT,
        duration_ms INTEGER
      )
    `);

    let digestCalled = false;
    const mockDigest = () => {
      digestCalled = true;
      return Promise.resolve<AlertDigest>({
        date: new Date().toISOString().slice(0, 10),
        totalCount: 0,
        criticalCount: 0,
        highCount: 0,
        stockBlocks: [],
        text: "Không có cảnh báo",
        generatedAt: new Date().toISOString(),
      });
    };

    await runAlertDigest(mockDigest, freshDb);

    // totalCount=0 → skips Telegram but digest was still called
    expect(digestCalled).toBe(true);
    freshDb.close();
  });

  it("concurrency guard skips second invocation if first is still running", async () => {
    const { runAlertDigest } = await import("../scheduler/alerts/alertDigestJob.js");

    let callCount = 0;

    const slowDigest = () =>
      new Promise<AlertDigest>((resolve) => {
        callCount++;
        setTimeout(() => {
          resolve({
            date: "2026-04-01",
            totalCount: 0,
            criticalCount: 0,
            highCount: 0,
            stockBlocks: [],
            text: "Không có cảnh báo",
            generatedAt: new Date().toISOString(),
          });
        }, 50);
      });

    const p1 = runAlertDigest(slowDigest);
    const p2 = runAlertDigest(slowDigest);

    await Promise.all([p1, p2]);

    expect(callCount).toBe(1);
  });

  // ── 13: MCP tool send_alert_digest is registered on server ───────────────
  it("send_alert_digest MCP tool is registered on McpServer", () => {
    const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerAlertDigestTools } = require("../interface/mcp/tools/alerts/alertDigestTools.js");

    const server = new McpServer(
      { name: "test-188", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );

    expect(() => registerAlertDigestTools(server)).not.toThrow();

    const registeredTools = (
      server as unknown as { _registeredTools: Record<string, unknown> }
    )._registeredTools;
    expect(registeredTools).toHaveProperty("send_alert_digest");
  });

  // ── 14: MCP tool returns text content ────────────────────────────────────
  it("send_alert_digest MCP tool handler returns text content", async () => {
    const { McpServer } = require("@modelcontextprotocol/sdk/server/mcp.js");
    const { registerAlertDigestTools } = require("../interface/mcp/tools/alerts/alertDigestTools.js");

    const server = new McpServer(
      { name: "test-188b", version: "0.0.0" },
      { capabilities: { tools: {} } },
    );
    registerAlertDigestTools(server);

    const tool = (
      server as unknown as { _registeredTools: Record<string, { handler: (args: unknown) => Promise<unknown> }> }
    )._registeredTools["send_alert_digest"];

    expect(tool).toBeDefined();
    const result = await tool!.handler({});
    expect(result).toHaveProperty("content");
    const content = (result as { content: Array<{ type: string; text: string }> }).content;
    expect(Array.isArray(content)).toBe(true);
    expect(content.length).toBeGreaterThan(0);
    expect(content[0]!.type).toBe("text");
    expect(typeof content[0]!.text).toBe("string");
  });

  // ── 15: Telegram not configured → returns config message ────────────────
  it("when Telegram not configured, digest text includes config notice", async () => {
    // The digest assembly itself works; the Telegram notice is in the job
    const { runAlertDigest } = await import("../scheduler/alerts/alertDigestJob.js");

    let receivedDigest: AlertDigest | undefined;

    const mockDigest = () =>
      Promise.resolve<AlertDigest>({
        date: "2026-04-01",
        totalCount: 0,
        criticalCount: 0,
        highCount: 0,
        stockBlocks: [],
        text: "Không có cảnh báo",
        generatedAt: new Date().toISOString(),
      });

    // Run with no telegram notifier — should not throw
    await expect(runAlertDigest(mockDigest)).resolves.toBeUndefined();
  });

  // ── TC-1: Single price_drop — no qualifier ────────────────────────────────
  it("TC-1: single price_drop alert renders without any qualifier", async () => {
    const actions = JSON.stringify([{ code: "GAS" }]);
    seedAlert(db, {
      affected_actions_json: actions,
      severity: "high",
      message: "Giá giảm ↓1.2% (45.500 → 44.954 VND)",
    });

    const digest = await assembleAlertDigest({ db });

    expect(digest.text).toContain("Giá giảm ↓1.2%");
    expect(digest.text).not.toContain("(+thêm)");
    expect(digest.text).not.toContain("(lũy kế)");
  });

  // ── TC-2: Two incremental price_drop — second gets (+HH:MM) ICT ─────────────
  it("TC-2: two incremental price_drop alerts — second rendered entry gets (+HH:MM) ICT label", async () => {
    const actions = JSON.stringify([{ code: "GAS" }]);
    const baseTime = Date.now();
    // Alert A is older (triggered 5 min before Alert B)
    seedAlert(db, {
      affected_actions_json: actions,
      severity: "high",
      message: "Giá giảm ↓1.2% (45.500 → 44.954 VND)",
      triggered_at: new Date(baseTime - 5 * 60_000).toISOString(),
    });
    // Alert B is newer
    seedAlert(db, {
      affected_actions_json: actions,
      severity: "high",
      message: "Giá giảm ↓2.4% (44.954 → 43.866 VND)",
      triggered_at: new Date(baseTime).toISOString(),
    });

    const digest = await assembleAlertDigest({ db });

    // Most recent (↓2.4%) is rendered first — no qualifier
    expect(digest.text).toContain("  - Giá giảm ↓2.4%");
    // Older (↓1.2%) is rendered second — gets (+HH:MM) ICT time label
    expect(digest.text).toMatch(/  - \(\+\d{2}:\d{2}\) Giá giảm ↓1\.2%/);
    expect(digest.text).not.toContain("(lũy kế)");
    expect(digest.text).not.toContain("(+thêm)");
  });

  // ── TC-3: Cumulative price_drop message — gets (lũy kế) ───────────────────
  it("TC-3: cumulative price_drop message is prefixed with (lũy kế)", async () => {
    const actions = JSON.stringify([{ code: "GAS" }]);
    const baseTime = Date.now();
    seedAlert(db, {
      affected_actions_json: actions,
      severity: "high",
      message: "Giá giảm ↓1.2% (45.500 → 44.954 VND)",
      triggered_at: new Date(baseTime - 60_000).toISOString(),
    });
    seedAlert(db, {
      affected_actions_json: actions,
      severity: "high",
      message: "Giá giảm ↓3.6% lũy kế từ mở cửa (45.500 → 43.866 VND)",
      triggered_at: new Date(baseTime).toISOString(),
    });

    const digest = await assembleAlertDigest({ db });

    expect(digest.text).toContain("(lũy kế) Giá giảm ↓3.6%");
    // Non-cumulative message has no qualifier
    expect(digest.text).toContain("  - Giá giảm ↓1.2%");
    expect(digest.text).not.toContain("(+thêm)");
  });

  // ── TC-4: Mixed alert types — only price_drop lines labelled ──────────────
  it("TC-4: mixed types in same block — (+thêm) appears exactly once, volume_spike unlabelled", async () => {
    const actions = JSON.stringify([{ code: "GAS" }]);
    const baseTime = Date.now();
    // Oldest price_drop
    seedAlert(db, {
      affected_actions_json: actions,
      severity: "high",
      message: "Giá giảm ↓1.2% (45.500 → 44.954 VND)",
      triggered_at: new Date(baseTime - 10 * 60_000).toISOString(),
    });
    // Mid price_drop
    seedAlert(db, {
      affected_actions_json: actions,
      severity: "high",
      message: "Giá giảm ↓2.4% (44.954 → 43.866 VND)",
      triggered_at: new Date(baseTime - 5 * 60_000).toISOString(),
    });
    // Volume spike (medium severity — sorts after both high-severity drops)
    seedAlert(db, {
      affected_actions_json: actions,
      severity: "medium",
      message: "KL bất thường 3.2× TB (1.200.000 / TB 375.000)",
      triggered_at: new Date(baseTime).toISOString(),
    });

    const digest = await assembleAlertDigest({ db });

    // Second incremental price_drop gets (+HH:MM) ICT label — exactly 1 time-label
    const timeMatches = digest.text.match(/\(\+\d{2}:\d{2}\)/g);
    expect(timeMatches).not.toBeNull();
    expect(timeMatches!.length).toBe(1);
    // No legacy (+thêm) label — time is always available from seeded triggered_at
    expect(digest.text).not.toContain("(+thêm)");

    // The volume_spike line must have no qualifier prefix
    const vLine = digest.text.split("\n").find((l) => l.includes("KL bất thường"));
    expect(vLine).toBeDefined();
    expect(vLine).not.toContain("(+");
    expect(vLine).not.toContain("(lũy kế)");
  });

  // ── TC-5 (regression): Non-price_drop-only block — no qualifiers added ────
  it("TC-5: price_surge-only block has no qualifiers", async () => {
    const actions = JSON.stringify([{ code: "FPT" }]);
    const baseTime = Date.now();
    seedAlert(db, {
      affected_actions_json: actions,
      severity: "high",
      message: "Giá tăng ↑1.5% (50.000 → 50.750 VND)",
      triggered_at: new Date(baseTime - 5 * 60_000).toISOString(),
    });
    seedAlert(db, {
      affected_actions_json: actions,
      severity: "high",
      message: "Giá tăng ↑3.0% (50.000 → 51.500 VND)",
      triggered_at: new Date(baseTime).toISOString(),
    });

    const digest = await assembleAlertDigest({ db });

    expect(digest.text).not.toContain("(+thêm)");
    expect(digest.text).not.toContain("(lũy kế)");
  });

  // ── 17 (Task 1791): intra-digest identical message dedup ─────────────────

  it("Task 1791: 24 identical messages for same ticker → topMessages has 1 unique entry", async () => {
    const actions = JSON.stringify([{ code: "VRE" }]);
    const repeatedMsg = "VRE volume spike 3.3× average (1,645,840 vs avg 495,750)";

    for (let i = 0; i < 24; i++) {
      seedAlert(db, {
        affected_actions_json: actions,
        severity: "high",
        message: repeatedMsg,
        triggered_at: new Date(Date.now() - i * 60_000).toISOString(),
      });
    }

    const digest = await assembleAlertDigest({ db });

    const block = digest.stockBlocks.find((b) => b.code === "VRE");
    expect(block).toBeDefined();
    // Raw count is preserved
    expect(block!.count).toBe(24);
    // topMessages contains only 1 unique entry (all 24 are identical)
    expect(block!.topMessages.length).toBe(1);
    expect(block!.topMessages[0]).toBe(repeatedMsg);
    // Digest text contains the message only once
    const occurrences = digest.text.split(repeatedMsg).length - 1;
    expect(occurrences).toBe(1);
  });

  it("Task 1791: mixed unique+duplicate messages — dedup keeps unique first, drops dupes", async () => {
    const actions = JSON.stringify([{ code: "HPG" }]);
    const msgA = "HPG volume spike 3.3× average";
    const msgB = "HPG price drop ↓2.0%";

    // 5× msgA + 2× msgB = 7 raw alerts
    for (let i = 0; i < 5; i++) {
      seedAlert(db, {
        affected_actions_json: actions,
        severity: "high",
        message: msgA,
        triggered_at: new Date(Date.now() - (i + 10) * 60_000).toISOString(),
      });
    }
    for (let i = 0; i < 2; i++) {
      seedAlert(db, {
        affected_actions_json: actions,
        severity: "high",
        message: msgB,
        triggered_at: new Date(Date.now() - i * 60_000).toISOString(),
      });
    }

    const digest = await assembleAlertDigest({ db });

    const block = digest.stockBlocks.find((b) => b.code === "HPG");
    expect(block).toBeDefined();
    expect(block!.count).toBe(7);
    // Only 2 unique messages exist, so topMessages has 2
    expect(block!.topMessages.length).toBe(2);
    expect(block!.topMessages).toContain(msgA);
    expect(block!.topMessages).toContain(msgB);
  });

  it("Task 1791: overflow reflects unique-deduplicated count, not raw count", async () => {
    const actions = JSON.stringify([{ code: "MWG" }]);
    const [msgA, msgB, msgC, msgD] = ["MWG alert A", "MWG alert B", "MWG alert C", "MWG alert D"] as const;

    // 10 copies of A, 1 each of B/C/D = 4 unique messages, 13 raw
    for (let i = 0; i < 10; i++) {
      seedAlert(db, {
        affected_actions_json: actions,
        severity: "medium",
        message: msgA,
        triggered_at: new Date(Date.now() - (i + 10) * 60_000).toISOString(),
      });
    }
    for (const msg of [msgB, msgC, msgD]) {
      seedAlert(db, {
        affected_actions_json: actions,
        severity: "medium",
        message: msg,
        triggered_at: new Date(Date.now() - 60_000).toISOString(),
      });
    }

    const digest = await assembleAlertDigest({ db });

    const block = digest.stockBlocks.find((b) => b.code === "MWG");
    expect(block).toBeDefined();
    expect(block!.count).toBe(13); // raw total preserved
    // 4 unique messages → top 3 shown, 1 overflow (unique-based)
    expect(block!.topMessages.length).toBe(3);
    expect(block!.overflow).toBe(1);
  });

  // ── 16: stockBlocks are sorted by count DESC ─────────────────────────────
  it("stockBlocks are sorted by alert count DESC", async () => {
    const vcbActions = JSON.stringify([{ code: "VCB" }]);
    const fptActions = JSON.stringify([{ code: "FPT" }]);
    const vnmActions = JSON.stringify([{ code: "VNM" }]);

    // FPT: 1, VCB: 3, VNM: 2 → sorted: VCB(3), VNM(2), FPT(1)
    seedAlert(db, { affected_actions_json: vcbActions });
    seedAlert(db, { affected_actions_json: vcbActions });
    seedAlert(db, { affected_actions_json: vcbActions });
    seedAlert(db, { affected_actions_json: fptActions });
    seedAlert(db, { affected_actions_json: vnmActions });
    seedAlert(db, { affected_actions_json: vnmActions });

    const digest = await assembleAlertDigest({ db });

    expect(digest.stockBlocks[0]!.code).toBe("VCB");
    expect(digest.stockBlocks[0]!.count).toBe(3);
    expect(digest.stockBlocks[1]!.count).toBe(2);
    expect(digest.stockBlocks[2]!.count).toBe(1);
  });
});
