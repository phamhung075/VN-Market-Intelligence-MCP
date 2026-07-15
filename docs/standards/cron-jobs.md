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
| 19:00 UTC daily (02:00 VN) | `baseRateComputationJob` — daily recompute of per-signal-type base rates for calibration (upgraded from weekly by BA-PREDICTION-EVIDENCE-REVIVAL FR-1.2/B4 — removes up-to-7-day LR-recompute latency; RISK-1: cron string + `DAILY_CADENCE_MS` T4 dedup guard must move together) | 1122 |
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

## OHLCV Data Quality & TA Indicator Restoration

| Schedule | Job | Task |
|----------|-----|------|
| `30 1 * * 1-5` (01:30 UTC, pre-market) | `taOhlcvBackfillJob` — daily TA OHLCV restoration backfill. Detects tickers with < 35 rows (MACD minimum) or any `low=0` corrupt rows (1972-era VNDIRECT null-coercion bug). Fetches from api-finfo.vndirect.com.vn with INSERT OR REPLACE to overwrite corrupt data. Returns `{covered, backfilled, sparse, errors}`. | 1970 |

- `TA_MIN_ROWS = 35`: MACD(12,26,9) requires 34 prices (slow+signal-1=34); RSI(14) requires 15; BB(20) requires 20. 35 is the safe universal minimum.
- `covered`: tickers with >= 35 clean rows (no fetch needed)
- `backfilled`: tickers successfully fetched + upserted with >= 35 valid rows
- `sparse`: tickers where API returned < 35 rows (best-effort insert, TA still limited)
- Env override: `CRON_TA_OHLCV_BACKFILL` (default `30 1 * * 1-5`)
- Source: `apps/mcp-server/src/scheduler/market-data/taOhlcvBackfillJob.ts`

## Intraday 5-min OHLCV Compaction (Archive-Now)

| Schedule | Job | Task |
|----------|-----|------|
| `*/5 * * * *` (24/7, no market-hours gate) | `intraday5mCompactorJob` — compacts `market_prices_history` ticks into 5-min UTC-aligned OHLCV bars in `intraday_ohlcv_5m` (open/high/low/close + MAX(volume) cumulative-to-date convention, same as `daily_ohlcv` + `tick_count`), ALL codes present in the source table (not watchlist-scoped, unlike `ohlcvDailyAggregatorJob`) | ALPHA-S2 |

- **Why:** `market_prices_history` is purged on a rolling ~24h window as a side effect of every `/api/push-prices` write (`pushPricesHandler.ts`), not a fixed nightly job — VN intraday ticks are otherwise unrecoverable once purged. This job compacts them into a permanent 5-min archive before that purge fires.
- Idempotent full-row `INSERT OR REPLACE` every run (recomputes each bucket from all currently-surviving source ticks) — safe to re-run, gap-tolerant if a cycle is skipped.
- Zero market-hours dependence by design (contrast `taAlertScanJob`/`vpsProxyWatchdogJob`, which correctly DO restrict to market hours for their own domains) — an empty source table on weekends/holidays is a no-op, not an error.
- Startup one-shot call wired in `startScheduler.ts` doubles as the backfill of ticks surviving at deploy time — no separate migration script.
- Env override: `CRON_INTRADAY_5M_COMPACTOR` (default `*/5 * * * *`)
- Source: `apps/mcp-server/src/scheduler/market-data/intraday5mCompactorJob.ts`
- Design SSOT: `docs/architecture-briefs/2026-07-14-alpha-s2-tick-downsample-5min.md`

## Intraday 5-min Foreign-Flow Compaction (Archive-Now)

| Schedule | Job | Task |
|----------|-----|------|
| `*/5 * * * *` (24/7, no market-hours gate) | `intradayForeignFlow5mCompactorJob` — compacts `foreign_flow_history` ticks into 5-min UTC-aligned buckets in `intraday_foreign_flow_5m` using LAST-value-in-bucket semantics (NOT OHLC — foreign flow columns are cumulative-to-date counters/point-in-time gauges, no open/high/low concept), ALL codes present, standalone table/job from the price plane (`intraday_ohlcv_5m`/`intraday5mCompactorJob`) — distinct bounded context | ALPHA-S2-FOREIGN-FLOW-WRITE-RACE |

