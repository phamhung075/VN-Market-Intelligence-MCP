/**
 * cronStatusCompute.ts — Application orchestrator for Layer-A cron status rows
 * (DASH-CRON-RECHECK-TABLE Zone 1, TASK-DASH-CRON-1)
 *
 * Owns:
 *   - resolveJobNameDb  — CN-1 hybrid 3-tier CRONS-key → cron_job_runs.job_name resolution
 *   - deriveCadenceMs   — CN-2 MIN-of-6-samples cadence derivation via cron-parser
 *   - buildLayerARow    — resolve → query → classify → assemble one Layer-A row
 *
 * Memoization contract (load-bearing — risk flag R1, architect brief §5):
 *   cadenceMs / thresholdMultiplier / human_schedule / job_name_db are static
 *   per CRONS key for the lifetime of the process. They are computed lazily on
 *   first access into a module-level Map and reused thereafter. Without this,
 *   every 5s dashboard auto-poll tick (CN-4 reuses the existing revalidator)
 *   would re-run the cron-parser N=6-sample derivation for ~69 non-manifest
 *   jobs from scratch on every open dashboard tab — do NOT remove this cache
 *   under time pressure. Only expected_last_fire / expected_next_fire /
 *   last_fire / last_status / status are recomputed per request.
 *
 * Fence-B compliance: this module deliberately does NOT import anything from
 * src/scheduler/ (eslint-plugin-boundaries forbids application → scheduler).
 * `WATCHDOG_MANIFEST` is owned by src/scheduler/system/schedulerWatchdogJob.ts;
 * the interface layer (cronStatusHandler.ts) imports it and passes the values
 * down as a plain `CadenceManifest`-shaped parameter (TS structural typing —
 * WatchdogManifestEntry is a structural superset of CadenceThreshold, so the
 * real WATCHDOG_MANIFEST object is assignable here with zero physical import
 * edge into src/scheduler/).
 *
 * DDD layer: application — imports domain (pure) + infrastructure (DB reads) +
 * the external cron-parser package. No interface/scheduler imports (Fence-B).
 */

import type { Database } from "bun:sqlite";
import { CronExpressionParser } from "cron-parser";
import {
  classifyCronLiveness,
  type CronLivenessStatus,
} from "../../domain/cron/cronLivenessClassifier.js";
import { buildHumanSchedule } from "../../domain/cron/humanScheduleFormatter.js";
import { getLastRunForJob } from "../../infrastructure/db/cronJobRunStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Structural subset of schedulerWatchdogJob.ts's WatchdogManifestEntry —
 * intentionally NOT imported from src/scheduler/ (Fence-B). See file header.
 */
export interface CadenceThreshold {
  cadenceMs: number;
  thresholdMultiplier: number;
}

export type CadenceManifest = Record<string, CadenceThreshold>;

/** FR-1.7 Layer-A row schema, plus the AC-29 `reason` detail-affordance field. */
export interface CronStatusRowA {
  name: string;
  layer: "server";
  cron_expr: string;
  human_schedule: string;
  expected_last_fire: string | null;
  expected_next_fire: string | null;
  last_fire: string | null;
  last_status: string | null;
  status: CronLivenessStatus;
  job_name_db: string;
  /** Populated for non-ON_TIME rows only (AC-29). */
  reason?: string;
}

