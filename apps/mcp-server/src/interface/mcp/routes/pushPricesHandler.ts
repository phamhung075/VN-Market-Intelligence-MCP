/**
 * Interface — /api/push-prices route handler
 *
 * Extracted from server.ts lines ~449–857 (Task 1406a).
 * Receives prices from VPS proxy, upserts to market_prices, writes OHLCV +
 * intraday ticks, then fires async signal/alert detection.
 *
 * DI contract: db + log are injected by the caller (server.ts handleRequest).
 * No getDb() calls here — db is always passed in.
 */

import type { IncomingMessage, ServerResponse } from "node:http";
import type { Database } from "bun:sqlite";
import { createLogger } from "../../../infrastructure/logger.js";
import { logVpsPush } from "../../../infrastructure/db/vpsPushLogStore.js";
import { sendTelegramWork } from "../../../infrastructure/notifiers/telegram.js";
import {
  _staleTickers_lastNotifiedDate,
  _setStaleTickers_lastNotifiedDate,
  isVnTradingWindowUtc,
} from "../server-startup.js";
import {
  writeOhlcvBatch,
  type OhlcvWriteRow,
} from "../../../application/usecases/ohlcvWriteService.js";

export async function handlePushPrices(
  req: IncomingMessage,
  res: ServerResponse,
  db: Database,
  log: ReturnType<typeof createLogger>,
): Promise<void> {
  const apiKey = Bun.env.VPS_PUSH_API_KEY;
  const authHeader =
    (req.headers["x-api-key"] as string | undefined) ||
    (req.headers["authorization"] as string | undefined)?.replace("Bearer ", "");
  if (!apiKey || authHeader !== apiKey) {
    res.writeHead(401, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Unauthorized" }));
    return;
  }

  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    if (!body.trim()) {
      logVpsPush({ service: "prices", itemsCount: 0, status: "error", errorMsg: "Empty request body" });
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Empty request body" }));
      return;
    }
    const prices: Array<{
      code: string;
      price: number;
      high?: string;
      low?: string;
      open?: string;
      close?: string;
      volume?: number;
      change_pct?: string;
      ref_price?: string;
      fetched_at?: string;
      type?: "stock" | "index" | "global_index";
    }> = JSON.parse(body);

    if (!Array.isArray(prices) || prices.length === 0) {
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ error: "Expected non-empty array" }));
      return;
    }

    // 1193: Capture handler start time BEFORE the upsert loop for lag_ms measurement
    const startMs = Date.now();

    const upsert = db.prepare(`
      INSERT OR REPLACE INTO market_prices (code, price, change_pct, volume, updated_at)
      VALUES (?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    const vnDate = new Date(Date.now() + 7 * 3600_000).toISOString().slice(0, 10);
    let count = 0;
    for (const p of prices) {
      if (!p.code || p.price == null) continue;
      // VN stocks: VPS API returns price in thousands (57.7 = 57,700 VND)
      // Indices + global: price is already in correct unit
      const isStock = !p.type || p.type === "stock";
      const priceVal = isStock ? p.price * 1000 : p.price;
      // Prefer computing change_pct from ref_price (exchange reference/previous
      // close) — VPS API .changePc may have wrong sign (report #1078: FPT
      // showed +0.64% instead of -0.64%). ref_price is .r from VPS API.
      // Fallback chain: ref_price → yesterday's OHLCV close → raw VPS change_pct.
      let changePct: number | null = null;
      const refPrice = p.ref_price ? parseFloat(p.ref_price) : 0;
      if (isStock && refPrice > 0) {
        const refPriceVnd = refPrice * 1000;
        changePct = Math.round(((priceVal - refPriceVnd) / refPriceVnd) * 10000) / 100;
      } else if (isStock) {
        // Before VPS redeploy: compute from yesterday's close in daily_ohlcv
        try {
          const prevRow = db.prepare<{ close: number }, [string, string]>(
            `SELECT close FROM daily_ohlcv WHERE code = ? AND date < ? ORDER BY date DESC LIMIT 1`,
          ).get(p.code, vnDate);
          if (prevRow && prevRow.close > 0) {
            changePct = Math.round(((priceVal - prevRow.close) / prevRow.close) * 10000) / 100;
          } else {
            changePct = p.change_pct ? parseFloat(p.change_pct) : null;
          }
        } catch {
          changePct = p.change_pct ? parseFloat(p.change_pct) : null;
        }
      } else {
        changePct = p.change_pct ? parseFloat(p.change_pct) : null;
      }
      // Task 1208: use server receive time (now), not VPS API timestamp (p.fetched_at)
      upsert.run(p.code, priceVal, changePct, p.volume ?? 0, now);
      count++;
    }

    // 1193: Post-upsert verification — catch DB singleton stale-FD failures.
    // Runs synchronously before sending the HTTP response so any write failure
    // is surfaced in the server log immediately (not deferred to next cycle).
    try {
      const verified = db.prepare(
        `SELECT COUNT(*) AS n FROM market_prices WHERE updated_at >= ?`,
      ).get(new Date(Date.now() - 5000).toISOString()) as { n: number };
      log.info("[push-prices] post-upsert verify", {
        inserted: count,
        visible: verified.n,
        lag_ms: Date.now() - startMs,
      });
      if (verified.n === 0 && count > 0) {
        log.error("[push-prices] WRITE INVISIBLE — DB singleton may be stale", {
          db_path: Bun.env["DB_PATH"] ?? "(unset)",
        });
      }
    } catch (verifyErr) {
      log.warn("[push-prices] post-upsert verify failed", {
        error: verifyErr instanceof Error ? verifyErr.message : String(verifyErr),
      });
    }

    // FIX B: Force WAL checkpoint after large price batch
    // Ensures writes are committed to the main database file, not just the WAL.
    if (count > 50) {
      try {
        db.exec("PRAGMA wal_checkpoint(RESTART)");
        log.info("[push-prices] WAL checkpoint forced", { count });
      } catch (e) {
        log.warn("[push-prices] WAL checkpoint failed", { error: String(e) });
      }
    }

    // Store 1-min ticks (today only — for intraday review)
    const histInsert = db.prepare(`
      INSERT OR IGNORE INTO market_prices_history (code, price, volume, fetched_at)
      VALUES (?, ?, ?, ?)
    `);
    for (const p of prices) {
      if (!p.code || p.price == null) continue;
      const isStock = !p.type || p.type === "stock";
      const pv = isStock ? p.price * 1000 : p.price;
      histInsert.run(p.code, pv, p.volume ?? 0, p.fetched_at ?? now);
    }

    // Update daily OHLCV via the SSOT choke-point (SUBTASK-3 migration).
    //
    // DOUBLE-SCALE FIX (×1000 root cause — FIX-OHLCV-SEED-CANDLE-UNIT-SCALE-P0 §1.4):
    //   Previously: handler applied `p.price * 1000` then wrote to DB directly.
    //   When VPS sends a pre-open reference price already in full-VND (e.g. 7,260),
    //   the handler ×1000 produced 7,260,000 — corrupting the row.
    //   Fix: pass RAW VPS prices to writeOhlcvBatch. The service's normalizeOhlcvToVnd
    //   applies ×1000 only when max(OHLC) < 100 (thousand-VND scale detection), and
    //   detectAndNormalizeScaleFromPrevClose catches the ÷1000 class (VHM/VIC/VJC).
    //   Price is normalized EXACTLY ONCE — in the service pipeline.
    //
    // CONTAM-2 / CONTAM-9 semantics preserved via conflictStrategy='intraday':
    //   open  = CASE WHEN daily_ohlcv.open < 100 THEN excluded.open ELSE daily_ohlcv.open END
    //   high  = MAX(daily_ohlcv.high, excluded.high)
    //   low   = CASE WHEN daily_ohlcv.low = 0 THEN excluded.low ELSE MIN(daily_ohlcv.low, excluded.low) END
    //   close = excluded.close  /  volume = excluded.volume
    //
    // RF-1 preserved: writeOhlcvBatch's validateOhlcvUnit is fail-closed (log.error + skip),
    //   never throws to the HTTP layer — VPS always receives HTTP 200.
    const ohlcvRows: OhlcvWriteRow[] = [];
    for (const p of prices) {
      if (!p.code || p.price == null) continue;
      const isStock = !p.type || p.type === "stock";
      // Pass RAW prices — no ×1000 here. The service normalizes via normalizeOhlcvToVnd
      // and detectAndNormalizeScaleFromPrevClose (DB-seeded prevClose).
      const rawClose = p.price;
      const rawHigh  = p.high  ? parseFloat(p.high)  : rawClose;
      const rawLow   = p.low   ? parseFloat(p.low)   : rawClose;
      ohlcvRows.push({
        code:   p.code,
        date:   vnDate,
        open:   rawClose,   // first push = open; subsequent conflict rules protect existing open
        high:   rawHigh,
        low:    rawLow,
        close:  rawClose,
        volume: p.volume ?? 0,
        type:   isStock ? "stock" : "index",
      });
    }

    // Errors inside writeOhlcvBatch are logged by the service; rejected[] is informational.
    // RF-1: writeOhlcvBatch never throws to the caller — all per-row failures are caught
    // and logged internally (validateOhlcvUnit fail-closed pattern).
    try {
      const ohlcvResult = await writeOhlcvBatch(ohlcvRows, db, {
        conflictStrategy: "intraday",
        vnToday: vnDate,
      });
      if (ohlcvResult.rejected.length > 0) {
        log.error("[push-prices] ohlcv rows rejected by unit guard", {
          count: ohlcvResult.rejected.length,
          samples: ohlcvResult.rejected.slice(0, 3),
        });
      }
      if (ohlcvResult.skipped > 0) {
        log.info("[push-prices] ohlcv seed-bars skipped (FR-S1)", { skipped: ohlcvResult.skipped });
      }
    } catch (ohlcvErr) {
      // Belt-and-suspenders: writeOhlcvBatch should not throw, but guard against it
      // so VPS always receives HTTP 200 (RF-1).
      log.error("[push-prices] writeOhlcvBatch unexpected error (RF-1 guard)", {
        error: ohlcvErr instanceof Error ? ohlcvErr.message : String(ohlcvErr),
      });
    }

    // Consolidate: keep only the last 24 h of ticks, delete older ones.
    // (daily OHLCV already preserves the day summary for 2+ years)
    // NOTE: must be a rolling 24 h window — an earlier version used
    // `vnDate + "T00:00:00Z"` which is VN midnight expressed as a UTC
    // string. During VN morning hours (UTC previous day) that threshold
    // is in the FUTURE relative to the just-written rows, so every push
    // self-destructed and market_prices_history stayed permanently empty.
    try {
      const cutoff = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
      db.prepare(`
        DELETE FROM market_prices_history WHERE fetched_at < ?
      `).run(cutoff);
    } catch { /* best effort */ }

    log.info("[push-prices] updated prices + OHLCV + ticks", { count, source: "vps-proxy" });
    // FIX-1274: logVpsPush wrapped in try/catch — a log-write failure must NEVER
    // return HTTP 400 to the VPS. If logVpsPush throws (e.g., vps_push_log is
    // missing extended columns added by schema migrations that haven't run yet on
    // this restart), the VPS would receive 400, increment its FAILURE_COUNT, and
    // enter exponential backoff (300s → 600s). After ~19 consecutive 400 responses
    // the accumulated backoff reaches ~2 hours — matching the "Gia co phieu: 2.0h
    // ago" symptom. market_prices is already written above; a missing log row is
    // far less harmful than triggering VPS backoff.
    try {
      logVpsPush({ service: "prices", itemsCount: count, status: "ok" });
    } catch (logErr) {
      log.warn("[push-prices] logVpsPush failed (non-fatal) — market_prices written, VPS gets 200", {
        error: logErr instanceof Error ? logErr.message : String(logErr),
      });
    }
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ ok: true, updated: count }));

    // ── Async: run signal detection + price alerts after response ────
    // Fire-and-forget — don't block the HTTP response
    setImmediate(async () => {
      try {
        // FIX C: Verify market_prices is still fresh 100ms later
        // Detects invisibility at the async phase, earlier than waiting for next cycle.
        const freshCheck = db.prepare(
          `SELECT COUNT(*) as n FROM market_prices WHERE updated_at >= ?`
        ).get(new Date(Date.now() - 1000).toISOString()) as { n: number };
        if (freshCheck.n === 0 && count > 0) {
          log.error("[push-prices] ASYNC: market_prices invisibility confirmed", {
            count, visible_now: freshCheck.n
          });
        }

        // ── FIX-1327: Detect stale watchlist tickers (>7 days) ────
        // Rate-limited to ONE aggregated WORK message per calendar day (UTC).
        // Avoids WORK channel spam when tickers have never been updated.
        try {
          const todayUtc = new Date().toISOString().slice(0, 10);
          if (_staleTickers_lastNotifiedDate !== todayUtc) {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
            const staleTickers = db.prepare(`
              SELECT w.code, mp.updated_at
              FROM watchlist w
              LEFT JOIN market_prices mp ON w.code = mp.code
              WHERE mp.updated_at IS NULL OR mp.updated_at < ?
              ORDER BY w.code
            `).all(sevenDaysAgo) as Array<{ code: string; updated_at: string | null }>;

            if (staleTickers.length > 0) {
              const lines = staleTickers.map((t) => {
                const lastUpdate = t.updated_at ? new Date(t.updated_at).toLocaleDateString() : "never";
                return `  • ${t.code} (last update: ${lastUpdate})`;
              });
              const msg = `[push-prices] ${staleTickers.length} stale watchlist tickers (>7d no update):\n${lines.join("\n")}`;
              await sendTelegramWork(msg, { parseMode: "" });
              log.warn("[push-prices] Stale tickers notified", { codes: staleTickers.map((t) => t.code) });
              _setStaleTickers_lastNotifiedDate(todayUtc);
            }
          }
        } catch (err) {
          log.error("[push-prices] Stale ticker detection failed", {
            error: err instanceof Error ? err.message : String(err),
          });
        }

        // Task 1380: suppress change_pct alerts outside VN trading window (02:00–08:59 UTC, Mon–Fri).
        // Pre-open pushes arrive with stale ref_price producing phantom % readings (GAS alert 316).
        if (!isVnTradingWindowUtc()) return;

        const { detectSignals } = await import("../../../domain/services/signalDetector.js");
        const { generateAlerts } = await import("../../../domain/services/alertGenerator.js");
        const { storeAlerts, shouldSkipAlreadyNotifiedAlert } = await import("../../../infrastructure/db/alertStore.js");
        const { checkPriceAlerts } = await import("../../../domain/services/priceAlertChecker.js");

        const signals: Array<import("../../../domain/services/signalDetector.js").Signal> = [];
        const priceMap = new Map<string, number>();

        // Compute avg DAILY volume from market_prices_history.
        // NOTE: market_prices_history is appended every VPS push (intraday ticks),
        // and `volume` is the cumulative daily session volume. Averaging raw rows
        // would compare current cumulative vs an intraday running average, which
        // drifts upward identically for ALL stocks across the session and produces
        // bogus uniform "5.3× spikes" (backlog 878 / Loop #34 manifest).
        // Fix: take the MAX(volume) per trading day (= end-of-day cumulative),
        // exclude today, average the last 20 closed days.
        const avgVolMap = new Map<string, number>();
        const todayUtc = new Date().toISOString().slice(0, 10);
        for (const p of prices) {
          if (!p.code) continue;
          try {
            const row = db.prepare(`
              SELECT AVG(day_vol) as avg_vol FROM (
                SELECT MAX(volume) as day_vol
                FROM market_prices_history
                WHERE code = ? AND substr(fetched_at, 1, 10) < ?
                GROUP BY substr(fetched_at, 1, 10)
                ORDER BY substr(fetched_at, 1, 10) DESC
                LIMIT 20
              )
            `).get(p.code, todayUtc) as { avg_vol: number | null } | undefined;
            if (row?.avg_vol && row.avg_vol > 0) avgVolMap.set(p.code, row.avg_vol);
          } catch { /* best effort */ }
        }
        console.log(`[volume-spike] avgVol map: ${JSON.stringify(Object.fromEntries(avgVolMap))}`);

        // Detect signals for each stock (skip indices)
        for (const p of prices) {
          if (!p.code || p.price == null) continue;
          const isStock = !p.type || p.type === "stock";
          if (!isStock) continue; // signals only for stocks, not indices
          const priceVnd = p.price * 1000;
          priceMap.set(p.code, priceVnd);
          // Compute previous price from ref_price (exchange reference) if available,
          // otherwise fall back to VPS change_pct (may have wrong sign — report #1078)
          const refP = p.ref_price ? parseFloat(p.ref_price) : 0;
          let previousPrice: number;
          if (refP > 0) {
            previousPrice = refP * 1000; // ref_price is in thousands like price
          } else {
            const pctFallback = p.change_pct ? parseFloat(p.change_pct) : 0;
            previousPrice = pctFallback !== 0 ? priceVnd / (1 + pctFallback / 100) : priceVnd;
          }
          // No fallback: if we lack ≥1 closed-day baseline, set avgVolume=0 so
          // signalDetector suppresses volume_spike entirely (see SD-02).
          const avgVolume = avgVolMap.get(p.code) ?? 0;

          const stockSignals = detectSignals({
            actionCode: p.code,
            price: priceVnd,
            previousPrice,
            volume: p.volume ?? 0,
            avgVolume,
          });

          if (stockSignals.length > 0) {
            signals.push(...stockSignals);
            log.info("[push-prices] signals detected", {
              code: p.code,
              signals: stockSignals.map(s => `${s.type}(${s.severity})`).join(", "),
            });
          }
        }

        // Generate and store alerts from signals
        if (signals.length > 0) {
          const watchlistRows = db.prepare("SELECT code FROM watchlist").all() as { code: string }[];
          const watchlistEntries = watchlistRows.map(r => ({ actionCode: r.code }));
          const alerts = generateAlerts(signals, watchlistEntries);

          if (alerts.length > 0) {
            storeAlerts(alerts, db);
            log.info("[push-prices] alerts stored", { count: alerts.length });

            // Send HIGH/CRITICAL alerts to Telegram — grouped by (signal_type, severity)
            const { groupAlertsBySignalSeverity, formatBatchGroupMessage } =
              await import("../../../domain/services/alertBatchGrouper.js");

            // Step 1 — filter to notifiable (high/critical, dedup guard applied per-alert)
            const notifiable = alerts.filter(
              (a) =>
                (a.severity === "high" || a.severity === "critical") &&
                !shouldSkipAlreadyNotifiedAlert(a.id, db),
            );

            // Step 2 — group by (signal_type, severity)
            const groups = groupAlertsBySignalSeverity(notifiable);

            // Step 3 — one Telegram send per group
            for (const group of groups) {
              try {
                const msg = formatBatchGroupMessage(group);
                await sendTelegramWork(msg, {
                  persist: { from_agent: "push-prices", message_type: "system_alert" },
                });
                // Mark all alerts in the group as notified
                for (const id of group.alertIds) {
                  db.prepare("UPDATE alerts SET notified_telegram = 1 WHERE id = ?").run(id);
                }
                log.info("[push-prices] batch alert sent", {
                  signalType: group.signalType,
                  severity:   group.severity,
                  count:      group.tickers.length,
                });
              } catch (tgErr) {
                // No IDs marked — consistent with existing per-alert error policy (EC-4)
                log.warn("[push-prices] Telegram batch send failed", {
                  error: tgErr instanceof Error ? tgErr.message : String(tgErr),
                });
              }
            }
          }
        }

        // Check user-defined price alerts (stop-loss / take-profit)
        try {
          const priceAlertRows = db.prepare(`
            SELECT id, code, alert_type, threshold FROM price_alerts WHERE status = 'active'
          `).all() as { id: number; code: string; alert_type: string; threshold: number }[];

          if (priceAlertRows.length > 0) {
            const triggered = checkPriceAlerts(
              priceAlertRows.map(r => ({
                id: r.id,
                code: r.code,
                alertType: r.alert_type,
                threshold: r.threshold,
              })),
              priceMap,
            );

            for (const t of triggered) {
              db.prepare("UPDATE price_alerts SET status = 'triggered', triggered_at = ? WHERE id = ?")
                .run(new Date().toISOString(), t.alertId);

              const typeLabel = t.alertType === "stop_loss" ? "CẮT LỖ" : "CHỐT LỜI";
              const msg = `[${typeLabel}] ${t.code} đạt ngưỡng ${t.threshold.toLocaleString()} VND (hiện tại: ${t.currentPrice.toLocaleString()} VND)`;
              await sendTelegramWork(msg, {
                persist: { from_agent: "push-prices", message_type: "system_alert" },
              });
              log.info("[push-prices] price alert fired", { code: t.code, type: t.alertType, threshold: t.threshold });
            }
          }
        } catch (paErr) {
          log.warn("[push-prices] price alert check failed", {
            error: paErr instanceof Error ? paErr.message : String(paErr),
          });
        }
      } catch (alertErr) {
        log.warn("[push-prices] post-push alert check failed", {
          error: alertErr instanceof Error ? alertErr.message : String(alertErr),
        });
      }
    });
  } catch (err) {
    log.error("[push-prices] parse error", { error: err instanceof Error ? err.message : String(err) });
    logVpsPush({ service: "prices", itemsCount: 0, status: "error", errorMsg: err instanceof Error ? err.message : String(err) });
    res.writeHead(400, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Invalid JSON" }));
  }
}
