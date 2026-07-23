/**
 * FIX-PREDICTION-SIGNALS-EMPTY — staleness guard must fire when
 * fetchPolymarkets() resolves to [] repeatedly (never throws) instead of
 * only when it throws.
 *
 * Root cause (RAW-verified live against the production container +
 * market.db, see docs/agent-memory/decisions/
 * sprint-FIX-PREDICTION-SIGNALS-EMPTY-dev-mcp-server.md):
 *   - fetchPolymarkets() (infrastructure/fetchers/polymarket.ts) is a
 *     documented "never throws" fetcher — it swallows CLOB (403 geo-block,
 *     already known) AND Gamma failures internally and simply resolves to
 *     `[]`. Live container logs (2026-07-23) show Gamma failing on every
 *     single poll cycle with `ERR_TLS_CERT_ALTNAME_INVALID` — a live probe
 *     (`curl -v` from inside the mcp-server container) confirmed
 *     gamma-api.polymarket.com resolves to 145.239.225.117, which serves a
 *     TLS certificate for the unrelated `CN=*.anj.fr` (a network-level
 *     block/redirect, not an application bug) — so every fetch cycle
 *     resolves successfully to a market list of zero.
 *   - Because fetchPolymarkets() never throws, runPredictionMarketPoll()'s
 *     Step 3 try/catch (whose catch branch falls back to
 *     loadPreviousSnapshot() and continues toward the staleness guard) never
 *     fires.
 *   - The old Step 5 early return (`if (currentMarkets.length === 0) return;`)
 *     sat BEFORE Step 5b's staleness/degradation guard (checkStaleness() +
 *     cooldown-gated Telegram bug alert), so that guard was structurally
 *     UNREACHABLE for as long as the fetch kept resolving to `[]`.
 *   - Live impact confirmed via `cron_job_runs`: predictionMarketPollJob logs
 *     status=success every ~30min (rows_written=null — the job-table runner
 *     never surfaces a count) while prediction_signals sits frozen at 6 rows
 *     (3 of which are additionally `t163-*` test fixtures that leaked into
 *     the production DB — a separate, untouched finding) since 2026-04-27 —
 *     87 days as of this fix, with prediction_markets itself last
 *     successfully refreshed 2026-06-30 (23 days frozen).
 *
 * Fix: reorder runPredictionMarketPoll() (scheduler/macro/predictionMarketJob.ts)
 * so the staleness guard runs unconditionally BEFORE the empty-markets early
 * return. No change to fetchPolymarkets()/CLOB/Gamma network code — the
 * TLS/geo-block itself is an external network condition outside this zone's
 * ownership; this fix restores the job's own dead degradation-alert code
 * path so a persistently-blocked/empty upstream is surfaced instead of
 * silently reported as "success" forever.
 *
 * Runs through the REAL initDatabase()/getDb() singleton path
 * (Bun.env["DB_PATH"] = ":memory:"), NOT a hand-rolled isolated fixture —
 * follows the DS-DEGRADE-01-FIX precedent (a hand-rolled :memory: schema is
 * exactly what hid that bug for 6 weeks).
 *
 * Covered cases:
 *   TC-1: fetchFn resolves [] (mirrors production fetchPolymarkets() never
 *         throwing) + prediction_markets already stale (fetched_at older
 *         than threshold) -> staleness Telegram alert fires, signal
 *         detection is skipped. BEFORE this fix: silent "no markets to
 *         process" return, ZERO alert, ZERO signal-detector call skip
 *         recorded — the exact live bug.
 *   TC-2: fetchFn resolves [] + prediction_markets fresh (this cycle already
 *         wrote a row, e.g. some other path populated it) -> no regression:
 *         still returns cleanly, no alert, no signals inserted.
 *   TC-3: fetchFn resolves [] + prediction_markets has NEVER had a
 *         successful snapshot (empty table, ageHours=Infinity) -> staleness
 *         alert fires immediately (isStale is true by definition on an
 *         empty table) — greenfield/cold-start now fails loud instead of
 *         silent from cycle 1.
 */

