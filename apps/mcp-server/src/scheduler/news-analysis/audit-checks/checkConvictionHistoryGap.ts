/**
 * D-NEW3: conviction_history EOD reconciliation / backfill
 * (FIX-CONVICTION-HISTORY-EOD-BACKFILL).
 *
 * Root cause (RAW-verified live 2026-07-29 via cron_job_runs.rows_written):
 * scanMarket's Step 5c (conviction scoring + conviction_history persistence)
 * used to run AFTER an early `if (allSignals.length === 0) return` guard, so
 * any scan cycle (09:00 open / 15:30 close) with zero qualifying signals
 * across the WHOLE watchlist silently skipped conviction_history writes for
 * every stock that cycle — NOT a crash, NOT a scheduling gap. That coupling
 * is fixed at the source in scanMarket.ts (Step 5c now runs unconditionally).
 * This check is the EOD self-heal for the pre-existing backlog and for any
 * future write-path failure the root-cause fix does not cover (e.g. a
 * transient DB error during Step 5c): every night at 23:00 GMT+7
 * (dataAuditJob:daily cadence) it finds trading days that have daily_ohlcv
 * data but zero conviction_history rows and recomputes conviction for them
 * from daily_ohlcv alone (no live fetch — sentiment/IMF dimensions are
 * live-scan-only enrichments that cannot be reconstructed for a past date;
 * they default to neutral, exactly like computeConviction's documented
 * behaviour for any omitted dimension).
 *
 * Layer: infrastructure/scheduler
 * DDD rules: may import from infrastructure/ and domain/; must not import
 * from application/ or interface/.
 */

import { Database } from "bun:sqlite";
import type { DomainType } from "../../../../bctc-schema.js";
import { VN_OFFSET_MS } from "../../../domain/services/timeConstants.js";
import { computeConviction, type ConvictionInput } from "../../../domain/services/convictionScorer.js";
import { getContextStocksForWatchlist, computeSectorAverage } from "../../../domain/services/sectorPeers.js";
import { SqliteMarketPriceRepository } from "../../../infrastructure/db/repositories/SqliteMarketPriceRepository.js";
import { AuditFinding, insertFeedbackIfNew } from "../dataAuditShared.js";

// ─────────────────────────────────────────────────────────────────────────────
// Safety caps
// ─────────────────────────────────────────────────────────────────────────────

/** Never scan further back than this even if conviction_history has zero rows (fresh DB). */
const MAX_LOOKBACK_DAYS = 180;
/** Used only when conviction_history is empty — bounds the very first run. */
const FALLBACK_LOOKBACK_DAYS = 30;
/** Process at most this many gap days per invocation (oldest-first) — a large
 *  backlog converges over consecutive nightly runs instead of one long run. */
const MAX_GAP_DAYS_PER_RUN = 15;
/** Rolling-average volume window, matching the live scanMarket.getAvgVolumeSync convention. */
const AVG_VOLUME_HISTORY_LIMIT = 20;
const AVG_VOLUME_MIN_ROWS = 5;

// ─────────────────────────────────────────────────────────────────────────────
// Date helpers (VN calendar day — no external date library)
// ─────────────────────────────────────────────────────────────────────────────

function vnTodayStr(): string {
  const vnNow = new Date(Date.now() + VN_OFFSET_MS);
  return `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, "0")}-${String(vnNow.getUTCDate()).padStart(2, "0")}`;
}

