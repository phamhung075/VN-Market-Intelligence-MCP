# REQ_BCTC-HUMAN-CONFIRM — Human-in-the-loop Correction Layer for Flagged BCTC Cells

**Sprint:** BCTC-HUMAN-CONFIRM | **Author:** ba | **Date:** 2026-05-30
**Source:** `docs/SPRINT_GOAL.md` § BCTC-HUMAN-CONFIRM + `docs/TASKS.md` HC-BA row
**Status:** SPEC COMPLETE — NEXT: architect (HC-ARCH)

---

## Zone (SINGLE — additive on mcp-server only)

All changes live in `apps/mcp-server/`. No changes to `apps/pdf-extractor/`, Remix, PEK subtree, or `text_table_extractor.py`.

---

## Design Decisions (BA-resolved — not architect-deferred)

The six PO design questions are resolved below. Where a decision is genuinely an architecture-mechanism choice (not a product rule), it is flagged **ARCH-DECIDE** with a sharply framed option set.

### D1 — Review-surface data shape

**Decision (requirement):** The flag enumeration API reads directly from `bctc_refined_units.markdown` at request time using the existing `parseTrustFlag` logic in `refinedMarkdownParser.ts`. No separate flags index table is required.

For each report, the endpoint joins `bctc_refined_units` (all units for `report_id`) with `bctc_table_rows` (for page + label context) and scans cell text for trust prefixes using the existing regex. One flagged-cells payload per report is assembled:

Each flagged cell record exposes:
- `report_id` — UUID
- `unit_id` — which refined unit window the flag came from
- `page_number` — from `bctc_table_rows.page_number` (or `bctc_refined_units.page_numbers_json[0]` when the row is not yet in table_rows)
- `label` — `bctc_table_rows.label` (or the label cell stripped of flag prefix)
- `statement_section` — `bctc_table_rows.statement_section`
- `flag_type` — `"red"` | `"yellow"` (derived from prefix: red = `[ĐỘ TIN CẬY THẤP — ...]`, yellow = `[độ tin cậy thấp]`)
- `ocr_value` — the numeric string extracted from the red prefix reason clause `OCR <x>` (null for yellow flags where no image comparison was done)
- `image_value` — the numeric string extracted from the red prefix reason clause `image <y>` (null for yellow flags)
- `current_value` — the cleaned current cell value already stored in `bctc_table_rows.value_current`
- `row_id` — `bctc_table_rows.id` (integer PK used to anchor a correction)

Rationale: the markdown is already the source of truth; a separate flags index would duplicate data and drift. The join from flagged-cell → `bctc_table_rows` row is the natural anchor for both display and write-back.

### D2 — Correction persistence + audit trail

**Decision (requirement):** A new table `bctc_human_corrections` stores every correction. No edit-in-place on `bctc_table_rows`. The correction record holds the human-supplied value and is the authoritative override. `bctc_table_rows` is updated at write-back time (re-parse-with-overrides path per FR-4) but the `bctc_human_corrections` row is the permanent record.

**Audit trail required columns (minimum):**
- `id` INTEGER PK AUTOINCREMENT
- `report_id` TEXT NOT NULL
- `row_id` INTEGER NOT NULL (FK → `bctc_table_rows.id` — the specific row corrected)
- `label` TEXT NOT NULL (snapshot of label at correction time — survives row re-number)
- `page_number` INTEGER NOT NULL
- `statement_section` TEXT NOT NULL
- `old_value` REAL (the value_current before correction, nullable — may be null if OCR produced no number)
- `new_value` REAL NOT NULL (the human-supplied corrected number)
- `correction_source` TEXT NOT NULL DEFAULT 'human_ui' (reserved for future: 'import', 'agent_assist')
- `confirmed_by` TEXT NOT NULL DEFAULT 'user' (single-user product; reserved for future RBAC)
- `corrected_at` TEXT NOT NULL DEFAULT (datetime('now'))
- `flag_type` TEXT NOT NULL ('red' | 'yellow')
- `ocr_value_snapshot` TEXT (the raw OCR value string at correction time)
- `image_value_snapshot` TEXT (the raw image value string at correction time, null for yellow)

UNIQUE constraint: `(report_id, row_id)` — one correction record per table row. Subsequent human corrections UPDATE the existing record (the audit is the correction record itself; the prior value is captured in `old_value`). This keeps the schema simple for a single-user product. Architect may expand to a full correction history log if needed, but that is not a product requirement.

