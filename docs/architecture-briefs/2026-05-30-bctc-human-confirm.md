# Architecture Brief — BCTC-HUMAN-CONFIRM

**Sprint:** BCTC-HUMAN-CONFIRM
**Author:** architect
**Date:** 2026-05-30
**Triggered by:** `docs/REQ_BCTC-HUMAN-CONFIRM.md` (BA spec, 9 FRs, 6 design decisions resolved)
**Status:** DESIGN COMPLETE + ADDENDUM HC-ARCH-2 (transaction ordering ruling, 2026-05-30)
**Zone:** `apps/mcp-server/` only (single-zone, additive)
**BUILD-STANDARD:** lean (service exists, additive feature)

---

## ARCH-DECIDE A — RULING: Post-Pass Override (Option A2)

**Ruling:** Apply corrections via a post-pass patch in the call site, not inside the parser.

**Mechanism:** After `parseRefinedMarkdown` returns its `ParseResult`, the call site in `finalizeBctcRefineTool.ts` iterates `allTableRows` and applies overrides from the corrections map BEFORE the DB insert. For any row where `(report_id, label, page_number, statement_section)` matches a correction record, substitute `value_current = new_value` and `source_confidence = 1.0`.

**Function signature at call site:**
```typescript
// In finalizeBctcRefineTool.ts (Phase 4 transaction):
function applyCorrections(
  rows: BctcTableRow[],
  corrections: Map<string, { new_value: number; row_id: number }>,
  // key = `${label}||${page_number}||${statement_section}`
): BctcTableRow[] {
  return rows.map(row => {
    const key = `${row.label}||${row.page_number}||${row.statement_section}`;
    const correction = corrections.get(key);
    if (!correction) return row;
    return { ...row, value_current: correction.new_value, source_confidence: 1.0 };
  });
}
```

**Justification:**
- `refinedMarkdownParser.ts` is a pure function (`markdown → rows`, no I/O, no parameters beyond the 3 already defined). Adding an `overrides` map parameter makes it impure-by-interface and couples the parser to the corrections infrastructure layer — a DDD violation (pure application util absorbing infrastructure concern).
- Option A2 keeps the parser's internal logic 0-diff. The post-pass is a 15-line helper at the call site — trivially auditable and independently testable.
- The BA's "single point of correctness" constraint is preserved: the parser still determines all non-overridden values. The override is a named post-step, not a silent mutation inside the parser.
- The FR-4 direct-row-patch prohibition is satisfied: the patch is mediated by the parser output contract (`BctcTableRow[]`), not a direct DB UPDATE bypassing the parser.

---

## ARCH-DECIDE B — RULING: Stable-Key Re-Anchor with `row_id` Update (Option B2, strengthened)

**Ruling:** The stable anchor key is `(report_id, label, page_number, statement_section)`. This key is used for ALL correction lookups (both per-cell pinning and post-re-parse re-anchor). The `row_id` column in `bctc_human_corrections` is a cache of the current integer PK, re-linked after each re-parse. It is NOT the primary lookup key.

**Key uniqueness analysis (the load-bearing correctness question):**

The concern is whether `(report_id, label, page_number, statement_section)` is unique in practice. Brownfield scan shows:

- `bctc_table_rows.label` is derived from the BCTC line-item text (e.g. "Tiền và tương đương tiền", "Doanh thu thuần"). Within a single statement section on a single page, duplicate labels are extremely rare in standard Vietnamese BCTC format (each line-item appears once per column group).
- The `page_number` component adds a strong discriminator: the same label appearing on two pages of the same section (e.g. a table that spans pages) would have different `page_number` values.
- `statement_section` (balance_sheet / income_statement / cash_flow / notes / general) adds further discrimination.

**However: a genuinely duplicate key CAN exist** when a report has a partial re-print or when two label-identical rows appear on the same page and section (e.g. two "Khác" (Other) rows at different code positions). This is a real edge case.

**Resolution — strengthen the anchor with `code` when non-null:**

The final stable key for correction matching is:

```
anchor_key = (report_id, label, page_number, statement_section)
-- PLUS, when code IS NOT NULL, also discriminate by code:
disambiguated_key = (report_id, label, page_number, statement_section, code_or_null)
```

Implementation: the `bctc_human_corrections` table stores `code TEXT` as an additional snapshot column (added to the BA schema below). The stable-key lookup uses this composite. When `code` is null (a generic label row), the `(label, page_number, statement_section)` triple is used — which is sufficient because null-code rows are typically summary/total rows that appear only once per section.

**Re-anchor mechanism after re-parse:**

In `finalizeBctcRefineTool.ts`, after the new rows are inserted:
1. Query `bctc_human_corrections WHERE report_id = ?` — get all corrections with their `(label, page_number, statement_section, code)` stable keys.
2. For each correction, query `bctc_table_rows WHERE report_id = ? AND label = ? AND page_number = ? AND statement_section = ? AND (code = ? OR (code IS NULL AND ? IS NULL))` → get the new `id`.
3. If found: `UPDATE bctc_human_corrections SET row_id = <new_id> WHERE id = <correction_id>`.
4. Apply `source_confidence = 1.0` and `value_current = new_value` to the matched row via the `applyCorrections` post-pass (runs BEFORE insert, so re-anchor is already applied at insert time).

**Mis-attach prevention:** if the stable-key lookup returns more than 1 row (genuine duplicate), the correction is NOT applied to ANY row. An `anchor_ambiguous` flag is logged and stored on the correction record (`anchor_status` column, see schema below). The user sees this in the viewer as a "Cần xác nhận lại vị trí" warning on that cell. This is the safe-fail: a correction is never silently mis-applied.

---

## 1. Brownfield Findings

### 1.1 Zone

`apps/mcp-server/` — single zone. No other zones touched.

**Specialist:** dev-mcp-server

### 1.2 Verified Existing Paths

**Schema:**
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — `bctc_table_rows` DDL confirmed: NO `source_confidence` column. Must be added via idempotent `ALTER TABLE` migration (same pattern as existing migrations at lines 31-95 of schema-financial-reports.ts).
- `financial_reports` already has `refine_status` (BCTC-AGENTIC-REFINE migration, lines 421-447). `confirm_status`, `final_confirmed_at`, `confirmed_by` do NOT exist — must be added by the same idempotent migration block.
- `bctc_refined_units` table EXISTS (BCTC-AGENTIC-REFINE, lines 400-419). Has `window_status`, `markdown`, `confidence`, `page_numbers_json`. Already indexed on `report_id`.
- `bctc_table_rows` columns confirmed: `id` (INTEGER PK), `report_id`, `page_number`, `statement_section`, `row_order`, `code`, `label`, `period_current`, `value_current`, `period_prior`, `value_prior`, `unit`, `is_summary_row`, `extracted_at`. NO `source_confidence`.

**Application:**
- `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts` — `BctcTableRow` interface exports `source_confidence: number` (already in the type!). The `parseRefinedMarkdown` function already populates `source_confidence` from `parseTrustFlag`. The gap is only in the DB insert path in `finalizeBctcRefineTool.ts` — the `allTableRows` accumulator and the INSERT statement both omit `source_confidence`. This is a clean additive fix: add the column to the accumulator type, add it to `allTableRows.push`, add it to the INSERT SQL.

