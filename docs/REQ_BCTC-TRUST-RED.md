# Requirements Spec — BCTC-TRUST-RED: Trust Layer Sanity Gate

**Sprint:** BCTC-TRUST-RED
**Author:** BA
**Date:** 2026-05-30
**Source brief:** `docs/architecture-briefs/2026-05-30-bctc-trust-red.md` (commit 4c8cfaf7)
**Status:** SPEC COMPLETE — NEXT: pm

---

## 0. Context Summary

The refine trust layer accepts and serves fabricated data. FPT Q1-2026 (report `e8ea3df5-3f32-413d-a3eb-c71634c0438d`) and ACB (report UUID TBD — see Blocker B-1) are confirmed contaminated: fabricated digit-run values were pushed into `bctc_refined_units` via `push_bctc_refined_unit`, reaching `refine_status=DONE` and surfacing in `get_bctc_full`. This sprint adds three seams: an ingest gate on push, semantic sanity detectors on finalize, and a publishability guard on serve.

Zone: `apps/mcp-server/src/` only. No pdf-extractor. No agent flow files.

---

## 1. Functional Requirements

### TR-0: Quarantine + Publish Guard

---

#### FR-TR0-1: One-Time Purge of Contaminated Reports

**DDD Layer:** Infrastructure (one-time DB operation, not committed to migration code)

**Description:** The two confirmed-contaminated reports (FPT `e8ea3df5-3f32-413d-a3eb-c71634c0438d` and ACB — UUID to be determined by dev at runtime) must be purged from `bctc_table_rows` and `bctc_refined_units`, and reset to `refine_status='PENDING'` in `financial_reports`. This is a forensic cleanup that returns the reports to a state eligible for a genuine cron refine run.

**Purge SQL (run once in-container via `bun run /tmp/purge-mock.ts`):**
```sql
DELETE FROM bctc_table_rows WHERE report_id IN (<FPT_UUID>, <ACB_UUID>);
DELETE FROM bctc_refined_units WHERE report_id IN (<FPT_UUID>, <ACB_UUID>);
UPDATE financial_reports SET refine_status='PENDING' WHERE id IN (<FPT_UUID>, <ACB_UUID>);
```

**Important:** ACB report_id is NOT the ticker symbol. Dev must resolve it before running purge. Resolution query:
```typescript
new Database('/app/data/market.db')
  .query("SELECT id FROM financial_reports WHERE action_code='ACB' ORDER BY sort_key DESC LIMIT 1")
  .get()
```

**Acceptance Criteria:**

- AC-TR0-1-1: After purge, `SELECT COUNT(*) FROM bctc_refined_units WHERE report_id = '<FPT_UUID>'` returns 0.
- AC-TR0-1-2: After purge, `SELECT COUNT(*) FROM bctc_table_rows WHERE report_id = '<FPT_UUID>'` returns 0.
- AC-TR0-1-3: After purge, `SELECT refine_status FROM financial_reports WHERE id = '<FPT_UUID>'` returns `'PENDING'`.
- AC-TR0-1-4: Same three assertions hold for the ACB report_id once resolved.
- AC-TR0-1-5: `SELECT id FROM financial_reports WHERE action_code='ACB' ORDER BY sort_key DESC LIMIT 1` must return exactly one row before the purge runs (verification that the UUID is correct).
- AC-TR0-1-6: Purge SQL is NOT added to any migration file. It exists only as a documented one-time script. No `initFinancialReportsTables` or `ALTER TABLE` changes.

---

#### FR-TR0-2: REJECTED_SANITY Enum — Schema and Zod

**DDD Layer:** Infrastructure (schema comment) + Interface (Zod enum)