function isoDaysAgo(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

// ─────────────────────────────────────────────────────────────────────────────
// Gap detection
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Finds "confirmed" trading days present in daily_ohlcv with ZERO
 * conviction_history rows, bounded to [lowerBound, vnToday) (today is always
 * excluded — a same-day partial session must never be flagged as a gap) and
 * capped at MAX_GAP_DAYS_PER_RUN (oldest-first).
 *
 * "Confirmed" = daily_ohlcv code coverage on that date >= current watchlist
 * size. This is self-deriving (no hardcoded ticker count): observed
 * daily_ohlcv coverage on a genuine trading day is HOSE-wide (hundreds of
 * codes), always far above the watchlist's own size, so this floor safely
 * rejects stray/partial rows without guessing a magic constant.
 *
 * lowerBound derives from MIN(conviction_history.date) — the day conviction
 * scoring started existing; dates before that are legitimately absent, not a
 * gap. Falls back to a bounded window when conviction_history is empty.
 */
export function findConvictionHistoryGapDays(db: Database, vnToday: string): string[] {
  let watchlistCount = 0;
  try {
    watchlistCount =
      db.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM watchlist").get()?.cnt ?? 0;
  } catch {
    /* watchlist table may not exist in a minimal test DB */
  }
  const minCodes = Math.max(watchlistCount, 1);

  let earliest: string | null = null;
  try {
    earliest =
      db.query<{ mn: string | null }, []>("SELECT MIN(date) as mn FROM conviction_history").get()?.mn ??
      null;
  } catch {
    /* conviction_history may not exist yet */
  }

  const hardLower = isoDaysAgo(vnToday, MAX_LOOKBACK_DAYS);
  let lowerBound = earliest ?? isoDaysAgo(vnToday, FALLBACK_LOOKBACK_DAYS);
  if (lowerBound < hardLower) lowerBound = hardLower;

  try {
    const rows = db
      .query<{ date: string; conviction_rows: number }, [string, string, number]>(
        `SELECT d.date AS date,
                (SELECT COUNT(*) FROM conviction_history c WHERE c.date = d.date) AS conviction_rows
         FROM (
           SELECT date, COUNT(DISTINCT code) AS ohlcv_codes
           FROM daily_ohlcv
           WHERE date >= ? AND date < ?
           GROUP BY date
           HAVING COUNT(DISTINCT code) >= ?
         ) d
         ORDER BY d.date ASC`,
      )
      .all(lowerBound, vnToday, minCodes);

    return rows
      .filter((r) => r.conviction_rows === 0)
      .map((r) => r.date)
      .slice(0, MAX_GAP_DAYS_PER_RUN);
  } catch {
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Backfill computation (daily_ohlcv only — no live fetch)
// ─────────────────────────────────────────────────────────────────────────────

/** changePct + same-day volume for a code on `date`, from daily_ohlcv alone.
 *  Returns null (honest gap, never fabricated) when today's row or the prior
 *  trading row is missing. */
function computeChangePct(
  db: Database,
  code: string,
  date: string,
): { changePct: number; volume: number } | null {
  let todayRow: { close: number; volume: number } | null = null;
  let priorClose: number | null = null;
  try {
    todayRow =
      db
        .query<{ close: number; volume: number }, [string, string]>(
          "SELECT close, volume FROM daily_ohlcv WHERE code = ? AND date = ?",
        )
        .get(code, date) ?? null;
    priorClose =
      db
        .query<{ close: number }, [string, string]>(
          "SELECT close FROM daily_ohlcv WHERE code = ? AND date < ? ORDER BY date DESC LIMIT 1",
        )
        .get(code, date)?.close ?? null;
  } catch {
    return null;
  }
  if (!todayRow || priorClose == null || priorClose === 0) return null;
  return { changePct: ((todayRow.close - priorClose) / priorClose) * 100, volume: todayRow.volume };
}

/** Rolling average volume over up to AVG_VOLUME_HISTORY_LIMIT prior trading
 *  rows (excluding `date`); undefined (dimension dropped) when fewer than
 *  AVG_VOLUME_MIN_ROWS exist — same drop-not-zero convention as
 *  scanMarket.getAvgVolumeSync. */
function getAvgVolume(db: Database, code: string, date: string): number | undefined {
  try {
    const rows = db
      .query<{ volume: number }, [string, string]>(
        `SELECT volume FROM daily_ohlcv WHERE code = ? AND date < ? ORDER BY date DESC LIMIT ${AVG_VOLUME_HISTORY_LIMIT}`,
      )
      .all(code, date);
    if (rows.length < AVG_VOLUME_MIN_ROWS) return undefined;
    return rows.reduce((s, r) => s + r.volume, 0) / rows.length;
  } catch {
    return undefined;
  }
}

/**
 * Recomputes and upserts conviction_history rows for every current watchlist
 * stock on `date` from daily_ohlcv only. Reuses
 * SqliteMarketPriceRepository.upsertConvictionHistory (SSOT writer — no
 * duplicated INSERT logic). Returns the number of rows actually written.
 */
export function backfillConvictionForDate(db: Database, date: string): number {
  let watchlistRows: { code: string; domain: string }[] = [];
  try {
    watchlistRows = db
      .query<{ code: string; domain: string }, []>("SELECT code, domain FROM watchlist")
      .all();
  } catch {
    return 0;
  }
  if (watchlistRows.length === 0) return 0;

  const watchlistEntries = watchlistRows.map((w) => ({
    actionCode: w.code,
    domain: (w.domain || "other") as DomainType,
  }));
  const codeToDomain = new Map(watchlistEntries.map((w) => [w.actionCode, w.domain]));

  // Sector averages: watchlist + sector-peer context stocks, mirroring the
  // live scanMarket Step 3b/4 domain-bucket construction (pure functions,
  // safe to reuse for a historical date).
  const contextStocks = getContextStocksForWatchlist(watchlistEntries);
  const pricesByDomain = new Map<DomainType, { code: string; changePct: number }[]>();

  for (const w of watchlistEntries) {
    if (w.domain === "other") continue;
    const cp = computeChangePct(db, w.actionCode, date);
    if (!cp) continue;
    const list = pricesByDomain.get(w.domain) ?? [];
    list.push({ code: w.actionCode, changePct: cp.changePct });
    pricesByDomain.set(w.domain, list);
  }
  for (const c of contextStocks) {
    const cp = computeChangePct(db, c.code, date);
    if (!cp) continue;
    const list = pricesByDomain.get(c.domain) ?? [];
    list.push({ code: c.code, changePct: cp.changePct });
    pricesByDomain.set(c.domain, list);
  }

  const sectorAverages = new Map<DomainType, number>();
  for (const [domain, domainPrices] of pricesByDomain) {
    const avg = computeSectorAverage(domainPrices);
    if (avg !== null) sectorAverages.set(domain, avg);
  }

  const repo = new SqliteMarketPriceRepository(db);
  const nowIso = new Date().toISOString();
  let written = 0;

  for (const w of watchlistEntries) {
    const cp = computeChangePct(db, w.actionCode, date);
    if (!cp) continue; // no daily_ohlcv data for this code on this date — honest gap, skip (never fabricate)

    const domain = codeToDomain.get(w.actionCode);
    const sectorAvg = domain && domain !== "other" ? sectorAverages.get(domain) : undefined;
    const avgVolume = getAvgVolume(db, w.actionCode, date);

    const input: ConvictionInput = {
      code: w.actionCode,
      changePct: cp.changePct,
      volume: cp.volume,
    };
    if (avgVolume != null) input.avgVolume = avgVolume;
    if (sectorAvg != null) input.sectorAvgPct = sectorAvg;

    const conviction = computeConviction(input);

    const wrote = repo.upsertConvictionHistory({
      symbol: w.actionCode,
      date,
      peakScore: conviction.score,
      dominantSignal: conviction.direction,
      createdAt: nowIso,
    });
    if (wrote) written++;
  }

  return written;
}

// ─────────────────────────────────────────────────────────────────────────────
// Public audit-check entry point
// ─────────────────────────────────────────────────────────────────────────────

export function checkConvictionHistoryGap(db: Database): AuditFinding[] {
  try {
    const today = vnTodayStr();
    const gapDays = findConvictionHistoryGapDays(db, today);

    if (gapDays.length === 0) {
      return [
        {
          table: "conviction_history",
          check: "conviction_history_gap",
          severity: "info",
          rowsAffected: 0,
          action: "none",
          detail: "No conviction_history gap days found in the lookback window",
        },
      ];
    }

    let totalWritten = 0;
    const backfilledDays: string[] = [];
    for (const day of gapDays) {
      const written = backfillConvictionForDate(db, day);
      totalWritten += written;
      if (written > 0) backfilledDays.push(day);
    }

    // A "confirmed" gap day can still be genuinely unfixable — e.g. the
    // earliest daily_ohlcv record on file for every watchlist code, with no
    // prior trading row to compute changePct from (computeChangePct honestly
    // refuses to fabricate a baseline). Report as action="none" (not
    // "flagged") in that case: nothing was actually repaired, and re-flagging
    // an unfixable date every night would spam agent_feedback forever since
    // it can never gain a conviction row.
    if (totalWritten === 0) {
      return [
        {
          table: "conviction_history",
          check: "conviction_history_gap",
          severity: "warning",
          rowsAffected: 0,
          action: "none",
          detail: (
            `${gapDays.length} trading day(s) have daily_ohlcv data but 0 conviction rows and could ` +
            `NOT be backfilled (no prior-day baseline to compute changePct from): ${gapDays.join(", ")}`
          ).slice(0, 480),
        },
      ];
    }

    const finding: AuditFinding = {
      table: "conviction_history",
      check: "conviction_history_gap",
      severity: "warning",
      rowsAffected: totalWritten,
      action: "flagged",
      detail: (
        `EOD reconciliation backfilled ${totalWritten} conviction_history row(s) across ` +
        `${backfilledDays.length} trading day(s) with daily_ohlcv data but 0 conviction rows: ${backfilledDays.join(", ")}`
      ).slice(0, 480),
    };
    insertFeedbackIfNew(db, finding);
    return [finding];
  } catch (err) {
    return [
      {
        table: "conviction_history",
        check: "conviction_history_gap",
        severity: "warning",
        rowsAffected: 0,
        action: "none",
        detail: `Check failed: ${(err as Error).message}`.slice(0, 200),
      },
    ];
  }
}