**Interface (routes):**
- `apps/mcp-server/src/interface/mcp/routes/bctcInspectHandler.ts` — exports `isValidUuid` (reused by new handlers). Exports `handleBctcInspect*` functions. New handlers follow the same DI pattern: `(req, res, db, docId)`.
- `apps/mcp-server/src/interface/mcp/server.ts` — route dispatch block at lines 367-502. New routes added at the end of the bctc-inspect block using the same `if (method === "X" && pathname.startsWith("/api/bctc-inspect/..."))` pattern. Body parsing follows the same inline `for await (const chunk of req) body += chunk` pattern used at lines 427-435.
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — imports at lines 104-109 confirm the pattern: one import line + one array entry per tool. Last three entries are `#142`, `#143`, `#144`. New tools will be `#145`, `#146`.

**Cron flow:**
- `docs/agents/refine_bctc_md/flow/main.md` — Phase 0, Step 5 checks `text_status == "COMPLETE"`. NO `confirm_status` check exists. Must add: before Phase 0 Step 5, check `confirm_status == "CONFIRMED"` → skip + release + EXIT cleanly. This is a `docs/agents/` file — route to agent-father (not dev-mcp-server).
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts` — the server-side query that feeds `get_bctc_pending_refine`. Must add `AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')` to the WHERE clause to filter out confirmed reports at source. This is a second layer of defence (belt-and-braces with the flow guard). File: dev-mcp-server zone.
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` — Phase 4 collect-then-write. The `DELETE FROM bctc_table_rows WHERE report_id = ?` at line 140 is the destructive operation that kills confirmed cells. Must be changed to the selective delete (Layer 2 pin). Must also add `applyCorrections` post-pass before the INSERT loop. Must add `confirm_status = 'CONFIRMED'` guard at entry.

### 1.3 What Does NOT Exist Today

- `bctc_human_corrections` table — does not exist. Genuine new DDL.
- `confirm_status`, `final_confirmed_at`, `confirmed_by` columns on `financial_reports` — do not exist.
- `source_confidence` column on `bctc_table_rows` — does not exist.
- `apps/mcp-server/src/interface/mcp/routes/bctcFlagsHandler.ts` — does not exist.
- `apps/mcp-server/src/interface/mcp/routes/bctcCorrectHandler.ts` — does not exist.
- `apps/mcp-server/src/interface/mcp/routes/bctcConfirmHandler.ts` — does not exist.
- `apps/mcp-server/src/infrastructure/db/bctcHumanCorrectionsStore.ts` — does not exist.
- `apps/mcp-server/src/application/usecases/bctcCorrectionService.ts` — does not exist.
- `apps/mcp-server/src/application/usecases/bctcFlagEnumerationService.ts` — does not exist.
- MCP tools `list_flagged_bctc_cells`, `submit_bctc_correction` — do not exist.
- The HTML panel in `bctc-inspector.html` for "Sửa tay / Xác nhận cuối" mode — does not exist.

### 1.4 Scan Clean

No existing code conflicts with the new feature. All additions are additive. Confirmed: `bctcInspectHandler.ts` existing handlers are untouched; `refinedMarkdownParser.ts` core logic is untouched; `bctcRefineJob.ts` Phase 1-3 are untouched; `bctc-inspector.html` existing panes are untouched.

---

## 2. Schema Design

### 2.1 `bctc_human_corrections` Table (new)

```sql
CREATE TABLE IF NOT EXISTS bctc_human_corrections (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  report_id             TEXT    NOT NULL,
  row_id                INTEGER NOT NULL,         -- cache of current bctc_table_rows.id; re-linked after re-parse
  label                 TEXT    NOT NULL,         -- stable key component (snapshot at correction time)
  page_number           INTEGER NOT NULL,         -- stable key component
  statement_section     TEXT    NOT NULL,         -- stable key component
  code                  TEXT,                     -- stable key disambiguator (null = summary/generic rows)
  old_value             REAL,                     -- value_current before correction (nullable: OCR may have been null)
  new_value             REAL    NOT NULL,
  correction_source     TEXT    NOT NULL DEFAULT 'human_ui',  -- 'human_ui' | 'agent_assist' (future)
  confirmed_by          TEXT    NOT NULL DEFAULT 'user',
  corrected_at          TEXT    NOT NULL DEFAULT (datetime('now')),
  flag_type             TEXT    NOT NULL,         -- 'red' | 'yellow'
  ocr_value_snapshot    TEXT,                     -- raw OCR value string at correction time (null for yellow)
  image_value_snapshot  TEXT,                     -- raw image value string at correction time (null for yellow)
  anchor_status         TEXT    NOT NULL DEFAULT 'ok',  -- 'ok' | 'anchor_ambiguous' | 'anchor_missing'
  UNIQUE(report_id, row_id)                       -- one correction per table row; INSERT OR REPLACE is idempotency mechanism
);
CREATE INDEX IF NOT EXISTS idx_bhc_report ON bctc_human_corrections(report_id);
CREATE INDEX IF NOT EXISTS idx_bhc_stable_key ON bctc_human_corrections(report_id, label, page_number, statement_section);
```

**Key design notes:**
- `UNIQUE(report_id, row_id)` — one correction per table row. `INSERT OR REPLACE` on this key is the idempotency mechanism for repeated corrections to the same cell.
- `anchor_status` is set to `anchor_ambiguous` when the stable-key lookup returns >1 row after re-parse (disambiguation failure). The user can see this in the viewer.
- `code` stores the value from `bctc_table_rows.code` at correction time — it is the stable-key disambiguator for rows with duplicate labels in the same section/page.
- The `idx_bhc_stable_key` index supports the re-anchor query pattern: lookup by `(report_id, label, page_number, statement_section)`.

### 2.2 `financial_reports` — New Columns (idempotent ALTER)

Add to the existing migration block in `schema-financial-reports.ts`:

```typescript
// ── BCTC-HUMAN-CONFIRM: human confirmation status dimension ──────────────────
// confirm_status: PENDING | CONFIRMED (separate from refine_status)
// final_confirmed_at: ISO8601 UTC timestamp; NULL when not yet confirmed
// confirmed_by: reserved for future RBAC; always 'user' for single-user product
if (!colNames.has("confirm_status")) {
  db.exec("ALTER TABLE financial_reports ADD COLUMN confirm_status TEXT NOT NULL DEFAULT 'PENDING'");
}
if (!colNames.has("final_confirmed_at")) {
  db.exec("ALTER TABLE financial_reports ADD COLUMN final_confirmed_at TEXT");
}
if (!colNames.has("confirmed_by")) {
  db.exec("ALTER TABLE financial_reports ADD COLUMN confirmed_by TEXT DEFAULT 'user'");
}
```

Defaults: `confirm_status = 'PENDING'` for all existing rows (correct: nothing has been human-confirmed yet).

### 2.3 `bctc_table_rows` — `source_confidence` Column (idempotent ALTER)

```typescript
// ── BCTC-HUMAN-CONFIRM: source_confidence for ESC-5 gate ────────────────────
if (!colNames.has("source_confidence")) {
  db.exec("ALTER TABLE bctc_table_rows ADD COLUMN source_confidence REAL NOT NULL DEFAULT 1.0");
}
```

Default 1.0: existing rows have no flag information — treating them as fully confident is the correct non-breaking default. Rows written by `finalizeBctcRefineTool.ts` will have the parser-computed confidence from `BctcTableRow.source_confidence`. Corrected rows will be explicitly set to 1.0 by the correction write path.

**Implementation note on the existing gap in `finalizeBctcRefineTool.ts`:** `BctcTableRow.source_confidence` is already populated by the parser but the INSERT in `finalizeBctcRefineTool.ts` (lines 143-165) currently omits it. The fix is additive: add `source_confidence` to the INSERT column list and pass `row.source_confidence ?? 1.0`. This fix is part of the same migration-and-fix task for dev-mcp-server.

### 2.4 Migration Sequencing

All three schema changes are in the SAME migration block in `schema-financial-reports.ts`. The order within the block is:

1. `source_confidence` on `bctc_table_rows` — needed first because the correction write path and finalize path both depend on it.
2. `confirm_status`, `final_confirmed_at`, `confirmed_by` on `financial_reports` — needed for Layer 1 guard.
3. `bctc_human_corrections` CREATE TABLE IF NOT EXISTS — new table, no ALTER dependency.

All three are idempotent (PRAGMA table_info check before ALTER; CREATE TABLE IF NOT EXISTS). Safe to run on startup against a live DB.

---

## 3. DDD Layer Design

### 3.1 Infrastructure — `bctcHumanCorrectionsStore.ts`

**File:** `apps/mcp-server/src/infrastructure/db/bctcHumanCorrectionsStore.ts`
**DDD layer:** infrastructure

This is the ONLY place that touches `bctc_human_corrections`. All reads and writes go through this store.

```typescript
// Public API (all methods take db: Database as first arg via DI pattern)
export function upsertCorrection(db: Database, correction: HumanCorrectionRecord): void;
  // INSERT OR REPLACE on (report_id, row_id). Writes all columns.

