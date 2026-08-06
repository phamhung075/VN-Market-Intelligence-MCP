# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa (continuation, qa-2 byte-capped)

**Sprint goal:** cowork guaranteed-slot catch-up (ambient sprint at time of this entry; task below is unrelated dev-team Review-Lane QA-Drain work routed to qa)
**Agent:** qa
**Started:** 2026-08-06T18:05:00Z

---

### STEP qa-S38 · qa · 2026-08-06T18:05:00Z
**task-id:** FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`). Row's own `commit: ec8f17ab6` confirmed on main ancestry, author-date 2026-07-23; `git show --stat` matches all 4 claimed files (`scripts/lib/devteam-eligibility.jq`, `bounded1-supervised-lane-report.sh`, new `devteam-bounded1-prose-sequencing-gate-verify.sh`, `docs/agents/dev-team/flow/main.md`).
**what-considered:**
- Re-ran the new regression verifier myself (not trusted from review_note prose): `devteam-bounded1-prose-sequencing-gate-verify.sh` → 5/5 PASS (AC-1 unbacked-not-eligible, AC-1b backed-eligible, AC-1c detail-side, AC-2 live UC-CDC-P5 stays held, control unaffected).
- Ran the 2 broader system-wide audits too: `devteam-dispatch-gate-satisfiability.sh` has 1 pre-existing FAIL ("BOUNDED-1 no-ops at in_progress>=1") and `bounded1-supervised-lane-report.sh` FAILs on 4 unrelated backlog rows with no dispatch lane — both structurally unrelated to this task's diff (different gate: WIP<1 cap in the CLAIM script, not `is_bounded1_eligible`'s new conjunct; the new conjunct can only ADD restriction, never cause a spurious fire). Sibling `devteam-bounded1-detail-disposition-gate-verify.sh` (flagged broken in review_note, 2026-07-23) now passes 10/10+control clean — fixed since by an unrelated later commit, not this task's concern either way.
- `bash -n`/read diff on `devteam-eligibility.jq`'s new `has_unbacked_sequencing_prose` def + its conjunct wiring — board-OR-detail OR-precedence matches every sibling `effective_*` def's convention; DDD/security greps clean; `mock-guard.sh --files` → PASS "no production source files to scan" (jq/bash/md only). No `.ts`/apps/ touched — `bun test`/`tsc --noEmit` structurally N/A.
- DJ-GATE-1: confirmed developer's own journal entry present (`sprint-COWORK-GUARANTEED-SLOT-CATCHUP-developer.md` line 30, `task-id:** FIX-DEVTEAM-BOUNDED1-PROSE-SEQUENCING-UNBACKED-GATE`) before flipping DONE_VERIFIED.
**why-decision:** APPROVED, DONE_VERIFIED. The task's own scoped regression verifier is 5/5 green on independent re-run; the 2 unrelated pre-existing audit failures are outside this row's file/gate scope and cannot be caused by an ADD-only eligibility conjunct.
**why-change:** none — verified exactly what the row scoped. Journal file rolled qa-2→qa-3 this entry (byte-cap breach, see qa-2's own CAP-REACHED sentinel).

### STEP qa-S39 · qa · 2026-08-06T16:07:00Z
**task-id:** BCTC-REPORT-ID-LOOKUP-TOOL
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`). Commit `7a9eea6bd` confirmed on main ancestry; `git show --stat` matches all claimed files, `registry.ts` diff is 2-line pure-additive.
**what-considered:**
- Row's own test (5/5 PASS), `tsc --noEmit` clean, DDD/security/mock-guard clean — satisfies verify-committed's documented scope (touched-test-file, not full suite).
- Ran full `bun test` twice anyway as due-diligence (row's AC references a 30-cycle production dark-escalation): both runs contended by a concurrent peer session's own full-suite run (up to 4 `bun test` procs observed); failures were timeout-pattern on unrelated tools, zero grep hits for the reviewed files.
- AC "ESC-5 fires on known-escalation case" — verified via LIVE production evidence in `bctc-analyst.md` notebook (FPT ESC-5 TRUE, report_id resolved), not just the unit test — stronger than prose trust alone.
**why-decision:** APPROVED, DONE_VERIFIED. Isolated additive change, clean typecheck/DDD/security, dedicated test green, AND independently corroborated live in production — highest-confidence verify-committed case this batch.
**why-change:** none — row's own "not yet deployed" note (2026-07-23) is stale, superseded by 2026-07-24/08-06 live evidence; flagged in status_note, not treated as a blocker.

### STEP qa-S40 · qa · 2026-08-06T16:15:00Z
**task-id:** FIX-MCP-DOCKERFILE-ENTRYPOINT-KNOWNHOSTS-REGRESSION
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, mode=verify-committed, `qa[]` row, `branch:null`). Commit `8884569a0` confirmed on main ancestry; `git show --stat` matches all 4 claimed files (Dockerfile +12L wiring trio, entrypoint.sh rewritten non-fatal, new 210L regression test, sshExec.ts +9L comment-only, flag left `accept-new`).
**what-considered:**
- Re-ran row's own regression test myself: 11/11 PASS (static wiring + source-guard + live `sh`-subprocess behavioral checks against fake ssh-keyscan). `tsc --noEmit` clean, `mock-guard.sh` PASS, DDD/security greps clean.
- Full `bun test` run twice: 66 then 52 fail on unchanged tree (dev's own baseline 41) — flake signature (count itself moves), zero grep hits for entrypoint/sshExec/KNOWNHOSTS/Dockerfile in either log.
- Went beyond dev's own verification ceiling: this environment DOES reach the VPS (`nc -zv` succeeds, unlike dev's sandbox). Read `docker logs` of the actually-running mcp-server container (image built today, post-fix) — known_hosts seeded cleanly across several real restarts, zero WARN. Then `docker exec`'d in and ran `ssh -o StrictHostKeyChecking=yes -i /run/secrets/vps_ssh_key root@VPS echo ...` directly against the seeded known_hosts — SUCCEEDED. This live-proves the acceptance clause "StrictHostKeyChecking=yes SSH succeeds" as a mechanism, satisfying the PO ruling's gating condition for the deferred `accept-new`→`yes` code revert (scope item 2) — did NOT flip sshExec.ts myself (`not_my_job`: production code is dev's), flagged as an unblocked follow-up in status_note; `send_telegram(work)` attempted but unavailable — no gateway/MCP tool grant this sub-session.
**why-decision:** APPROVED, DONE_VERIFIED. Scope items 1+3 fully verified on committed code/tests/live behavior; item 2 is a real but separate out-of-scope-for-this-commit follow-up, now unblocked by today's evidence — not held against this row.
**why-change:** none — verified exactly what the row scoped, plus supplementary live proof beyond what dev's environment permitted.

### STEP qa-S41 · qa · 2026-08-06T19:10:00Z
**task-id:** FIX-PREDCLAIM-DASHBOARD-HITRATE-HONESTY
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`). Commits `509188b48`+`5f81c1e51` confirmed on main ancestry; `git show --stat` matches the claimed 3 files (route, test, api-reference.md) exactly.
**what-considered:**
- Re-ran the touched test file myself: 92/92 pass (matches review_note count exactly). `tsc --noEmit` clean. `eslint` on the route file: 0 errors. `mock-guard.sh --files` PASS. No hardcoded dates/numbers found — `STALE_THRESHOLD_DAYS=14` is a duration constant, staleness date is derived via `computeLastScoredAt`/`describeStaleness`. `formatHitRate(null)` still renders "Chưa có" (line 300-303), never recomputes hitRate client-side (calibration echoed verbatim).
- Checked `related[]` for a real dependency on the concurrently-verified `FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT`: row's own note states "Deliberately INDEPENDENT ... can ship immediately without waiting" — confirmed in code: `resolveExclusionReason` treats `exclusionReason` as fully optional with a generic fallback, no crash/degradation either way. No blocking dependency.
- Live-probed the running stack myself (not trusted from review_note): `curl :3001/dashboard/prediction-claims` — confirms the self-report's own "PENDING-REBUILD" admission (frontend container image built 2026-07-24, predates this fix's 2026-07-25 commit; new denominator/breakdown/staleness strings absent from served HTML). Per `PUSH-AUTONOMY-1` §5, the single-service rebuild + REAL-DATA verify is a separate ops-owned/PO-minted `VERIFY-<id>-REALDATA` gate, not a QA merge-gate blocker — code+tests are what QA verifies here.
**why-decision:** APPROVED, DONE_VERIFIED. All 5 deliverables (a-e) independently confirmed in code and tests; acceptance criteria (denominator/staleness/breakdown non-hardcoded, hitRate=null contract preserved, no client recomputation) hold under re-run, not just prose.
**why-change:** none — verified exactly what the row scoped. Flagging the stale-container gap in status_note for ops/PO visibility, not blocking this row on it.

### STEP qa-S42 · qa · 2026-08-06T19:30:00Z
**task-id:** FIX-COVERAGE-SWEEP-BLANKET-STAMP-DEAD-TRIGGER
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`). Row carries its own PO-authored QA CLOSE-GATE (G1/G2/G3) explicitly forbidding approval on script tests alone — re-ran the gate live rather than the developer's 2026-07-25 self-report.
**what-considered:**
- G1 (Bash grant landed): HOLDS — `grep tools:` both news-scout.md/market-watcher.md = Bash-inclusive; flow-doc caveat also already repaired (FIX-COWORK-FLOWDOC-STALE-TRANSPORT-GAP-CAVEAT, 08-01).
- G2 (live invocation): FAILS — `docs/data/coverage-state.json` byte-identical to the exact 2026-07-25T16:14:39Z frozen state PO measured 12 days ago; 1 distinct stamp group both fields, same 58ins/58del uncommitted diff still sitting untouched. market-watcher's own notebook admits live write-skips TODAY (`coverage-write-skipped:mutex-ttl`, 08-06) and yesterday; news-scout's notebook claims success each cycle but the artifact contradicts it (possible confabulation).
- G3 (sweep_config self-heal): FAILS — `has("sweep_config")`=false, unchanged since 07-25.
- Re-ran `coverage-stamp.test.sh` myself: 29/29 PASS — confirms script quality is real; not the question. Confirmed commit `f824befee` on main ancestry, touches claimed files.
**why-decision:** CHANGES_REQUESTED. Artifact (script+tests+flow-doc rewiring) is genuine; the row's own acceptance bar (G2/G3, operational proof) is unmet live. This is a runtime/mutex-ttl + notebook-corroboration gap, not a design defect. Bounced qa[]→review[], routed to row's own owner (po) per flow's `verify-committed-changes` (no branch, no fixer target), redispatch_count 0→1.
**why-change:** none — followed the row's own embedded close-gate exactly.

