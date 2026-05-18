/**
 * verdictResolutionJob — Hourly pending-verdict resolver (Task 1863b-RECONCILE)
 *
 * Runs every hour (`0 * * * *`).
 * For each pending AlertVerdict row >=24h old:
 *   1. Fetch baseline close price via fetchHistory(ticker, 2) -> oldest snapshot
 *   2. Fetch live close price via fetchPrice(ticker)
 *   3. Compute pctMove and apply direction-match rule
 *   4. Write resolved verdict back to store
 * Prunes resolved entries >30 days old at end of run.
 * Fail-loud on price fetch failure — row stays pending, BUG telegram sent.
 *
 * DDD layer: scheduler — may import from infrastructure/.
 * MUST NOT import from domain/ or application/.
 *
 * @module scheduler/alerts/verdictResolutionJob
 * Task: 1863b
 */

import {
  readVerdicts,
  updateVerdict,
  pruneVerdicts,
} from "../../infrastructure/fileStore/alertVerdictStore.js";
import type { AlertVerdict } from "../../infrastructure/fileStore/alertVerdictStore.js";
import {
  writeAlertOutcome,
  type AlertOutcome,
} from "../../infrastructure/db/alertStore.js";

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

/** Minimal store interface — injectable for tests */
export interface AlertVerdictStoreIface {
  readVerdicts: () => Promise<AlertVerdict[]>;
  updateVerdict: (id: string, patch: Partial<AlertVerdict>) => Promise<void>;
  pruneVerdicts: (maxAgeDays: number) => Promise<number>;
}

export interface VerdictResolutionJobDeps {
  store?: AlertVerdictStoreIface;
  /** Fetches live close price for ticker; returns null on miss */
  fetchPrice?: (ticker: string) => Promise<number | null>;
  /** Fetches last N daily closes for ticker; returns oldest as baseline; null on miss */
  fetchHistory?: (ticker: string, days: number) => Promise<number | null>;
  /** Telegram sender — defaults to sendTelegramBug */
  telegramSender?: (channel: string, message: string) => Promise<void>;
  /** Writes HIT/MISS to alerts.outcome; injectable for tests (E-3: must never throw) */
  writeOutcomeFn?: (alertId: string, outcome: AlertOutcome, detail?: string) => Promise<void>;
  nowFn?: () => Date;
}

