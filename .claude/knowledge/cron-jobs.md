# Cron Jobs — Complete Schedule

**Load when:** scheduling, job registration, or timing of automated cycles.

## All Jobs (23 scheduler files — Sprint 054)

| Schedule (VN GMT+7 unless noted) | Job | Description |
|----------------------------------|-----|-------------|
| `*/15 min` | `intelligenceCycle` | Main engine: news+prices+cascade+alerts. 14-min stale guard, 2-min/step timeout |
| `*/30 min` | `predictionMarketPoll` | Polymarket fetch + signal detection |
| `*/6h` | `weatherCheck` | Typhoon season climate check |
| `*/12 min` | `askQueueCheck` | /ask FIFO queue → QA Responder (Sprint 054) |
| `*/10 min` (market hours) | `vpsProxyWatchdog` | VPS proxy liveness — observe only |
| 06:00 UTC M-F | `franceSummary` | France wake-up digest (13:00 VN) → MARKET |
| 08:00 VN M-F | `morningBriefing` | Daily briefing: macro + conviction |
| 09:00 VN M-F | `marketOpen` | Market open scan + price alerts |
| 09:00 VN daily | `bctcOverdueCheck` | BCTC overdue alert → insert alert rows |
| 09:30 VN daily | `bctcReparseJob` | Re-parse recently added BCTC PDFs |
| 15:30 VN M-F | `marketClose` | Market close snapshot |
| 20:00 VN daily | `sscCheck` | SSC nightly BCTC check |
| 21:00 VN M-F | `alertDigest` | Nightly alert digest |
| 22:00 VN M-F | `eveningSummary` | Evening market summary |
| 22:30 VN daily | `dailySummary` | Daily summary generation |
| 22:30 VN Sunday | `patternWatch` | Weekly pattern watch |
| 23:00 VN daily | `dataAuditDaily` | Data integrity audit |
| 23:00 VN Sunday | `weeklyPortfolioReport` + `weeklySummary` | Portfolio + weekly summary |
| 01:00 VN Sunday | `dataAuditWeekly` | Deep weekly audit |
| 07:00 UTC Sunday | `devTeamHeartbeat` | System health + observability report |
| 08:00 UTC Sunday | `predictionOutcome` | Prediction signal evaluation |
| 1st monthly 06:00 VN | `davPharmacyCheck` | DAV drug approval check |

**Orphan** (not registered): `insiderCheckJob.ts` | **Legacy** (fallback test only): `newsPollerJob.ts`

## Intelligence Cycle Steps (15-min tick)

| Step | What | Hours | Timeout |
|------|------|-------|---------|
| A | `pollNews()` — 5 sources + commodity prices | Always | 2 min |
| A2 | `fetchMacro()` — Yahoo Finance + SBV σ history | Always (24/7) | 2 min |
| A3b | `syncSectorPeers()` — vnstock sector sync | Market | 2 min |
| B | `listSscDocuments()` — SSC check per stock | Market | 2 min |
| C | `fetchHosePrices()` — prices + sector context | Market | 2 min |
| D | `runImpactChain()` — cascade + σ adjustments | Market | 2 min |
| E | `sendAlerts()` — unnotified HIGH/CRITICAL → Telegram | Market | 2 min |

## Periodic Summary Jobs (env-overridable)

| Schedule | Job | Env Override |
|----------|-----|--------------|
| 22:30 daily | Daily summary | `CRON_SUMMARY_DAILY` |
| 23:00 Sunday | Weekly summary | `CRON_SUMMARY_WEEKLY` |
| 00:30 1st of month | Monthly summary | `CRON_SUMMARY_MONTHLY` |
| 01:00 Jan/Apr/Jul/Oct 1st | Quarterly summary | `CRON_SUMMARY_QUARTERLY` |
| 02:00 Jan 2nd | Yearly summary | `CRON_SUMMARY_YEARLY` |

## VPS Proxy Watchdog

`vpsProxyWatchdogJob.ts` — runs `*/10 2-8 * * 1-5` UTC (market hours).
Reads `MAX(market_prices.updated_at)`. If >5 min stale → one Telegram MARKET alert (30-min cooldown).
**NEVER SSHes into VPS.** VPS liveness owned by systemd (`vn-price-fetch.service`, `Restart=always`).
