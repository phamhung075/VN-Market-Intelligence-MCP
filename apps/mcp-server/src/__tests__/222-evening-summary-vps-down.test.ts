/**
 * TASK 222 — vnIndex alone must NOT trigger hasContent
 *
 * Root cause: when VPS is down, vnIndex.fetchedAt can be <25h stale on day 1,
 * making hasContent=true with 0 news/alerts/movers → empty briefing fires.
 *
 * ACs:
 * (a) fresh vnIndex + 0 news/alerts/movers → sendFn NOT called
 * (b) fresh vnIndex + 1 story → sendFn called once
 * (c) fresh vnIndex + 1 alert → sendFn called once
 * (d) fresh vnIndex + 1 mover → sendFn called once
 * (e) null vnIndex + 0 everything → sendFn NOT called
 */

import { describe, it, expect, mock } from "bun:test";
import {
  runEveningSummary,
  resetEveningSummaryGuard,
} from "../scheduler/briefings/eveningSummaryJob.js";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";

const JUST_NOW = new Date().toISOString();

const BASE_EMPTY: EveningSummary = {
  date: "2026-04-21",
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
  vnIndex: {
    close: 1250.5,
    change: 3.2,
    changePct: 0.26,
    fetchedAt: JUST_NOW,
  },
};

describe("222 — evening briefing must not fire on vnIndex-only (VPS down)", () => {
  it("(a) fresh vnIndex alone → sendFn NOT called", async () => {
    resetEveningSummaryGuard();

    const summaryFn = mock(async () => ({ ...BASE_EMPTY }));
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).not.toHaveBeenCalled();
  });

  it("(b) fresh vnIndex + 1 story → sendFn called once", async () => {
    resetEveningSummaryGuard();

    const summary: EveningSummary = {
      ...BASE_EMPTY,
      topStories: [
        {
          title: "VN market rallies",
          level: "national",
          sentiment: "positive",
          impactScore: 0.8,
        },
      ],
    };

    const summaryFn = mock(async () => summary);
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it("(c) fresh vnIndex + 1 alert → sendFn called once", async () => {
    resetEveningSummaryGuard();

    const summary: EveningSummary = {
      ...BASE_EMPTY,
      topAlerts: [
        {
          severity: "high",
          message: "Price crossed threshold",
          stocks: ["VCB"],
        },
      ],
    };

    const summaryFn = mock(async () => summary);
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it("(d) fresh vnIndex + 1 mover → sendFn called once", async () => {
    resetEveningSummaryGuard();

    const summary: EveningSummary = {
      ...BASE_EMPTY,
      watchlistMovers: [
        {
          code: "HPG",
          changePct: -3.1,
          price: 28000,
          exchange: "HOSE",
        },
      ],
    };

    const summaryFn = mock(async () => summary);
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).toHaveBeenCalledTimes(1);
  });

  it("(e) no vnIndex + 0 everything → sendFn NOT called", async () => {
    resetEveningSummaryGuard();

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { vnIndex: _dropped, ...rest } = BASE_EMPTY;
    const summary: EveningSummary = rest as EveningSummary;

    const summaryFn = mock(async () => summary);
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).not.toHaveBeenCalled();
  });
});
