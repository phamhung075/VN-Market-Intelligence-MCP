# Decision Journal — Sprint FIX-BCTC-BANK-SUMMARY-MAPPING · dev-mcp-server

**Sprint goal:** Bank (B02-TCTD) financial_reports scalar summaries serve plausible,
identity-consistent numbers or hard-block honest-NULL — never labeled-garbage.
**Agent:** dev-mcp-server
**Started:** 2026-07-01T20:30:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-07-01T20:50:00Z
**task-id:** TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST
**what-done:** SPIKE-reproduced AC-6 against finalizeBctcRefineTool.ts's BLOCK-4/BLOCK-5;
found BLOCK-4 (pre-existing, unrelated commit e74dd0e1) already re-validates truthfully
per-call, but its own 1%/5% relative-diff math can DIVERGE from the canonical FR-5
serve-path guard (bctcIdentityGuard.ts) on compensating-liabilities fixtures — wired
that guard into BLOCK-4 (validation_status) + BLOCK-5 (extraction_confidence hard-0)
as write-time SSOT; proved RED->GREEN + confirm-clean on CTG's real live numbers.
**what-considered:**
- (A) Leave BLOCK-4 untouched, blame only data staleness — REJECTED: RED fixture
  (compensating negative total_liabilities) proved a real split-brain write 'passed'.
- (B) Introduce a NEW validation_status enum value for guard-hard-blocked rows —
  REJECTED: would require a wider schema/consumer migration outside this unit's
  fence; 'failed' + confidence=0 + notes citing "FR-5 hard-block" is sufficient and
  non-breaking for existing 'failed' consumers (bctcFullTools.ts label list unchanged).
- (C) Re-implement checkBctcIdentityGuard's logic inline in finalize — REJECTED:
  DRY violation; imported the existing W1 helper instead (read-only reuse).
**why-decision:** Guard-import is the minimal, generic (no per-ticker literal), DRY
fix that makes finalize's write path byte-identical in corruption classification
to the serve paths W1 already hard-blocks — directly closes the "keeps a frozen
value and serves it as if valid" defect class named in the dispatch brief.
**why-change:** No change to sprint scope; extends (does not replace) BLOCK-4/5.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-07-01T21:00:00Z
**task-id:** TASK-W5-FIX-BCTC-BANK-SUMMARY-MAPPING-VALIDATION-REINGEST
**what-done:** Authored scripts/migrations/reingest-bctc-report.ts (AC-10, operational,
NOT executed against the live report). Live-DB read-only probe (docker exec) found
CTG's report_id=96e36139 has ALL 56 bctc_refined_units at window_status='FAILED'
(markdown empty) — calling finalize now would DELETE the 55 existing bctc_table_rows
and insert 0. Also found the container's baked-in code already has W1+W4 but NOT
W2/W3 (refinedMarkdownParser.ts markers absent) — independently corroborates the
dispatcher's "OLD image, do not run live" instruction.
**what-considered:**
- (A) Blindly call finalize_bctc_refine on report_id 96e36139 — REJECTED: would wipe
  existing rows to zero given the live all-FAILED window state (data-loss).
- (B) Reset bctc_refined_units rows to a synthetic 'pending' status to force-requeue
  — REJECTED: window_status enum is DONE|FAILED only (pushBctcRefinedUnitTool.ts);
  fabricating a third value risks breaking get_bctc_pending_refine's NOT IN(...) SQL.
- (C) Script calls finalize_bctc_refine over the live MCP /mcp Streamable-HTTP
  endpoint (reuse production code, zero duplication) ONLY when >=1 DONE window with
  non-empty markdown exists; refuses otherwise (exit 3) with the manual-step
  instructions (report_id bypasses queue filters, RF-3) — CHOSEN.
**why-decision:** (C) is the only option that is both safe (no data loss) and DRY
(no re-implementation of BLOCK-1..5's ~250 lines, no drift risk).
**why-change:** No change to sprint scope; W5(b)'s own text already anticipated the
"code fix alone will not unfreeze it" caveat — this journal entry documents WHY the
script cannot go further (transcription requires a live subagent, out of script reach).
