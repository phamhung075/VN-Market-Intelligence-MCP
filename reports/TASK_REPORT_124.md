# Task Report — Task 124: Integration Tests — SSC Pipeline Mock HTTP

> **Branch**: `task/124-test-ssc-pipeline`
> **Date started**: 2026-03-28
> **Date merged**: 2026-03-28
> **Final status**: APPROVED
> **DDD layer**: test (cross-cutting)

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-03-28 | Dependencies cleared (task 048 done) |
| Todo → In Progress | 2026-03-28 | Assigned to Developer |
| In Progress → Review | 2026-03-28 | Developer submitted |
| Review → Done | 2026-03-28 | Approved — all 17 tests pass, 0 TS errors |
| Done | 2026-03-28 | Merged to main |

---

## Role Activity Log

### PM (Project Manager)
- Defined task scope: 17 integration tests for `fetchParseAndStoreBctc` pipeline with mock HTTP
- Dependencies: task 048 (SSC fetch → parse → store pipeline)
- DDD layer: test (cross-cutting — calls application use case with mocked infrastructure)
- Context injection: `src/application/usecases/fetchParseAndStoreBctc.ts`, `src/infrastructure/fetchers/ssc.ts`

### Developer
- Files created: `src/__tests__/124-test-ssc-pipeline.test.ts`
- Files modified: `TASKS.md`
- TDD cycle followed: YES — test file created before implementation was modified
- Tests written: 17 tests covering SSC-01 through SSC-12 + 5 supplementary assertions
- Assumptions made:
  - `fetchParseAndStoreBctc` accepts `sscHttpClient: HttpClient` injection for HTTP mocking
  - `pdfTextOverride` parameter allows bypassing real PDF fetch for test isolation
  - `insertAnalysisFn` accepts `unknown` typed argument to allow spy injection
  - In-memory SQLite via `process.env["DB_PATH"] = ":memory:"` before `initDatabase()` call

### QA — Review 1
- Date: 2026-03-28
- Outcome: APPROVED
- `bun test src/__tests__/124-test-ssc-pipeline.test.ts` result: PASS (17 tests, 62 expect() calls, 234ms)
- `bun test` full suite result: 775 pass / 2 fail (the 2 known pre-existing failures in task 085)
- `bun tsc --noEmit` result: PASS (0 errors)
- Issues found: 0 blocking, 1 non-blocking (see below)

---

## Test Results

```
bun test src/__tests__/124-test-ssc-pipeline.test.ts

  Task 124 — SSC pipeline integration tests (mock HTTP, real SQLite)
  ✓ SSC-01: happy path — returns FinancialReport, inserts DB row, calls insertAnalysisFn once
  ✓ SSC-02: when SSC returns 2 docs, only docs[0] is processed, insertAnalysisFn called once
  ✓ SSC-03: returns null when SSC HTML has empty tbody; no DB insert, insertAnalysisFn not called
  ✓ SSC-04: returns null when pdfTextOverride is empty string; no DB insert
  ✓ SSC-05: returns null when pdfTextOverride is whitespace only; no DB insert
  ✓ SSC-06: minimal text with net revenue + total assets produces valid report with non-empty sortKey
  ✓ SSC-07: LanceDB failure is non-fatal — returns FinancialReport and DB row persists
  ✓ SSC-08: running the pipeline twice for the same report replaces the existing row (UNIQUE action_code + sort_key)
  ✓ SSC-09: annual-only SSC HTML is filtered out; pipeline returns null for quarterly request
  ✓ SSC-10: relative href in SSC HTML is resolved to absolute SSC base URL
  ✓ SSC-11: buildSscSearchUrl produces URL containing keyword=VCB, type=BCTC, year=2025
  ✓ SSC-12: parseSscHtml skips malformed rows with fewer than 2 <td> cells; valid rows still parsed
  ✓ store verification: financial_reports row has correct action_code, sort_key, net_revenue, total_assets
  ✓ Vietnamese text: gross margin and net margin ratios are computed from full BCTC fixture
  ✓ period.year, period.quarter, and period.sortKey are set from params
  ✓ report.source.sscUrl is set to the resolved document URL from SSC portal
  ✓ insertAnalysisFn receives entry with level='action' and correct actionCode

Tests: 17 passed, 0 failed
```

**Coverage notes**:
- Happy path (SSC-01): full pipeline validated — DB row, LanceDB call, return value
- Multiple docs (SSC-02): first-document-wins behavior confirmed
- Empty listing (SSC-03): null return, no side effects
- Empty/whitespace PDF (SSC-04, SSC-05): text guard confirmed
- Minimal valid text (SSC-06): period.sortKey format `2025-Q2` confirmed
- LanceDB failure resilience (SSC-07): non-fatal confirmed, SQLite row persists
- Dedup (SSC-08): `INSERT OR REPLACE` behavior on `UNIQUE(action_code, sort_key)` confirmed
- Annual filter (SSC-09): quarterly filter excludes non-quarterly titles
- Relative href resolution (SSC-10): absolute URL construction confirmed
- URL builder (SSC-11): query param presence confirmed
- Malformed HTML rows (SSC-12): graceful skip confirmed
- Column storage: `sort_key`, `net_revenue`, `total_assets`, `period_year`, `period_quarter` verified
- Financial ratios: `grossMarginPct` and `netMarginPct` computed from Vietnamese BCTC fixture

