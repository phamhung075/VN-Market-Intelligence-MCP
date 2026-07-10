/**
 * Data Freshness SLA Monitor Job — Task 234
 *
 * Scheduler layer: checks signal source data freshness every 30 minutes.
 * Escalates to Alert Commander when SLA breaches detected.
 * Tracks recovery status in sla_breach_audit table.
 *
 * Enforces 60-minute cooldown per signal type to prevent alert spam.
 *
 * DDD Layer: interface/scheduler — may import from domain + infrastructure.
 *
 * @module scheduler/system/freshnessSlaMonitorJob
 */

import { resolve } from "node:path";
import type { Database } from "bun:sqlite";
import {
  checkDataFreshnessSla,
  isVnMarketHours,
  type SignalType,
  type PipelineRuntimeState,
} from "../../domain/services/freshnessSlaChecker.js";
import {
  checkCoverageMapFreshness,
  type CoverageMapRow,
} from "../../domain/services/coverageMapFreshnessChecker.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";

/**
 * Absolute path to the frontend data coverage map (SSOT for L4 self-policing).
 * Resolved relative to this file's location:
 *   apps/mcp-server/src/scheduler/system/ → ../../../../../docs/data/...
 */
const COVERAGE_MAP_JSON_PATH = resolve(
  import.meta.dir,
  "../../../../../docs/data/frontend-data-coverage-map.json"
);

/**
 * Escalation callback signature.
 */
export type EscalationCallback = (
  signalType: SignalType,
  ageMinutes: number,
  thresholdMinutes: number,
  severity: "HIGH" | "CRITICAL"
) => Promise<void>;

/**
 * Queries the age of signal data for each source.
 *
 * Null guard (FR-4): if a table has zero rows, MAX() returns NULL → strftime('%s', NULL) = NULL
 * → age calculation returns NULL → row.age_minutes is NULL (not an integer).
 * We return -1 for zero-row tables as a "not-yet-seeded" sentinel.
 * Callers must treat -1 as "skip SLA check" — not a breach.
 *
 * @param db Database instance
 * @returns Map of signalType → ageMinutes (-1 = not seeded, 0+ = real age)
 */