**Description:** The string value `'REJECTED_SANITY'` must be added as a valid lifecycle state for two existing TEXT columns. No `ALTER TABLE` is needed (both are SQLite TEXT columns, not CHECK-constrained enums). The changes are:
1. `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — add DDL comment noting `REJECTED_SANITY` as a valid `refine_status` value alongside `PENDING | IN_PROGRESS | DONE | FAILED | PARTIAL`.
2. `apps/mcp-server/src/interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.ts` — extend `window_status` Zod enum from `z.enum(["DONE", "FAILED"])` to `z.enum(["DONE", "FAILED", "REJECTED_SANITY"])`.

**Acceptance Criteria:**

- AC-TR0-2-1: `pushBctcRefinedUnitTool.ts` Zod schema for `window_status` includes `"REJECTED_SANITY"` as a valid enum member.
- AC-TR0-2-2: `schema-financial-reports.ts` DDL comment for `bctc_refined_units.window_status` and `financial_reports.refine_status` lists `REJECTED_SANITY` as a valid value.
- AC-TR0-2-3: `getBctcPendingRefineTool.ts` WHERE clause continues to select only `IN ('PENDING', 'PARTIAL')` — `REJECTED_SANITY` is naturally excluded without a code change, but this must be verified by reading the file.
- AC-TR0-2-4: TypeScript compilation succeeds without errors after the Zod enum change.

---

#### FR-TR0-3: Ingest Gate on push_bctc_refined_unit

**DDD Layer:** Interface (tool handler calls domain validator)

**Description:** `pushBctcRefinedUnitTool.ts` must call `validateBctcUnit` (from `bctcSanityValidator.ts`) before the INSERT. If the result contains any `BLOCK`-severity violation:
1. The INSERT still executes (audit trail preserved) but with `window_status='REJECTED_SANITY'` — NOT the caller-supplied `window_status`.
2. The violation list is appended to the `flags` JSON array stored in `bctc_refined_units.flags`.
3. The tool returns `{ ok: false, unit_id, rejected_reason: violations[] }` instead of `{ ok: true, unit_id }`.

If only `WARN`-severity violations are present, the unit is inserted with `window_status='DONE'` (or caller-supplied status) but with the `adjusted_confidence` from the validator substituted for the caller-supplied `confidence`.

**Acceptance Criteria:**

- AC-TR0-3-1: When markdown contains ≥ 2 digit-run values (DT-1), the returned JSON has `ok: false` and `rejected_reason` containing the string `"DIGIT_RUN"`.
- AC-TR0-3-2: When AC-TR0-3-1 triggers, the `bctc_refined_units` row has `window_status = 'REJECTED_SANITY'`, verified by direct `bun:sqlite` query — NOT by HTTP response alone.
- AC-TR0-3-3: When markdown contains exactly 1 digit-run value (single-hit = WARN), the returned JSON has `ok: true`, `window_status` is `'DONE'` (or caller-supplied), and `confidence` is reduced to `adjusted_confidence`.
- AC-TR0-3-4: When markdown is clean (no violations), the returned JSON has `ok: true` and `window_status` matches the caller-supplied value.
- AC-TR0-3-5: A `REJECTED_SANITY` unit is visible in `get_bctc_refined` (the AI-input tab reads `bctc_refined_units` — no filter on `window_status` in that query path; verify the tab shows the rejected unit).
- AC-TR0-3-6: The `reset=true` path continues to DELETE all prior units before push — the gate fires AFTER the reset DELETE, not before.

---

#### FR-TR0-4: Publishability Guard in get_bctc_full

**DDD Layer:** Application (helper function in interface tool file — `checkPublishability`)

**Description:** `bctcFullTools.ts` must add a `checkPublishability(db, reportId)` helper called immediately after the `latestRow` query (which already selects the `id` column as the report PK). The helper evaluates four conditions in sequence. If any condition fails, the tool returns the human-readable refusal text instead of building the three sections.

**Four Conditions (binding — all must pass):**

| ID | Condition | SQL Check | Failure text |
|---|---|---|---|
| PUB-1 | `refine_status IN ('DONE', 'PARTIAL')` | `SELECT refine_status FROM financial_reports WHERE id = ?` | "Chưa có dữ liệu BCTC" (unchanged from current no-data path) |
| PUB-2 | At least one `bctc_table_rows` row with non-null `value_current` | `SELECT COUNT(*) FROM bctc_table_rows WHERE report_id = ? AND value_current IS NOT NULL` > 0 | "refine data absent — report has no extracted rows" |
| PUB-3 | Balance sheet has at least one non-summary child row | `SELECT COUNT(*) FROM bctc_table_rows WHERE report_id = ? AND statement_section = 'balance_sheet' AND is_summary_row = 0` > 0 | "balance sheet has no decomposition — forced-zero pass suspected" |
| PUB-4 | No `REJECTED_SANITY` units for this report OR only partial sections are rejected | `SELECT COUNT(*) FROM bctc_refined_units WHERE report_id = ? AND window_status = 'REJECTED_SANITY'` = 0 (full pass) or return warning with flagged sections (partial pass) | Warning in output listing flagged section names; numeric data is still served for non-rejected sections |

**Note on PUB-1:** `latestRow` query selects the most recent `financial_reports` row by `sort_key DESC`. The `id` column (TEXT PK) must be included in the SELECT (it is currently present in `ReportRow` interface — verify `id` is in the query). If `refine_status` is not already in `ReportRow`, add it to the SELECT.

**Acceptance Criteria:**

- AC-TR0-4-1: Calling `get_bctc_full` for a report with `refine_status = 'REJECTED_SANITY'` returns text that does NOT contain "Net Revenue :" and does NOT contain any numeric financial values.
- AC-TR0-4-2: Calling `get_bctc_full` for a report with `refine_status = 'DONE'` but zero `bctc_table_rows` returns the "refine data absent" message.
- AC-TR0-4-3: Calling `get_bctc_full` for a report where `bctc_table_rows` has only `is_summary_row = 1` rows (no children) returns the "balance sheet no decomposition" message.
- AC-TR0-4-4: Calling `get_bctc_full` for a report with one or more `REJECTED_SANITY` units returns output containing a warning listing the rejected sections.
- AC-TR0-4-5: Calling `get_bctc_full` for a clean report (all PUB-1 through PUB-4 pass) returns the full three-section output (BCTC SUMMARY, comparison, sentiment).
- AC-TR0-4-6: `checkPublishability` does NOT use HTTP calls — it uses the injected `db` parameter directly (supports in-memory test DB).

---

### TR-1: Semantic Sanity Detectors

---

#### FR-TR1-1: BctcSanityValidator (new domain service — DT-1)

**DDD Layer:** Domain (pure function, no I/O, no infrastructure imports)

**File to create:** `apps/mcp-server/src/domain/services/financial-reports/bctcSanityValidator.ts`

**Description:** Exports `validateBctcUnit(markdown, confidence, flags, reportId, allUnitMarkdowns?)` returning a `SanityResult`. The function implements DT-1 (digit-run detector). It must be importable by the interface layer (`pushBctcRefinedUnitTool.ts`) without circular dependency.

**DT-1 Algorithm (binding):**
1. Extract all numeric cell values from the markdown (use `parseVnNumber` or equivalent — strip thousand separators, parse to string of digits).
2. For each numeric string `numStr` with length ≥ 4, call `isDigitRun(numStr)`:
   - Returns `true` if `numStr` matches `/^(\d)\1{3,}$/` (all-same digit, ≥ 4 digits).
   - Returns `true` if `numStr` is a contiguous substring of `"1234567890123456789012345678901234567890"` (doubled ascending cycle) — covers `12345678901234`, `23456789012345`, etc.
   - Returns `true` if `numStr` is a contiguous substring of `"0987654321098765432109876543210987654321"` (doubled descending cycle).
   - Returns `false` otherwise.
3. Count distinct digit-run values in the window.
   - Count = 0: no violation.
   - Count = 1: single WARN violation (`severity: "WARN"`, code `"DIGIT_RUN_SINGLE"`).
   - Count ≥ 2: BLOCK violation (`severity: "BLOCK"`, code `"DIGIT_RUN"`).
4. If any BLOCK violation: `valid: false`, `adjusted_confidence: min(confidence, 0.1)`.
5. If only WARN violations: `valid: true`, `adjusted_confidence: min(confidence, 0.4)`.

**Type contracts (binding):**
```typescript
export interface SanityViolation {
  code: string;          // "DIGIT_RUN" | "DIGIT_RUN_SINGLE"
  description: string;   // human-readable, English
  severity: "BLOCK" | "WARN";
}

