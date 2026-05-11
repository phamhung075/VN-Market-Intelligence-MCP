/**
 * TASK 1449 — hasContent vnIndex parity
 *
 * Updated by TASK 222: vnIndex alone must NOT trigger send (VPS-down empty briefing bug).
 * vnIndex still renders in the message when present; it just cannot be the sole hasContent trigger.
 */

import { describe, it, expect, mock } from "bun:test";
import { runEveningSummary, resetEveningSummaryGuard } from "../scheduler/briefings/eveningSummaryJob.js";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";

const FRESH_FETCHED_AT = new Date().toISOString();

const EMPTY_SUMMARY: EveningSummary = {
  date: "2026-04-18",
  topStories: [],
  topAlerts: [],
  watchlistMovers: [],
  predictionSignals: [],
  predictionDiag: { stored: 0 },
  taDiag: { tickersWithSignal: 0, tickersBelowThreshold: 0, ohlcvRowsMin: 0, ohlcvRowsMax: 0 },
  taSummary: [],
  newsCount: 0,
  generatedAt: FRESH_FETCHED_AT,
  portfolioPnl: null,
  vnIndex: {
    close: 1250.5,
    change: 3.2,
    changePct: 0.26,
    fetchedAt: FRESH_FETCHED_AT,
  },
};

describe("1449 — eveningSummaryJob hasContent vnIndex parity", () => {
  it("does NOT call sendFn when summary has only vnIndex (no movers/alerts/stories) — task 222 fix", async () => {
    resetEveningSummaryGuard();

    const summaryFn = mock(async () => EMPTY_SUMMARY);
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).not.toHaveBeenCalled();
  });

  it("does NOT call sendFn when summary has no content at all (vnIndex also null)", async () => {
    resetEveningSummaryGuard();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { vnIndex: _dropped, ...rest } = EMPTY_SUMMARY;
    const emptySummary: EveningSummary = rest as EveningSummary;

    const summaryFn = mock(async () => emptySummary);
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).not.toHaveBeenCalled();
  });
});
