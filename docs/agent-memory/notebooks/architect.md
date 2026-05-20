# Architect — Notebook

**Last updated:** 2026-05-18 20:15 UTC | **Sprint:** SPIKE-1948e

## This session (2026-05-19 — BCTC write-chain RCA)

Trigger: ≥3 fix commits on BCTC chain in 24h. Recurring-bug escalation.

**Verdict: (b) architectural rot — 3 compounding failures**

Failure A (FATAL): `backfillBctcQ12026.ts:53` uses wrong column names `(ticker, year, quarter)` vs actual schema `(action_code, period_year, period_quarter)`. Every `backfillBctcQ12026` run fails silently at runtime. 103 pending rows in `bctc_vps_queue` came from `server.ts:703` push endpoint, not the backfill.

Failure B (BLOCKER for FPT/GAS): OCR cache race. `bctcPdfPullJob.triggerExtraction()` runs `extractAndStorePdfPagesWithRetry()` then immediately calls `getCachedPdfText(filename)` (line 158). `ocr_cache_count=0` in ops signal confirms `pdf_extracted_text` rows either were not written or the filename lookup missed. Stage 3 guard fires (`cached === null || text < 100 chars`) → `fetchParseAndStoreBctc` never called → 0 rows in `financial_reports`.

Failure C (secondary, EIB/DHG): scanned-image PDFs + 2s inter-page yield = 31 min OCR per pass. Only 3/40 and 3/36 pages extracted. Even if Failure B fixed, these produce confidence ≤ 0.05 (coreFieldsAllZero guard in `parseBctcReport.ts:152`). Would land `validation_status='low_confidence'` at best.

**Quick win (ship now):** Fix backfillBctcQ12026.ts:53-54 column names — 2h, zero risk, unblocks all 30 watchlist tickers for next enricher cycle.

**Sprint plan:** Tasks 5-A through 5-E, dev-mcp-server zone, ≤2 days. PM notified via signal.

Brief: `docs/architecture-briefs/2026-05-19-bctc-write-chain-rca.md`
Signal: `docs/signals/architect-bctc-write-rca.json`

## Previous session (SPIKE-1948e)

PC1 legal_risk signal pipeline review. Read-only, 2h timebox.

**Root cause (three-point cascade):**
1. `SignalTypeSchema` in `agentSignalStore.ts:39-49` has 9 values — `"legal_risk"` is absent. Any `post_agent_signal(signal_type: "legal_risk")` call is Zod-rejected before DB write.
2. `stage-signals.md` defines only `urgent_news` + `chain_catalyst` dispatch paths. No `legal_risk` dispatch block exists. news-scout notebook (04:22 UTC 2026-05-18) confirms: "PC1 chairman arrest — not in watchlist, sector ripple noted." Agent recognised the event but took no signal action.
3. PC1 absent from primary watchlist (`mcp.config.json` L44-58, `WATCHLIST_SEED`) — present only in `referenceStocks.utilities` and `sectorPeers.ts`. Contributing factor to low-urgency classification, not the proximate cause.

**What already works (confirmed intact):**
- `legalRiskDetector.ts` pattern library covers `khởi tố` / `bắt tạm giam` — correct, no keyword changes needed
- `get_legal_risk_signals` read side already queries `agent_signals` (Task 1940a) — correct
- `schema-news.ts` `agent_signals.signal_type TEXT` — no DB-level constraint, neutral to fix
- `policyImpactMapper.ts` recognises prosecution as `legal_risk` PolicyType with `CRIMINAL_PROSECUTION_KEYWORDS` — reusable as classification guidance in Fix B

**Fix sizing: S (both changes)**
- Fix A: add `"legal_risk"` to `SignalTypeSchema` enum (1-line, `agentSignalStore.ts`)
- Fix B: add `legal_risk` dispatch block to `stage-signals.md` with 6h dedup guard

