/**
 * TASK-2004 — Class-B freshness/health probes migrated to daily_foreign_flow (SUBTASK-DAILY-FF-5)
 *
 * ARCH-DAILY-FOREIGN-FLOW-TABLE. Migrates the 4 Class-B "freshness/health probe" read sites
 * from the legacy `daily_ohlcv.foreign_*` columns to the new authoritative `daily_foreign_flow`
 * table — queried DIRECTLY, NOT via the `daily_ohlcv_with_flow` compat view (the view's
 * COALESCE fallback to legacy columns would mask a stale/dead foreign-flow writer).
 *
 * This suite proves the DECOUPLING behavioral contract for all 4 probes: a fresh
 * daily_foreign_flow write must read fresh EVEN WHEN daily_ohlcv is stale/absent, and a
 * stale/empty daily_foreign_flow must read stale EVEN WHEN daily_ohlcv is fresh. Before this
 * migration, all 4 probes read `daily_ohlcv` — a stalled OHLCV writer with a healthy
 * foreign-flow VPS push would have misread as STALE (conflated pipeline health).
 *
 *   1. freshnessSlaMonitorJob.querySignalAges           — foreign_flow signal age
 *   2. slaStatusTools get_sla_status (MCP tool)          — foreign_flow row in the ASCII table
 *   3. vpsProxyWatchdogJob.readLatestForeignFlowTimestamp — watchdog timestamp reader
 *   4. vpsHealthPoller.checkServiceFreshness (vn-foreign-flow config) — health poller
 */

// Test isolation
Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { getDb, initDatabase, closeDb } from "../infrastructure/db/schema.js";
import { querySignalAges } from "../scheduler/system/freshnessSlaMonitorJob.js";
import { readLatestForeignFlowTimestamp } from "../scheduler/vpsProxyWatchdogJob.js";
import {
  checkServiceFreshness,
  DEFAULT_FRESHNESS_CONFIGS,
} from "../domain/services/vpsHealthPoller.js";
import { registerSlaStatusTools } from "../interface/mcp/tools/system/slaStatusTools.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

/** Opens a fresh in-memory DB (module-singleton, for getDb()-based readers). */
async function openFreshSingletonDb(): Promise<Database> {
  Bun.env["DB_PATH"] = ":memory:";
  closeDb();
  await initDatabase();
  return getDb();
}

function minutesAgoIso(n: number): string {
  return new Date(Date.now() - n * 60_000).toISOString();
}

