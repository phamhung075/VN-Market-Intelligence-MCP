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