**Key risk R-1:** dedup — legal events must not re-post every 20-min news-scout cycle. Remedy: 6h dedup guard on same `stock_code` + `signal_type = "legal_risk"`.
**Key risk R-3:** 1945 stabilisation window — Fix A touches `agentSignalStore.ts` only. Zero contact with `verdictResolutionJob.ts` or `alert_accuracy` tables. Window safe.

Child task filed: **1948e-fix** (Todo, MEDIUM, dev-mcp-server).
Spike: `docs/spikes/SPIKE_1948e-pc1-legal-risk-pipeline.md`
Brief: `docs/architecture-briefs/2026-05-18-legal-risk-signal-pipeline.md`
TASKS.md: SPIKE-1948e Todo → Done; 1948e-fix added to Backlog.

## Previous session (SPIKE-1947)

Closed-loop auto-improvement system design. Read-only, 3h timebox.

**Host decision:** Option C — scheduler job inside `apps/mcp-server/src/scheduler/audits/selfImproveOrchestratorJob.ts`. Rationale: direct SQLite access to `market.db` (single-writer satisfied — job runs inside mcp-server process), follows `monthlySignalQualityJob.ts` + `accuracyDigestJob.ts` precedent, zero new Docker services. New microservice (Option A) rejected: cross-service DB read violation. Cowork agent (Option B) rejected for Phase 1: token cost + hypothesis quality unproven on new system.

**Detection policy:** Two-window comparison of `getAccuracyStats(db, {days:7})` vs `getAccuracyStats(db, {days:30})`. Degraded = delta ≥ 10pp with ≥3 samples in both windows. Persistently-low = baseline_rate < 40% with ≥10 samples. Min sample threshold = 10 for dispatch.

**New components:**
- `domain/services/degradationRules.ts` — pure rule-lookup table, zero imports, DDD domain layer
- `infrastructure/db/improveCheckStore.ts` — snapshot write/read for recheck baseline
- `infrastructure/db/schema-system.ts` — `improve_check_log` table (add to initSystemTables)
- `scheduler/audits/selfImproveOrchestratorJob.ts` — cron entry point, 09:00 UTC daily

**Key reuse:** `getAccuracyStats()` (already in signalOutcomeStore.ts) is the ONLY query needed for detection. `cron_job_runs.wrapRun()` pattern for dedup. `sendTelegramWork()` for WORK channel.

**Phasing:** Phase 1 (Sprint 1948) = shadow mode (log + WORK Telegram, no dispatch). Phase 2 = manual-gate via signal-bus JSON. Phase 3 = auto-dispatch with kill-switch env var.

**OBSERVE gates:** 3 of 6 can retire once Phase 1 stable: post-1945-verdict-resolution-scored-pct, post-1945-bug-storm-silence, 1941b-signal-outcomes-seed-window. Keep: 1922g-pharma, post-1944-financial-reports, post-1942-fa-verify (data source liveness, not accuracy-loop scope).

**Decision: YES — proceed to Sprint 1948 Phase 1.** Pre-condition: post-1945-verdict-resolution-scored-pct gate must clear 2026-05-20T07:22Z before 1948a starts.

Spike: `docs/spikes/SPIKE_1947-auto-improve-loop.md`
Brief: `docs/architecture-briefs/2026-05-18-closed-loop-auto-improvement.md`
TASKS.md: SPIKE-1947 Todo → Done.

## Previous session (SPIKE-1946)

PLX -40% crash crisis detection gap diagnosis. Read-only, 2h timebox.

Root cause: PLX absent from `watchlist` SQLite table. `get_crisis_early_warning` hard-filters to `SELECT code FROM watchlist` (crisisTools.ts L55) → PLX never enters velocity evaluation. Three seed sources all lack PLX: `docs/data/system-map.json`, `apps/mcp-server/mcp.config.json`, `seedWatchlist.ts` WATCHLIST_SEED.

Tool architecture confirmed correct for its scope: velocity-spike detector (2× 24h baseline), not price-crash detector. alert-commander calls it every cycle (stage-bootstrap.md Step 2) — tool is active, not passive.