export interface SanityResult {
  valid: boolean;
  violations: SanityViolation[];
  adjusted_confidence: number;
}

export function validateBctcUnit(
  markdown: string,
  confidence: number,
  flags: string[],
  reportId: string,
  allUnitMarkdowns?: string[],
): SanityResult;
```

**Acceptance Criteria:**

- AC-TR1-1-1: `validateBctcUnit` with markdown containing `"12345678901234"` and `"8901234567890"` (2 distinct digit-runs) returns `{ valid: false, violations: [{severity:"BLOCK", code:"DIGIT_RUN"}] }`.
- AC-TR1-1-2: `validateBctcUnit` with markdown containing exactly one digit-run value returns `{ valid: true, violations: [{severity:"WARN", code:"DIGIT_RUN_SINGLE"}] }`.
- AC-TR1-1-3: `validateBctcUnit` with realistic Vietnamese BCTC values (`"16,058"`, `"11,481"`, `"2,509,520"`) returns `{ valid: true, violations: [] }`.
- AC-TR1-1-4: `isDigitRun("1111")` returns `true` (all-same digit).
- AC-TR1-1-5: `isDigitRun("123")` returns `false` (length < 4).
- AC-TR1-1-6: `isDigitRun("1234")` returns `true` (ascending run, length ≥ 4).
- AC-TR1-1-7: `isDigitRun("1024")` returns `false` (not a monotonic run).
- AC-TR1-1-8: A legitimate BCTC numeric code like `"123456"` appearing ONCE in the markdown is classified as WARN (count = 1), not BLOCK — the threshold requires ≥ 2 distinct hits for BLOCK.
- AC-TR1-1-9: The function has zero imports from `infrastructure/` or `interface/` layers (verified by static grep on import statements).

---

#### FR-TR1-2: BctcMagnitudeValidator (new domain service — DT-2 + DT-3)

**DDD Layer:** Domain (pure function, no I/O)

**File to create:** `apps/mcp-server/src/domain/services/financial-reports/bctcMagnitudeValidator.ts`

**Description:** Exports `detectMagnitudeViolations(rows: BctcTableRow[])` returning a `SanityViolation[]`. Implements DT-2 (gross_profit / net_revenue magnitude check + forced-zero balance sheet) and DT-3 (cross-statement revenue contradiction).

**DT-2 Algorithm (binding):**

Income statement check:
1. From `rows`, find `statement_section = 'income_statement'`.
2. Identify `net_revenue`: `is_summary_row = 1` AND `label` matches `/doanh thu thu[aâ]n|net revenue/i`.
3. Identify `gross_profit`: `is_summary_row = 1` AND `label` matches `/l[oợ]i nhu[aậ]n g[oộ]p|gross profit/i`.
4. If both found AND both labels matched with label-match confidence ≥ 80% AND `gross_profit.value_current >= net_revenue.value_current * 0.999` → `MAGNITUDE_GROSS_EQ_NET` (BLOCK).
5. If label-match confidence is ambiguous (< 80% regex match certainty for either label), skip DT-2 income check and emit `MAGNITUDE_LABEL_AMBIGUOUS` (WARN only — do not block).

Balance sheet forced-zero check:
1. From `rows`, find `statement_section = 'balance_sheet'` with `is_summary_row = 1`.
2. Find `total_assets`, `total_liabilities`, `equity_total` summary rows by label match.
3. If all three found AND `total_liabilities = 0` AND `equity_total = 0` AND `Math.abs(total_assets - (total_liabilities + equity_total)) < 0.01 * total_assets` → `BALANCE_FORCED_ZERO` (BLOCK). (Zero decomposition with a passing arithmetic check is the forced-zero scenario.)

**DT-3 Algorithm (binding):**

1. From `rows`, collect all rows with `label` matching `/doanh thu thu[aâ]n/i` across all units.
2. Extract non-null `value_prior` values. Deduplicate (same value appearing twice is one data point).
3. If ≥ 3 distinct `value_prior` values: compute pairwise divergence as `|a - b| / max(a, b)` for all pairs. If any pair diverges > 20% → `CROSS_STMT_REVENUE_CONTRADICTION` (BLOCK).
4. Same logic for `value_current` (current period): ≥ 2 distinct current-revenue values with any pair diverging > 20% → `CROSS_STMT_REVENUE_CONTRADICTION` (BLOCK).

**Acceptance Criteria:**

- AC-TR1-2-1: `detectMagnitudeViolations` with `gross_profit = net_revenue = 100000` returns violations containing `{ severity: "BLOCK", code: "MAGNITUDE_GROSS_EQ_NET" }`.
- AC-TR1-2-2: `detectMagnitudeViolations` with `gross_profit = 30000, net_revenue = 100000` (30% margin — realistic) returns zero BLOCK violations.
- AC-TR1-2-3: `detectMagnitudeViolations` with `total_liabilities = 0, equity_total = 0, total_assets = 500000` (forced-zero balance) returns violations containing `{ severity: "BLOCK", code: "BALANCE_FORCED_ZERO" }`.
- AC-TR1-2-4: `detectMagnitudeViolations` with `total_liabilities = 200000, equity_total = 300000, total_assets = 500000` (realistic balance) returns zero BLOCK violations.
- AC-TR1-2-5: `detectMagnitudeViolations` with three distinct `value_prior` revenue rows `[16058000, 11481000, 20225000]` (29% divergence between 11481 and 20225 > 20% threshold) returns `{ severity: "BLOCK", code: "CROSS_STMT_REVENUE_CONTRADICTION" }`.
- AC-TR1-2-6: `detectMagnitudeViolations` with two `value_prior` revenue values that differ by < 5% (e.g. rounding) returns zero BLOCK violations.
- AC-TR1-2-7: When DT-2 label-match confidence is ambiguous (label does not match any target regex), the function emits WARN not BLOCK, and `valid` remains `true` at the call site.
- AC-TR1-2-8: The function has zero imports from `infrastructure/` or `interface/` layers.

---

#### FR-TR1-3: DT-2 + DT-3 Wired into finalizeBctcRefineTool

**DDD Layer:** Application (tool handler calls domain validator before transaction)

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`

