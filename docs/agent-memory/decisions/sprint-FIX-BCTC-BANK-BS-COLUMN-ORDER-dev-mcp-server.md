# Decision Journal — Sprint FIX-BCTC-BANK-BS-COLUMN-ORDER · dev-mcp-server

**Sprint goal:** Composite FIX-A (parser column-order) + FIX-D (bold-tolerant bank classifier) + FIX-C (bank BS title vocabulary) + mandatory real-CTG-markdown regression, per architect brief docs/architecture-briefs/2026-07-03-ctg-bs-realdata-root.md §7-8. Supersedes FIX-BCTC-BANK-BS-SECTION-CLASSIFIER.
**Agent:** dev-mcp-server
**Started:** 2026-07-03T07:15:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-03T07:35:00Z
**task-id:** FIX-BCTC-BANK-BS-COLUMN-ORDER
**what-done:** Fixed 3 stacking bugs (refinedMarkdownParser.ts column-order detection via captured header cells; bctcFormType.ts bold-marker-tolerant isBankFormFromRows; SECTION_HEADERS/FOLDED_SECTION_KEYWORDS bank-BS title) + a necessary corollary (parseVnNumber bold-strip + comma/dot auto-detect) discovered via hands-on real-data verification, not in the original 3-item scope.
**what-considered:**
- Only path for column order: read header's own captured cell text (resolveColumnLayout), fallback code-first when absent/ambiguous — 0-diff for VCB/FPT.
- Considered porting domain vnNumberParser.ts wholesale vs duplicating logic in application layer — duplicated (this file's footnote/superscript/bold stripping has no domain equivalent; importing would need re-deriving that logic anyway).
- Also fixed orch-state task-note's "ToC false-positive" sub-item (bullet-prefixed lines skip detectSection) — real live defect (unit-0001 MỤC LỤC), low-risk, explicitly named in task-board note though absent from router's literal 3-item paraphrase.
**why-decision:** Real CTG markdown (fetched live via get_bctc_refined) uses comma-thousands + bold-wrapped grand totals — without the parseVnNumber fix, the exact DoD-required values (2,924,176,928 etc.) could not be recovered even with FIX-A/D/C alone; fixing it is the same root-cause class this task exists to close.
**why-change:** Scope expanded beyond the router's literal 3-item text to include the number-format fix (mandatory for DoD) and the ToC bullet guard (in task-board note) — both root-caused via direct live-DB verification, not guessed.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-03T07:52:00Z
**task-id:** FIX-BCTC-BANK-BS-COLUMN-ORDER
**what-done:** Read authoritative PM handoff (docs/handoffs/FIX-BCTC-BANK-BS-COLUMN-ORDER.md, found after initial pass) — its AC requires unit-0038 (5-col, no-code equity roll-forward note) in the mandatory fixture + "no truncation at 4 cells". Added a 3rd `resolveColumnLayout` outcome ("label-only": label-keyword found, no code-keyword found → map value_current=LAST cell, value_prior=FIRST value cell, discard delta columns — no schema field for >2 values).
**what-considered:**
- Merge multi-line merged-cell headers cell-wise vs capture-first-only — chose capture-first (simpler, the meaningful Mục/Mã text is always on the FIRST header line in every real sample seen).
- First cut of "label-only" detection (label-keyword found + no "mã"/"code" match) false-triggered on STT-first income-statement tables (STT lacks literal "mã"/"code" text) — caught via full BCTC-subset re-run (1 fail), fixed by adding "stt" to the code-keyword pattern.
**why-decision:** RED→GREEN proven against real unit-0038 (21/21 rows, 0 errors, grand-total cross-checks exactly against unit-0003's independently-parsed equity figure) before/after the STT fix.
**why-change:** n/a — same task, deeper AC compliance found via handoff re-read mid-cycle.
