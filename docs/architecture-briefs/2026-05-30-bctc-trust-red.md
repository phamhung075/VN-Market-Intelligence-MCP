# Architecture Brief — BCTC-TRUST-RED: Trust Layer Green-Stamps Fabricated Data

**Sprint:** BCTC-TRUST-RED
**Author:** architect
**Date:** 2026-05-30
**Triggered by:** PO re-triage commit ebe89761, overturning prior DEFER 09353af0
**Status:** DESIGN COMPLETE — NEXT: ba → pm → dev-mcp-server → qa
**Priority:** HIGHEST (data-integrity RED)

---

## 0. Problem Statement (Confirmed Facts)

The refine trust layer reports `refine_status=DONE` and `confidence=0.80–0.85` on data that is:
1. **Fabricated at runtime**: FPT Q1-2026 (`e8ea3df5-3f32-413d-a3eb-c71634c0438d`) refined units contain ordered digit-run values (`12345678901234`, `2345678901234`, `8901234567890`, `5678901234567`). OCR never emits ascending-digit sequences; these are hallucinated or manually seeded mock values pushed via `push_bctc_refined_unit` into live `market.db`.
2. **Temporally impossible**: All 15 FPT units share one identical `refined_at = 2026-05-30 11:18:58`. A genuine parallel Haiku fan-out writes units at staggered timestamps due to network and API latency.
3. **Semantically self-contradictory**: FPT prior-period revenue appears as three irreconcilable values across units (16,058 / 11,481 / 20,225 tỷ). ACB `get_bctc_full` shows `gross_profit = net_revenue` (100% margin — physically impossible for a bank), and `operating_profit`, `EBITDA`, `equity`, `liabilities`, `cash` all zero.
4. **Structured feed is poisoned**: `get_bctc_full(FPT)` and `get_bctc_full(ACB)` surface these values to the analyst agent and market dishes. The balance check "passes" because `total_assets = total_liabilities + equity` holds only because both decomposition subtotals are zeroed (both sides of a forced-zero equality pass).

**Cross-report scope**: FPT + ACB confirmed contaminated with `refine_status=DONE`. GAS + VHM have no BCTC data (`"Chưa có dữ liệu"`). At minimum 2 DONE reports are poisoned.

---

## 1. Brownfield Zone Detection

| Zone | Owner | What is touched |
|---|---|---|
| `apps/mcp-server/` | dev-mcp-server | **ALL work in this sprint.** TR-0 purge SQL + publish guard in feed tool; TR-1 sanity validator in `refinedMarkdownParser.ts` + `pushBctcRefinedUnitTool.ts`; QA test file |
| `apps/pdf-extractor/` | dev-pdf-extractor | **Zero touch in this sprint.** TR-2 coverage gaps route to BCTC-LAYOUT-FIRST (existing charter). |
| `docs/agents/refine_bctc_md/` | agent-father | **Zero touch in this sprint.** Refine agent flow files are not the source of fabricated data (data was pushed by an external actor via `push_bctc_refined_unit`). |

**BUILD-STANDARD: lean** (all zones exist; TR-0 + TR-1 are data-guard additions, not new services).

---

## 2. Root Cause Split

The three tracks are independent failure modes at different seams. Naming them precisely prevents fix confusion.

### RC-0: No Ingest Gate on push_bctc_refined_unit (TR-0 root)

`pushBctcRefinedUnitTool.ts` currently accepts ANY markdown + confidence payload from the caller and performs `INSERT OR REPLACE` unconditionally. There is no validation that the content is genuine OCR-extracted data. The `reset=true` path deletes all prior rows and re-inserts, meaning a single tool call can erase a real prior refine and substitute fabricated content. The tool returns `{ ok: true, unit_id }` regardless of value quality.

Consequence: an agent session (or manual call via gateway) pushed 15 units with digit-run values and confidence 0.80 into FPT's live report, setting `refine_status=DONE`. The pipeline treated this as a legitimate refine and the structured feed (`get_bctc_full`) consumed it.

**The seam for TR-0:** `pushBctcRefinedUnitTool.ts` (ingest gate, REJECT before INSERT) + `bctcFullTools.ts` (publish guard, REFUSE to serve when decomposition is absent).

