# Cron Jobs — Scheduling Logic

**Load when:** scheduling, job registration, or timing of automated cycles.

## Job List & Count

Live data → `docs/data/cron-registry.json`

**Orphan** (not registered): none | **Legacy** (fallback test only): `newsPollerJob.ts`

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

## Evidence & Prediction Pipeline Jobs

| Schedule | Job | Task |
|----------|-----|------|
| 16:00 UTC daily (23:00 VN) | `evidenceAccumulatorJob` — aggregates evidence fragments per stock into bullish/bearish scores | 1118 |
| 19:00 UTC Sunday (02:00 VN Mon) | `baseRateComputationJob` — weekly recompute of per-signal-type base rates for calibration | 1122 |
| 16:30 UTC daily (23:30 VN) | `predictionResolutionJob` — resolves prediction claims whose horizon has expired; computes Brier score | 1125 |
| 13:00 UTC Sunday (20:00 VN) | `calibrationReportJob` — weekly Brier score calibration report + Telegram digest to WORK | 1128 |
| 09:30 UTC M-F (16:30 VN) | `foreignFlowAlertJob` — daily foreign flow smart-money scan; fires HIGH alerts + evidence fragments | 1133 |
| 01:00 UTC daily (08:00 VN) | `insiderCheckJob` — SSC insider transaction check + streak detection + evidence fragments | 1143 |

## VPS Proxy Watchdog (price)

`vpsProxyWatchdogJob.ts` — runs `*/10 2-8 * * 1-5` UTC (market hours).
Reads `MAX(market_prices.updated_at)`. If >15 min stale → one Telegram WORK alert (30-min cooldown).
**NEVER SSHes into VPS.** VPS liveness owned by systemd on Vinahost (`vn-price-fetch.service`, `Restart=always`).

## VPS Services (VPS-side only)

NOT Bun schedulers. Five systemd units on Vinahost VPS Vietnam (`$VINAHOST_IP`). Deploy: `./deploy-vinahost.sh`. Health check: `ssh root@$VINAHOST_IP /root/vps-status.sh`.

| Service | Script | Interval | What |
|---------|--------|----------|------|
| `vn-price-fetch.service` | `fetch-prices.sh` | 60s market hours | VN stock prices + foreign flow |
| `vn-bctc-fetch.service` | `fetch-bctc.sh` | 6h | BCTC PDF queue |
| `vn-news-fetch.service` | `fetch-vn-news.sh` | 15min | 10 news sources, 226 items/cycle |
| `vn-sbv-fetch.service` | `fetch-sbv.sh` | 30min | VCB FX rates |
| `vn-foreign-flow.service` | `fetch-foreign-flow.sh` | 60s market hours | Foreign buy/sell |

BCTC queue: `GET /api/bctc-fetch-queue` (pulls `bctc_vps_queue` pending rows) | `POST /api/push-bctc-pdf` (multipart PDF → MCP parses + stores).
Bot-guarded sources: `vps-scripts/fetch-browser.py` (Playwright/Chromium).
Full design → `docs/ARCHITECTURE.md#vps-proxy-geo-block-workaround`

## Claude Code Agent Crons (CronCreate — session-scoped)

| Schedule (UTC) | Agent | Model | Frequency rationale |
|----------------|-------|-------|---------------------|
| `7 * * * *` | dev-team (po→ba→architect→pm→developer→qa→fixer→ops) | mixed (sonnet/haiku) | Hourly. Calls individual agents in sequence. **Ops runs last (~30s baseline health check)**. Total 45-min cap. |
| `0 */6 * * *` | code-janitor | haiku | Every 6h. Mechanical grep — haiku sufficient. Early-exit if 0 src/ commits in 6h. |
| `0 16 * * *` | system-auditor | sonnet | 1x/day 23:00 VN. Early-exit if 0 commits in 24h. |
| `30 17 * * 1,4` | claude-manager-helper | sonnet | 2x/week (Mon+Thu 00:30 VN). Early-exit if 0 context file changes in 3 days. |
| `*/10 2-8 * * 1-5` | ops-emergency (escalation hook) | haiku | Market hours, 10-min cadence. **Only runs if VPS watchdog flags issue.** Otherwise silent observer. |

**Token economy rules applied:**
- All cron prompts are minimal (~20 words) — agent `.md` has full instructions
- All agents have Early Exit guards — skip full scan when no changes detected
- All agents run `/compact` before exiting to compress session context
