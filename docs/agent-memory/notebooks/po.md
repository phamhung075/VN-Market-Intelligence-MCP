# PO Notebook

## Cycle 2026-05-29T23:57Z — BTB-DRIFT triage (dual-path drift, BCTC-TABLE-BOUNDARY)

**Trigger:** dev-mcp-server (60dfac7f fixed BLOCKING-1 idempotency) traced BLOCKING-2 (prose not persisted) and found TWO divergent extraction paths. Routed to me to name canonical path + pick resolution before more code lands.

**PO code-trace (did NOT delegate the trace — answered it myself):**
- LIVE = PATH B. `/api/trigger-pek-extract` (server.ts) → `/pek-extract` → `_run_pek_extract` (handlers.py L193-219) → `pek_adapter.extract_layout_and_tables()` → its OWN `_group_bboxes_into_units` (pek_engine_adapter.py L541). Does NOT import/call `build_document_map`; never touches `ExtractLayoutFirstUseCase`.
- **d297f3ba (BTB fix) is NOT in live path** — landed in PATH A `build_document_map`, reached only via separate `/extract-layout-first`. 659-test/DV-1/DV-2 GREEN proof is on a path the USER doesn't run. = dual-path drift #3 (project_bctc_table_sprint; feedback_recurring_bug_escalation).
- QA's correct live boundaries = PATH B's own RC-1 fix (adjacency + 8pp cap + prose-boundary), coincidental — NOT d297f3ba.
- BLOCKING-2 prose-skip is BY DESIGN in PATH B (L593-597, RC-2 fix; page_type always "table"). Fix must land HERE.

**Decision:** Option (a) CONVERGE on PATH B; port boundary state-machine + prose-unit emission into `_group_bboxes_into_units` (or shared DRY module both call), kill/delegate build_document_map. Option (c) fallback if architect finds clean merge impossible. Test/guard MUST prove single-path-or-agreement.

**Chain dispatched: architect FIRST** (convergence DESIGN, not trace) → dev-pdf-extractor → ops (ONE off-hours re-extraction, BATCHED with 60dfac7f idempotency rebuild + BTB-UNBLOCK runtime mandate) → qa direct-DB → po BTB-EXIT.

**Done-bar:** clean re-extract FPT e71f845d (7 table spans + prose) + ACB (5 + prose), DIRECT DB read, PROOF data came from PATH B (extract_layout_and_tables, not build_document_map).

## Carry-over
- BTB-DRIFT: NEXT agent = **architect** (brief → docs/architecture-briefs/, convergence on PATH B). Then dev-pdf-extractor. d297f3ba CONFIRMED-NOT-IN-LIVE-PATH (PO-traced, not assumed).
- 60dfac7f idempotency fix = path-agnostic + correct; rebuild BATCHED, do NOT rebuild mcp-server alone.
- FU-MON still TIME-CRITICAL (Monday): re-probe Brent/Gold delta after 06:00 UTC cron; get_foreign_flow(HPG) after ~02:15 UTC HOSE open. Flip DONE or REOPEN.
- Still OPEN: SELF-IMPROVE-GATE X-1, BCTC-LAYOUT-FIRST (check if /extract-layout-first is its live consumer — affects BTB-DRIFT kill-vs-delegate of PATH A), CHEF-ATTN. WIP cap: BTB-DRIFT now active HIGH.