**Survival invariant (critical):** A later cron refine re-run MUST NOT silently clobber a human-confirmed cell. Chosen precedence rule: **confirmed cells are pinned — the cron re-parse step skips re-writing any `bctc_table_rows` row for which a `bctc_human_corrections` record exists for that `(report_id, row_id)`**. The cron continues to process and write non-confirmed cells normally. This is the per-cell pin model (see D4 for report-level lock semantics).

### D3 — Flow-back path into `bctc_table_rows`

**Decision (requirement):** Re-parse with overrides — `refinedMarkdownParser.ts` remains the single point of correctness. The write-back flow is:

1. Human submits correction for `row_id`.
2. Server writes `bctc_human_corrections` record.
3. Server re-reads the `bctc_refined_units.markdown` for the unit that covers `page_number`.
4. Server calls `parseRefinedMarkdown` with an `overrides` map `{ row_id → new_value }` injected at the call site.
5. The parser's output for the overridden row uses `new_value` as `value_current` and sets `source_confidence = 1.0`.
6. Server does an UPDATE (not DELETE+INSERT) on `bctc_table_rows` for the affected row only — preserving non-corrected rows.

**ARCH-DECIDE A:** The override injection mechanism inside `parseRefinedMarkdown`. Two options:
- Option A1: Pass an `overrides?: Map<number, number>` parameter keyed by `row_order`; the parser substitutes at row-assembly time.
- Option A2: Apply a post-pass patch: parse normally, then overwrite specific rows in the result set by `row_order` match before the DB write.

Both satisfy the single-point-of-correctness requirement. Option A2 is simpler to implement without touching the parser's internals. Architect decides.

Direct row patch (bypassing the parser) is explicitly forbidden — it would create a second correctness path that can drift.

### D4 — "Final confirmed" lock semantics

**Decision (requirement):** The "ĐÃ XÁC NHẬN" final-confirm lock operates at **report level** — it is a status on `financial_reports` (a new column `confirm_status`, separate from `refine_status` per D5). The lock has these precise semantics:

- `confirm_status = 'CONFIRMED'` means the user has reviewed all red/yellow flags and is satisfied.
- The cron refine re-run checks `confirm_status` BEFORE running refine for a report. If `confirm_status = 'CONFIRMED'`, the cron **skips the entire report** (does not re-run the fan-out, does not overwrite any `bctc_refined_units` row, does not overwrite any `bctc_table_rows` row).
- The per-cell pin from D2 is a safety net for partial corrections (when `confirm_status != 'CONFIRMED'` but some cells have been corrected). The report-level lock is the primary guard once the user marks the whole report confirmed.

Tradeoff accepted: if a new PDF is later uploaded for the same period (correcting a page), the user must manually reset `confirm_status` back to `PENDING` to allow re-refine. This is acceptable for the single-user product because the user would have initiated the PDF upload.

The viewer must show a "Đặt lại xác nhận" (Reset confirmation) button visible only when `confirm_status = 'CONFIRMED'`, that resets to `'PENDING'` without deleting corrections (corrections persist as human reference; the next refine re-run may update the underlying values but confirmed rows remain pinned until the user explicitly deletes the correction).

### D5 — Human-confirm status dimension

**Decision (requirement):** Separate columns on `financial_reports` — DO NOT collapse into `refine_status`.

New columns (idempotent ALTER TABLE IF NOT EXISTS pattern):
- `confirm_status TEXT NOT NULL DEFAULT 'PENDING'` — values: `'PENDING'` | `'CONFIRMED'`
- `final_confirmed_at TEXT` — ISO8601 UTC timestamp; NULL when not yet confirmed
- `confirmed_by TEXT DEFAULT 'user'` — reserved for future RBAC; always `'user'` now

`refine_status` is untouched (continues PENDING/IN_PROGRESS/DONE/FAILED/PARTIAL lifecycle).

### D6 — ESC-5 clearing rule

**Decision (requirement):** A human-confirmed cell's effective `source_confidence` is set to `1.0` in `bctc_table_rows`. The write-back step (FR-4) explicitly sets `source_confidence = 1.0` for any row with a `bctc_human_corrections` record, regardless of what the parser computed. This ensures `bctc-analyst`'s ESC-5 gate (`source_confidence < 0.50`) never fires on a human-confirmed cell. No new "effective confidence" column is needed — the `source_confidence` column itself is updated to 1.0 at write-back time.