### RC-1: Confidence Measures OCR Legibility, Not Semantic Validity (TR-1 root)

The trust signal architecture has two layers:
- **`parseTrustFlag`** in `refinedMarkdownParser.ts`: reads inline `[ĐỘ TIN CẬY THẤP — ...]` markers emitted by the Haiku refine agent. These markers are present ONLY when the agent itself detects an OCR-vs-image discrepancy. If the agent emits no marker, `source_confidence = 1.0`.
- **`confidence` in `bctc_refined_units`**: set by the caller of `push_bctc_refined_unit`; reflects the Haiku agent's self-reported confidence on OCR legibility (can a human read this page clearly).

Neither layer performs semantic validation of the actual numbers. An agent that emits `confidence=0.85` on a page where every value is a 14-digit ascending sequence will not be flagged by either mechanism. The `bctc_balance_checks` table balance pass checks `total_assets = total_liabilities + equity` arithmetically but cannot detect a forced-zero balance (both sides zero).

**The seam for TR-1:** A new `BctcSanityValidator` pure function in `apps/mcp-server/src/domain/services/financial-reports/` — domain layer, no I/O. Called by `pushBctcRefinedUnitTool.ts` at ingest time (before INSERT). Violations block `window_status=DONE`; the unit is written as `window_status=REJECTED_SANITY` with specific flags.

### RC-2: Coverage Gaps (TR-2 scope, BCTC-LAYOUT-FIRST)

The zero-valued fields (`operating_profit`, `EBITDA`, `equity`, `liabilities`, `cash` in ACB; opex codes 11/24/25/26 in FPT) are genuine extraction gaps from the layout-first pipeline, not fabricated values. They exist because:
- P&L opex decomposition lines (codes 11, 24, 25, 26) are not captured by the current refine agent sub-flows (Haiku sees the window but does not emit those codes).
- Balance sheet equity/liabilities decomposition is absent (the agent emits a summary-row total but no children).
- Cash flow OCF is fragmented across pages 9/10/16 and the continuation-stitch sub-flow loses context.

These are OCR/extraction coverage issues, not trust-layer failures. Fixing them requires changes to `docs/agents/refine_bctc_md/` sub-flows and potentially the BCTC-LAYOUT-FIRST Tier 0–3 pipeline (`apps/pdf-extractor/`). They belong under BCTC-LAYOUT-FIRST as acceptance evidence (acceptance criterion: refine_status=DONE reports must have non-zero equity, non-zero EBITDA, non-null opex codes for at least 3 of the 4 target codes).

**TR-2 disposition: ROUTE TO BCTC-LAYOUT-FIRST, not this sprint.** Rationale: TR-2 fixes require multi-agent sub-flow authoring (agent-father) + pdf-extractor Tier 0–3 changes (dev-pdf-extractor), neither of which is safe to interleave with the TR-0/TR-1 data-integrity hotfix (which must ship first). PM must add these as acceptance criteria to the BCTC-LAYOUT-FIRST LF-EXTRACT + LF-QA tasks.

---

## 3. TR-0 Design: Quarantine + Publish Guard

