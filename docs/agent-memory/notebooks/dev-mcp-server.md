# dev-mcp-server -- Notebook

## 2026-07-09 — FACTORY-SCHEDULER-split-dataAuditJob → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

dataAuditJob.ts (1300L) held runDailyChecks (D-1..D-11) + runWeeklyChecks (W-1..W-7) as two giant inline functions, 30+ inline findings.push sites. Split into `scheduler/news-analysis/audit-checks/` — 19 files, one per check group, each ≤120L, pure `(db)=>AuditFinding[]` (checkLancedbDrift/W-7 is the one async exception, injected GetCountFn). AuditFinding/TelegramFn/GetCountFn + checkToCategory/severityToPriority/getPreviousRowCounts/insertFeedbackIfNew/buildFindingTitle/buildTelegramMessage/INDICATOR_RANGES/SNAPSHOT_TABLES moved to new `dataAuditShared.ts`. `dataAuditJob.ts` is now a 353L thin orchestrator: runDailyChecks/runWeeklyChecks are `[...checkA(db),...checkB(db),...]` spreads in the exact original D-n/W-n order (finding order + insertFeedbackIfNew side-effect ordering preserved), plus writeSystemLog/upsertAuditState/maybeSendTelegram + the public runDailyAudit/runWeeklyAudit/runDailyAuditIfStale entry points; re-exports AuditFinding/TelegramFn/GetCountFn/buildFindingTitle for zero call-site churn (existing tests + bctcReparseJob.ts unchanged).

RAW-verified: scratch pre/post comparison script (temp, deleted after use) ran runDailyAudit/runWeeklyAudit against identical seeded fixture DBs using a git-HEAD copy of the pre-split monolith vs the post-split module — findings[] output (20 daily + 27 weekly findings) and agent_feedback insert ordering byte-identical (JSON deep-equal). New `FACTORY-SCHEDULER-split-dataAuditJob.test.ts` (7 tests) exercises 6 extracted check functions directly, plus dataAuditShared's pure mapping helpers, without the orchestrator — demonstrates the DoD's "individually testable" property.

tsc clean. Targeted suite (11 files: 157/314/1055/1420/1862j/1041/1086/1101/1221/p2-f-rag-http-rewire + new split test) 92/92 pass. toolCount=183 unchanged, scheduler cron.schedule grep=3 unchanged (no scheduler wiring touched). Full `bun test`: 14415 pass/40 skip/65 fail/4 errors/1184 files (601s) then known Bun 1.3.13 crash-at-teardown — visible tail sample shows only the pre-existing `1302-deprecated` flaky class (same as both prior FACTORY splits this session).

Doc updates: `infrastructure.md` (new "Data Audit Job" section).

Commit: 7b62f73e7. Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (scheduler/cron hot path — new code only takes effect after container rebuild, Docker Microservice Code-Change Close Gate).

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, RAW-verify byte-identical pre/post-split, dataAuditJob.ts 1300L→353L | HEALTHY.

## 2026-07-09 — FACTORY-SCHEDULER-split-intelligenceCycleJob → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

intelligenceCycleJob.ts (1381L, 15-min hot path) mixed CycleResult/CycleDeps, isMarketHours, 9 defaultXxx DI-seam production impls, and the 7-step orchestrator. Split into `intelligenceCycle/types.ts` (138L), `intelligenceCycle/marketHours.ts` (36L, imports VN_OFFSET_MS from timeConstants.ts), `intelligenceCycle/defaults/*.ts` (8 files ≤79L + `defaultComputeHexagrams.ts` 146L — kept together with `resetHexagramCooldown` + the module-level `_lastHexagramComputedAt` map per the CRITICAL cooldown-closure invariant). `intelligenceCycleJob.ts` is now a 975L thin orchestrator (concurrency guard, timeout helper, `_runCycle`, `runIntelligenceCycle`, Step G); re-exports CycleResult/CycleDeps/isMarketHours/resetHexagramCooldown for zero call-site churn. Two source-text-introspection tests (1843-poll-news-te-chromium-stub, FIX-NEWS-CB-FALSE-CLOSED) updated their srcPath to defaultPollNews.ts's new location.

RAW-verified two ways: (1) every extracted function body byte-diffed against a git-HEAD copy (import-depth normalized) — all 11 identical. (2) scratch executable probe (temp, deleted after use) ran `runIntelligenceCycle` with identical injected `CycleDeps` against both the git-HEAD snapshot and the post-split module across market-hours=true/false — CycleResult MD5-identical both scenarios; isMarketHours matched across 5 fixed timestamps.

tsc clean. Targeted suite (25 files) 227/227 pass, 746 expect() calls. toolCount=183 unchanged, scheduler cron.schedule grep=3 unchanged. Full `bun test`: 14415 pass/40 skip/65 fail/10 errors/1184 files (584s) then known Bun 1.3.13 crash-at-teardown — grepped every fail/error: zero intelligence-cycle/scheduler/news-analysis mentions, all pre-existing pollNews/VPS-push/insider/foreign-flow/telegram flaky class.

Doc updates: `infrastructure.md` (new "Intelligence Cycle Job" section).

Commit: 0e1e48dad. Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (scheduler/cron hot path — new code only takes effect after container rebuild, Docker Microservice Code-Change Close Gate).

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, RAW-verify MD5-identical pre/post-split (2 layers), intelligenceCycleJob.ts 1381L→975L | HEALTHY.

## 2026-07-09 — FIX-CYCLEJOB-1294-MACRO-TEST-UNMOCKED-LIVE-FETCH → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (dispatched from ci-red-554bb302 signal, dev-team)

1294-macro-spam-fix.test.ts's AC-1/AC-2 `CycleDeps` objects omitted `macroFetchFn`/`vnstockSyncFn` (both already exist on `CycleDeps`, added by CI-RED-8081e584-FIX round 2 / commit 8a2ef7255 for the sibling 1285-macro-alert-cooldown test) — step A2 defaulted to REAL Yahoo Finance/SBV HTTP calls on every run, confirmed live via `[yahooFinance] fetched commodity prices`/`[sbv] macro snapshot fetched` log lines that vanished after the fix. Fix: injected `async () => {}` no-op stubs for both fields, mirroring the 1285 precedent (no new DI convention).

RAW-verified: target test green x4 local runs, no live-fetch log lines, duration ~1050ms→~150ms proves no network I/O. tsc clean. `git stash` A/B on a monolithic `bun test` run's 12-file failure list confirmed those 65 fails pre-exist independent of this diff. CI-equivalent `ci-per-file-isolation.sh`: 1294 not among the (unrelated) failed files. Pushed 76acfb4e4 → CI initially red on FU-LOCKSTORE-EXPIRED-GC.test.ts (unrelated, zero code overlap, confirmed 3/3 local isolated pass — a NEW unrelated flake, not this fix) → re-ran same commit's CI job (GH run 29025427212) → green.

Scope note: 8 other test files (106-intelligence-cycle/1228/1255/137/1383/1501/278/311) call `runIntelligenceCycle` without stubbing `macroFetchFn`/`vnstockSyncFn` — same exposure class, currently passing (network reachable), flagged for a follow-up sweep rather than folded into this S-size targeted fix.

Doc updates: NONE (test-only fix, no architecture/behavior change).

Commit: 76acfb4e4. Board: `in_progress`→`review` (orch-apply.sh, commit 531af9a11), `next_agent=qa`.

Zone health: tsc clean, tools=183 unchanged, target test green x4 no live-fetch, CI green on re-run | HEALTHY.