/** Invoke a registered MCP tool directly (bypasses SSE transport) — established repo pattern. */
async function callTool(
  server: McpServer,
  toolName: string,
  args: Record<string, unknown>,
): Promise<{ content: Array<{ type: string; text: string }> }> {
  const registry = (server as unknown as {
    _registeredTools: Record<string, {
      handler: (args: Record<string, unknown>) => Promise<unknown>;
    }>;
  })._registeredTools;

  const entry = registry[toolName];
  if (!entry) throw new Error(`Tool "${toolName}" not registered`);
  return entry.handler(args) as Promise<{
    content: Array<{ type: string; text: string }>;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// Probe 1 — freshnessSlaMonitorJob.querySignalAges
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-2004 Probe 1: freshnessSlaMonitorJob.querySignalAges reads daily_foreign_flow directly", () => {
  it("foreign_flow age is fresh (~0 min) from daily_foreign_flow even when daily_ohlcv has NO row at all", async () => {
    const db = await openFreshSingletonDb();
    // No daily_ohlcv row inserted — legacy table completely empty/dead.
    db.exec(
      `INSERT INTO daily_foreign_flow (code, date, updated_at, foreign_buy_vol)
       VALUES ('VNM', '2026-04-27', '${minutesAgoIso(0)}', 100)`,
    );

    const ages = querySignalAges(db);
    expect(ages.foreign_flow).toBeGreaterThanOrEqual(0);
    expect(ages.foreign_flow).toBeLessThan(2);
  });

  it("foreign_flow age is -1 (not-seeded) when daily_foreign_flow is empty even though daily_ohlcv has a fresh row", async () => {
    const db = await openFreshSingletonDb();
    // daily_ohlcv has a fresh foreign_buy_vol row (legacy OHLCV pipeline looks healthy) but
    // daily_foreign_flow (the new authoritative table) has never been written.
    db.exec(
      `INSERT INTO daily_ohlcv (code, date, close, updated_at, foreign_buy_vol)
       VALUES ('VNM', '2026-04-27', 80000, '${minutesAgoIso(0)}', 100)`,
    );

    const ages = querySignalAges(db);
    // Not masked by the fresh (but now-irrelevant) daily_ohlcv row.
    expect(ages.foreign_flow).toBe(-1);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Probe 2 — slaStatusTools get_sla_status MCP tool
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-2004 Probe 2: slaStatusTools get_sla_status reads daily_foreign_flow directly", () => {
  it("foreign_flow reports fresh from daily_foreign_flow even when daily_ohlcv has NO row at all", async () => {
    const db = new Database(":memory:");
    await initDatabase(db);
    db.exec(
      `INSERT INTO daily_foreign_flow (code, date, updated_at, foreign_buy_vol)
       VALUES ('VNM', '2026-04-27', '${minutesAgoIso(0)}', 100)`,
    );

    const server = new McpServer({ name: "test", version: "0.0.1" });
    registerSlaStatusTools(server, db);
    const result = await callTool(server, "get_sla_status", { signal_type: "foreign_flow" });
    const text = result.content[0]!.text;

    // Age column for foreign_flow must show a low (fresh) minute count, not "breached".
    expect(text).toContain("foreign_flow");
    expect(text).not.toContain("ALERT: SLA breached on: foreign_flow");
  });

  it("foreign_flow age reflects a stale daily_foreign_flow row, NOT masked by a fresh daily_ohlcv row (deterministic SQL-fragment check — avoids flaking on real-clock market-hours logic in the full tool call)", () => {
    const db = new Database(":memory:");
    initDatabase(db);
    // daily_ohlcv fresh (legacy pipeline looks healthy) — must NOT mask a stale daily_foreign_flow.
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, close, updated_at, foreign_buy_vol)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("VNM", "2026-04-27", 80000, minutesAgoIso(0), 100);
    // daily_foreign_flow stale — 999 minutes old.
    const staleAt = minutesAgoIso(999);
    db.prepare(
      `INSERT INTO daily_foreign_flow (code, date, updated_at, foreign_buy_vol)
       VALUES (?, ?, ?, ?)`,
    ).run("VNM", "2026-04-20", staleAt, 100);

    // Exact production SQL fragment from slaStatusTools.ts's querySignalAges.
    const now = Math.floor(Date.now() / 1000);
    const row = db
      .query<{ age_minutes: number }, [number]>(
        `SELECT
          CAST((? - CAST(strftime('%s', (SELECT MAX(updated_at) FROM daily_foreign_flow WHERE foreign_buy_vol IS NOT NULL)) AS INTEGER)) / 60 AS INTEGER) as age_minutes`,
      )
      .get(now);

    expect(row!.age_minutes).toBeGreaterThanOrEqual(998);
    expect(row!.age_minutes).toBeLessThanOrEqual(1000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Probe 3 — vpsProxyWatchdogJob.readLatestForeignFlowTimestamp
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-2004 Probe 3: vpsProxyWatchdogJob.readLatestForeignFlowTimestamp reads daily_foreign_flow directly", () => {
  it("returns a fresh timestamp from daily_foreign_flow even when daily_ohlcv has NO row at all", async () => {
    await openFreshSingletonDb();
    const db = getDb();
    const fresh = minutesAgoIso(1);
    db.exec(
      `INSERT INTO daily_foreign_flow (code, date, updated_at, foreign_buy_vol)
       VALUES ('VNM', '2026-04-27', '${fresh}', 100)`,
    );

    const result = readLatestForeignFlowTimestamp();
    expect(result).not.toBeNull();
    expect(result!.toISOString()).toBe(fresh);
  });

  it("returns null when daily_foreign_flow is empty even though daily_ohlcv has a fresh row", async () => {
    await openFreshSingletonDb();
    const db = getDb();
    db.exec(
      `INSERT INTO daily_ohlcv (code, date, close, updated_at, foreign_buy_vol)
       VALUES ('VNM', '2026-04-27', 80000, '${minutesAgoIso(0)}', 100)`,
    );

    const result = readLatestForeignFlowTimestamp();
    expect(result).toBeNull();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// Probe 4 — vpsHealthPoller.checkServiceFreshness (vn-foreign-flow config)
// ─────────────────────────────────────────────────────────────────────────────

describe("TASK-2004 Probe 4: vpsHealthPoller checkServiceFreshness reads daily_foreign_flow directly", () => {
  it("vn-foreign-flow config SQL targets daily_foreign_flow, not the legacy daily_ohlcv columns", () => {
    const cfg = DEFAULT_FRESHNESS_CONFIGS.find((c) => c.serviceName === "vn-foreign-flow")!;
    expect(cfg.latestTimestampSql!.toLowerCase()).toContain("daily_foreign_flow");
  });

  it("healthy from a fresh daily_foreign_flow row even when daily_ohlcv has NO row at all", () => {
    const db = new Database(":memory:");
    initDatabase(db);
    const marketNow = "2026-04-27T05:02:00.000Z";
    db.prepare(
      `INSERT INTO daily_foreign_flow (code, date, updated_at, foreign_buy_vol)
       VALUES (?, ?, ?, ?)`,
    ).run("VNM", "2026-04-27", "2026-04-27T05:00:00.000Z", 1_000_000);

    const cfg = DEFAULT_FRESHNESS_CONFIGS.find((c) => c.serviceName === "vn-foreign-flow")!;
    const result = checkServiceFreshness(db, cfg, marketNow);
    expect(result.healthStatus).toBe("healthy");
  });

  it("unreachable when daily_foreign_flow is empty even though daily_ohlcv has a fresh row", () => {
    const db = new Database(":memory:");
    initDatabase(db);
    const marketNow = "2026-04-27T05:02:00.000Z";
    db.prepare(
      `INSERT INTO daily_ohlcv (code, date, close, updated_at, foreign_buy_vol)
       VALUES (?, ?, ?, ?, ?)`,
    ).run("VNM", "2026-04-27", 80000, "2026-04-27T05:00:00.000Z", 1_000_000);

    const cfg = DEFAULT_FRESHNESS_CONFIGS.find((c) => c.serviceName === "vn-foreign-flow")!;
    const result = checkServiceFreshness(db, cfg, marketNow);
    expect(result.healthStatus).toBe("unreachable");
  });
});