**Note:** `bctc_table_rows` does not currently have a `source_confidence` column (confirmed by reading schema-financial-reports.ts). The architect must add this column as part of this sprint (idempotent ALTER TABLE migration).

---

## Requirements

### FR-1 — Flagged-Cell Enumeration API (DDD: interface / mcp-server)

New endpoint: `GET /api/bctc-inspect/flags/{doc_id}`

Returns all red/yellow flagged cells for the given report, assembled by scanning `bctc_refined_units.markdown` for trust prefixes and joining to `bctc_table_rows` for row context.

**Response (200):**
```json
{
  "doc_id": "<uuid>",
  "confirm_status": "PENDING",
  "final_confirmed_at": null,
  "flag_count": 12,
  "flags": [
    {
      "row_id": 42,
      "unit_id": "unit-3",
      "page_number": 7,
      "label": "Doanh thu thuần",
      "statement_section": "income_statement",
      "flag_type": "red",
      "ocr_value": "1.234.567",
      "image_value": "1.234.789",
      "current_value": 1234567,
      "has_correction": false,
      "corrected_value": null
    }
  ]
}
```
When `has_correction: true`, `corrected_value` shows the last human-supplied value.

Response `{ "has_flags": false }` (HTTP 200) when no flagged cells found. Response `{ "error": "doc_not_found" }` (HTTP 404) when UUID valid but report absent. UUID-validated before DB access (same guard as existing endpoints).

AC-FR1-1: Scans `bctc_refined_units.markdown` for the report; uses `parseTrustFlag` regex (same function, no new parser written).
AC-FR1-2: Joins flagged cells to `bctc_table_rows` by `(report_id, page_number, label)` match to obtain `row_id`.
AC-FR1-3: `ocr_value` and `image_value` are extracted from the red-flag reason clause `OCR <x> vs image <y>`; both are null for yellow flags.
AC-FR1-4: `confirm_status` and `final_confirmed_at` from `financial_reports` are included in the response (viewer needs them to render the lock badge).
AC-FR1-5: `has_correction: true` when a `bctc_human_corrections` row exists for `(report_id, row_id)`.
AC-FR1-6: UUID validation before any DB access. Non-UUID → 400.

### FR-2 — Correction Submission API (DDD: interface / mcp-server)

New endpoint: `POST /api/bctc-inspect/correct/{doc_id}`

Request body (JSON):
```json
{
  "row_id": 42,
  "new_value": 1234789
}
```

The server:
1. Validates `doc_id` (UUID) and `row_id` (integer, must exist in `bctc_table_rows` for this `report_id`).
2. Reads existing `bctc_table_rows` row for `old_value`, `label`, `page_number`, `statement_section`.
3. Reads the flagged cell record from FR-1 scan for `flag_type`, `ocr_value_snapshot`, `image_value_snapshot`.
4. Writes `bctc_human_corrections` record (INSERT OR REPLACE on `(report_id, row_id)`).
5. Updates `bctc_table_rows` for the affected row: sets `value_current = new_value`, `source_confidence = 1.0`.
6. Does NOT trigger full re-parse (single-row update is sufficient for per-cell correction).
7. Returns `{ "ok": true, "row_id": 42, "new_value": 1234789, "source_confidence": 1.0 }`.

AC-FR2-1: UUID + row_id validation before any write. Invalid row_id → 400 `{ error: "row_not_found" }`.
AC-FR2-2: INSERT OR REPLACE on `bctc_human_corrections(report_id, row_id)` is idempotent — correcting the same cell twice updates the record, not duplicates it.
AC-FR2-3: `old_value` in the correction record is the value in `bctc_table_rows.value_current` BEFORE the update.
AC-FR2-4: `bctc_table_rows.source_confidence` updated to `1.0` in the same DB transaction as the corrections insert.
AC-FR2-5: `confirm_status` of the parent report is NOT automatically changed — the user must explicitly trigger FR-3 to mark the report confirmed.
AC-FR2-6: Responds `{ "ok": false, "error": "report_confirmed" }` (HTTP 409) if `confirm_status = 'CONFIRMED'` — corrections on a confirmed report require resetting the lock first.

### FR-3 — Final-Confirm Lock API (DDD: interface / mcp-server)

New endpoint: `POST /api/bctc-inspect/confirm/{doc_id}`