**Description:** After the existing parse loop builds `allTableRows` (and after `applyCorrections`), call `detectMagnitudeViolations(finalRows)` before the atomic transaction. If any BLOCK violations:
1. Do NOT execute the `DELETE FROM bctc_table_rows` + INSERT loop.
2. UPDATE `financial_reports SET refine_status = 'REJECTED_SANITY' WHERE id = ?`.
3. UPDATE all `bctc_refined_units` for this report: set `flags` to include the violation list JSON.
4. Return `{ ok: false, report_id, rejected_reason: violations[] }`.

If only WARN violations: proceed with the transaction normally but append violations to the flags log via `logger.warn`.

**Acceptance Criteria:**

- AC-TR1-3-1: When `detectMagnitudeViolations` returns a BLOCK violation, `finalize_bctc_refine` returns `{ ok: false }` and `bctc_table_rows COUNT(*) WHERE report_id = ?` is 0 (no rows inserted), verified by direct `bun:sqlite` query.
- AC-TR1-3-2: When BLOCK fires, `financial_reports.refine_status = 'REJECTED_SANITY'` for the report, verified by direct `bun:sqlite` query.
- AC-TR1-3-3: When BLOCK fires, the CONFIRMED guard still takes precedence (Layer 1 check at top of handler) — a CONFIRMED report is never overwritten to REJECTED_SANITY.
- AC-TR1-3-4: When no BLOCK violation, the transaction executes normally and `refine_status` is set to the caller-supplied `report_status`.

