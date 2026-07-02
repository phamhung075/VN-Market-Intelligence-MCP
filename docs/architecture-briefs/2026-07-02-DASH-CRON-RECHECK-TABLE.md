# Architecture Brief — DASH-CRON-RECHECK-TABLE

**Sprint:** DASH-CRON-RECHECK-TABLE (SPRINT-M, user-prioritized)
**Author:** architect
**Date:** 2026-07-02
**Input:** `docs/handoffs/BA-DASH-CRON-RECHECK-TABLE.md` (29 ACs)
**BUILD-STANDARD:** lean (both zones — `apps/mcp-server/` and `apps/frontend/` already exist; new feature, not new service)

---

## 1. Zone SPLIT (mandatory — PM propagates verbatim)

| Zone | Path | Scope |
|---|---|---|
| **Zone 1** | `apps/mcp-server/` | Status-compute (domain+application) + `GET /api/cron-status` (interface) |
| **Zone 2** | `apps/frontend/` | `api.cron-status.tsx` proxy + `CronRecheckTable` UI + coverage-map row |

Zone 1 must ship before Zone 2 is testable end-to-end (Zone 2 can build against a stub response). No file overlap between zones.

---

## 2. ARCH-RATIFY resolutions (BA §8, 5 items)

**CN-1 (job_name resolution) — HYBRID, 3-tier:**
1. Static reverse-map for the 16 `WATCHDOG_MANIFEST` jobs (table below — verified 1:1 against live `cronConfig.ts` + `schedulerWatchdogJob.ts`).
2. For the other ~68 CRONS keys: normalize both the CRONS key and each row from a runtime `SELECT DISTINCT job_name FROM cron_job_runs` scan (strip `-`/`_`/`:`, lowercase, strip trailing `"job"` suffix) and match.
3. No match → use the CRONS key itself as a best-effort probe (BA's ranked rule #2). A permanent non-match renders `NEVER_FIRED` — honest, not a bug.

**Verified 16-pair table (CRONS key → WATCHDOG_MANIFEST / DB `job_name`):**
```
ohlcvDailyAggregator        -> ohlcv-daily-aggregator
vnstockFundamentalsRefresh  -> vnstockFundamentalsRefresh   (identical)
reputationCompute           -> reputationComputeJob
evidenceAccumulator         -> evidenceAccumulatorJob
morningBriefing             -> morningBriefingJob
eveningSummary              -> eveningSummaryJob
franceSummary                -> franceSummaryJob
foreignFlowAlert            -> foreignFlowAlertJob
insiderCheck                 -> insiderCheckJob
calibrationReport            -> calibrationReportJob
baseRateComputation          -> baseRateComputationJob
predictionResolution         -> predictionResolutionJob
macroIndicatorRefresh        -> macroIndicatorRefreshJob
taOhlcvBackfill               -> ta-ohlcv-backfill
accuracyDigest                -> accuracyDigestJob
summaryDaily                  -> summaryJob:daily
```
Only 1 of 16 pairs is a literal string match — a pure normalize-and-strip-`Job` heuristic alone would *also* silently fail on `summaryJob:daily` → `summaryDaily` (the `Job` token sits mid-string, not as a suffix), which is why tier-1 needs the explicit static table rather than relying on tier-2's normalizer for all 16.

**CN-2 (restricted-window cadence) — MIN-of-N-samples algorithm:**
`cadenceMs` = the minimum successive delta across the next **N=6** occurrences from `cron-parser`'s iterator (seeded at `now`). One generic algorithm — no per-expression special-casing — correctly handles:
- Restricted-hour windows (EC-2, `*/10 2-8 * * 1-5`): the 6-sample window is dominated by the small intra-window 10-min gaps, so MIN picks 10 min, not the ~65h Fri-evening→Mon-morning outlier.
- Weekday-only jobs (`0 8 * * 1-5`): MIN picks 1 day, correctly excluding the 3-day Fri→Mon gap.
- Comma-lists (EC-4, `15,45 * * * *`): MIN picks 30 min = `1_800_000`ms, matching BA's expected value exactly.
`thresholdMultiplier = 1.5` default for all non-manifest jobs (BA FR-1.5).

**CN-3 (crashed status) — do NOT include in primary oracle.** `getLastRunForJob` keeps `status IN ('success','error')` — identical filter to `schedulerWatchdogJob.queryLastStartedAt` (no divergence, NFR-6). Optional/non-blocking: populate `reason` with a `last_crashed_at` note when a more-recent `status='crashed'` row exists — dev's call, not required for MVP.

**CN-4 (loader pattern) — combined into the existing loader, `Promise.all`'d (parallel, not sequential)** alongside the current `/api/orchestration` fetch. RECHECK button reuses the **already-wired** `revalidator` (dashboard.orchestration.tsx:888, drives the existing 5s auto-poll) — no second refresh mechanism. This choice makes the Zone-1 memoization requirement (Risk R1) load-bearing, not optional (see §5).

**CN-5 (Layer-B parse strategy) — filesystem-read at server startup, memoized in-process.** Source is `.claude/commands/crons/*.md` **only** (13 live files — see Risk R2 for why the 2 skill files are excluded). Matches EC-5's already-accepted "restart to reflect changes" contract — same treatment as CN-4's static metadata.

---

## 3. Zone 1 — dev-mcp-server: files to create/modify

| Path | Action | DDD layer |
|---|---|---|
| `apps/mcp-server/src/domain/cron/cronLivenessClassifier.ts` | NEW | Domain (pure, zero imports) |
| `apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts` | EXTEND (add 2 exports) | Infrastructure |
| `apps/mcp-server/src/infrastructure/cron/layerBCronRegistry.ts` | NEW | Infrastructure |
| `apps/mcp-server/src/application/cron/cronStatusCompute.ts` | NEW | Application |
| `apps/mcp-server/src/interface/mcp/routes/cronStatusHandler.ts` | NEW (mirrors `orchestrationHandler.ts`) | Interface |
| `apps/mcp-server/src/interface/mcp/server.ts` | EDIT (+4 lines, mirrors line ~2125 `GET /api/orchestration` block) | Interface |
| `apps/mcp-server/package.json` | EDIT — add `"cron-parser"` dependency | build |

**`cronLivenessClassifier.ts`** — `classifyCronLiveness(nowMs, lastFireMs: number\|null, cadenceMs, thresholdMultiplier): CronLivenessStatus` implementing FR-1.6's 4-branch ladder verbatim. Pure, unit-testable in isolation (covers AC-8–AC-11 boundary conditions).

**`cronJobRunStore.ts` additions (additive only — no signature changes to existing exports, zero regression risk to `get_cron_health`/`schedulerWatchdogJob`):**
- `getLastRunForJob(db, jobName): { last_started_at: string\|null; last_status: CronJobRunStatus\|null }` — single-job MAX(started_at)+status, same `status IN ('success','error')` filter as `queryLastStartedAt`.
- `getDistinctJobNames(db): string[]` — `SELECT DISTINCT job_name FROM cron_job_runs` for CN-1 tier-2 fallback.

**`layerBCronRegistry.ts`** — `parseLayerBCrons(commandsDir): CronStatusRowB[]`:
- Primary regex: `` - **cron**: `(.+?)` `` (12 of 14 files — some multi-cron: `cron-market-watcher.md`×3, `cron-news-scout.md`×2, `cron-system-auditor.md`×3).
- Fallback regex (only if primary yields 0 matches for a file): `Schedule:\s*'([^']+)'` — covers `cron-refine-bctc.md`'s different comment-style header.
- `DEPRECATED_LAYER_B_FILES = ['cron-fb-market-poster.md']` — explicit skip-list (see Risk R2) + defensive `/DEPRECATED/i`-in-first-500-chars WARN (console.warn, not throw) for any non-skip-listed file that also looks deprecated — drift detector.
- Row `name` = file basename, `#n` suffix appended when a file yields >1 row.
- Called once at server startup; module-level memoized singleton (CN-5).

**`cronStatusCompute.ts`**:
- `resolveJobNameDb(cronsKey, distinctDbJobNames): string` — CN-1 3-tier hybrid.
- `deriveCadenceMs(cronExpr, nowMs): { cadenceMs; thresholdMultiplier }` — CN-2 MIN-of-6-samples via `cron-parser`.
- `buildHumanSchedule(cronExpr): string` — hand-rolled formatter for the ~10 common shapes already present in `CRONS` (daily HH:MM / weekdays HH:MM / every-N-min / every-N-hour / weekly-DOW / monthly-DOM). Unrecognized shape → honest passthrough of the raw expression string (never fabricate a misleading description — NFR-1). Deliberately avoids adding a 2nd new dependency (`cronstrue`) — `cron-parser` alone covers both fire-time math and, indirectly, cadence.
- `buildLayerARow(...)` — orchestrates resolve→query→classify→assemble, populates `reason` for non-`ON_TIME` rows (AC-29).
- **Memoization contract (load-bearing, see §5 R1):** `cadenceMs`/`thresholdMultiplier`/`human_schedule`/`job_name_db` are static per CRONS key — compute lazily once per process into a module-level `Map`, reuse for process lifetime. Only `expected_last_fire`/`expected_next_fire`/`last_fire`/`last_status`/`status` are recomputed per request.

**`cronStatusHandler.ts`** (mirrors `orchestrationHandler.ts` 1:1):
- `buildCronStatusDto(db, nowMs, cronsMap, watchdogManifest, layerBRows): CronStatusDto` — pure, `fetched_at: new Date(nowMs).toISOString()`.
- `handleGetCronStatus(req, res)` — try/catch, 503 JSON `{error}` on unhandled exception (FR-3.4), never crashes the HTTP server.

**`server.ts`** — add import + route block, identical shape to the existing `GET /api/orchestration` registration at line ~2125.

**New dependency — `cron-parser`:** verified absent from the repo entirely (not in `apps/mcp-server/package.json`, not a transitive dep of `node-cron` which only depends on `uuid`). `node-cron`'s public API exposes no next/prev-fire computation; its internal `convert-expression`/`time-matcher`/`pattern-validation` submodules are unexported implementation details — deep-importing them is fragile (silent breakage on any minor bump) and DDD-unclean. Add `cron-parser` as a pinned dependency; `bun install` in `apps/mcp-server/` is a normal build step and does **not** touch the live/running container (respects the sprint's no-swap constraint).

