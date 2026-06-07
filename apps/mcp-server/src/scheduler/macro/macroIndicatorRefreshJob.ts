/**
 * Scheduler — Macro Indicator Daily Refresh Job
 *
 * Runs daily at 06:00 GMT+7 (before market open) to refresh macro data.
 * Uses multi-source fetcher with fallback chain.
 * Validates freshness SLA post-refresh and escalates on breach.
 * Detects stale data on startup and alerts.
 *
 * Task 239: Daily refresh enforcement + SLA validation
 *
 * @module scheduler/macro/macroIndicatorRefreshJob
 */

import { getDb } from "../../infrastructure/db/schema.js";
import { getMacroSnapshot, getMacroExternal } from "../../infrastructure/microservices/clients.js";
import { freshnessSlaChecker, detectStartupStaleData } from "../../domain/services/macroIndicatorSla.js";
import { sendTelegramWork } from "../../infrastructure/notifiers/telegram.js";
import type { Database } from "bun:sqlite";
import { logger } from "../../infrastructure/logger.js";
import { recordJobMetrics } from "../../infrastructure/observability/jobMetrics.js";
import { fetchFedFundsRate } from "../../infrastructure/fetchers/fredApi.js";
import { fetchFredEffrIorb } from "../../infrastructure/fetchers/fredEffrIorb.js";
import { fetchFredIsmSubcomponents } from "../../infrastructure/fetchers/fredIsmSubcomponents.js";


// ─────────────────────────────────────────────────────────────────────────────
// Parsing helpers — exported for unit tests (Task 1924a)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Parses a numeric percent value from a TradingEconomics text description.
 *
 * Example input:
 *   "Inflation Rate in Vietnam increased to 5.46 percent in April from 4.65 percent..."
 * Returns 5.46 (the first number followed by " percent").
 *
 * Returns null if no match found or text is empty.
 */
export function parseCpiFromText(text: string): number | null {
  if (!text) return null;
  const m = text.match(/(\d+\.?\d*)\s*percent/i);
  return m ? parseFloat(m[1]!) : null;
}

/**
 * Parses a numeric PMI value from a TradingEconomics text description.
 *
 * Example input: "Manufacturing PMI in Vietnam fell to 47.50 in April from 48.30 in March of 2026."
 * Returns 47.50 (first decimal number after a directional/positional word).
 *
 * Returns null if no match found or text is empty.
 */
export function parsePmiFromText(text: string): number | null {
  if (!text) return null;
  // Match "to X.Y", "at X.Y", "was X.Y", "is X.Y" — decimal preferred
  const decimal = text.match(/(?:to|at|was|is)\s+(\d+\.\d+)/i);
  if (decimal) return parseFloat(decimal[1]!);
  // Fallback: first standalone decimal number in PMI plausible range (25-80)
  const any = text.match(/\b(\d{2}\.\d+)\b/);
  if (any) {
    const v = parseFloat(any[1]!);
    if (v >= 25 && v <= 80) return v;
  }
  return null;
}

/**
 * Extracts the numeric CPI from a /macro/external response envelope.
 * Path: sources.tradingEconomics.data.inflation_cpi.latestValue
 * Returns null on any missing/invalid path.
 */
function parseCpiFromExternal(
  ext: Awaited<ReturnType<typeof getMacroExternal>>
): number | null {
  try {
    const te = ext?.sources?.tradingEconomics;
    if (!te || te.status !== 'ok') return null;
    const cpiEntry = te.data?.['inflation_cpi'];
    if (!cpiEntry) return null;
    return parseCpiFromText(cpiEntry.latestValue as string);
  } catch {
    return null;
  }
}

/**
 * Extracts the numeric manufacturing PMI from a /macro/external response envelope.
 * Path: sources.tradingEconomics.data.manufacturing_pmi.latestValue
 * Returns null on any missing/invalid path.
 */
function parsePmiFromExternal(
  ext: Awaited<ReturnType<typeof getMacroExternal>>
): number | null {
  try {
    const te = ext?.sources?.tradingEconomics;
    if (!te || te.status !== 'ok') return null;
    const pmiEntry = te.data?.['manufacturing_pmi'];
    if (!pmiEntry) return null;
    return parsePmiFromText(pmiEntry.latestValue as string);
  } catch {
    return null;
  }
}

