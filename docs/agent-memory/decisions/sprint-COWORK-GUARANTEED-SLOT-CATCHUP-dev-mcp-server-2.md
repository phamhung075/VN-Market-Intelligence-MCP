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
