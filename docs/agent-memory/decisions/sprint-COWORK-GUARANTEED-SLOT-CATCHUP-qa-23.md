# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Make cowork `guaranteed:true` an HONORED contract — add look-back/catch-up to the guaranteed-slot firing path (cowork-match-slots.js / cowork-guaranteed-slot-firer.sh / live dispatcher startup), dedup via published:<slot_id>:<VN-work-date>, no retro-post across VN-date rollover.
**Agent:** qa
**Started:** 2026-08-14T17:37:05Z (continuation of sprint-COWORK-GUARANTEED-SLOT-CATCHUP-qa-22.md, CAP-REACHED)

---

### STEP qa-S1 · qa · 2026-08-14T17:37:26Z
**task-id:** FU-BACKFILL-MULTIPLE-COVER-LETTERS
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`) of `c515ec142`, on main ancestry, `git show --stat` matches the 3-file set exactly (test/prod/doc). Row had no `.files[]`/`.owner` drain fields — fallback path used (files derived from review_note prose, cross-checked against the real diff, not accepted blind).
**what-considered:**
- Re-ran REAL verification, not trusted from review_note prose: new file `FU-BACKFILL-MULTIPLE-COVER-LETTERS.test.ts` 12/12 pass (matches claim); wider regression batch (new file + FIX-CTG-PDF-MISLINK.test.ts + PI3-bctc-inspect-reopen2.test.ts) 56/56 pass, byte-identical to the row's own claimed count. `bun tsc --noEmit` clean (0 output). `mock-guard.sh --files backfillBctcPdfPaths.ts` exit 0 PASS.
- DDD: file grep-hit `from.*infrastructure` (logger.js import) but file is `application/usecases/`, not `domain/` — dev-standards.md:1507 golden rule scopes the ban to `domain/` only; application importing infrastructure is the documented, established pattern (dev-standards.md:1516 example) — not a violation. Zero `domain/` files in scope. `process.env`/secrets grep clean.
- Read the actual fix code (`isConsolidatedReportFilename` positive-match gate, applied to both NULL-pass and heal-pass, replacing the old negative-match `!isCoverLetterFilename`) — matches the review_note's described mechanism exactly, not just trusted from prose. Doc section (`usecases.md` § backfillBctcPdfPaths.ts) confirmed present in the commit itself via `git show`.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, files match, all re-run checks green, fix logic independently read and confirmed sound.
**why-change:** none — verdict matches the row's own review_note claim.

### STEP qa-S2 · qa · 2026-08-14T17:37:53Z
**task-id:** FDA-6
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`) of `6a6d47e3a`, on main ancestry, `git diff-tree` matches all 4 non-doc files touched. Row's own `qa[]` entry lacked `.files[]`/`.owner` — fallback used `backlog-detail.json#FDA-6.files[]` for the claimed file set.
**what-considered:**
- Re-ran REAL verification, not trusted from return_summary prose: `bun test src/__tests__/DSI-S3-sector-fin.test.ts` -> 27/27 pass. `bun tsc --noEmit` -> 0 errors/clean. `mock-guard.sh --files` (creditFlowTools.ts+computeCreditFlowSignal.ts+creditFlowAnalyzer.ts) -> exit 2 CAUTION, pre-existing unrelated commented-out TODO at computeCreditFlowSignal.ts:230 (not a fabricated-data marker) — non-blocking per spec.
- Read commit body: `date: null` when mortgageIsEstimate||yoyIsEstimate (fixes the row's date=now fabrication) + new `structuredContent` field (is_estimate/source_tier/estimated_fields/fully_estimated/current_date/previous_date) — matches return_summary claim exactly. VN prose content claimed byte-identical (not independently diffed pre/post — additive-only key, low risk).
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, all 4 claimed files touched, targeted test+tsc green, mock-guard CAUTION-only (non-blocking).
**why-change:** none — verdict matches row's own return_summary claim.

### STEP qa-S3 · qa · 2026-08-14T17:39:30Z
**task-id:** FIX-MARKETWATCHER-EOD-OFFHOURS-SAMETICK-COLLISION-SCHEDULE-AND-PATHSPEC
**what-done:** Direct-Commit Verify (`qa[]` row, `.commit`=`5918c55fe` — agent-father half of a two-row brief; sibling developer row `FIX-COWORK-SUPERSEDE-MUTEX-SCRIPT-AND-MATCHSLOTS-WIRING` covers the actuator). Router had already RAW-verified (7-file list, 3 test suites) — re-verified AC-1..4 independently against the actual diff per caller instruction, not the row's own `review_note` prose.
**what-considered:**
- Read `git show` per-file diffs, not the summary: AC-1 `cowork-schedule.json` gained `"supersedes": ["market-watcher-offhours"]` on `market-watcher-eod` verbatim, offhours object untouched. AC-2 `pressure-cadence.md` gained Step 4.5d, worded as a SUPERSEDED doc-no-op pointer mirroring shipped 4.5c exactly. AC-3 `match-slots.md` gained exactly one sentence after the WARN paragraph (supersedes resolves in-script first); WARN paragraph itself byte-unchanged (pure addition). AC-4 `eod.md`+`cycle.md` both gained a trailing `-- <paths>` pathspec on `git_commit_retry`, matching the `git add` line — closes the RULE 2.5 gap this same brief's own incident evidence cites (`6cfdfb227`).
- Independently checked the "AC-1 no longer inert" claim rather than trusting it: sibling commit `662d1fcc3` confirmed `git merge-base --is-ancestor` of main; `grep` confirms `cowork-match-slots.js` `finish()` now calls `applySupersedeMutex(chefResult.matches, scheduleSlots)` — actuator genuinely live. Found (not this row's fault, flagged not fixed): sibling row's own `task_board` lane is still stuck in `qa[]` despite an earlier `qa-S154` (sprint-...-qa-22.md) entry narrating a DONE_VERIFIED verdict for it at 17:35:45Z — `git log` on `orch-state.json` shows no matching lane-move commit ever landed; classic narrated-write-never-executed. Out of scope for this task-id, not actioned here.
- Re-ran tests myself: `cowork-schedule-consistency.test.js` 13/13 (grew from router's 9/9 via sibling's AC-6 typo-guard; includes a live assertion this row's new `supersedes` entry names a real `slot_id` — passes), `cowork-chef-mutex.test.js` 25/25 (unaffected, non-goal honored), `cowork-match-slots.test.js` 69/69. `size-lint-justification.sh --check` → PASS 0 offenders repo-wide (doc size-justification headers within tolerance post-edit). No production TS/JS touched (docs/agents/** + cowork-schedule.json only) → tsc/mock-guard/DDD/security N/A.
**why-decision:** vc-approved, DONE_VERIFIED. AC-1..4 all independently confirmed against source diffs, zero blocking issue. Lane-moved `task_board.qa[]`→`task_board.done_verified[]` via jq+`scripts/orch-apply.sh` (added required `verification.raw_probe` per schema). `.head.active_task_id` was this exact task-id → reset to idle in the SAME write (FIX-router-lane-move-must-reset-head lesson).
**why-change:** none — router's verify-committed dispatch followed exactly.

### STEP qa-S4 · qa · 2026-08-14T17:58:31Z
**task-id:** FIX-CRON-JOB-RUNS-DOUBLE-LOG
**what-done:** Direct-Commit Verify (`qa[]` row, `.commit_sha`=`0a73c5b0490d370cc01d28a9040b56f4920c1aac`, no `.files[]` drain field — derived from `git show --stat`, matched exactly against commit-message file list). Commit real, on `main` ancestry.
**what-considered:**
- Re-ran independently, not trusted from `return_summary` prose: new `FIX-CRON-JOB-RUNS-DOUBLE-LOG.test.ts` 10/10 pass; same 9-file regression batch cited in commit msg (1420-cron-health-coverage, 1125/PRED-RESOLVER-GAP-FIX/1154, FIX-BASE-RATE-COMPUTATION-CRON-DEAD, FIX-BCTC-REPARSE-DOUBLE-WRAP-DEDUP-GUARD, ARCH-CRON-recover-jitter, FACTORY-SCHEDULER-job-table-registry + new file) 140/140 pass (matches claimed 130+10 exactly). `bun tsc --noEmit` 0 errors. `mock-guard.sh --files startupHelpers.ts` exit 0 PASS. `process.env`/secrets grep clean on both touched files.
- Read the diff directly: default fn swapped self-recording `runPredictionResolutionJob()` wrapper call for direct `runPredictionResolution(db)` core call (single `recordJobRun`), replicated the T4 `shouldSkipRecoveryReplay` dedup guard (already defined this file, used identically by 3 sibling wrappers) into this wrapper — exact match to commit-message mechanism and the sibling fixes' established pattern.
- DDD: `startupHelpers.ts` is `scheduler/`, not `domain/` — pre-existing `infrastructure/` imports (recordJobRun, breakers) are out-of-scope for the domain-import ban. Full-suite 14987-run reclaim not repeated (documented flake-band convention already cross-referenced in 6+ sprint journals); targeted+regression scope matches flow's "touched test file(s) inferred from files[]" instruction.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, both files match commit-message list, all re-run checks green, fix logic independently read and matches the diagnosed double-wrap root cause.
**why-change:** none — matches row's own `return_summary` claim.

### STEP qa-S5 · qa · 2026-08-14T17:59:00Z
**task-id:** FIX-VPS-NEWS-STALE-FALSEPOS
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row, `.commit_sha`=`b08045ef0`, no `.files[]` drain field — derived from `git show --stat`, matched exactly against the row's own `review_note` file list). Commit `b08045ef0be9a143f1eb4cd8766671870695d2b9` confirmed real, on `main` ancestry.
**what-considered:**
- Read diff directly, not trusted from `review_note` prose: `EXPECTED_INTERVALS.news` in `vpsProxyStaleness.ts` 10→20 + stale "every 5min" comment replaced with the live-cadence rationale; `VPT-1-vps-proxy-health-endpoint.test.ts` two comment updates (10min→20min); new `FIX-VPS-NEWS-STALE-FALSEPOS-news-threshold-calibration.test.ts` (58L, 4 cases: 15min-not-stale repro, p99-not-stale, genuine-60min-stale, threshold-bound assertion). Exactly the 3 files claimed, no scope drift.
- Re-ran independently: new calibration test 4/4 pass; `VPT-1-vps-proxy-health-endpoint.test.ts` 7/7 pass; wider regression (VPT-1 + 1113-vps-proxy-health + 1920i-freshness-sla-extension + freshness-coverage-map-checker + new file, 5 files) 67/67 pass, 0 fail; `bun tsc --noEmit` 0 errors; `mock-guard.sh --files vpsProxyStaleness.ts` exit 0 PASS; `process.env`/secrets grep clean.
- Confirmed no silent regression from a later unrelated refactor: `EXPECTED_INTERVALS` now lives in a split `vpsProxyStalenessConfig.ts` (FIX-CI-SIZELINT-VPSPROXYSTALENESS-REGRESSION-123L, commit `9930ee008`, post-dates this fix) re-exported unchanged by `vpsProxyStaleness.ts` — live value still `news: 20`, no reversion to 10.
- DDD: touched prod file is `interface/mcp/tools/system/vpsProxyStaleness.ts` (interface layer), imports `domain/services/freshnessSlaChecker.js` + `infrastructure/db/vpsPushLogStore.js` — dev-standards.md:1507 golden rule bans only `domain/`→`infrastructure/`; not a domain file, not a violation.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, all 3 files match claim exactly, all re-run checks green, fix logic (threshold recalibration + config re-export) independently confirmed, dev-team's own RAW-verify numbers (p90/p99/gap-count) plausible and consistent with re-run test results.
**why-change:** none — matches row's own `review_note` claim.

### STEP qa-S6 · qa · 2026-08-14T20:02:00Z
**task-id:** FACTORY-TECHANALYSIS-fix-discarded-service-and-port
**what-done:** Direct-Commit Verify (`qa[]` row, `.commit_sha`=`39fbec098`, no `.files[]`/`.owner` drain fields — derived via `git show --stat`, matched exactly against the commit message's own file list). Commit `39fbec098433e634006b98e9d8bba1e95362e0f2` confirmed real, on `main` ancestry (dated 2026-07-31, sat in review lane since).
**what-considered:**
- Re-ran independently, not trusted from commit prose: `go build ./...` clean, `go vet ./...` clean, `go test ./... -count=1` (fresh, not cached) all 11 packages pass, `golangci-lint run ./...` 0 issues, G12 sandbox `bash dashboard/build.sh` → 35 passed/0 failed + headless render-check PASS (matches claimed 35/35 exactly).
- Read diff directly: `pkg/domain/services.go` (`CalculateTAService` stub, discarded at old `main.go:71`) deleted, repo-wide grep confirms zero other callers; `RouterConfig` gained `Port` field threaded from resolved `PORT` env, `/health` now marshals the real bound port via struct+`json.Marshal` replacing a hardcoded `"5003"` literal; empty/unparseable `Port` falls back to `defaultPort=5003` — verified the sandbox caller doesn't set `Port` and is unaffected. `mock-guard.sh --files main.go router.go` exit 0 PASS; `process.env`/secrets/`domain`→`infrastructure` import greps clean.
- `REBUILD_REQUIRED` note on the row treated as non-blocking ops follow-up (standard chain, precedent in `dev-rag-service` notebook) — `verify-committed` JUMP-TO has no merge/push/deploy step; code-level certification (build/vet/test/lint/G12 sandbox) is what QA gates here, not live container state.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, all 6 changed files match commit-message scope, every re-run check green, no dangling references to the deleted service, docs updated accurately.
**why-change:** none — matches the commit's own AC claim exactly.

### STEP qa-S6 · qa · 2026-08-14T18:00:30Z
**task-id:** FACTORY-SCHEDULER-split-bctcReparseJob
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row, no `.commit`/`.files[]` drain fields — commit derived from `review_note` prose (`f0a622472`), files from `backlog-detail.json#FACTORY-SCHEDULER-split-bctcReparseJob`'s own `files[]` claim, single file). Commit `f0a622472eccd0bccbcc1f15e7dd977b7e0db74c` confirmed real, on `main` ancestry; `git show --stat` shows exactly 1 file changed matching the claim (`bctcReparseJob.ts`).
**what-considered:**
- Read diff directly, not trusted from `review_note` prose: `MIN_PDF_TEXT_CHARS=100`/`MIN_PDF_CONFIDENCE=0.3` named constants substituted into exactly 4/2 raw-literal occurrences (Tier 1a/1b/2/3 gates) — matches claim exactly, no threshold value changed. `processStrandedFeedback(db, rows, reparse, notify, fileExistsFn)` extracted verbatim from the `runBctcReparseJob` for-loop body, called once, partial counters merged into `result` — pure mechanical extraction, no behavior/ordering change, kept module-private (not exported, no test imports it directly).
- Re-ran independently, broader net than the claimed 21 files: grepped all 24 test files referencing `bctcReparseJob` (13 direct import + mock.module + string-ref) → 220 pass / 1 skip / 0 fail / 747 expect() calls, 0 fail. `bun tsc --noEmit` 0 errors. `mock-guard.sh --files bctcReparseJob.ts` exit 0 PASS.
- DDD: file is `scheduler/financial-reports/`, not `domain/` — pre-existing `infrastructure/` imports (logger, db/schema, fetchers/pdf, notifiers/telegram) out of scope for the domain-import ban, not a violation. `process.env`/secrets grep clean (only false-hit "tokens" in a comment).
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, sole file matches claim exactly, all re-run checks green on a broader test net than dev's own claim, diff independently read and confirmed pure mechanical naming/extraction with resolved values/behavior unchanged.
**why-change:** none — matches row's own `review_note` claim.

### STEP qa-S7 · qa · 2026-08-14T18:00:06Z
**task-id:** FACTORY-DOMAIN-extract-sla-config
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row, no `.commit`/`.files[]` drain fields — commits derived from `review_note` prose ("Commits: 9930ee008 (code), 4097ffaea (memory)"), files cross-checked against `git show --stat` directly, not accepted blind). Both commits confirmed real, on `main` ancestry (`git merge-base --is-ancestor`); `git show --stat 9930ee008` matches all 3 claimed files exactly: `freshnessSlaChecker.ts`, new `freshnessSlaConfig.ts`, `234-vps-health-sla.test.ts`.
**what-considered:**
- Read the diff directly, not trusted from prose: `SignalType`/`SignalSlaConfig`/`DEFAULT_SLA_CONFIG` moved verbatim (byte-identical, rationale doc-comments intact) into the new sibling `freshnessSlaConfig.ts` (own size-justification header, 194L); `freshnessSlaChecker.ts` now imports the 3 names and re-exports them unchanged (`export type {...}` / `export {DEFAULT_SLA_CONFIG}`) — zero call-site changes for any of the cited importers. Test hunk confirmed: the one brittle literal-substring AC-9 assertion updated to check the new re-export line — matches claim exactly.
- `git log --follow` on `freshnessSlaChecker.ts` shows one later unrelated commit (`f0831e6be`, bctc_vps_queue terminal-state exclusion) touched the file after this one — explains current 829L vs the commit's stated 966L→814L; legitimate subsequent drift outside this task's scope, not scope creep in the verified commit itself.
- Re-ran REAL verification, not trusted from prose: targeted SLA/freshness zone suite — 18 files referencing `freshnessSlaChecker`/`freshnessSlaConfig`/`SignalSlaConfig`/`DEFAULT_SLA_CONFIG` (broader net than the row's own claimed 14) — 271 pass / 0 fail / 730 expect() calls, including the exact `234-vps-health-sla.test.ts` AC-9 assertion. `bun tsc --noEmit` 0 errors. `mock-guard.sh --files` (both touched prod files) exit 0 PASS. `scripts/audits/size-lint-justification.sh --check` (both files) PASS — 0 unjustified offenders.
- DDD grep hits on both files are docstring text only ("Layer: domain/services — must not import from application/ or infrastructure/"), not actual import statements — confirmed by reading, zero real `domain/`→`application/`/`infrastructure/` imports. `process.env`/secrets greps clean on both files.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — both commits real/on-main, all 3 files match claim exactly, all re-run checks green on a broader test net than dev's own claim, diff independently read and confirmed pure mechanical/behavior-preserving extraction with `DEFAULT_SLA_CONFIG` unchanged.
**why-change:** none — matches row's own `review_note` claim.

### STEP qa-S8 · qa · 2026-08-14T20:05:00Z
**task-id:** FACTORY-STOCK-dedup-history-handlers
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row, `commit_sha=4d3394f77` w/ no `.files[]`/`.owner` — files cross-checked against `backlog-detail.json#FACTORY-STOCK-dedup-history-handlers`'s own `files[]` claim, not accepted blind). Commit `4d3394f772d88e8911b0b82368304fdee007c8e8` confirmed real, on `main` ancestry; `git show --stat` matches the claimed file (`router.go`) plus a new `router_test.go` — both expected for this FACTORY refactor.
**what-considered:**
- Read the diff + live HEAD directly, not trusted from prose: `defaultHistoryDays=30` const extracted, `parseDays()`/`runHistory()` shared helpers replace the ~90%-duplicated `priceHistory`/`priceHistoryPathParam` bodies; both routes still registered (`router.go:49,51`) — matches DoD verbatim. No later commit touches either file since (`git log 4d3394f77..main -- <2 files>` empty), so live content == commit content.
- Re-ran REAL verification: `go build ./...` clean; `go test ./... -count=1` 9/9 packages fresh-pass (8/8 in touched `interface/http` pkg incl. 3 new dedup-behavior tests); `gofmt -l` clean on both touched files; `golangci-lint run ./pkg/interface/http/...` 0 issues; `mock-guard.sh --files router.go` exit 0 PASS. `go vet` flagged 7 pre-existing `resp`-before-err-check lines — confirmed byte-identical at the parent commit via a throwaway worktree diff, NOT introduced by this task, non-blocking.
- DDD: `pkg/interface/http` importing `application`+`domain` is the expected composition-root pattern (no `domain/` file touched, no violation). `process.env`/secrets/password/token grep clean on both files.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, sole claimed file + expected new test file match exactly, every re-run check green, DoD fully met (named const, shared helper, both routes kept, tests prove identical cross-route behavior).
**why-change:** none — matches row's `review_note`/backlog DoD exactly.

### STEP qa-S9 · qa · 2026-08-14T18:02:03Z
**task-id:** FACTORY-KINHDICH-add-data-invariant-test
**what-done:** Direct-Commit Verify (`qa[]` row, `commit_sha=fa02f39f1`, no `.files[]`/`.owner` — files derived from `backlog-detail.json#FACTORY-KINHDICH-add-data-invariant-test`, cross-checked against `git show --stat`). Commit `fa02f39f1547d8f42bd3db839446f7bc1f4d28d2` confirmed real, on `main` ancestry; touches only new `hexagram_invariant_test.go` — zero production file changed, matches claim exactly.
**what-considered:**
- Re-ran independently inside `golang:1.22-alpine` (matches `Dockerfile` builder stage, not host go1.26 — version-drift guard): `go build ./...` clean, `go vet ./...` clean, `go test ./...` 13 packages (9 testable/4 no-test-files) all pass, incl. the 6 new invariant tests (queDataMap/queMetaList/GetAllQueReferences/trigrams/O(1) maps).
- `golangci-lint run ./...` (host v2.12.2) 0 issues. `mock-guard.sh` no-op (only `_test.go` touched, exclude-listed). `process.env`/secrets grep clean; sole import is stdlib `testing`.
- Row's own note claims "12/12 packages"; my independent count is 9 testable/13 total (no commit since fa02f39f1 changed package count) — prose-count mismatch only, non-blocking, all actual checks green.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, sole file matches claim, test-only (no prod change), all re-run checks green inside version-matched container.
**why-change:** none — matches row's own note claim.

### STEP qa-S9 · qa · 2026-08-14T18:05:00Z
**task-id:** FACTORY-APP-console-to-logger
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row, no `.commit`/`.files[]`/`.owner` drain fields — commit derived from `review_note` prose ("Commits: 3a0619464 (code+doc), bcf820017 (notebook), cb969155f (journal)"). All 3 confirmed real, on `main` ancestry (`git merge-base --is-ancestor`); `git show --stat 3a0619464` matches all 5 claimed application files + the 1 doc file exactly.
**what-considered:**
- Read the diff directly, not trusted from prose: 3 files sampled in full (imfDataFetcher.ts, discoverBctcPdfUrlDirectApi.ts, parseBctcReport.ts) confirm pure mechanism swap — message content/log level/control-flow unchanged, only `console.*` → `logger.*` + missing imports added, matching sibling convention. Independent greps on all 5: zero remaining `console.*` (rc=1, complete swap), `import.*logger` present 5/5, `process.env` 0, secrets/password/token 0 real hits.
- DDD gate: application-layer files importing `infrastructure/` (getDb, CircuitBreaker, bctcSignalDebounce, now +logger) is the documented pattern — repo's DDD rule (docs/ARCHITECTURE.md:7, qa-checklist.md:14) only forbids `domain/` importing infrastructure/application. Not a violation.
- Re-ran REAL verification, not trusted from prose: broader net than dev's own claimed 10-file/120-test subset — 30 test files repo-wide reference the 5 changed modules; ran fresh in 2 batches, 145/145 + 142/142 = 287/287 pass, 0 fail. `bun tsc --noEmit` 0 errors. `mock-guard.sh --files` (5 prod files) PASS. Doc fix spot-checked: usecases.md now reads `logger.warn` (was `console.warn`).
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — all 3 commits real/on-main, exact file-list match, diff independently read and confirmed pure mechanical swap, every re-run check green on a wider test net than the dev's own claim.
**why-change:** none — matches row's own `review_note` claim.

### STEP qa-S7 · qa · 2026-08-14T18:01:34Z
**task-id:** INVESTIGATE-EMPTY-DATA-TABLES
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row, `.commit_sha`=`d4569c5b8`, no `.files[]` drain field — derived via `git show --stat`). Commit confirmed real, on `main` ancestry, docs-only (SPIKE doc + notebook + decision journal, zero production code).
**what-considered:**
- Did NOT trust dev-team's own RAW-verify prose in `review_note` — independently re-derived every substantive claim: live `sqlite3 -readonly` on `data/live/market.db` (all 5 tables=0), `brokerSanctionsJob.ts` stub+`QUARTER_MONTHS`, `muasamcong.ts` verbatim env passthrough, `davPharmacyJob.ts` guard function (`shouldSkipRecoveryReplay` not `shouldRunCatchup`, confirmed both exist as distinct exports), `sscInsider.ts` regex extractor. All 6 spot-checks matched exactly.
- Found one freshness discrepancy: review_note's "exactly 1 success ever (2026-04-30)" for `davPharmacyCheckJob` is stale — live `cron_job_runs` now shows a 2nd success (07-31 23:00 UTC = Aug-1 ICT). Assessed severity: does NOT undermine the diagnosis (June/July-1 still both missed even bracketing 2 successes, corroborates the unswept-catchup-gap root cause); the committed SPIKE doc text itself was accurate at its own point-in-time (07-31 18:05, before that day's 23:00 run). Judged non-blocking, noted in raw_probe rather than CHANGES_REQUESTED.
- `bun tsc --noEmit` (apps/mcp-server) 0 errors; mock-guard N/A (no production files in commit); secrets/process.env grep clean; DDD N/A (no src/ touched).
**why-decision:** APPROVED, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, file list matches, every substantive code/DB claim independently re-verified true, one metadata-only staleness caveat recorded but not disqualifying.
**why-change:** none — verified exactly what the row scoped; freshness caveat flagged additively.

### STEP qa-S10 · qa · 2026-08-14T19:32:00Z
**task-id:** FIX-BCTC-1345B-REPORT-BATCH
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row, `.commit_sha=893aca43b`, no `.files[]`/`.owner` drain fields — files derived from `review_note` prose, cross-checked against `git show --stat`). Commit `893aca43b` (+`8a08bb510` memory) confirmed real, on `main` ancestry; touches exactly the 2 claimed files (`parseBctcReport.ts` + new `FIX-BCTC-1345B-REPORT-BATCH.test.ts`), matching claim exactly.
**what-considered:**
- Read the diff directly, not trusted from prose: fix gates the existing `[BCTC-1345b]` Telegram send on a new `financial_reports.validation_status='low_confidence'` lookup for the same `(action_code, sort_key)`, ANDed with the pre-existing 1792 1h debounce — additive guard, no removed logic, reuses existing column (no migration).
- Re-ran REAL verification, not trusted from prose: new test file 3/3 pass (independently, not from review_note claim) — RED/GREEN daily-reparse-retry regression, no-over-suppression-across-tickers, self-closing-on-status-flip. 4 named sibling suites (1792-conviction-debounce, 1345e-integration-pipeline, 1424a-bctc-unit-scale-mismatch, 1810c-vnm-unit-mismatch) re-run fresh: 24/24 pass, no regression. `bun tsc --noEmit` 0 errors. `mock-guard.sh --files` (1 prod file) PASS.
- DDD gate: application-layer file importing `infrastructure/db`+`infrastructure/logger` is the documented pattern (qa-checklist.md:14 only forbids `domain/`→infrastructure/application); diff adds zero new imports (reuses existing `getDb`). `process.env`/secrets grep clean on changed file. Noted PO SCOPE-HOLD on the row (alert TEXT correctness tracked separately by FIX-BCTC-1345B-ALERT-NAMES-A-RULE-FAMILY-THAT-CANNOT-PRODUCE-ITS-OWN-VALUE) — this row's own scope is dedup/volume only, matches what was verified.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, exact file-list match, diff independently read and confirmed matches review_note's mechanism claim, every re-run check green.
**why-change:** none — matches row's own `review_note` claim.

### STEP qa-S11 · qa · 2026-08-14T21:40:00Z
**task-id:** FIX-DEVTEAM-COLDEVICT-FAILURE-REPORT-SWALLOWS-STDERR
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row) of `e817334d1` (+`4658cf1b0` memory). Row's own `.files[]` (`main.md`, `orch-cold-evict.sh`) matched NEITHER actual diffstat — developer's `status_note` explains why (real swallow point is `dev-team-tick-preflight.sh` Step 5.5, not the triage guess); treated as the flow's Fallback path and re-derived the real file set from `git show --stat` (4 files) instead of hard-failing on the stale files[] claim.
**what-considered:**
- Verified the fix's own causal claim, not just its prose: `_step55_run_cold_evict()` already captured combined stdout+stderr into a LOCAL var, printed only to this script's own stderr — confirmed the caller (`_step55_cold_evict_and_commit`) previously only branched on exit code (`if ! _step55_run_cold_evict`), so the diagnosis is structurally correct, not narrated.
- `_step55_is_benign_cas_loss()` regex (`ABORT: CAS retry limit \([0-9]+\) exceeded.*concurrent writer`) checked byte-for-byte against `orch-cold-evict.sh:1081`'s actual `log "ABORT: CAS retry limit (${MTIME_CAS_RETRIES}) exceeded — concurrent writer; hot file unchanged"` — matches exactly, not a guess at the string.
- Re-ran REAL verification, not trusted from prose: full `dev-team-tick-preflight.test.sh` = 154/154 (independently confirmed baseline was exactly 146 by checking out parent commit `5ad6a51a8` into a scratch worktree and re-running — the claimed "146 pre-existing + 8 new" is exact, not rounded). `shellcheck -S warning` clean on both changed script + test file. `mock-guard.sh --files` on the touched prod script → PASS (no TS/prod-domain files; bash zone). `process.env`/secrets grep clean.
- `post-cycle.md` Step 4.2 doc updated in lockstep with the runtime behavior (benign-CAS vs genuine-failure classification spec), matches implementation exactly — doc-parity claim held.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE. AC (`benign-cas-loss-emits-no-report` / `genuine-failure-reports-exit-code-and-verbatim-stderr`) satisfied by both the code path reading and the T30b/T30c regression tests, which I independently re-ran rather than accepting the commit message's count.
**why-change:** none — files[] mismatch resolved via Fallback path per flow spec (stale triage guess, developer's own note explains the correct location), not a defect in this verify.

### STEP qa-S12 · qa · 2026-08-14T19:35:00Z
**task-id:** FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row, `.commit_sha=e64ad8870`, no `.files[]` on the row — derived from `git show --stat`). Commit confirmed real, on `main` ancestry, touches exactly the 9 claimed files (macroTools.ts, 5 rewired parseInner() test files, new FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT.test.ts, macro.md, get_macro_snapshot.md doc pair).
**what-considered:**
- Row carried a hard PO gate (`po_gate_20260801T0125`): DO NOT flip DONE until CI size-lint green on the sibling blocker `FIX-CI-SIZELINT-MACROTOOLS-HUMANIZE-618L` (this row grew macroTools.ts 510L→618L, tripping the 551L tolerance). Checked `depends_on` row: status DONE_VERIFIED, its own QA record confirms CI run 30678397978 size-lint job conclusion=success post-extraction (macroSnapshotText.ts split out). Re-confirmed live, not trusted from prose: `size-lint-justification.sh --check` today → PASS 0 offenders; `wc -l macroTools.ts`=540 (within 551L upper tolerance). Gate satisfied — safe to flip this row.
- Re-ran REAL verification, not trusted from prose: targeted 6-file suite (FIX-MACRO-SNAPSHOT-HUMANIZE-TEXT + 089-tool-macro + 4 rewired siblings) = 75/75 pass, 165 expect(). `bun tsc --noEmit` (apps/mcp-server) 0 errors. `mock-guard.sh --files macroTools.ts` PASS.
- DDD gate: macroTools.ts imports `infrastructure/logger` + `infrastructure/fetchers/fetchDeadline` — checked `git show e64ad8870^:<path>`, both imports pre-existed before this commit (established interface/mcp/tools convention), not introduced by this diff. No `application/` imports. `process.env`/secrets grep clean.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, exact file-list match, dependent CI-gate independently confirmed green (not just trusted from the sibling row's own claim), all re-run checks green.
**why-change:** none — matches row's own note claim; PO gate condition independently re-verified true, not rubber-stamped.

### CAP-REACHED · 2026-08-14T19:36:00Z

### STEP qa-S12 · qa · 2026-08-14T19:36:57Z
**task-id:** FIX-AGENTSIGNALS-EXPIRED-GC-CRON
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row, `.commit_sha=f5698cb76`, no `.files[]`/`.owner` — 5 files derived via `git show --stat`, cross-checked). Commit confirmed real, on `main` ancestry, current HEAD (051299dbd) still carries the fix unreverted on both touched prod files.
**what-considered:**
- Independently re-derived the diff, not trusted from prose: `agentSignalStore.cleanExpired()` and `checkStaleAlerts()` D-3/D-4 both wrap the predicate column in `datetime()` (not just the threshold), D-4 threshold tightened 60d→30d, marker text updated, UPDATE-only (no hard-delete) — matches row's own note claim exactly.
- Re-ran REAL verification: targeted 3 test files (157-data-audit-job, 242-agent-signals, FACTORY-SCHEDULER-split-dataAuditJob) 47/47 pass fresh. `bun tsc --noEmit` (apps/mcp-server) 0 errors. `mock-guard.sh --files` (2 prod files) PASS. `process.env`/secrets grep clean; no forbidden domain→infra imports (both files are infra/scheduler layer, not domain).
- Row carries a prior `po_ruling_20260801T0222` (next_agent qa→ops for rebuild) plus a 2026-08-11T18:30Z ops note confirming single-service mcp-server rebuild completed (image 62dbe9da404d) — REBUILD_REQUIRED gate already satisfied before this drain claim, live image reflects the commit under test.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main/unreverted, diff independently confirmed, all re-run checks green, rebuild-before-verify prerequisite already closed by ops.
**why-change:** none — matches row's own note claim.

