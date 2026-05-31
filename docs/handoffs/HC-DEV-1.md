---
task_id: HC-DEV-1
sprint: BCTC-HUMAN-CONFIRM
agent: dev-mcp-server
status: READY
zone: apps/mcp-server/
depends_on: none
blocks: [HC-DEV-2, HC-DEV-3, HC-DEV-4]
date_assigned: 2026-05-30
---

# HC-DEV-1 — Schema Migrations + Infrastructure Layer

**Scope:** Foundation layer. Schema migrations (3 idempotent blocks), infrastructure store for corrections CRUD + re-anchor, application services for flag enumeration and correction orchestration. This task must complete first.

**Atomic goal:** All 4 new tables/columns exist, both application services callable with zero runtime errors, ready for Layer 2 guard and HTTP handlers.

---

## Files to Create

### Infrastructure (CRUD layer)

**`apps/mcp-server/src/infrastructure/db/bctcHumanCorrectionsStore.ts`**
- `upsertCorrection(db, correction: HumanCorrectionRecord): void` — INSERT OR REPLACE idempotency
- `getCorrectionsForReport(db, report_id): HumanCorrectionRecord[]` — all corrections for a report
- `getCorrectionsMap(db, report_id): Map<string, HumanCorrectionRecord>` — keyed by stable anchor `${label}||${page_number}||${statement_section}||${code ?? ''}`
- `reAnchorCorrections(db, report_id): void` — post-re-parse re-linking using stable key; sets `anchor_status = 'ok'|'anchor_ambiguous'|'anchor_missing'`
- `hasCorrection(db, report_id, row_id): boolean` — used by Layer 2 selective DELETE
- Type: `HumanCorrectionRecord` interface with all columns from schema §2.1

**Correctness invariants:**
- Stable key is `(report_id, label, page_number, statement_section)` + `code` as disambiguator (null for summary rows).
- Re-anchor query: `SELECT * FROM bctc_table_rows WHERE report_id = ? AND label = ? AND page_number = ? AND statement_section = ? AND (code = ? OR (code IS NULL AND ? IS NULL))`.
- Duplicate-label case (returns >1 row): set `anchor_status = 'anchor_ambiguous'`, do NOT apply correction to ANY row (safe-fail).
- Single match: update `row_id` + set `anchor_status = 'ok'`.
- No match: set `anchor_status = 'anchor_missing'`.

### Application (orchestration layer)

**`apps/mcp-server/src/application/usecases/bctcFlagEnumerationService.ts`**
- `FlaggedCell` interface: `row_id`, `unit_id`, `page_number`, `label`, `statement_section`, `flag_type` ('red'|'yellow'), `ocr_value`, `image_value`, `current_value`, `has_correction`, `corrected_value`
- `FlagEnumerationResult` interface: `doc_id`, `confirm_status`, `final_confirmed_at`, `flag_count`, `flags`, `has_flags`, `reason` (EC-3 when refine not complete)
- `enumerateFlaggedCells(db, report_id): FlagEnumerationResult`
  - Step 1: read `financial_reports` for `confirm_status`, `final_confirmed_at`, `refine_status`
  - Step 2: if `refine_status` not in `['DONE', 'PARTIAL']` → return `{ has_flags: false, reason: 'refine_not_complete' }` (EC-3)
  - Step 3: read all `bctc_refined_units WHERE report_id = ? AND window_status = 'DONE'`
  - Step 4: for each unit, parse markdown cells calling `parseTrustFlag` on each (must be exported from refinedMarkdownParser after HC-DEV-2)
  - Step 5: join flagged cells to `bctc_table_rows` by `(report_id, page_number, label, statement_section, code)` → get `row_id`, `value_current` (null row_id = EC-1)
  - Step 6: for each flagged cell with `row_id != null`, check `bctc_human_corrections` → populate `has_correction`, `corrected_value`
  - Step 7: extract `ocr_value`/`image_value` from red flag reason using regex `/OCR\s+([\d.,]+)\s+vs\s+image\s+([\d.,]+)/i` (null if no match = EC-2)

**`apps/mcp-server/src/application/usecases/bctcCorrectionService.ts`**
- `CorrectionInput` interface: `report_id`, `row_id`, `new_value`, `correction_source?` (defaults to 'human_ui')
- `CorrectionResult` interface: `ok`, `row_id?`, `new_value?`, `source_confidence?`, `error?`, `http_status?`
- `submitCorrection(db, input: CorrectionInput): CorrectionResult`
  - Validate `report_id` (UUID) + `row_id` (integer)
  - Read `financial_reports` for `confirm_status` — if `'CONFIRMED'` → return `{ ok: false, error: 'report_confirmed', http_status: 409 }`
  - Read `bctc_table_rows WHERE id = row_id AND report_id = report_id` → get `old_value`, `label`, `page_number`, `statement_section`, `code`
  - If no row → return `{ ok: false, error: 'row_not_found', http_status: 400 }`
  - Call `bctcFlagEnumerationService.enumerateFlaggedCells` → extract flag info for this cell → `flag_type`, `ocr_value_snapshot`, `image_value_snapshot`
  - If flagged cell not found (EC-4: non-flagged value): use `flag_type = 'yellow'`, snapshots null
  - DB transaction: call `bctcHumanCorrectionsStore.upsertCorrection` + `UPDATE bctc_table_rows SET value_current = ?, source_confidence = 1.0 WHERE id = ?`
  - Return `{ ok: true, row_id, new_value, source_confidence: 1.0 }`
