/**
 * cronStatusHandler.test.ts — TASK-DASH-CRON-1
 *
 * In-memory SQLite. AC-1/2/3/4/5/6/7 endpoint correctness, AC-8/AC-9 PARITY
 * gate against the live WATCHDOG_MANIFEST (all 16 jobs), AC-23/AC-25
 * no-shared-mutable-state, AC-26 no-fake-data, AC-27 server-side time,
 * AC-29 reason affordance, FR-3.4 503 error handling.
 */

import { describe, it, expect } from "bun:test";
import { Database } from "bun:sqlite";
import { resolve } from "node:path";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  buildCronStatusDto,
  handleGetCronStatus,
} from "../interface/mcp/routes/cronStatusHandler.js";
import { classifyCronLiveness } from "../domain/cron/cronLivenessClassifier.js";
import { CRONS } from "../scheduler/cronConfig.js";
import { WATCHDOG_MANIFEST } from "../scheduler/system/schedulerWatchdogJob.js";
import type { CadenceManifest } from "../application/cron/cronStatusCompute.js";
import type { CronStatusRowB } from "../infrastructure/cron/layerBCronRegistry.js";
import { _resetLayerBCronCacheForTests } from "../infrastructure/cron/layerBCronRegistry.js";

const VALID_STATUSES = new Set(["ON_TIME", "LATE", "MISSED", "STALE", "NEVER_FIRED"]);

// `bun test` runs with cwd = apps/mcp-server; production runs with cwd = project
// root (same cwd-relative-to-project-root assumption as orchestrationHandler.ts /
// getOrchStatePath). handleGetCronStatus's default commandsDir resolution mirrors
// that production assumption, so tests inject the correctly-resolved path via the
// optional commandsDirArg parameter — same pattern as 1977-orchestration-endpoint.test.ts.
const LIVE_CRONS_DIR = resolve(process.cwd(), "..", "..", ".claude", "commands", "crons");

function makeDbWithCronTable(): Database {
  const db = new Database(":memory:");
  db.exec(`
    CREATE TABLE cron_job_runs (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      job_name     TEXT    NOT NULL,
      started_at   TEXT    NOT NULL,
      finished_at  TEXT,
      status       TEXT    NOT NULL DEFAULT 'running',
      rows_written INTEGER,
      error_msg    TEXT,
      duration_ms  INTEGER
    )
  `);
  return db;
}

function isoMsAgo(nowMs: number, ms: number): string {
  return new Date(nowMs - ms).toISOString().replace("T", " ").slice(0, 19);
}

function insertRun(db: Database, jobName: string, startedAtSql: string, status: "success" | "error" = "success"): void {
  db.prepare(`INSERT INTO cron_job_runs (job_name, started_at, status) VALUES (?, ?, ?)`).run(
    jobName,
    startedAtSql,
    status,
  );
}

function makeMockRes(): { res: ServerResponse; getStatus: () => number; getBody: () => string; getHeaders: () => Record<string, string> } {
  let statusCode = 0;
  let body = "";
  let headers: Record<string, string> = {};
  const res = {
    headersSent: false,
    writeHead(code: number, hdrs?: Record<string, string>) {
      statusCode = code;
      headers = hdrs ?? {};
    },
    end(data: string) {
      body = data;
    },
  } as unknown as ServerResponse;
  return { res, getStatus: () => statusCode, getBody: () => body, getHeaders: () => headers };
}

const NO_LAYER_B: CronStatusRowB[] = [];