---

#### FR-TR1-4: DT-4 Identical-Timestamp Warning

**DDD Layer:** Application (logging only — no DB write, no block)

**File:** `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts`

**Description:** After reading `doneUnits`, check if all `refined_at` values are identical to the millisecond. If so, emit `logger.warn` with code `"DT4_IDENTICAL_TIMESTAMP"` and the report_id. Do NOT block or reject. This is a forensic signal for the ops log only.

**Acceptance Criteria:**

- AC-TR1-4-1: When all units for a report share an identical `refined_at`, `logger.warn` is called with a message containing `"DT4_IDENTICAL_TIMESTAMP"` and the `report_id`. No rejection occurs.
- AC-TR1-4-2: When units have staggered `refined_at` timestamps, no DT-4 warning is emitted.
- AC-TR1-4-3: DT-4 does not affect `refine_status` or `window_status` in any DB row.

---

### TR-2: Coverage Gaps — Acceptance Criteria on BCTC-LAYOUT-FIRST (Not This Sprint)

**DDD Layer:** Extraction layer (apps/pdf-extractor) + Agent flows (docs/agents/refine_bctc_md/) — out of scope for BCTC-TRUST-RED.

**Disposition:** The following five coverage gaps are extraction deficiencies, not trust-layer failures. They route to BCTC-LAYOUT-FIRST as LF-QA acceptance criteria (PM action required, not dev-mcp-server):

