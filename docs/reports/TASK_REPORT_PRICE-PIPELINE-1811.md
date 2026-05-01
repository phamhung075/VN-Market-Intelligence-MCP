# Task Report: PRICE-PIPELINE-AUDIT-1811

**Date:** 2026-05-01
**Task:** Verify priceUpdateWatchdogJob and ohlcvStalenessCheckJob are registered in scheduler
**Auditor:** developer agent

---

## Summary

Both jobs are correctly imported and registered in the scheduler. No wiring gaps found. No fixes required.

---

## Findings

### 1. priceUpdateWatchdogJob

| Property | Value |
|----------|-------|
| File | `apps/mcp-server/src/scheduler/market-data/priceUpdateWatchdogJob.ts` |
| Export | `priceUpdateWatchdog` (async function) |
| Registered in `startScheduler.ts` | YES — lines 511-518 |
| CRONS key | `priceUpdateWatchdog` |
| Cron expression | `*/10 2-8 * * 1-5` (env: `CRON_PRICE_UPDATE_WATCHDOG`) |
| Timezone | UTC |
| Telegram channel | `sendTelegramWork` (WORK) + best-effort `notifyUser` (MARKET) |
| recordJobRun wrapped | YES — job key `price-update-watchdog` |

**Cron expression analysis:** `*/10 2-8 * * 1-5` fires every 10 minutes from 02:00-08:59 UTC on Mon-Fri. VN market hours are 09:00-15:00 ICT (UTC+7) = 02:00-08:00 UTC. The range 2-8 covers 02:00 through 08:59 UTC inclusive, which correctly encompasses the full VN trading session. Appropriate.

**Telegram channel:** `sendTelegramWork` is a valid export from `infrastructure/notifiers/telegram.ts`. The `notifyUser` fallback (MARKET channel) is best-effort — failure does not block the WORK alert. Both channel references are valid.

---

### 2. ohlcvStalenessCheckJob

| Property | Value |
|----------|-------|
| File | `apps/mcp-server/src/scheduler/market-data/ohlcvStalenessCheckJob.ts` |
| Export | `runOhlcvStalenessCheck` (async function) |
| Registered in `startScheduler.ts` | YES — lines 502-506 |
| CRONS key | `ohlcvStalenessCheck` |
| Cron expression | `15 8 * * 1-5` (env: `CRON_OHLCV_STALENESS_CHECK`) |
| Timezone | UTC |
| Telegram channel | `sendTelegramWork` (WORK) via `sendWorkFn` dependency injection |
| recordJobRun wrapped | YES — job key `ohlcv-staleness-check` |

**Cron expression analysis:** `15 8 * * 1-5` fires at 08:15 UTC Mon-Fri. This is 15:15 ICT (UTC+7), shortly after VN market close (15:00 ICT). Intent per task doc is to fire "after VN market open data push window" to detect mid-day VPS outage. At 08:15 UTC the VN market has been open since 02:00 UTC (~6h 15min into the session), providing enough time to confirm whether VPS pushed OHLCV data for the day. Appropriate.

**Telegram channel:** `sendTelegramWork` is used via the `sendWorkFn` parameter (dependency injection pattern). Valid channel reference.

---

## Import Chain Verification

```
startScheduler.ts
  line 44: import { runOhlcvStalenessCheck } from './market-data/ohlcvStalenessCheckJob.js'
  line 45: import { priceUpdateWatchdog } from './market-data/priceUpdateWatchdogJob.js'

cronConfig.ts
  line 87-90:  ohlcvStalenessCheck: ... ?? '15 8 * * 1-5'
  line 93-96:  priceUpdateWatchdog: ... ?? '*/10 2-8 * * 1-5'
```

Both imports and CRONS keys are present and consistent.

---

## Issues Found

None. Both jobs are wired, cron expressions are appropriate for VN market hours, and Telegram channel references are valid.

---

## No Code Changes Required

This audit is documentation-only. The scheduler is correctly configured.
