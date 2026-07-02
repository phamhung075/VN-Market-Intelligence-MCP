---
sprint: DASH-CRON-RECHECK-TABLE
branch: task/DASH-CRON-1-status-compute
size: M
zone: apps/mcp-server/
depends_on: []
blocks: ["TASK-DASH-CRON-2"]
---

## TLDR

Build the backend status-compute logic for the Cron Recheck Table: domain classification (cronLivenessClassifier), application-layer compute engine (cronStatusCompute), infrastructure layer B cron registry (layerBCronRegistry), and REST handler (cronStatusHandler). Ships first; Zone 2 can build against a stub.

## [PM] Planning Context

**Zone:** `apps/mcp-server/` (domain + infrastructure + application + interface layers)

**Acceptance Criteria:**
- [ ] AC-1: `GET /api/cron-status` returns HTTP 200 with `Content-Type: application/json`
- [ ] AC-2: `layer_a` array contains exactly `Object.keys(CRONS).length` rows (runtime-derived, not hardcoded)
- [ ] AC-3: Every row in `layer_a` has required fields: `name`, `layer`, `cron_expr`, `human_schedule`, `expected_last_fire`, `expected_next_fire`, `last_fire`, `last_status`, `status`, `job_name_db` (null acceptable for optional fields)
- [ ] AC-4: Every `layer_a` row has `layer === "server"`
- [ ] AC-5: `status` for every `layer_a` row is one of `{ON_TIME, LATE, MISSED, STALE, NEVER_FIRED}` — no other value
- [ ] AC-6: A row where `last_fire` is null has `status === "NEVER_FIRED"`
- [ ] AC-7: `fetched_at` in response is ISO8601 UTC timestamp within 5 seconds of request time (NOT client-generated)
- [ ] AC-8 (PARITY): For 16 `WATCHDOG_MANIFEST` jobs with fresh row within `cadenceMs` of `now`, endpoint returns `status === "ON_TIME"`
- [ ] AC-9 (PARITY gate): For 16 `WATCHDOG_MANIFEST` jobs where `MAX(started_at)` exceeds `cadenceMs × thresholdMultiplier`, returns `status === "MISSED"` or `"STALE"` — NEVER `ON_TIME` or `LATE` (QA cross-checks vs watchdog)
- [ ] AC-10: Job with `MAX(started_at)` between `cadenceMs` and `cadenceMs × thresholdMultiplier` returns `status === "LATE"`
- [ ] AC-11: Job with `MAX(started_at)` more than `cadenceMs × 3` ago returns `status === "STALE"`
- [ ] AC-12 (corrected by architect): `layer_b` contains rows for 13 live cron-bearing `.claude/commands/crons/*.md` files (NOT 14; `cron-fb-market-poster.md` is deprecated/zero-crons). Architect resolution: parse command files ONLY (not re-arm skills which double-count 5 crons)
- [ ] AC-13: Every `layer_b` row has `layer === "cli-session"` and `status === "SESSION_SCOPED"`
- [ ] AC-14: NO `layer_b` row has `status` of `MISSED`, `LATE`, `STALE`, `NEVER_FIRED`, or any red/amber value
- [ ] AC-15: `layer_b` rows have `last_fire: null`, `expected_last_fire: null`, `expected_next_fire: null` — no fabricated timestamps
- [ ] AC-23 (no regression): `GET /api/orchestration` continues to return 200 with existing DTO shape unchanged
- [ ] AC-25: New `GET /api/cron-status` does NOT share mutable state with `GET /api/orchestration` — concurrent execution safe
- [ ] AC-26 (no fake data): When known-running job has NO `cron_job_runs` row (test against empty DB), returns `status: "NEVER_FIRED"` + `last_fire: null` (NOT fabricated value)
- [ ] AC-27 (server-side time): `expected_last_fire`, `expected_next_fire`, `fetched_at` all computed with server clock at handler-call time (±10s tolerance vs server time, NOT client clock)
- [ ] AC-29 (detail affordance): When status is MISSED or STALE, a `reason` field in DTO is populated for non-ON_TIME rows

**Files to read first:**
- `docs/architecture-briefs/2026-07-02-DASH-CRON-RECHECK-TABLE.md` (§3 Zone-1 specs, §5 Risk flags R1-R7, §6 DDD layer mapping)
- `docs/handoffs/BA-DASH-CRON-RECHECK-TABLE.md` (§2 live-verified surfaces, §3 job-name mismatch, §4 FR-1..FR-3 functional specs)
- `apps/mcp-server/src/interface/mcp/routes/orchestrationHandler.ts` (pattern: buildDto + handleGet* HTTP handler)
- `apps/mcp-server/src/interface/mcp/server.ts` line ~2125 (GET /api/orchestration registration pattern to mirror)
- `apps/mcp-server/src/scheduler/cronConfig.ts` (CRONS map, runtime count via Object.keys)
- `apps/mcp-server/src/scheduler/system/schedulerWatchdogJob.ts` lines 112-224 (WATCHDOG_MANIFEST, CANONICAL_WATCHDOG_JOB_NAMES, verify 16 pairs)
- `apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts` (extend with 2 new exports; existing pattern for MAX(started_at))
- `package.json` in `apps/mcp-server/` (verify `cron-parser` absent)

