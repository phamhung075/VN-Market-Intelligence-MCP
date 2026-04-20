/**
 * TASK 207 — stale vnIndex must not trigger hasContent
 * Updated by TASK 222: fresh vnIndex alone also must NOT trigger send.
 *
 * ACs:
 * (a) stale vnIndex alone (fetchedAt 2 days ago) → sendFn NOT called
 * (b) fresh vnIndex alone (fetchedAt now) → sendFn NOT called (task 222 fix)
 * (c) stale vnIndex + fresh watchlistMovers → sendFn called once
 */

import { describe, it, expect, mock } from "bun:test";
import {
  runEveningSummary,
  resetEveningSummaryGuard,
} from "../scheduler/briefings/eveningSummaryJob.js";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";

const TWO_DAYS_AGO = new Date(Date.now() - 2 * 24 * 3600 * 1000).toISOString();
const JUST_NOW = new Date().toISOString();

const BASE_EMPTY: EveningSummary = {
  date: "2026-04-20",
  topStories: [],
  topAlerts: [],
  watchlistMovers: [],
  predictionSignals: [],
  predictionDiag: { stored: 0 },
  taDiag: {
    tickersWithSignal: 0,
    tickersBelowThreshold: 0,
    ohlcvRowsMin: 0,
    ohlcvRowsMax: 0,
  },
  taSummary: [],
  newsCount: 0,
  generatedAt: JUST_NOW,
  portfolioPnl: null,
};

describe("1523 — eveningSummaryJob stale vnIndex guard", () => {
  it("(a) stale vnIndex alone does NOT trigger send", async () => {
    resetEveningSummaryGuard();

    const summary: EveningSummary = {
      ...BASE_EMPTY,
      vnIndex: {
        close: 1250.5,
        change: -5.0,
        changePct: -0.4,
        fetchedAt: TWO_DAYS_AGO,
      },
    };

    const summaryFn = mock(async () => summary);
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).not.toHaveBeenCalled();
  });

  it("(b) fresh vnIndex alone does NOT trigger send — task 222 fix", async () => {
    resetEveningSummaryGuard();

    const summary: EveningSummary = {
      ...BASE_EMPTY,
      vnIndex: {
        close: 1255.0,
        change: 4.5,
        changePct: 0.36,
        fetchedAt: JUST_NOW,
      },
    };

    const summaryFn = mock(async () => summary);
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).not.toHaveBeenCalled();
  });

  it("(c) stale vnIndex + fresh watchlistMovers DOES trigger send", async () => {
    resetEveningSummaryGuard();

    const summary: EveningSummary = {
      ...BASE_EMPTY,
      vnIndex: {
        close: 1250.5,
        change: -5.0,
        changePct: -0.4,
        fetchedAt: TWO_DAYS_AGO,
      },
      watchlistMovers: [
        {
          code: "VCB",
          changePct: 2.5,
          price: 85000,
          exchange: "HOSE",
        },
      ],
    };

    const summaryFn = mock(async () => summary);
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).toHaveBeenCalledTimes(1);
  });
});
