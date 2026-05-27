/**
 * selfImproveOrchestratorJob.ts — Daily self-improvement detection orchestrator
 *
 * Sprint SELF-IMPROVE-GATE Phase 2 lane-B substrate (TASK-3/4/5).
 *
 * Runs at 09:02 UTC daily (CRONS.selfImproveOrchestrator = '2 9 * * *').
 * SHADOW MODE at ship: every dispatch path is default-false (C-4).
 * Nothing auto-dispatches until QA records a per-path GATE-PROOF.
 *
 * Pipeline (12 steps):
 *   1. Module-scope _running concurrency guard
 *   2. wrapRun dedup (in startScheduler.ts via jobRunRepo)
 *   3. Get accuracy stats — 7d + 30d windows
 *   4. Detect degradation via detectDegradedSignalTypes()
 *   5. Query coverage gaps via deps.coverageGapFn
 *   6. No findings → exit cleanly (no WORK Telegram)
 *   7. Combine findings + apply severity ordering
 *   8. Anti-runaway gate: max 2 shadow rows per run
 *      (severity order: DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP — HN-2)
 *   9. Cooldown guard: skip if existing shadow/dispatched row within 7 days
 *  10. Insert improve_check_log rows
 *  11. Send exactly 1 WORK Telegram
 *  12. Doc-write step (C-5 isolated try/catch) + kill-switch check (shadow)
 *
 * DDD layer: Interface / Scheduler
 *   Imports from: infrastructure/db, domain/services, infrastructure/signals
 *   Never imports from: another scheduler job
 */

import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { getDb } from "../../infrastructure/db/schema.js";
import {
  getAccuracyStats,
  type SignalAccuracyStats,
} from "../../infrastructure/db/signalOutcomeStore.js";
import {
  insertImproveCheckSnapshot,
  queryCoverageGaps,
  type CoverageGapFinding,
} from "../../infrastructure/db/improveCheckStore.js";
import {
  detectDegradedSignalTypes,
  type DegradationFinding,
  type DetectionClass,
} from "../../domain/services/degradationRules.js";
import {
  buildProposalFields,
  deriveProposalId,
  cooldownDocExists,
  type ImprovementProposalFields,
} from "../../infrastructure/signals/improvementSignalWriter.js";

// ─────────────────────────────────────────────────────────────────────────────
// Per-path kill-switch (C-4 — HARD: no global flag, per-path default-false)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Exhaustive list of known dispatch paths. Adding a new path requires a code
 * change here — enforces C-4: no freeform-string path lookup possible.
 */
export const DISPATCH_PATHS = [
  "price_confirmation",
  "chain_catalyst",
  "volume_spike",
  "coverage_gap",
] as const;

export type DispatchPath = (typeof DISPATCH_PATHS)[number];

/**
 * Read per-path kill-switch from environment. Fail-safe on unknown path:
 * returns false (not an error). Absent env var = false (default-off invariant).
 *
 * Env-var convention: SELF_IMPROVE_AUTO_DISPATCH_{PATH_UPPER}
 * Examples:
 *   SELF_IMPROVE_AUTO_DISPATCH_PRICE_CONFIRMATION=false   (ship default)
 *   SELF_IMPROVE_AUTO_DISPATCH_CHAIN_CATALYST=false       (ship default)
 *   SELF_IMPROVE_AUTO_DISPATCH_VOLUME_SPIKE=false         (ship default)
 *   SELF_IMPROVE_AUTO_DISPATCH_COVERAGE_GAP=false         (ship default)
 *
 * NOTE: No global SELF_IMPROVE_AUTO_DISPATCH=true path exists in this scheme.
 * A bare global flag cannot match any path's key pattern.
 * TypeScript rejects freeform strings at compile time (AC-T5-5).
 */
export function isAutoDispatchEnabled(path: DispatchPath): boolean {
  const key = `SELF_IMPROVE_AUTO_DISPATCH_${path.toUpperCase()}`;
  return Bun.env[key] === "true";
}

// ─────────────────────────────────────────────────────────────────────────────
// Module-scope concurrency guard (mirrors accuracyDigestJob.ts pattern)
// ─────────────────────────────────────────────────────────────────────────────

