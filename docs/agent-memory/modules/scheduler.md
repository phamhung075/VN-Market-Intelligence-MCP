---
agents: developer, ops, architect
trigger: writing-scheduler, health-check, post-merge-review
---

# Module Analysis: apps/mcp-server/src/scheduler/

**Last analyzed**: 2026-04-27 | **By**: Developer (task 1349c) | **Status**: Paths corrected post modular-monolith refactor (Sprints 209-220)

---

## Directory Structure

Old path (stale, do not use): `src/infrastructure/scheduler/`
Current path: `apps/mcp-server/src/scheduler/`

The scheduler was reorganized into 9 subdirectories plus a root level:

```
apps/mcp-server/src/scheduler/
  index.ts                      — entry point, registers all jobs
  jobs.ts                       — orchestration registry
  summaryJobs.ts                — summary job orchestration
  alerts/
  audits/
  briefings/
  financial-reports/
  macro/
  market-data/
  news-analysis/
  portfolio/
  system/
```

---

## Job Count: 51 Total TS Files

Verified: 2026-04-27
Command: `find apps/mcp-server/src/scheduler -name "*.ts" | wc -l` = 51
(Includes 2 index.ts files, jobs.ts, summaryJobs.ts, and 47 named job files)
Live job registry: `docs/data/cron-registry.json`

| Subdirectory | Count | Job Files |
|---|---|---|
| alerts | 4 | alertDigestJob, alertScanParallelJob, bbAlertScanJob, cronHealthAlertJob |
| audits | 1 | monthlySignalQualityJob |
| briefings | 3 | eveningSummaryJob, franceSummaryJob, morningBriefingJob |
| financial-reports | 3 | bctcOverdueCheckJob, bctcQueueEnricherJob, bctcReparseJob |
| macro | 8 | baseRateComputationJob, calibrationReportJob, cascadeBacktestJob, index, macroIndicatorRefreshJob, predictionMarketJob, predictionOutcomeJob, predictionResolutionJob |
| market-data | 11 | foreignFlowAlertJob, foreignFlowFetcherJob, imfIndicatorPollerJob, insiderCheckJob, marketScanJob, ohlcvDailyAggregatorJob, ohlcvStalenessCheckJob, ohlcvStartupProbe, priceUpdateWatchdogJob, taAlertNotifierJob, taAlertScanJob |
| news-analysis | 5 | dataAuditJob, evidenceAccumulatorJob, intelligenceCycleJob, patternWatchJob, sscCheckerJob |
| portfolio | 1 | weeklyPortfolioReportJob |
| system | 6 | askQueueCheckJob, devTeamHeartbeatJob, freshnessSlaMonitorJob, parallelServiceDispatcherJob, trackSessionToolUsageJob, vpsServiceHealthJob |
| root | 9 | davPharmacyJob, index, integrityCheckJob, jobs, pipelineWatchdogJob, summaryJobs, vpsProxyWatchdogJob, walCheckpointAlert, weatherCheckJob |

---

## All Job Files with Correct Paths

### alerts/
- `apps/mcp-server/src/scheduler/alerts/alertDigestJob.ts`
- `apps/mcp-server/src/scheduler/alerts/alertScanParallelJob.ts`
- `apps/mcp-server/src/scheduler/alerts/bbAlertScanJob.ts`
- `apps/mcp-server/src/scheduler/alerts/cronHealthAlertJob.ts`

### audits/
- `apps/mcp-server/src/scheduler/audits/monthlySignalQualityJob.ts`

### briefings/
- `apps/mcp-server/src/scheduler/briefings/eveningSummaryJob.ts`
- `apps/mcp-server/src/scheduler/briefings/franceSummaryJob.ts`
- `apps/mcp-server/src/scheduler/briefings/morningBriefingJob.ts`

### financial-reports/
- `apps/mcp-server/src/scheduler/financial-reports/bctcOverdueCheckJob.ts`
- `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts`
- `apps/mcp-server/src/scheduler/financial-reports/bctcReparseJob.ts`

### macro/
- `apps/mcp-server/src/scheduler/macro/baseRateComputationJob.ts`
- `apps/mcp-server/src/scheduler/macro/calibrationReportJob.ts`
- `apps/mcp-server/src/scheduler/macro/cascadeBacktestJob.ts`
- `apps/mcp-server/src/scheduler/macro/index.ts`
- `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts`
- `apps/mcp-server/src/scheduler/macro/predictionMarketJob.ts`
- `apps/mcp-server/src/scheduler/macro/predictionOutcomeJob.ts`
- `apps/mcp-server/src/scheduler/macro/predictionResolutionJob.ts`

