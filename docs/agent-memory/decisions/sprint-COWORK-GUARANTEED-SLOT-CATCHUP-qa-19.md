# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · qa

**Sprint goal:** Make cowork `guaranteed:true` an honored contract — bounded catch-up firing for elapsed guaranteed slots, or a structured (non-silent) miss.
**Agent:** qa
**Started:** 2026-08-12T17:32:00Z

---

### STEP qa-S95 · qa · 2026-08-12T17:32:00Z
**task-id:** FIX-BCTC-D3C-FOLLOW-UP-RESET-ATTEMPTS
**what-done:** Direct-Commit Verify (dev-team Review-Lane QA-Drain, `branch:null`, no `.commit` field — derived via `git log -- <2 files named in row's own review_note prose>`). Found commit `e9caf2ac3` (2026-07-29T10:58:53Z, ~42min after row's `promoted_at`), on main ancestry, `git show --stat` matches all 5 files the review_note claims exactly (2 job files + 3 test files, incl. the 3rd-file fixture-regression fix it self-disclosed).
**what-considered:**
- Read both diff hunks directly, not trusted from prose: `bctcPdfPullJob.ts` UPDATE now unconditionally sets `reconcile_attempts = 0` on every `pek_triggered` write; `bctcQueueEnricherJob.ts` Arm-2 recycle UPDATE now also sets `attempts = 0` — exact match to the row's title/detail.
- Confirmed `reconcile_attempts` pre-exists in real prod schema (`schema-financial-reports.ts:305-307`, ALTER-guarded) — "no schema migration" claim holds, not just true in the test fixture.
- Re-ran real tests, not trusted from prose: exact 3 touched test files 44/44 pass (incl. the new regression test asserting `reconcile_attempts` resets from a seeded stale 8→0). Widened to all 20 files that actually call `runBctcQueueEnricherJob`/`runBctcPdfPullJob` (superset of claimed "7-file suite") — 196/196 pass, zero regressions on any consumer of the shared UPDATE statements. `tsc --noEmit` clean. `mock-guard.sh --files` PASS on both production files.
- DDD/security greps on the 2 files: infra/application imports present but pre-existing (scheduler layer, file's own doc-comment declares "imports from infrastructure only" — not new from this diff); zero `process.env`/secret hits.
- Did NOT reproduce the claimed full 14906-test/54-fail run — cross-checked plausibility instead via `docs/policies/dev-standards.md`'s CANONICAL `FIX-MCP-SUITE-HEALTH-BASELINE` note (standing order-dependent full-suite red, drifted 40→42 at last doc update; claim's 54 is in the same drifting-red family, not a fabricated number) + my own targeted/widened re-run already proving zero net-new failures on the touched surface.
**why-decision:** vc-approved, DONE_VERIFIED. Zero ISSUE — commit real, all 5 files match, logic matches title/detail verbatim, tests independently re-run (both exact-touched and widened-consumer sets) all green, tsc/mock-guard/DDD/security clean, schema claim verified against real (non-fixture) schema file.
**why-change:** none — verdict matches developer's own claim.