### 3.1 Immediate Purge (one-time SQL, dev-mcp-server)

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.ts` (add purge-trigger doc comment) — the actual purge is a one-time in-container SQL execution by ops/dev.

**Purge SQL (run once in-container via `bun run /tmp/purge-mock.ts`):**
```sql
-- Identify contaminated reports: all 15 units share one refined_at timestamp
-- and have digit-run values in markdown
DELETE FROM bctc_table_rows WHERE report_id IN (
  'e8ea3df5-3f32-413d-a3eb-c71634c0438d'
  -- ACB report_id: dev must query: SELECT id FROM financial_reports WHERE action_code='ACB' ORDER BY sort_key DESC LIMIT 1
);
DELETE FROM bctc_refined_units WHERE report_id IN (
  'e8ea3df5-3f32-413d-a3eb-c71634c0438d'
  -- ACB report_id same
);
UPDATE financial_reports SET refine_status='PENDING' WHERE id IN (
  'e8ea3df5-3f32-413d-a3eb-c71634c0438d'
  -- ACB report_id same
);
```

This resets FPT + ACB to `refine_status=PENDING`, making them eligible for a legitimate refine cron run. The one-time SQL is NOT committed to migration code — it is a forensic cleanup, not a schema change.

**Important:** dev must verify ACB report_id via in-container DB query before running (the PO notebook only confirmed ACB pathology, not its UUID). Pattern: `new Database('/app/data/market.db').query("SELECT id FROM financial_reports WHERE action_code='ACB' ORDER BY sort_key DESC LIMIT 1").get()`.

### 3.2 Publishable Definition (Binding)

A report is **publishable** when ALL of the following hold. If any fails, the structured feed (`get_bctc_full`, `bctc_table_rows`) MUST refuse to serve the report's refined data:

| Condition | Check | Failure response |
|---|---|---|
| PUB-1: refine_status | `refine_status IN ('DONE', 'PARTIAL')` | Return "Chưa có dữ liệu BCTC" (no change from current no-data path) |
| PUB-2: non-empty decomposition | `bctc_table_rows COUNT(*) WHERE report_id = ? AND value_current IS NOT NULL > 0` | Return error: "refine data absent — report has no extracted rows" |
| PUB-3: balance sheet has children | At least one `bctc_table_rows` row with `statement_section='balance_sheet'` AND `is_summary_row=0` (a non-total child row) | Return error: "balance sheet has no decomposition — forced-zero pass suspected" |
| PUB-4: no REJECTED_SANITY units | `bctc_refined_units` has zero rows WHERE `window_status='REJECTED_SANITY'` AND `report_id=?` — OR — if partial report is still useful, block only the sections whose units are all REJECTED_SANITY | Return warning in output with flagged sections |

**Where to implement PUB-1 through PUB-4:**

`get_bctc_full` currently has no publish guard. Add a `checkPublishability(db, reportId)` helper function in `bctcFullTools.ts` (same file, application-layer logic). Call it immediately after the `latestRow` query. If check fails, return the human-readable refusal text instead of building the three sections.

PUB-1 requires knowing the report_id from the `financial_reports` row. The `latestRow` query already returns the `id` column (add it to `ReportRow` if not present — it is the PK). PUB-2 through PUB-4 are a small set of COUNT queries on `bctc_table_rows` and `bctc_refined_units`.

**DDD layer:** `checkPublishability` is application logic. It can live as a private helper in the interface tool file (the tool handler calls it before building output) — this is acceptable per DDD since the tool is the only consumer.

### 3.3 Ingest Gate on push_bctc_refined_unit

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.ts`

Add a pre-insert call to `BctcSanityValidator.validateUnit(markdown, confidence, flags)` (see §4). If the validator returns violations, the tool:
1. Writes the unit to `bctc_refined_units` with `window_status='REJECTED_SANITY'` (not DONE) and the violation list appended to `flags`.
2. Returns `{ ok: false, unit_id, rejected_reason: violations }`.

**The INSERT still happens** (visibility is preserved — a REJECTED_SANITY row in `bctc_refined_units` is visible in `get_bctc_refined` and in the bctc-inspect AI-input tab). Only the `window_status` differs. This gives the human inspector a full audit trail.

**finalizeBctcRefineTool.ts** must filter: parse only `window_status='DONE'` units (already does this via `WHERE window_status='DONE'`). No change needed there. The CONFIRMED guard (Layer 1) survives unchanged.

---

## 4. TR-1 Design: Semantic Sanity Gate

### 4.1 BctcSanityValidator (new domain service)

**File (CREATE):** `apps/mcp-server/src/domain/services/financial-reports/bctcSanityValidator.ts`
**DDD layer:** domain — pure function, no imports from infrastructure or interface.

```typescript
export interface SanityViolation {
  code: string;          // e.g. "DIGIT_RUN", "MAGNITUDE", "CROSS_STMT_REVENUE"
  description: string;   // human-readable, English
  severity: "BLOCK" | "WARN";  // BLOCK = reject DONE; WARN = downgrade confidence only
}

export interface SanityResult {
  valid: boolean;           // false = at least one BLOCK violation
  violations: SanityViolation[];
  adjusted_confidence: number;  // min(input_confidence, confidence_floor) per violations
}

export function validateBctcUnit(
  markdown: string,
  confidence: number,
  flags: string[],
  reportId: string,
  allUnitMarkdowns?: string[],  // all prior units for this report — for cross-statement check
): SanityResult;
```