**Test files:**
- `cronLivenessClassifier.test.ts` — all 5 branches + exact boundary values.
- `cronStatusCompute.test.ts` — CN-1 (16 manifest pairs + normalized fallback + no-match), CN-2 (EC-2 restricted window, EC-4 comma-list → assert `1_800_000`ms exactly).
- `cronStatusHandler.test.ts` — in-memory SQLite; row count == `Object.keys(CRONS).length` (AC-2); **AC-9 PARITY gate**: inject the *same* `WATCHDOG_MANIFEST` object both into `buildCronStatusDto` and a `classifyCronLiveness`-equivalent check at fixed `nowMs`, assert no divergence for all 16 jobs.
- `layerBCronRegistry.test.ts` — fixture `.md` files; assert `cron-fb-market-poster.md` → 0 rows, `cron-refine-bctc.md` → 1 row (fallback regex), multi-cron files → N rows.

---

## 4. Zone 2 — dev-frontend: files to create/modify

| Path | Action |
|---|---|
| `apps/frontend/app/routes/api.cron-status.tsx` | NEW (mirrors `api.orchestration.tsx` — literally FR-4.1's code sample) |
| `apps/frontend/app/routes/dashboard.orchestration.tsx` | EDIT — loader + `CronRecheckTable` component |
| `docs/data/frontend-data-coverage-map.json` | EDIT — append 1 row to `.rows` |

**`dashboard.orchestration.tsx`:**
- Loader (existing function at line 175): add a second `safeFetch<CronStatusDto>` call, `Promise.all`'d with the existing orchestration fetch (parallel — do not add latency). Add `parseCronStatusDto` validator mirroring `parseOrchStateDto` (line 162) — MUST reject/normalize any `status` value outside the 6-enum set (defense against a malformed upstream response rendering an unstyled badge). Extend `LoaderData` (line 155) with `cronStatus`/`cronStatusError`.
- `CronRecheckTable` component: 2 visually distinct sub-sections — "Cron máy chủ" (Layer-A) / "Cron phiên làm việc" (Layer-B) — placed below the existing Signal Queue/Narrative section (no stronger placement constraint from BA).
- RECHECK button: `onClick={() => revalidator.revalidate()}` — reuses the `revalidator` already in scope at line 888 (already drives the page's 5s auto-poll). Do not build a second fetch/refresh path.
- Freshness badge: reuse the existing `<FreshnessBadge>` import, second instance scoped to the cron table, `dataAsof={cronStatus?.fetched_at ?? null}`.
- Status badge colors: 6-entry lookup, same `switch`-based pattern already used for signal `severityClasses` (line 222) — reuse the styling convention, not a new paradigm.
- Never-fired: `last_fire == null ? "Chưa từng chạy" : <VN-locale format>` (AC-20).

**`frontend-data-coverage-map.json` — correction to BA's FR-6 example:** the file's own `.fields` schema string is `page|route|elem|endpoint|store|writer|cadence(UTC)|sla|asof|status|fix` — BA's example JSON omits `route` entirely. The new row must include `route: "/dashboard/orchestration"` to match the documented schema. `l3b_status`/`l3b_note` (present on the existing `orchestration` row) are optional extras, not schema-required.

---

## 5. Risk flags

**R1 [MEDIUM, perf]** — CN-4 reuses the page's existing 5s auto-poll for the cron table. Without the Zone-1 memoization contract (§3, `cronStatusCompute.ts`), every 5s tick would re-run `cron-parser` N=6-sample derivation for ~69 non-manifest jobs from scratch — unnecessary CPU load × every open dashboard tab. Memoization is **load-bearing for this design**, not an optional optimization — flag to dev so it isn't skipped under time pressure.

**R2 [MEDIUM, correctness]** — BA's FR-2.1 names 3 Layer-B sources as if disjoint: 14 command files + cron-detect-loop's "4 crons" + cron-cowork-team's "1 cron". Live read shows these are **not disjoint**: `cron-detect-loop/SKILL.md` explicitly documents its SSOT as `.claude/commands/crons/cron-dev-team.md` + `cron-system-auditor.md` ("re-sync if cadence changes there... values below are verbatim copies" — SKILL.md:14,54) and `cron-cowork-team/SKILL.md` re-arms the identical `*/15 * * * *` value already declared in `.claude/commands/crons/cron-cowork-team.md`. Parsing both the skill files *and* the command files would double-count 5 crons (dev-team ×1, system-auditor ×3, cowork-team ×1). **Resolved:** parse only the 14 (13 live) command files; treat the 2 skill files as re-arm automation referencing the same SSOT, not independent sources. Also: `cron-fb-market-poster.md` is DEPRECATED as of 2026-06-28 (FB-COWORK-FOLD) — its content is a redirect doc pointing at `docs/data/cowork-schedule.json` slots serviced by the cowork-team `*/15` master dispatcher (already counted as 1 row); it carries **zero** standalone `CronCreate` registrations. **PM/QA correction needed:** AC-12's "14 files minimum" should read "13 live cron-bearing command files" (12 in the primary bullet format + 1 in the fallback comment format), sourced exclusively from `.claude/commands/crons/*.md`.

**R3 [LOW, format-heterogeneity]** — Verified all 14 command files: 12 use `` - **cron**: `<expr>` `` (several multi-cron), 1 (`cron-refine-bctc.md`) uses a `# Schedule: '<expr>'` comment header, 1 (`cron-fb-market-poster.md`) is the deprecated pointer above. A single-pattern regex would either miss `cron-refine-bctc.md` or accidentally match `cron-fb-market-poster.md`'s markdown table of cowork slots (`| \`15 9 * * 1-5\` |`). §3's 2-pattern-plus-skip-list design handles both.

**R4 [MEDIUM, new dependency]** — see §3, `cron-parser` addition. Not currently anywhere in the repo or transitively via `node-cron`.

**R5 [LOW, honesty/PARITY, inherited not introduced]** — 3 of the 16 `WATCHDOG_MANIFEST` jobs (`morningBriefingJob`, `eveningSummaryJob`, `franceSummaryJob`) are weekday-only jobs monitored with a flat 36h threshold that under-covers the ~65h Fri→Mon weekend gap — a pre-existing, already-documented `TODO(architect)` in `schedulerWatchdogJob.ts` (not something this design introduces). Because AC-9 mandates literal PARITY with the watchdog's verdict, the new table **must inherit this same quirk** for these 3 jobs by reading `WATCHDOG_MANIFEST` verbatim rather than re-deriving cadence for manifest jobs. Do not "fix" this here — that would itself violate AC-9/NFR-6 (any divergence from watchdog = blocking QA failure per BA spec). Flagging so it isn't mistaken for a new bug.

**R6 [LOW, DDD]** — `cronLivenessClassifier.ts` (domain/) has zero imports — pure. `cronStatusCompute.ts` (application/) is the first boundary touching infrastructure (DB reads) and reads `schedulerWatchdogJob.ts`'s existing public `WATCHDOG_MANIFEST` export (read-only, no modification to that file) — consistent with the existing precedent of `cronHealthTools.ts` (interface) importing from `infrastructure/db/`. No new DDD violation.

**R7 [LOW, no-regression]** — All Zone-1 changes are additive (new files + 2 new exports on `cronJobRunStore.ts` + a 4-line route registration in `server.ts`). Zero existing exports change signature. `get_cron_health`, `schedulerWatchdogJob`, and `GET /api/orchestration` are untouched (AC-23–AC-25).

---

## 6. DDD layer mapping (final, supersedes BA §6 with concrete paths)

| Requirement | Layer | File |
|---|---|---|
| `classifyCronLiveness` | Domain | `apps/mcp-server/src/domain/cron/cronLivenessClassifier.ts` |
| `getLastRunForJob` / `getDistinctJobNames` | Infrastructure | `apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts` |
| `parseLayerBCrons` | Infrastructure | `apps/mcp-server/src/infrastructure/cron/layerBCronRegistry.ts` |
| CRONS / WATCHDOG_MANIFEST reads | Infrastructure (config, existing) | `cronConfig.ts` / `schedulerWatchdogJob.ts` (unchanged) |
| `resolveJobNameDb`, `deriveCadenceMs`, `buildHumanSchedule`, `buildLayerARow` | Application | `apps/mcp-server/src/application/cron/cronStatusCompute.ts` |
| `buildCronStatusDto` / `handleGetCronStatus` | Interface | `apps/mcp-server/src/interface/mcp/routes/cronStatusHandler.ts` |
| Route registration | Interface | `apps/mcp-server/src/interface/mcp/server.ts` |
| `api.cron-status.tsx` proxy | Interface (frontend) | `apps/frontend/app/routes/api.cron-status.tsx` |
| `CronRecheckTable` UI | Interface (frontend) | `apps/frontend/app/routes/dashboard.orchestration.tsx` |

---

## 7. Scan clean

**Scan clean:** true ✓ — all verified paths above read live from the working tree on 2026-07-02; no fabricated line numbers or assumed schemas.
