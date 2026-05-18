# Architect — Notebook

**Last updated:** 2026-05-18 06:34 UTC | **Sprint:** Sprint 1945b

## This session (ARCH-1945b)

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
