# Task Report — Task NNN: [Task Title]

> **Branch**: `task/NNN-branch-name`
> **Date started**: YYYY-MM-DD
> **Date merged**: YYYY-MM-DD
> **Final status**: APPROVED | CHANGES REQUESTED → FIXED → APPROVED
> **DDD layer**: domain | infrastructure | application | interface

---

## Kanban Movement

| Column | Date | Notes |
|--------|------|-------|
| Backlog → Todo | YYYY-MM-DD | Dependencies cleared |
| Todo → In Progress | YYYY-MM-DD | Assigned to Coder |
| In Progress → Review | YYYY-MM-DD | Coder submitted |
| Review → [In Progress / Done] | YYYY-MM-DD | Approved or changes requested |
| Done | YYYY-MM-DD | Merged to main |

---

## Role Activity Log

### Planner
- Defined task scope and acceptance criteria
- Identified dependencies: Task(s) [NNN, NNN]
- DDD layer assigned: [domain/infra/application/interface]
- Key design decisions made: [...]

### Coder
- Files created: [list]
- Files modified: [list]
- TDD cycle followed: YES | NO (explain if no)
- Tests written: [test file name, number of tests]
- Assumptions made: [list any]
- Time to implement: ~Xh

### Reviewer — Review 1
- Date: YYYY-MM-DD
- Outcome: APPROVED | CHANGES REQUESTED
- `bun test` result: PASS (X tests) | FAIL (X failures)
- `bun tsc --noEmit` result: PASS | FAIL (X errors)
- Issues found: [count by severity — see Issues section]

### Fixer (if applicable)
- Issues addressed: [list]
- Files changed: [list]
- Root causes identified: [list]

### Reviewer — Review 2 (if re-review needed)
- Date: YYYY-MM-DD
- Outcome: APPROVED
- All previous issues resolved: YES | NO

---

## Test Results

```
bun test src/__tests__/NNN-*.test.ts

  Task NNN — [Module Name]
  ✓ [test name] (X ms)
  ✓ [test name] (X ms)
  ✗ [test name] — [failure message if any]

Tests: X passed, X failed
```

**Coverage notes**: [what is and isn't covered — edge cases missed, known gaps]

---

## Issues Discovered During Review

### 🔴 BLOCKING Issues (must fix before merge)

#### Issue NNN-01
- **Type**: Bug | Security | DDD Violation | Type Error | Logic Error
- **File**: `src/path/to/file.ts:line`
- **Description**: [what is wrong]
- **Impact**: [what could happen if not fixed]
- **Fix applied**: [what was changed — or "N/A" if still open]
- **Status**: Fixed | Open | Escalated to Task NNN

---

### 🟡 NON-BLOCKING Issues (suggestions / tech debt)

#### Issue NNN-02
- **Type**: Performance | Readability | Missing test | Code smell
- **File**: `src/path/to/file.ts:line`
- **Description**: [what could be improved]
- **Fix applied**: Fixed | Deferred to Task NNN | Won't fix (reason)

---

## Bug Report

| # | Severity | Description | File | Status |
|---|----------|-------------|------|--------|
| 1 | Critical | [desc] | [file:line] | Fixed / Open |
| 2 | Medium | [desc] | [file:line] | Fixed / Deferred |
| 3 | Low | [desc] | [file:line] | Won't fix |

---

## Security Report

| # | Category | Description | Risk | Mitigation |
|---|----------|-------------|------|------------|
| 1 | SQL Injection | String interpolation in query | High | Parameterized query applied |
| 2 | Path Traversal | PDF path not validated | Medium | Path sanitized with `path.resolve()` |
| 3 | Rate Limit | No backoff on scraper | Low | Added jitter backoff |

**Security verdict**: CLEAN | ISSUES FOUND (see table)

---

## Bug & Fix Log

*(Appended by Fixer for each round of fixes)*

### Fix — YYYY-MM-DD
- **Issue**: [what was broken]
- **Root cause**: [why it broke]
- **Fix**: [what was changed, file + line]
- **Tests added**: [test name if new test was written]
- **Verified**: `bun test` ✓ | `bun tsc --noEmit` ✓

---

## Acceptance Criteria Sign-off

| Criterion | Status | Notes |
|-----------|--------|-------|
| Given/When/Then — criterion 1 | ✅ PASS | |
| Given/When/Then — criterion 2 | ✅ PASS | |
| Given/When/Then — criterion 3 | ❌ FAIL → Fixed | [what was fixed] |

---

## Merge Summary

```bash
git merge --no-ff task/NNN-branch-name -m "merge(NNN): [task title]"
```

- Commits in branch: X
- Files changed: X
- Lines added: +X  |  Lines removed: -X
- Tests added: X new tests
- Type errors at merge: 0

---

## Notes for Next Tasks

*(Dependencies unlocked by this task, recommendations for following tasks)*

- Task NNN can now start (dependency on this task is cleared)
- Recommendation: [anything the next Coder should know]
- Known tech debt deferred: [if any]