export function getCorrectionsForReport(
  db: Database,
  report_id: string,
): HumanCorrectionRecord[];
  // SELECT * WHERE report_id = ? — used by finalize path (Layer 2 pin)

export function getCorrectionsMap(
  db: Database,
  report_id: string,
): Map<string, HumanCorrectionRecord>;
  // Returns Map keyed by stable anchor key: `${label}||${page_number}||${statement_section}||${code ?? ''}`
  // Used by applyCorrections post-pass

export function reAnchorCorrections(
  db: Database,
  report_id: string,
): void;
  // After re-parse, re-links row_id for each correction using stable key.
  // Sets anchor_status = 'ok' | 'anchor_ambiguous' | 'anchor_missing'.
  // Called inside the finalize transaction AFTER the new rows are inserted.

export function hasCorrection(db: Database, report_id: string, row_id: number): boolean;
  // Used by Layer 2 selective DELETE check.
```

**`HumanCorrectionRecord` type:**
```typescript
export interface HumanCorrectionRecord {
  id?: number;
  report_id: string;
  row_id: number;
  label: string;
  page_number: number;
  statement_section: string;
  code: string | null;
  old_value: number | null;
  new_value: number;
  correction_source: string;
  confirmed_by: string;
  corrected_at?: string;
  flag_type: string;
  ocr_value_snapshot: string | null;
  image_value_snapshot: string | null;
  anchor_status: string;
}
```

### 3.2 Application — `bctcFlagEnumerationService.ts`

**File:** `apps/mcp-server/src/application/usecases/bctcFlagEnumerationService.ts`
**DDD layer:** application (orchestrates infra reads, no writes)

```typescript
export interface FlaggedCell {
  row_id: number | null;         // null for EC-1 (no corresponding bctc_table_rows row)
  unit_id: string;
  page_number: number;
  label: string;
  statement_section: string;
  flag_type: "red" | "yellow";
  ocr_value: string | null;
  image_value: string | null;
  current_value: number | null;
  has_correction: boolean;
  corrected_value: number | null;
}

export interface FlagEnumerationResult {
  doc_id: string;
  confirm_status: string;
  final_confirmed_at: string | null;
  flag_count: number;
  flags: FlaggedCell[];
  has_flags: boolean;
  reason?: string;  // EC-3: 'refine_not_complete'
}

export function enumerateFlaggedCells(
  db: Database,
  report_id: string,
): FlagEnumerationResult;
```

**Algorithm:**
1. Read `financial_reports` for `confirm_status`, `final_confirmed_at`, `refine_status`.
2. If `refine_status` not in `['DONE', 'PARTIAL']` → return `{ has_flags: false, reason: 'refine_not_complete' }` (EC-3).
3. Read all `bctc_refined_units WHERE report_id = ? AND window_status = 'DONE'`.
4. For each unit, call `parseTrustFlag` (imported from `refinedMarkdownParser.ts`) on each cell. Note: `parseTrustFlag` is already exported as a named export — verify with grep; if not exported, architect mandates it be exported.
5. For each flagged cell: join to `bctc_table_rows` by `(report_id, page_number, label)` → get `row_id`, `value_current`. The join uses the same stable-key composite (label + page_number + statement_section + code-if-known). On no match: `row_id = null` (EC-1).
6. For each flagged cell with `row_id != null`: check `bctc_human_corrections` → populate `has_correction`, `corrected_value`.
7. Extract `ocr_value` / `image_value` from red flag reason clause using regex: `/OCR\s+([\d.,]+)\s+vs\s+image\s+([\d.,]+)/i`. On no match: both null (EC-2).

**Brownfield note on `parseTrustFlag`:** currently it is an unexported function in `refinedMarkdownParser.ts` (line 92: `function parseTrustFlag`). Dev-mcp-server must add `export` to this function. This is an additive 7-character change to `refinedMarkdownParser.ts` (add `export` keyword only) — does NOT change logic, does NOT violate NFR-3.

### 3.3 Application — `bctcCorrectionService.ts`

**File:** `apps/mcp-server/src/application/usecases/bctcCorrectionService.ts`
**DDD layer:** application (orchestrates FR-2 steps 1-6)

```typescript
export interface CorrectionInput {
  report_id: string;
  row_id: number;
  new_value: number;
  correction_source?: string;  // defaults to 'human_ui'
}

export interface CorrectionResult {
  ok: boolean;
  row_id?: number;
  new_value?: number;
  source_confidence?: number;
  error?: string;
  http_status?: number;
}