Request body: `{}` (empty — no body required)

The server:
1. Validates `doc_id` (UUID).
2. Updates `financial_reports` SET `confirm_status = 'CONFIRMED'`, `final_confirmed_at = datetime('now')`.
3. Returns `{ "ok": true, "doc_id": "<uuid>", "confirm_status": "CONFIRMED", "final_confirmed_at": "<iso8601>" }`.

**Reset endpoint:** `POST /api/bctc-inspect/confirm/{doc_id}/reset`

Resets `confirm_status = 'PENDING'`, clears `final_confirmed_at`. Does NOT delete `bctc_human_corrections` records (corrections persist as human reference). Returns `{ "ok": true, "confirm_status": "PENDING" }`.

AC-FR3-1: Confirming an already-confirmed report is idempotent (UPDATE runs, timestamp updates, returns 200).
AC-FR3-2: Reset does not delete correction records — only clears the report-level status.
AC-FR3-3: Both endpoints UUID-validate before any DB write.
AC-FR3-4: The cron refine job (`bctcRefineJob.ts`) checks `confirm_status` before processing: `SELECT confirm_status FROM financial_reports WHERE id = ?`. If `'CONFIRMED'` → skip the report entirely, log at INFO level, do not mark as FAILED.

### FR-4 — `source_confidence` Column + Schema Migration (DDD: infrastructure / mcp-server)

`bctc_table_rows` currently lacks a `source_confidence` column (verified in schema-financial-reports.ts). This column is required for ESC-5 clearing (D6) and for surfacing confidence in the viewer.

Idempotent migration (ALTER TABLE IF NOT EXISTS pattern in `schema-financial-reports.ts`):
```sql
ALTER TABLE bctc_table_rows ADD COLUMN source_confidence REAL NOT NULL DEFAULT 1.0
```

Default 1.0: existing rows without flag information are treated as fully confident. When the refine cron re-writes rows (post-correction), it sets `source_confidence` from the parser output. When the correction API writes, it sets `source_confidence = 1.0`.

AC-FR4-1: Migration is idempotent (PRAGMA table_info check before ALTER, same pattern as existing migrations).
AC-FR4-2: Existing rows default to `source_confidence = 1.0` (non-breaking for current consumers).
AC-FR4-3: The bctcRefineJob Phase 4 write populates `source_confidence` from `parseRefinedMarkdown` output (the parser already computes this value; the INSERT must include it).
AC-FR4-4: The correction API sets `source_confidence = 1.0` for corrected rows (D6).

### FR-5 — `bctc_human_corrections` Table (DDD: infrastructure / mcp-server)

New table in `schema-financial-reports.ts`:

```sql
CREATE TABLE IF NOT EXISTS bctc_human_corrections (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id             TEXT    NOT NULL,
  row_id                INTEGER NOT NULL,
  label                 TEXT    NOT NULL,
  page_number           INTEGER NOT NULL,
  statement_section     TEXT    NOT NULL,
  old_value             REAL,
  new_value             REAL    NOT NULL,
  correction_source     TEXT    NOT NULL DEFAULT 'human_ui',
  confirmed_by          TEXT    NOT NULL DEFAULT 'user',
  corrected_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  flag_type             TEXT    NOT NULL,
  ocr_value_snapshot    TEXT,
  image_value_snapshot  TEXT,
  UNIQUE(report_id, row_id)
)
```

AC-FR5-1: `UNIQUE(report_id, row_id)` enforces one correction per table row; INSERT OR REPLACE is the idempotency mechanism.
AC-FR5-2: `row_id` references `bctc_table_rows.id` — if a refine re-run deletes and re-inserts `bctc_table_rows`, the new rows get new auto-increment IDs; the cron skip logic (FR-6) must re-anchor by `(report_id, label, page_number)` not by stale `row_id`. See FR-6 AC-FR6-3.
AC-FR5-3: Table is additive — zero mutation to any existing table.

### FR-6 — Cron Re-run Survival (DDD: application / mcp-server)

The cron refine job (`bctcRefineJob.ts`, Phase 4 write) must respect existing human corrections.

Two-layer guard:

**Layer 1 — Report-level skip:** Before starting refine for any report, check `confirm_status`. If `'CONFIRMED'` → skip entire report (log INFO, do not set FAILED).

