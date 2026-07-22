/**
 * cronStatusCompute.test.ts — TASK-DASH-CRON-1
 *
 * CN-1: 25-pair static reverse-map, normalized-fallback match, honest no-match.
 * (FIX-CRON-WATCHDOG-COVERAGE-2026-07-22: WATCHDOG_MANIFEST grew 16->25; ALL 9
 * new entries got an explicit tier-1 pair — job_name_db memoization is
 * "lifetime of the process" per CRONS key, so a tier-2-only resolution risks
 * permanently caching the tier-3 fallback if the job hasn't fired yet the
 * first time it's resolved. See cronStatusCompute.ts's STATIC_JOB_NAME_MAP
 * comment for the full mechanism.)
 * CN-2: EC-2 restricted-window cadence, EC-4 comma-list cadence (exact 1_800_000ms).
 * R1: memoization contract — static per-key metadata computed once per process.
 */

import { describe, it, expect, beforeEach } from "bun:test";
import { Database } from "bun:sqlite";
import {
  resolveJobNameDb,
  deriveCadenceMs,
  buildLayerARow,
  _staticMetaComputeCountForTests,
  _resetStaticMetaCacheForTests,
  type CadenceManifest,
} from "../application/cron/cronStatusCompute.js";
import { CRONS } from "../scheduler/cronConfig.js";
import { WATCHDOG_MANIFEST, CANONICAL_WATCHDOG_JOB_NAMES } from "../scheduler/system/schedulerWatchdogJob.js";

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

beforeEach(() => {
  _resetStaticMetaCacheForTests();
});

// ─────────────────────────────────────────────────────────────────────────────
// CN-1 — resolveJobNameDb
// ─────────────────────────────────────────────────────────────────────────────

