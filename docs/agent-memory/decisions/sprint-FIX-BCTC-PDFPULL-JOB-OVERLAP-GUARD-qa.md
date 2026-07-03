# Decision Journal — FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD · qa

**Note:** ad-hoc single-task FIX/S review-lane gate (parent_task:
SPIKE-BCTC-DISCOVER-PIPELINE-DEAD), no PM-decomposed multi-unit sprint —
filed under `sprint-*-qa` naming per DJ-GATE-1 fallback rule.

**Task goal:** Independently RAW-verify dev-mcp-server's module-level
`_isRunning` overlap guard added to `bctcPdfPullJob.ts` (commit 8bc0b5b5)
before router promotes review → done_verified.
**Agent:** qa
**Started:** 2026-07-03T18:30Z

---

### STEP qa-S1 · qa · 2026-07-03T18:30Z

**task-id:** FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD

**what-done:** Full independent DoD gate on commit 8bc0b5b5.

**what-considered:**
- only path: all 6 DoD checks green, no arch concern → APPROVED.

**why-decision:** `git show --stat` scoped to exactly the 3 claimed files
(bctcPdfPullJob.ts + new test + dev's decision journal), 0 UUID leak. Read
the full diff line-by-line: it is a mechanical try/finally re-indent wrap of
the pre-existing body (no logic altered) plus the guard check + additive
`skippedReason` field — confirmed byte-identical shape against
`breadthHistoryPersisterJob.ts` (`let _isRunning=false` module scope,
early-return before any DB query, `finally{_isRunning=false}`). `bun tsc
--noEmit`: 0 errors. New test alone: 3 pass/0 fail/25 expect (test (c)'s
throw-path genuinely re-ran in real output). 6 suites that actually import
`bctcPdfPullJob.js` (1352a-async-extraction-race, B3-space-urls-fix,
FIX-BCTC-ENRICH-SILENT-0ROWS, FIX-BCTC-PDFPULL-JOB-OVERLAP-GUARD,
FIX-BCTC-VPS-QUEUE-SYNC, bctc-pdf-pull-job) together: 66 pass/0 fail/239
expect. Full suite: 14236 pass/42 skip/62 fail/5 errors/44663 expect, 1169
files, 627.33s, then the known Bun-1.3.13 C++ teardown panic — ceiling=348
(docs/data/project-stats.json), 62<<348. All 62 `(fail)` lines + all 5
unhandled-errors mapped to source file and grepped for
bctc/pdfpull/financial-report keywords → 0 hits; one filename
false-positive (`1405b-bctc-vps-fixes.test.ts`) inspected directly — its 3
fails are a pre-existing `vps_push_log` DB race, file does not import
`bctcPdfPullJob.js`. Zero changed-domain regressions. DDD: file lives in
`scheduler/` (outermost layer per `domain←application←interface←scheduler`,
ARCHITECTURE.md L7) — its infrastructure imports (getDb/logger/withDeadline)
are architecturally permitted, not a violation. Security: 0 `process.env`,
0 hardcoded secrets, mock-guard exit 0 PASS. Sole caller
`startScheduler.ts:361` reads only `.downloaded` — unaffected by the
additive `skippedReason` field (grep-confirmed, only call site in src/).

**why-change:** no change from plan — routine pass, all gates green.