**Layer 2 — Cell-level pin:** When `confirm_status != 'CONFIRMED'` but individual corrections exist, the Phase 4 write does NOT blindly DELETE + INSERT all `bctc_table_rows`. Instead:
1. DELETE rows for this report WHERE no correction exists: `DELETE FROM bctc_table_rows WHERE report_id = ? AND id NOT IN (SELECT row_id FROM bctc_human_corrections WHERE report_id = ?)`.
2. INSERT new parsed rows for uncorrected positions only.
3. Leave pinned rows (those in `bctc_human_corrections`) untouched — they keep `source_confidence = 1.0` and `value_current = new_value`.

**ARCH-DECIDE B:** Row re-anchoring after a full re-parse. When the cron deletes and re-inserts `bctc_table_rows`, the new rows have new `id` values. Existing `bctc_human_corrections.row_id` values point to deleted rows. Two options:
- Option B1: The cron re-parse attempts to match corrections to new rows by `(report_id, label, page_number, statement_section)`. If found, re-applies `source_confidence = 1.0` and `value_current = new_value` to the new row, and updates `bctc_human_corrections.row_id` to the new `id`.
- Option B2: Add a `label + page_number` stable key to `bctc_human_corrections` as the primary anchor (already included in the schema above). The cron skip by stable key, ignoring `row_id` for the pin lookup and re-linking `row_id` after insert.

Option B2 is recommended because it is more robust to row renumbering. Architect decides mechanism.

AC-FR6-1: If `confirm_status = 'CONFIRMED'`, cron skips the report. `refine_status` is NOT updated (it retains its prior value). Verified by DV test.
AC-FR6-2: If corrections exist but `confirm_status != 'CONFIRMED'`, the Phase 4 write preserves corrected rows. Verified by DV test (simulate cron re-run with one pinned correction — pinned row must survive with `source_confidence = 1.0`).
AC-FR6-3: After a re-parse, correction records are re-anchored to new row IDs using the stable `(report_id, label, page_number, statement_section)` key. Stale `row_id` references are updated.

### FR-7 — Viewer UI Extension (DDD: interface / mcp-server)

The existing `bctc-inspector.html` gets an additive "Sửa tay / Xác nhận cuối" (Hand-edit / Final-confirm) panel. This is a new mode toggled from the existing "Người dùng | Agent (debug)" toggle (extend, do not replace).

**Panel structure (Vietnamese copy required):**
- Header: "Ô bị đánh dấu cảnh báo" (Flagged cells) — with count badge.
- For each flagged cell (from FR-1 response): shows label, trang (page), loại cảnh báo (đỏ/vàng), giá trị OCR, giá trị ảnh, giá trị hiện tại.
- Correction widget: a numeric input pre-filled with `current_value`; a "Xác nhận sửa" button that calls FR-2.
- Report-level confirmation: "Đánh dấu ĐÃ XÁC NHẬN toàn bộ báo cáo" button (calls FR-3). Disabled until all red flags have corrections.
- Lock badge: when `confirm_status = 'CONFIRMED'`, show "ĐÃ XÁC NHẬN" badge and hide the per-cell inputs. Show "Đặt lại xác nhận" reset button.
- If no flagged cells: show "Không có ô cần xác minh thêm" (No cells requiring further verification).

AC-FR7-1: The existing PDF pane, OCR/MD pane, table pane, and agent/debug toggle are untouched (additive only).
AC-FR7-2: All user-facing copy is in PLAIN Vietnamese — no analyst jargon, no English labels in the UI.
AC-FR7-3: Correction widget only accepts numeric input (Vietnamese number format: dot thousands, comma decimal — same as the glossary convention).
AC-FR7-4: After a successful FR-2 call, the corrected row shows a "Đã sửa" (corrected) badge and the old vs new value.
AC-FR7-5: The "ĐÃ XÁC NHẬN toàn bộ báo cáo" button is enabled only when all red-flagged cells have a correction (yellow flags may remain uncorrected — yellow is advisory).
AC-FR7-6: `has_pek` flag is preserved and the viewer continues to correctly branch into PEK vs legacy path for the OCR/table panes — the new flags panel is orthogonal to PEK.

### FR-8 — MCP Tool: `list_flagged_bctc_cells` (DDD: interface / mcp-server)

New MCP tool exposing the same data as FR-1 for agent consumption. Allows `bctc-analyst` to discover flagged cells and potentially assist the user.

Input: `{ report_id: string }`
Output: same shape as FR-1 response, or `{ error: string }`.