| Gap ID | Description | BCTC-LAYOUT-FIRST LF-QA Gate |
|---|---|---|
| EC-1 | P&L opex codes 11/24/25/26 not captured | FPT Q1-2026 refine output must have ≥ 1 non-zero row for each of codes 11, 24, 25, 26 |
| EC-3 | Equity/liabilities decomposition absent | ACB balance sheet must have non-zero `equity_total` and non-zero `total_liabilities` after refine |
| EC-4 | CF fragmentation pages 9/10/16 | Cash flow section must have ≥ 1 non-zero OCF row from page 9 OR 10 OR 16 |
| EC-5 | Prior-period column drift | No revenue contradiction between units on the same report (> 20% divergence = FAIL) |
| EC-1b | EBITDA = 0 | FPT `ebitda` field must be non-zero after refine |

**Note on DT-2 + TR-2 interaction:** DT-2's `BALANCE_FORCED_ZERO` guard will flag the symptom of EC-3 (zero equity + zero liabilities with a passing arithmetic check) and block the report from being served. This is the correct behavior — the analyst is protected from the gap even before BCTC-LAYOUT-FIRST ships the fix. DT-2 does not fix the gap; it guards against it.

---

## 2. Non-Functional Requirements

**NFR-1 (Domain purity):** `bctcSanityValidator.ts` and `bctcMagnitudeValidator.ts` must have zero imports from `infrastructure/` or `interface/` layers. Verified by static grep.

**NFR-2 (DB verification standard):** All QA assertions on DB state must use `new Database(...)` direct query — NOT HTTP response fields like `rows_parsed` or `rows_stored` (mcp-server-write-wedge lesson: these echo parse output, not DB commit). Mandatory pattern:
```typescript
const db = new Database(testDbPath);
const cnt = db.query("SELECT COUNT(*) as cnt FROM bctc_table_rows WHERE report_id=?").get(reportId);
expect(cnt.cnt).toBe(0);
```

**NFR-3 (No ALTER TABLE):** `REJECTED_SANITY` is a new TEXT value in existing TEXT columns. No schema migration needed. No `ALTER TABLE`. No new tables.

**NFR-4 (Unchanged files):** `apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts` must have zero diff. `apps/pdf-extractor/` and `docs/agents/refine_bctc_md/` must have zero diff.

**NFR-5 (CONFIRMED guard priority):** The existing Layer 1 guard (`confirm_status = 'CONFIRMED'` early-exit) in `finalizeBctcRefineTool.ts` must continue to take precedence over all new TR-1 checks. CONFIRMED reports are never overwritten by sanity detectors.

**NFR-6 (Audit trail):** REJECTED_SANITY units are always written to `bctc_refined_units` (INSERT does happen — only `window_status` changes). This preserves the full audit trail visible in the BCTC-AI-INPUT-TAB.

