# Decision Journal — Sprint CI-RED-1a8c1bff-FIX · qa

**Sprint goal:** Gate CI-RED fix — confirm the 3 test-literal/assertion updates are sound root-cause fixes (not blind-patched, not a rationalized coverage weakening), esp. the 1352a race-condition assertion, before merge sign-off.
**Agent:** qa
**Started:** 2026-07-10T20:45:00Z

---

### STEP qa-S1 · qa · 2026-07-10T20:50:00Z
**task-id:** CI-RED-1a8c1bff-FIX
**what-done:** Scrutinized item 3 (1352a done→pek_triggered): read `bctcPdfPullJob.ts` full source — `updatePekTriggered.run()` still fires strictly after `await deps.triggerExtraction(...)`, so A-1's mid-flight `statusDuringExtraction==="pending"` assertion (unchanged by the diff) still fails if the await were dropped — race guard is genuinely live, not a no-op. Read `bctc-extract-reconcile-job.test.ts` in full: counted exactly 14 `it()` cases covering pek_triggered→done (3 independent per-table paths + quarantine-exclusion) and →enrich_failed (exhausted-attempts, unresolved report_id, sendBugFn-throws-non-fatal) — matches the commit's "14 cases" claim verbatim, and this file was independently QA-approved already (own prior cycle-431, D3C). Re-ran all 4 files fresh myself: 53 pass/0 fail (39 touched + 14 reconcile, matches claim exactly). `tsc --noEmit` clean. Confirmed commit 43f4c8a22 adds exactly ONE `bctcExtractReconcileJob` registration to `schedulerJobTable.ts` (grep count 2 = 1 import + 1 table entry, no duplicate) — justifies all 3 count bumps (64→65, 57→58, 79→80).
**what-considered:**
- Full DDD/security scan on the 3 touched files anyway (Smart-Skip would allow skip, test-only diff) — ran it: only pre-existing test-layer imports from `../infrastructure/*`/`../application/*` (legal for `__tests__`, not domain code), zero `process.env` outside test cleanup, zero secrets, mock-guard PASS (0 production files in diff).
- Trust router's RAW-verify of CI-green/commit-provenance without re-deriving — ACCEPTED, router already confirmed run 29122457852 green on pushed headSha differing from failing SHA; re-deriving via `gh` adds no new signal QA is positioned to add.
**why-decision:** The one item requiring genuine scrutiny (item 3, a race-regression test's assertion change) is proven sound by direct code read, not narrative trust: the awaited-before-write invariant this test exists to guard is untouched, only the terminal-state label changed to match an already-shipped, already-QA-approved status model (D3B/D3C, own prior cycles 430/431). No coverage was silently dropped — reconcile-to-done is independently covered elsewhere, verified by line count not by trusting the commit message.
**why-change:** no change from plan.
