# Decision Journal — Sprint SPIKE-BCTC-CTG-BS-REALDATA-ROOT · architect

**Sprint goal:** Real-data root-cause recon for CTG total_assets=0 (report_id 96e36139) — 2nd behavioral-DoD failure on the same doc, escalated from dev-mcp-server per recurring-bug bar.
**Agent:** architect
**Started:** 2026-07-03T05:52:00Z

---

### STEP architect-S1 · architect · 2026-07-03T06:20:00Z
**task-id:** SPIKE-BCTC-CTG-BS-REALDATA-ROOT
**what-done:** Called `get_bctc_refined(report_id=96e36139…)` directly (HTTP JSON-RPC, gateway unregistered per INV-GATEWAY-1) to read PRE-parse `bctc_refined_units.markdown` for unit-0002/0003, cross-checked against the LIVE 451-row `bctc_table_rows` dump via `/api/bctc-inspect/table/{id}`.
**what-considered:**
- Trust qa's prior finding (grand-total labels absent) at face value vs re-verify against pre-parse source directly — chose re-verify because qa's own note said inspection was of the SERVED table (post-parse), which is exactly the ambiguity the SPIKE's 3-layer question (a) asks to resolve.
- Result: grand totals ARE present pre-parse with correct values (2,924,176,928 / 2,735,484,770 / 188,692,158, matching the dev's own synthetic-fixture numbers) — proves layer (a) transcription is NOT at fault, corrects a stale claim in the 2026-07-01-FIX-BCTC-BANK-SUMMARY-MAPPING.md brief.
**why-decision:** Only pre-parse-vs-post-parse comparison can definitively separate "genuinely absent" from "present but destroyed downstream" — the SPIKE's core mandate.
**why-change:** Corrects prior brief's methodology gap (never queried bctc_refined_units.markdown directly).

### STEP architect-S2 · architect · 2026-07-03T06:35:00Z
**task-id:** SPIKE-BCTC-CTG-BS-REALDATA-ROOT
**what-done:** Traced `refinedMarkdownParser.ts`'s 4-cell branch line-by-line against unit-0002's real markdown; found the parser hardcodes cell[0]=code/cell[1]=label (corporate VAS convention) while CTG's bank-form header is label-first (`Mục (Item) | Mã (Code)`) — causing blank-Mã rows (incl. both grand totals) to drop via empty-label guard, and populated-Mã rows to silently swap code/label.
**what-considered:**
- Header-position-aware fix (read the header row's own cell order) vs a content-heuristic fix (guess code-vs-label per row) — recommended header-aware in the brief as the more robust general fix, content-heuristic as an acceptable fallback for ambiguous headers.
**why-decision:** Empirically confirmed root cause via direct regex/line replay against the real markdown (not speculation) — matches ALL observed anomalies (0/34 rows from unit-0002, code/label swap shape found in the live 451-row dump, page-45 equity-table truncation).
**why-change:** No change from SPIKE mandate — this is the deliverable.

### STEP architect-S3 · architect · 2026-07-03T06:45:00Z
**task-id:** SPIKE-BCTC-CTG-BS-REALDATA-ROOT
**what-done:** Empirically replayed `isBankFormFromRows` regexes against all 451 real codes (0/451 match either pattern) and `detectSection` against the real unit-0001/0002 title lines (bank BS title never recognized; ToC bullet false-positives "cash_flow"), confirming 2 more independent stacking defects (classifier bold-intolerance; section vocabulary gap + false-positive compounding the RC-3 carry-forward fix already shipped).
**what-considered:**
- Whether to scope the fix as "just patch the classifier" (4th narrow patch, the anti-pattern flagged in the dispatch) vs a full layer-split design — chose full split per explicit mandate ("do NOT propose a 4th synthetic-passing classifier patch").
**why-decision:** All 3 layers independently block total_assets; fixing only one (e.g. classifier) would still fail behavioral DoD since the row never reaches the DB in the first place (root cause #1 dominates).
**why-change:** Diverges from the parent task's classifier-only framing — recommend re-scoping/superseding `FIX-BCTC-BANK-BS-SECTION-CLASSIFIER` rather than re-opening it for a 4th cycle.