- **Why:** every 60s `/api/push-foreign-flow` push writes directly into the final per-day tables (`daily_foreign_flow`, `vnstock_trading_stats`) via unconditional last-write-wins upserts — no intraday curve was ever preserved. `pushForeignFlowHandler.ts` Step 6b additively appends each normalized item into `foreign_flow_history` (raw ticks) before this job compacts it into a permanent 5-min archive, ahead of that handler's own rolling ~24h purge.
- Aggregation is LAST-non-null-value-wins per column (COALESCE-style — a payload missing a field mid-bucket does not blank out a previously-known value), NOT open/high/low/close. `foreign_net_vol` is computed at write time from the bucket's last-known buy/sell pair.
- Idempotent full-row `INSERT OR REPLACE` every run (recomputes each bucket from all currently-surviving source ticks) — safe to re-run, gap-tolerant if a cycle is skipped.
- Zero market-hours dependence by design — an empty `foreign_flow_history` table on weekends/holidays is a no-op, not an error.
- Startup one-shot call wired in `startScheduler.ts` doubles as the backfill of ticks surviving at deploy time — no separate migration script.
- Env override: `CRON_INTRADAY_FOREIGN_FLOW_5M_COMPACTOR` (default `*/5 * * * *`)
- Source: `apps/mcp-server/src/scheduler/market-data/intradayForeignFlow5mCompactorJob.ts`
- Design SSOT: `docs/architecture-briefs/2026-07-15-alpha-s2-foreign-flow-write-race-verdict.md`

## SBV OMO Liquidity Cron (Trigger-Only)

| Schedule | Job | Task |
|----------|-----|------|
| `9 9 * * *` (09:09 UTC daily, 16:09 VN, not weekday-gated) | `sbvOmoLiquidityCronJob` — triggers `POST /liquidity-state` on the macro-indicators microservice so `sbv_omo_daily` accrues today's row | ALPHA-S2-OMO-LIQUIDITY-CRON |

