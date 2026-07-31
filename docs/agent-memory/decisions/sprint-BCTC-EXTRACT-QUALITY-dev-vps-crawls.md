# Decision Journal — Sprint BCTC-EXTRACT-QUALITY · dev-vps-crawls

**Sprint goal:** BCTC extraction quality — close latent re-poison / mislink risk in the BCTC discovery+backfill chain.
**Agent:** dev-vps-crawls
**Started:** 2026-07-31T08:51:31Z

---

### STEP dev-vps-crawls-S1 · dev-vps-crawls · 2026-07-31T08:51:31Z
**task-id:** FU-CTG-DISCOVERY-FILENAME-FILTER
**what-done:** Added `is_cover_letter_filename()` (checks resolved PDF's final path segment for `cv_cbtt`/`cong_van_cbtt`, case-insensitive, post URL-decode/query-strip) and wired it into `_fetch_pdf_url()` in vps-scripts/discover-bctc-urls-browser.py — skips cover-letter-named attachments in the ArticlesFileAttach response and keeps scanning for a real statement PDF instead of returning the first href.
**what-considered:**
- only path: task FIX spec is exact (filename marker check after ArticlesFileAttach resolution, same disposition as FIX-CTG-2's title filter) — no alternative design considered.
**why-decision:** matches the router's scope instruction and the backlog FIX text verbatim; reuses the existing title-filter's keyword-match pattern for consistency (same file, same "cover-letter discrimination" section).
**why-change:** no change from plan. Confirmed no apps/mcp-server fetch-pipeline change is needed for THIS specific defect — the fix is fully containable inside `_fetch_pdf_url()`'s own regex loop over ArticlesFileAttach hrefs; the broader "fetch-pipeline design" zone note in the backlog row refers to sibling FUs (FU-BACKFILL-REAL-FILENAMES, FU-BACKFILL-MULTIPLE-COVER-LETTERS) that DO touch apps/mcp-server, not this one.
