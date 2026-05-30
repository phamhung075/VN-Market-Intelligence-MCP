# Sprint BCTC-HUMAN-CONFIRM — Human-in-the-loop correction layer for flagged BCTC cells (the final trust gate)

**BUILD STATUS 2026-05-30 — KICKOFF (PO). New sprint, user-requested.** Previous sprint BCTC-AGENTIC-REFINE ✅ SIGNED OFF 2026-05-30 (record archived in `docs/architecture-briefs/2026-05-30-bctc-agentic-refine.md` + TASKS.md). This sprint is the ADDITIVE human layer ON TOP of that shipped output — it does NOT rebuild the refine pipeline.

## User intent (verbatim)
> "I need one other layer, manual fix, user can fix where đánh dấu cảnh báo (đỏ/vàng) for make bctc more correct for final confirmed."

A HUMAN-IN-THE-LOOP correction layer sitting on top of the agent-refine output. The refine step already FLAGS cells it is unsure about with Vietnamese trust prefixes embedded in the markdown: red `[ĐỘ TIN CẬY THẤP — OCR <x> vs image <y>]` (numeric disagreement → source_confidence 0.2) and yellow `[độ tin cậy thấp]` (low confidence → source_confidence 0.4). The user now wants to review, hand-correct, and lock a report as human-verified — so the corrected figures (not the flagged ones) feed `get_bctc_full` + the 6 `bctc-analyst` expert passes.

## Vision
One sentence: **A non-technical user can open the existing BCTC viewer, see every red/yellow flagged cell with both the OCR value and the image-read value side by side, hand-correct each one, mark the whole report "ĐÃ XÁC NHẬN" (final confirmed), and have those human-verified numbers flow back into `bctc_table_rows` — surviving any later automated refine re-run.**

## Grounding (already shipped — read, do NOT rebuild)
- **Refine output**: table `bctc_refined_units` (report_id, unit_id, page_numbers_json, markdown, row_count, confidence, flags, refined_at). Trust prefixes live IN the markdown; `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts` is the SINGLE point of correctness that maps red→0.2 / yellow→0.4 / none→1.0 into `source_confidence` + a flag string on each `bctc_table_rows` row.
- **UI home**: the EXISTING mcp-server-served viewer at `http://localhost:3000/api/bctc-inspect` (`apps/mcp-server/src/interface/bctc-inspector.html` + `routes/bctcInspectHandler.ts` + `routes/bctcInspectMdHandler.ts`). Last sprint added a MD→table view + a "Người dùng | Agent (debug)" toggle. The "Sửa tay / Xác nhận cuối" mode is the ADDITIVE extension — do NOT touch the Remix frontend.
- **Status dimension**: `financial_reports` has `refine_status` (PENDING/IN_PROGRESS/DONE/PARTIAL/FAILED). A SEPARATE human-confirm dimension is needed (architect decides: `confirm_status` / `final_confirmed_at` / corrections table) — do NOT collapse it into `refine_status`.
- **Tools**: `get_bctc_refined`, `get_bctc_pending_refine`, `push_bctc_refined_unit`, `finalize_bctc_refine` (#141-144). A NEW persist path for manual corrections is needed (architect's call: new tool + corrections table, or edit-in-place with audit trail).

## Scope
IN:
1. **Review surface** — in `/api/bctc-inspect`, list every red/yellow flagged cell for a report: OCR value, image-read value, page number, surrounding label/context, current value. Plain Vietnamese.
2. **Manual correction** — user picks OCR vs image, or types the true value, per cell.
3. **Final-confirm lock** — mark report "ĐÃ XÁC NHẬN" (human-verified) on its own status dimension.
4. **Flow-back** — corrected figures re-enter `bctc_table_rows` (prefer re-parse with overrides through the existing parser — keep it the single point of correctness). ESC-5 (confidence<0.50) clears for human-confirmed cells.
5. **Survival invariant** — a later cron refine re-run (`0 9,14,20 UTC`) does NOT silently clobber a human confirmation. Architect decides precedence (confirmed cell pinned/immutable, or cron re-flags only unconfirmed cells).
6. **Audit trail** — who/when/old→new for every correction.

OUT:
- Rebuilding/retuning the refine pipeline (that is AR-FU-DETERMINISM, separate).
- Remix frontend changes; PDF-Extract-Kit subtree (pristine); `text_table_extractor.py` (frozen).
- Multi-user auth/RBAC (single-user product).
- Mistral OCR swap (user-locked future).

## Success Metric
On a report with known red/yellow flags (FPT or ACB), a user: (1) sees all flags listed with OCR/image values + page + label; (2) corrects ≥1 cell by hand; (3) marks the report ĐÃ XÁC NHẬN; (4) direct in-container `market.db` read (bun:sqlite `new Database(path)`) shows the corrected value in `bctc_table_rows` with source_confidence cleared above 0.50 and an audit row for the change; (5) a simulated refine re-run leaves the confirmed cell intact per the chosen precedence rule. Verified by QA via DV tests RED-before/GREEN-after in the SAME commit as production, NOT by balance badge.

## Non-negotiables (carried into every handoff)
main branch only, NO branches · scoped `git add <file>` per file, NEVER `-A` · additive only (do not break `/api/bctc-inspect`, MD→table view, agent/debug toggle, `has_pek`) · PEK subtree pristine · `text_table_extractor.py` frozen · DV tests RED-before/GREEN-after in SAME commit as production · verify persistence via direct in-container `market.db` read with bun:sqlite plain `new Database(path)` · balance badge FORBIDDEN as sole QA gate · Vietnamese trust-prefix convention preserved · all user-facing viewer copy in PLAIN Vietnamese · MCP via `mcp__claude_ai_gateway__call_tool` gateway wrapper (bare tool names) · never ask user to run code (spawn ops/developer/qa) · after any agent .md update give a paste-ready Cowork refresh prompt · ops REBUILDs container after dev changes (build --no-cache + force-recreate, never restart-stale) · off-HOSE no extraction 02:00-08:59 UTC Mon-Fri (manual UI edits are not extraction; triggered re-parse respects the same data-write discipline).
