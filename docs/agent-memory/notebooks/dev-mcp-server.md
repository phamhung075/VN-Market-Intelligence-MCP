# dev-mcp-server -- Notebook

## 2026-07-08 — FACTORY-INFRA-split-telegramCommands → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

`telegramCommands.ts` (1071L) mixed router + 9 raw-SQL handlers + presentation + infra reaching UP into `application/usecases/` (imported `assembleEveningSummary`/`generatePeriodicSummary` directly to both fetch AND render `/recap*`). Split: presentation → `telegram/format.ts`; 8 SQL handlers → `telegram/commandHandlers.ts` (SQL moved into new `infrastructure/db/{watchlistReadStore,systemHealthStore,agentFeedbackStore}.ts`); `/news` → `telegram/newsHandler.ts`; `/recap*` **rendering** (pure, zero application imports — narrow hand-written `EveningRecapData`/`PeriodicRecapData` structural views instead of importing the producer's types) → `telegram/recapRenderer.ts`; `/recap*` **orchestration** (the fetch step) → new `application/usecases/orchestrateRecapCommand.ts`, invoked by the INTERFACE layer (`webhookHandler.ts`) via a new `RecapResolvers` DI param on `handleTelegramCommand`. Router 1071L → 267L; `grep application/usecases` across the whole infra chain = 0.

`handleRecap(db, assembleFn?)`'s public signature kept byte-identical (only the "no fn" default behavior changed: was a live production call, now the friendly Vietnamese error text) — every existing recap test in `214-telegram-commands.test.ts` passes an explicit fn already, so zero test changes needed there. New `FACTORY-INFRA-split-telegramCommands.test.ts` (20 assertions: 3 new stores, pure recapRenderer with hand-built non-application-typed objects, RecapResolvers DI with/without injected resolver, orchestrateRecapCommand's 3 functions against real assembleEveningSummary/generatePeriodicSummary) + 1 new case in `1406c-webhook-handler.test.ts` (full webhook→router→resolver→render path).

tsc clean, eslint clean. Targeted suite (32 files: all telegram*/evening-summary/periodic-summary/webhook) 431/431 pass — `214-telegram-commands.test.ts` alone unchanged 60/60. Server boot verified PORT=3997: health 200 toolCount=183 unchanged, `/api/bctc-inspect` + `/dashboards/news-fetch/` both 200. scheduler cron.schedule grep=3 unchanged. Full `bun test`: 14406 pass/40 skip/58 fail/6 errors/1182 files (583.84s) then the known Bun 1.3.13 crash-at-teardown — 57 fails are the documented pre-existing pollNews/RSS-timeout/VPS-push/insider/foreign-flow/1302-deprecated flaky class; the 1 telegram-adjacent fail (`235-telegram-send-merge.test.ts`, a file I never touched) passes 10/10 in isolation — full-suite cross-test mock pollution, not a regression.

Doc updates: `infrastructure.md` (new Telegram Command Router section + layering-fix note), `usecases.md` (`orchestrateRecapCommand.ts` entry).

Commit: e9b3a2b75. Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (telegramCommands.ts + webhookHandler.ts are on the live `/webhook` HTTP path).

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, server boot health 200 + dashboard routes 200 verified | HEALTHY.

## 2026-07-08 — FACTORY-SCHEDULER-job-table-registry → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

`startScheduler.ts` (1257L) held 79 `scheduleCron(CRONS.x, async()=>{ jobRunRepo.wrapRun('xJob', ...) }, opts)` call sites, 57 sharing an identical outer envelope. New `schedulerJobTable.ts`: `buildJobTable(ctx)` — declarative `{name,cron,options,runner}` array for the 57 — plus a single loop `registerJobTable(table, jobRunRepo)`. 22 bespoke entries (skip wrapRun, use `run*WithDb` startupHelpers dedup, or build extra local state first — WAL-escalation closure, scheduler-watchdog self-heal manifest) keep verbatim `scheduleCron(...)` calls in `registerBespokeJobs(ctx)`. `walEscalateFn` moved to new `walEscalation.ts`'s `createWalEscalateFn()`. `startScheduler.ts` → 305L (composition root only: DB/repo init, non-cron startup repairs/probes, 2 registration calls).

