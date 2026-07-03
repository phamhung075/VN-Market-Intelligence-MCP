# Task Report: FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD

date: 2026-07-03
dev commit: 8bc0b5b5 (dev-mcp-server)
outcome: APPROVED

## Scope verification

`git show --stat 8bc0b5b5` = exactly 3 files, matches dispatch scope exactly:
- `apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts`
- `apps/mcp-server/src/__tests__/FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.test.ts` (new, 3 tests)
- `docs/agent-memory/decisions/sprint-FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.md` (DJ-GATE-1)

No extra files, no orch-state/board touch in the dev commit, 0 UUID leak.

## Diff inspection

Full diff read line-by-line (not trusted from stat alone): the 619-line
`bctcPdfPullJob.ts` diff is a mechanical re-indent of the pre-existing
function body wrapped in `try { ...original body... } finally { _isRunning =
false; }` — no business logic altered. Additions: module-level
`let _isRunning = false;` (line 99), guard check + early-return before any
DB query (line 298), `_isRunning = true` (line 309), `finally` clear (line
632), additive `skippedReason?: "already_running"` field on
`BctcPdfPullResult`.

Cross-checked verbatim against `breadthHistoryPersisterJob.ts` (lines
49/70-77/135) — identical shape: module `let _isRunning`, guard-check +
early-return with zero counts before body, `_isRunning = true`, whole body
in `try{}finally{_isRunning=false}`. Claim of "mirrors runBreadthHistory-
PersisterJob verbatim" confirmed true.

Sole caller `startScheduler.ts:361` (`{ rowsWritten: result.downloaded }`)
greped as the ONLY call site of `runBctcPdfPullJob` in `src/` (excluding
tests) — reads only `.downloaded`, unaffected by the additive field.

## Test Results
- New test file alone (`FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.test.ts`): **3 pass / 0 fail / 25 expect() calls** (376ms)
  - (a) concurrent second invocation → `skippedReason: "already_running"`, zero counts, no fetch/DB mutation — PASS
  - (b) guard resets after completion, next tick runs normally — PASS
  - (c) guard resets even when the body throws (forced via a `db.prepare` that always throws; verified via clean follow-up invocation) — PASS
- 6 suites that directly import `bctcPdfPullJob.js` (`1352a-async-extraction-race.test.ts`, `B3-space-urls-fix.test.ts`, `FIX-BCTC-ENRICH-SILENT-0ROWS.test.ts`, `FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.test.ts`, `FIX-BCTC-VPS-QUEUE-SYNC.test.ts`, `bctc-pdf-pull-job.test.ts`) run together: **66 pass / 0 fail / 239 expect() calls** (4.08s)
- Full suite: **14236 pass / 42 skip / 62 fail / 5 errors / 44663 expect() calls** across 1169 files (627.33s), followed by the known Bun-1.3.13 C++ teardown panic (pre-existing, not caused by this change).
- TypeScript: `bun tsc --noEmit` → **0 errors** (exit 0)

## Regression check (changed-domain = 0)

`testBaselineFail` ceiling = 348 (`docs/data/project-stats.json`). 62 fail
(+5 unhandled-error timeouts) is well under ceiling. Every `(fail)` line and
every "Unhandled error between tests" block mapped to its source test file
(awk nearest-preceding-header) and grepped case-insensitively for
`bctc|pdfpull|financial-report` → **0 hits**. All 62 fails land in
pre-existing flaky suites: pollNews (Task 102/1288/1324/1345a, 5s timeouts),
VPS-proxy/logVpsPush (1113, 1858c, VPT-1), insider-transactions (1146),
foreign-flow (1518, TSU-DEV-U5), get_market_cap (RAPID-B2), get_company_profile,
search_similar_context (083), send_telegram (235), MCP-SSE registration (251),
energyTools estimate marker (DSI-S3), technical-indicators (`_deprecated/1302`).

One filename false-positive investigated directly:
`1405b-bctc-vps-fixes.test.ts` (has "bctc" in its name) — its 3 fails are all
in the "FIX 2 — logVpsPush" block (a `vps_push_log` DB race); the file does
not import `bctcPdfPullJob.js` (confirmed via the direct-importer grep
above). Not a regression.

The 5 "Unhandled error between tests" entries are all 5000ms timeouts inside
`pollNews()`/news-cascade tests (titleFingerprint dedup query, cascade
generation) — unrelated to bctc/scheduler.

**Changed-domain regression = 0.**

## DDD Compliance: PASS
`bctcPdfPullJob.ts` lives in `scheduler/` — the outermost layer per
`domain ← application ← interface ← scheduler` (`docs/ARCHITECTURE.md` L7).
Its imports (`getDb`, `logger` from `infrastructure/`) are architecturally
permitted for this layer, not a DDD violation. No new imports were added by
this diff (pre-existing imports unchanged).

## Security: PASS
- `grep -n "process\.env"` on the changed file → 0 hits (`Bun.env` only)
- `grep -in "password|secret|token"` on the changed file → 0 hits
- `bash scripts/audits/mock-guard.sh --files "apps/mcp-server/src/scheduler/financial-reports/bctcPdfPullJob.ts"` → `PASS — no fabricated-data patterns found in production source.` (exit 0)

## Re-entrancy correctness
Guard clears in `finally` even on throw — test (c) forces a throw via a
`db.prepare` stub that always throws (after the real DB genuinely finds the
pending row via `db.query`), confirms the row is untouched by the aborted
run, then confirms a clean follow-up invocation succeeds normally
(`skippedReason` undefined, `downloaded: 1`, row → `done`). This is a real
executed test, not a code-reading assumption.

## Verdict: APPROVED

DJ-GATE-1: `docs/agent-memory/decisions/sprint-FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.md`
carries `**task-id:** FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD` — gate satisfied.
QA's own gate note filed at
`docs/agent-memory/decisions/sprint-FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD-qa.md`.

No handoff `docs/handoffs/FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD.md` exists —
this is an ad-hoc FIX/S ticket dispatched directly off a SPIKE finding (not
a PM-decomposed sprint task), consistent with the 3 preceding ad-hoc
review-lane gates in this cycle window (no handoff doc precedent for that
class of task).

Board flip (review → done_verified) left to router per explicit dispatch
boundary — QA did not touch `orch-state.json` `.task_board`/`.head`.