### market-data/
- `apps/mcp-server/src/scheduler/market-data/foreignFlowAlertJob.ts`
- `apps/mcp-server/src/scheduler/market-data/foreignFlowFetcherJob.ts`
- `apps/mcp-server/src/scheduler/market-data/imfIndicatorPollerJob.ts`
- `apps/mcp-server/src/scheduler/market-data/insiderCheckJob.ts`
- `apps/mcp-server/src/scheduler/market-data/marketScanJob.ts`
- `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts`
- `apps/mcp-server/src/scheduler/market-data/ohlcvStalenessCheckJob.ts`
- `apps/mcp-server/src/scheduler/market-data/ohlcvStartupProbe.ts`
- `apps/mcp-server/src/scheduler/market-data/priceUpdateWatchdogJob.ts`
- `apps/mcp-server/src/scheduler/market-data/taAlertNotifierJob.ts`
- `apps/mcp-server/src/scheduler/market-data/taAlertScanJob.ts`

### news-analysis/
- `apps/mcp-server/src/scheduler/news-analysis/dataAuditJob.ts`
- `apps/mcp-server/src/scheduler/news-analysis/evidenceAccumulatorJob.ts`
- `apps/mcp-server/src/scheduler/news-analysis/intelligenceCycleJob.ts`
- `apps/mcp-server/src/scheduler/news-analysis/patternWatchJob.ts`
- `apps/mcp-server/src/scheduler/news-analysis/sscCheckerJob.ts`

### portfolio/
- `apps/mcp-server/src/scheduler/portfolio/weeklyPortfolioReportJob.ts`

### system/
- `apps/mcp-server/src/scheduler/system/askQueueCheckJob.ts`
- `apps/mcp-server/src/scheduler/system/devTeamHeartbeatJob.ts`
- `apps/mcp-server/src/scheduler/system/freshnessSlaMonitorJob.ts`
- `apps/mcp-server/src/scheduler/system/parallelServiceDispatcherJob.ts`
- `apps/mcp-server/src/scheduler/system/trackSessionToolUsageJob.ts`
- `apps/mcp-server/src/scheduler/system/vpsServiceHealthJob.ts`

### root/
- `apps/mcp-server/src/scheduler/davPharmacyJob.ts`
- `apps/mcp-server/src/scheduler/index.ts`
- `apps/mcp-server/src/scheduler/integrityCheckJob.ts`
- `apps/mcp-server/src/scheduler/jobs.ts`
- `apps/mcp-server/src/scheduler/pipelineWatchdogJob.ts`
- `apps/mcp-server/src/scheduler/summaryJobs.ts`
- `apps/mcp-server/src/scheduler/vpsProxyWatchdogJob.ts`
- `apps/mcp-server/src/scheduler/walCheckpointAlert.ts`
- `apps/mcp-server/src/scheduler/weatherCheckJob.ts`

---

## Verification Status

| Area | Status | Evidence | Next Action |
|------|--------|----------|------------|
| Path structure | Corrected | `find apps/mcp-server/src/scheduler -type d` verified 2026-04-27 | None |
| Signal handlers | Monitor | SIGTERM + SIGINT call `checkpoint()` | Verify new jobs |
| WAL checkpoint | Active | Daily job + shutdown handler | None |
| Error handling | Active | All jobs have try/catch + logging | None |

---

## Patterns (apply when extending)

**Pattern 1**: Always wrap external API calls with circuit breaker
```typescript
const data = await circuitBreakerRegistry.execute('host', async () => {
  return fetch(...);
});
```

**Pattern 2**: Check rate limiter before fetch
```typescript
await rateLimiter.checkAndWait('vn-price.example.com');
const data = await fetch(...);
```

**Pattern 3**: Log with UTC explicitly
```typescript
const now = new Date().toISOString(); // Always ISO string
logger.info(`Job started: ${now}`);
```

---

## Related Files

- `apps/mcp-server/src/scheduler/` — all job definitions (current)
- `apps/mcp-server/src/interface/scheduler/index.ts` — interface layer stub
- `docs/data/cron-registry.json` — live job registry (schedules, descriptions)
- `.claude/knowledge/cron-jobs.md` — scheduler architecture reference