describe("resolveJobNameDb — CN-1 hybrid 3-tier", () => {
  const STATIC_25_PAIRS: ReadonlyArray<[string, string]> = [
    ["ohlcvDailyAggregator", "ohlcv-daily-aggregator"],
    ["vnstockFundamentalsRefresh", "vnstockFundamentalsRefresh"],
    ["reputationCompute", "reputationComputeJob"],
    ["evidenceAccumulator", "evidenceAccumulatorJob"],
    ["morningBriefing", "morningBriefingJob"],
    ["eveningSummary", "eveningSummaryJob"],
    ["franceSummary", "franceSummaryJob"],
    ["foreignFlowAlert", "foreignFlowAlertJob"],
    ["insiderCheck", "insiderCheckJob"],
    ["calibrationReport", "calibrationReportJob"],
    ["baseRateComputation", "baseRateComputationJob"],
    ["predictionResolution", "predictionResolutionJob"],
    ["macroIndicatorRefresh", "macroIndicatorRefreshJob"],
    ["taOhlcvBackfill", "ta-ohlcv-backfill"],
    ["accuracyDigest", "accuracyDigestJob"],
    ["summaryDaily", "summaryJob:daily"],
    // FIX-CRON-WATCHDOG-COVERAGE-2026-07-22 additions (see cronStatusCompute.ts comment
    // for why ALL 9 new manifest jobs need an explicit tier-1 pair, not just the ones
    // tier-2's normalizer literally can't match — job_name_db memoization is cache-unsafe
    // for a tier-2-only resolution):
    ["integrityCheck", "integrityCheckJob"],
    ["bondMaturityPoller", "bondMaturityPollerJob"],
    ["devTeamHeartbeat", "devTeamHeartbeatJob"],
    ["predictionOutcome", "predictionOutcomeJob"],
    ["sscCheck", "sscCheckerJob"],
    ["dataAuditWeekly", "dataAuditJob:weekly"],
    ["signalOutcomeJob", "signalOutcomeJob"],
    ["alertOutcomeJob", "alertOutcomeJob"],
    ["signalOutcomeResolution", "signalOutcomeResolutionJob"],
  ];

  it("all 25 verified manifest pairs resolve via the tier-1 static map (no distinctDbJobNames needed)", () => {
    expect(STATIC_25_PAIRS).toHaveLength(25);
    for (const [cronsKey, expectedJobName] of STATIC_25_PAIRS) {
      expect(resolveJobNameDb(cronsKey, [])).toBe(expectedJobName);
    }
  });

  it("tier-1 map values are exactly CANONICAL_WATCHDOG_JOB_NAMES (25 entries, 1:1)", () => {
    const resolved = STATIC_25_PAIRS.map(([key]) => resolveJobNameDb(key, []));
    expect(resolved.sort()).toEqual([...CANONICAL_WATCHDOG_JOB_NAMES].sort());
  });

  it("tier-2 normalized fallback matches a differently-cased/suffixed DB job_name", () => {
    // cronsKey "cronHealthAlert" is NOT in the static 16-pair map.
    const distinctDbJobNames = ["cronHealthAlertJob"];
    expect(resolveJobNameDb("cronHealthAlert", distinctDbJobNames)).toBe("cronHealthAlertJob");
  });

  it("tier-2 normalized fallback strips separators (-, _, :) and lowercases", () => {
    const distinctDbJobNames = ["disk-usage-alert"];
    expect(resolveJobNameDb("diskUsageAlert", distinctDbJobNames)).toBe("disk-usage-alert");
  });

  it("tier-3 honest fallback — no static or normalized match returns the CRONS key itself", () => {
    const distinctDbJobNames = ["completelyUnrelatedJobName"];
    expect(resolveJobNameDb("someBrandNewCronKey", distinctDbJobNames)).toBe("someBrandNewCronKey");
  });

  it("tier-1 static map takes precedence over any tier-2 normalized match", () => {
    // Even if distinctDbJobNames contains a normalized match for a manifest key,
    // the static table wins (CN-1 rank order).
    const distinctDbJobNames = ["ohlcvdailyaggregator"]; // would normalize-match "ohlcvDailyAggregator"
    expect(resolveJobNameDb("ohlcvDailyAggregator", distinctDbJobNames)).toBe(
      "ohlcv-daily-aggregator",
    );
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// CN-2 — deriveCadenceMs (MIN-of-6-samples)
// ─────────────────────────────────────────────────────────────────────────────

describe("deriveCadenceMs — CN-2 MIN-of-6-samples", () => {
  const NOW = Date.parse("2026-07-03T12:00:00Z"); // Friday

  it("EC-2 — restricted-hour window `*/10 2-8 * * 1-5` → 600_000ms (10 min), not the weekend gap", () => {
    expect(deriveCadenceMs("*/10 2-8 * * 1-5", NOW)).toBe(600_000);
  });

  it("EC-4 — comma-list minutes `15,45 * * * *` → exactly 1_800_000ms (30 min)", () => {
    expect(deriveCadenceMs("15,45 * * * *", NOW)).toBe(1_800_000);
  });

  it("weekday-only daily job `0 8 * * 1-5` → 86_400_000ms (1 day), excluding the Fri→Mon gap", () => {
    const friEvening = Date.parse("2026-07-03T22:00:00Z");
    expect(deriveCadenceMs("0 8 * * 1-5", friEvening)).toBe(86_400_000);
  });

  it("every-15-min unrestricted `*/15 * * * *` → 900_000ms", () => {
    expect(deriveCadenceMs("*/15 * * * *", NOW)).toBe(900_000);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// buildLayerARow — assembly + memoization contract (R1)
// ─────────────────────────────────────────────────────────────────────────────

describe("buildLayerARow — assembly", () => {
  it("uses WATCHDOG_MANIFEST cadence/threshold verbatim for a manifest job (no cron-parser derivation)", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    const startedAt = new Date(nowMs - 3_600_000).toISOString().replace("T", " ").slice(0, 19);
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status) VALUES (?, ?, 'success')`,
    ).run("ohlcv-daily-aggregator", startedAt);

    const row = buildLayerARow({
      cronsKey: "ohlcvDailyAggregator",
      cronExpr: CRONS.ohlcvDailyAggregator,
      nowMs,
      db,
      watchdogManifest: WATCHDOG_MANIFEST as unknown as CadenceManifest,
      distinctDbJobNames: ["ohlcv-daily-aggregator"],
    });

    expect(row.job_name_db).toBe("ohlcv-daily-aggregator");
    expect(row.status).toBe("ON_TIME");
    expect(row.layer).toBe("server");
    expect(row.name).toBe("ohlcvDailyAggregator");
    expect(row.last_fire).not.toBeNull();
  });

  it("row with no cron_job_runs entry → NEVER_FIRED + last_fire null (AC-6/AC-26)", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();

    const row = buildLayerARow({
      cronsKey: "insiderCheck",
      cronExpr: CRONS.insiderCheck,
      nowMs,
      db,
      watchdogManifest: WATCHDOG_MANIFEST as unknown as CadenceManifest,
      distinctDbJobNames: [],
    });

    expect(row.status).toBe("NEVER_FIRED");
    expect(row.last_fire).toBeNull();
    expect(row.last_status).toBeNull();
    expect(typeof row.reason).toBe("string"); // AC-29 non-ON_TIME reason populated
  });

  it("non-manifest job derives cadence via cron-parser and gets default 1.5x threshold", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();

    const row = buildLayerARow({
      cronsKey: "vpsServiceHealth",
      cronExpr: CRONS.vpsServiceHealth, // */5 * * * *
      nowMs,
      db,
      watchdogManifest: {},
      distinctDbJobNames: [],
    });

    expect(row.job_name_db).toBe("vpsServiceHealth"); // tier-3 honest fallback probe
    expect(row.status).toBe("NEVER_FIRED"); // no seeded row
    expect(row.human_schedule).toBe("every 5 min");
  });

  it("reason is NOT populated for ON_TIME rows", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    const startedAt = new Date(nowMs - 60_000).toISOString().replace("T", " ").slice(0, 19);
    db.prepare(
      `INSERT INTO cron_job_runs (job_name, started_at, status) VALUES (?, ?, 'success')`,
    ).run("vpsServiceHealth", startedAt);

    const row = buildLayerARow({
      cronsKey: "vpsServiceHealth",
      cronExpr: CRONS.vpsServiceHealth,
      nowMs,
      db,
      watchdogManifest: {},
      distinctDbJobNames: ["vpsServiceHealth"],
    });

    expect(row.status).toBe("ON_TIME");
    expect(row.reason).toBeUndefined();
  });

  it("memoization (R1) — static meta computed exactly once per CRONS key across multiple calls", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();
    const params = {
      cronsKey: "memoTestKey",
      cronExpr: "*/7 * * * *",
      nowMs,
      db,
      watchdogManifest: {},
      distinctDbJobNames: [],
    };

    expect(_staticMetaComputeCountForTests()).toBe(0);
    const r1 = buildLayerARow(params);
    expect(_staticMetaComputeCountForTests()).toBe(1);
    const r2 = buildLayerARow({ ...params, nowMs: nowMs + 10_000 });
    expect(_staticMetaComputeCountForTests()).toBe(1); // still 1 — cache hit, not recomputed

    expect(r1.human_schedule).toBe(r2.human_schedule);
    expect(r1.job_name_db).toBe(r2.job_name_db);
  });

  it("memoization does not leak across different CRONS keys (each key computed independently)", () => {
    const db = makeDbWithCronTable();
    const nowMs = Date.now();

    buildLayerARow({
      cronsKey: "keyA",
      cronExpr: "*/5 * * * *",
      nowMs,
      db,
      watchdogManifest: {},
      distinctDbJobNames: [],
    });
    expect(_staticMetaComputeCountForTests()).toBe(1);

    buildLayerARow({
      cronsKey: "keyB",
      cronExpr: "*/10 * * * *",
      nowMs,
      db,
      watchdogManifest: {},
      distinctDbJobNames: [],
    });
    expect(_staticMetaComputeCountForTests()).toBe(2);
  });
});