news-scout chain_catalyst path covers non-watchlist stocks (uses stockAliases.ts + detectStocksInText) but is probabilistic (TTL ~120 min, regime confidence threshold). Signal #3383 (PLX bearish crisis, 05:20 UTC) deduped at 06:20 UTC news-scout cycle; may have expired before 07:07 UTC alert-commander cycle (RC-3 = design trade-off, not bug).

Verdict: FIX. Child task 1946a: add PLX to 3 files (system-map.json + mcp.config.json + seedWatchlist.ts), 1 new unit test, idempotent seed test. Zone: apps/mcp-server/ + docs/data/.

TASKS.md: SPIKE-1946 Todo → Done, 1946a added to Todo.
Spike doc: `docs/spikes/SPIKE_1946-crisis-detection-plx-gap.md`

## Previous session (ARCH-1945b)

Accuracy digest frontend card brief. Multi-zone: `apps/mcp-server/` + `apps/frontend/`.

Key brownfield findings:
- `getSystemAccuracyDigestStats(db, days)` already fully implemented at `signalOutcomeStore.ts:380`. Has table guard returning zero struct. Already imported in `server.ts:48` (extends existing import with one added symbol).
- Handler insertion: after `server.ts:1020` (end of GET /api/signals/stock/:code), before line 1022 (POST /api/ohlcv-backfill-done).
- SectionCard insertion: after `dashboard.analysis.tsx:1417` (end of "Kinh Dịch — Cổ phiếu mẫu"), before line 1418 (`</div>`).
- Api-gateway confirmed: `/mcp/*` catch-all routes to `mcp-server:3000` (registry.go:26). No gateway code change.
- No `fetchAccuracyDigest` exists yet — new function after line 519 of `client.ts`.
- New types `AccuracyDigestStats` + `SignalTypeAccuracyDigest` in `domain/market.ts` after line 168.
- Export `deriveAccuracyDigestState()` helper from `client.ts` for unit testability.

6 states (BA spec §5 table counts Loading/null as distinct from Empty): null, empty, all-neutral, insufficient-sample, partial, normal.

R-4: days param SQL template literal — handler clamps [1,90] BEFORE calling function. Critical sequencing.
R-5: SPIKE-1945 isolation — do NOT touch verdictResolutionJob.ts or alert_accuracy tables.

Brief: `docs/architecture-briefs/2026-05-18-accuracy-digest-frontend-card.md`
TASKS.md: ARCH-1945b added to Done, 1945b already in Todo.

## Previous session (SPIKE-1945)

SPIKE-1945 verdict-resolution no-baseline — FIXABLE BUG confirmed.

Root cause: `defaultFetchHistory()` in `verdictResolutionJob.ts` (L119–122) reads
`snaps[0].price` from `getPriceHistory()` result. Go `/price/history` endpoint returns
`{code: string, history: DailyOHLCV[]}` envelope (not `PriceSnapshot[]` array). At runtime:
`snaps[0]` = `undefined` → `TypeError: Cannot read properties of undefined` → catch block
returns `null` → "price-fetch-failed:unresolvable" guard fires on every baseline fetch.

