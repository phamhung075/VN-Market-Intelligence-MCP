# dev-mcp-server -- Notebook

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

## 2026-07-09 — FACTORY-SCHEDULER-split-dataAuditJob → REVIEW

**Session:** 5a45feda-431e-46c8-941d-a6539a0eca77 (BOUNDED-1 idle-capacity auto-pickup, dev-team)

dataAuditJob.ts (1300L) held runDailyChecks (D-1..D-11) + runWeeklyChecks (W-1..W-7) as two giant inline functions, 30+ inline findings.push sites. Split into `scheduler/news-analysis/audit-checks/` — 19 files, one per check group, each ≤120L, pure `(db)=>AuditFinding[]` (checkLancedbDrift/W-7 is the one async exception, injected GetCountFn). AuditFinding/TelegramFn/GetCountFn + checkToCategory/severityToPriority/getPreviousRowCounts/insertFeedbackIfNew/buildFindingTitle/buildTelegramMessage/INDICATOR_RANGES/SNAPSHOT_TABLES moved to new `dataAuditShared.ts`. `dataAuditJob.ts` is now a 353L thin orchestrator: runDailyChecks/runWeeklyChecks are `[...checkA(db),...checkB(db),...]` spreads in the exact original D-n/W-n order (finding order + insertFeedbackIfNew side-effect ordering preserved), plus writeSystemLog/upsertAuditState/maybeSendTelegram + the public runDailyAudit/runWeeklyAudit/runDailyAuditIfStale entry points; re-exports AuditFinding/TelegramFn/GetCountFn/buildFindingTitle for zero call-site churn (existing tests + bctcReparseJob.ts unchanged).

RAW-verified: scratch pre/post comparison script (temp, deleted after use) ran runDailyAudit/runWeeklyAudit against identical seeded fixture DBs using a git-HEAD copy of the pre-split monolith vs the post-split module — findings[] output (20 daily + 27 weekly findings) and agent_feedback insert ordering byte-identical (JSON deep-equal). New `FACTORY-SCHEDULER-split-dataAuditJob.test.ts` (7 tests) exercises 6 extracted check functions directly, plus dataAuditShared's pure mapping helpers, without the orchestrator — demonstrates the DoD's "individually testable" property.

tsc clean. Targeted suite (11 files: 157/314/1055/1420/1862j/1041/1086/1101/1221/p2-f-rag-http-rewire + new split test) 92/92 pass. toolCount=183 unchanged, scheduler cron.schedule grep=3 unchanged (no scheduler wiring touched). Full `bun test`: 14415 pass/40 skip/65 fail/4 errors/1184 files (601s) then known Bun 1.3.13 crash-at-teardown — visible tail sample shows only the pre-existing `1302-deprecated` flaky class (same as both prior FACTORY splits this session).

Doc updates: `infrastructure.md` (new "Data Audit Job" section).

Commit: 7b62f73e7. Board: `in_progress`→`review`, `next_agent=ops`, `rebuild_required=true` (scheduler/cron hot path — new code only takes effect after container rebuild, Docker Microservice Code-Change Close Gate).

Zone health: tsc clean, tools=183 unchanged, scheduler cron.schedule grep=3 unchanged, RAW-verify byte-identical pre/post-split, dataAuditJob.ts 1300L→353L | HEALTHY.