- **Why:** `apps/macro-indicators/` (Go) already persists `sbv_omo_daily` as a write-on-fetch side effect of every `POST /liquidity-state` call (idempotent `ON CONFLICT(auction_date) DO UPDATE`, write ONLY when `omoInputs.ParseOK===true` — P0-3-OMO-CURVE, commit `cd8cfcc2`). The only gap was "nobody calls the endpoint on a schedule" — this job is a pure trigger, zero DDL / zero new tables.
- **Zero local DB writes** — this job reuses `macroFetch<T>()` + `LiquidityStateResponseSchema` (both already exercised by the on-demand `get_vn_liquidity_state` MCP tool) and never touches `market.db`. The response's `omo_curve` (non-null) confirms server-side persistence; nothing for this job to get wrong on the data-integrity axis.
- **Fail-loud contract (deliberately asymmetric):**
  - HARD fail (`macroFetch` returns `ok:false` — transport/endpoint/VPS down) → `sendTelegramBug()` + `logger.error`, **every** occurrence (dedup handled by the notifier's own 4h window).
  - SOFT fail (HTTP 200 but `omo.is_estimate===true` — SBV OMO parse degraded inside macro-indicators) → `logger.warn` ONLY, no Telegram BUG alert. Ambiguous outcome (may be a legitimate no-auction day) — elevating every occurrence to BUG would manufacture false incidents out of normal SBV publishing cadence.
  - Success (`omo.is_estimate===false`) → `logger.info`, no alert.
- No startup one-shot (unlike the two intraday compactors) — today's row either exists or it doesn't; calling the endpoint twice on deploy would just re-fetch the same idempotent row.
- Env override: `CRON_SBV_OMO_LIQUIDITY` (default `9 9 * * *`)
- Source: `apps/mcp-server/src/scheduler/macro/sbvOmoLiquidityCronJob.ts`
- Design SSOT: `docs/architecture-briefs/2026-07-15-alpha-s2-omo-liquidity-cron.md`

## RAG FTS Rebuild Cron (Trigger-Only)

| Schedule | Job | Task |
|----------|-----|------|
| `15 20 * * *` (20:15 UTC daily, 03:15 VN next day) | `ragFtsRebuildCronJob` — triggers `POST /admin/rebuild-fts` on the rag-service microservice so the BM25 hybrid-search leg picks up rows indexed since the last rebuild | ALPHA-S2-RAG-FTS-REBUILD-CRON |

- **Why:** `apps/rag-service/` (Python) already owns and unit-tests `POST /admin/rebuild-fts` (DFR-P3, AC-P3R-5, `__tests__/unit/test_dfr_p3_hybrid_search.py`), which rebuilds the LanceDB `title`+`summary` FTS indexes over `rag_entries` server-side. The DFR-P3 blueprint's own design ("Option C: lazy-on-first-hybrid-query + scheduled daily refresh") only ever shipped the lazy half — the scheduled half was never wired. This job closes that gap; zero new DDL / zero new tables / no `apps/rag-service/` code change.
- **Zero local DB writes** — this job calls the new `ragRebuildFts()` client function (`infrastructure/rag/ragHttpClient.ts`, same fetch + `AbortSignal.timeout` convention as `ragSearch`/`ragIndex`) and never touches `market.db`. The LanceDB index mutation happens entirely server-side inside rag-service.
- **Fail-loud contract (single branch — simpler than the OMO sibling):** `POST /admin/rebuild-fts` has no ambiguous partial-success state (200 `{"status":"ok"}` or raises/500s).
  - HARD fail (non-2xx / network error / 90s timeout) → `sendTelegramBug()` + `logger.error`, **every** occurrence (dedup handled by the notifier's own 4h window).
  - Success (`{"status":"ok"}`) → `logger.info`, no alert.
- **90s deadline** (not the 8s used by `ragSearch`/`ragIndex`) — the DFR-P3 blueprint documents ~30-60s FTS build time at 14k+ rows; a tighter deadline would manufacture a false HARD-fail BUG alert every night for a legitimately slow-but-successful rebuild.
- No startup one-shot — nothing to backfill; the index either needs rebuilding or the lazy-build fallback (`_fts_index_built` per-container flag) already covers it. Calling it twice on deploy would just re-trigger the same idempotent-effect rebuild.
- Env override: `CRON_RAG_FTS_REBUILD` (default `15 20 * * *`)
- Source: `apps/mcp-server/src/scheduler/rag/ragFtsRebuildCronJob.ts`
- Design SSOT: `docs/architecture-briefs/2026-07-15-alpha-s2-rag-fts-rebuild-cron.md`

**GATED OFF BY DEFAULT (ALPHA-S2-RAG-FTS-CRON-SAFETY-GATE, 2026-07-15):** this cron shipped
(commit `35cc8cd56`) ahead of the rag-service capacity fix — an FTS rebuild at ~56k rows
cannot complete inside rag-service's 768m cgroup, so an armed cron OOMs the service every
night at 20:15 UTC. `schedulerJobTable.ts`'s `buildJobTable()` now reads
`CRON_RAG_FTS_REBUILD_ENABLED` and OMITS the `ragFtsRebuildCronJob` entry entirely
(registration-time defusal, not a runtime no-op) unless it is explicitly `'true'` — so a
stray mcp-server redeploy cannot arm it. Do **NOT** disable via `CRON_RAG_FTS_REBUILD=''` —
`cronConfig.ts` reads that value with `??`, which does not treat `''` as absent, and an
empty cron expression crashes croner at boot. Stays OFF until
`RAG-FTS-BUILD-MEMORY-BOUND` (rag capacity fix, parked BLOCKED) is verified fixed.
- Env flag: `CRON_RAG_FTS_REBUILD_ENABLED` (default unset/`false` — job NOT registered; set `'true'` to register with `CRON_RAG_FTS_REBUILD`'s cron expression)

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
5th source added by BA-PREDICTION-EVIDENCE-REVIVAL FR-2.2: `readLatestInsiderTimestamp()` reads
`MAX(insider_transactions.fetched_at)`; stale >4 days (job is daily, not intraday) → alerts
`vn-ssc-insider-fetch` in the same consolidated message, observability-only (closes the silent-bug
blind spot where `insiderCheckJob` recorded `status='success'` for ~2 months while the VPS proxy's
SSC-portal fetch 502'd on every run). The actual VPS↔SSC connectivity fix is decoupled to backlog
`FIX-VPS-SSC-INSIDER-502` (zone `vps-scripts/`), not attempted here.

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

Operator runbook (telemetry meanings + recovery) → `docs/protocols/chef-pipeline-runbook.md`

| Schedule (UTC) | VN (GMT+7) | France (CEST) | Agent | Dish |
|----------------|------------|---------------|-------|------|
| `15 5 * * 1-5` | 12:15 | 07:15 | unified-agent | Morning Dish — overnight macro + VN morning session synthesis |
| `13 2-8 * * 1-5` | XX:13 | XX:13 | unified-agent | Intraday convergence scan — silent if no cluster qualifies |
| `45 8 * * 1-5` | 15:45 | 10:45 | unified-agent | EOD Dish — all settle data + foreign flow (signal available from 08:13) |
| `45 19 * * *` | 02:45+1 | 21:45 | unified-agent | Evening Preview — US/EU session + tomorrow setup |
| `47 13 * * 0` | 20:47 Sun | 15:47 Sun | digest-predict | Weekly calibration + portfolio thesis |

### Dev-Team + Ops Agent Crons

| Schedule (UTC) | Agent | Model | Frequency rationale |
|----------------|-------|-------|---------------------|
| `*/15 * * * *` | cowork-team (master dispatcher) | mixed | Every 15 min. Reads `docs/data/cowork-schedule.json`, matches cron ±2min, parallel-spawns all due cowork agents. Replaces 16 RemoteTrigger slots (Sprint 1951). Silent exit if no slots due. |
| `7 * * * *` | dev-team (po→ba→architect→pm→developer→qa→fixer→ops) | mixed (sonnet/haiku) | Hourly. Calls individual agents in sequence. **Ops runs last (~30s baseline health check)**. Total 45-min cap. |
| `0 */6 * * *` | code-janitor | haiku | Every 6h. Mechanical grep — haiku sufficient. Early-exit if 0 src/ commits in 6h. |
| `0 16 * * *` | system-auditor | sonnet | 1x/day 23:00 VN. Early-exit if 0 commits in 24h. |
| `30 17 * * 1,4` | claude-manager-helper | sonnet | 2x/week (Mon+Thu 00:30 VN). Early-exit if 0 context file changes in 3 days. |
| `13 20 * * *` | tran-ngoc-bau quality audit | sonnet | 1x/day 03:13 VN next day. Audits chef narrative for TNB layer walk completeness (moved from `0 13 * * *` by Sprint 1949-T9). |
| `*/10 2-8 * * 1-5` | ops-emergency (escalation hook) | haiku | Market hours, 10-min cadence. **Only runs if VPS watchdog flags issue.** Otherwise silent observer. |

**cowork-team collision-safety (Sprint 1955 Phase 2):** Each matched slot is wrapped in `task_claim(task_kind=cowork-slot, ttl_seconds=900)` before spawning. If a second terminal fires the same nominal_tick, `task_claim` returns `claimed=false` and that slot is silently skipped — no duplicate cowork spawn. Model 1: master holds lock, no agent heartbeat, 15-min TTL auto-expires. Full protocol: `docs/protocols/task-lock-protocol.md`.

**Token economy rules applied:**
- All cron prompts are minimal (~20 words) — agent `.md` has full instructions
- All agents have Early Exit guards — skip full scan when no changes detected
- All agents run `/compact` before exiting to compress session context

### Push Backstop (dedicated launchd timer — Option-A, PIVOTED 2026-06-18)

**PIVOT — Option-B (PO-tick flow-step) was structurally wrong and is RETIRED as the trigger.**
The flow-step-at-tick-exit approach NEVER fired in autonomous operation. Root cause
(FIX-AUTO-PUSH-TRIGGER-NOT-FIRING, failure mode (a) "step never reached"):
- The `*/15` cowork dispatcher has NO `po`/`dev-team` slot — PO is not on the 15-min cadence at all.
- PO is spawned ONLY by the `7 * * * *` dev-team router (Step 1) as a **background triage sub-agent**
  whose contract is "return a BATCH or NOTHING". In that mode PO's `main.md` routes straight to a
  triage sub-flow (`channel-audit.md` / `triage-signals.md` / `sprint-kickoff.md` / `sprint-signoff.md`),
  and **each sub-flow has its own `## RETURN` block that hands control back to the dev-team router** —
  it never routes back up through `main.md` Step PUSH-BACKSTOP. So the inline tick-exit step is dead code
  on the only path the autonomous tick actually takes.
- Observed impact: local sat >20 ahead across multiple router-passes (23 → 32-ahead), origin received
  zero fleet-push merges in that window. "Actually fires" beats "no new cron."

**Mechanism (now): dedicated launchd timer** — `com.vn-market.fleet-push`.
| Field | Value |
|-------|-------|
| Plist | `launchd/com.vn-market.fleet-push.plist` (installed to `~/Library/LaunchAgents/`) |
| Cadence | `StartInterval` 1800s (30 min) + `RunAtLoad` |
| Program | `bash scripts/fleet-worktree-push.sh` |
| Threshold | `PUSH_THRESHOLD=20` (env, tunable in plist, no rebuild) |
| Logs | `docs/agent-memory/sessions/fleet-push{,-error}.log` |
| KeepAlive | `false` — one-shot per interval; script exits 0/1 by design |

**Why a dumb timer is safe:** the script is fully self-guarding — no-op when `ahead <= PUSH_THRESHOLD`,
worktree-isolated (never touches the perpetually-dirty main working tree), aborts with a BUG telegram
when the origin behind-set touches divergent code/config, runs the mandatory `pnpm --filter vn-market check`
pre-push gate, and self-cleans the worktree on every exit. No flow-step coordination, no commit-mutex
gateway dependency (which fail-closed in sub-agents). Threshold-gated → most 30-min runs are sub-second no-ops.

**Install / re-arm** (after machine restart): `launchctl load ~/Library/LaunchAgents/com.vn-market.fleet-push.plist`.

**Flow-step status:** `docs/agents/po/flow/main.md` Step PUSH-BACKSTOP + `docs/agents/dev-team/flow/post-cycle.md`
Step 4.8 are retained as a SECONDARY opportunistic best-effort (harmless when they do run on a real router
tick) but are NO LONGER the primary trigger — the launchd timer is authoritative.
**References:** `docs/architecture-briefs/2026-06-18-auto-push-threshold-backstop.md` (§2 Options Evaluation — Option-A now selected)

### Cowork Guaranteed-Slot Firer (dedicated launchd timer — F1-LAUNCHD-COWORK-BACKSTOP)

**Root cause closed:** The cowork-team master CronCreate dispatcher is session-scoped — CLI session end evaporates it. The cloud RemoteTrigger backstop is RETIRED (STANDING: no cloud RemoteTrigger — all local). Session end = every `guaranteed:true` slot due in that window is silently missed with no recovery path (memory: `project_cowork_guaranteed_slot_needs_live_cli_session`). Re-verified live 2026-07-07 (~73h outage 2026-07-04→07-07 silenced chef-morning/eod/evening, digest-sunday, fb-daily). This generalizes and RETIRES the fb-only `com.vn-market.fb-daily-firer` (FB-LAUNCHD-DEV-WRAPPER-PLIST-INSTALL) — hardcoding one if-block per new guaranteed slot was itself flagged as a recurring-debt pattern (architecture brief `docs/architecture-briefs/2026-07-07-cowork-guaranteed-slot-durability.md` §3).

**Mechanism (now): dedicated launchd timer** — `com.vn-market.cowork-guaranteed-slot-firer`.
| Field | Value |
|-------|-------|
| Plist | `launchd/com.vn-market.cowork-guaranteed-slot-firer.plist` (install to `~/Library/LaunchAgents/`) |
| Cadence | `StartInterval` 900s (15 min, matching cowork dispatcher cadence) + `RunAtLoad false` |
| Program | `bash scripts/agents-flow/cowork-guaranteed-slot-firer.sh` |
| Match logic | Calls `node scripts/agents-flow/cowork-match-slots.js` (SAME matcher the live `*/15` dispatcher uses), filters returned `slots[]` to `guaranteed===true` — no hardcoded per-slot time gate |
| Invocation | Per matched slot: `claude --dangerously-skip-permissions -p "<slot.trigger_prompt>"`, `trigger_prompt` read VERBATIM off the matched slot object, bounded by `FIRE_TIMEOUT_SECONDS` (default 1800s) |
| Logs | `docs/agent-memory/sessions/cowork-guaranteed-slot-firer{,-error}.log` |
| KeepAlive | `false` — one-shot per interval; script exits 0/1 by design |

**Slots covered** (from `docs/data/cowork-schedule.json`, every `guaranteed: true` row — read live every tick, zero script edits needed to add a new one): `chef-morning`, `chef-eod`, `chef-evening`, `digest-sunday`, `digest-daily`, `tnb-audit`, `fb-daily`, `fb-weekend`. Deliberately EXCLUDES sub-hourly market/offhours slots (`news-scout-market`, `market-watcher-*`, `alert-commander-market`, `bctc-analyst-slot-*`, `refine-bctc-slot-*`) — those stay Layer-B-only by design.

**Dedup:** unchanged — every guaranteed-slot flow (`chef.md` Step 0.5, `digest-predict/flow/main.md` pre-D gate, `fb-market-poster/flow/main.md`'s own gate) claims a published-marker (`task_claim`, FR-P2-7 pattern) before every `send_telegram` call. Even if this firer AND the live cowork dispatcher both fire, only the first winning claim publishes — same dual-layer coexistence model as chef-morning Layer A + Layer B.

**Why StartInterval (not StartCalendarInterval):** The machine is in France (CEST = UTC+2 / CET = UTC+1). StartCalendarInterval uses local time → DST-sensitive. The matcher's own UTC-based cron matching is DST-invariant. Most 15-min ticks are sub-second no-ops (no guaranteed slot due → ~0 token cost).

**Self-check:** `scripts/agents-flow/auditor-tier1-probe.sh` asserts every repo-tracked `launchd/*.plist` label (including this one) is present in `launchctl list` output — catches a silent unload before it causes another multi-day outage (FIX-AUDITOR-T1-PEER-FIRER-HEALTH-DEGRADED; root cause of THIS outage was the old fb-daily-firer plist silently unloading 2026-07-04 with nothing detecting it).

**Install / re-arm** (OPS task OPS-COWORK-GUARANTEED-SLOT-INSTALL): `launchctl unload ~/Library/LaunchAgents/com.vn-market.fb-daily-firer.plist` (old, retired) then `launchctl load ~/Library/LaunchAgents/com.vn-market.cowork-guaranteed-slot-firer.plist`.
**Verify:** `launchctl list | grep cowork-guaranteed-slot-firer` → entry present; PID column non-zero at each guaranteed slot's UTC due time.
**Flow pointer:** `docs/agents/cowork-team/flow/main.md` Step 5 (`spawn-fanout.md`) — launchd is the OS-level backstop that reproduces the same `Agent(<agent>, ...)` spawn when no CLI session is live.