export function querySignalAges(
  db: Database
): Record<SignalType, number> {
  const now = Math.floor(Date.now() / 1000);

  interface AgeRow {
    signal_type: SignalType;
    age_minutes: number | null;
  }

  // Excluded from SLA monitoring (zero active writers — DEPRECATED or N/A):
  //   - user_requests: superseded by ask_queue (Task 1063, Sprint 1920)
  //   - skips: table does not exist in schema (Sprint 1920 investigation)
  //   - vn_index_cache: writer wired by FIX-VNINDEX-CACHE-EMPTY-REFRESH-PATH (2026-06-20).
  //       Excluded here because it is a derived cache of market_prices.VNINDEX, not a
  //       primary signal source. freshness already covered by 'price' signal type above.
  //   - credit_data: orphan from deleted SBV credit growth code — no schema def,
  //       zero writers (Sprint 1922, Task 1922c)
  //
  // Table mapping (original 5):
  //   sbv_fx       — sbv_rates.fetched_at
  //   foreign_flow — daily_ohlcv.updated_at WHERE foreign_buy_vol IS NOT NULL
  //                  (VPS pushes foreign flow into daily_ohlcv, not a separate table)
  //
  // Sprint 1920 additions (Task 1920i — 7 new entries):
  //   vnstock_fundamentals — vnstock_financials.fetched_at (weekly Mon 01:00 UTC; 72h SLA)
  //   bond_maturity        — bond_maturity.updated_at (weekly Sun 02:30 UTC; 168h SLA)
  //   commodity_prices     — commodity_prices.fetched_at (daily 06:00 UTC; 36h SLA)
  //   broker_sanctions     — broker_sanctions.created_at (quarterly; 2160h SLA)
  //   backtest_runs        — backtest_runs.run_at (daily; 36h SLA)
  //   signal_quality_audit — signal_quality_audit.created_at (event-driven; 48h SLA)
  //   prediction_claims    — prediction_claims.created_at (event-driven; 168h SLA)
  const rows = db
    .query<AgeRow, [number, number, number, number, number, number, number, number, number, number, number, number]>(
      `SELECT
        'price' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(updated_at) FROM market_prices)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'bctc' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(parsed_at) FROM financial_reports)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'news' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(created_at) FROM rag_analyses)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'sbv_fx' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(fetched_at) FROM sbv_rates)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'foreign_flow' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(updated_at) FROM daily_ohlcv WHERE foreign_buy_vol IS NOT NULL)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'vnstock_fundamentals' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(fetched_at) FROM vnstock_financials)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'bond_maturity' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(updated_at) FROM bond_maturity)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'commodity_prices' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(fetched_at) FROM commodity_prices)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'broker_sanctions' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(created_at) FROM broker_sanctions)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'backtest_runs' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(run_at) FROM backtest_runs)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'signal_quality_audit' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(created_at) FROM signal_quality_audit)) AS INTEGER)) / 60 AS INTEGER) as age_minutes
      UNION ALL
      SELECT
        'prediction_claims' as signal_type,
        CAST((? - CAST(strftime('%s', (SELECT MAX(created_at) FROM prediction_claims)) AS INTEGER)) / 60 AS INTEGER) as age_minutes`
    )
    .all(now, now, now, now, now, now, now, now, now, now, now, now) as AgeRow[];

  const result: Record<SignalType, number> = {
    price: 0,
    bctc: 0,
    news: 0,
    sbv_fx: 0,
    foreign_flow: 0,
    vnstock_fundamentals: -1,
    bond_maturity: -1,
    commodity_prices: -1,
    broker_sanctions: -1,
    backtest_runs: -1,
    signal_quality_audit: -1,
    prediction_claims: -1,
  };

  for (const row of rows) {
    if (row.age_minutes === null || row.age_minutes === undefined) {
      // FR-4: table has zero rows → sentinel -1 (not-seeded, skip SLA check)
      result[row.signal_type] = -1;
    } else {
      result[row.signal_type] = Math.max(0, row.age_minutes);
    }
  }

  return result;
}

/**
 * FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH — live queue-depth + service-state
 * probe for the BCTC VPS fetch pipeline.
 *
 * Root cause: the bctc SLA breach path (below, via checkDataFreshnessSla)
 * previously classified CRASH/UNHEALTHY on last-push-age alone. An empty
 * queue (no filings currently due) produces a large push-age that is
 * completely normal, not a crash. This reads the two live signals the
 * fix_spec requires:
 *   - queueDepth: COUNT of actionable bctc_vps_queue rows (pending /
 *     url_not_found / enrich_failed) — mirrors the queueGuardSql pattern
 *     already used by vpsHealthPoller.ts (FIX-BCTC-FRESHNESS-GATE).
 *   - serviceActive: latest vps_service_health.health_status for
 *     'vn-bctc-fetch' — 'unreachable' means the poller found zero evidence
 *     of the service ever running; any other status (healthy/idle/unhealthy)
 *     means the service is confirmed alive.
 *
 * Fail-open by design: if either table is absent (older schema, or a test DB
 * that only mirrors a subset of the schema) this returns `undefined` so the
 * caller falls back to the pre-fix age-only check — no behavior change for
 * callers that never had this data.  No poll row yet (fresh deploy) is
 * treated as serviceActive=true for the same reason: we do not want to
 * fabricate a false CRASH from the absence of evidence.
 *
 * Generic by design (per fix_spec's generic_mandate): this function is the
 * BCTC-specific *reader*; the *gate logic* itself
 * (`PipelineRuntimeState` + the branch in `checkSignalSla`) is fully generic
 * and reusable by any other event-driven, queue-backed pipeline that wires
 * up its own reader.
 *
 * @param db Database instance
 * @returns PipelineRuntimeState, or undefined if the probe cannot be made
 */
