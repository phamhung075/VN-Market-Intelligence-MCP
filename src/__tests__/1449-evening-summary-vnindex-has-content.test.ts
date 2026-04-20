/**
 * TASK 1449 — hasContent must include vnIndex != null
 *
 * When VPS pipeline is down but VNDirect is up, assembleEveningSummary returns
 * a non-null vnIndex with no movers/alerts/stories. Before the fix hasContent
 * was false → silent skip. After the fix sendFn must be called.
 */

import { describe, it, expect, mock } from "bun:test";
import { runEveningSummary, resetEveningSummaryGuard } from "../scheduler/eveningSummaryJob.js";
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
  it("calls sendFn when summary has only vnIndex (no movers/alerts/stories)", async () => {
    resetEveningSummaryGuard();

    const summaryFn = mock(async () => EMPTY_SUMMARY);
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).toHaveBeenCalledTimes(1);
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
