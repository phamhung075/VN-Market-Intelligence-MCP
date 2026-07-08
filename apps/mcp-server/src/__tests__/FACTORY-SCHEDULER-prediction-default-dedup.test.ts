/**
 * FACTORY-SCHEDULER-prediction-default-dedup — pins the resolved
 * PredictionSignalConfig defaults after deduping the try/catch branches in
 * predictionMarketJob.ts Step 6 (signalConfig resolution) into one exported
 * DEFAULT_PREDICTION_SIGNAL_CONFIG constant + resolvePredictionSignalConfig().
 *
 * Full end-to-end coverage of runPredictionMarketPoll() with an explicit
 * opts.signalConfig injection already lives in 167-prediction-market-job.test.ts;
 * this file targets ONLY the extracted default-resolution unit — the part that
 * used to be duplicated once per branch (try: config-load-succeeded, catch:
 * config-load-failed) so the two paths can never silently diverge again.
 */

import { describe, it, expect } from "bun:test";
import {
  DEFAULT_PREDICTION_SIGNAL_CONFIG,
  resolvePredictionSignalConfig,
} from "../scheduler/macro/predictionMarketJob.js";

describe("FACTORY-SCHEDULER-prediction-default-dedup — DEFAULT_PREDICTION_SIGNAL_CONFIG", () => {
  it("pins the as-shipped Task 167 default values (unchanged by this refactor)", () => {
    expect(DEFAULT_PREDICTION_SIGNAL_CONFIG).toEqual({
      volumeSpikeThresholdUsd: 50000,
      probabilityShiftPct: 5,
      minUniqueWallets: 10,
    });
  });
});

describe("FACTORY-SCHEDULER-prediction-default-dedup — resolvePredictionSignalConfig", () => {
  it("resolves to DEFAULT_PREDICTION_SIGNAL_CONFIG when pm is undefined (catch-branch case, pre-refactor)", () => {
    expect(resolvePredictionSignalConfig(undefined)).toEqual(
      DEFAULT_PREDICTION_SIGNAL_CONFIG,
    );
  });

  it("resolves to DEFAULT_PREDICTION_SIGNAL_CONFIG when pm is null", () => {
    expect(resolvePredictionSignalConfig(null)).toEqual(
      DEFAULT_PREDICTION_SIGNAL_CONFIG,
    );
  });

  it("resolves to DEFAULT_PREDICTION_SIGNAL_CONFIG when pm is an empty object (config present, fields absent)", () => {
    expect(resolvePredictionSignalConfig({})).toEqual(
      DEFAULT_PREDICTION_SIGNAL_CONFIG,
    );
  });

  it("both branches resolve identically when config is unavailable — try-branch pm=undefined equals catch-branch no-arg call", () => {
    const tryBranchResult = resolvePredictionSignalConfig(undefined);
    const catchBranchResult = resolvePredictionSignalConfig();
    expect(tryBranchResult).toEqual(catchBranchResult);
    expect(tryBranchResult).toEqual(DEFAULT_PREDICTION_SIGNAL_CONFIG);
  });

  it("overrides only the fields present in pm, keeping the rest at default", () => {
    expect(resolvePredictionSignalConfig({ probabilityShiftPct: 8 })).toEqual({
      volumeSpikeThresholdUsd: 50000,
      probabilityShiftPct: 8,
      minUniqueWallets: 10,
    });
  });

  it("overrides all three fields when a fully-populated config slice is supplied", () => {
    expect(
      resolvePredictionSignalConfig({
        volumeSpikeThresholdUsd: 100000,
        probabilityShiftPct: 2,
        minUniqueWallets: 25,
      }),
    ).toEqual({
      volumeSpikeThresholdUsd: 100000,
      probabilityShiftPct: 2,
      minUniqueWallets: 25,
    });
  });
});
