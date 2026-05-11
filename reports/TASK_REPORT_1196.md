# Task Report — Task 1196: BCTC Extraction Pipeline Fix

> **Branch**: `task/1196-bctc-extraction-fix`
> **Date reviewed**: 2026-04-13
> **Final status**: APPROVED
> **DDD layers touched**: domain (incomeStatementExtractor), application (parseBctcReport), scheduler (bctcReparseJob)

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | prior | Three sub-fixes backlogged from audit findings |
| Todo → In Progress | prior | Assigned to Developer |
| In Progress → Review | 2026-04-13 | Developer submitted branch task/1196-bctc-extraction-fix |
| Review → Done | 2026-04-13 | QA approved, ready to merge |

---

## Scope

Three sub-fixes for the BCTC extraction pipeline:

- **Sub-fix A** (domain): Add `P_NET_REVENUE_BANKING` regex fallback in `extractIncomeStatement()` so Vietnamese banking BCTCs using "Thu nhập lãi thuần" yield a non-zero `netRevenue`.
- **Sub-fix B** (application): `storeReport()` must skip SQLite insert entirely when `extractionConfidence === 0.0` and fire a WORK-channel Telegram alert.
- **Sub-fix C** (scheduler): Export `scanDiskForStrandedPdfs()` from `bctcReparseJob.ts` and add observability logs (start/end) to `runBctcReparseJob()`.

---

## QA Pipeline Results

### Step 1: Branch checkout
`task/1196-bctc-extraction-fix` — checked out cleanly, up to date with remote.

### Step 2: Task-specific tests
```
bun test src/__tests__/1196-bctc-reparse-pipeline.test.ts
14 pass / 0 fail — 22 expect() calls [96ms]
```

All 14 tests pass across all four describe blocks:
- Sub-fix A (4 tests): banking regex, OCR fallback, non-banking non-regression, standard-pattern precedence
- Sub-fix B (2 tests): zero-confidence guard + module export check
- Sub-fix C disk-scan (5 tests): export, stranded detection, already-filed exclusion, nonexistent dir, unwatchlisted ticker, unrecognizable filename
- Sub-fix C observability (2 tests): start-of-cycle log with `feedbackRows`, end-of-cycle log with `examined/resolved/failed`

### Step 3: Full regression
Pre-existing failure in `1192-evening-summary-empty-fallback.test.ts` (1 test, sendFn mock timing, not related to task 1196). No new failures introduced by this branch. All other test files pass.

### Step 4: TypeScript strict check
`bun tsc --noEmit` — no errors, clean output.

### Step 5: DDD compliance scan
- `src/domain/services/incomeStatementExtractor.ts` imports only: `./vnNumberParser` (domain) + `bctc-schema` (root type). No infrastructure or application imports. COMPLIANT.
- `src/application/usecases/parseBctcReport.ts` imports from `domain/`, `infrastructure/` (getDb, logger, telegram). Application layer importing both domain and infrastructure is correct per DDD layering rules. COMPLIANT.
- `src/scheduler/bctcReparseJob.ts` imports from `infrastructure/` and `application/`. Scheduler is the outermost layer — correct. COMPLIANT.
- DDD grep scan on `src/domain/` — all hits were JSDoc comment text, zero actual runtime imports from infrastructure or application. COMPLIANT.

### Step 6: Security scan
`process.env` usage found only in test files (for `DB_PATH` injection), not in production source files. Production source uses `Bun.env` via `src/infrastructure/config.ts`. COMPLIANT.

---

## Sub-fix Verification Details

### Sub-fix A — P_NET_REVENUE_BANKING regex
- Line 139: `const P_NET_REVENUE_BANKING = /thu\s+nh[ậa]p\s+l[ãa]i\s+thu[ầa]n/i;`
- Line 140: `const F_NET_REVENUE_BANKING = /thu\s+nhap\s+lai\s+thuan/i;`
- Lines 454-457: Fallback guard `if (netRevenue === 0) { netRevenue = fv(P_NET_REVENUE_BANKING, F_NET_REVENUE_BANKING); }` — activates only when standard `doanh thu thuần` yields 0.
- Standard pattern takes precedence when both labels present (test 4 confirms).

### Sub-fix B — storeReport() confidence=0 guard
- Lines 158-168: Guard fires when `extractionConfidence === 0`, logs warning, fires async WORK Telegram alert, and returns without any SQLite INSERT.
- Lines 171-181: Low-confidence path (0 < confidence < 0.2) inserts but overrides `validation_status = 'low_confidence'` and fires WORK alert.
- Function is internal (not exported) — tests verify via `parseBctcReport` module import + empty-text confidence computation.

### Sub-fix C — scanDiskForStrandedPdfs export + observability
- `scanDiskForStrandedPdfs` is exported at line 295 (`export async function scanDiskForStrandedPdfs`). Confirmed by test import.
- Function accepts injected `db: Database` and optional `pdfDir` override — fully testable without real filesystem.
- `runBctcReparseJob()` lines 411-414: logs `[bctc-reparse-job] starting cycle` with `feedbackRows` and `timestamp`.
- Lines 516-523: logs `[bctc-reparse-job] cycle complete` with `examined`, `resolved`, `failed`, `escalated`, `alerted`.

---

## Issues Found

None. All acceptance criteria met.

---

## Decision

**APPROVED** — ready to merge to main.

Merge command:
```bash
git checkout main
git merge --no-ff task/1196-bctc-extraction-fix -m "merge(1196): BCTC extraction — banking regex, zero-confidence guard, disk-scan export"
git branch -d task/1196-bctc-extraction-fix
git push origin --delete task/1196-bctc-extraction-fix
bun test && bun tsc --noEmit
```

TASKS.md: move task 1196 from Review → Done.