AC-FR8-1: Registered in `tools/registry.ts` (one import + one entry, no `server.ts` change).
AC-FR8-2: Returns `{ flags: [] }` (not error) when no flagged cells.

### FR-9 — MCP Tool: `submit_bctc_correction` (DDD: interface / mcp-server)

New MCP tool for the same write path as FR-2. Allows agent-assisted correction in future (currently `correction_source` defaults to `'human_ui'`; tool callers may pass `correction_source: 'agent_assist'` when that lane opens).

Input: `{ report_id: string, row_id: number, new_value: number, correction_source?: string }`
Output: `{ ok: true, row_id, new_value, source_confidence: 1.0 }` or `{ error: string }`.

AC-FR9-1: Registered in `tools/registry.ts`.
AC-FR9-2: Internally delegates to the same service function as FR-2 (no code duplication between HTTP handler and MCP tool).

---

## Non-Functional Requirements

### NFR-1 — DV Tests RED-before/GREEN-after (Same Commit)

Mandatory DV test file: `apps/mcp-server/src/__tests__/HC-human-confirm.test.ts`

Minimum test cases:
- `DV-HC-1`: GET `/api/bctc-inspect/flags/{doc_id}` returns flagged cells with correct `ocr_value` / `image_value` extracted from red prefix.
- `DV-HC-2`: GET returns yellow flag with null `ocr_value` / `image_value`.
- `DV-HC-3`: POST `/api/bctc-inspect/correct/{doc_id}` writes `bctc_human_corrections` row; `bctc_table_rows.source_confidence` updates to 1.0.
- `DV-HC-4`: POST correct on confirmed report returns 409.
- `DV-HC-5`: POST `/api/bctc-inspect/confirm/{doc_id}` sets `confirm_status = 'CONFIRMED'`.
- `DV-HC-6`: POST confirm/reset clears status; correction records remain.
- `DV-HC-7`: Simulated cron re-run on `confirm_status = 'CONFIRMED'` report — all rows intact, `refine_status` unchanged.
- `DV-HC-8`: Simulated cron re-run on partially-corrected report (`confirm_status = 'PENDING'`, one correction) — corrected row pinned with `source_confidence = 1.0`; uncorrected rows updated.
- `DV-HC-9`: `bctc_table_rows.source_confidence` column exists after migration (idempotent: run migration twice, column exists once).
- `DV-HC-10`: `submit_bctc_correction` MCP tool call round-trips through the same service function as the HTTP handler.

All tests use `new Database(':memory:')` (bun:sqlite) injected via DI. No live DB. RED before production code, GREEN after — same commit.

### NFR-2 — Persistence Verified via Direct DB Read

QA must verify persistence via `new Database(path)` (bun:sqlite) inside the container — NOT via HTTP response round-trip alone. Specifically:
- After FR-2 (correction), read `bctc_human_corrections WHERE report_id = ? AND row_id = ?` directly and confirm `new_value` matches.
- After FR-3 (confirm), read `financial_reports WHERE id = ? AND confirm_status = 'CONFIRMED'` directly.
- After cron re-run on confirmed report, read `bctc_table_rows WHERE report_id = ?` directly and confirm corrected rows have `source_confidence = 1.0`.

### NFR-3 — Additive Only

No modification to:
- `bctcInspectHandler.ts` existing handler functions (additive routes only)
- `bctcInspectMdHandler.ts`
- `refinedMarkdownParser.ts` core logic (override injection is additive)
- `bctc-inspector.html` existing panes / toggle logic
- `bctcRefineJob.ts` Phase 1-3 (only Phase 4 write gains the correction-skip guard)

### NFR-4 — Off-Hours Data Write Discipline

Manual UI edits (corrections, confirm, reset) are interactive user actions — they are NOT automated extraction. They may happen at any time. However, if any correction triggers a re-parse of `bctc_refined_units` (FR-4 option A2), that re-parse write to `bctc_table_rows` is subject to the HOSE extraction discipline (avoid 02:00-08:59 UTC Mon-Fri for extraction writes). For single-row correction updates (the primary path), this restriction does NOT apply.

### NFR-5 — Container Rebuild

After any code change, ops must rebuild the mcp-server container (`--no-cache` + `force-recreate`). A plain restart reloads a stale image.

---

## Edge Cases

### EC-1 — Flagged cell has no corresponding `bctc_table_rows` row