8 pre-existing tests reading `startScheduler.ts` SOURCE TEXT via regex (1137/1138/1139/1140/1298b/ARCH-CRON-watchdog) retargeted to `schedulerJobTable.ts` with a brace-depth-aware `extractJobTableEntry()` helper (nested runner-body braces break naive regex); WD-11 (ARCH-CRON-watchdog) got a 2nd scanned file + a `name:'x'`-field regex mirroring its existing `JOB_NAME_FUNDAMENTALS`-const indirection pattern. 239c needed no change (composition-root comments preserve its substring checks).

RAW-verified via a scratch bracket-aware equivalence script (comment-stripped, quote-normalized) comparing every scheduleCron call's cron-key + options + wrapRun job-name between the git-HEAD pre-refactor blob and the new split: 79/79 match exactly (0 missing/extra/drift; 1 non-literal `JOB_NAME_BREADTH_PERSISTER` identifier flagged, manually confirmed identical both sides). New `FACTORY-SCHEDULER-job-table-registry.test.ts` (15 assertions: buildJobTable shape/uniqueness/options, registerJobTable generic wrapRun routing, registerBespokeJobs 22-call coverage, combined 79-call scheduler-boot smoke, walEscalation.ts real-tmpfile integration test).

tsc clean, eslint clean (2 pre-existing unrelated Fence-B errors in `getMoneyRadarComposite.ts`, confirmed untouched). Targeted suite (35 scheduler-referencing files, 431 tests) 430/431 — 1 fail (`188-alert-digest.test.ts` concurrency-guard) is a pre-existing timing-flake, confirmed via isolated 26/26 pass. Server boot verified `APP_ENV=development PORT=3998`: health 200 toolCount=183 unchanged, `/api/bctc-inspect` + `/dashboards/news-fetch/` both 200, `[scheduler] jobs registered` final log fired (all 79 registrations completed, zero throw). Gate 2d `cron.schedule` grep=3 unchanged. Full `bun test`: 14414 pass/40 skip/59 fail/4 errors/1183 files (623s) then known Bun 1.3.13 crash-at-teardown — every fail/error grepped: pollNews/vps_push_log/telegram-simulation/1302-deprecated pre-existing flaky class, zero scheduler mentions.

Doc updates: `infrastructure.md` (new "Scheduler Job Table" section).

Commit: a25bdc617. Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (scheduler wiring — new code only takes effect after container rebuild, Docker Microservice Code-Change Close Gate).

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, server boot health 200 + dashboard routes 200 verified, startScheduler.ts 1257L→305L | HEALTHY.

## 2026-07-09 — CI-RED-06043b3c-FIX → REVIEW

Fast-tracked one-line fix (PO pre-diagnosed, precedent 728ef563c): `1837a-pipeline-state.test.ts` L96 AC-2 hardcoded `validStatuses` omitted `"done"`, which is the literal value po's Step 6 Docker Close Gate sign-off convention writes to live `.head.status` on every closeout (confirmed standard, not a typo — currently live: `"done"` from the FACTORY-PDF-delete-deprecated-inspect closeout). Added `"done"` with an inline comment matching the existing per-value documentation style.

Independently re-verified the "only one hardcoded spot" claim rather than trusting it: grepped `validStatuses` + the `"in_progress"` array-literal pattern repo-wide — every other hit is either a test *fixture* (sets a status, doesn't validate against a hardcoded enum) or the unrelated uppercase `task_board`-lane `StatusEnum`/lanes array. 1837a is the only test validating live `.head.status` against a hardcoded array.

tsc clean. Targeted: `1837a-pipeline-state.test.ts` 5/5 pass. Broader orch-state regression sweep (orchStateSchema.test.ts, 1980-f2-canon-schema, 1979-orchestration-decisions, WF2-signal-queue-cas, orchStateStore-atomic-write, 1977-orchestration-endpoint — 6 files) 200/200 pass, 0 fail.

Test-file-only change, no runtime code touched → `rebuild_required=false`, no Docker Close Gate needed. Commit: (see decision journal / git log). Board: `BACKLOG`→`review`, `next_agent=qa` — held at REVIEW rather than self-closing DONE_VERIFIED because the signal's own AC (`ci_green_on_subsequent_push`) requires a green CI run on a push *after* this commit, which cannot be confirmed synchronously; qa/po to confirm `gh run list --branch main` shows conclusion=success post-push before flipping DONE_VERIFIED.

Zone health: tsc clean, targeted+regression suite 205/205 pass, no runtime files touched | HEALTHY.
