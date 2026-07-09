# dev-mcp-server -- Notebook

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

## 2026-07-09 — FACTORY-DOMAIN-split-cascade-engine → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

cascadeEngine.ts (3739L) held 9 exported rule-data constants (SECTOR_RULES ~2016L, LEGAL_RISK/POLICY/INSIDER_DUMP/MSCI x3/AGRICULTURE/IMF rules) + macro-adjustment/combo-detection orchestration ahead of buildCausalChain. Steps 1-3 only (Step 4 explicitly skipped per dispatch — `SECTOR_RULES.map(r=>r.key)` is invalid, SectorRule has no `.key`): moved the 9 constants + interfaces into `domain/services/cascade/rules/*.ts` (one file per table; shared `CascadeKeywordRule` got its own type file, not duplicated 6x); barreled via `cascade/rules/index.ts`; split orchestration into `cascade/macroAdjustments.ts` (428L) and `cascade/comboDetectors.ts` (241L). buildCausalChain + all exported types stay in cascadeEngine.ts (3739L → 779L). Only the 4 previously-exported symbols (applyMacroAdjustments/applyDynamicMacroAdjustments/detectPolicyInterventionCombo/isPrecededByPlacePrefix) re-exported from cascadeEngine.ts — module surface parity exact.

RAW-verified: `bun tsc --noEmit` exit 0. Before/after behavior probe (temp script, deleted after use) ran buildCausalChain against 10 representative scenarios covering every moved code path — output MD5-identical between pre-split (swapped-in backup) and post-split tree, non-deterministic id/createdAt stripped. 062-cascade-engine.test.ts 23/23 pass; all 17 cascade-related test files zero failures. Full `bun test`: 14400 pass/40 skip/73 fail/13 errors/1183 files (617s) then known Bun 1.3.13 crash-at-teardown — grepped every fail: zero cascade/macro/sector/msci/agriculture/imf/policy/insider-dump/place-prefix/market-wide mentions; all 73 are the pre-existing pollNews/VPS-push/Chromium-missing/DB-drift flaky class (confirmed via isolated re-run of 102-job-news-poll.test.ts, which doesn't even import cascadeEngine). Server boot verified via local process: tool registration reached toolCount=183 (baseline match) before expected EADDRINUSE against the live Docker container.

Doc updates: NONE (architecture docs reference cascadeEngine by public API only, unchanged). Simplicity gate: PASS (Q1-Q4 all NO).

Commit: 00a23ec28. Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (domain hot path — new code only takes effect after container rebuild, Docker Microservice Code-Change Close Gate).

Zone health: tsc clean, tools=183 unchanged, full cascade test suite 100% pass, before/after behavior probe byte-identical, cascadeEngine.ts 3739L→779L | HEALTHY.