Bun.env["DB_PATH"] = ":memory:";

import { describe, it, expect, beforeAll, beforeEach } from "bun:test";
import { initDatabase, getDb } from "../infrastructure/db/schema.js";
import {
  runPredictionMarketPoll,
  _resetStalenessAlertCooldown,
} from "../scheduler/macro/predictionMarketJob.js";

beforeAll(async () => {
  await initDatabase();
});

beforeEach(() => {
  _resetStalenessAlertCooldown();
  const db = getDb();
  db.run("DELETE FROM prediction_markets");
  db.run("DELETE FROM prediction_signals");
});

function seedMarketRow(fetchedAt: string): void {
  const db = getDb();
  db.run(
    `INSERT INTO prediction_markets
      (id, question, end_date, yes_price, no_price, volume_24h, volume_total,
       liquidity, last_trade_price, unique_wallets, tags, fetched_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      "fix-pred-signals-empty-mkt-1",
      "Will X happen by 2026?",
      "2026-12-31T00:00:00.000Z",
      0.5, 0.5, 1000, 1000, 100, 0.5, 10,
      "[]",
      fetchedAt,
      fetchedAt,
    ],
  );
}

describe("FIX-PREDICTION-SIGNALS-EMPTY — staleness guard reachable on an empty-but-not-throwing fetch", () => {
  it("TC-1: repeated empty fetch + already-stale prediction_markets -> staleness alert fires (was silently swallowed)", async () => {
    const staleTimestamp = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    seedMarketRow(staleTimestamp);

    const telegramMessages: string[] = [];
    let signalDetectorCalled = false;

    // NOTE: no opts.db — exercises the real Step 2 initDatabase()/getDb() branch.
    await runPredictionMarketPoll({
      enabled: true,
      fetchFn: async () => [], // mirrors production fetchPolymarkets() resolving [] without throwing
      telegramFn: async (msg: string) => { telegramMessages.push(msg); },
      staleThresholdHours: 24,
      _signalDetectorSpy: () => { signalDetectorCalled = true; return []; },
    });

    const bugAlerts = telegramMessages.filter((m) => m.toLowerCase().includes("stale"));
    expect(bugAlerts.length).toBe(1);
    expect(bugAlerts[0]).toMatch(/\d+/); // ageHours surfaced for ops debugging
    expect(signalDetectorCalled).toBe(false);
  });

  it("TC-2: repeated empty fetch + fresh prediction_markets -> no regression (clean return, no alert, no signals)", async () => {
    const freshTimestamp = new Date(Date.now() - 60 * 1000).toISOString();
    seedMarketRow(freshTimestamp);

    const telegramMessages: string[] = [];
    let signalDetectorCalled = false;

    await runPredictionMarketPoll({
      enabled: true,
      fetchFn: async () => [],
      telegramFn: async (msg: string) => { telegramMessages.push(msg); },
      staleThresholdHours: 24,
      _signalDetectorSpy: () => { signalDetectorCalled = true; return []; },
    });

    expect(telegramMessages.filter((m) => m.toLowerCase().includes("stale")).length).toBe(0);
    expect(signalDetectorCalled).toBe(false);

    const signalCount = (
      getDb().query("SELECT COUNT(*) as n FROM prediction_signals").get() as { n: number }
    ).n;
    expect(signalCount).toBe(0);
  });

  it("TC-3: repeated empty fetch + prediction_markets never populated (empty table) -> staleness alert fires immediately", async () => {
    const telegramMessages: string[] = [];

    await runPredictionMarketPoll({
      enabled: true,
      fetchFn: async () => [],
      telegramFn: async (msg: string) => { telegramMessages.push(msg); },
      staleThresholdHours: 24,
    });

    const bugAlerts = telegramMessages.filter((m) => m.toLowerCase().includes("stale"));
    expect(bugAlerts.length).toBe(1);
  });
});
