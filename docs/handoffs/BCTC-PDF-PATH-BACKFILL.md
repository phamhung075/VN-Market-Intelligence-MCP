---
sprint: BCTC-ANALYTICS-LAYER
branch: task/bctc-pdf-path-backfill
size: S
zone: apps/mcp-server/src/infrastructure/db/
depends_on: [REFINE-CRON-ARM]
blocks: []
---

## TLDR

Backfill `financial_reports.pdf_path` for D2D and KDC (two tickers with `refine_status=PENDING` and OCR text available, but `pdf_path=NULL`). The refine flow skips these rows at the `windows: []` gate because `fetchAllPageTexts(basename(NULL))` returns empty, even though `pdf_extracted_text` has pages available. One-time migration to derive `pdf_path` from the filename in `pdf_extracted_text` row.

---

## [PM] Planning Context

**Zone:** `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` + migration

**Secondary Finding (from Spike BCTC-CTG-FLEET-SERVE-SPIKE):**
- 33 tickers blocked at `refine_status=PENDING` are unblocked by arming the cron (REFINE-CRON-ARM).
- 2 additional tickers (D2D, KDC) also have `refine_status=PENDING` + OCR text, but have a different blocker: `pdf_path=NULL`.
- The refine flow's `get_bctc_pending_refine` tool calls `fetchAllPageTexts(basename(pdf_path))` at Phase 0 L41.
- When `pdf_path` is NULL, `basename(NULL)` is undefined or empty, so `fetchAllPageTexts` returns an empty array.
- The refine flow then skips the row due to `windows: []` gate.
- However, `pdf_extracted_text` table has rows for both D2D and KDC with the correct OCR text and filename.
- **The fix:** Backfill `pdf_path` to the correct filename so `fetchAllPageTexts` can find the text rows.

**Fleet Impact:**
- D2D: 1 row, `pdf_path=NULL`, OCR exists under `D2D_2026_Q1.pdf`
- KDC: 1 row (fallback id `fallback-KDC-2026-Q1`), `pdf_path=NULL`, OCR exists

After backfill, both rows will be eligible for refine processing when the cron fires.

**Acceptance Criteria:**
- [ ] Query `financial_reports` for D2D + KDC rows; confirm `pdf_path` was NULL before fix
- [ ] Run migration script (or hand-crafted UPDATE + blob sync) to populate `pdf_path` from matching `pdf_extracted_text` filename
- [ ] Query again; confirm D2D and KDC rows now have `pdf_path` populated
- [ ] Call `get_bctc_pending_refine` (raw tool, not refine flow) and verify both D2D and KDC rows return `windows > 0` (no longer skipped at Phase 0 L41)
- [ ] Verify validation_status and other scalar columns are consistent (no corruption from backfill)

**Files to Read First:**
- `docs/architecture-briefs/2026-06-12-bctc-ctg-fleet-serve-gap.md` § Secondary fix — live DB evidence and backfill strategy
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts` — understand the `windows: []` gate and `fetchAllPageTexts` call
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — schema helpers for UPDATE
- `docs/infrastructure/db/schema-financial-reports.sql` (if exists) or live schema inspection via `PRAGMA table_info(financial_reports)`

**Files to Create:**
- A migration script (if the backfill is complex); otherwise, hand-crafted SQL one-liner.

**Files to Modify:**
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — if the backfill logic needs a new helper function or permanent record

**Knowledge Needed:**
- SQLite UPDATE syntax with JOIN (match `financial_reports` row to `pdf_extracted_text` row by action_code + period)
- Blob synchronization if `pdf_path` has any cross-table consistency rules
- Rake/migration pattern used in this repo (check `docs/policies/dev-standards.md` § Database Migrations)

**Dependencies:**
- `REFINE-CRON-ARM` must be verified working (so the 33-ticker fleet is unblocked first, and we can track D2D/KDC separately)

---

## Notes

- **Scope:** This is a one-time data correction, not a code defect. No feature or algorithm changes needed.
- **Risk:** Low — we are simply copying an existing filename from another table. No calculations, no breaking schema changes. Verify row counts pre- and post- to ensure no unintended side effects.
- **Rollback:** If the backfill is wrong, reverse it by re-setting `pdf_path=NULL` for D2D + KDC.
- **Related task:** After this backfill completes, D2D and KDC will be eligible for refine on the next cron fire (after REFINE-CRON-ARM is live). No separate re-trigger needed; the cron will pick them up.

---

## Task Completion

When the backfill is done and verified:
1. Update `docs/data/orch/orch-state.json` task board: status → `DONE`, `closed_at` → ISO timestamp, `status_note` → "D2D + KDC pdf_path backfilled from pdf_extracted_text; get_bctc_pending_refine confirms windows > 0"
2. Telegram notification to WORK channel: "BCTC-PDF-PATH-BACKFILL done — D2D + KDC now eligible for refine; cron will pick them up on next fire"
