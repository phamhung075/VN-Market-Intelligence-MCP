---
task_id: HC-DEV-2
sprint: BCTC-HUMAN-CONFIRM
agent: dev-mcp-server
status: DONE
zone: apps/mcp-server/
depends_on: [HC-DEV-1]
blocks: none
date_assigned: 2026-05-30
---

# HC-DEV-2 — Layer 1+2 Guards + `source_confidence` Fix

**Scope:** Layer 1 (report-level skip in `getBctcPendingRefineTool`), Layer 2 (cell-level pin + selective delete in `finalizeBctcRefineTool`), correct the `source_confidence` INSERT gap, and export `parseTrustFlag` from the parser. This is the critical guard layer preventing confirmed reports from being clobbered by cron refines.

**Atomic goal:** Confirmed reports skip refine entirely at source; confirmed cells survive re-parse; corrected rows have `source_confidence = 1.0`; parser's `parseTrustFlag` available for enumeration service.

**DEPENDS ON:** HC-DEV-1 (needs `bctcHumanCorrectionsStore` and schema columns)

---

## Files to Modify

### Layer 1 — Report-Level Skip in `getBctcPendingRefineTool.ts`

**`apps/mcp-server/src/interface/mcp/tools/financial-reports/getBctcPendingRefineTool.ts`**

In the WHERE clause that fetches pending reports, add:
```typescript
AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')
```

This ensures confirmed reports never appear in the refine queue. Pattern (find the existing SELECT statement):

```typescript
const pendingReports = db.prepare(`
  SELECT ... FROM financial_reports
  WHERE text_status = 'COMPLETE'
    AND (refine_status IS NULL OR refine_status IN ('PENDING', 'PARTIAL'))
    AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')
  ORDER BY extracted_at ASC
  LIMIT ?
`).all(limit);
```

**Correctness invariant:** confirmed reports = forever skipped from refine queue. This is the primary guard.

---

### Layer 2 — Finalize Tool Guard + Selective Delete

**`apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`**

**Structure:** the file has Phase 1-4. This task touches Phase 4 (collect then write).

**Phase 4 changes (concrete steps):**

1. **Layer 1 guard at entry** (before any DB writes):
```typescript
// After claim read, before Phase 1-3 loops:
const confirmRow = db.prepare<{confirm_status: string}, [string]>(
  "SELECT confirm_status FROM financial_reports WHERE id = ?"
).get(report_id);
if (confirmRow?.confirm_status === 'CONFIRMED') {
  logger.info("[finalize_bctc_refine] report is CONFIRMED — skipping write", { report_id });
  return { content: [{ type: "text" as const, text: JSON.stringify({ ok: true, skipped: true, reason: 'confirmed' }) }] };
}
```

2. **Fix `source_confidence` INSERT gap:**
   - Find the `allTableRows` accumulator (Type: `BctcTableRow[]`). Confirm it has `source_confidence: number` in the interface (it should, from HC-DEV-1 schema).
   - Find the `INSERT INTO bctc_table_rows (...)` statement (lines ~143-165). Add `source_confidence` to column list and pass `row.source_confidence ?? 1.0` to values.

3. **Layer 2 — Selective delete + re-anchor** (replace unconditional DELETE):
```typescript
db.transaction(() => {
  // Delete only rows NOT covered by a human correction
  db.prepare(`
    DELETE FROM bctc_table_rows
    WHERE report_id = ?
      AND id NOT IN (
        SELECT row_id FROM bctc_human_corrections WHERE report_id = ?
      )
  `).run(report_id, report_id);

  // For each window's rows: apply corrections post-pass, then insert
  const correctionMap = bctcHumanCorrectionsStore.getCorrectionsMap(db, report_id);
  for (const row of allTableRows) {
    const key = `${row.label}||${row.page_number}||${row.statement_section}||${row.code ?? ''}`;
    const correction = correctionMap.get(key);
    const finalRow = correction
      ? { ...row, value_current: correction.new_value, source_confidence: 1.0 }
      : row;
    insertStmt.run(/* finalRow fields including source_confidence */);
  }

  // Re-anchor corrections to new row IDs (inside transaction after INSERT)
  bctcHumanCorrectionsStore.reAnchorCorrections(db, report_id);

  // Update refine_status
  db.prepare("UPDATE financial_reports SET refine_status = ? WHERE id = ?")
    .run(refine_status, report_id);
})();
```

**Correctness invariants:**
- EC-7 prevention: selective DELETE + INSERT both inside single SQLite transaction. No partial-delete window.
- Corrected rows pin `source_confidence = 1.0` via `applyCorrections` post-pass (before INSERT).
- Re-anchor happens inside transaction after INSERT, ensuring row_id is fresh.
- Uncorrected rows pass through with their parser-computed `source_confidence`.

### Parser Export

**`apps/mcp-server/src/application/utils/refinedMarkdownParser.ts`**

Find the `function parseTrustFlag(...)` definition (currently unexported, line 92). Add `export`:

```typescript
export function parseTrustFlag(text: string): { flag_type?: string; reason?: string } | null {
  // ... existing logic unchanged
}
```

