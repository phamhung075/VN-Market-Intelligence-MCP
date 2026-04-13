# Cron Jobs & Scheduled Tasks

> All times GMT+7 / Asia/Ho_Chi_Minh unless noted as UTC.

## Core Cron Jobs

| Time | Job | Cron | What it does |
|------|-----|------|-------------|
| ***/15 min** | `intelligenceCycle` | `*/15 * * * *` | Main engine. Market hours: full 5-step cycle (A→E). Off-hours: news poll only (step A). 14-min stale guard + 2-min per-step timeout. |
| 09:30 daily | `bctcReparseJob` | `30 9 * * *` | Re-parse recently added BCTC PDFs that failed initial extraction |
| ***/30 min** | `predictionMarketPoll` | `*/30 * * * *` | Polymarket fetch → store → detect signals → Telegram if HIGH |
| 08:00 M–F | `morningBriefing` | `0 8 * * 1-5` | VN-Index + stories + macro σ + sensitive dates + commodities + prediction + P&L |
| 09:00 M–F | `marketOpen` | `0 9 * * 1-5` | Prices + sector context + price-news divergence + volume + price alerts |
| 15:30 M–F | `marketClose` | `30 15 * * 1-5` | Close-of-day snapshot |
| 09:00 daily | `bctcOverdueCheck` | `0 9 * * *` | BCTC overdue alert — insert alert rows for overdue filings (task 1018) |
| 20:00 daily | `sscCheck` | `0 20 * * *` | SSC portal BCTC filing check |
| 21:00 M–F | `alertDigest` | `0 21 * * 1-5` | Nightly alert digest via Telegram |
| 22:00 M–F | `eveningSummary` | `0 22 * * 1-5` | Evening market summary |
| 22:30 Sunday | `patternWatch` | `30 22 * * 0` (`CRON_PATTERN_WATCH`) | Weekly pattern watch → Telegram |
| 23:00 Sunday | `weeklyPortfolioReport` | `0 23 * * 0` | P&L + allocation drift + top movers → Telegram |
| 23:00 daily | `dataAuditDaily` | `0 23 * * *` | Orphan vectors, stale entries, DB row counts |
| 01:00 Sunday | `dataAuditWeekly` | `0 1 * * 0` | LanceDB vs SQLite consistency, signal coverage gaps |
| daily (configurable) | `cronHealthAlert` | `CRON_HEALTH_ALERT` | Check all cron job success_rate (7d window); alert WORK channel if any job < 80% (task 1103) |
| 06:00 UTC M–F | `franceSummary` | `0 6 * * 1-5` (`CRON_FRANCE_SUMMARY`) | France wake-up digest (13:00 VN) → MARKET channel |
| 07:00 UTC Sunday | `devTeamHeartbeat` | `0 7 * * 0` (`CRON_DEV_TEAM_HEARTBEAT`) | System health + weekly observability report |
| 08:00 UTC Sunday | `predictionOutcome` | `0 8 * * 0` (`CRON_PREDICTION_OUTCOME`) | Evaluate prediction signals vs actual outcomes |
| ***/12 min** | `askQueueCheck` | `*/12 * * * *` | Check ask_queue for pending /ask questions; post signal to agent_signals for 07-qa-responder if count > 0 (task 1074) |
| 23:00 VN daily | `evidenceAccumulator` | `0 16 * * *` UTC (`CRON_EVIDENCE_ACCUMULATOR`) | Purge expired evidence + weighted score accumulation per stock (task 1118) |
| 02:00 VN Sunday | `baseRateComputation` | `0 19 * * 0` UTC (`CRON_BASE_RATE_COMPUTATION`) | Weekly base-rate computation for prediction likelihood ratios (sprint 059) |
| 20:00 VN Sunday | `calibrationReportJob` | `0 13 * * 0` UTC (`CRON_CALIBRATION_REPORT`) | Weekly Brier score calibration report + label accuracy + Telegram digest (sprint 060/070) |
| 16:30 VN M–F | `foreignFlowAlertJob` | `30 9 * * 1-5` UTC (`CRON_FOREIGN_FLOW_ALERT`) | Daily foreign flow smart-money scan — HIGH alerts + evidence fragments (sprint 061) |
| 08:00 VN daily | `insiderCheckJob` | `0 1 * * *` UTC (`CRON_INSIDER_CHECK`) | Daily SSC insider transaction check + streak detection + evidence fragments (sprint 063) |