### STEP qa-S43 · qa · 2026-08-06T17:10:00Z
**task-id:** FIX-FB-GATE-CHECKD2-NONWAIVABLE-NUMERIC-BLOCK
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`). Diff-verified commits `1b506cbdd`+`7b87ac372` on main ancestry, touch exactly the claimed files. Re-ran the developer's own regression harness (`scripts/test-fb-gate-checkd2-nonwaivable.sh`) against live HEAD instead of trusting the "GREEN 10/10" prose.
**what-considered:**
- Result: 8/10 pass, 2 FAIL — (3b)/(3c) grep `docs/agents/fb-market-poster/flow/main.md` for `NON-WAIVABLE`/`Check-D2 fix protocol`/Check-C waive sentence, not found.
- Root-caused via `git log` on main.md: a LATER unrelated commit `8d165e8d6` (TE-T26, 2026-08-06) split main.md (994L→88L thin dispatcher), relocating this task's entire STEP 4b block into new `docs/agents/fb-market-poster/flow/daily.md:640-641,677-678` — grep-confirmed content present there verbatim; weekly-recap.md/weekly-prediction.md cross-refs already correctly repointed to `daily.md` by that same split. Not a substance regression — a test-script path drift (harness hardcodes the pre-split `main.md` location).
- Assertions (1)/(2) (live-fixture Check-D2 BLOCK proof + no-regression PASS contrast) and (3a)/(3d) still hold; sibling `test-fb-gate-checkc-negation.sh` unaffected (6/6). `docs/social/fb-post-2026-07-25.md` confirmed untouched (0 diff).
**why-decision:** CHANGES_REQUESTED. Per verify-committed's own mechanical rule ("any failing check → vc-changes"), a currently-RED regression proof for this exact task blocks done_verified even though root cause is a foreign later commit, not this developer's work. Bounced qa[]→review[], routed to row's own owner (developer, `updated_by` fallback — no `.owner` field existed) per flow's `verify-committed-changes` (no branch, no fixer target), redispatch_count 0→1.
**why-change:** none — followed flow spec exactly; flagged root cause precisely so developer's follow-up is a 2-line path fix, not a re-investigation.

### STEP qa-S44 · qa · 2026-08-06T17:17:35Z
**task-id:** FIX-PREDCLAIM-CREATIONPRICE-UNGATE-ZOD-CONTRACT
**what-done:** Direct-commit verify (`qa[]` row, `branch:null`). Commit `6feec3ab1` on main ancestry, `git show --stat` matches all 4 named production files + docs. Read the full diff, not review_note prose: evidenceTools.ts price lookup unconditional (direction/pct now gate only target_price); predictionClaimStore.ts `.strict()` Zod door requires creation_price finite (throws + fire-and-forget telegram); intelligenceCycleJob.ts chain-synthesizer sibling fixed; predictionClaimsHandler.ts false "legacy" framing corrected.
**what-considered:**
- Deliverable (c): grepped repo — `insertPredictionClaim` is the ONLY INSERT site into `prediction_claims`; read resolveClaim/excludeClaim/markClaimUnresolvable SQL directly — none touch stock/direction/creation_price/resolution_date/confidence, holds structurally.
- tsc clean; targeted 6-file suite 96/96 pass; full suite 15139 pass/40 skip/53 fail/1 error (well inside board's own >=9408/<=348 floor); DDD clean (zero domain→infra imports); security clean (no process.env, parameterized SQL); mock-guard PASS.
- Row's own AC-1 demands LIVE served-endpoint proof, flagged "PENDING-REBUILD ... not authorized this session." Did NOT trust that at face value: `docker inspect` shows container created 2026-08-06T08:41:16Z, ~12 DAYS AFTER this fix's commit (2026-07-25T12:06:06Z UTC); `docker exec` cat of the running container's predictionClaimStore.ts diffed BYTE-IDENTICAL to git HEAD. `curl :3000/api/prediction-claims` (live, not host-CLI): 30 claims now (was 17); ids 18-30 (13 consecutive claims, 2026-07-25 through 2026-08-01, spanning the fix's own commit day onward) ALL carry non-null creationPrice — full reversal of the pre-fix 0%-scoreable run; pre-fix NULL rows (ids 1,8,9,10,11,12) still serve correctly as excluded (read-path grandfather intact, zero dropped rows).
**why-decision:** APPROVED, DONE_VERIFIED. The row's own literal AC-1 (live-endpoint proof) is SATISFIED, not deferred — the "PENDING-REBUILD" self-report was stale (container rebuilt for unrelated reasons after this fix landed) and the rebuild-authorization framing itself is retired policy (`feedback_po_deploy_rebuild_full_autonomy_no_user_gate`).
**why-change:** none on code; corrected the row's stale PENDING-REBUILD/user-gated framing in the QA note rather than propagating it.

### STEP qa-S45 · qa · 2026-08-06T19:35:00Z
**task-id:** FACTORY-TECHANALYSIS-delete-orphaned-ts-service
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`). Commit `099afddd3` confirmed on main ancestry (`git merge-base --is-ancestor`); `git show --stat` matches all 5 claimed `files[]` (index.ts, domain/services.ts, application/usecases.ts, infrastructure/calculator.ts, interface/handlers.ts), plus 3 more deleted siblings + doc/openapi/dtos.go touch-ups.
**what-considered:**
- Did not trust review_note prose: independently reran the row's own `dod`. `grep -rn "technical-analysis/src"` repo-wide → zero live import hits, only historical archive JSON (backlog-detail/orch-state/2026-07.json prose, not code). `src/`+`tsconfig.json` confirmed gone from `apps/technical-analysis/`; `package.json` now carries only `build:dashboard` script, zero `hono` dep (grep clean, only unrelated "honoured" comment string matches).
- `go build ./cmd/server/...` + `go vet ./...` both clean (empty output = pass); `go test ./...` 12/12 packages ok — exact match to claimed "12/12 GREEN". `mock-guard.sh --files` on all 5 claimed (now-deleted) paths → PASS ("no production source files to scan", correct for a deletion).
- Dockerfile confirmed untouched (still `COPY cmd/ pkg/ api/` only, no src/); docker-compose.yml `technical-analysis:` service block references Dockerfile context only, no src path. Follow-up commit `448b41b0a` (unrelated dead-code-gate CI task, same day) independently corroborates clean state post-deletion (further-trimmed devDeps, its own go build/vet/test green).
- No dashboard/`__tests__` orphans found (`find apps/technical-analysis -iname "__tests__" -o -iname "*.test.ts"` → empty).
**why-decision:** APPROVED, DONE_VERIFIED. Every DoD clause independently re-derived from live repo state (grep/build/vet/test), not the developer's self-report — deletion is genuinely complete and clean, deployed Go path unchanged and green.
**why-change:** none — verified exactly what the row scoped.

