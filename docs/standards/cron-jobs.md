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
| 08:13 UTC M-F (15:13 VN) | `foreignFlowAlertJob` — daily foreign flow smart-money scan; fires HIGH alerts + evidence fragments (moved from 09:30 → 08:13 UTC by Sprint 1949-T6; EOD chef reads at 08:37 UTC, 24min window) | 1133 |
| 01:00 UTC daily (08:00 VN) | `insiderCheckJob` — SSC insider transaction check + streak detection + evidence fragments | 1143 |

## Signal Verdict Resolution

| Schedule | Job | Task |
|----------|-----|------|
| `0 * * * *` (hourly) | `verdictResolutionJob` — resolves pending `agent_signals` verdicts (confirmed / false_positive) based on 4h price direction match; 24h window guard skips fresh signals; 30d TTL pruning; fail-loud to BUG channel on price fetch error | 1863 |

Source: `apps/mcp-server/src/scheduler/alerts/verdictResolutionJob.ts`
Verdict lifecycle → `docs/policies/alert-policy.md` (Signal Verdict Lifecycle section)

## Signal Outcome Feedback Loop

| Schedule | Job | Task |
|----------|-----|------|
| `17 * * * *` (hourly) | `signalOutcomeResolutionJob` — resolves T+24h / T+48h pending rows in `signal_outcomes`; compares entry vs resolution price; classifies correct/incorrect/neutral | 1941 |
| `0 7 * * *` (daily 07:00 UTC) | `accuracyDigestJob` — computes 30-day accuracy from `signal_outcomes`; formats top-3/bottom-3 signal types + new stocks count; sends to WORK channel. AC-3 skip when empty; AC-8 short digest when all-neutral. DB-backed dedup via `cron_job_runs` | 1941c |

Source: `apps/mcp-server/src/scheduler/digest/accuracyDigestJob.ts`
Env override: `CRON_ACCURACY_DIGEST` (default `0 7 * * *`)

## Analysis Ownership (dedup policy)

| Domain | Owner | Verifier | Notes |
|--------|-------|----------|-------|
| Weekly market analysis | `digest-predict/weekly` (Sun 16:00) | `unified-agent/weekly` (Sun 13:00) | unified-agent verifies delivery only, no analysis tools |
| Daily market digest | `digest-predict/daily` (15:30) | `unified-agent/daily-review` (20:00) | daily-review = health check, not analysis |
| Prediction review | `unified-agent/prediction` (daily 01:00) | — | Lightweight accuracy check; server resolves via `predictionResolutionJob` |
| Calibration report | server `calibrationReportJob` (Sun 13:00) | — | Sends to MARKET + WORK; digest-predict/weekly must NOT re-call `get_calibration_report()` |
| Summary data (daily/weekly/monthly) | server `summaryJobs` | — | Data generators only (no Telegram); agents read via `get_market_summary()` |

## Macro Indicator Refresh Job — FRED Fetchers

`macroIndicatorRefreshJob` (schedule: `CRON_MACRO_INDICATOR_REFRESH`, default `13 19 * * *` — rescheduled Sprint 1949-T7; was `0 6 * * *`) fires at 19:13 UTC (02:13 VN next day / 21:13 France), 24min before Evening Preview chef at 19:37 UTC. Calls:

| Fetcher | FRED Series | Storage | Task |
|---------|-------------|---------|------|
| `fetchFedFundsRate()` | `FEDFUNDS` (monthly) | `tracked_indicators` | 1423b |
| `fetchFredEffrIorb()` | `EFFR` + `IORB` (daily) | `fred_series_daily` | 1879a |

`fetchFredEffrIorb` persists full FRED history on first run (backfill), then adds 0 new rows for already-seen `(series, date)` pairs (`INSERT OR IGNORE` idempotency). HTTP failures retry 3x with exponential backoff; permanent failure → null returned, nothing written.

Source: `apps/mcp-server/src/scheduler/macro/macroIndicatorRefreshJob.ts`

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

### Chef Cook Schedule (Sprint 1949 — unified-agent as CHEF)

| Schedule (UTC) | VN (GMT+7) | France (CEST) | Agent | Dish |
|----------------|------------|---------------|-------|------|
| `23 5 * * 1-5` | 12:23 | 07:23 | unified-agent | Morning Dish — overnight macro + VN morning session synthesis |
| `13 2-8 * * 1-5` | XX:13 | XX:13 | unified-agent | Intraday convergence scan — silent if no cluster qualifies |
| `37 8 * * 1-5` | 15:37 | 10:37 | unified-agent | EOD Dish — all settle data + foreign flow (signal available from 08:13) |
| `37 19 * * *` | 02:37+1 | 21:37 | unified-agent | Evening Preview — US/EU session + tomorrow setup |
| `47 13 * * 0` | 20:47 Sun | 15:47 Sun | digest-predict | Weekly calibration + portfolio thesis |

### Dev-Team + Ops Agent Crons

| Schedule (UTC) | Agent | Model | Frequency rationale |
|----------------|-------|-------|---------------------|
| `7 * * * *` | dev-team (po→ba→architect→pm→developer→qa→fixer→ops) | mixed (sonnet/haiku) | Hourly. Calls individual agents in sequence. **Ops runs last (~30s baseline health check)**. Total 45-min cap. |
| `0 */6 * * *` | code-janitor | haiku | Every 6h. Mechanical grep — haiku sufficient. Early-exit if 0 src/ commits in 6h. |
| `0 16 * * *` | system-auditor | sonnet | 1x/day 23:00 VN. Early-exit if 0 commits in 24h. |
| `30 17 * * 1,4` | claude-manager-helper | sonnet | 2x/week (Mon+Thu 00:30 VN). Early-exit if 0 context file changes in 3 days. |
| `13 20 * * *` | tran-ngoc-bau quality audit | sonnet | 1x/day 03:13 VN next day. Audits chef narrative for TNB layer walk completeness (moved from `0 13 * * *` by Sprint 1949-T9). |
| `*/10 2-8 * * 1-5` | ops-emergency (escalation hook) | haiku | Market hours, 10-min cadence. **Only runs if VPS watchdog flags issue.** Otherwise silent observer. |

**Token economy rules applied:**
- All cron prompts are minimal (~20 words) — agent `.md` has full instructions
- All agents have Early Exit guards — skip full scan when no changes detected
- All agents run `/compact` before exiting to compress session context
