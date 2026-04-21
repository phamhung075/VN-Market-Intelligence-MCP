/**
 * Task 235 — suppress stale-data-only messages via freshness gate
 *
 * When VPS is down (VN Index stale >25h) and all signals are empty,
 * evening summary must NOT send empty message.
 *
 * The hasContent guard should check freshness: if no real signals AND
 * vnIndex is stale (>25h), suppress send.
 *
 * ACs:
 * (a) stale vnIndex + 0 signals → sendFn NOT called
 * (b) stale vnIndex + 1 story → sendFn called (real signal present)
 * (c) stale vnIndex + 1 alert → sendFn called (real signal present)
 * (d) fresh vnIndex + 0 signals → sendFn NOT called (existing behavior)
 * (e) no vnIndex + 0 signals → sendFn NOT called (existing behavior)
 */

import { describe, it, expect, mock } from "bun:test";
import {
  runEveningSummary,
  resetEveningSummaryGuard,
} from "../scheduler/briefings/eveningSummaryJob.js";
import type { EveningSummary } from "../application/usecases/assembleEveningSummary.js";

const FRESH_TIME = new Date().toISOString();
const STALE_TIME = new Date(Date.now() - 26 * 3600 * 1000).toISOString();

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
  generatedAt: FRESH_TIME,
  portfolioPnl: null,
  vnIndex: {
    close: 1250.5,
    change: 3.2,
    changePct: 0.26,
    fetchedAt: STALE_TIME,
  },
};

describe("235 — evening briefing suppress stale-data-only via freshness gate", () => {
  it("(a) stale vnIndex + 0 signals → sendFn NOT called", async () => {
    resetEveningSummaryGuard();

    const summary: EveningSummary = {
      ...BASE_EMPTY,
      vnIndex: {
        close: 1250.5,
        change: 3.2,
        changePct: 0.26,
        fetchedAt: STALE_TIME,
      },
    };

    const summaryFn = mock(async () => summary);
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).not.toHaveBeenCalled();
  });

  it("(b) stale vnIndex + 1 story → sendFn called", async () => {
    resetEveningSummaryGuard();

    const summary: EveningSummary = {
      ...BASE_EMPTY,
      vnIndex: {
        close: 1250.5,
        change: 3.2,
        changePct: 0.26,
        fetchedAt: STALE_TIME,
      },
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

  it("(c) stale vnIndex + 1 alert → sendFn called", async () => {
    resetEveningSummaryGuard();

    const summary: EveningSummary = {
      ...BASE_EMPTY,
      vnIndex: {
        close: 1250.5,
        change: 3.2,
        changePct: 0.26,
        fetchedAt: STALE_TIME,
      },
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

  it("(d) fresh vnIndex + 0 signals → sendFn NOT called", async () => {
    resetEveningSummaryGuard();

    const summary: EveningSummary = {
      ...BASE_EMPTY,
      vnIndex: {
        close: 1250.5,
        change: 3.2,
        changePct: 0.26,
        fetchedAt: FRESH_TIME,
      },
    };

    const summaryFn = mock(async () => summary);
    const sendFn = mock(async (_msg: string, _opts: unknown) => {});

    await runEveningSummary(summaryFn, sendFn);

    expect(sendFn).not.toHaveBeenCalled();
  });

  it("(e) no vnIndex + 0 signals → sendFn NOT called", async () => {
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