## Intelligence Cycle Steps (15-min tick)

| Step | What | When | Timeout |
|------|------|------|---------|
| A | `pollNews()` — 5 sources + auto-extract commodity prices | Always | 2 min |
| A2 | `fetchMacro()` — Yahoo Finance + Vietcombank SBV → σ history | Always (24/7) | 2 min |
| A3b | `syncSectorPeers()` — vnstock light sync for sector peers | Market hours | 2 min |
| B | `listSscDocuments()` — SSC check per watchlist stock | Market hours | 2 min |
| C | `fetchHosePrices()` — prices + sector context peers | Market hours | 2 min |
| D | `runImpactChain()` — cascade analysis + σ adjustments | Market hours | 2 min |
| E | `sendAlerts()` — unnotified HIGH/CRITICAL → Telegram | Market hours | 2 min |

## Periodic Summary Jobs

All summary crons are in `CRONS` map (overridable via env vars `CRON_SUMMARY_*`). (task 1023)

| Schedule | Job | Cron | Env Override |
|----------|-----|------|--------------|
| 22:30 daily | Daily summary | `30 22 * * *` | `CRON_SUMMARY_DAILY` |
| 23:00 Sunday | Weekly summary | `0 23 * * 0` | `CRON_SUMMARY_WEEKLY` |
| 00:30 1st of month | Monthly summary | `30 0 1 * *` | `CRON_SUMMARY_MONTHLY` |
| 01:00 Jan/Apr/Jul/Oct 1st | Quarterly summary | `0 1 1 1,4,7,10 *` | `CRON_SUMMARY_QUARTERLY` |
| 02:00 Jan 2nd | Yearly summary | `0 2 2 1 *` | `CRON_SUMMARY_YEARLY` |
| 1st monthly 06:00 | DAV pharmacy check | `0 6 1 * *` |
| */6h | Weather check | `0 */6 * * *` | Typhoon/climate signals → Telegram if impact HIGH |

## VPS Proxy Watchdog

| Time | Job | Cron | What it does |
|------|-----|------|-------------|
| ***/10 min (market hours only)** | `vpsProxyWatchdog` | `*/10 2-8 * * 1-5` UTC (`CRON_VPS_PROXY_WATCHDOG`) | Reads `MAX(market_prices.updated_at)`. If >5 min stale during VN market hours (Mon-Fri 02:00-08:59 UTC), sends one Telegram Chat alert. 30-min cooldown prevents flood. No SSH — observe only. Alert embeds operator commands: `systemctl status vn-price-fetch`, `journalctl -u vn-price-fetch -n 50`, `./deploy-vps-proxy.sh`. |

This job is in `src/scheduler/vpsProxyWatchdogJob.ts` (154 lines). Registered in `src/scheduler/jobs.ts`.

**Invariant**: the MCP server never SSHes into the VPS. `deploy-vps-proxy.sh` is the operator-only escape hatch. VPS liveness is owned by systemd (`vn-price-fetch.service`, `Restart=always`).

## Notes

- Total scheduler files: **29** (`jobs.ts` + `summaryJobs.ts` + 27 job handlers including `cronHealthAlertJob.ts`, `vpsProxyWatchdogJob.ts`, `bctcReparseJob.ts`, `evidenceAccumulatorJob.ts`, `baseRateComputationJob.ts`, `calibrationReportJob.ts`, `foreignFlowAlertJob.ts`, `insiderCheckJob.ts`).
- `insiderCheckJob.ts` is registered in `jobs.ts` since Sprint 063 (was an orphan in Sprint 039-040 era).
- `newsPollerJob.ts` is legacy (superseded by `intelligenceCycleJob`); kept for fallback testing only.
- `userRequestCheckJob.ts` was referenced in Sprint 050 design but was **not created** — `/ask` + `/why` handling is done inline in `intelligenceCycleJob.ts` or `telegramCommands.ts`.
- VPS cron has been removed. The fetch schedule now lives inside `vps-scripts/fetch-prices-loop.sh` controlled by systemd on the Vultr host.