### STEP qa-S46 · qa · 2026-08-06T17:39:47Z
**task-id:** FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`). Commit `d0fe0f4fb` confirmed on main ancestry; `git show --stat` matches all touched files (tran-ngoc-bau/flow/main.md, cowork-team/flow/spawn-fanout.md, cowork-schedule.json, tools/package/tran-ngoc-bau.md, dwf-ops-runbook.md).
**what-considered:**
- AC(1)-(3) re-read live in-file, not from review_note: Step G derives `WORK_DATE` via `TZ="Asia/Ho_Chi_Minh" date +%Y-%m-%d`, keys `published:tnb-audit:<date>` ttl 100800; spawn-fanout.md "Weekly slots" now lists digest-sunday only; the key-period==cron-period invariant is written in both files' comment blocks + the runbook.
- AC(4) — did not trust the row's own "NOT verifiable this session" self-report or a single-day check; grepped for concrete post-fix evidence across FOUR separate cycles: `docs/signals/processed/cowork-team-2026-07-30T20:28:58Z.json` shows `published:tnb-audit:2026-07-31` live with a routine same-day mutex loss (normal, not the blackout pattern); committed `docs/handoffs/tnb-audit-latest.md` c121 (2026-07-31T20:23Z) states `published:tnb-audit:2026-08-01 -> claimed:true ... confirmed still holding correctly`; `tran-ngoc-bau` notebook c122 (~2026-08-04) shows `claimed:true` on `published:tnb-audit:2026-08-05` with a full audit executed 6 days post-fix. Zero GATE-BLOCKED/`claimed:false`/"already published" hits for tnb-audit anywhere post-fix, versus 3 confirmed GATE-BLOCKED cycles (c116-c118) pre-fix under the old weekly key — predicted blackout does not recur.
- AC(5): diff contains no release/immunity changes, UC-CCA-P3 territory untouched — confirmed via diff read.
- Zero `.ts`/production source touched (docs/config only) — `bun test`/`tsc --noEmit`/DDD/mock-guard structurally N/A per verify-committed's own "targeted zone suite" clause. Ran the actually-relevant targeted suites instead: `cowork-schedule-consistency.test.js` 9/9 PASS, `cowork-catchup-predicate.test.js` 34/34 PASS (confirms `publish_date_basis:"vn_date"` is a pre-existing recognized basis, not a new unsupported value). `jq empty` on both touched JSON files: valid.
- DJ-GATE-1: confirmed `sprint-COWORK-GUARANTEED-SLOT-CATCHUP-agent-father.md` STEP agent-father-S2 already carries `task-id: FIX-CADENCE-TNB-AUDIT-WEEKLY-MARKER-BLOCKS-DAILY-CRON`.
**why-decision:** APPROVED, DONE_VERIFIED. All 5 ACs independently re-derived from live repo state + multi-cycle production evidence spanning 07-30 through 08-05, not the implementer's self-report. Moved `task_board.qa[]` -> `task_board.done_verified[]` via `jq`+`scripts/orch-apply.sh` (conservation OK, task_total 791->791). `next_agent: pm`.
**why-change:** none — verified exactly what the row scoped; AC(4) evidence exceeds the original single-day ask (4 cycles, not 1).

### STEP qa-S46 · qa · 2026-08-06T17:40:02Z
**task-id:** FIX-DEPSSATISFIED-COLD-ARCHIVED-DEP-RESOLVES-MISSING
**what-done:** Direct-commit verify (dev-team Review-Lane QA-Drain, `qa[]` row, `branch:null`). Commit `0a56c46ae` confirmed on main ancestry; `git show --stat` matches all claimed files (devteam-eligibility.jq, new archive-glob-cat.sh, orch-cold-evict.sh, 3 promote/claim jq callers, dispatch-gate-satisfiability.sh + 2 sibling verify scripts, 3 docs).
**what-considered:**
- Read the real diff, not review_note: `dep_status_map($archive)` seeds from `archive_status_map($archive)` (DONE_VERIFIED-only normalize, else pass through raw) then hot lanes overwrite — 0-arg proxy = zero behavior change. `orch-cold-evict.sh` referential guard is a genuine `select()` filter on `$referenced_dep_ids`, applied to done/done_verified/flat-lane terminal candidates alike, not a report-only annotation.
- Independently re-ran `devteam-dispatch-gate-satisfiability.sh` live: all 7 of this task's own new assertions (AC-DEP-1/MECH/NEG-A/NEG-B, AC-EVICT-1/2/3) PASS. 2 sibling gate-verify scripts (prose-sequencing, detail-disposition) exit 0 GREEN.
- Found 1 unrelated PRE-EXISTING fail in the same instrument ("BOUNDED-1 no-ops when in_progress>=1") + `bounded1-supervised-lane-report.sh` (4 unresolved-lane rows) — root-caused to live-board drift since 07-28 (2 stale bounded1-promoted-but-unclaimed `ready[]` rows + 4 genuinely unrouted backlog rows), in files this commit's diff-stat never touched. Not this row's defect; flagged to bug channel, not blocking.
- `apps/mcp-server/` untouched (confirmed) — bun test/tsc correctly N/A, matches claim.
**why-decision:** APPROVED, DONE_VERIFIED. Every AC this row's own acceptance criteria states (zero live leaks, both negative controls, mechanism-fires proof, eviction-guard refusal proven both directions) independently reproduced live, not trusted from prose.
**why-change:** none — verified exactly what the row scoped; unrelated drift reported separately.

### STEP qa-S46 · qa · 2026-08-06T18:10:00Z
**task-id:** FIX-PDFEXTRACTOR-TIER1-OCR-TIMEOUT
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`) — executing PO's 2026-07-22T15:55:33Z disposition (routes this row's OWN ACs to qa for done_verified, decoupled from the separately-tracked `PERF-PEK-PER-PAGE-LATENCY` HPG reflow gap). `dev_commit ad26f2f95` + `qa_commit 568e3b404` both confirmed real and on main ancestry; `git show --stat` matches all 5 named files exactly.
**what-considered:**
- Did not trust the prior qa_note/po_disposition prose alone — read the full diffs of both touched production files. AC1 (fail-loud): `triggerPushBctcExtraction()` now returns discriminated `PushBctcExtractionOutcome` (`done|async_routed|failed`); all-tiers-exhausted, `runPipeline()`-null, and `runPipeline()`-throw all now return `{outcome:"failed"}` — the old silent-swallow-to-implicit-success paths are gone. `applyPushBctcExtractionOutcome()` in `bctcVpsIngestHandler.ts` switches on it: `failed` marks `bctc_vps_queue` status='failed' (retryable, NEVER 'done') + fires `sendTelegramBug` (non-fatal if the notify itself throws).
- AC2 (large-PDF path): confidence pre-gate (reuses EXISTING `extractPdfText()`/`PDF_CONFIDENCE_HIGH_THRESHOLD` classifier, no new constant/byte-cutoff) ahead of Tier1; `confidence<1.0` routes `ensureShellRow → overwritePdfPathUnconditional` (MUST-FIX Risk1 — verified genuinely no `IS NULL` guard, so `/pek-extract` can't fire against a stale path) `→ triggerPekExtraction`; `confidence===1.0` keeps the unchanged sync Tier1→2→3 gauntlet.
- Re-ran independently, not trusted from either the dev's or the prior QA's own report: `bun test` on the 3 touched test files = 29/29 pass, 0 fail (matches dev's own count exactly); `bun tsc --noEmit` 0 errors; DDD scan clean (both touched files are interface/scheduler layer, not `domain/` — infra imports there are architecturally correct); security scan clean (zero `process.env`, zero hardcoded secrets); `mock-guard.sh --files` PASS on both production files. Test suite itself is substantive (13 dedicated tests, real in-memory `bctc_vps_queue`+`financial_reports` DB, covers fail-loud/async-route/MUST-FIX-overwrite/queue-transition/sendBug-non-blocking — not shallow assertions).
- Confirmed current `main` HEAD (2026-08-06) still carries this exact logic unreverted (grepped `PushBctcExtractionOutcome`/`routeToAsyncPekExtraction`/`applyPushBctcExtractionOutcome` all present); `mcp-server` container currently Up healthy (rebuilt many times since 2026-07-13, none reverted this fix).
**why-decision:** APPROVED, DONE_VERIFIED. Both parts of this row's own two-part AC are genuinely implemented (not just claimed) and covered by a real, substantive test suite that passes on independent re-run; tsc/DDD/security/mock-guard all clean; code unreverted on main and running in the deployed container.
**why-change:** none on code — scope is this row's OWN ACs only per the PO disposition's explicit decoupling; the HPG Q4-2025 reflow gap stays correctly tracked under `PERF-PEK-PER-PAGE-LATENCY`, not re-litigated here.

### STEP qa-S50 · qa · 2026-08-06T17:41:19Z
**task-id:** FIX-NOTEBOOK-PRUNER-LINE-ONLY-SETPOINT-BYTE-CAP-NEVER-CONVERGES
**what-done:** Direct-commit verify (Review-Lane QA-Drain, `qa[]` row, `branch:null`). Derived commit b42f3fa3a via git log on files[] (no explicit `.commit` field on row) — confirmed on main ancestry, diff matches primary claimed file notebook-auto-prune.sh + ships the new test file AC-5 required.
**what-considered:**
- Re-ran on CURRENT HEAD, not the original commit alone — 6 later commits touched the same script for other tasks. notebook-auto-prune.test.sh 8/8 PASS (T1-T4 = row's AC1-4 verbatim); context-bloat-backstop.test.sh 5/5 PASS unaffected.
- Live production corroboration: 17/18 originally over-cap notebooks converged unattended by 2026-08-06; the 1 holdout (digest-predict.md) hits the documented single-section safe-fail path exactly as spec'd — not a defect.
- po_regression_flag_20260728 (wrong-section dropped) is real but a SEPARATE defect, already fixed by later commit c280e00cd (own row, still REVIEW) — does not regress or block this row.
- Discovered incidental regression: legacy test-notebook-auto-prune.sh Test 9 now crashes under zsh, caused by a LATER unrelated commit (7552421bc, lib extraction) — confirmed production-safe (hook always invoked via explicit bash per .claude/settings.local.json:62); flagged to bug channel, not this row's scope.
**why-decision:** APPROVED, DONE_VERIFIED. This row's own 6 ACs independently hold on current main HEAD; the two adjacent issues surfaced during verification belong to other, already-separately-tracked rows.
**why-change:** none — verified exactly what the row scoped.