// ─────────────────────────────────────────────────────────────────────────────
// buildCronStatusDto — pure DTO assembly
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCronStatusDto — endpoint correctness (Group A)", () => {
  it("AC-2 — layer_a has exactly Object.keys(CRONS).length rows", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    const dto = buildCronStatusDto(db, nowMs, CRONS, WATCHDOG_MANIFEST as unknown as CadenceManifest, NO_LAYER_B);
    expect(dto.layer_a).toHaveLength(Object.keys(CRONS).length);
    expect(dto.layer_a_count).toBe(Object.keys(CRONS).length);
  });

  it("AC-3 — every layer_a row has all required fields", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    const dto = buildCronStatusDto(db, nowMs, CRONS, WATCHDOG_MANIFEST as unknown as CadenceManifest, NO_LAYER_B);
    for (const row of dto.layer_a) {
      expect("name" in row).toBe(true);
      expect("layer" in row).toBe(true);
      expect("cron_expr" in row).toBe(true);
      expect("human_schedule" in row).toBe(true);
      expect("expected_last_fire" in row).toBe(true);
      expect("expected_next_fire" in row).toBe(true);
      expect("last_fire" in row).toBe(true);
      expect("last_status" in row).toBe(true);
      expect("status" in row).toBe(true);
      expect("job_name_db" in row).toBe(true);
    }
  });

  it("AC-4 — every layer_a row has layer === 'server'", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    const dto = buildCronStatusDto(db, nowMs, CRONS, WATCHDOG_MANIFEST as unknown as CadenceManifest, NO_LAYER_B);
    for (const row of dto.layer_a) {
      expect(row.layer).toBe("server");
    }
  });

  it("AC-5 — status is always one of the 5 valid enum values", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    const dto = buildCronStatusDto(db, nowMs, CRONS, WATCHDOG_MANIFEST as unknown as CadenceManifest, NO_LAYER_B);
    for (const row of dto.layer_a) {
      expect(VALID_STATUSES.has(row.status)).toBe(true);
    }
  });

  it("AC-6 / AC-26 — empty DB → every row is NEVER_FIRED with last_fire null (no fabricated data)", () => {
    const db = makeDbWithCronTable(); // table exists, zero rows — fresh-container scenario (EC-3)
    const nowMs = Date.now();
    const dto = buildCronStatusDto(db, nowMs, CRONS, WATCHDOG_MANIFEST as unknown as CadenceManifest, NO_LAYER_B);
    for (const row of dto.layer_a) {
      expect(row.status).toBe("NEVER_FIRED");
      expect(row.last_fire).toBeNull();
      expect(row.last_status).toBeNull();
    }
  });

  it("AC-7 / AC-27 — fetched_at is server-side, within 5s of the injected nowMs", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    const dto = buildCronStatusDto(db, nowMs, CRONS, WATCHDOG_MANIFEST as unknown as CadenceManifest, NO_LAYER_B);
    const fetchedAtMs = Date.parse(dto.fetched_at);
    expect(Math.abs(fetchedAtMs - nowMs)).toBeLessThan(5000);
  });

  it("layer_b passthrough — layer_b_count matches injected rows, rows untouched", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    const layerB: CronStatusRowB[] = [
      {
        name: "cron-fixture",
        layer: "cli-session",
        cron_expr: "0 8 * * *",
        human_schedule: "daily 08:00 UTC",
        expected_last_fire: null,
        expected_next_fire: null,
        last_fire: null,
        last_status: null,
        status: "SESSION_SCOPED",
        reason: "Session-scoped: fires only while a live CLI session is active",
      },
    ];
    const dto = buildCronStatusDto(db, nowMs, CRONS, WATCHDOG_MANIFEST as unknown as CadenceManifest, layerB);
    expect(dto.layer_b_count).toBe(1);
    expect(dto.layer_b).toEqual(layerB);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// AC-8 / AC-9 PARITY gate — all 16 WATCHDOG_MANIFEST jobs
// ─────────────────────────────────────────────────────────────────────────────

describe("buildCronStatusDto — PARITY gate (Group B)", () => {
  const manifestEntries = Object.entries(WATCHDOG_MANIFEST);

  it("sanity — exactly 16 WATCHDOG_MANIFEST jobs", () => {
    expect(manifestEntries).toHaveLength(16);
  });

  it("AC-8 — fresh row (age <= cadenceMs) for every manifest job → ON_TIME", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    for (const [jobName] of manifestEntries) {
      insertRun(db, jobName, isoMsAgo(nowMs, 1000)); // 1s ago — always within cadence
    }
    const dto = buildCronStatusDto(db, nowMs, CRONS, WATCHDOG_MANIFEST as unknown as CadenceManifest, NO_LAYER_B);

    for (const [jobName] of manifestEntries) {
      const row = dto.layer_a.find((r) => r.job_name_db === jobName);
      expect(row).toBeDefined();
      expect(row!.status).toBe("ON_TIME");
    }
  });

  it("AC-9 PARITY — stale row (age > cadenceMs × thresholdMultiplier) for every manifest job → MISSED or STALE, NEVER ON_TIME/LATE; cross-checked against classifyCronLiveness directly (no divergence)", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();

    for (const [jobName, entry] of manifestEntries) {
      const staleAgeMs = entry.cadenceMs * entry.thresholdMultiplier + 3_600_000; // 1h past threshold
      insertRun(db, jobName, isoMsAgo(nowMs, staleAgeMs));
    }

    const dto = buildCronStatusDto(db, nowMs, CRONS, WATCHDOG_MANIFEST as unknown as CadenceManifest, NO_LAYER_B);

    for (const [jobName, entry] of manifestEntries) {
      const row = dto.layer_a.find((r) => r.job_name_db === jobName);
      expect(row).toBeDefined();
      expect(["MISSED", "STALE"]).toContain(row!.status);

      // Cross-check: independently classify the same (nowMs, lastFireMs, cadence, threshold)
      // via the domain classifier directly — must agree exactly (AC-9 PARITY, no divergence).
      const staleAgeMs = entry.cadenceMs * entry.thresholdMultiplier + 3_600_000;
      const lastFireMs = nowMs - staleAgeMs;
      // Re-derive lastFireMs from the row's own last_fire (round-tripped through SQLite
      // datetime string truncation) so the comparison uses the exact same input the
      // handler used internally.
      const rowLastFireMs = row!.last_fire ? new Date(row!.last_fire).getTime() : null;
      const independentStatus = classifyCronLiveness(nowMs, rowLastFireMs, entry.cadenceMs, entry.thresholdMultiplier);
      expect(row!.status).toBe(independentStatus);
      void lastFireMs;
    }
  });

  it("AC-10 — age between cadenceMs and cadenceMs × thresholdMultiplier → LATE", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    const [jobName, entry] = manifestEntries[0]!;
    const midAgeMs = entry.cadenceMs + (entry.cadenceMs * entry.thresholdMultiplier - entry.cadenceMs) / 2;
    insertRun(db, jobName, isoMsAgo(nowMs, midAgeMs));

    const dto = buildCronStatusDto(db, nowMs, CRONS, WATCHDOG_MANIFEST as unknown as CadenceManifest, NO_LAYER_B);
    const row = dto.layer_a.find((r) => r.job_name_db === jobName);
    expect(row!.status).toBe("LATE");
  });

  it("AC-11 — age > cadenceMs × 3 → STALE", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    const [jobName, entry] = manifestEntries[0]!;
    insertRun(db, jobName, isoMsAgo(nowMs, entry.cadenceMs * 3 + 3_600_000));

    const dto = buildCronStatusDto(db, nowMs, CRONS, WATCHDOG_MANIFEST as unknown as CadenceManifest, NO_LAYER_B);
    const row = dto.layer_a.find((r) => r.job_name_db === jobName);
    expect(row!.status).toBe("STALE");
  });

  it("AC-29 — reason field is populated for every non-ON_TIME manifest row", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    for (const [jobName, entry] of manifestEntries) {
      insertRun(db, jobName, isoMsAgo(nowMs, entry.cadenceMs * 3 + 3_600_000));
    }
    const dto = buildCronStatusDto(db, nowMs, CRONS, WATCHDOG_MANIFEST as unknown as CadenceManifest, NO_LAYER_B);
    for (const [jobName] of manifestEntries) {
      const row = dto.layer_a.find((r) => r.job_name_db === jobName);
      expect(row!.status).not.toBe("ON_TIME");
      expect(typeof row!.reason).toBe("string");
      expect(row!.reason!.length).toBeGreaterThan(0);
    }
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// handleGetCronStatus — HTTP handler (mock req/res, no live server needed)
// ─────────────────────────────────────────────────────────────────────────────

describe("handleGetCronStatus — HTTP handler", () => {
  it("AC-1 — 200 + application/json Content-Type on success", () => {
    const db = makeDbWithCronTable();
    const { res, getStatus, getBody, getHeaders } = makeMockRes();
    const mockReq = {} as IncomingMessage;

    handleGetCronStatus(mockReq, res, db, new Date(), LIVE_CRONS_DIR);

    expect(getStatus()).toBe(200);
    expect(getHeaders()["Content-Type"]).toBe("application/json");
    const parsed = JSON.parse(getBody()) as { layer_a: unknown[]; layer_b: unknown[]; fetched_at: string };
    expect(Array.isArray(parsed.layer_a)).toBe(true);
    expect(Array.isArray(parsed.layer_b)).toBe(true);
    expect(typeof parsed.fetched_at).toBe("string");
  });

  it("AC-12 — layer_b is populated from the real .claude/commands/crons/ tree (13 live files)", () => {
    const db = makeDbWithCronTable();
    const { res, getBody } = makeMockRes();
    const mockReq = {} as IncomingMessage;

    handleGetCronStatus(mockReq, res, db, new Date(), LIVE_CRONS_DIR);

    const parsed = JSON.parse(getBody()) as { layer_b: Array<{ layer: string; status: string }> };
    expect(parsed.layer_b.length).toBeGreaterThan(0);
    for (const row of parsed.layer_b) {
      expect(row.layer).toBe("cli-session");
      expect(row.status).toBe("SESSION_SCOPED");
    }
  });

  it("FR-3.4 — 503 JSON {error} on unhandled exception (missing cron_job_runs table)", () => {
    const db = new Database(":memory:"); // NO cron_job_runs table created — triggers SQL error
    const { res, getStatus, getBody, getHeaders } = makeMockRes();
    const mockReq = {} as IncomingMessage;

    handleGetCronStatus(mockReq, res, db, new Date(), LIVE_CRONS_DIR);

    expect(getStatus()).toBe(503);
    expect(getHeaders()["Content-Type"]).toBe("application/json");
    const parsed = JSON.parse(getBody()) as { error: string };
    expect(typeof parsed.error).toBe("string");
    expect(parsed.error.length).toBeGreaterThan(0);
  });

  it("AC-25 / NFR-5 — two independent db instances do not share result state", () => {
    const dbA = makeDbWithCronTable();
    const dbB = makeDbWithCronTable();
    const now = new Date();
    // Fresh run for a real manifest job_name, seeded into dbA ONLY.
    insertRun(dbA, "ohlcv-daily-aggregator", isoMsAgo(now.getTime(), 1000));

    const resA = makeMockRes();
    const resB = makeMockRes();
    handleGetCronStatus({} as IncomingMessage, resA.res, dbA, now, LIVE_CRONS_DIR);
    handleGetCronStatus({} as IncomingMessage, resB.res, dbB, now, LIVE_CRONS_DIR);

    expect(resA.getStatus()).toBe(200);
    expect(resB.getStatus()).toBe(200);
    const bodyA = JSON.parse(resA.getBody()) as { layer_a: Array<{ job_name_db: string; status: string }> };
    const bodyB = JSON.parse(resB.getBody()) as { layer_a: Array<{ job_name_db: string; status: string }> };

    const rowA = bodyA.layer_a.find((r) => r.job_name_db === "ohlcv-daily-aggregator");
    const rowB = bodyB.layer_a.find((r) => r.job_name_db === "ohlcv-daily-aggregator");
    expect(rowA?.status).toBe("ON_TIME"); // dbA has the fresh row
    expect(rowB?.status).toBe("NEVER_FIRED"); // dbB never received it — no cross-db leakage
  });

  it("REGRESSION: default commandsDir (zero-arg) with missing .claude/commands/crons → 503 error response (not unhandled throw)", () => {
    // Regression test for TASK-DASH-CRON-1 QA CHANGES_REQUESTED.
    // Production server.ts:2136 calls handleGetCronStatus(req, res, db) with NO
    // commandsDirArg override. In the rebuilt container (WORKDIR=/app), the
    // default resolve(process.cwd(), ".claude", "commands", "crons") points to
    // /app/.claude/commands/crons which does NOT exist without the docker-compose.yml
    // volume mount (DASH-CRON-FIX-SCOPE-1).
    // This test ensures: (1) the missing dir throws ENOENT on getLayerBCronRows,
    // (2) try/catch at line 108 catches it, (3) response is 503 JSON {error}, NOT
    // an unhandled exception that crashes the HTTP server.
    _resetLayerBCronCacheForTests(); // Clear memoization cache so this test reloads
    const db = makeDbWithCronTable();
    const { res, getStatus, getBody, getHeaders } = makeMockRes();
    const mockReq = {} as IncomingMessage;

    // Pass a non-existent directory to simulate the container's state BEFORE the
    // fix is deployed (no volume mount, no .claude/commands/crons at /app/).
    const nonExistentDir = "/nonexistent/fake/path/to/.claude/commands/crons";

    handleGetCronStatus(mockReq, res, db, new Date(), nonExistentDir);

    // Verify: 503, JSON {error} with a message, handler does NOT crash.
    expect(getStatus()).toBe(503);
    expect(getHeaders()["Content-Type"]).toBe("application/json");
    const parsed = JSON.parse(getBody()) as { error: string };
    expect(typeof parsed.error).toBe("string");
    expect(parsed.error.length).toBeGreaterThan(0);
    // Confirm the error mentions the actual missing directory (ENOENT message).
    expect(parsed.error).toContain("ENOENT");
  });
});