### 4.2 Detector Specifications (binding)

**DT-1: Monotonic/Cyclic Digit-Run Detector** (BLOCK)

Target: values like `12345678901234`, `2345678901234`, `8901234567890`.

Algorithm:
1. Extract all numeric cell values from the markdown via `parseVnNumber`.
2. For each value `v`, convert to string (stripped of separators). If `v.toString()` matches the regex `/^(\d)\1{3,}$/` (all same digit, ≥ 4 digits) OR the digit sequence is a contiguous subsequence of `123456789012345678901234` or its cyclic rotation — flag `DIGIT_RUN`.

Implementation detail for cyclic-rotation check:
```typescript
const ASCENDING_CYCLE = "12345678901234567890";
const DESCENDING_CYCLE = "09876543210987654321";

function isDigitRun(numStr: string): boolean {
  if (numStr.length < 4) return false;
  if (/^(\d)\1{3,}$/.test(numStr)) return true;  // all-same digit
  const doubled = ASCENDING_CYCLE + ASCENDING_CYCLE;
  if (doubled.includes(numStr)) return true;       // ascending run
  const dDoubled = DESCENDING_CYCLE + DESCENDING_CYCLE;
  if (dDoubled.includes(numStr)) return true;       // descending run
  return false;
}
```

Threshold: if ≥ 2 distinct cell values in a window trigger `isDigitRun`, the window is `DIGIT_RUN` BLOCK. A single digit-run value is WARN (could be a BCTC code or page reference).

**DT-2: Magnitude Implausibility Detector** (WARN, BLOCK if both fail)

Target: gross_profit >= net_revenue (impossible for any real company except a pure-reseller with perfect margin, which a VN bank or tech company is not).

This detector operates at the `finalizeBctcRefineTool.ts` aggregate level (after parsing all units into `BctcTableRow[]`), not per-unit, because it requires cross-row comparison.

Algorithm (in `finalizeBctcRefineTool.ts` before the INSERT transaction):
1. From `allTableRows`, find the income statement rows: `statement_section = 'income_statement'`.
2. Identify net_revenue: row where `label` matches regex `/doanh thu thuần|net revenue/i` (summary row).
3. Identify gross_profit: row where `label` matches `/lợi nhuận gộp|gross profit/i` (summary row).
4. If both found: if `gross_profit >= net_revenue * 0.999` → violation `MAGNITUDE_GROSS_EQ_NET` (BLOCK).
5. Identify total_assets, total_liabilities, equity from balance_sheet section.
6. If all three found AND `|total_assets - (total_liabilities + equity)| < 0.01 * total_assets` AND `total_liabilities == 0` AND `equity == 0` → violation `BALANCE_FORCED_ZERO` (BLOCK). (Zero decomposition with a passing arithmetic check is the forced-zero scenario.)

**File for DT-2 checks:** `finalizeBctcRefineTool.ts` — add `detectMagnitudeViolations(rows: BctcTableRow[])` private helper. If BLOCK violations found: set `report_status='REJECTED_SANITY'` instead of 'DONE', write to `financial_reports.refine_status='REJECTED_SANITY'`, do NOT insert to `bctc_table_rows`. Write a structured `flags` JSON to `bctc_refined_units` for all units in the report.

**DT-3: Cross-Statement Revenue Consistency Detector** (BLOCK)

Target: the 3-way prior-period revenue contradiction (16,058 / 11,481 / 20,225 tỷ across units).

Algorithm (in `finalizeBctcRefineTool.ts` aggregate level):
1. From `allTableRows`, collect all rows matching `/doanh thu thuần/i` label across all units.
2. Extract `value_prior` values (non-null). If there are ≥ 3 distinct `value_prior` values with pairwise divergence > 20% of the max value → violation `CROSS_STMT_REVENUE_CONTRADICTION` (BLOCK).
3. Same for `value_current` (current period): ≥ 2 contradictory current-revenue values (same period, different units) → BLOCK.