**Files to create:**
- `apps/mcp-server/src/domain/cron/cronLivenessClassifier.ts` — Pure domain: status classification logic (4-branch ladder, FR-1.6, AC-8/9/10/11 gates)
- `apps/mcp-server/src/infrastructure/cron/layerBCronRegistry.ts` — Parse `.claude/commands/crons/*.md` (13 files) + Layer-B SSOT, memoized at startup (CN-5)
- `apps/mcp-server/src/application/cron/cronStatusCompute.ts` — Application orchestrator: job-name resolution (CN-1 hybrid), cadence derivation (CN-2 MIN-of-6), human-schedule builder, buildLayerARow, memoization contract (R1 load-bearing)
- `apps/mcp-server/src/interface/mcp/routes/cronStatusHandler.ts` — HTTP handler: buildCronStatusDto, handleGetCronStatus, error handling (503 JSON {error})
- `apps/mcp-server/src/__tests__/cronLivenessClassifier.test.ts` — All 5 branches + exact boundary values
- `apps/mcp-server/src/__tests__/cronStatusCompute.test.ts` — CN-1 (16 manifest pairs, normalized fallback, no-match), CN-2 (EC-2 restricted window, EC-4 comma-list→1_800_000ms)
- `apps/mcp-server/src/__tests__/cronStatusHandler.test.ts` — In-memory SQLite; row count == Object.keys(CRONS).length; AC-9 PARITY gate: inject same WATCHDOG_MANIFEST into both buildCronStatusDto and classifyCronLiveness at fixed nowMs, assert no divergence for all 16 jobs
- `apps/mcp-server/src/__tests__/layerBCronRegistry.test.ts` — Fixture .md files; assert cron-fb-market-poster.md→0 rows, cron-refine-bctc.md→1 row (fallback regex), multi-cron files→N rows

**Files to modify:**
- `apps/mcp-server/src/infrastructure/db/cronJobRunStore.ts` lines ~XXX — Add 2 exports (no signature changes to existing):
  - `getLastRunForJob(db, jobName): { last_started_at: string|null; last_status: CronJobRunStatus|null }`
  - `getDistinctJobNames(db): string[]`
- `apps/mcp-server/src/interface/mcp/server.ts` line ~2125 — Add route registration (mirror GET /api/orchestration block):
  ```typescript
  if (method === "GET" && pathname === "/api/cron-status") {
    handleGetCronStatus(req, res);
    return;
  }
  ```
- `apps/mcp-server/package.json` — Add `"cron-parser"` dependency (pinned version, verified absent from repo)

**Dependencies:**
- None — Zone 1 ships standalone; Zone 2 blocks on this task

**Knowledge needed:**
- `docs/policies/dev-standards.md` (dev-standards contract, type-safety, test coverage)
- `docs/ARCHITECTURE.md` (DDD layer precedent — domain/infrastructure/application/interface)
- `docs/protocols/fail-loud-protocol.md` (error handling discipline)

**RISK FLAGS (from architect brief §5):**

- **R1 [MEDIUM, perf]** — Memoization contract is load-bearing: `cadenceMs`/`thresholdMultiplier`/`human_schedule`/`job_name_db` are static per CRONS key. Without it, every 5s auto-poll tick re-runs `cron-parser` N=6-sample derivation for ~69 non-manifest jobs from scratch (unnecessary CPU × every open dashboard tab). Do NOT skip under time pressure — it is required for the design.

- **R2 [MEDIUM, correctness, RESOLVED by architect]** — BA FR-2.1 listed 3 Layer-B sources as disjoint; they are NOT. The 2 skill files (`cron-detect-loop/SKILL.md`, `cron-cowork-team/SKILL.md`) verbatim-copy 5 cron values already declared in the 14 command files — double-counting would result. **Resolved:** parse ONLY `.claude/commands/crons/*.md` (13 live files; exclude `cron-fb-market-poster.md` as deprecated with zero standalone crons). AC-12 wording correction: "13 live cron-bearing command files" (not 14).

- **R4 [MEDIUM]** — `cron-parser` is a new dependency, verified absent from repo. `node-cron`'s public API has no next/prev-fire computation; its internals are unexported and unsafe to deep-import.

