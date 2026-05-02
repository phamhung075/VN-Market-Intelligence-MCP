# Task Report — 1833c: bctcQueueEnricher 0-URL Warning

**Date:** 2026-05-02
**Branch:** task/1833c-bctc-queue-enricher-warning
**Commit:** 2fc53b1f

## Problem

`bctcQueueEnricherJob` ran without error and emitted no logs when scraping returned 0 URLs for a ticker. Silent failure made root-cause debugging of empty BCTC queues impossible.

## Fix

File: `apps/mcp-server/src/scheduler/financial-reports/bctcQueueEnricherJob.ts`

Two `logger.warn` calls added (no logic changes):

1. **Per-ticker** (line 177): fires immediately when `discovery.urls.length === 0` for a given ticker, naming the ticker in the message.
2. **End-of-job summary** (line 229): fires once after the full batch loop when `urlsPopulated === 0` and at least one item was processed — signals that the entire run was fruitless (likely all sources unavailable or geo-blocked).

## Test Results

8752 tests across 786 files — all pass. Baseline was 8718; count is higher due to unrelated tests added in earlier tasks on this branch. No regressions.

## QA Checklist

- [ ] Confirm `logger.warn` fires in a run where discovery returns empty (can inject a mock `discoverOptions` that returns `{ urls: [], source: "none" }`)
- [ ] Confirm end-of-job warning fires when all tickers return 0 URLs
- [ ] Confirm no warning fires when at least one URL is populated
- [ ] Confirm no test files were modified
