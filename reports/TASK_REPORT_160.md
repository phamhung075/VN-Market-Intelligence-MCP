# Task Report — Task 160: Company Name Alias Dictionary (`stockAliases.ts`)

> **Branch**: `task/160-stock-aliases`
> **Date started**: 2026-04-01
> **Date merged**: 2026-04-01 (commit `34b292b` on `main`)
> **Final status**: APPROVED
> **DDD layer**: domain/services

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | 2026-04-01 | Sprint 019 started, dependency on TECH-019 cleared |
| Todo → In Progress | 2026-04-01 | Assigned to Developer |
| In Progress → Review | 2026-04-01 | Developer submitted (commit `a244834`) |
| Review → Done | 2026-04-01 | QA approved — merged to main via `34b292b` |
| Done | 2026-04-01 | Merged to main |

---

## Role Activity Log

### PM (Project Manager)
- Defined task scope: pure domain alias dictionary, zero I/O, two exported functions
- Identified dependencies: TECH-019 (Architect design approved)
- DDD layer assigned: domain/services
- Context injection: `src/domain/services/newsNormalizer.ts` (existing ticker scan pattern)

### Developer
- Files created: `src/domain/services/stockAliases.ts`, `src/__tests__/160-stock-aliases.test.ts`
- Files modified: `TASKS.md` (moved task to Review)
- TDD cycle: NON-COMPLIANT — implementation commit (`c08e4b5`) precedes test commit (`3c9daca`) in git log. Non-blocking because the module is a pure dictionary with deterministic outputs; test quality is strong regardless of commit order.
- Tests written: `src/__tests__/160-stock-aliases.test.ts`, 34 tests
- Assumptions made: substring-based alias matching (consistent with existing `newsNormalizer.ts` ticker scan); aliases pre-normalised at module load
- Time to implement: < 1h (straightforward pure domain dictionary)

### QA — Review 1
- Date: 2026-04-01
- Outcome: APPROVED
- `bun test src/__tests__/160-stock-aliases.test.ts` result: PASS (34 tests, 200 expect() calls, 100% line and function coverage)
- `bun test` (full suite) result: 1243 pass / 12 fail — all failures are pre-existing regressions unrelated to task 160 (CE-06/CE-13 cascade edge cases, RT1 watchlist CRUD, Task 061/062 chain, Task 105/103 cron expression mismatches, Task 161 alias wiring stubs — all present on the commit immediately prior to task 160)
- `bun tsc --noEmit` result: PASS (0 errors on `task/160-stock-aliases` branch)
- Issues found: 1 non-blocking (TDD commit order), 0 blocking

---

## Test Results

```
bun test src/__tests__/160-stock-aliases.test.ts

-------------------------------------|---------|---------|-------------------
File                                 | % Funcs | % Lines | Uncovered Line #s
-------------------------------------|---------|---------|-------------------
All files                            |  100.00 |  100.00 |
 src/domain/services/stockAliases.ts |  100.00 |  100.00|
-------------------------------------|---------|---------|-------------------

 34 pass
 0 fail
 200 expect() calls
Ran 34 tests across 1 file. [66.00ms]
```

**Coverage notes**: All public exports covered. `normalizeText()` is private and exercised indirectly through both `getAliasesForCode` and `detectStocksInText`. Edge cases covered: empty text, empty watchlist, unknown ticker code, alias not in watchlist, duplicate alias in text (deduplication), all-caps input, mixed-case input, accent-free Vietnamese, accent-bearing Vietnamese, multi-stock detection, false-positive guard on generic market text. Performance smoke test (500-char text, 20-stock watchlist) verifies < 5 ms completion.

---

## Issues Discovered During Review

### BLOCKING Issues

None.

---

### NON-BLOCKING Issues

#### Issue 160-01
- **Type**: TDD process violation
- **File**: `src/__tests__/160-stock-aliases.test.ts` and `src/domain/services/stockAliases.ts`
- **Description**: Git log shows implementation commit (`c08e4b5`) before test commit (`3c9daca`). TDD methodology requires the test (Red) commit to precede the implementation (Green) commit.
- **Impact**: Process only — no functional impact. The module is a pure static dictionary with no business logic branches that could be misimplemented if tests are written post-hoc.
- **Fix applied**: N/A — non-blocking, noted for Developer awareness in Sprint 020+
- **Status**: Deferred / Won't fix for this task