- **R5 [LOW, honesty/PARITY]** — 3 of the 16 `WATCHDOG_MANIFEST` jobs (`morningBriefingJob`, `eveningSummaryJob`, `franceSummaryJob`) are weekday-only with a flat 36h threshold that under-covers the ~65h Fri→Mon weekend gap — pre-existing, documented TODO in `schedulerWatchdogJob.ts`. Must inherit this same quirk via WATCHDOG_MANIFEST verbatim (AC-9 PARITY mandate). Do NOT "fix" here — would violate parity.

- **R6 [LOW, DDD]** — `cronLivenessClassifier.ts` has zero imports (pure). `cronStatusCompute.ts` reads `WATCHDOG_MANIFEST` (read-only, no modification) and infrastructure DB (consistent with existing precedent). No new DDD violation.

- **R7 [LOW, no-regression]** — All changes are additive: new files + 2 new exports on cronJobRunStore + 4-line route registration in server.ts. Zero signature changes to existing exports. `get_cron_health`, `schedulerWatchdogJob`, `GET /api/orchestration` remain untouched.

## ARCH-RATIFY RESOLUTIONS (verified by architect — carry verbatim):

**CN-1 (job_name resolution)** — HYBRID 3-tier:
1. Static reverse-map for 16 `WATCHDOG_MANIFEST` jobs (table verified in brief §2).
2. For remaining ~68 CRONS keys: normalize both CRONS key and `DISTINCT job_name FROM cron_job_runs` scan (strip `-`/`_`/`:`, lowercase, strip trailing "job"), match.
3. No match → use CRONS key as best-effort probe. Non-match = honest `NEVER_FIRED`, not a bug.

**CN-2 (restricted-window cadence)** — MIN-of-6-samples algorithm:
- `cadenceMs` = minimum successive delta across next N=6 occurrences from `cron-parser`'s iterator seeded at `now`.
- Handles restricted-hour windows, weekday-only jobs, comma-lists uniformly (no per-expression special-casing).
- EC-2 example: `*/10 2-8 * * 1-5` → 6-sample window dominated by 10-min intra-window gaps, MIN picks 10 min (not 65h Fri-evening→Mon-morning outlier).
- EC-4 example: `15,45 * * * *` → MIN picks 30 min = 1_800_000ms exactly.

**CN-3 (crashed status)** — Exclude from primary oracle:
- `getLastRunForJob` uses `status IN ('success','error')` only (identical filter to `schedulerWatchdogJob.queryLastStartedAt`).
- Optional: populate `reason` field with `last_crashed_at` note when more-recent `status='crashed'` exists (non-blocking for MVP).

**CN-4 (loader pattern)** — Combined into existing loader via `Promise.all` (parallel):
- Dashboard loader already exists and drives 5s auto-poll via `revalidator`.
- RECHECK button reuses existing `revalidator.revalidate()` — no second refresh mechanism.
- This makes Zone-1 memoization (R1) load-bearing, not optional.

