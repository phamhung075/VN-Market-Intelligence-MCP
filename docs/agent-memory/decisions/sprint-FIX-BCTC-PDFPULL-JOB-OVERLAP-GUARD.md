# Decision Journal — FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD · dev-mcp-server

**Note:** no wrapping "sprint" board entry exists for this task (it is a standalone
FIX/S dispatched directly off `parent_task: SPIKE-BCTC-DISCOVER-PIPELINE-DEAD`,
not a multi-unit sprint) — this is an ad-hoc single-task decision journal, filed
under the `sprint-*` naming convention per DJ-GATE-1 fallback rule.

**Task goal:** Add a module-level re-entrancy (`_isRunning`) guard to
`bctcPdfPullJob.ts` so overlapping 30-min cron invocations no longer
re-SELECT and redundantly re-process the same `bctc_vps_queue` rows
(confirmed live: HCM PDF re-saved 4x, NKG 3x in <1 min; 05:30 run took 69.9
min against a 30-min cron interval).
**Agent:** dev-mcp-server
**Started:** 2026-07-03T15:37Z (dev-team tick dispatch)

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-03

**task-id:** FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD

**what-done:**
- Added module-level `let _isRunning = false;` guard to
  `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts`.
- `runBctcPdfPullJob()` now early-returns
  `{ itemsProcessed: 0, downloaded: 0, failed: 0, deferred: 0, enrichFailed: 0,
  skippedReason: 'already_running' }` when re-entered while a prior
  invocation is still in-flight — no DB query is even issued on the skip
  path.
- The entire pre-existing body (including all its internal early returns —
  empty-queue no-op, DB-query-failure no-op) is now wrapped in
  `try { ... } finally { _isRunning = false; }` so the flag is always
  cleared, even if the body throws.
- Added `skippedReason?: "already_running"` to the `BctcPdfPullResult`
  interface — purely additive, does not change any existing field; the sole
  caller (`startScheduler.ts:361`, `{ rowsWritten: result.downloaded }`) is
  unaffected since `downloaded` stays `0` on the skip path regardless.
- New scoped test file
  `apps/mcp-server/src/__tests__/FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.test.ts`
  (3 tests): (a) a second concurrent invocation while the first is blocked
  mid-`fetchPdf` early-returns `already_running` and never issues its own
  fetch or mutates the queue row; (b) the guard clears after a normal
  completion so the next invocation runs unblocked; (c) the guard clears
  even when the body throws (forced via a `db.prepare` that always throws),
  proven by a clean follow-up invocation succeeding afterward.

**what-considered:**
1. Mirror `runBreadthHistoryPersisterJob` (`breadthHistoryPersisterJob.ts`) —
   single function, guard check at top, `_isRunning = true`, entire body in
   `try { ... } finally { _isRunning = false; }`, early-return carries a
   `skipped_reason`-style field.
2. Mirror `weatherCheckJob.ts` — same shape but plain `logger.warn` + bare
   `return;` (function returns `void`, no result object to annotate).
3. (Rejected, self-authored deviation, reverted) Split the guard into an
   outer `runBctcPdfPullJob` wrapper delegating to a new
   `runBctcPdfPullJobInner` helper, to avoid re-indenting the ~300-line
   existing body.

**why-decision:** Chose (1) — `breadthHistoryPersisterJob`'s shape — verbatim,
single function, because `bctcPdfPullJob` already returns a structured
result object (`BctcPdfPullResult`) like `BreadthPersisterResult` does (not
`void` like `weatherCheckJob`), so the `skipped_reason`-carrying early-return
convention transfers directly and callers get an observable, typed signal
for the skip case instead of a bare early `return;`. Naming choice
`skippedReason` (camelCase) matches the existing camelCase convention of
every other field on `BctcPdfPullResult` (`itemsProcessed`, `downloaded`,
`failed`, `deferred`, `enrichFailed`) rather than copying
`breadthHistoryPersisterJob`'s snake_case `skipped_reason` literally — the
dispatch note said "mirror the cleanest-matching shape", not "mirror the
field-naming convention of a sibling file with a different local style".

Rejected (3) mid-implementation: the task instructions explicitly require
mirroring the existing pattern **verbatim** (guard check + `_isRunning =
true` + a single `try { <entire original body> } finally { _isRunning =
false; }` inside the SAME function) — introducing a second function purely
to dodge re-indentation is an unrequested structural change to a file this
sprint is not scoped to refactor. Reverted to the single-function form and
manually re-indented the moved body (`awk` one-liner, +2-space indent for
the wrapped range, verified via diff before applying) to keep the change a
pure, minimal, verbatim mirror.

**why-change:** No deviation from the architecture brief's recommended fix
(`docs/architecture-briefs/2026-07-03-bctc-discover-pipeline-dead.md` §
"Recommended Fix") — implemented item 1 only (the guard); item 2
("hardening, low-risk... consider capping DEFAULT_BATCH_SIZE") was
explicitly marked secondary/not-required and is out of scope for this
FIX/S ticket.

**bug found during implementation (self-authored, caught before commit):**
the guard's doc comment initially quoted the cron interval as `` `*/30` ``
inside a JSDoc block — the literal `*/` inside the backticks prematurely
closed the JSDoc comment, corrupting the rest of the file into a cascade of
~130 unrelated-looking TS parse errors (`tsc --noEmit` flagged it
immediately). Fixed by rewording to "30-min cron" (no literal `*/` inside
any comment). Same latent typo was also present in the new test file's
header comment and was fixed identically. Lesson: never write a literal
`*/N` cron-shorthand inside a `/** ... */` block comment — write it in
prose ("N-min cron") or inside a single-line `//` comment instead.

**verification:**
- `bun tsc --noEmit` (apps/mcp-server): clean, 0 errors.
- New test file alone: 3 pass / 0 fail.
- New test file + all 9 pre-existing bctcPdfPullJob-adjacent test files
  (`bctc-pdf-pull-job.test.ts`, `FIX-BCTC-VPS-QUEUE-SYNC.test.ts`,
  `FIX-BCTC-ENRICH-SILENT-0ROWS.test.ts`, `1352a-async-extraction-race.test.ts`,
  `B3-space-urls-fix.test.ts`, `hotfix-bctc-integrity.test.ts`,
  `1953c-batch-sweep-registration-audit.test.ts`, `FIX-CTG-3-STEP-C.test.ts`,
  `1945d-reparse-pipeline-gap.test.ts`) run together in one `bun test`
  invocation: 104 pass / 0 fail / 336 expect() calls — no regression, no
  order-dependence surfaced.