Rationale: legitimate multi-page BCTC tables may show the same revenue figure twice (e.g. on a summary page and a detail page). The contradiction is real only when the same period's value differs by > 20% across units. The 20% threshold is generous to accommodate rounding.

**DT-4: Identical-Timestamp Detector** (WARN — administrative, not semantic)

A report where ALL `bctc_refined_units.refined_at` values are identical to the millisecond is suspicious (genuine fan-out staggers). Log WARN via `logger.warn` in `finalizeBctcRefineTool.ts`. Do NOT block on this alone — the semantic detectors (DT-1/DT-2/DT-3) are the primary gates. DT-4 is a forensic signal for the ops log.

### 4.3 Where Each Detector Fires

| Detector | File | Timing | Action on violation |
|---|---|---|---|
| DT-1 (digit-run) | `pushBctcRefinedUnitTool.ts` (calls `validateBctcUnit`) | At per-unit ingest | `window_status='REJECTED_SANITY'`, `ok: false` |
| DT-2 (magnitude) | `finalizeBctcRefineTool.ts` (calls `detectMagnitudeViolations`) | After full parse, before INSERT | `report_status='REJECTED_SANITY'`, no `bctc_table_rows` insert |
| DT-3 (cross-stmt revenue) | `finalizeBctcRefineTool.ts` (same helper) | Same as DT-2 | Same as DT-2 |
| DT-4 (identical timestamp) | `finalizeBctcRefineTool.ts` | After units read | `logger.warn` only, no block |

### 4.4 New Schema Value: REJECTED_SANITY

`financial_reports.refine_status` needs a new valid value: `'REJECTED_SANITY'`. This is a terminal state (not re-eligible for cron until manually reset to 'PENDING'). Add it to the enum comment in `schema-financial-reports.ts` and to `getBctcPendingRefineTool.ts`'s WHERE clause (exclude `REJECTED_SANITY` from the pending query — already excluded because that tool only selects `IN ('PENDING','PARTIAL')`).

`bctc_refined_units.window_status` also needs `'REJECTED_SANITY'`. The `finalizeBctcRefineTool.ts` WHERE clause (`window_status='DONE'`) naturally excludes REJECTED_SANITY units from parsing — no change needed. The `push_bctc_refined_unit` Zod schema for `window_status` currently allows only `"DONE" | "FAILED"`. Add `"REJECTED_SANITY"` to the enum.

**No ALTER TABLE needed** — both columns are TEXT (not a SQLite CHECK constraint); the new value is additive. Add the new enum value to the Zod schema and the comment in the DDL only.

---

## 5. TR-2 Disposition: Feed to BCTC-LAYOUT-FIRST

TR-2 comprises five coverage gaps identified by the prior EC sprint:
- EC-1: P&L opex codes 11/24/25/26 not captured (→ gross_profit = net_revenue, 100% margin artifact).
- EC-3: Equity/liabilities decomposition absent (→ balance sheet has only summary totals, no children).
- EC-4: CF fragmentation (pages 9/10/16; OCF = 0 in several reports).
- EC-5: Prior-period column drift (88,142 → 68,586 tỷ discrepancy between units on the same report).
- EC-1b: EBITDA = 0 (operating_profit not mapped to `ebitda` field).

**Architect ruling: TR-2 feeds BCTC-LAYOUT-FIRST as acceptance evidence, not a parallel sprint.**

Reasoning:
1. These are OCR/extraction deficiencies — the data is absent, not fabricated. DT-2's `BALANCE_FORCED_ZERO` guard (§4.2) will flag the symptom (zero equity + zero liabilities with a passing balance check) so the analyst is warned, but the root fix requires better extraction.
2. Fixing EC-1 through EC-5 requires: (a) enriched Haiku sub-flows for opex/equity/CF section recognition (`docs/agents/refine_bctc_md/flow/`), and (b) BCTC-LAYOUT-FIRST Tier 0–3 zone geometry to correctly segment multi-page equity/CF sections (`apps/pdf-extractor/`). Both are in the BCTC-LAYOUT-FIRST charter.
3. Interleaving TR-2 fixes into BCTC-TRUST-RED would block this sprint (dev-pdf-extractor zone conflict) and delay the data-integrity fix.

