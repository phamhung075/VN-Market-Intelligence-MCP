---
sprint: FIX-BCTC-FALLBACK-SHELL-REPORTS-STRUCTURALLY-UNEXTRACTABLE
branch: fix/bctc-fallback-shell-extraction-write
size: M
zone: apps/mcp-server/
depends_on: []
blocks: ["FIX-BCTC-FALLBACK-SHELL-REPORTS-READ-SIDE-FAST-FOLLOW"]
---

## TLDR

Replace format validation (isValidUuid regex) with existence validation (SELECT 1 FROM financial_reports WHERE id = ?) in 3 async PEK extraction callback handlers to unblock fallback-shell report writes. This fix directly resolves 66 stranded PDF extraction rows that are currently rejected at HTTP 400, freeing 63 real PDFs currently stuck on disk.

## [PM] Planning Context

- **Zone:** apps/mcp-server/ (interface/mcp/routes layer)
- **Acceptance Criteria:**
  - [ ] pushBctcLayoutHandler.ts: replace isValidUuid() format gate (line ~110) with DB existence check
  - [ ] pushBctcTableHandler.ts: replace isValidUuid() format gate (line ~105) with DB existence check
  - [ ] pushBctcMdTablesHandler.ts: replace isValidUuid() format gate (line ~89) with DB existence check
  - [ ] All 3 test suites (1272-push-bctc-layout.test.ts, pushBctcTableHandler.test.ts, 1270-push-bctc-md-tables.test.ts) have been updated with:
    - [ ] Happy-path fixture now seeds a financial_reports row for golden UUID before pushing (required fixture fix)
    - [ ] "invalid UUID returns 400" case relabeled/commented to reflect NEW validation reason (existence, not format)
    - [ ] NEW case: fallback-XXX-2025-Q4 row seeded, pushed with that report_id, asserts 200 + data lands
    - [ ] NEW case: syntactically valid but unknown UUID → 400 (proves tightened gate, not relaxed)
  - [ ] Test suite runs green locally (pnpm test:mcp)
  - [ ] Live verification (post-deploy): `SELECT COUNT(*) FROM bctc_layout_units WHERE report_id LIKE 'fallback-%'` and same for bctc_table_rows shows >=1 rows for tested fallback IDs
  - [ ] Docker logs (vn-market-intelligence-mcp-pdf-extractor-1) shows NO "HTTP 400" / "invalid_report_id: must be UUID" pushes for fallback- ids across 72h post-deploy window

- **Files to read first:**
  - docs/architecture-briefs/2026-08-05-fix-bctc-fallback-shell-reports-structurally-unextractable.md § 2 (Fix Design), § 3 (Test Strategy)
  - apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts:100-115 (validation block, db injection)
  - apps/mcp-server/src/interface/mcp/routes/pushBctcTableHandler.ts:95-110 (validation block, db injection)
  - apps/mcp-server/src/interface/mcp/routes/pushBctcMdTablesHandler.ts:80-100 (validation block, db injection)
  - apps/mcp-server/src/interface/bctcInspectHandler.ts:45-50 (isValidUuid definition — do NOT modify)

- **Files to modify (3 handlers):**
  - apps/mcp-server/src/interface/mcp/routes/pushBctcLayoutHandler.ts (lines ~107-113)
  - apps/mcp-server/src/interface/mcp/routes/pushBctcTableHandler.ts (lines ~102-108)
  - apps/mcp-server/src/interface/mcp/routes/pushBctcMdTablesHandler.ts (lines ~86-97)

- **Files to modify (3 test suites):**
  - apps/mcp-server/src/__tests__/1272-push-bctc-layout.test.ts (happy-path fixture + new cases)
  - apps/mcp-server/src/__tests__/pushBctcTableHandler.test.ts (happy-path fixture + new cases)
  - apps/mcp-server/src/__tests__/1270-push-bctc-md-tables.test.ts (happy-path fixture + new cases)

- **Files to read for test reference:**
  - apps/mcp-server/src/services/bctcReparseJob.ts:656-683 (minimal financial_reports insert shape for fallback rows)

- **Dependencies:** none (directly actionable)

- **Knowledge needed:**
  - docs/policies/dev-standards.md
  - docs/architecture-briefs/2026-08-05-fix-bctc-fallback-shell-reports-structurally-unextractable.md (full context)
  - SQLite prepare + parameter binding pattern (already in use in these handlers)
  - Jest fixture patterns (already in existing test suites)

## Implementation Notes

### Code Change Pattern (all 3 handlers identical)

Current (broken):
```ts
const reportId = parsed.report_id;
if (typeof reportId !== "string" || !isValidUuid(reportId)) {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "invalid_report_id: must be UUID", report_id: reportId }));
  return;
}
```

Corrected:
```ts
const reportId = parsed.report_id;
if (typeof reportId !== "string" || reportId.length === 0) {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "invalid_report_id: must be a non-empty string", report_id: reportId }));
  return;
}
const knownReport = db.prepare("SELECT 1 FROM financial_reports WHERE id = ?").get(reportId);
if (!knownReport) {
  res.writeHead(400, { "Content-Type": "application/json" });
  res.end(JSON.stringify({ error: "invalid_report_id: no matching financial_reports row", report_id: reportId }));
  return;
}
```

**Critical detail:** `db` is already dependency-injected into all 3 handler signatures. Zero new plumbing.

### Test Fixture Pattern (minimal financial_reports row)

Reference: bctcReparseJob.ts insert at line 656-683. Minimal required columns:
- id (PK)
- action_code, company_name, exchange, domain, period_year, period_quarter, period_type, period_start, period_end, sort_key
- parsed_at, extraction_confidence, data_env (→ 'production' for fallback- rows)
- 4 JSON columns ({})

Seed this in `beforeEach` or in each happy-path test before calling the handler, reusing the existing shape.

### Why This Fix Is Correct

1. **Correction, not relaxation:** The old UUID-format check accepted ANY syntactically-valid-but-nonexistent UUID, creating an orphan-write path today. The new existence check closes that.
2. **Zero injection risk:** Every write already fully parameterized; the UUID check was never load-bearing for injection safety.
3. **isValidUuid() stays untouched:** Still correctly used by its ~14 OTHER call sites (read side, inspect, correction handlers). Not part of this task (flagged as fast-follow, § 5 of brief).

## Verification Gate

Live probe at AC-2 72h mark (must await full reconcile cycle):
```sql
SELECT COUNT(*) FROM bctc_layout_units WHERE report_id LIKE 'fallback-%';
SELECT COUNT(*) FROM bctc_table_rows WHERE report_id LIKE 'fallback-%';
```
Must show >= 1 for any fallback ID known to have a pdf_path. No new RECONCILE-EXHAUSTED telegram reports citing fallback-% IDs.

---

**Task-boundary:** Write-path fix only. Read-side reachability (inspect, get_bctc_page_text, get_bctc_page_image, corrections, eval) remains blocked by ~14 more isValidUuid gates on the read side — flagged as separate fast-follow task per architect brief § 5, sequenced after this task's verification.