let _running = false;

// ─────────────────────────────────────────────────────────────────────────────
// Severity ordering (HN-2: architect canonical — DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP)
// ─────────────────────────────────────────────────────────────────────────────

const SEVERITY_ORDER: Record<DetectionClass, number> = {
  DEGRADED: 3,
  PERSISTENTLY_LOW: 2,
  COVERAGE_GAP: 1,
};

// ─────────────────────────────────────────────────────────────────────────────
// Injectable dependencies interface (mirrors AccuracyDigestDeps pattern)
// ─────────────────────────────────────────────────────────────────────────────

export interface SelfImproveOrchestratorDeps {
  /** Injected DB handle. Falls back to getDb() in production. */
  db?: Database;
  /** Telegram WORK channel sender. */
  sendWork?: (text: string) => Promise<boolean>;
  /** Detection function. Defaults to imported detectDegradedSignalTypes(). */
  detectFn?: (
    stats7d: SignalAccuracyStats[],
    stats30d: SignalAccuracyStats[],
  ) => DegradationFinding[];
  /** Coverage gap query. Defaults to queryCoverageGaps(db). */
  coverageGapFn?: (db: Database) => CoverageGapFinding[];
  /**
   * Proposal doc writer. Defaults to writeImprovementProposal().
   * C-5: orchestrator wraps each call in try/catch — failure is non-fatal.
   */
  writeProposalFn?: (finding: DegradationFinding, runDate: string) => Promise<void>;
  /** Override the proposals directory (for testing). */
  proposalsDir?: string;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

/**
 * Check if a cooldown row exists for a signal_type in improve_check_log.
 * Suppresses duplicate insertions within the 7-day cooldown window.
 * Returns false on any error (fail-open: cooldown miss is safer than false suppression).
 */
function hasCooldownRow(db: Database, signal_type: string): boolean {
  try {
    const row = db
      .prepare<{ cnt: number }, [string]>(
        `SELECT COUNT(*) AS cnt
         FROM improve_check_log
         WHERE signal_type = ?
           AND dispatch_status IN ('shadow', 'dispatched')
           AND checked_at >= datetime('now', '-7 days')`,
      )
      .get(signal_type);
    return (row?.cnt ?? 0) > 0;
  } catch {
    return false;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// formatWorkMessage — WORK Telegram message builder
// ─────────────────────────────────────────────────────────────────────────────

function formatWorkMessage(
  findings: DegradationFinding[],
  gapFindings: CoverageGapFinding[],
): string {
  const total = findings.length + gapFindings.length;
  const lines: string[] = [
    `Signal Accuracy Degradation Detected (${total} finding${total !== 1 ? "s" : ""}):`,
    "",
  ];

  for (const f of findings) {
    const curr =
      f.current_rate !== null ? (f.current_rate * 100).toFixed(1) + "%" : "n/a";
    const base =
      f.baseline_rate !== null ? (f.baseline_rate * 100).toFixed(1) + "%" : "n/a";
    const delta =
      f.current_rate !== null && f.baseline_rate !== null
        ? ((f.baseline_rate - f.current_rate) * 100).toFixed(1) + "pp"
        : "n/a";

    lines.push(`${f.signal_type} [${f.detection_class}]: 7d=${curr}, 30d=${base} (delta -${delta})`);
    lines.push(`Likely cause: ${f.hypothesis}`);
    lines.push("");
  }

  for (const g of gapFindings) {
    lines.push(
      `coverage gap: ${g.stock_code} — agent_signals=${g.agent_signals_count}, last_signal_at=${g.last_signal_at ?? "none"}`,
    );
    lines.push("");
  }

  return lines.join("\n").trim();
}

// ─────────────────────────────────────────────────────────────────────────────
// runSelfImproveOrchestrator — main job function
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Execute one self-improve orchestrator cycle.
 *
 * Mirrors accuracyDigestJob.ts: injectable deps, _running guard,
 * wrapRun dedup lives in startScheduler.ts (not here).
 */
export async function runSelfImproveOrchestrator(
  deps?: SelfImproveOrchestratorDeps,
): Promise<void> {
  // Step 1: In-memory concurrency guard
  if (_running) {
    logger.warn("[selfImproveOrchestratorJob] already running — skipping");
    return;
  }
  _running = true;

  const effectiveDb = deps?.db ?? getDb();

  try {
    // Step 3: Get accuracy stats
    let stats7d: SignalAccuracyStats[] = [];
    let stats30d: SignalAccuracyStats[] = [];

    try {
      stats7d = getAccuracyStats(effectiveDb, { days: 7 });
      stats30d = getAccuracyStats(effectiveDb, { days: 30 });
    } catch (statsErr) {
      logger.error("[selfImproveOrchestratorJob] failed to get accuracy stats", {
        error:
          statsErr instanceof Error ? statsErr.message : String(statsErr),
      });
      return;
    }

    // Step 4: Detect degradation
    const detectFn = deps?.detectFn ?? detectDegradedSignalTypes;
    const degradationFindings = detectFn(stats7d, stats30d);

    // Step 5: Query coverage gaps
    const coverageGapFn = deps?.coverageGapFn ?? queryCoverageGaps;
    const gapFindings = coverageGapFn(effectiveDb);

    // Step 6: No findings → exit cleanly, no WORK Telegram
    if (degradationFindings.length === 0 && gapFindings.length === 0) {
      logger.info("[selfImproveOrchestratorJob] no_degradation");
      return;
    }

    // Step 7: Combine + sort by severity (HN-2: DEGRADED > PERSISTENTLY_LOW > COVERAGE_GAP)
    type UnifiedFinding =
      | { kind: "degradation"; finding: DegradationFinding }
      | { kind: "gap"; finding: CoverageGapFinding };

    const unified: Array<{ severity: number; item: UnifiedFinding }> = [
      ...degradationFindings.map((f) => ({
        severity: SEVERITY_ORDER[f.detection_class],
        item: { kind: "degradation" as const, finding: f },
      })),
      ...gapFindings.map((g) => ({
        severity: SEVERITY_ORDER["COVERAGE_GAP"],
        item: { kind: "gap" as const, finding: g },
      })),
    ];

    unified.sort((a, b) => b.severity - a.severity);

    // Step 8: Anti-runaway gate — max 2 shadow rows per run
    const MAX_PER_RUN = 2;
    const selected = unified.slice(0, MAX_PER_RUN);
    const skipped = unified.slice(MAX_PER_RUN);

    if (skipped.length > 0) {
      logger.info(
        `[selfImproveOrchestratorJob] anti-runaway: keeping top ${MAX_PER_RUN} of ${unified.length} findings, skipping ${skipped.length}`,
      );
    }

    // Step 9 + 10: Cooldown guard + insert rows
    const survivingDegradationFindings: DegradationFinding[] = [];
    const survivingGapFindings: CoverageGapFinding[] = [];

    for (const { item } of selected) {
      if (item.kind === "degradation") {
        const f = item.finding;
        if (hasCooldownRow(effectiveDb, f.signal_type)) {
          logger.info(
            `[D-IMPROVE] skip duplicate: ${f.signal_type} (cooldown within 7 days)`,
          );
          continue;
        }
        try {
          insertImproveCheckSnapshot(effectiveDb, {
            signal_type: f.signal_type,
            window_7d_rate: f.current_rate,
            window_30d_rate: f.baseline_rate,
            sample_count_7d: f.sample_count_7d,
            sample_count_30d: f.sample_count_30d,
            hypothesis: f.hypothesis,
            dispatch_status: "shadow",
          });
          survivingDegradationFindings.push(f);
        } catch (insertErr) {
          logger.error(
            `[selfImproveOrchestratorJob] failed to insert row for ${f.signal_type}`,
            {
              error:
                insertErr instanceof Error
                  ? insertErr.message
                  : String(insertErr),
            },
          );
        }
      } else {
        const g = item.finding;
        if (hasCooldownRow(effectiveDb, `coverage_gap:${g.stock_code}`)) {
          logger.info(
            `[D-IMPROVE] skip duplicate coverage gap: ${g.stock_code}`,
          );
          continue;
        }
        // Coverage gaps don't insert into improve_check_log by signal_type
        // (they use stock_code as the identifier); just include in the Telegram
        survivingGapFindings.push(g);
      }
    }

    // If nothing survived cooldown + no gap findings, still send if gapFindings is non-empty
    const hasAnySurviving =
      survivingDegradationFindings.length > 0 || survivingGapFindings.length > 0;

    if (!hasAnySurviving) {
      logger.info(
        "[selfImproveOrchestratorJob] all findings suppressed by cooldown — no Telegram sent",
      );
      return;
    }

    // Step 11: Send exactly 1 WORK Telegram
    const message = formatWorkMessage(
      survivingDegradationFindings,
      survivingGapFindings,
    );

    try {
      const sendFn =
        deps?.sendWork ??
        (async (text: string) => {
          const { sendTelegramWork } = await import(
            "../../infrastructure/notifiers/telegram.js"
          );
          return sendTelegramWork(text);
        });

      const sent = await sendFn(message);
      if (!sent) {
        logger.info(
          "[selfImproveOrchestratorJob] WORK Telegram not configured — message not sent",
        );
      } else {
        logger.info(
          `[selfImproveOrchestratorJob] WORK Telegram sent — ${survivingDegradationFindings.length} degradation + ${survivingGapFindings.length} gap findings`,
        );
      }
    } catch (telegramErr) {
      logger.warn(
        "[selfImproveOrchestratorJob] Telegram send failed (non-fatal)",
        {
          error:
            telegramErr instanceof Error
              ? telegramErr.message
              : String(telegramErr),
        },
      );
    }

    // Step 12: Doc-write (C-5 isolated) + kill-switch check (shadow mode)
    const runDate = todayUtc();
    const runDatetime = nowIso();
    const proposalsDir = deps?.proposalsDir;

    for (const f of survivingDegradationFindings) {
      // C-5 isolation: doc-write failure must NOT abort the pipeline above
      try {
        if (deps?.writeProposalFn) {
          await deps.writeProposalFn(f, runDate);
        } else {
          // Default: check cooldown then write via improvementSignalWriter
          const docExists = cooldownDocExists(
            f.signal_type,
            f.detection_class,
            proposalsDir,
          );
          if (docExists) {
            logger.info(
              `[selfImproveOrchestratorJob] proposal doc already exists for ${f.signal_type}_${f.detection_class} — skipping doc write`,
            );
          } else {
            const { writeImprovementProposal, appendDashboardRow } =
              await import(
                "../../infrastructure/signals/improvementSignalWriter.js"
              );

            const fields = buildProposalFields(f, runDate, runDatetime);
            await writeImprovementProposal(fields, proposalsDir);

            const proposalPath = `docs/improvement-proposals/${fields.id}.md`;
            const summary = `${f.signal_type} accuracy ${f.detection_class.toLowerCase()}`;
            await appendDashboardRow(fields.id, runDatetime, summary, proposalPath);

            logger.info(
              `[selfImproveOrchestratorJob] proposal doc written: ${fields.id}`,
            );
          }
        }
      } catch (docErr) {
        logger.error(
          "[selfImproveOrchestrator] doc-write failed:",
          {
            error:
              docErr instanceof Error ? docErr.message : String(docErr),
          },
        );
        // Continue — C-5: doc-write failure is non-fatal
      }

      // Kill-switch check (Phase 2: always false — shadow mode)
      if (DISPATCH_PATHS.includes(f.signal_type as DispatchPath)) {
        if (isAutoDispatchEnabled(f.signal_type as DispatchPath)) {
          // Phase 3 will actually dispatch here; Phase 2 is shadow-mode (false)
          logger.debug(
            `[selfImproveOrchestrator] path ${f.signal_type} auto-dispatch enabled (shadow mode — not firing)`,
          );
        }
      }
    }
  } catch (err) {
    logger.error(
      "[selfImproveOrchestratorJob] unhandled error in orchestrator cycle",
      {
        error: err instanceof Error ? err.message : String(err),
      },
    );
    throw err; // re-throw so wrapRun can record status='error'
  } finally {
    _running = false;
  }
}