interface StaticCronMeta {
  cadenceMs: number;
  thresholdMultiplier: number;
  human_schedule: string;
  job_name_db: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// CN-1 tier-1 — verified 25-pair static reverse-map
// (docs/architecture-briefs/2026-07-02-DASH-CRON-RECHECK-TABLE.md §2)
//
// Only 1 of the original 16 pairs is a literal string match. A pure normalize-
// and-strip-"Job" heuristic alone would ALSO silently fail on `summaryDaily` →
// `summaryJob:daily` (the "Job" token sits mid-string, not as a suffix) — this
// is exactly why tier-1 needs an explicit static table rather than relying on
// tier-2's normalizer for every manifest job.
//
// IMPORTANT — why EVERY manifest job needs an explicit tier-1 pair, not just
// the ones tier-2's normalizer literally can't match (FIX-CRON-WATCHDOG-
// COVERAGE-2026-07-22 finding): job_name_db is memoized "per CRONS key for the
// lifetime of the process" (R1, module header). Tier-2 resolution depends on
// `distinctDbJobNames` — a live DB snapshot at the moment of the FIRST call for
// that key. If that first call happens before the job has ever recorded a row
// (e.g. a fresh container, or — in tests — an earlier empty-DB fixture sharing
// the same process), tier-2 falls through to the tier-3 honest fallback (the
// cronsKey itself) and that WRONG value is cached FOREVER, even after the job
// later fires and records its real job_name — the dashboard would show it as
// permanently NEVER_FIRED. Tier-1 is unconditional (independent of
// distinctDbJobNames) and therefore the only cache-safe resolution path. All 9
// jobs added by the 2026-07-22 WATCHDOG_MANIFEST widening (16 -> 25) are listed
// here for that reason, even the ones whose job_name is a trivial `<cronsKey>Job`
// suffix that tier-2 could theoretically have handled.
// ─────────────────────────────────────────────────────────────────────────────

const STATIC_JOB_NAME_MAP: Readonly<Record<string, string>> = {
  ohlcvDailyAggregator: "ohlcv-daily-aggregator",
  vnstockFundamentalsRefresh: "vnstockFundamentalsRefresh",
  reputationCompute: "reputationComputeJob",
  evidenceAccumulator: "evidenceAccumulatorJob",
  morningBriefing: "morningBriefingJob",
  eveningSummary: "eveningSummaryJob",
  franceSummary: "franceSummaryJob",
  foreignFlowAlert: "foreignFlowAlertJob",
  insiderCheck: "insiderCheckJob",
  calibrationReport: "calibrationReportJob",
  baseRateComputation: "baseRateComputationJob",
  predictionResolution: "predictionResolutionJob",
  macroIndicatorRefresh: "macroIndicatorRefreshJob",
  taOhlcvBackfill: "ta-ohlcv-backfill",
  accuracyDigest: "accuracyDigestJob",
  summaryDaily: "summaryJob:daily",
  // ── FIX-CRON-WATCHDOG-COVERAGE-2026-07-22 additions (all 9 new manifest jobs) ──
  integrityCheck: "integrityCheckJob",
  bondMaturityPoller: "bondMaturityPollerJob",
  devTeamHeartbeat: "devTeamHeartbeatJob",
  predictionOutcome: "predictionOutcomeJob",
  sscCheck: "sscCheckerJob",
  dataAuditWeekly: "dataAuditJob:weekly",
  signalOutcomeJob: "signalOutcomeJob",
  alertOutcomeJob: "alertOutcomeJob",
  signalOutcomeResolution: "signalOutcomeResolutionJob",
  // ── ALPHA-S2-SUB5-WATCHDOG-STRETCH addition (2026-07-29) ──
  intraday5mCompactor: "intraday5mCompactorJob",
};

/** Default threshold for Layer-A crons NOT in WATCHDOG_MANIFEST (FR-1.5). */
const DEFAULT_THRESHOLD_MULTIPLIER = 1.5;

/** Samples taken forward from `now` for the CN-2 MIN-of-N-samples cadence algorithm. */
const CADENCE_SAMPLE_COUNT = 6;

/** Fallback cadence when a degenerate expression yields fewer than 2 samples. */
const FALLBACK_CADENCE_MS = 86_400_000;

// ─────────────────────────────────────────────────────────────────────────────
// CN-1 — resolveJobNameDb (3-tier hybrid)
// ─────────────────────────────────────────────────────────────────────────────

function normalizeJobToken(raw: string): string {
  const stripped = raw.replace(/[-_:]/g, "").toLowerCase();
  return stripped.endsWith("job") ? stripped.slice(0, -3) : stripped;
}

/**
 * Resolve a CRONS map key to the job_name string actually recorded in
 * cron_job_runs. Ranked (BA §3, architect CN-1):
 *   1. Static 16-pair reverse-map (WATCHDOG_MANIFEST-covered jobs).
 *   2. Normalized match against a runtime DISTINCT job_name scan.
 *   3. Honest fallback: the CRONS key itself (a permanent non-match renders
 *      NEVER_FIRED — honest, not a bug).
 */
export function resolveJobNameDb(cronsKey: string, distinctDbJobNames: readonly string[]): string {
  const staticMatch = STATIC_JOB_NAME_MAP[cronsKey];
  if (staticMatch) {
    return staticMatch;
  }

  const normalizedKey = normalizeJobToken(cronsKey);
  const match = distinctDbJobNames.find((dbName) => normalizeJobToken(dbName) === normalizedKey);
  if (match) {
    return match;
  }

  return cronsKey;
}

/**
 * Test-only: the REAL keys of the tier-1 STATIC_JOB_NAME_MAP (not a hand-copied
 * list) — FIX-CRON-SSCCHECKERJOB-DEAD-87D class-fix. Lets an invariant test
 * iterate every actual entry a developer adds/edits here directly, so a future
 * addition can never silently skip verification the way a second, manually
 * duplicated key list could (exactly the mechanism that let sscCheckerJob's
 * job_name/CRONS-key divergence hide undetected for ~87 days).
 */
export function _staticJobNameMapKeysForTests(): string[] {
  return Object.keys(STATIC_JOB_NAME_MAP);
}

// ─────────────────────────────────────────────────────────────────────────────
// CN-2 — deriveCadenceMs (MIN-of-6-samples)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Derive cadenceMs for a cron expression as the minimum successive delta
 * across the next N=6 occurrences from `now` (CN-2). One generic algorithm —
 * no per-expression special-casing — correctly handles restricted-hour
 * windows (EC-2), weekday-only jobs, and comma-lists (EC-4) uniformly.
 */
export function deriveCadenceMs(cronExpr: string, nowMs: number): number {
  const interval = CronExpressionParser.parse(cronExpr, {
    currentDate: new Date(nowMs),
    tz: "UTC",
  });
  const dates = interval.take(CADENCE_SAMPLE_COUNT).map((d) => d.getTime());

  let min = Infinity;
  for (let i = 1; i < dates.length; i++) {
    min = Math.min(min, dates[i]! - dates[i - 1]!);
  }

  return Number.isFinite(min) ? min : FALLBACK_CADENCE_MS;
}

/** expected_last_fire / expected_next_fire — server-side clock only (NFR-2). */
function computeExpectedFires(
  cronExpr: string,
  nowMs: number,
): { expected_last_fire: string | null; expected_next_fire: string | null } {
  let expected_last_fire: string | null = null;
  let expected_next_fire: string | null = null;

  try {
    const prevInterval = CronExpressionParser.parse(cronExpr, {
      currentDate: new Date(nowMs),
      tz: "UTC",
    });
    expected_last_fire = prevInterval.prev().toDate().toISOString();
  } catch {
    expected_last_fire = null;
  }

  try {
    const nextInterval = CronExpressionParser.parse(cronExpr, {
      currentDate: new Date(nowMs),
      tz: "UTC",
    });
    expected_next_fire = nextInterval.next().toDate().toISOString();
  } catch {
    expected_next_fire = null;
  }

  return { expected_last_fire, expected_next_fire };
}

// ─────────────────────────────────────────────────────────────────────────────
// Memoization contract — module-level cache, keyed by CRONS key (R1)
// ─────────────────────────────────────────────────────────────────────────────

const staticMetaCache = new Map<string, StaticCronMeta>();
let _computeCount = 0;

function getOrComputeStaticMeta(
  cronsKey: string,
  cronExpr: string,
  watchdogManifest: CadenceManifest,
  distinctDbJobNames: readonly string[],
  nowMs: number,
): StaticCronMeta {
  const cached = staticMetaCache.get(cronsKey);
  if (cached) {
    return cached;
  }

  _computeCount++;

  const jobNameDb = resolveJobNameDb(cronsKey, distinctDbJobNames);
  const manifestEntry = watchdogManifest[jobNameDb];

  const cadenceMs = manifestEntry ? manifestEntry.cadenceMs : deriveCadenceMs(cronExpr, nowMs);
  const thresholdMultiplier = manifestEntry
    ? manifestEntry.thresholdMultiplier
    : DEFAULT_THRESHOLD_MULTIPLIER;

  const meta: StaticCronMeta = {
    cadenceMs,
    thresholdMultiplier,
    human_schedule: buildHumanSchedule(cronExpr),
    job_name_db: jobNameDb,
  };

  staticMetaCache.set(cronsKey, meta);
  return meta;
}

/** Test-only: number of cache-miss (fresh) static-meta computations so far. */
export function _staticMetaComputeCountForTests(): number {
  return _computeCount;
}

/** Test-only: clear the memoized cache + reset the compute counter between test cases. */
export function _resetStaticMetaCacheForTests(): void {
  staticMetaCache.clear();
  _computeCount = 0;
}

// ─────────────────────────────────────────────────────────────────────────────
// AC-29 — reason detail affordance for non-ON_TIME rows
// ─────────────────────────────────────────────────────────────────────────────

function buildReason(
  status: CronLivenessStatus,
  lastStartedAt: string | null,
  cadenceMs: number,
  thresholdMultiplier: number,
  nowMs: number,
): string {
  if (status === "NEVER_FIRED" || lastStartedAt === null) {
    return "Chưa ghi nhận lần chạy nào trong cron_job_runs.";
  }
  const ageMs = nowMs - new Date(lastStartedAt).getTime();
  const ageHours = (ageMs / 3_600_000).toFixed(1);
  const thresholdHours = ((cadenceMs * thresholdMultiplier) / 3_600_000).toFixed(1);
  return `Lần chạy cuối: ${lastStartedAt} — quá hạn ${ageHours}h (ngưỡng: ${thresholdMultiplier}× = ${thresholdHours}h).`;
}

// ─────────────────────────────────────────────────────────────────────────────
// buildLayerARow — orchestrates resolve → query → classify → assemble
// ─────────────────────────────────────────────────────────────────────────────

export interface BuildLayerARowParams {
  cronsKey: string;
  cronExpr: string;
  nowMs: number;
  db: Database;
  watchdogManifest: CadenceManifest;
  distinctDbJobNames: readonly string[];
}

export function buildLayerARow(params: BuildLayerARowParams): CronStatusRowA {
  const { cronsKey, cronExpr, nowMs, db, watchdogManifest, distinctDbJobNames } = params;

  const meta = getOrComputeStaticMeta(cronsKey, cronExpr, watchdogManifest, distinctDbJobNames, nowMs);

  const { last_started_at, last_status } = getLastRunForJob(db, meta.job_name_db);
  const lastFireMs = last_started_at ? new Date(last_started_at).getTime() : null;

  const status = classifyCronLiveness(nowMs, lastFireMs, meta.cadenceMs, meta.thresholdMultiplier);

  const { expected_last_fire, expected_next_fire } = computeExpectedFires(cronExpr, nowMs);

  const row: CronStatusRowA = {
    name: cronsKey,
    layer: "server",
    cron_expr: cronExpr,
    human_schedule: meta.human_schedule,
    expected_last_fire,
    expected_next_fire,
    last_fire: last_started_at,
    last_status,
    status,
    job_name_db: meta.job_name_db,
  };

  if (status !== "ON_TIME") {
    row.reason = buildReason(status, last_started_at, meta.cadenceMs, meta.thresholdMultiplier, nowMs);
  }

  return row;
}