export function submitCorrection(
  db: Database,
  input: CorrectionInput,
): CorrectionResult;
```

**Steps:**
1. Validate `report_id` (UUID) + `row_id` (integer).
2. Read `financial_reports` for `confirm_status` — if `'CONFIRMED'` → return `{ ok: false, error: 'report_confirmed', http_status: 409 }` (FR-2 AC-FR2-6).
3. Read `bctc_table_rows WHERE id = row_id AND report_id = report_id` → get `old_value`, `label`, `page_number`, `statement_section`, `code`.
4. If no row found → `{ ok: false, error: 'row_not_found', http_status: 400 }`.
5. Read flag info from `bctcFlagEnumerationService.enumerateFlaggedCells` for this report → find the matching flagged cell → extract `flag_type`, `ocr_value_snapshot`, `image_value_snapshot`. If not found (EC-4 case where user confirms a non-flagged value): use `flag_type = 'yellow'`, snapshots null.
6. DB transaction: call `bctcHumanCorrectionsStore.upsertCorrection` + `UPDATE bctc_table_rows SET value_current = ?, source_confidence = 1.0 WHERE id = ?`.
7. Return `{ ok: true, row_id, new_value, source_confidence: 1.0 }`.

**Shared by HTTP handler (FR-2) and MCP tool (FR-9).** Both delegate to this function. Zero code duplication.

### 3.4 `applyCorrections` Helper — call site in `finalizeBctcRefineTool.ts`

This function is NOT a separate file — it is a private helper INSIDE `finalizeBctcRefineTool.ts`, called after `parseRefinedMarkdown` and before the INSERT loop.

```typescript
function applyCorrections(
  rows: BctcTableRow[],
  correctionsMap: Map<string, HumanCorrectionRecord>,
  // key format: `${label}||${page_number}||${statement_section}||${code ?? ''}`
): BctcTableRow[] {
  return rows.map(row => {
    const key = `${row.label}||${row.page_number}||${row.statement_section}||${row.code ?? ''}`;
    const correction = correctionsMap.get(key);
    if (!correction) return row;
    return { ...row, value_current: correction.new_value, source_confidence: 1.0 };
  });
}
```

Called in Phase 4 for each window's rows, before accumulating into `allTableRows`:
```typescript
const correctionMap = bctcHumanCorrectionsStore.getCorrectionsMap(db, report_id);
// ... for each unit:
const parsedRows = applyCorrections(parseResult.rows, correctionMap);
allTableRows.push(...parsedRows);
```

### 3.5 Interface — HTTP Route Handlers

**Three new handler files** (follow pattern of `bctcInspectHandler.ts`):

**`bctcFlagsHandler.ts`:**
- `GET /api/bctc-inspect/flags/{doc_id}` → `handleBctcInspectFlags(req, res, db, docId)`
- UUID-validates `docId`, calls `bctcFlagEnumerationService.enumerateFlaggedCells(db, docId)`, returns JSON.
- 404 when report not found, 400 for invalid UUID, 200 for all data cases (including empty flags).

**`bctcCorrectHandler.ts`:**
- `POST /api/bctc-inspect/correct/{doc_id}` → `handleBctcInspectCorrect(req, res, db, docId)`
- Parses JSON body `{ row_id: number, new_value: number }`, calls `bctcCorrectionService.submitCorrection(db, input)`.
- 409 when `error: 'report_confirmed'`, 400 for validation errors, 200 on success.

**`bctcConfirmHandler.ts`:**
- `POST /api/bctc-inspect/confirm/{doc_id}` → `handleBctcInspectConfirm(req, res, db, docId)`
- `POST /api/bctc-inspect/confirm/{doc_id}/reset` → `handleBctcInspectConfirmReset(req, res, db, docId)`
- Confirm: `UPDATE financial_reports SET confirm_status = 'CONFIRMED', final_confirmed_at = datetime('now') WHERE id = ?`. Idempotent (AC-FR3-1: re-confirm updates timestamp, returns 200).
- Reset: `UPDATE financial_reports SET confirm_status = 'PENDING', final_confirmed_at = NULL WHERE id = ?`. Does NOT delete `bctc_human_corrections` records (AC-FR3-2).

### 3.6 Interface — MCP Tools

**`listFlaggedBctcCellsTool.ts`:**
- Tool name: `list_flagged_bctc_cells`
- Input: `{ report_id: z.string() }`
- Delegates to `bctcFlagEnumerationService.enumerateFlaggedCells(db, report_id)`
- Returns same shape as FR-1. Returns `{ flags: [] }` (not error) on empty (AC-FR8-2).

**`submitBctcCorrectionTool.ts`:**
- Tool name: `submit_bctc_correction`
- Input: `{ report_id: z.string(), row_id: z.number().int(), new_value: z.number(), correction_source: z.string().optional() }`
- Delegates to `bctcCorrectionService.submitCorrection(db, input)` — same service as HTTP handler.
- Registry: `#145` and `#146`.

### 3.7 Interface — `bctc-inspector.html` Panel

**ADDITIVE ONLY** — no change to existing panes, PDF pane, OCR/MD pane, table pane, or agent/debug toggle.

New "Sửa tay / Xác nhận cuối" tab added to the existing tab bar (same pattern as existing toggle button). The tab is hidden until the user explicitly switches to it.

**Panel structure:**
- On load: calls `GET /api/bctc-inspect/flags/{doc_id}` to populate flag list.
- Per-cell widget: label, trang, loại cảnh báo (badge: đỏ/vàng), giá trị OCR, giá trị ảnh, giá trị hiện tại, numeric input pre-filled with `current_value`, "Xác nhận sửa" button.
- Number input uses a local `parseVnNumber(s)` JS function (same algorithm as the parser: strip `.`, replace `,` with `.`, parseFloat).
- On "Xác nhận sửa": POST to `/api/bctc-inspect/correct/{doc_id}`, re-fetch flags to refresh state.
- "ĐÃ XÁC NHẬN toàn bộ báo cáo" button: enabled only when all `flag_type: 'red'` cells have `has_correction: true` (AC-FR7-5). Yellow flags may remain uncorrected.
- Lock badge: when `confirm_status = 'CONFIRMED'`, show "ĐÃ XÁC NHẬN" badge, hide per-cell inputs, show "Đặt lại xác nhận" button.
- `has_pek` flag: the flags panel reads `has_pek` from the existing `/api/bctc-inspect/table/{doc_id}` response to maintain the PEK/legacy branch for the OCR and table panes. The flags panel itself is PEK-agnostic — it reads `bctc_refined_units` which is upstream of PEK. (AC-FR7-6).

---

## 4. Cron-Survival Mechanism (Concrete)

### 4.1 Layer 1 — Report-Level Skip in `get_bctc_pending_refine`

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts`

Add `AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')` to the WHERE clause that fetches pending reports. This ensures confirmed reports never appear in the refine queue.

This is the primary guard. The `confirm_status` column defaults to `'PENDING'` so existing rows are unaffected.

### 4.2 Layer 1 — Report-Level Skip in `docs/agents/refine_bctc_md/flow/main.md`

**File:** `docs/agents/refine_bctc_md/flow/main.md` — AGENT-FATHER ZONE (doc-owner: agent-father)

Add a confirm_status check in Phase 0, between Steps 2 and 3:

```markdown
2b. Confirm status guard: if `report.confirm_status == "CONFIRMED"`:
    - Log: `[refine-orchestrator] Report {report.id} is CONFIRMED — skipping refine`
    - Call task_release for the claim (if already claimed)
    - EXIT cleanly. Do NOT set refine_status to FAILED.
```

**Note to PM:** This file edit must be routed to agent-father (docs/agents/ is agent-father's zone). Do NOT assign to dev-mcp-server. Create a separate agent-father task for this edit.

**However:** since Layer 1 in `getBctcPendingRefineTool.ts` filters confirmed reports at source, the flow guard is a belt-and-suspenders safety net. The flow will never even receive a confirmed report in the normal path. But if `get_bctc_pending_refine` is called with different parameters by a future agent, the flow guard catches it.

### 4.3 Layer 2 — Cell-Level Pin in `finalizeBctcRefineTool.ts`

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` — DEV-MCP-SERVER ZONE

Replace the line 140 `DELETE FROM bctc_table_rows WHERE report_id = ?` with the selective delete:

```typescript
// Layer 1 guard: skip entirely if CONFIRMED
const confirmRow = db.prepare<{confirm_status: string}, [string]>(
  "SELECT confirm_status FROM financial_reports WHERE id = ?"
).get(report_id);
if (confirmRow?.confirm_status === 'CONFIRMED') {
  logger.info("[finalize_bctc_refine] report is CONFIRMED — skipping write", { report_id });
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, skipped: true, reason: 'confirmed' }) }] };
}