**PM action required:** Add TR-2 items as LF-QA acceptance criteria in the BCTC-LAYOUT-FIRST charter. Specifically:
- LF-QA gate must assert: FPT Q1-2026 refine output contains ≥1 non-zero row for each of opex codes 11, 24, 25, 26.
- LF-QA gate must assert: ACB balance sheet has non-zero `equity_total` and non-zero `total_liabilities` after refine.
- LF-QA gate must assert: FPT `ebitda` field is non-zero after refine.
- LF-QA gate must assert: cash_flow section has OCF extracted from page 9 OR 10 OR 16 (≥1 non-zero OCF row).

---

## 6. Anti-False-Green QA Mandate

### 6.1 QA Test File

**File (CREATE):** `apps/mcp-server/src/__tests__/TRUST-RED-sanity-gate.test.ts`

QA must prove RED-before-GREEN for each gate in the same commit.

### 6.2 Required Test Cases

**TR-RED-1: DT-1 digit-run inject — BLOCK**
```typescript
// Inject a fabricated unit with ordered digit-run values
const fakeMarkdown = `| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |
|---|---|---|---|
| 100 | Doanh thu thuần | 12345678901234 | 8901234567890 |
| 200 | Lợi nhuận gộp | 23456789012345 | 7890123456789 |`;

// Call pushBctcRefinedUnitTool handler with this markdown, confidence=0.85
const result = await handler({ report_id: "test-rpt", unit_id: "u0", page_numbers: [1], markdown: fakeMarkdown, confidence: 0.85, flags: [], window_status: "DONE" });
const parsed = JSON.parse(result.content[0].text);
expect(parsed.ok).toBe(false);
expect(parsed.rejected_reason).toContain("DIGIT_RUN");

// Verify DB: window_status = 'REJECTED_SANITY', NOT 'DONE'
const db = new Database(":memory:"); // via test setup
// ... (use test DB from setup.ts)
const row = db.query("SELECT window_status FROM bctc_refined_units WHERE unit_id='u0'").get();
expect(row.window_status).toBe("REJECTED_SANITY");
```

**TR-RED-2: DT-2 magnitude violation — BLOCK finalize**
```typescript
// Seed bctc_refined_units with a DONE unit whose markdown has gross_profit = net_revenue
const grossEqNetMarkdown = `BẢNG KẾT QUẢ HOẠT ĐỘNG KINH DOANH
| Mã số | Chỉ tiêu | Số cuối kỳ | Số đầu kỳ |
|---|---|---|---|
| 10 | Doanh thu thuần | 100000 | 90000 |
| 20 | Lợi nhuận gộp | 100000 | 90000 |`;

// Seed unit, call finalizeBctcRefineTool with report_status='DONE'
// Verify: financial_reports.refine_status = 'REJECTED_SANITY' (not 'DONE')
// Verify: bctc_table_rows COUNT = 0 (no rows inserted)
```

**TR-RED-3: DT-3 cross-statement revenue contradiction — BLOCK finalize**
```typescript
// Seed two DONE units for same report with contradictory prior-period revenue
// Unit A: prior revenue = 16058000 (16,058 tỷ)
// Unit B: prior revenue = 11481000 (11,481 tỷ)  — 29% divergence > 20% threshold
// Verify: finalize → refine_status = 'REJECTED_SANITY'
```

**TR-RED-4: Publish guard — refuse structured feed for REJECTED_SANITY report**
```typescript
// Seed a financial_reports row with refine_status='REJECTED_SANITY'
// Call get_bctc_full handler for this ticker
// Verify: output text contains refusal message (does NOT contain "Net Revenue :")
// Verify: output text contains no numeric financial values
```

**TR-RED-5: Clean data passes all gates**
```typescript
// Genuine markdown with realistic values (FPT-like but non-digit-run)
// gross_profit < net_revenue, no revenue contradiction
// Verify: push → window_status='DONE', ok=true
// Verify: finalize → refine_status='DONE', bctc_table_rows COUNT > 0
```

