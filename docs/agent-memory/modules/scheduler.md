# Scheduler Module Memory

**Last updated:** 2026-05-02
**Maintainer:** developer agent

---

## Overview

All scheduler jobs live under `src/scheduler/`. The old `src/infrastructure/scheduler` path is **stale/deprecated** — do not use it; all jobs were migrated during Sprint 1349.

---

## Entry Points

- `src/scheduler/index.ts` — barrel export
- `src/scheduler/jobs.ts` — CRONS map (all registered jobs)
- `src/scheduler/cronConfig.ts` — cron expression constants
- `src/scheduler/startScheduler.ts` — wires CRONS to node-cron at server startup
- `src/scheduler/startupHelpers.ts` — startup validation helpers
- `src/scheduler/summaryJobs.ts` — summary job wrappers

---

## Alerts

- `src/scheduler/alerts/alertDigestJob.ts` — nightly alert digest (21:00 VN)
- `src/scheduler/alerts/alertScanParallelJob.ts` — parallel TA + BB scan coordinator
- `src/scheduler/alerts/bbAlertScanJob.ts` — Bollinger Band breakout scan (15-min market hours)
- `src/scheduler/alerts/cronHealthAlertJob.ts` — job success-rate watchdog (daily)
- `src/scheduler/alerts/signalOutcomeJob.ts` — signal outcome tracking

---

## Audits

- `src/scheduler/audits/monthlySignalQualityJob.ts` — monthly signal quality audit

---

## Briefings

- `src/scheduler/briefings/eveningSummaryJob.ts` — evening market summary (22:30 VN)
- `src/scheduler/briefings/franceSummaryJob.ts` — France morning VN digest (07:00-08:30 UTC M-F)
- `src/scheduler/briefings/morningBriefingJob.ts` — daily morning briefing (08:00 VN M-F)

---

## Financial Reports

- `src/scheduler/financial-reports/bctcOverdueCheckJob.ts` — BCTC overdue alert (09:00 VN daily)
- `src/scheduler/financial-reports/bctcPdfPullJob.ts` — pull BCTC PDFs from VPS
- `src/scheduler/financial-reports/bctcQueueEnricherJob.ts` — enrich BCTC queue
- `src/scheduler/financial-reports/bctcReparseJob.ts` — re-parse recently added BCTC PDFs (09:30 VN daily)

---

## Macro

- `src/scheduler/macro/baseRateComputationJob.ts` — weekly Bayesian base-rate recompute (19:00 UTC Sunday)
- `src/scheduler/macro/calibrationReportJob.ts` — weekly Brier score calibration (13:00 UTC Sunday)
- `src/scheduler/macro/cascadeBacktestJob.ts` — daily cascade backtest (20:30 UTC)
- `src/scheduler/macro/index.ts` — macro barrel export
- `src/scheduler/macro/macroIndicatorRefreshJob.ts` — macro indicator daily refresh (06:00 VN, 0 6 * * *)
- `src/scheduler/macro/marketEarningYieldJob.ts` — market earning yield computation
- `src/scheduler/macro/predictionMarketJob.ts` — Polymarket fetch + signal detection (*/30 min)
- `src/scheduler/macro/predictionOutcomeJob.ts` — prediction signal evaluation (08:00 UTC Sunday)
- `src/scheduler/macro/predictionResolutionJob.ts` — prediction claim auto-resolution (16:30 UTC daily)

---

## Market Data

- `src/scheduler/market-data/foreignFlowAlertJob.ts` — foreign flow smart-money scan (09:30 UTC M-F)
- `src/scheduler/market-data/foreignFlowFetcherJob.ts` — foreign flow data fetcher
- `src/scheduler/market-data/imfIndicatorPollerJob.ts` — IMF economic indicator poller (0 */6 * * *)
- `src/scheduler/market-data/insiderCheckJob.ts` — SSC insider transaction check (01:00 UTC daily)
- `src/scheduler/market-data/marketScanJob.ts` — market open scan + price alerts (09:00 VN M-F)
- `src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` — aggregate intraday ticks to daily OHLCV (16:00 UTC M-F)
- `src/scheduler/market-data/ohlcvStalenessCheckJob.ts` — OHLCV staleness check (15 8 * * 1-5)
- `src/scheduler/market-data/ohlcvStartupProbe.ts` — startup OHLCV gap detection
- `src/scheduler/market-data/priceUpdateWatchdogJob.ts` — price update watchdog
- `src/scheduler/market-data/taAlertNotifierJob.ts` — TA alert Telegram delivery (*/15 min market)
- `src/scheduler/market-data/taAlertScanJob.ts` — RSI overbought/oversold scan (*/15 min market)
- `src/scheduler/market-data/vnIndexRefreshJob.ts` — VN-Index daily refresh

---

## News Analysis

- `src/scheduler/news-analysis/dataAuditJob.ts` — data integrity audit (23:00 VN daily + weekly)
- `src/scheduler/news-analysis/evidenceAccumulatorJob.ts` — nightly evidence fragment accumulation (16:00 UTC)
- `src/scheduler/news-analysis/intelligenceCycleJob.ts` — main news+prices+cascade engine (*/15 min)
- `src/scheduler/news-analysis/patternWatchJob.ts` — weekly pattern watch (22:30 VN Sunday)
- `src/scheduler/news-analysis/sscCheckerJob.ts` — SSC nightly BCTC check (20:00 VN)

---

## Portfolio

- `src/scheduler/portfolio/weeklyPortfolioReportJob.ts` — weekly portfolio report (23:00 VN Sunday)

---

## System

- `src/scheduler/system/askQueueCheckJob.ts` — /ask FIFO queue trigger (*/12 min)
- `src/scheduler/system/devTeamHeartbeatJob.ts` — system health observability report (07:00 UTC Sunday)
- `src/scheduler/system/freshnessSlaMonitorJob.ts` — data freshness SLA monitor
- `src/scheduler/system/parallelServiceDispatcherJob.ts` — parallel microservice dispatcher
- `src/scheduler/system/trackSessionToolUsageJob.ts` — session tool usage aggregation (0 */8 * * *)
- `src/scheduler/system/vpsServiceHealthJob.ts` — VPS service health check

---

## Misc

- `src/scheduler/davPharmacyJob.ts` — DAV drug approval check (1st monthly 06:00 VN)
- `src/scheduler/integrityCheckJob.ts` — database integrity check
- `src/scheduler/pipelineWatchdogJob.ts` — stale news pipeline detection (*/30 min)
- `src/scheduler/vpsProxyWatchdogJob.ts` — VPS proxy liveness (*/10 min market)
- `src/scheduler/walCheckpointAlert.ts` — WAL checkpoint stuck alert helper
- `src/scheduler/weatherCheckJob.ts` — typhoon season climate check (*/6h)

---

## Deprecated Paths

The following path is **stale/old/deprecated** and must not be used:
- `src/infrastructure/scheduler` — old location, migrated to `src/scheduler/` during Sprint 1349

---

## Key Constants

All cron expressions centralized in `src/scheduler/cronConfig.ts`.
Registration wired in `src/scheduler/startScheduler.ts` via `cron.schedule()`.
Job map in `src/scheduler/jobs.ts` (CRONS object, > 40 entries).
