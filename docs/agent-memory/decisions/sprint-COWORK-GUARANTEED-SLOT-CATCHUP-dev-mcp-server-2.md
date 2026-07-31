# Decision Journal — Sprint COWORK-GUARANTEED-SLOT-CATCHUP · dev-mcp-server (continuation 2)

**Sprint goal:** Make cowork `guaranteed:true` an HONORED contract, not a false promise (see orch-state sprint_goal.entries[COWORK-GUARANTEED-SLOT-CATCHUP]).
**Agent:** dev-mcp-server
**Started:** 2026-07-31T10:06:45Z
**Continuation of:** sprint-COWORK-GUARANTEED-SLOT-CATCHUP-dev-mcp-server.md (rolled — byte_cap 36000 breached, bytes=94833/lines=386)

---

### STEP dev-mcp-server-S41 · dev-mcp-server · 2026-07-31T10:06:45Z
**task-id:** FIX-PDFOCR-PAGECAP-COMPLETENESS-THRESHOLD-MISMATCH
**what-done:** Fixed `pdfOcrWorker.ts`'s completeness gate to cap `expectedPages` at `OCR_MAX_PAGES` (80, same constant now shared with the extraction-loop cap) before computing `threshold`, and removed the upfront blanket `DELETE` on the "incomplete" branch, replacing it with a post-loop `DELETE ... AND page_number > maxPages` cleanup that only runs AFTER new pages are written (write-before-delete).
**what-considered:**
- threshold fix: cap `expectedPages` to `OCR_MAX_PAGES` vs. raise the 80-page cap itself — chose capping expectedPages (task's own suggested design); raising the cap changes OCR runtime/cost policy, out of this S-size task's scope and not what the defect is about.
- AC2 fix: keep the DELETE but move it after the loop vs. drop it entirely (rely on existing `INSERT OR REPLACE` per-page UPSERT, `UNIQUE(filename,page_number)`) — chose drop-entirely + defensive post-loop prune of pages beyond the new `maxPages` window (handles the one real edge case: a prior run's pdfinfo probe returning MORE pages than this run, e.g. a transient pdfinfo failure defaulting `totalPages=30`).
**why-decision:** Both ACs are satisfied by the SAME two edits with no new signature/param surface — the loop's existing `INSERT OR REPLACE` already gives per-page UPSERT semantics for free, so removing the redundant/harmful upfront DELETE was strictly additive safety, not a redesign.
**why-change:** none — matches the task's suggested design exactly (AC1: `Math.min(expectedPages, 80)`; AC2: write-before-delete / per-page UPSERT).

**RED→GREEN evidence** (`FIX-PDFOCR-PAGECAP-COMPLETENESS-THRESHOLD-MISMATCH.test.ts`, 2 tests):
RED (pre-fix, 183ms): AC1 test failed `alreadyExtracted` expected `true` got `false` (80-row capped extraction judged incomplete, threshold=102 vs uncapped 204); AC2 test failed `countRows` expected `10` got `0` (blanket DELETE wiped the 10 pre-existing rows before any re-extraction — the availability-gap defect, live-reproduced).
GREEN (post-fix, 278ms): both pass — `[pdfOcr] already extracted` fires for the 80-row/204-page fixture (cappedExpected=80, threshold=40), row count stays 80; the 10-row fixture is still correctly flagged `[pdfOcr] incomplete extraction detected` (genuine incompleteness under the NEW capped threshold too) but its 10 rows survive untouched (no DELETE fired).
Test isolation: `mock.module("node:child_process")` (restored in afterAll, same pattern as 047-bctc-orchestrator.test.ts) fakes the `pdfinfo` lookup (204 pages) and makes `execSync("which ...")` throw so `isOcrAvailable()` returns false — avoids a real 80-page/160s+ tesseract loop. `?isolate=` cache-busted import avoids `_ocrAvailableCache` poisoning from sibling test files that already probed the real dev-machine tools.

### STEP dev-mcp-server-S42 · dev-mcp-server · 2026-07-31T12:20:00Z
**task-id:** FU-BACKFILL-MULTIPLE-COVER-LETTERS
**what-done:** Replaced `backfillBctcPdfPaths`'s negative-match "consolidated" selection (`matches.filter(m => !isCoverLetterFilename)`, FIX-CTG-PDF-MISLINK 77092007) with a new positive-match gate `isConsolidatedReportFilename()` (Vietnamese "hop nhat" / English "consolidated" marker, mirrors hsxBctcFetcher.ts's rankItem() signal); applied to BOTH the NULL-pass and the heal-pass candidate filters + heal-pass re-check guard.
**what-considered:**
- root cause: backlog hypothesised "first-match-only" exclusion, but code already used `.filter()` (excludes ALL literal cover letters). Actual gap: negative-match bucket = "not a recognised cover letter" ≠ "is the real report" — a non-report file (explanatory note etc.) failing the cover-letter pattern could be wrongly selected or inflate ambiguity, live-confirmed via AC-3 fixture (old code: `updated=1`, wrongly linked the non-report file).
- sole-candidate override: generalised from `coverLetters.length===1` to `matches.length===1` (any lone file still links, unaffected by classification) — preserves AC-6/AC-7/AC-R6 regressions unchanged.
- heal-pass guard: broadened from `isCoverLetterFilename(current)` to `!isConsolidatedReportFilename(current)` — old guard only re-checked rows mislinked to a RECOGNISED cover letter; a row linked to an unclassified non-report file was never eligible for healing at all (AC-4).
**why-decision:** positive-match closes the actual defect class (any non-report file, not just pattern-recognised cover letters) while reusing the existing "hop nhat" signal already proven correct elsewhere in the codebase (hsxBctcFetcher.ts) — no new heuristic invented.
**why-change:** none — matches task's explicit fix requirement ("REQUIRES a positive match... else leave PENDING loudly").

**RED→GREEN evidence** (`FU-BACKFILL-MULTIPLE-COVER-LETTERS.test.ts`, 12 tests): granular RED confirmed in 2 layers — (1) `isConsolidatedReportFilename` added standalone first (no selection-logic change): AC-1/AC-3/AC-4/AC-2-GREEN genuinely FAILED against unmodified selection logic (AC-3 particularly: `updated=1`, old code silently linked the non-report file — the actual mislink reproduced live, not simulated); (2) `legacyNegativeMatchSelect()` — a frozen, non-imported snapshot of the exact pre-fix 77092007 decision branches — independently proves `{kind:"ambiguous"}` (fails to heal) on the identical AC-1 fixture. Post-fix: all 12 pass, plus full pre-existing suites `FIX-CTG-PDF-MISLINK.test.ts` (14) + `PI3-bctc-inspect-reopen2.test.ts` (regression) unaffected — 56/56 pass across the 3 files. One unrelated pre-existing gap found+sidestepped (not fixed, out of scope): `extractTicker()`'s `KEYWORD_SET` is missing `"CV"`, so a `CV_CBTT_TICKER_...`-ordered filename mis-parses ticker as `"CV"` — fixtures use the already-proven ticker-first `TICKER_CV_CBTT_...` ordering instead.