// Layer 2: selective delete — preserve corrected rows
// EC-7 prevention: single atomic transaction wraps both the check and the delete
db.transaction(() => {
  // Delete only rows NOT covered by a human correction
  db.prepare(`
    DELETE FROM bctc_table_rows
    WHERE report_id = ?
      AND id NOT IN (
        SELECT row_id FROM bctc_human_corrections WHERE report_id = ?
      )
  `).run(report_id, report_id);

  // For DONE windows: apply corrections post-pass, then insert new rows
  const correctionMap = bctcHumanCorrectionsStore.getCorrectionsMap(db, report_id);
  for (const row of allTableRows) {
    const key = `${row.label}||${row.page_number}||${row.statement_section}||${row.code ?? ''}`;
    const correction = correctionMap.get(key);
    const finalRow = correction
      ? { ...row, value_current: correction.new_value, source_confidence: 1.0 }
      : row;
    insertStmt.run(/* finalRow fields including source_confidence */);
  }

  // Re-anchor corrections to new row IDs
  bctcHumanCorrectionsStore.reAnchorCorrections(db, report_id);

  // Update refine_status
  db.prepare("UPDATE financial_reports SET refine_status = ? WHERE id = ?")
    .run(report_status, report_id);
})();
```

**EC-7 prevention:** the Layer 2 selective delete and the insert are inside a single SQLite transaction. There is no partial-delete window — either both succeed or neither commits.

---

## 5. Anti-False-Green DV Gate

**Test file:** `apps/mcp-server/src/__tests__/HC-human-confirm.test.ts`

All tests use `new Database(':memory:')` injected via DI. No live DB. Tests are committed in the SAME commit as production code, RED before production code, GREEN after.

### 5.1 DV Tests (mandatory, minimum set)

| ID | What it tests | Anti-false-green constraint |
|---|---|---|
| DV-HC-1 | GET `/flags/{doc_id}` returns red flagged cells with `ocr_value` / `image_value` extracted from red prefix | Seed a `bctc_refined_units` row with known red-flag markdown; assert exact `ocr_value` and `image_value` strings |
| DV-HC-2 | GET `/flags/{doc_id}` returns yellow flag with null `ocr_value`/`image_value` | Seed yellow-flag markdown; assert both null |
| DV-HC-3 | POST `/correct/{doc_id}` writes `bctc_human_corrections` row; `bctc_table_rows.source_confidence` = 1.0 | After POST, read `bctc_human_corrections` and `bctc_table_rows` directly from `new Database(':memory:')` — NOT via HTTP response |
| DV-HC-4 | POST `/correct/{doc_id}` on confirmed report returns 409 | Set `confirm_status = 'CONFIRMED'` first; assert 409 status code in response |
| DV-HC-5 | POST `/confirm/{doc_id}` sets `confirm_status = 'CONFIRMED'` | After POST, direct DB read `SELECT confirm_status FROM financial_reports` |
| DV-HC-6 | POST `/confirm/{doc_id}/reset` clears status; correction records remain | After reset, assert `confirm_status = 'PENDING'`, assert `bctc_human_corrections` count unchanged |
| DV-HC-7 | `finalize_bctc_refine` on `confirm_status = 'CONFIRMED'` report — skips; all rows intact; `refine_status` unchanged | Call `finalize_bctc_refine` handler with DB override; assert `rows_stored` = 0 or `skipped: true`; direct DB read confirms rows unchanged |
| DV-HC-8 | `finalize_bctc_refine` on partially-corrected report (`confirm_status = 'PENDING'`, 1 correction) — corrected row pinned with `source_confidence = 1.0`; uncorrected rows updated | Direct DB read post-finalize: corrected row has `source_confidence = 1.0`; corrected `value_current` = `new_value` from correction; uncorrected rows have parser-computed confidence |
| DV-HC-9 | `source_confidence` column exists on `bctc_table_rows` after migration; run migration twice → column exists once, no error | `PRAGMA table_info(bctc_table_rows)` after `initFinancialReportsTables(db)` twice |
| DV-HC-10 | `submit_bctc_correction` MCP tool delegates to same service as HTTP handler | Spy on `bctcCorrectionService.submitCorrection`; verify called once from both paths |
| DV-HC-11 | Re-anchor never mis-attaches — duplicate-label report | Seed two rows with the same label but different `code` on the same page/section; apply correction to first; re-parse; assert correction lands on the correct row (by `code`) |
| DV-HC-12 | `anchor_status = 'anchor_ambiguous'` when stable key is genuinely ambiguous | Seed two rows with identical `(label, page_number, statement_section, code=null)`; apply correction; run `reAnchorCorrections`; assert `anchor_status = 'anchor_ambiguous'` |
| DV-HC-13 | Idempotency ×3 — correct same cell 3 times → single correction record, `new_value` is latest | INSERT OR REPLACE; assert `SELECT COUNT(*) FROM bctc_human_corrections WHERE report_id = ? AND row_id = ?` = 1 |

### 5.2 Persistence DV (QA gate — NFR-2)

QA verifies via direct in-container `market.db` read using `new Database(path)` (bun:sqlite), NOT via HTTP response alone:
- After FR-2: `SELECT new_value, source_confidence FROM bctc_human_corrections JOIN bctc_table_rows` directly.
- After FR-3: `SELECT confirm_status, final_confirmed_at FROM financial_reports WHERE id = ?` directly.
- After simulated cron re-run on confirmed report: `SELECT source_confidence FROM bctc_table_rows WHERE report_id = ?` directly — all corrected rows must have `source_confidence = 1.0`.

**Balance badge is FORBIDDEN as the sole gate.** ESC-5 clearing is verified by the `source_confidence` value in `bctc_table_rows`, not by the balance pass result.

---

## 6. Risk Flags

| Risk | Severity | Mitigation |
|---|---|---|
| `parseTrustFlag` currently unexported from `refinedMarkdownParser.ts` | MEDIUM | dev-mcp-server adds `export` keyword — 7-char additive change. No logic change. |
| `finalizeBctcRefineTool.ts` `allTableRows` type does not include `source_confidence` | HIGH (current silent data loss) | Same task as Layer 2 guard — add `source_confidence` to accumulator type and INSERT SQL. Covered by DV-HC-9 regression. |
| Duplicate-label race in anchor key | LOW-MEDIUM | Mitigated by `code` discriminator + `anchor_status` flag. DV-HC-11/12 prove the guard. |
| EC-7: race between selective DELETE and correction insert | MEDIUM | Prevented by single SQLite transaction wrapping the check + delete + insert. No partial-delete window. |
| `bctc_human_corrections.row_id` goes stale after DELETE+INSERT in re-parse | MEDIUM | `reAnchorCorrections()` re-links `row_id` inside the finalize transaction, immediately after INSERT. DV-HC-8 proves survival. |
| Viewer HTML panel: Vietnamese number input format mismatch | LOW | `parseVnNumber` JS function identical to TS parser function. DV-HC-3 exercises the write path; EC-5 handled at UI layer only. |
| agent-father edit to `refine_bctc_md/flow/main.md` delayed → Layer 1 flow guard absent | LOW | `getBctcPendingRefineTool.ts` WHERE clause is the primary guard. Flow guard is belt-and-suspenders. Product is safe even if flow edit is delayed by one sprint. |

---

## 7. File-List Delta by Zone

### Zone: apps/mcp-server/ — dev-mcp-server

**CREATE:**
- `apps/mcp-server/src/infrastructure/db/bctcHumanCorrectionsStore.ts` — infrastructure; corrections CRUD + re-anchor
- `apps/mcp-server/src/application/usecases/bctcFlagEnumerationService.ts` — application; flag scan + join
- `apps/mcp-server/src/application/usecases/bctcCorrectionService.ts` — application; correction orchestration (shared by HTTP + MCP)
- `apps/mcp-server/src/interface/mcp/routes/bctcFlagsHandler.ts` — interface; `GET /api/bctc-inspect/flags/{doc_id}`
- `apps/mcp-server/src/interface/mcp/routes/bctcCorrectHandler.ts` — interface; `POST /api/bctc-inspect/correct/{doc_id}`
- `apps/mcp-server/src/interface/mcp/routes/bctcConfirmHandler.ts` — interface; `POST /api/bctc-inspect/confirm/{doc_id}` + `/reset`
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/listFlaggedBctcCellsTool.ts` — interface/MCP; `list_flagged_bctc_cells` (#145)
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/submitBctcCorrectionTool.ts` — interface/MCP; `submit_bctc_correction` (#146)
- `apps/mcp-server/src/__tests__/HC-human-confirm.test.ts` — DV tests; RED-before/GREEN-after same commit

**MODIFY (additive only):**
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — add 3 migration blocks (source_confidence on bctc_table_rows, confirm_status/final_confirmed_at/confirmed_by on financial_reports, CREATE TABLE bctc_human_corrections)
- `apps/mcp-server/src/application/utils/refinedMarkdownParser.ts` — add `export` to `parseTrustFlag` function (7-char change, no logic change)
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` — add Layer 1 confirm_status guard + Layer 2 selective delete + applyCorrections post-pass + source_confidence in INSERT + reAnchorCorrections call
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts` — add `AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')` to WHERE clause
- `apps/mcp-server/src/interface/mcp/tools/registry.ts` — add 2 imports (#145, #146) + 2 array entries
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/index.ts` — add 2 barrel exports for new tools
- `apps/mcp-server/src/interface/mcp/server.ts` — add 4 new route dispatch entries (flags GET, correct POST, confirm POST, confirm/reset POST); import the 3 new handler files
- `apps/mcp-server/src/interface/mcp/routes/bctc-inspector.html` — add "Sửa tay / Xác nhận cuối" tab + panel (additive; all existing elements untouched)

**DELETE:** none.

### Zone: docs/agents/ — agent-father

**MODIFY (1 file, 1 step addition):**
- `docs/agents/refine_bctc_md/flow/main.md` — add confirm_status guard in Phase 0 (Step 2b). This is an agent-father zone file. PM must create a separate agent-father task for this single-step addition.

**Note:** `docs/agents/refine_bctc_md/flow/main.md` is owned by agent-father. Any edit must go through agent-father, NOT dev-mcp-server.

---

## 8. Key Decisions Table

| Decision | Value |
|---|---|
| ARCH-DECIDE A — override injection | Post-pass (Option A2). `applyCorrections()` helper at `finalizeBctcRefineTool.ts` call site. Parser unchanged. |
| ARCH-DECIDE B — re-anchor stable key | `(report_id, label, page_number, statement_section, code_or_null)`. `reAnchorCorrections()` in infra store. Ambiguous keys get `anchor_status = 'anchor_ambiguous'` (safe-fail: no mis-apply). |
| Correction write path | HTTP handler → `bctcCorrectionService` → `bctcHumanCorrectionsStore` + direct UPDATE on `bctc_table_rows`. MCP tool delegates to same service (zero duplication). |
| Layer 1 guard location | `getBctcPendingRefineTool.ts` WHERE clause (primary) + `refine_bctc_md/flow/main.md` Phase 0 (belt-and-suspenders). |
| Layer 2 guard location | `finalizeBctcRefineTool.ts` — selective DELETE + applyCorrections post-pass. Single transaction (EC-7 prevention). |
| `parseTrustFlag` export | Add `export` to `refinedMarkdownParser.ts` — 7-char additive. No logic change. |
| `source_confidence` INSERT gap | Fixed in `finalizeBctcRefineTool.ts` (additive: add column to accumulator + INSERT). Same task as Layer 2. |
| MCP tool numbering | `list_flagged_bctc_cells` = #145, `submit_bctc_correction` = #146. |
| DV gate | `HC-human-confirm.test.ts`, 13 cases. Persistence verified via direct `new Database(':memory:')` reads. Balance badge forbidden as sole gate. |
| Zone routing | All code in `apps/mcp-server/` → dev-mcp-server. `docs/agents/refine_bctc_md/flow/main.md` → agent-father (separate task). |

---

## 9. Notes for PM Task Decomposition

The PM should decompose into AT MINIMUM these disjoint-zone tasks:

1. **HC-DEV-1 (dev-mcp-server):** Schema migrations (source_confidence, confirm_status, bctc_human_corrections) + infra store (`bctcHumanCorrectionsStore.ts`) + application services (`bctcFlagEnumerationService.ts`, `bctcCorrectionService.ts`). Foundation layer — must complete first.

2. **HC-DEV-2 (dev-mcp-server):** `finalizeBctcRefineTool.ts` modifications (Layer 1 + Layer 2 + applyCorrections + source_confidence INSERT + reAnchorCorrections) + `getBctcPendingRefineTool.ts` WHERE clause + `parseTrustFlag` export. Depends on HC-DEV-1 (needs the store and the column).

3. **HC-DEV-3 (dev-mcp-server):** HTTP route handlers (bctcFlagsHandler, bctcCorrectHandler, bctcConfirmHandler) + server.ts dispatch entries. Depends on HC-DEV-1 (needs the services).

4. **HC-DEV-4 (dev-mcp-server):** MCP tools (listFlaggedBctcCellsTool, submitBctcCorrectionTool) + registry.ts + index.ts barrel. Depends on HC-DEV-1 (needs the services).

5. **HC-DEV-5 (dev-mcp-server):** DV test file (`HC-human-confirm.test.ts`, all 13 cases). Committed in SAME commit as production code for the task it covers. Not a separate sprint step — must be bundled with each production task.

6. **HC-DEV-6 (dev-mcp-server):** `bctc-inspector.html` flags panel. Depends on HC-DEV-3 (needs the HTTP endpoints to be live). Can be done after HC-DEV-1/3.

7. **HC-AF-1 (agent-father):** `docs/agents/refine_bctc_md/flow/main.md` Phase 0 confirm_status guard (Step 2b). Single step, independent of dev-mcp-server tasks (can run in parallel with HC-DEV-2).

---

## 10. Notebook Update

```
## BCTC-HUMAN-CONFIRM HC-ARCH (2026-05-30) — DESIGN COMPLETE

**Task:** HC-ARCH. Architecture brief for BCTC human-in-the-loop correction layer.

**ARCH-DECIDE A:** Post-pass override (Option A2). `applyCorrections()` helper at finalizeBctcRefineTool.ts call site. `parseTrustFlag` exported from refinedMarkdownParser.ts (7-char additive). Parser internals 0-diff.

**ARCH-DECIDE B:** Stable key = `(report_id, label, page_number, statement_section, code_or_null)`. `reAnchorCorrections()` in `bctcHumanCorrectionsStore.ts`. Ambiguous anchor → `anchor_status = 'anchor_ambiguous'` (safe-fail, no mis-apply). DV-HC-11/12 prove this.

**Key gap found:** `finalizeBctcRefineTool.ts` lines 143-165 INSERT omits `source_confidence` (parser computes it but accumulator type and SQL both drop it). Fix is in HC-DEV-2 scope.

**Key gap found:** `parseTrustFlag` in `refinedMarkdownParser.ts` is not exported. Must be exported for `bctcFlagEnumerationService.ts` to use it without duplicating logic.

**File-list delta:** 9 new files (dev-mcp-server), 8 modified files (dev-mcp-server), 1 modified file (agent-father). No deletions.

**Brief:** `docs/architecture-briefs/2026-05-30-bctc-human-confirm.md`
**Handoff:** `docs/handoffs/HC-ARCH.md`
```

---

## RETURN

```
DONE: Technical design complete for sprint BCTC-HUMAN-CONFIRM.
ZONE: apps/mcp-server/ (primary, dev-mcp-server) + docs/agents/ (1 file edit, agent-father)
NEXT: pm — decompose into ≥7 disjoint-zone tasks per §9 above; route HC-AF-1 to agent-father, all HC-DEV-* to dev-mcp-server
HANDOFF: docs/handoffs/HC-ARCH.md
PIPELINE: continue
```

---

## ADDENDUM HC-ARCH-2 — Transaction Ordering Root-Cause Ruling (2026-05-30)

**Triggered by:** QA-2 failure (cycle-155) on Gate 3 — second failed round on `finalizeBctcRefineTool.ts`.
**Recurring-bug-escalation discipline:** 2 fix commits on same module → architect root-cause ruling before any further point-fix.

### Root Cause — One Sentence

`reAnchorCorrections` runs while BOTH the old pinned row (preserved by selective DELETE) AND the newly inserted parser row co-exist in `bctc_table_rows` for the same stable key, so the stable-key lookup always returns 2 matches, which the safe-fail branch correctly flags as `anchor_ambiguous` — but incorrectly, because the duplicate is transient, not genuine.

### Full Causal Chain

The transaction has five mutation steps. Their execution order determines what `reAnchorCorrections` sees when it queries `bctc_table_rows`:

**Current (broken) order — after HC-FIX-1:**

```
A. Record pinnedRowIds = OLD row IDs from bctc_human_corrections
B. Selective DELETE bctc_table_rows (preserve pinned old rows)        ← old row SURVIVES
C. INSERT all parser rows (corrected via applyCorrections)            ← new row INSERTED
D. reAnchorCorrections → stable-key query                            ← sees 2 rows: BUG
E. DELETE old pinned rows
```

At step D, `bctc_table_rows` for a corrected label contains:
- Row from step B survivor: old pinned row with OLD id (e.g. id=5), old value
- Row from step C insert: new parser row with NEW id (e.g. id=42), corrected value

Both share the same `(report_id, label, page_number, statement_section, code)` stable key.
`matches.length === 2` → `anchor_status = 'anchor_ambiguous'`. This is the QA-2 failure.

**Before HC-FIX-1 (cycle-154 bug):**

```
A. Unconditional DELETE bctc_table_rows for report  ← pinned rows lost
B. INSERT all parser rows
C. reAnchorCorrections                              ← sees 1 new row: anchor_status='ok'
                                                    ← but old pinned row is gone = duplicates via re-insert
```
HC-FIX-1 fixed the duplicate by adding the selective DELETE + old-row cleanup, but introduced the ordering bug.

### Canonical Ordered Step List (BINDING — fixer implements exactly this)

The correct order resolves both the QA-1 bug (duplicates) and the QA-2 bug (false anchor_ambiguous) and preserves the genuine-ambiguous safe-fail:

```
Step 1. Record pinnedRowIds
        Query: SELECT DISTINCT row_id FROM bctc_human_corrections WHERE report_id = ?
        Purpose: capture the OLD integer PKs that correspond to corrected rows.
        Must happen BEFORE any DELETE because the correction records still point to old IDs.

Step 2. Selective DELETE (preserve pinned old rows)
        DELETE FROM bctc_table_rows WHERE report_id = ? AND id NOT IN (pinnedRowIds)
        Purpose: clear all non-corrected rows so parser rows can be inserted cleanly.
        Old pinned rows survive temporarily — they hold the corrected value as written by submitCorrection.

Step 3. INSERT all parser rows (with applyCorrections post-pass already applied)
        INSERT INTO bctc_table_rows ... for each row in finalRows
        Purpose: lay down the full re-parsed row set, with corrected values overlaid via applyCorrections.
        At this point, for each corrected label: TWO rows exist — old pinned + new parser.

Step 4. DELETE old pinned rows
        DELETE FROM bctc_table_rows WHERE id = ? AND report_id = ? for each id in pinnedRowIds
        Purpose: eliminate the old pinned rows NOW, BEFORE reAnchorCorrections runs.
        After this step: exactly ONE row per corrected label exists in bctc_table_rows (the new parser row).
        Genuinely ambiguous cases (two rows with identical stable key in the FINAL set) are unaffected —
        if the parser itself produces two rows with the same stable key, both remain and reAnchorCorrections
        will correctly detect matches.length > 1 → anchor_ambiguous. This is not regressed.

Step 5. reAnchorCorrections(db, report_id)
        For each correction: stable-key query on bctc_table_rows.
        At this point exactly one row per non-ambiguous corrected label exists.
        matches.length === 1 → UPDATE row_id = new_id, anchor_status = 'ok'. CORRECT.
        matches.length > 1 → anchor_ambiguous (genuine duplicate in final row set). CORRECT.
        matches.length === 0 → anchor_missing. CORRECT.

Step 6. UPDATE financial_reports SET refine_status = ? WHERE id = ?
        No ordering dependency with steps 4/5; must be inside the same transaction.
```

**All six steps are inside a single SQLite `db.transaction()` call (EC-7 prevention unchanged).**

### Why No Other Step Has an Ordering Issue

- **`applyCorrections` vs INSERT:** `applyCorrections` runs BEFORE the transaction (pure in-memory map transform on `allTableRows` → `finalRows`). It has no DB dependency and produces no side effects. Its placement before the transaction is correct and must not move.
- **`getCorrectionsMap` call:** also runs before the transaction (reads `bctc_human_corrections` to build the post-pass map). Correct placement — reads the correction store before any DELETE might perturb it.
- **Layer 1 confirm-guard:** runs before any of the six steps, before the transaction. Correct — it is a pure read + early return.
- **`getCorrectionsForReport` inside `reAnchorCorrections`:** reads `bctc_human_corrections`, not `bctc_table_rows`. Unaffected by the row ordering.
- **Step 1 (pinnedRowIds read) vs Step 2 (selective DELETE):** Step 1 must precede Step 2. This is already correct in the current code. Do not change it.
- **Step 6 (refine_status update) ordering:** no dependency on steps 4/5. It is correct at the end of the transaction.

### The One-Line Code Change

Move the `for (const oldRowId of pinnedRowIds)` DELETE loop from AFTER `reAnchorCorrections` to BEFORE it.

Current (broken, lines 261-270 of `finalizeBctcRefineTool.ts`):
```typescript
reAnchorCorrections(db, report_id);

// Delete stale OLD pinned rows: after re-anchor ...
for (const oldRowId of pinnedRowIds) {
  db.prepare(`DELETE FROM bctc_table_rows WHERE id = ? AND report_id = ?`).run(oldRowId, report_id);
}
```

Correct (canonical) order:
```typescript
// Delete stale OLD pinned rows BEFORE re-anchor, so reAnchorCorrections
// sees exactly one row per corrected label (the newly inserted parser row).
for (const oldRowId of pinnedRowIds) {
  db.prepare(`DELETE FROM bctc_table_rows WHERE id = ? AND report_id = ?`).run(oldRowId, report_id);
}

reAnchorCorrections(db, report_id);
```

This is the complete fix. No structural change. No new functions. No schema change.

### Genuine-Ambiguous Safe-Fail — Not Regressed

The genuine-ambiguous case (two rows with identical stable key in the FINAL row set, i.e., the parser emits two rows with the same label+page+section+code=null) still correctly reaches `anchor_ambiguous` after this fix, because:

1. Both parser rows are inserted in Step 3.
2. Neither is in `pinnedRowIds` (they are new rows, not previously pinned).
3. Step 4 deletes only old pinned rows. Both new duplicate rows survive.
4. Step 5 `reAnchorCorrections` finds `matches.length === 2` → `anchor_ambiguous`. Correct.

The fix does not affect this path.

### Invariant Tests — DV-HC-8 Amendment + New DV-HC-14

**DV-HC-8 (amend — current assertion is insufficient):**

Current DV-HC-8 asserts `source_confidence=1.0` and `value_current=new_value` for corrected rows post-finalize. It does NOT assert `anchor_status`. The QA-2 failure proves this gap.

**DV-HC-8 must also assert:**
- `SELECT anchor_status FROM bctc_human_corrections WHERE report_id = ? AND label = ?` = `'ok'`
- `SELECT COUNT(*) FROM bctc_table_rows WHERE report_id = ? AND label = ?` = `1`
- Both assertions via direct `new Database(':memory:')` read (not HTTP response)

RED: run DV-HC-8 against current broken code → `anchor_status = 'anchor_ambiguous'` fails the `'ok'` assertion.
GREEN: run after the single-line reorder → passes.

**DV-HC-14 (new — genuine-ambiguous safe-fail must have its own test):**

Current DV-HC-12 tests `reAnchorCorrections` in isolation. A test is needed that runs the full `finalize_bctc_refine` transaction end-to-end with a genuinely ambiguous parser output (two rows with identical stable key in the final set) and asserts `anchor_status = 'anchor_ambiguous'` + the correction is NOT applied to either row.

Scenario seed:
1. `bctc_human_corrections` has one correction for label "Khác", page=1, section="income_statement", code=null.
2. `bctc_refined_units` markdown produces TWO rows with label "Khác", page=1, section="income_statement", code=null (parser-level genuine duplicate).
3. Run `finalizeBctcRefineTool` (full handler via `buildFinalizeBctcRefineHandler(db)`).
4. Assert: `SELECT anchor_status FROM bctc_human_corrections WHERE report_id = ?` = `'anchor_ambiguous'`.
5. Assert: `SELECT COUNT(*) FROM bctc_table_rows WHERE report_id = ? AND label = 'Khác'` = `2` (both rows survive, neither carries the correction's `new_value`).

RED: run before the fix → `anchor_status` is already `'anchor_ambiguous'` (happens to pass), BUT `COUNT = 1` because old-pinned-delete happened after re-anchor in the broken code, which may accidentally delete one of the genuine duplicates. Verify seed carefully.
GREEN: run after the fix → `anchor_status = 'anchor_ambiguous'` AND `COUNT = 2`. Both assertions must pass together.

**DV-HC-14 is committed in the SAME commit as the production fix (same commit as DV-HC-8 amendment).**

### Routing

- **Code edit:** dev-mcp-server. Single file: `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`. Move the `for (const oldRowId of pinnedRowIds)` DELETE block to before `reAnchorCorrections(db, report_id)`.
- **Test additions:** dev-mcp-server. `apps/mcp-server/src/__tests__/HC-human-confirm.test.ts`. Amend DV-HC-8 (add `anchor_status='ok'` + `COUNT==1` assertions). Add DV-HC-14 (genuine-ambiguous full-transaction test).
- **Both in the same commit as the fix. RED-before/GREEN-after.**
- Do NOT touch `bctcHumanCorrectionsStore.ts`. The `reAnchorCorrections` function logic is correct. The bug is solely in the call site's ordering.
- Do NOT touch any other file.

### Non-Negotiables

- Main branch only
- Minimal fix: reorder only, no rewrite
- DV-HC-8 amended + DV-HC-14 new, same commit as fix
- RED-before/GREEN-after proven
- Never ask user to run code
