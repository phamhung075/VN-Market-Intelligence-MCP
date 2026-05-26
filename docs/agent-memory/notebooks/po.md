# PO Notebook

**Cycle:** MD-KICKOFF — NEW Sprint BCTC-MD-TABLE opened from user feature directive (generic table detection → markdown).
**Last update:** 2026-05-26T04:36Z
**Status:** Sprint BCTC-MD-TABLE OPEN. MD-DESIGN READY → handing to architect NEXT. BCTC-TABLE stays CLOSED.

---

## 2026-05-26T04:36Z — MD-KICKOFF

**User mandated a NEW feature** (HOW scoped, IF approved). Structured balance-sheet table is confirmed working ("i see table now"). Three follow-ups → one sprint: (2) render raw OCR text as markdown; (3) segment report "Báo cáo bộ phận" + other BCTC tables NOT detected; (4) GENERIC table-detection → markdown tables. The bespoke `text_table_extractor.py` is hardcoded to the balance sheet (codes 100/270/300/400/440 + section headers + embedded-code recovery 222/223/226/131/319/421b) and carries 7 fix commits — recurring-bug discipline binding → NEW generic module, not a patch.

**Resolved A/B/C/D (PO authority, user trusts PO):**
- **A — AUGMENT not replace.** Generic markdown ALONGSIDE structured `bctc_table_rows` (which feeds financial analysis + is the user-confirmed working surface; must not regress). Markdown = additive human-recheck of ALL tables.
- **B — v1 = balance sheet + segment report** as two different-shape proof cases on a generic detector. Income/cashflow/notes bonus, not blocking.
- **C — surfacing = new inspector field**, markdown per table + OCR-as-markdown. Extraction = pdf-extractor; route/render = mcp-server; store-vs-compute = architect's call.
- **D — acceptance = LIVE markdown, generic by construction** (grep-proof zero per-table constants; same path renders BOTH tables; OCR-as-md live). balance_pass/fixture-green alone FORBIDDEN as sole gate — main terminal verifies LIVE.

**Candidate direction handed to architect (NOT a mandate):** Tesseract `image_to_data`/TSV → per-word bboxes → geometric row(y-band)/column(x-gap) clustering → generic grid → markdown pipe-table + table-boundary detection. Architect evaluates vs pdfplumber/camelot (likely non-viable: scanned image-only). Privacy: local Tesseract only.

**Wrote (working tree, NOTHING staged — commit-mutex uncallable by me):** SPRINT_GOAL.md (new sprint prepended, BCTC-TABLE kept CLOSED), TASKS.md (new sprint block), docs/handoffs/TASK_BCTC-MD-TABLE.md (NEW, ladder + ACs + constraints), this notebook.

## Carry-over
- **Main terminal MUST commit the 3 docs** (SPRINT_GOAL.md + TASKS.md + TASK_BCTC-MD-TABLE.md; notebook separately). All on `main`, explicit `git add`, no push, zero foreign in `git show --stat HEAD`. Frozen pdf-extractor surfaces (dashboard/*, sandbox/runner.py, pilot-status json) NOT touched.
- **NEXT = architect (MD-DESIGN)** — generic detector blueprint, brief in `docs/architecture-briefs/`. Then dev-pdf-extractor (MD-EXTRACT, new module) + dev-mcp-server (MD-INSPECT) → ops (MD-DEPLOY, single-doc host-safe) → qa (MD-QA live) → PO (MD-EXIT, live row-by-row + segment report).
- **Sprint MCPZONE-HARDEN-1** (dev-mcp-server, non-blocking) + **Sprint BCTC-TABLE-2** (multi-ticker/quarterly residuals) stay OPEN + SEPARATE — not folded in.
- **BINDING:** NEW generic module, never patch `text_table_extractor.py` (7 fix commits); local Tesseract only (no cloud); single-doc OCR only (never batch backfill for verify); LIVE markdown is the gate, not fixture/balance_pass.