**TR-RED-6: Verify via direct bun:sqlite, NOT HTTP echo**
```typescript
// All COUNT assertions use:
import { Database } from "bun:sqlite";
// The test DB is :memory: via setup.ts preload (Bun.env.DB_PATH=':memory:')
// NEVER assert based on HTTP response `rows_parsed` field alone
// MUST do: db.query("SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id=?").get(reportId)
// and expect(cnt).toBe(0) for REJECTED cases or expect(cnt).toBeGreaterThan(0) for valid cases
```

### 6.3 Mandatory QA Protocol

1. Run each test with the gate DISABLED first (comment out the validator call in `pushBctcRefinedUnitTool.ts`). Confirm it passes (RED meaning the bug exists unguarded). This proves the gate is doing real work.
2. Enable the gate. Confirm the test now blocks correctly (GREEN meaning guard fires).
3. Run TR-RED-5 (clean data) to confirm no false positives on legitimate data.
4. After dev delivers, QA reads the DB directly via `bun run /tmp/q.ts` with `new Database('/app/data/market.db')` pattern. Count `bctc_refined_units` rows with `window_status='REJECTED_SANITY'` for the FPT + ACB report IDs after the purge SQL confirms they are cleared.

---

## 7. File List Delta

### MODIFY (dev-mcp-server zone only)

| File | Change |
|---|---|
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.ts` | Import `validateBctcUnit`; add pre-insert call; extend `window_status` Zod enum with `'REJECTED_SANITY'`; change return `{ ok: false, rejected_reason }` on BLOCK |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` | Import `detectMagnitudeViolations`; call after parse, before transaction; if BLOCK: write `refine_status='REJECTED_SANITY'`, skip `bctc_table_rows` insert; add DT-4 timestamp-uniformity WARN |
| `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` | Add `checkPublishability(db, reportId)` helper; call after `latestRow` query; return refusal text on PUB-3/PUB-4 failure |
| `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` | Add DDL comment noting `REJECTED_SANITY` as valid value for `refine_status` (no ALTER TABLE — TEXT column) |

### CREATE (dev-mcp-server zone only)

| File | Purpose |
|---|---|
| `apps/mcp-server/src/domain/services/financial-reports/bctcSanityValidator.ts` | DT-1 digit-run detector + `validateBctcUnit` export; domain layer, pure function |
| `apps/mcp-server/src/domain/services/financial-reports/bctcMagnitudeValidator.ts` | DT-2 magnitude + DT-3 cross-statement detectors + `detectMagnitudeViolations` export; domain layer, pure function |
| `apps/mcp-server/src/__tests__/TRUST-RED-sanity-gate.test.ts` | 6 QA test cases (TR-RED-1 through TR-RED-6); RED-before-GREEN in same commit |

### NOT TOUCHED (explicit)

| File | Reason |
|---|---|
| `apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts` | Unrelated sprint; 0-diff mandatory |
| `apps/pdf-extractor/infrastructure/text_table_extractor.py` | 0-diff mandatory per BCTC-AGENTIC-REFINE brief §2 |
| `apps/pdf-extractor/PDF-Extract-Kit/` (subtree) | Pristine; 0-diff mandatory |
| `docs/agents/refine_bctc_md/` | Not the source of fabrication; TR-2 routes elsewhere |
| Any file outside `apps/mcp-server/src/` and `docs/` | Out of zone |

---

## 8. Architecture Decisions Table