/**
 * Wraps sendTelegramWork to match the expected callback signature.
 * The domain service expects: (channel: string, message: string) => Promise<void>
 * But sendTelegramWork is: (text: string, options?: SendTelegramOptions) => Promise<boolean>
 */
async function telegramCallback(
  channel: string,
  message: string,
  options?: { tag?: string },
): Promise<void> {
  if (channel === "work") {
    const textWithTag = options?.tag ? `[${options.tag}] ${message}` : message;
    await sendTelegramWork(textWithTag);
  }
}

/** EFFR staleness SLA bound — 96 hours (covers FRED business-day lag + weekends). */
export const EFFR_STALE_BOUND_MS = 96 * 60 * 60 * 1000;

/**
 * DPI-FU-A: Check EFFR staleness and alert WORK channel when stale >96h.
 *
 * Reads the latest EFFR date from fred_series_daily. If the most recent
 * business day covered is older than EFFR_STALE_BOUND_MS, sends a
 * WORK channel alert so ops can diagnose the network connectivity issue
 * (container → fred.stlouisfed.org).
 *
 * Exported for unit tests.
 */
export async function checkAndAlertEffrStaleness(
  db: ReturnType<typeof getDb>,
  nowMs?: number,
  sendWorkFn: (msg: string) => Promise<unknown> = sendTelegramWork,
): Promise<void> {
  try {
    const row = db
      .prepare<{ maxdate: string | null }, []>(
        `SELECT MAX(date) AS maxdate FROM fred_series_daily WHERE series = 'EFFR'`,
      )
      .get();

    if (!row || !row.maxdate) {
      logger.error("[macroRefresh] EFFR stale-check: no rows in fred_series_daily for EFFR — FRED never successfully fetched");
      await sendWorkFn(
        "[DPI-FU-A] EFFR STALE ALERT: fred_series_daily has zero EFFR rows. " +
        "Root cause: FRED (fred.stlouisfed.org) unreachable from container — check Docker network / outbound connectivity.",
      );
      return;
    }

    const latestDate = new Date(row.maxdate + "T00:00:00Z");
    const ageMs = (nowMs ?? Date.now()) - latestDate.getTime();

    if (ageMs > EFFR_STALE_BOUND_MS) {
      const ageDays = (ageMs / 86_400_000).toFixed(1);
      logger.error(
        `[macroRefresh] EFFR stale: latest date ${row.maxdate} is ${ageDays} days old (>96h SLA)`,
        { latestDate: row.maxdate, ageDays },
      );
      await sendWorkFn(
        `[DPI-FU-A] EFFR STALE ALERT: latest DB date = ${row.maxdate} (${ageDays}d ago, >96h SLA). ` +
        `Root cause: FRED (fred.stlouisfed.org) unreachable from mcp-server container. ` +
        `Action required: check container outbound network / DNS / firewall rules.`,
      );
    } else {
      logger.debug(`[macroRefresh] EFFR freshness OK: latest date ${row.maxdate}`);
    }
  } catch (err) {
    logger.error("[macroRefresh] EFFR stale-check failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Main job: fetch macro indicators from microservice, validate SLA.
 *
 * Calls getMacroSnapshot() from macro-service and logs results to WORK channel.
 * If SLA is breached (data > 24h old), sends escalation alert.
 */
export async function macroIndicatorRefreshJob(): Promise<void> {
  const db = getDb();
  const startTime = Date.now();
  let jobErrorCount = 0;
  let jobSuccessCount = 0;

  try {
    // Call macro-service microservice
    const snapshot = await getMacroSnapshot();

    // Fetch live VN CPI/GDP from /macro/external (separate call, non-blocking on failure).
    // Task 1924a: parse CPI from TradingEconomics text description.
    const extData = await getMacroExternal();
    const parsedCpi = parseCpiFromExternal(extData);
    const parsedPmi = parsePmiFromExternal(extData);
    if (parsedCpi !== null) {
      logger.info(`[macro-refresh-job] parsed VN CPI from /macro/external: ${parsedCpi}%`);
    } else {
      logger.warn("[macro-refresh-job] VN CPI parse failed or /macro/external unavailable — DB value preserved via COALESCE");
    }
    if (parsedPmi !== null) {
      logger.info(`[macro-refresh-job] parsed VN manufacturing PMI from /macro/external: ${parsedPmi}`);
    } else {
      logger.warn("[macro-refresh-job] VN PMI parse failed or /macro/external unavailable — DB value preserved via COALESCE");
    }

    const durationMs = Date.now() - startTime;

    jobSuccessCount = 1;

    // Upsert key Vietnam macro indicators into macro_indicators table.
    // This is the write path that populates the local SQLite copy from the
    // macro-service snapshot. UNIQUE(country) constraint → ON CONFLICT UPDATE.
    //
    // The /macro/snapshot endpoint returns oilUsd, goldUsd, usdVnd from Yahoo Finance.
    // sbvRefinancingRate is not exposed by this endpoint (reads from macro_indicators
    // itself in the macro-service container) — left null here.
    // commodity_prices table (separate) receives oil/gold via commodityTrackerRefresh.
    try {
      // Task 1923a: use lowercase 'vietnam' to match DB SSOT (country='vietnam').
      // Macro snapshot provides interest_rate only (sbvRefinancingRate).
      // manufacturing_pmi, cpi, gdp_growth, inflation_rate are not exposed by
      // /macro/snapshot — guard with null-safe coalesce so existing DB values
      // are preserved when the snapshot doesn't carry these fields.
      db.prepare(
        `INSERT INTO macro_indicators
           (country, interest_rate, manufacturing_pmi, cpi, gdp_growth, inflation_rate, fetched_at, last_refresh_job)
         VALUES (?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))
         ON CONFLICT(country) DO UPDATE SET
           interest_rate    = COALESCE(excluded.interest_rate,    interest_rate),
           manufacturing_pmi = COALESCE(excluded.manufacturing_pmi, manufacturing_pmi),
           cpi              = COALESCE(excluded.cpi,              cpi),
           gdp_growth       = COALESCE(excluded.gdp_growth,       gdp_growth),
           inflation_rate   = COALESCE(excluded.inflation_rate,   inflation_rate),
           fetched_at       = excluded.fetched_at,
           last_refresh_job = excluded.last_refresh_job`
      ).run(
        "vietnam",
        snapshot.sbvRefinancingRate ?? null,
        parsedPmi,  // manufacturing_pmi — from /macro/external TE parse (null preserved via COALESCE)
        parsedCpi,  // cpi — from /macro/external parse (null preserved via COALESCE if unavailable)
        null,       // gdp_growth       — not in macro snapshot; preserved via COALESCE
        null,       // inflation_rate   — not in macro snapshot; preserved via COALESCE
      );
      logger.info("[macro-refresh-job] macro_indicators upserted for vietnam");
    } catch (upsertErr) {
      // Non-fatal: log and continue — the Telegram notification still goes out
      logger.warn(
        `[macro-refresh-job] macro_indicators upsert skipped: ${upsertErr instanceof Error ? upsertErr.message : String(upsertErr)}`
      );
    }

    // Also persist commodity snapshot to commodity_prices table (source-keyed) so
    // MCP tools that read commodity_prices get fresh oil/gold/FX data.
    // Only write if at least one value is non-null to avoid empty noise rows.
    // commodity_prices schema: PRIMARY KEY = source, named cols per commodity.
    //
    // DSI-S1-MACRO FR-MAC-5: DO NOT use ?? 0 as a fallback for commodity values.
    // A fetch failure must NOT write 0 to the DB as if it were a fresh real value.
    // Instead: use COALESCE in the upsert so a null fetch-result preserves the
    // previous good value in the DB (the prior fetched_at is also preserved via
    // the COALESCE on that column — only update fetched_at when we have a real value).
    if (snapshot.oilUsd != null || snapshot.goldUsd != null || snapshot.usdVnd != null) {
      try {
        const now = new Date().toISOString();
        // DSI-S1-MACRO FR-MAC-5: per-column preserve-prior guard.
        // On conflict (row already exists): only overwrite a column if the incoming
        // value is non-null AND non-zero. A null/zero component preserves the
        // previous DB value and does NOT re-stamp fetched_at for that column.
        // On first insert (no prior row): use 0 as placeholder for unavailable values
        // (the NOT NULL constraint requires a value; 0 will be overwritten on the
        // next successful fetch via the ON CONFLICT DO UPDATE path).
        const oilVal  = snapshot.oilUsd  ?? 0;
        const goldVal = snapshot.goldUsd ?? 0;
        const vndVal  = snapshot.usdVnd  ?? 0;
        // fetched_at is only updated if at least one commodity value is real (non-null,
        // non-zero). This prevents a failed-all-commodity fetch from re-stamping the
        // timestamp to now (which would masquerade a stale row as freshly fetched).
        const anyReal = (snapshot.oilUsd != null && snapshot.oilUsd !== 0)
                      || (snapshot.goldUsd != null && snapshot.goldUsd !== 0)
                      || (snapshot.usdVnd != null && snapshot.usdVnd !== 0);
        db.prepare(
          `INSERT INTO commodity_prices
             (source, brent_crude_usd, gold_usd_per_oz, usd_vnd_rate, fetched_at)
           VALUES ('macro-snapshot', ?, ?, ?, ?)
           ON CONFLICT(source) DO UPDATE SET
             brent_crude_usd = CASE WHEN excluded.brent_crude_usd != 0
                                    THEN excluded.brent_crude_usd ELSE brent_crude_usd END,
             gold_usd_per_oz = CASE WHEN excluded.gold_usd_per_oz != 0
                                    THEN excluded.gold_usd_per_oz ELSE gold_usd_per_oz END,
             usd_vnd_rate    = CASE WHEN excluded.usd_vnd_rate != 0
                                    THEN excluded.usd_vnd_rate ELSE usd_vnd_rate END,
             fetched_at      = CASE WHEN excluded.brent_crude_usd != 0
                                      OR excluded.gold_usd_per_oz != 0
                                      OR excluded.usd_vnd_rate != 0
                                    THEN excluded.fetched_at ELSE fetched_at END`
        ).run(
          oilVal,
          goldVal,
          vndVal,
          // Only pass `now` as fetched_at when at least one value is real.
          // When all are failed fetches (zeroed), pass the sentinel unchanged
          // placeholder — the CASE guard above will keep the prior fetched_at.
          anyReal ? now : now, // the CASE guard in DO UPDATE handles the real logic
        );
        logger.info("[macro-refresh-job] commodity_prices upserted from macro snapshot");
      } catch (commErr) {
        // Non-fatal — log and continue
        logger.warn(
          `[macro-refresh-job] commodity_prices upsert skipped: ${commErr instanceof Error ? commErr.message : String(commErr)}`
        );
      }
    }

    // Log result to WORK channel.
    // snapshot.vnIndex is nullable (macro-service may lack DB access at startup).
    // Use canonical oilUsd/goldUsd fields; legacy brentPrice/goldPrice aliases are equal.
    const vnIndexStr = snapshot.vnIndex != null ? snapshot.vnIndex.toFixed(0) : "N/A";
    const msg = `Macro refresh OK — VN-Index: ${vnIndexStr}, Brent: $${snapshot.brentPrice.toFixed(2)}, Gold: $${snapshot.goldPrice.toFixed(0)} [${durationMs}ms]`;
    await sendTelegramWork(msg);

    // Fetch Fed Funds Rate from FRED (Task 1423b)
    // Primary path: FRED CSV endpoint (fred.stlouisfed.org/graph/fredgraph.csv)
    // Fallback path (FIX-FRED-YAHOO-WEEKEND-STALE): when the CSV path fails (e.g.
    // weekend or Akamai WAF blocking), read the latest EFFR value from fred_series_daily
    // (populated by the REST API path in fetchFredEffrIorb) and write it to
    // tracked_indicators so the macro-indicators service always serves a current value.
    const fedRate = await fetchFedFundsRate(undefined, db);
    if (fedRate !== null) {
      logger.info(`[macroRefresh] fed_funds_rate = ${fedRate}%`);
    } else {
      logger.warn("[macroRefresh] fed_funds_rate CSV fetch returned null — trying EFFR daily fallback");
      // Fallback: read latest EFFR from fred_series_daily (REST API path — Akamai-free)
      try {
        const effrRow = db
          .prepare<{ value: number; date: string }, []>(
            `SELECT value, date FROM fred_series_daily
             WHERE series = 'EFFR' AND value != '.'
             ORDER BY date DESC LIMIT 1`,
          )
          .get();
        if (effrRow != null) {
          const extractedAt = new Date().toISOString();
          // Use same resilient insert as fredApi.ts (data_env column is migration-added)
          let inserted = false;
          try {
            db.prepare(
              `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at, data_env)
               VALUES (?, ?, ?, ?, ?, ?)`,
            ).run("fed_funds_rate", effrRow.value, "%", "fred_series_daily", extractedAt, "live");
            inserted = true;
          } catch (colErr) {
            const msg = colErr instanceof Error ? colErr.message : String(colErr);
            if (!msg.includes("data_env")) throw colErr;
          }
          if (!inserted) {
            db.prepare(
              `INSERT INTO tracked_indicators (indicator, value, unit, source, extracted_at)
               VALUES (?, ?, ?, ?, ?)`,
            ).run("fed_funds_rate", effrRow.value, "%", "fred_series_daily", extractedAt);
          }
          logger.info(
            `[macroRefresh] fed_funds_rate EFFR fallback OK — ${effrRow.value}% (date: ${effrRow.date})`,
          );
        } else {
          logger.warn("[macroRefresh] fed_funds_rate EFFR fallback: no rows in fred_series_daily — rate stays stale");
        }
      } catch (fallbackErr) {
        logger.error("[macroRefresh] fed_funds_rate EFFR fallback failed", {
          error: fallbackErr instanceof Error ? fallbackErr.message : String(fallbackErr),
        });
      }
    }

    // Fetch EFFR + IORB daily series from FRED (Task 1879a)
    const effrIorbResult = await fetchFredEffrIorb(undefined, db);
    if (effrIorbResult !== null) {
      logger.info(
        `[macroRefresh] EFFR/IORB persisted — EFFR: ${effrIorbResult.effrRows} new rows, IORB: ${effrIorbResult.iorbRows} new rows`,
        { effrRows: effrIorbResult.effrRows, iorbRows: effrIorbResult.iorbRows },
      );
    } else {
      logger.error("[macroRefresh] EFFR/IORB fetch returned null — FRED unreachable");
    }
    // DPI-FU-A: Fail-loud when EFFR is stale beyond the 96h SLA.
    // The fetcher uses INSERT OR IGNORE so when FRED is unreachable the DB row
    // date never advances. Detect staleness here and alert WORK channel so ops
    // can diagnose the network connectivity issue (container → fred.stlouisfed.org).
    await checkAndAlertEffrStaleness(db);

    // Fetch ISM Manufacturing sub-component series from FRED (Task 1910a)
    const ismResult = await fetchFredIsmSubcomponents(undefined, db);
    if (ismResult !== null) {
      const totalInserted = Object.values(ismResult.inserted).reduce((a, b) => a + b, 0);
      logger.info(
        `[macroRefresh] ISM sub-components persisted — ${totalInserted} new rows, failed: [${ismResult.failed.join(",")}]`,
        { inserted: ismResult.inserted, failed: ismResult.failed },
      );
    } else {
      logger.warn("[macroRefresh] ISM sub-components fetch returned null — FRED_API_KEY absent or unavailable");
    }

    // Check SLA after refresh
    const slaOk = await freshnessSlaChecker(db, telegramCallback);
    if (!slaOk) {
      // freshnessSlaChecker already sent the alert to WORK channel
      logger.warn("[macro-refresh-job] SLA check failed — alert sent to WORK");
    }
  } catch (err) {
    const durationMs = Date.now() - startTime;
    jobErrorCount = 1;
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error(`[macro-refresh-job] fatal error: ${errorMsg}`);
    await sendTelegramWork(
      `Macro refresh FAILED [${durationMs}ms] — ${errorMsg}`,
    );
  } finally {
    recordJobMetrics("macroRefresh", Date.now() - startTime, jobErrorCount, jobSuccessCount);
  }
}

/**
 * Startup validation: check if macro_indicators data is stale.
 *
 * On scheduler startup, validates that macro_indicators table has data
 * and that data is not older than 24 hours. If stale, sends WORK alert
 * but does NOT auto-correct.
 */
export async function validateMacroFreshnessOnStartup(): Promise<void> {
  const db = getDb();

  try {
    await detectStartupStaleData(db, telegramCallback);
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[macro-startup-validation] error: ${errorMsg}`);
    // Don't alert on validation errors — just log them
  }
}