export function queryBctcPipelineRuntimeState(
  db: Database,
): PipelineRuntimeState | undefined {
  try {
    const queueRow = db
      .query<{ active_count: number }, []>(
        `SELECT COUNT(*) AS active_count
           FROM bctc_vps_queue
          WHERE status IN ('pending', 'url_not_found', 'enrich_failed')`,
      )
      .get();
    const queueDepth = queueRow?.active_count ?? 0;

    // ORDER BY polled_at DESC, id DESC: id is the deterministic tiebreaker
    // when two polls land within the same datetime('now') second-resolution
    // bucket — always resolves to the most recently inserted row.
    const healthRow = db
      .query<{ health_status: string }, []>(
        `SELECT health_status FROM vps_service_health
          WHERE service_name = 'vn-bctc-fetch'
          ORDER BY polled_at DESC, id DESC LIMIT 1`,
      )
      .get();
    const serviceActive = healthRow
      ? healthRow.health_status !== "unreachable"
      : true;

    return { serviceActive, queueDepth };
  } catch {
    // bctc_vps_queue / vps_service_health absent — fail open, no gate applied.
    return undefined;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Daily summary gate (FR-5)
// ─────────────────────────────────────────────────────────────────────────────

/** Date string (YYYY-MM-DD UTC) of last daily coverage snapshot sent. */
let _lastSummaryDate = "";

/**
 * Resets the daily summary gate (test isolation only).
 * @internal
 */
export function resetSummaryGate(): void {
  _lastSummaryDate = "";
}

/** Total number of tables monitored by this job (denomininator for coverage_pct). */
const MONITORED_TABLE_COUNT = 12;

/**
 * Formats a single signal type age entry for the daily summary.
 * Returns "not-seeded" for sentinel -1, otherwise formats as human-readable duration.
 */
function formatAge(ageMinutes: number): string {
  if (ageMinutes === -1) return "not-seeded";
  if (ageMinutes < 60) return `${ageMinutes}m`;
  const hours = Math.floor(ageMinutes / 60);
  const mins = ageMinutes % 60;
  return mins === 0 ? `${hours}h` : `${hours}h${mins}m`;
}

/**
 * Builds the daily coverage snapshot string for the WORK channel (FR-5).
 *
 * @param signalAges Current signal ages map
 * @returns Formatted multi-line summary string
 */
export function buildDailySummary(signalAges: Record<SignalType, number>): string {
  const seeded = Object.values(signalAges).filter(age => age !== -1).length;
  const total = MONITORED_TABLE_COUNT;
  const pct = Math.round((seeded / total) * 100);

  const lines = [
    "[freshness-sla] daily coverage snapshot",
    `  price: ${formatAge(signalAges.price)} | bctc: ${formatAge(signalAges.bctc)} | news: ${formatAge(signalAges.news)} | sbv_fx: ${formatAge(signalAges.sbv_fx)} | foreign_flow: ${formatAge(signalAges.foreign_flow)}`,
    `  commodity_prices: ${formatAge(signalAges.commodity_prices)} | vnstock_fundamentals: ${formatAge(signalAges.vnstock_fundamentals)} | bond_maturity: ${formatAge(signalAges.bond_maturity)}`,
    `  backtest_runs: ${formatAge(signalAges.backtest_runs)} | signal_quality_audit: ${formatAge(signalAges.signal_quality_audit)} | prediction_claims: ${formatAge(signalAges.prediction_claims)}`,
    `  broker_sanctions: ${formatAge(signalAges.broker_sanctions)}`,
    `  coverage: ${seeded}/${total} tables (${pct}%)`,
  ];

  return lines.join("\n");
}

/**
 * Retrieves prior breach records for recovery detection.
 *
 * @param db Database instance
 * @returns Array of prior breach records
 */
export function getPriorBreaches(
  db: Database
): Array<{ signalType: SignalType; status: "breach_open" | "recovered" }> {
  interface BreachRow {
    signal_type: SignalType;
    status: "breach_open" | "recovered";
  }

  const rows = db
    .query<BreachRow, []>(
      `SELECT signal_type, status FROM sla_breach_audit
       WHERE status = 'breach_open'`
    )
    .all() as BreachRow[];

  return rows.map(row => ({
    signalType: row.signal_type,
    status: row.status
  }));
}

/**
 * Checks cooldown: has this signal type been escalated in the last 60 minutes?
 *
 * @param db Database instance
 * @param signalType Signal type to check
 * @returns true if escalation_callback_sent=true within last 60 minutes
 */
export function isEscalationCooldownActive(
  db: Database,
  signalType: SignalType
): boolean {
  interface CooldownRow {
    count: number;
  }

  const row = db
    .query<CooldownRow, [SignalType]>(
      `SELECT COUNT(*) as count FROM sla_breach_audit
       WHERE signal_type = ?
       AND escalation_callback_sent = 1
       AND breached_at > datetime('now', '-60 minutes')`
    )
    .get(signalType) as CooldownRow | undefined;

  return (row?.count ?? 0) > 0;
}

/**
 * Records an SLA breach in the audit table.
 *
 * @param db Database instance
 * @param signalType Signal type
 * @param ageMinutes Data age in minutes
 * @param thresholdMinutes SLA threshold
 * @param severity Breach severity
 */
export function recordSlaBreach(
  db: Database,
  signalType: SignalType,
  ageMinutes: number,
  thresholdMinutes: number,
  severity: "HIGH" | "CRITICAL"
): void {
  const stmt = db.prepare(`
    INSERT INTO sla_breach_audit (
      signal_type,
      age_minutes,
      threshold_minutes,
      status,
      severity
    ) VALUES (?, ?, ?, ?, ?)
  `);

  stmt.run(signalType, ageMinutes, thresholdMinutes, "breach_open", severity);
}

/**
 * Records recovery of a previously breached signal.
 *
 * @param db Database instance
 * @param signalType Signal type
 */
export function recordSlaRecovery(
  db: Database,
  signalType: SignalType
): void {
  const stmt = db.prepare(`
    UPDATE sla_breach_audit
    SET status = 'recovered', recovered_at = datetime('now')
    WHERE signal_type = ? AND status = 'breach_open'
  `);

  stmt.run(signalType);
}

/**
 * Marks escalation callback as sent for a breach.
 *
 * @param db Database instance
 * @param signalType Signal type
 */
export function markEscalationSent(
  db: Database,
  signalType: SignalType
): void {
  const stmt = db.prepare(`
    UPDATE sla_breach_audit
    SET escalation_callback_sent = 1
    WHERE signal_type = ? AND status = 'breach_open'
    ORDER BY breached_at DESC
    LIMIT 1
  `);

  stmt.run(signalType);
}

/**
 * Signal types that are only active during VN market hours.
 * Outside 02:00–08:59 UTC Mon–Fri, data staleness for these sources is
 * expected (VPS does not push updates when the market is closed).
 * Breaches are still recorded for audit purposes — only escalation is suppressed.
 */
const MARKET_HOURS_ONLY_SIGNALS: SignalType[] = ["price", "foreign_flow"];

/**
 * Runs the data freshness SLA monitor job.
 *
 * Pass 1 (existing, unchanged): queries 12 internal signal-source DB tables for
 * data age and escalates via escalateToCommander when SLA is breached.
 *
 * Pass 2 (TASK-FFT-L4 — additive): reads docs/data/frontend-data-coverage-map.json
 * as SSOT and escalates when any frontend page data surface breaches its SLA tier.
 * Uses checkCoverageMapFreshness() domain service (pure, zero I/O).
 *
 * @param db Database instance (injectable for testing)
 * @param escalateToCommander Escalation callback (injectable for testing)
 * @param injectedSignalAges Optional pre-computed signal ages (for testing; omit in production)
 * @param now Current time override (for testing; omit in production)
 * @param sendWorkFn Optional WORK channel sender override (for testing; omit in production)
 * @param injectedCoverageMapRows Optional pre-parsed coverage-map rows for test isolation.
 *        When provided, the scheduler skips reading COVERAGE_MAP_JSON_PATH from disk.
 *        In production (undefined), the scheduler reads the live JSON file via Bun.file().
 * @param injectedRuntimeStates FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH: optional pre-computed
 *        per-signal-type queue-depth + service-state probes (for testing). In production
 *        (undefined), the scheduler queries live via queryBctcPipelineRuntimeState().
 * @returns Job result summary
 */
export async function runFreshnessSlaMonitor(
  db: Database,
  escalateToCommander: EscalationCallback,
  injectedSignalAges?: Record<SignalType, number>,
  now: Date = new Date(),
  sendWorkFn: (msg: string) => Promise<unknown> = sendTelegramWork,
  injectedCoverageMapRows?: CoverageMapRow[],
  injectedRuntimeStates?: Partial<Record<SignalType, PipelineRuntimeState>>,
): Promise<{ breaches: number; recoveries: number; escalations: number }> {
  // Query current signal ages (or use injected ages for testing)
  const signalAges = injectedSignalAges ?? querySignalAges(db);

  // Get prior breaches for recovery detection
  const priorBreaches = getPriorBreaches(db);

  // FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH: gate the bctc verdict on live
  // queue-depth + service-state (see queryBctcPipelineRuntimeState doc).
  const runtimeStates: Partial<Record<SignalType, PipelineRuntimeState>> =
    injectedRuntimeStates ?? (() => {
      const bctcState = queryBctcPipelineRuntimeState(db);
      return bctcState ? { bctc: bctcState } : {};
    })();

  if (
    runtimeStates.bctc?.serviceActive === true &&
    runtimeStates.bctc.queueDepth === 0 &&
    signalAges.bctc !== -1
  ) {
    console.debug(
      `[sla-monitor] bctc: queue empty (0 actionable rows), service active — ` +
        `IDLE (no filings due), push-age=${signalAges.bctc}min not escalated as CRASH`,
    );
  }

  // Check freshness SLAs
  const slaCheck = checkDataFreshnessSla(signalAges, undefined, priorBreaches, now, runtimeStates);

  let breaches = 0;
  let recoveries = 0;
  let escalations = 0;

  // Process breaches
  for (const breach of slaCheck.breaches) {
    breaches++;
    recordSlaBreach(
      db,
      breach.signalType,
      breach.ageMinutes,
      breach.thresholdMinutes,
      breach.severity!
    );

    // Gate: price + foreign_flow are market-hours-only sources.
    // Outside market hours, staleness is expected — do not escalate.
    if (MARKET_HOURS_ONLY_SIGNALS.includes(breach.signalType) && !isVnMarketHours(now)) {
      console.debug(
        `[sla-monitor] off-hours: skipping escalation for ${breach.signalType} (expected stale outside market hours)`
      );
      continue;
    }

    // Check cooldown and escalate if not active
    if (!isEscalationCooldownActive(db, breach.signalType)) {
      try {
        await escalateToCommander(
          breach.signalType,
          breach.ageMinutes,
          breach.thresholdMinutes,
          breach.severity!
        );
        markEscalationSent(db, breach.signalType);
        escalations++;
      } catch (err) {
        console.error(
          `[sla-monitor] escalation failed for ${breach.signalType}:`,
          err
        );
      }
    }
  }

  // Process recoveries
  for (const recovery of slaCheck.recoveries) {
    recoveries++;
    recordSlaRecovery(db, recovery.signalType);
  }

  // FR-5: Daily coverage snapshot — once per day at first run after UTC midnight
  const todayUtc = now.toISOString().slice(0, 10);
  if (_lastSummaryDate !== todayUtc) {
    _lastSummaryDate = todayUtc;
    try {
      const summary = buildDailySummary(signalAges);
      await sendWorkFn(summary);
    } catch (err) {
      console.warn("[sla-monitor] daily summary send failed:", err);
    }
  }

  // ── TASK-FFT-L4: Coverage-map second pass ────────────────────────────────
  // Additive: existing 12-signal path above runs first and is unchanged.
  // This second pass reads the frontend coverage map as SSOT and escalates
  // when any frontend page data surface breaches its SLA tier.
  try {
    // Resolve coverage-map rows: injected (test) or read live JSON (production)
    let coverageMapRows: CoverageMapRow[];
    if (injectedCoverageMapRows !== undefined) {
      coverageMapRows = injectedCoverageMapRows;
    } else {
      const mapData = await Bun.file(COVERAGE_MAP_JSON_PATH).json() as {
        rows: CoverageMapRow[];
      };
      coverageMapRows = mapData.rows;
    }

    const coverageMapBreaches = await checkCoverageMapFreshness(
      coverageMapRows,
      db,
      now,
      injectedCoverageMapRows
    );

    if (coverageMapBreaches.length > 0) {
      // Lazy-import to mirror the pattern in escalateToCommander() and avoid
      // circular-dep at module load time.
      const { postSignal } = await import(
        "../../infrastructure/db/agentSignalStore.js"
      );

      for (const breach of coverageMapBreaches) {
        // STALE_RISK rows are already suppressed inside checkCoverageMapFreshness
        // when outside market hours. The domain service handles the gate.
        // Belt-and-suspenders: postSignal is only called for returned breaches.
        const slaConfidenceScore =
          breach.ageMinutes > breach.maxStalenessMin * 2 ? 90 : 70;

        try {
          postSignal(db, {
            fromAgent: "freshness-sla-monitor",
            toAgent: "alert-commander",
            signalType: "urgent_news",
            payload: {
              title: `SLA BREACH: ${breach.pageId} data is ${breach.ageMinutes}min old (max ${breach.maxStalenessMin}min)`,
              age_minutes: breach.ageMinutes,
              threshold_minutes: breach.maxStalenessMin,
              endpoint: breach.endpoint,
              element: breach.elementId,
              timestamp: breach.timestamp,
            },
            ttlMinutes: 60,
            confidence_score: slaConfidenceScore,
          });
          escalations++;
        } catch (signalErr) {
          console.error(
            `[sla-monitor] coverage-map breach signal failed for ${breach.pageId}:`,
            signalErr
          );
        }
      }
    }
  } catch (coverageErr) {
    // Coverage-map second pass must never crash the existing 12-signal path.
    console.warn(
      "[sla-monitor] coverage-map second pass failed (non-fatal):",
      coverageErr
    );
  }
  // ── End TASK-FFT-L4 ──────────────────────────────────────────────────────

  return { breaches, recoveries, escalations };
}

/**
 * Default escalation callback: posts signal to Alert Commander via agent signal bus.
 *
 * @param signalType Signal type
 * @param ageMinutes Data age in minutes
 * @param thresholdMinutes SLA threshold
 * @param severity Breach severity
 */
export async function escalateToCommander(
  signalType: SignalType,
  ageMinutes: number,
  thresholdMinutes: number,
  severity: "HIGH" | "CRITICAL"
): Promise<void> {
  const { getDb, initDatabase } = await import(
    "../../infrastructure/db/schema.js"
  );
  const { postSignal } = await import(
    "../../infrastructure/db/agentSignalStore.js"
  );

  await initDatabase();
  const db = getDb();

  const payload = {
    title: `SLA BREACH: ${signalType} source stale`,
    detail: `Data age: ${ageMinutes} minutes (threshold: ${thresholdMinutes} min)`,
    signal_type: signalType,
    severity,
    timestamp: new Date().toISOString(),
  };

  // FIX-SIGNAL-CONFIDENCE-DEFAULT-50: derive confidence from SLA breach severity.
  // CRITICAL breach = 90 confidence (definitive outage); HIGH = 70 (significant lag).
  // This is an honest derivation: severity is already computed from ageMinutes/thresholdMinutes
  // ratio, so it reflects real staleness — not a placeholder.
  const slaConfidenceScore = severity === "CRITICAL" ? 90 : 70;
  postSignal(db, {
    fromAgent: "freshness-sla-monitor",
    toAgent: "alert-commander",
    signalType: "urgent_news",
    payload,
    ttlMinutes: 60,
    confidence_score: slaConfidenceScore,
  });
}

/**
 * Public entry point for cron scheduler.
 *
 * Defaults to production database and escalateToCommander callback.
 */
export async function runFreshnessSlaMonitorJob(): Promise<void> {
  try {
    const { getDb } = await import("../../infrastructure/db/schema.js");
    const db = getDb();

    const result = await runFreshnessSlaMonitor(
      db,
      escalateToCommander
    );

    console.log(
      `[sla-monitor] breaches=${result.breaches} recoveries=${result.recoveries} escalations=${result.escalations}`
    );
  } catch (err) {
    console.error(
      "[sla-monitor] Uncaught error:",
      err instanceof Error ? err.message : String(err)
    );
  }
}
