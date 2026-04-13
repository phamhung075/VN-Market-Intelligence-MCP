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
Reads `MAX(market_prices.updated_at)`. If >5 min stale → one Telegram MARKET alert (30-min cooldown).
**NEVER SSHes into VPS.** VPS liveness owned by systemd (`vn-price-fetch.service`, `Restart=always`).

## VPS BCTC PDF Proxy (VPS-side only, task 1112)

NOT a Bun scheduler. Two systemd units on Vultr VPS Singapore:
- `vn-bctc-fetch.service` (`Restart=always`, `RestartSec=10`) → `fetch-bctc-loop.sh` → `fetch-bctc.sh`
- Cadence: every 6 hours (no market-hours window — BCTC filings published any time)
- Queue: `GET /api/bctc-fetch-queue` (pulls `bctc_vps_queue` pending rows)
- Push: `POST /api/push-bctc-pdf` (multipart PDF → MCP parses + stores)
Full design → `docs/ARCHITECTURE.md#bctc-pdf-proxy-vn-bctc-fetchservice----task-1112`

## Claude Code Agent Crons (CronCreate — session-scoped)

| Schedule (UTC) | Agent | Model | Frequency rationale |
|----------------|-------|-------|---------------------|
| `0 */6 * * *` | code-janitor | haiku | Every 6h. Mechanical grep — haiku sufficient. Early-exit if 0 src/ commits in 6h. |
| `0 16 * * *` | system-auditor | sonnet | 1x/day 23:00 VN. Early-exit if 0 commits in 24h. |
| `30 17 * * 1,4` | claude-manager-helper | sonnet | 2x/week (Mon+Thu 00:30 VN). Early-exit if 0 context file changes in 3 days. |

**Token economy rules applied:**
- All cron prompts are minimal (~20 words) — agent `.md` has full instructions
- All agents have Early Exit guards — skip full scan when no changes detected
- All agents run `/compact` before exiting to compress session context
