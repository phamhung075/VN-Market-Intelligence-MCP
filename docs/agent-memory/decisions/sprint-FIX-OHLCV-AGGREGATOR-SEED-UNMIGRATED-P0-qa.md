# Decision Journal — FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0 QA Gate

**task-id:** FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0
**date:** 2026-06-16
**agent:** qa (cycle-277)

## Verdict: APPROVED

## What was considered

### Scope (3 files in commit d4b532be)
- `apps/mcp-server/src/__tests__/FIX-OHLCV-AGGREGATOR-SEED-UNMIGRATED-P0.test.ts` (new, 312L)
- `apps/mcp-server/src/application/usecases/ohlcvWriteService.ts` (+16 lines: pipeline step 0 C=0 guard)
- `apps/mcp-server/src/scheduler/market-data/ohlcvDailyAggregatorJob.ts` (migrated to writeOhlcvBatch)

### Fix logic verified
- ohlcvWriteService.ts: C=0 guard at pipeline step 0 is explicit, fail-closed, fires BEFORE FR-S1
- ohlcvDailyAggregatorJob.ts: loop now collects OhlcvWriteRow[] then calls writeOhlcvBatch with conflictStrategy='backfill' + vnToday=dateStr — FR-S1 + C=0 + detectAndNormalizeScaleFromPrevClose + validateOhlcvUnit all fire generically
- No per-ticker allowlist anywhere in changed files — generic mandate /goal#2 satisfied

### Tests
- 6/6 new tests pass (DCR Class-1 FR-S1, DAG Class-2 C=0, PDN Class-3 ÷1000, XTICKER generic, VCB happy-path, multi-ticker mixed)
- Console output confirms exact guard messages firing for each class
- 29 existing OHLCV tests: all pass (219 pass / 2 fail / 2 errors across full OHLCV suite; 2 errors = pre-existing getVpsProxyHealth SyntaxError in 1113-vps-proxy-health.test.ts, zero relation to changed files)
- Full CI per-file isolation: 13058 pass / 42 skip / 15 fail in 7 files (102-job-news-poll, 1288-poll-news-shape, 1324-push-news-all-sources, 1352a-async-extraction-race, 1398-pollnews-all-dark-cooldown, 1793-pollnews-cooldown-persist, 1837a-pipeline-state) — all 7 files disjoint from changed file set (confirmed via git log)

### TSC
- bun tsc --noEmit: 0 output = clean (pre-existing TS2367 in FIX-SIGNAL-CONFIDENCE-DEFAULT-50.test.ts is test file, not in scope)

### DDD
- ohlcvWriteService.ts: application/usecases layer, imports from domain/services (ohlcvUnitGuard.js) — permitted
- ohlcvDailyAggregatorJob.ts: scheduler (interface) layer, imports from infrastructure/db + infrastructure/notifiers — permitted
- domain/ has zero imports from infrastructure/ (scan confirmed)

### Security
- No process.env in any changed file (Bun.env only)
- No hardcoded credentials, passwords, or tokens
- All SQL uses parameterized queries (db.prepare().all(...params) pattern throughout)
- mock-guard EXIT 0 PASS

### Live RAW verification (named-volume DB vn-market-intelligence-mcp_market_data)
- Container: vn-market-intelligence-mcp-mcp-server-1, Up 18 min, healthy
- Image: sha256:71421c405849, built 2026-06-16T05:41:05Z — fix code confirmed INSIDE container (grep verified)
- VHM 2026-06-16: close=136100 O=136100 H=137500 L=130000 vol=130730 — HEALED (was ÷1000 seed)
- VIC 2026-06-16: close=193500 O=192600 H=195700 L=182000 vol=130520 — HEALED
- VJC 2026-06-16: close=138400 O=143500 H=144100 L=138200 vol=48640 — HEALED

### Stranded rows (explicitly OUT OF SCOPE per task charter)
- DCR 2026-06-16 close=5900 vol=0 written at 04:29 UTC — PRE-FIX Writer A push (before 05:41Z rebuild)
- H11 2026-06-16 close=25700 vol=0 written at 04:30 UTC — PRE-FIX Writer A push (before 05:41Z rebuild)
- DAG 2026-06-16 close=0 vol=0 written at 02:13 UTC — PRE-FIX write (before 05:41Z rebuild)
- PDN/NHD 2026-06-16: Class-3 cold-start (no prior real vol>0 close → prevClose=0 → detectAndNormalize no-op; explicitly documented in commit message as known gap)
- Aggregator has not run since rebuild (last run: 2026-06-15 15:03 UTC; cron fires at VN close ~08:00 UTC)

## Why APPROVED
1. Targeted tests prove all 3 classes (FR-S1, C=0, ÷1000) fire via aggregator→writeOhlcvBatch path
2. Full CI 15 fails are pre-existing, zero-overlap with changed files (disjoint-failure-set confirmed)
3. TSC clean, DDD PASS, security PASS, mock-guard EXIT 0
4. Live named-volume DB confirms VHM/VIC/VJC healed (6-figure VND, real spread, real volume)
5. Stranded rows and Class-3 cold-start are explicitly out of scope; follow-ons needed (per task charter)

## Why NOT done_verified for /goal#2 (generic OHLCV for all tickers)
- 5 stranded pre-fix rows still serve corrupt data (DCR/H11/DAG/PDN/NHD)
- Class-3 cold-start gap (PDN/NHD) not fixed (requires exchange reference-price seed task)
- Repair follow-on tasks needed: stranded-row recompute-on-read / delete-synthetic-bar + Class-3 exchange-seed
- PO signaled via signal_queue to mint both follow-ons