export interface VerdictResolutionJobResult {
  rowsEvaluated: number;
  rowsResolved: number;
  rowsPruned: number;
  errors: number;
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const PRUNE_MAX_AGE_DAYS = 30;

// ─────────────────────────────────────────────────────────────────────────────
// Direction-match rule (architect paragraph 5)
// ─────────────────────────────────────────────────────────────────────────────

function resolveDirection(
  direction: string,
  pctMove: number
): "confirmed" | "false_positive" {
  // OOS-5 fix: direction-aware confirm only — flat-band early-return removed.
  // A bearish alert with +0.9% move is a false_positive, not confirmed.
  if (direction === "bearish") {
    return pctMove <= -1.0 ? "confirmed" : "false_positive";
  }
  // bullish / up / neutral / unknown — default bullish treatment
  return pctMove >= 1.0 ? "confirmed" : "false_positive";
}

// ─────────────────────────────────────────────────────────────────────────────
// Default price adapter wrappers
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default live-price fetcher — wraps fetchStockPrice from clients.ts.
 * Returns null if service throws.
 */
async function defaultFetchPrice(ticker: string): Promise<number | null> {
  const { fetchStockPrice } = await import(
    "../../infrastructure/microservices/clients.js"
  );
  try {
    const snap = await fetchStockPrice({ code: ticker });
    return snap.price;
  } catch {
    return null;
  }
}

/**
 * Default history fetcher — wraps getPriceHistory from clients.ts.
 * Returns the oldest close price in the window as baseline.
 * Returns null if service throws or returns empty history.
 *
 * Fix (1945a): Go /price/history returns PriceHistoryEnvelope { code, history: DailyOHLCV[] }.
 * The previous code treated the response as PriceSnapshot[] (flat array), causing
 * snaps[0] = undefined → TypeError → null → "price-fetch-failed:unresolvable" for every verdict.
 */
async function defaultFetchHistory(
  ticker: string,
  days: number
): Promise<number | null> {
  const { getPriceHistory } = await import(
    "../../infrastructure/microservices/clients.js"
  );
  try {
    const envelope = await getPriceHistory({ code: ticker, days });
    const history = envelope.history;
    if (!history || history.length === 0) return null;
    // Go returns ORDER BY date ASC — history[0] is the oldest date, used as baseline
    return history[0]!.close;
  } catch {
    return null;
  }
}

/**
 * Default Telegram sender — routes to BUG channel.
 */
async function defaultTelegramSender(
  _channel: string,
  message: string
): Promise<void> {
  const { sendTelegramBug } = await import(
    "../../infrastructure/notifiers/telegram.js"
  );
  await sendTelegramBug(message);
}

// ─────────────────────────────────────────────────────────────────────────────
// Default store adapter
// ─────────────────────────────────────────────────────────────────────────────

function buildDefaultStore(): AlertVerdictStoreIface {
  return {
    readVerdicts: () => readVerdicts(),
    updateVerdict: (id, patch) => updateVerdict(id, patch),
    pruneVerdicts: (maxAgeDays) => pruneVerdicts(maxAgeDays),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Core job
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Default writeAlertOutcome adapter — wraps the infra function synchronously.
 * Sync DB call made async to match injectable interface.
 */
async function defaultWriteOutcomeFn(
  alertId: string,
  outcome: AlertOutcome,
  detail?: string,
): Promise<void> {
  writeAlertOutcome(alertId, outcome, detail);
}

/**
 * Resolve pending alert verdicts >=24h old.
 * All external calls are injectable via `deps` for unit tests.
 */
export async function runVerdictResolutionJobCron(
  deps?: VerdictResolutionJobDeps
): Promise<VerdictResolutionJobResult> {
  const store = deps?.store ?? buildDefaultStore();
  const fetchPrice = deps?.fetchPrice ?? defaultFetchPrice;
  const fetchHistory = deps?.fetchHistory ?? defaultFetchHistory;
  const telegramSender = deps?.telegramSender ?? defaultTelegramSender;
  const writeOutcomeFn = deps?.writeOutcomeFn ?? defaultWriteOutcomeFn;
  const now = deps?.nowFn?.() ?? new Date();

  const result: VerdictResolutionJobResult = {
    rowsEvaluated: 0,
    rowsResolved: 0,
    rowsPruned: 0,
    errors: 0,
  };

  // 1. Read all rows; filter to pending rows >=24h old
  const allRows = await store.readVerdicts();
  const eligible = allRows.filter((row) => {
    if (row.verdict !== "pending") return false;
    const ageMs = now.getTime() - new Date(row.firedAt).getTime();
    return ageMs >= TWENTY_FOUR_HOURS_MS;
  });

  // 2. Process each eligible row
  for (const row of eligible) {
    result.rowsEvaluated++;

    try {
      // Fetch baseline price (oldest close in last 2 days)
      const priceAtFire = await fetchHistory(row.ticker, 2);
      if (priceAtFire === null) {
        // Mark unresolvable to stop hourly retry storm (non-HOSE tickers never have prices)
        await store.updateVerdict(row.id, {
          verdict: "false_positive",
          detail: "price-fetch-failed:unresolvable",
          resolvedAt: now.toISOString(),
        });
        await telegramSender(
          "bug",
          "[verdictResolutionJob] No baseline price for " + row.ticker + " firedAt=" + row.firedAt + " — marked unresolvable"
        );
        result.errors++;
        continue;
      }

      // Fetch live close price
      const priceAtResolution = await fetchPrice(row.ticker);
      if (priceAtResolution === null) {
        // Mark unresolvable to stop hourly retry storm
        await store.updateVerdict(row.id, {
          verdict: "false_positive",
          detail: "price-fetch-failed:unresolvable",
          resolvedAt: now.toISOString(),
        });
        await telegramSender(
          "bug",
          "[verdictResolutionJob] Price fetch failed for " + row.ticker + " firedAt=" + row.firedAt + " — marked unresolvable"
        );
        result.errors++;
        continue;
      }

      // Compute move
      const pctMove = ((priceAtResolution - priceAtFire) / priceAtFire) * 100;
      const verdict = resolveDirection(row.direction, pctMove);

      const sign = pctMove >= 0 ? "+" : "";
      const detail = row.direction + " " + sign + pctMove.toFixed(2) + "% -> " + verdict;

      await store.updateVerdict(row.id, {
        verdict,
        resolvedAt: now.toISOString(),
        priceAtFire,
        priceAtResolution,
        pctMove,
        detail,
        basePrice: priceAtFire,
        closePriceAt24h: priceAtResolution,
      });

      // AC-5: Write HIT/MISS to alerts.outcome (E-3: never throws — missing alertId is not critical)
      const outcomeValue: AlertOutcome = verdict === "confirmed" ? "HIT" : "MISS";
      try {
        await writeOutcomeFn(row.id, outcomeValue, detail);
      } catch (err) {
        const warnMsg = err instanceof Error ? err.message : String(err);
        console.warn(`[verdictResolutionJob] writeAlertOutcome failed for alert ${row.id}: ${warnMsg}`);
      }

      result.rowsResolved++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      await telegramSender(
        "bug",
        "[verdictResolutionJob] Price service error for " + row.ticker + ": " + msg
      );
      result.errors++;
    }
  }

  // 3. Prune old resolved entries
  result.rowsPruned = await store.pruneVerdicts(PRUNE_MAX_AGE_DAYS);

  return result;
}