- **Shared by:** `bctcCorrectHandler.ts` (HTTP) + `submitBctcCorrectionTool.ts` (MCP). Zero code duplication.

---

## Files to Modify

**`apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts`**
- Add 3 idempotent migration blocks in the existing migration pattern (lines 31-95):
  1. `source_confidence REAL NOT NULL DEFAULT 1.0` on `bctc_table_rows` (check `PRAGMA table_info` first)
  2. `confirm_status TEXT NOT NULL DEFAULT 'PENDING'`, `final_confirmed_at TEXT`, `confirmed_by TEXT DEFAULT 'user'` on `financial_reports`
  3. `CREATE TABLE IF NOT EXISTS bctc_human_corrections (...)` with schema from brief §2.1

**Pattern (idempotent PRAGMA-first check):**
```typescript
const colNames = new Set(db.prepare("PRAGMA table_info(bctc_table_rows)").all().map(col => col.name));
if (!colNames.has("source_confidence")) {
  db.exec("ALTER TABLE bctc_table_rows ADD COLUMN source_confidence REAL NOT NULL DEFAULT 1.0");
}
```

---

## Acceptance Criteria

### AC-HC-DEV-1-1 Schema
- [ ] `source_confidence` column exists on `bctc_table_rows` (default 1.0)
- [ ] `confirm_status`, `final_confirmed_at`, `confirmed_by` columns exist on `financial_reports` (defaults as specified)
- [ ] `bctc_human_corrections` table created with all columns from brief §2.1, unique index on `(report_id, row_id)`, stable-key index on `(report_id, label, page_number, statement_section)`
- [ ] Running migration twice (idempotency proof): columns/table exist once, zero errors

### AC-HC-DEV-1-2 Infrastructure Store
- [ ] `bctcHumanCorrectionsStore.upsertCorrection()` inserts/replaces one correction per row, indexed by `(report_id, row_id)`
- [ ] `getCorrectionsMap()` returns Map keyed by stable anchor `${label}||${page_number}||${statement_section}||${code ?? ''}`
- [ ] `reAnchorCorrections()` correctly handles:
  - Single match: update `row_id`, set `anchor_status = 'ok'`
  - Duplicate match (>1 rows): set `anchor_status = 'anchor_ambiguous'`, do NOT update row_id
  - No match: set `anchor_status = 'anchor_missing'`
- [ ] `hasCorrection()` returns boolean for use in Layer 2 selective DELETE

### AC-HC-DEV-1-3 Application Services
- [ ] `enumerateFlaggedCells()` returns `FlagEnumerationResult` with:
  - EC-3 handling (refine not complete → `reason: 'refine_not_complete'`)
  - Red flag regex extraction (OCR vs image values exact format match)
  - Yellow flag with null values
  - Correction status joined correctly
- [ ] `submitCorrection()` validates UUID + integer, checks confirm_status, handles row-not-found, transactionally writes both `bctc_human_corrections` and `bctc_table_rows`, returns correct shape
- [ ] Both services callable with `db: Database` parameter (DI pattern, no getDb() inside)

---

## DV Test Requirements (RED-before, GREEN-after, same commit)

**Test file:** `apps/mcp-server/src/__tests__/HC-human-confirm.test.ts` (bundled with this task)

**Minimum DV tests for HC-DEV-1 coverage (from brief §5.1):**
- DV-HC-9: `source_confidence` column exists after migration; idempotent (run twice)
- DV-HC-10: `submitCorrection` service callable (spy on its use by both HTTP + MCP later)
- DV-HC-13: Idempotency ×3 — correct same cell 3 times → single record, latest value

All tests use `new Database(':memory:')` with DI injection. Zero mocking framework calls.

---

## Exit Criteria

1. All 3 schema migrations deployed (PRAGMA-verified idempotent, zero errors on rerun)
2. `bctcHumanCorrectionsStore.ts` exports 5 public functions, all callable from test with in-memory DB
3. `bctcFlagEnumerationService.ts` exports `enumerateFlaggedCells` callable with in-memory DB (will fail on `parseTrustFlag` export missing — expected, HC-DEV-2 fixes)
4. `bctcCorrectionService.ts` exports `submitCorrection` callable with in-memory DB
5. HC-DEV-1 DV tests RED (baseline), GREEN after code; verify via direct DB reads (`SELECT * FROM bctc_human_corrections WHERE id = ?`)
6. **Persistence gate:** after service calls, `new Database(':memory:')` direct reads confirm rows inserted/updated as expected (NOT via service return value)

---

## Non-Negotiables (carry forward)

- Main branch only · Additive only · Scoped `git add` per file, never `-A`
- DV tests RED-before/GREEN-after, same commit as production
- Direct `new Database(':memory:')` verification, not HTTP response assertions
- No balance badge assertions
- Plain Vietnamese in any UI strings (none in this layer)
- Never ask user to run code

---

## RETURN

```
READY: HC-DEV-1 handoff. Creates schema + infra store + application services.
ZONE: apps/mcp-server/
DEPENDS_ON: none
BLOCKS: HC-DEV-2, HC-DEV-3, HC-DEV-4
DV_TESTS: DV-HC-9, DV-HC-10, DV-HC-13 (others bundle in later tasks)
NEXT: dev-mcp-server — implement and DV-test
DURATION: ~2h (schema + store + 2 services)
```