This explains 100% of the ~520 unscored verdicts and the 19-BUG-msgs/21h storm (TNB c68 #7).
The `false_positive` label from Sprint 1926a is incorrect for these rows (direction never
evaluated). Sprint 1336 SQLite isolation has no impact on this path.

Child task 1945a scoped: fix `getPriceHistory` return type in `clients.ts` + update
`defaultFetchHistory` unwrapping + audit all callers. Goal: `scored_pct ≥ 60%` post-deploy.

Key finding: Go response has `DailyOHLCV.close` (not `.price`). Correct baseline field is
`envelope.history[0].close` (history ordered ASC by date from Go query L223).

Spike doc: `docs/spikes/SPIKE_1945-verdict-resolution-no-baseline.md`

## Previous session (ARCH-1944)

Zone-split brief for Sprint 1944 bctcQueueEnricher fix.

Brownfield scan overturned both root causes stated in the task brief:

1. VPS route `/proxy/bctc-discover/:ticker` — already landed in repo (commit `1b8f8cd5`). Not missing.
2. `bctcHttpFetcher.ts` X-API-Key injection — already landed (commits `8f9c2d55`/`0d248b00`), 6 unit tests covering AC-1..6.

New root cause found: **response shape mismatch**. VPS `runDiscoverScript()` returns `string[]` but `extractVpsPlaywrightUrls()` in `bctcDiscovery.ts` expects `{results:[{url,source,confidence}],error}`. Fix goes in `vps-proxy-server.js` (wrap output in envelope). This is Risk R-1 in the brief.

Child tasks:
- 1944a-vps (dev-vps-crawls, S): wrap shape + deploy-vinahost.sh
- 1944a-mcp (dev-mcp-server, S): verify wiring + add guarded live-probe test

cafef Strategy 2 was already fully removed in TASK_1916b. 1944b scope revised to type-cleanup only (`_fetchCafef` field removal + comment update).

Brief: `docs/architecture-briefs/2026-05-18-vps-bctc-discover-route-zone-split.md`

## Previous session (ARCH-1942c)

TASK-1942c HPG OCF all-zeros — brownfield design complete.

Scenario B root cause confirmed: `CASH_FLOW_SCRIPT` single key `'Net cash inflows/outflows from operating activities'` in `vnstockBridge.ts` (L844) uses `g()` helper which returns `float(0 or 0) = 0.0` on key-miss, not NULL. Same pattern in `FINANCE_SCRIPT` for NI key.

Scenario A root cause confirmed: `cashFlowExtractor.ts` missing `"sản xuất kinh doanh"` label variant in `P_OPERATING_CF`. The `fv()` variadic alt-patterns mechanism already supports adding it with zero risk.

Both fixes ship in same PR — independent, no conflict. Domain type change: `VnstockCashFlow.operatingCashFlow: number | null` (safe — all downstream callers use SQLite `?` placeholder or null-check the outer object).

Key precedent: `BALANCE_SHEET_SCRIPT` already has multi-key fallback pattern (L776-782: `if short_debt == 0 and long_debt == 0: long_debt = g('Convertible...')`). This is the model for the CASH_FLOW_SCRIPT fix.

Handoff: `docs/handoffs/1942c-ba-spec.md`

## Previous session (ARCH-1920/BCTC-3b)

ARCH-1920 cadence policy brief. Brownfield scan of 10 zombie tables across schema-financial-reports.ts / schema-macro.ts / schema-alerts.ts. Key design decisions:

- Cadence follows data volatility (per-domain), NOT source-tier. Source tier = metadata tag only.
- 5 new cronConfig keys: `vnstockFundamentalsRefresh` (Mon 01:00 UTC), `vnstockTradingStatsRefresh` (daily 08:30 UTC weekdays), `bondMaturityPoller` (Sun 02:30 UTC), `commodityTrackerRefresh` (daily 06:00 UTC), `brokerSanctionsSweep` (last Fri of quarter months).
- Shipping index wires into same `commodityTrackerRefreshJob.ts` (both write to `tracked_indicators`).
- HIGH pre-condition for 1920d: `broker_sanctions` table missing UNIQUE(broker_name, sanction_start) — must be schema migration in same PR as job.
- Zone assignments: vnstock → `financial-reports/`, bond/commodity → `macro/`, broker_sanctions → `news-analysis/`.
- Failure policy: all jobs fail-loud WORK channel (not BUG — data pipeline, not code panic).
- Risk R-1: vnstock rate-limit → `isRunning` guard mandatory in `vnstockFundamentalsJob.ts`.
- Risk R-2: bond_maturity — BA must confirm geo-access from France before deciding VPS vs direct.

Brief: `docs/architecture-briefs/2026-05-15-ARCH-1920-scheduler-cadence-policy.md`

## Previous session

TASK-1918b Architect design — news-scout macro snapshot package gap. Path A chosen (direct tool call), Path B (signal bus) rejected. No new code; 4-file surface: agentBootstrap.ts + SKILL_MANIFEST.md + news-scout.md + stage-bootstrap.md.

TASK-BCTC-3b Architect design — hsx.vn BCTC discovery redesigned for main server (TypeScript) after prior "Envoy route-block" conclusion overturned by main-server recon 2026-05-15.

Key findings and design decisions:
- Prior probe used wrong URL (`/n/api/v1/news/securities/VNM/1` — missing locale segment, string ticker instead of numeric ID). Correct endpoint: `GET /m/api/v1/1/mediafiles/5/{numericId}` returns HTTP 200 with BCTC PDFs directly from France. No VPS needed.
- New implementation: TypeScript fetcher `hsxBctcFetcher.ts` in `infrastructure/fetchers/`. Not Python. Not VPS. Not a scheduler job.
- Integration: new Strategy 0 in `bctcDiscovery.ts`. Current Strategy 0 (VPS Playwright) demotes to Strategy 1. Domain service contract unchanged for consumers.
- `DiscoverOptions._fetchHsx` injectable port added (different arity from `HttpFetchFn` — three params: ticker, year, timeoutMs). `HosePdfDiscoveryResult.source` union gains `"hsx"`.
- `bctcQueueEnricherJob.ts` wires the new fetcher; no logic changes.
- No DB schema changes. No new scheduler job. No VPS script changes.
- Handoff: `docs/handoffs/TASK_BCTC-3b.md` fully rewritten with Architect section. TASK-BCTC-3c updated: pure integration verification (seed queue, run enricher, confirm `staticfile.hsx.vn` URLs land + accessible). No MCP server code changes expected for 3c.

Risk to monitor: static token `HJ2HNS3SKICV4FNE` in hsx.vn JS bundle. If rotated → all hsx.vn calls return 403. Monitor `source: "hsx"` success rate in enricher logs. Token is public, not a secret — do NOT put in `.env`.

## Patterns noticed

- Reuters fallback split (`1899a-reuters-fallback-{dom,lifecycle,detect}.test.ts`) is the confirmed working precedent for the Bun test split pattern.
- Preamble line-count bloat is the recurring risk in Bun test splits: 113L preamble means any group <90L of tests will land under 200L; groups of 90-100L need trimming.
- hsx.vn Envoy route-block pattern: `x-envoy-upstream-service-time: 2ms` + empty body = edge rejection (no backend contact). Contrast with working endpoints: `x-envoy-upstream-service-time: 6ms` + `cache-control: max-age=60`. This is a reliable signal for "permanently blocked by Envoy route table" vs "backend reachable."
- When a geo-restriction hypothesis fails (VPS same 404 as France), always check if the block is at routing layer vs IP filter layer. Envoy route tables are routing-layer blocks — unbypassable from any external IP.

## Carry-over (next session)

- SPIKE_BCTC-3: FULLY CLOSED. Re-Assessment appended to `docs/spikes/SPIKE_BCTC-3-hsx-xhr-scope.md`. TASK-BCTC-3b/3c closed. TASK-BCTC-1 (ops) filed in `docs/TASKS.md`.
- TASK-BCTC-1: HIGH ops — fix `TasksMax=512` + `MemoryMax=512M` in `/etc/systemd/system/vn-bctc-fetch.service`. 30 min. AC: VNM Q1/2026 Playwright discovery succeeds without pthread_create error. Owner: ops.
- 1899a-bloomberg-test-split: handoff at `docs/handoffs/TASK_1899a-bloomberg-test-split.md`. Ready for dev-news-fetch.
- SPIKE_006 c61: BA spec needed — scoring unification (alertAccuracy.ts + alertOutcomeScorer + verdictResolutionJob). Open Q: confirm 60% threshold denominator with user.
- Headlock F2b + F1 (Docker .git/ exclusion): user-queue carry item.