---

## Issues Discovered During Review

### BLOCKING Issues

None.

---

### NON-BLOCKING Issues

#### Issue 124-01
- **Type**: Security — test infrastructure only
- **File**: `src/__tests__/124-test-ssc-pipeline.test.ts:207`
- **Description**: `process.env["DB_PATH"] = ":memory:"` used instead of `Bun.env`. The production code rule (use `Bun.env` only) does not apply in test setup because `DB_PATH` is a module-level constant resolved at import time; `Bun.env` assignment after import has no effect. The comment at line 200 explains this constraint.
- **Fix applied**: No change needed — the constraint is documented and the usage is correct for the test context.

#### Issue 124-02
- **Type**: Observation — branch stacking
- **Description**: The `task/124-test-ssc-pipeline` branch had the task 125 commit (`451d6d3`) stacked on top of it. The merge brought in `src/__tests__/125-test-e2e-briefing.test.ts`. Task 125 tests are additive and do not conflict with task 124 scope.
- **Fix applied**: No action needed — task 125 tests are in their own file and are reviewed separately.

---

## Bug Report

| # | Severity | Description | File | Status |
|---|----------|-------------|------|--------|
| — | — | No bugs found | — | — |

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | process.env usage | `process.env["DB_PATH"]` in test setup | None (test-only) | Documented rationale in comment; not production code |

**Security verdict**: CLEAN — no production security concerns. The `process.env` usage is confined to `beforeAll()` test setup and is required by the SQLite module's module-level constant initialization pattern.

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| Happy path: FinancialReport returned, DB row inserted, insertAnalysisFn called once | PASS | SSC-01 |
| Multiple docs: only first document processed | PASS | SSC-02 |
| Empty SSC listing: returns null, no side effects | PASS | SSC-03 |
| Empty PDF text: returns null, no DB insert | PASS | SSC-04 |
| Whitespace-only PDF: returns null | PASS | SSC-05 |
| Minimal BCTC text: valid report with sortKey `2025-Q2` | PASS | SSC-06 |
| LanceDB failure non-fatal: report returned, SQLite row persists | PASS | SSC-07 |
| Duplicate run: INSERT OR REPLACE leaves exactly 1 row | PASS | SSC-08 |
| Annual HTML filtered: quarterly request returns null | PASS | SSC-09 |
| Relative href resolved to absolute SSC URL | PASS | SSC-10 |
| buildSscSearchUrl: keyword/type/year params present | PASS | SSC-11 |
| Malformed HTML rows skipped gracefully | PASS | SSC-12 |
| All columns in financial_reports populated correctly | PASS | Store verification test |
| Vietnamese BCTC fixture: grossMarginPct and netMarginPct computed | PASS | Ratio test |
| period fields set from function params | PASS | Period fields test |
| report.source.sscUrl set to resolved document URL | PASS | sscUrl test |
| insertAnalysisFn entry has level='action' and correct actionCode | PASS | Entry structure test |
| bun tsc --noEmit: 0 errors | PASS | |
| Full regression suite: no new failures | PASS | 775 pass / 2 fail (2 pre-existing in task 085) |

---

## Merge Summary

```bash
git merge --no-ff task/124-test-ssc-pipeline -m "merge(124): SSC pipeline integration tests with mock HTTP"
```

- Commits in branch (task 124 scope): 1 (`1bac3b5`)
- Files changed (task 124 commit): `TASKS.md` only (test file was in prior commit on branch)
- Test file: `src/__tests__/124-test-ssc-pipeline.test.ts` — 617 lines, 17 tests, 62 expect() calls
- Lines added total in merge: +1,240 (includes task 125 test file stacked on branch)
- Tests added: 17 new SSC pipeline integration tests
- Type errors at merge: 0

---

## Notes for Next Tasks

- Task 125 (E2E daily briefing flow) is now in Review — the test file was included in this merge due to branch stacking. QA should review task 125 independently.
- The `HttpClient` interface exported from `src/infrastructure/fetchers/ssc.ts` enables clean test injection without any mock framework.
- The `pdfTextOverride` parameter on `fetchParseAndStoreBctc` avoids coupling tests to the PDF binary fetch path — this pattern can be reused for future pipeline tests.
- Known pre-existing failures in `085-tool-reports.test.ts` (2 tests) remain unresolved — tracked separately, not regressions from this task.