### STEP qa-S12 · qa · 2026-08-14T22:05:00Z
**task-id:** FIX-BCTC-SLA-FRESHNESS-EXCLUDE-TERMINAL
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `qa[]` row, `.commit_sha=f0831e6be`, no `.files[]`/`.owner` — files derived from the row's own `note` prose, cross-checked against `git show --stat`). Commit `f0831e6be` confirmed real, on `main` ancestry; touches exactly the 3 claimed files (`freshnessSlaChecker.ts`, `freshnessSlaMonitorJob.ts`, `FIX-HEALTH-RECHECK-BCTC-IDLE-VS-CRASH.test.ts`), matching `note` exactly.
**what-considered:**
- Read the diff directly: `queryBctcPipelineRuntimeState()` SQL narrowed from `status IN ('pending','url_not_found','enrich_failed','pek_triggered')` to `status IN ('pending','pek_triggered')` — generic status-list exclusion, no ticker/date literal, matches backlog `generic_mandate` ("no per-ticker carve-out") exactly. Reader contract documented on `PipelineRuntimeState` in the domain file.
- Re-ran REAL verification, not trusted from prose: touched test file 23/23 pass (new/updated cases C-2, C-2c, C-2d, C-10 directly assert queueDepth excludes url_not_found/enrich_failed/done/deferred_infra generically and queueDepth=0-only-terminal-rows produces NO CRASH escalation — matches backlog `verification_gate`). Targeted 25-file freshness/SLA suite (grep-derived, same set the commit's own note calls "25-file") re-run fresh: 338/338 pass, matches note's claim exactly. `bun tsc --noEmit` 0 errors. `mock-guard.sh --files` (2 prod files) PASS.
- DDD/security: `freshnessSlaChecker.ts` (domain) has zero `infrastructure`/`application` imports — clean. `process.env`/secrets grep clean on both touched prod files. Confirmed sibling `vpsHealthPoller.ts` bug flagged in the note as "deliberately NOT touched" is genuinely absent from the commit's diffstat.
**why-decision:** vc-approved, DONE_VERIFIED. Zero blocking ISSUE — commit real/on-main, exact file-list match, diff independently read and matches both the backlog's `generic_mandate`/`verification_gate` and the commit's own note, every re-run check green.
**why-change:** none — matches row's own `note` claim.