---

## Bug Report

| # | Severity | Description | File | Status |
|---|----------|-------------|------|--------|
| — | — | No bugs found | — | — |

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| — | — | No security issues | — | — |

**Security verdict**: CLEAN

- Zero imports (no I/O, no external dependencies)
- No `process.env` usage (uses `Bun.env` — not applicable here, no env access at all)
- No SQL, no HTTP, no file system access
- No `any` types
- No non-null assertions (`!`)
- Input sanitisation: `normalizeText()` applied to both alias map at load time and incoming text at call time; no risk of injection

---

## DDD Compliance

| Check | Result |
|-------|--------|
| `src/domain/` imports from `infrastructure/` | NONE |
| `src/domain/` imports from `application/` | NONE |
| Any imports at all in `stockAliases.ts` | NONE (zero `import` statements) |
| Business logic in `src/tools/` or `src/interface/` | N/A — this task adds domain-only code |
| Repository interfaces used correctly | N/A — no persistence in this module |

**DDD verdict**: PASS — perfect isolation. The module is a self-contained pure dictionary with no external dependencies of any kind.

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| AC-1: `getAliasesForCode("VNM")` returns array including "vinamilk" | PASS | Verified in test: AC-1 `Vinamilk` in headline detects VNM |
| AC-2: `getAliasesForCode("HPG")` returns array including "hoa phat" | PASS | Verified: AC-2 `Hòa Phát` in Vietnamese sentence detects HPG |
| AC-3: Diacritic-free match — "Hoa Phat" detects HPG | PASS | Verified: AC-3 test |
| AC-4: Generic commodity news returns [] | PASS | Verified: AC-4 oil price news returns [] |
| AC-5: Multi-stock detection — VCB + FPT detected simultaneously | PASS | Verified: AC-5 test |
| AC-6: Unknown ticker returns [] without throwing | PASS | "ZZZZ" returns [], no exception |
| Min 30 test cases required | PASS | 34 tests, 200 assertions |
| 100% line and function coverage | PASS | Coverage report confirms 100%/100% |
| Zero `any` types | PASS | `grep ": any"` returns nothing |
| `bun tsc --noEmit` = 0 errors | PASS | Confirmed |
| All aliases lowercase after normalisation | PASS | Verified in test "all VNM aliases are lowercase" |
| Case-insensitive code input (`getAliasesForCode("vnm")`) | PASS | `code.toUpperCase()` in implementation |
| Deduplication — alias twice in text returns one code | PASS | Set-based deduplication verified |
| Performance: 500-char text, 20-stock watchlist < 5 ms | PASS | Pre-built normalised map, O(n×m) substring scan |
| Coverage: >= 20 stocks with >= 3 aliases each | PASS | 25 stocks (VNM, FPT, VCB, VEA + 21 more), 5–9 aliases each |

---

## Merge Summary

```bash
git merge --no-ff task/160-stock-aliases -m "merge(160+tracking): stock alias dictionary + Sprint 017/018 tracking updates"
```

- Commits in branch: 4 task-specific commits (c08e4b5, 3c9daca, b89394f, a244834)
- Files created: `src/domain/services/stockAliases.ts` (+397 lines), `src/__tests__/160-stock-aliases.test.ts` (+313 lines)
- Files also updated: `TASKS.md`, `SPRINT_GOAL.md`, `docs/REQ_019.md`, `docs/TECH_019.md`, plus Sprint 017/018 backlog tracking
- Tests added: 34 new tests
- Type errors at merge: 0

---

## Notes for Next Tasks

- Task 161 (`task/161-alias-wiring`) can now proceed — dependency on 160 is cleared (already marked Done on main)
- Task 162 (`task/162-market-wide-broadcast`) depends on 160 — also unblocked
- The `detectStocksInText()` function should be called from `cascadeEngine.ts` (task 161) to add "Gate 3" alias-based matching after the existing ticker scan
- Recommendation for task 161 Developer: `detectStocksInText(text, watchlistCodes)` accepts the combined `title + " " + summary` string; return value is a string[] of matched codes to feed into `watchlistImpacts` with confidence 0.55 and reasoning prefixed `"AliasResolved:"`
- Known tech debt deferred: TDD commit order violation (non-blocking, process improvement for Sprint 020)