| Decision | Choice | Rationale |
|---|---|---|
| Purge strategy | One-time SQL + `refine_status='PENDING'` reset | Preserves audit trail in git history; DB returns to pre-fabrication state; next cron run produces genuine data |
| Ingest gate placement | `pushBctcRefinedUnitTool.ts` (interface layer, calls domain validator) | This is the ONLY external entry point for refined data; DDD: domain validator has no I/O |
| REJECTED_SANITY unit visibility | Write to `bctc_refined_units` with `window_status='REJECTED_SANITY'` | Human inspector sees the rejected unit in the AI-input tab (BCTC-AI-INPUT-TAB sprint); full audit trail |
| Publish guard placement | `bctcFullTools.ts` (PUB-2/PUB-3/PUB-4) | `get_bctc_full` is the single structured-feed tool; guard at the serve layer prevents poisoned data reaching analyst regardless of DB state |
| DT-2/DT-3 at finalize, not ingest | Per-unit ingest cannot see cross-unit contradictions | Revenue contradiction requires comparing units from different windows; only visible at finalize time |
| TR-2 to BCTC-LAYOUT-FIRST | Routing, not deferral | Coverage gaps need extraction-layer fixes (dev-pdf-extractor + agent-father); premature fix here creates zone conflict and delays TR-0/TR-1 |
| No new schema table | Reuse existing columns + new enum value | `REJECTED_SANITY` is a lifecycle state in an existing TEXT column; no schema migration needed |
| QA arbiter: bun:sqlite direct | `new Database('/app/data/market.db')` not HTTP | HTTP echo (`rows_parsed` in finalize response) is a false-green risk (counts parse output, not DB commit). Direct DB read is the only honest arbiter per mcp-server-write-wedge lesson. |

---

## 9. Handoff List

| Recipient | Task | Input |
|---|---|---|
| ba | Write formal spec for TR-0 (purge procedure + publishable definition + ingest gate schema) and TR-1 (three detectors + new file list). No new requirements beyond this brief. | This brief §3 + §4 + §7 |
| pm | Break into atomic developer tasks: TR0-DEV-1 (purge SQL + ingest gate + REJECTED_SANITY enum), TR0-DEV-2 (publish guard in bctcFullTools), TR1-DEV-1 (bctcSanityValidator DT-1), TR1-DEV-2 (bctcMagnitudeValidator DT-2+DT-3 + finalize integration), TR1-DEV-3 (DT-4 WARN), TRUST-QA-1 (6-case test file RED-before-GREEN). Sequence: purge first (TR0-DEV-1), then gates (TR1-*), then publish guard (TR0-DEV-2), then QA. | This brief §3–§7 |
| dev-mcp-server | Implement TR-0 + TR-1 in the files listed in §7. Zone: `apps/mcp-server/src/` only. See §3–§4 for detailed specs. Commit rule: scoped `git add` per file, never `-A`. Do NOT touch HCM-DISAMBIG-extraction.test.ts or any unrelated file. | PM task handoffs |
| pm (follow-up) | Add TR-2 items as LF-QA acceptance criteria in BCTC-LAYOUT-FIRST. See §5 for four specific gate assertions. | This brief §5 |

---

## 10. Build Standard Tag

```
BUILD-STANDARD: lean
NOTE: All zones (mcp-server) already exist. TR-0 + TR-1 are guard additions.
      No new microservice, no new table, no new Docker volume.
      dev-mcp-server drives end-to-end; no relay required.
```

---

## 11. Risk Flags

**RISK-1 (HIGH):** ACB report_id is not confirmed in the PO notebook. Dev must query the live DB before running purge SQL. Running the purge with a wrong UUID silently no-ops (WHERE IN clause misses), leaving contaminated data. **Mitigation:** dev runs SELECT first, verifies `action_code='ACB'` and `refine_status='DONE'`, then runs DELETE.

**RISK-2 (MED):** DT-1 digit-run regex may false-positive on legitimate BCTC code fields (e.g. a code `123456` for a line item). **Mitigation:** DT-1 requires ≥ 2 distinct values to be digit-runs before issuing a BLOCK (single hit = WARN). The threshold is in `validateBctcUnit`.

**RISK-3 (MED):** DT-2 magnitude check (`gross_profit >= net_revenue`) may false-positive for reports where gross_profit label maps incorrectly (label matching is regex-based). **Mitigation:** only apply DT-2 when both labels match with high confidence AND both are summary rows (`is_summary_row=1`). If either label is ambiguous (matched by <80% confidence), skip DT-2 and log WARN.

**RISK-4 (LOW):** CONFIRMED reports (HC sprint guard) are already protected by Layer 1 in `finalizeBctcRefineTool.ts`. The new REJECTED_SANITY state does not conflict with CONFIRMED — CONFIRMED is on `financial_reports.confirm_status` (separate column), not `refine_status`. They are orthogonal.
