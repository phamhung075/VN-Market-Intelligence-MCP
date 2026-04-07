# Cron Jobs & Scheduled Tasks

> All times GMT+7 / Asia/Ho_Chi_Minh unless noted as UTC.

## Core Cron Jobs

| Time | Job | Cron | What it does |
|------|-----|------|-------------|
| ***/15 min** | `intelligenceCycle` | `*/15 * * * *` | Main engine. Market hours: full 5-step cycle (A→E). Off-hours: news poll only (step A). 14-min stale guard + 2-min per-step timeout. |
| ***/15 min** | `userRequestCheck` | `*/15 * * * *` | Answer /ask + /why Telegram commands within 15 min |
| ***/30 min** | `predictionMarketPoll` | `*/30 * * * *` | Polymarket fetch → store → detect signals → Telegram if HIGH |
| 08:00 M–F | `morningBriefing` | `0 8 * * 1-5` | VN-Index + stories + macro σ + sensitive dates + commodities + prediction + P&L |
| 09:00 M–F | `marketOpen` | `0 9 * * 1-5` | Prices + sector context + price-news divergence + volume + price alerts |
| 15:30 M–F | `marketClose` | `30 15 * * 1-5` | Close-of-day snapshot |
| 09:00 daily | `bctcOverdueCheck` | `0 9 * * *` | BCTC overdue alert — insert alert rows for overdue filings (task 1018) |
| 20:00 daily | `sscCheck` | `0 20 * * *` | SSC portal BCTC filing check |
| 21:00 M–F | `alertDigest` | `0 21 * * 1-5` | Nightly alert digest via Telegram |
| 22:00 M–F | `eveningSummary` | `0 22 * * 1-5` | Evening market summary |
| 22:30 Sunday | `patternWatch` | `30 22 * * 0` | Weekly pattern watch → Telegram |
| 23:00 Sunday | `weeklyPortfolioReport` | `0 23 * * 0` | P&L + allocation drift + top movers → Telegram |
| 23:00 daily | `dataAuditDaily` | `0 23 * * *` | Orphan vectors, stale entries, DB row counts |
| 01:00 Sunday | `dataAuditWeekly` | `0 1 * * 0` | LanceDB vs SQLite consistency, signal coverage gaps |
| 06:00 UTC M–F | `franceSummary` | `0 6 * * 1-5` | France wake-up digest (13:00 VN) → MARKET channel |
| 07:00 UTC Sunday | `devTeamHeartbeat` | `0 7 * * 0` | System health + weekly observability report |
| 08:00 UTC Sunday | `predictionOutcome` | `0 8 * * 0` | Evaluate prediction signals vs actual outcomes |

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

| Schedule | Job | Cron |
|----------|-----|------|
| 22:30 daily | Daily summary | `30 22 * * *` |
| 23:00 Sunday | Weekly summary | `0 23 * * 0` |
| 00:30 1st of month | Monthly summary | `30 0 1 * *` |
| 01:00 Jan/Apr/Jul/Oct 1st | Quarterly summary | `0 1 1 1,4,7,10 *` |
| 02:00 Jan 2nd | Yearly summary | `0 2 2 1 *` |
| 1st monthly 06:00 | DAV pharmacy check | `0 6 1 * *` |
| */6h | Weather check | `0 */6 * * *` | Typhoon/climate signals → Telegram if impact HIGH |

## VPS Proxy Watchdog

| Time | Job | Cron | What it does |
|------|-----|------|-------------|
| ***/10 min (market hours only)** | `vpsProxyWatchdog` | `*/10 2-8 * * 1-5` (UTC) | Reads `MAX(market_prices.updated_at)`. If >5 min stale during VN market hours (Mon-Fri 02:00-08:59 UTC), sends one Telegram Chat alert. 30-min cooldown prevents flood. No SSH — observe only. Alert embeds operator commands: `systemctl status vn-price-fetch`, `journalctl -u vn-price-fetch -n 50`, `./deploy-vps-proxy.sh`. |

This job is in `src/scheduler/vpsProxyWatchdogJob.ts` (154 lines). Registered in `src/scheduler/jobs.ts`.

**Invariant**: the MCP server never SSHes into the VPS. `deploy-vps-proxy.sh` is the operator-only escape hatch. VPS liveness is owned by systemd (`vn-price-fetch.service`, `Restart=always`).

## Notes

- Total scheduler files: **22** (`jobs.ts` + `summaryJobs.ts` + 20 job handlers including `vpsProxyWatchdogJob.ts` and `userRequestCheckJob.ts`).
- `insiderCheckJob.ts` exists in `src/scheduler/` but is **not registered** in `jobs.ts` (orphan — Sprint 039-040 era, pending wiring).
- `newsPollerJob.ts` is legacy (superseded by `intelligenceCycleJob`); kept for fallback testing only.
- VPS cron has been removed. The fetch schedule now lives inside `vps-scripts/fetch-prices-loop.sh` controlled by systemd on the Vultr host.