---

## 3. Publishable Definition (Binding)

A report is **publishable** (eligible to be served by `get_bctc_full` with structured financial data) when ALL of the following conditions hold:

1. **PUB-1** — `financial_reports.refine_status IN ('DONE', 'PARTIAL')`. Status `PENDING`, `IN_PROGRESS`, `FAILED`, or `REJECTED_SANITY` is not publishable.
2. **PUB-2** — At least one `bctc_table_rows` row exists for the report with `value_current IS NOT NULL`. An empty row set means extraction produced no structured data.
3. **PUB-3** — At least one `bctc_table_rows` row exists with `statement_section = 'balance_sheet'` AND `is_summary_row = 0`. A balance sheet consisting only of summary totals (no children) is a symptom of forced-zero fabrication or extraction failure.
4. **PUB-4** — Either zero `bctc_refined_units` rows have `window_status = 'REJECTED_SANITY'` for the report, OR at minimum the sections that DO have all-rejected units must be flagged in the output with a warning. If all units are REJECTED_SANITY, the report is fully unpublishable (no structured data served).

If any condition fails, `get_bctc_full` returns a human-readable refusal message. No financial numbers are served. The analyst agent receives the refusal text, not silent zeroes.

---

## 4. DDD Layer Mapping Summary

| Requirement | File | DDD Layer |
|---|---|---|
| FR-TR0-1 (purge SQL) | One-time in-container script | Infrastructure (forensic, not migration) |
| FR-TR0-2 (REJECTED_SANITY enum) | `schema-financial-reports.ts` (comment) + `pushBctcRefinedUnitTool.ts` (Zod) | Infrastructure + Interface |
| FR-TR0-3 (ingest gate) | `pushBctcRefinedUnitTool.ts` | Interface (calls Domain validator) |
| FR-TR0-4 (publishability guard) | `bctcFullTools.ts` | Application (private helper, single consumer) |
| FR-TR1-1 (DT-1 digit-run) | `bctcSanityValidator.ts` (CREATE) | Domain |
| FR-TR1-2 (DT-2 + DT-3) | `bctcMagnitudeValidator.ts` (CREATE) | Domain |
| FR-TR1-3 (DT-2/3 finalize wiring) | `finalizeBctcRefineTool.ts` | Application |
| FR-TR1-4 (DT-4 timestamp WARN) | `finalizeBctcRefineTool.ts` | Application |
| TR-2 (coverage gaps) | Out of scope — BCTC-LAYOUT-FIRST | Extraction + Agent flows |

---

## 5. QA Test File

**File to create:** `apps/mcp-server/src/__tests__/TRUST-RED-sanity-gate.test.ts`

Six test cases required (TR-RED-1 through TR-RED-6). RED-before-GREEN protocol is mandatory: each gate must be proven to fail before the guard code is added, then proven to pass after. This is not optional. See architect brief §6.2 for case-by-case pseudocode.

| Test | Gate | Expected result |
|---|---|---|
| TR-RED-1 | DT-1 digit-run inject via `push_bctc_refined_unit` | `ok: false`, `window_status='REJECTED_SANITY'` in DB |
| TR-RED-2 | DT-2 magnitude violation — `gross_profit = net_revenue` — via `finalize_bctc_refine` | `ok: false`, `refine_status='REJECTED_SANITY'` in DB, `bctc_table_rows COUNT = 0` |
| TR-RED-3 | DT-3 cross-statement revenue contradiction (≥ 3 distinct prior-period values diverging > 20%) — via `finalize_bctc_refine` | `ok: false`, `refine_status='REJECTED_SANITY'` in DB |
| TR-RED-4 | Publish guard — call `get_bctc_full` on a REJECTED_SANITY report | Output contains no "Net Revenue :" and no financial numbers |
| TR-RED-5 | Clean data passes all gates | `ok: true`, `window_status='DONE'`, `refine_status='DONE'`, `bctc_table_rows COUNT > 0` |
| TR-RED-6 | All assertions use `bun:sqlite` direct DB read (not HTTP echo) | All COUNT queries execute against in-memory `bun:sqlite` DB |