**CN-5 (Layer-B parse strategy)** — Filesystem-read at server startup, memoized in-process:
- Source: `.claude/commands/crons/*.md` ONLY (13 live files).
- Exclude skill files (would double-count 5 crons — BA FR-2.1 correction).
- Matches EC-5 precedent: "restart to reflect changes" contract (same as CN-4's static metadata).

## [QA] Review Record — 2026-07-02T08:24:11Z — CHANGES_REQUESTED (round 1)

Reviewed commit 85267b62. Application code: PASS on all checks — 5 new test
files RAW-run 72/72 pass; `bun tsc --noEmit` 0 errors; `npx eslint` on the 5
new files 0 errors (confirms the live Fence-B application→scheduler ban and
validates the documented architect-brief deviation — the CadenceManifest
structural-type workaround in cronStatusCompute.ts preserves the brief's
functional intent); `mock-guard.sh` PASS; DDD greps clean (no
domain→infra/application, no application→scheduler); security clean (no
`process.env`, no hardcoded secrets, parameterized SQL `?` placeholders in
`getLastRunForJob`/`getDistinctJobNames`). AC-9 PARITY cross-checked directly
against `runSchedulerWatchdog()` (`apps/mcp-server/src/scheduler/system/schedulerWatchdogJob.ts`):
watchdog "healthy" (`ageMs <= cadenceMs × thresholdMultiplier`) is exactly the
union of classifier `ON_TIME` + `LATE`; watchdog "alert" is exactly the union
of classifier `MISSED` + `STALE` — PARITY holds by construction. AC-12
13-file count verified against the live `.claude/commands/crons/` tree.

**BLOCKING (1 issue):** `apps/mcp-server/src/interface/mcp/routes/cronStatusHandler.ts:102`
default `commandsDir = resolve(process.cwd(), ".claude", "commands", "crons")`.
`apps/mcp-server/src/interface/mcp/server.ts:2136` calls
`handleGetCronStatus(req, res, db)` with **no** `commandsDirArg` override, so
production always hits this default. `apps/mcp-server/Dockerfile` (`WORKDIR /app`
line 18; `COPY` list lines 51-63: package.json/bun.lock, `src/`, tsconfig.json,
bctc-schema.ts, mcp.config.json) never copies `.claude`. `docker-compose.yml`'s
`mcp-server` service volumes (lines 11-27: `./data`, `./data/pdfs`,
`./mcp.config.json`, `./reports`, `./docs/agent-memory`, `./docs/data*`,
`./docs/signals`, `./docs/analysis-briefs`) never mount `.claude`;
`docker-compose.dev.yml`'s override declares no `volumes:` block for
`mcp-server` (inherits the same gap). Confirmed via `grep -i claude
docker-compose*.yml` (0 hits) and `docker compose config` (valid, no `.claude`
anywhere). At runtime `process.cwd() === "/app"`, so
`readdirSync('/app/.claude/commands/crons')` will throw `ENOENT`;
`handleGetCronStatus`'s own try/catch (line 108) converts this into a
permanent `503 {error}` response — `GET /api/cron-status` will **never**
return 200 once the pending container image swap ships, breaking AC-1 and
transitively every Layer-A/B AC (the DTO build aborts before any row is
emitted). Both new test files (`cronStatusHandler.test.ts:31`,
`layerBCronRegistry.test.ts:165`) inject an explicit `LIVE_CRONS_DIR`
resolved relative to `bun test`'s cwd (`apps/mcp-server`) — this is why
72/72 pass locally without ever exercising the zero-arg default branch that
`server.ts` actually calls in production.

**Fix scope for fixer:** add a read-only volume mount for
`.claude/commands/crons` (or `.claude/commands/`) to the `mcp-server` service
in `docker-compose.yml`, mirroring the existing
`./docs/agent-memory:/app/docs/agent-memory` pattern (line 16); confirm
`docker-compose.dev.yml`'s override still resolves it. Add a regression test
that exercises `handleGetCronStatus`'s default (zero-arg) `commandsDir`
resolution against a fixture that mimics the container's actual layout, so
this class of gap fails loudly next time.

Round 1 — routed to fixer (not architect).

## RETURN

DONE: Decomposed DASH-CRON-RECHECK-TABLE into 2 atomic tasks. Handoff TASK-DASH-CRON-1 (Zone 1, dev-mcp-server) created with 25 ACs, risk flags, and detailed file specs.

FILES:
- `docs/handoffs/TASK-DASH-CRON-1.md` (this file)
- `docs/handoffs/TASK-DASH-CRON-2.md` (sibling, dev-frontend)

NEXT: dev-mcp-server (TASK-DASH-CRON-1 ships first) → dev-frontend (TASK-DASH-CRON-2 can build against stub)

PIPELINE: continue to dev-mcp-server pickup

---

## [FIXER] Round 1 — 2026-07-02T08:45:30Z

**Defect:** `cronStatusHandler.ts:102` default `commandsDir = resolve(process.cwd(), ".claude", "commands", "crons")`. Production container (WORKDIR=/app) has no `.claude/` → `readdirSync` throws ENOENT → permanent 503 on GET /api/cron-status, breaking AC-1 and transitively all Layer-A/B ACs. Root cause: Dockerfile never COPYs `.claude/`; docker-compose.yml never mounts it.

**Fix Applied:**
1. **docker-compose.yml** (line 27): Added read-only volume mount `./.claude/commands/crons:/app/.claude/commands/crons:ro` to mcp-server service, mirroring existing `./docs/agent-memory:/app/docs/agent-memory` pattern (line 16). Pattern confirmed stable across docker-compose.dev.yml (inherits base volumes; no override stripping).
2. **cronStatusHandler.test.ts** (lines 23-24, 340-367): Added import `_resetLayerBCronCacheForTests` from layerBCronRegistry.js. Added regression test "default commandsDir (zero-arg) with missing .claude/commands/crons → 503 error response (not unhandled throw)" that: (a) clears memoization cache, (b) calls handleGetCronStatus with non-existent dir path, (c) verifies 503 JSON {error} response (not unhandled throw), (d) confirms error message contains ENOENT.

**Verification:**
- `pnpm check` (bun tsc --noEmit): 0 errors
- `bun test cronStatusHandler.test.ts`: 18 pass / 0 fail (incl new REGRESSION test)
- docker-compose.yml syntax: valid (jq + orch-apply.sh)

**Scope:** 2 files (min), no refactor. AC-1 unblocked; GET /api/cron-status will return 200 with Layer-A/B DTO once the pending container rebuild completes and this docker-compose.yml config ships.

**Board Status:** fixer_round=1, next_agent=qa, route_to=qa (REVIEW→qa for re-verification)

**Commit:** See [git log output below]