**Scope:** 7-character additive change only (add keyword `export `). NO logic change. This is required so `bctcFlagEnumerationService.ts` (HC-DEV-1) can call it without code duplication.

---

## Acceptance Criteria

### AC-HC-DEV-2-1 Layer 1 Guard
- [ ] `getBctcPendingRefineTool.ts` WHERE clause includes `AND (confirm_status IS NULL OR confirm_status != 'CONFIRMED')`
- [ ] Confirmed reports return empty from the tool (verified by DV test)

### AC-HC-DEV-2-2 Layer 2 Selective Delete
- [ ] Unconditional `DELETE FROM bctc_table_rows WHERE report_id = ?` replaced with selective version
- [ ] Corrected row IDs are excluded from DELETE (remain in DB after finalize)
- [ ] Uncorrected rows are deleted and re-inserted with new parsed values

### AC-HC-DEV-2-3 Layer 2 Re-Anchor
- [ ] `reAnchorCorrections()` called inside finalize transaction after INSERT
- [ ] Correction `row_id` values updated to new rows' IDs
- [ ] Ambiguous anchors logged with `anchor_status = 'anchor_ambiguous'` (do NOT apply correction)

### AC-HC-DEV-2-4 `source_confidence` Fix
- [ ] `source_confidence` added to INSERT column list + values (not omitted as before)
- [ ] Corrected rows have `source_confidence = 1.0` (from post-pass)
- [ ] Parser-computed confidence preserved in uncorrected rows

### AC-HC-DEV-2-5 `parseTrustFlag` Export
- [ ] `export` keyword added to function definition
- [ ] No logic change; existing internal calls unaffected

---

## DV Test Requirements (RED-before, GREEN-after, same commit)

**Test file:** `apps/mcp-server/src/__tests__/HC-human-confirm.test.ts` (continues from HC-DEV-1)

**Minimum DV tests for HC-DEV-2 coverage (from brief §5.1):**
- DV-HC-3: POST `/correct/{doc_id}` writes `bctc_human_corrections` row; `bctc_table_rows.source_confidence` = 1.0 (direct DB read, not HTTP response)
- DV-HC-7: `finalize_bctc_refine` on `confirm_status = 'CONFIRMED'` report — skips write entirely; rows unchanged; refine_status unchanged (verify via `rows_stored = 0` or `skipped: true` in response + direct DB count)
- DV-HC-8: `finalize_bctc_refine` on partially-corrected report (`confirm_status = 'PENDING'`, 1 correction) — corrected row pinned with `source_confidence = 1.0`; uncorrected rows updated with parser confidence; direct DB read confirms exact values
- DV-HC-11: Re-anchor never mis-attaches — duplicate-label report seed: two rows with same label but different `code` on same page/section; apply correction to first; finalize; re-anchor must attach to correct row (verify via stable-key composite + code)
- DV-HC-12: `anchor_status = 'anchor_ambiguous'` when stable key is genuinely ambiguous — seed two rows with identical `(label, page_number, statement_section, code=null)`; apply correction; run `reAnchorCorrections`; assert `anchor_status = 'anchor_ambiguous'` (do NOT apply correction)

All tests use `new Database(':memory:')` seeded with schema migrations from HC-DEV-1. Verify persistence via direct DB reads, NOT HTTP assertions.

---

## Exit Criteria

1. `getBctcPendingRefineTool.ts` WHERE clause guards confirmed reports (DV-HC-7 proves it)
2. `finalizeBctcRefineTool.ts` contains Layer 1 guard at entry + Layer 2 selective delete + applyCorrections post-pass + reAnchorCorrections in transaction
3. `source_confidence` column added to INSERT (not omitted), corrected rows = 1.0, uncorrected = parser value
4. `parseTrustFlag` exported (7-char change, no logic change verified)
5. HC-DEV-2 DV tests RED (baseline), GREEN after code
6. **Persistence gate:** after finalize on partially-corrected report, direct DB read confirms:
   - Corrected rows have correct `value_current` + `source_confidence = 1.0`
   - Uncorrected rows have parser confidence
   - Correction `row_id` values updated (re-anchored)
   - Confirmed reports skip finalize entirely (no new rows inserted, refine_status unchanged)

---

## Non-Negotiables (carry forward)

- Main branch only · Additive only · Scoped `git add` per file, never `-A`
- DV tests RED-before/GREEN-after, same commit as production
- Direct `new Database(':memory:')` verification via in-memory DB, not HTTP assertions
- No balance badge assertions
- SQLite transaction wraps both delete and insert (EC-7 prevention)
- Never ask user to run code

---

## RETURN

```
READY: HC-DEV-2 handoff. Layer 1+2 guards, source_confidence fix, parseTrustFlag export.
ZONE: apps/mcp-server/
DEPENDS_ON: HC-DEV-1 (schema, store)
BLOCKS: none (can be in parallel with HC-DEV-3/4 after HC-DEV-1)
DV_TESTS: DV-HC-3, DV-HC-7, DV-HC-8, DV-HC-11, DV-HC-12
NEXT: dev-mcp-server — implement guards and DV-test
DURATION: ~2h (3 files: 2 guard layers + 1 export)
SERIALIZATION: must complete before finalize tool is live (dev rebuilds container)
```