---

## 6. Blockers

**B-1 (HARD — dev must resolve before purge):** ACB report UUID is unknown. Dev must query `SELECT id FROM financial_reports WHERE action_code='ACB' ORDER BY sort_key DESC LIMIT 1` in-container before running the purge SQL. Running the purge without the correct UUID silently no-ops, leaving contaminated data in place.

**B-2 (LOW — architect resolved in brief):** `finalizeBctcRefineTool.ts` existing WHERE clause reads `window_status = 'DONE'` — REJECTED_SANITY units are naturally excluded from parse. No code change needed there. Verified by reading line 121 of the handler: `.where("window_status = 'DONE'")`.

**B-3 (LOW — verify before commit):** `getBctcPendingRefineTool.ts` selects `refine_status IN ('PENDING', 'PARTIAL')`. The new `REJECTED_SANITY` state is a terminal state (not re-queued by cron). Dev must confirm the WHERE clause in that file does not include `REJECTED_SANITY`.

No PO blockers. All design decisions are pre-resolved in the architect brief.

---

## 7. Edge Cases

**EC-BCTC-1 (Legitimate numeric BCTC codes):** BCTC line-item codes can be 6-digit numbers (e.g. code `123456` for a row). A single occurrence of a digit-run-shaped code must be WARN not BLOCK. The ≥ 2 distinct threshold prevents false positives on legitimate codes. Verified by AC-TR1-1-8.

**EC-BCTC-2 (Rounding divergence in cross-statement revenue):** The same revenue figure reported on two different pages may differ by ≤ 5% due to rounding (tỷ vs triệu units). The 20% threshold in DT-3 is generous enough to absorb legitimate rounding. Verified by AC-TR1-2-6.

**EC-BCTC-3 (CONFIRMED guard interaction):** A report that was human-confirmed before contamination was detected should NOT be overwritten by DT-2/DT-3 REJECTED_SANITY. The existing Layer 1 guard in `finalizeBctcRefineTool.ts` handles this. Verified by AC-TR1-3-3.

**EC-BCTC-4 (Partial report with some clean units):** If a report has 10 units and 2 are REJECTED_SANITY (per DT-1 at ingest), `finalize_bctc_refine` reads only `window_status='DONE'` units. The REJECTED_SANITY units are not parsed. DT-2/DT-3 operate only on the clean units' data. If clean units produce a valid aggregate, the report finalizes as DONE with PUB-4 warning.

**EC-BCTC-5 (reset=true with contaminated prior data):** When a legitimate refine cron run uses `reset=true` on a previously-contaminated report (after purge), the DELETE fires before the new units are pushed. The gate then fires on each new unit. If new units are clean, `window_status='DONE'` is written normally.

---

## 8. File Change Summary

### CREATE
- `apps/mcp-server/src/domain/services/financial-reports/bctcSanityValidator.ts` — DT-1 digit-run detector
- `apps/mcp-server/src/domain/services/financial-reports/bctcMagnitudeValidator.ts` — DT-2 + DT-3 detectors
- `apps/mcp-server/src/__tests__/TRUST-RED-sanity-gate.test.ts` — 6 QA test cases

### MODIFY
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/pushBctcRefinedUnitTool.ts` — ingest gate + Zod enum
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/finalizeBctcRefineTool.ts` — DT-2/DT-3 + DT-4 wiring
- `apps/mcp-server/src/interface/mcp/tools/financial-reports/bctcFullTools.ts` — publishability guard
- `apps/mcp-server/src/infrastructure/db/schema-financial-reports.ts` — DDL comment only

### NOT TOUCHED (zero diff mandatory)
- `apps/mcp-server/src/__tests__/HCM-DISAMBIG-extraction.test.ts`
- `apps/pdf-extractor/` (all files)
- `docs/agents/refine_bctc_md/` (all files)
- Any file outside `apps/mcp-server/src/` and `docs/`
