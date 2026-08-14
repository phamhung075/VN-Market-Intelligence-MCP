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