When the parser did not produce a row for a flagged cell (e.g., a flag in a label cell rather than a value cell, or a FAILED window), FR-1 must still surface the flag using data from `bctc_refined_units` directly. `row_id` is null in this case. The correction widget is disabled for null-row_id flags (the user can still confirm the report).

### EC-2 — Red flag reason clause malformed

The red prefix regex `[ĐỘ TIN CẬY THẤP — OCR <x> vs image <y>]` may not always contain both OCR and image values (e.g., reason clause is free-text). In this case: `ocr_value = null`, `image_value = null`. `flag_type` is still `"red"`. The viewer shows the raw reason clause text instead of the two value fields.

### EC-3 — Report has no `bctc_refined_units` rows

When `refine_status = 'PENDING'` or `refine_status = 'FAILED'`, there is no markdown to scan. FR-1 returns `{ "has_flags": false, "reason": "refine_not_complete" }`. The viewer shows: "Báo cáo chưa được xử lý tự động. Vui lòng chạy lại bước tinh chỉnh trước." (Report has not been processed automatically. Please run the refinement step first.)

### EC-4 — Corrected value is the same as current value

Allowed — the user may wish to confirm the OCR value is correct without changing it. A correction record is written with `old_value = new_value`. The `source_confidence` still becomes 1.0. This is a valid "I've reviewed and confirmed this is correct" action.

### EC-5 — Number format input (Vietnamese locale)

The viewer correction input accepts Vietnamese-formatted numbers (dot thousands, comma decimal: `1.234.567` or `1.234,56`). The HTTP handler and MCP tool accept JSON numbers (already parsed floats). The viewer JavaScript must call `parseVnNumber`-equivalent logic before submitting.

### EC-6 — Reset while cells have corrections

When `confirm_status` is reset to `'PENDING'`, all `bctc_human_corrections` records remain. The next cron re-run will apply the cell-level pin (FR-6 Layer 2) for those corrected cells. The user can delete individual corrections if desired — that is a separate optional future feature, not in scope for this sprint.

### EC-7 — `bctc_table_rows` deleted by a full re-parse before the cron skip guard is applied

If a race condition allows the cron DELETE to run before the skip check sees the correction records, a corrected cell could be lost. Prevention: the cron Phase 4 write must be a single SQLite transaction that atomically checks corrections and performs the selective DELETE. No partial-delete window.

---

## Blockers

None for PO. All six design questions are resolved as requirements.

**ARCH-DECIDE A** and **ARCH-DECIDE B** are mechanism choices with clearly framed options — architect picks, BA's requirements are satisfied by either option in each case.

---

## DDD Layer Map

| Component | DDD Layer | Zone |
|---|---|---|
| `bctc_human_corrections` table DDL | infrastructure | mcp-server |
| `confirm_status` / `final_confirmed_at` columns on `financial_reports` | infrastructure | mcp-server |
| `source_confidence` column on `bctc_table_rows` | infrastructure | mcp-server |
| `bctcHumanCorrectionsStore.ts` (read/write corrections, pin query) | infrastructure | mcp-server |
| Correction service (orchestrates FR-2 steps 1-6) | application | mcp-server |
| Flag enumeration service (scans markdown + joins table rows) | application | mcp-server |
| Override injection in `parseRefinedMarkdown` | application (pure, no I/O) | mcp-server |
| Cron skip guard in `bctcRefineJob.ts` Phase 4 | application | mcp-server |
| `GET /api/bctc-inspect/flags/{doc_id}` handler | interface | mcp-server |
| `POST /api/bctc-inspect/correct/{doc_id}` handler | interface | mcp-server |
| `POST /api/bctc-inspect/confirm/{doc_id}` handler | interface | mcp-server |
| `list_flagged_bctc_cells` MCP tool | interface | mcp-server |
| `submit_bctc_correction` MCP tool | interface | mcp-server |
| Viewer panel ("Sửa tay / Xác nhận cuối") in `bctc-inspector.html` | interface | mcp-server |

---

## RETURN

SPECS_READY: REQ_BCTC-HUMAN-CONFIRM
BLOCKERS: none
NEXT: architect — run brownfield analysis, design DB migration sequencing, resolve ARCH-DECIDE A + B, produce technical brief HC-ARCH
HANDOFF: docs/REQ_BCTC-HUMAN-CONFIRM.md
PIPELINE: continue
