---
task_id: P2-A4
title: "Deliberate-violation artifact: prove CI red/green cycle"
phase: "2"
pilot: "technical-analysis"
owner: "qa"
goals: ["G4"]
files_touched:
  - "apps/technical-analysis/pkg/primitive/rsi/rsi.go (TEMP MODIFY — add forbidden import, then revert)"
status: "PENDING"
blocked_by: ["P2-A3"]
unblocks: []
estimate_hours: 0.333
ac_count: 6
---

# P2-A4 — Deliberate-violation artifact: prove CI red/green cycle

**Goal:** G4 (Architecture fence enforced in CI) — Final verification

**Description:**
QA deliberately introduces a Fence-A violation, commits it to see CI turn red, then reverts it to see CI turn green. This artifacts the fence enforcement works and is not a false negative.

---

## Files Touched

- `apps/technical-analysis/pkg/primitive/rsi/rsi.go` (TEMP MODIFY — add forbidden import, then revert)

---

## Acceptance Criteria

1. **AC-1**: QA adds a deliberate Fence-A violation: one import of `"github.com/vn-market-intelligence/technical-analysis/pkg/module"` anywhere in `pkg/primitive/rsi/rsi.go`
2. **AC-2**: Commit the violation: `test(arch/ci): P2-A4-violation — deliberate Fence-A import for CI red proof`
3. **AC-3**: Observe CI run → `go-lint` job exits non-zero (red); `bun test` is unaffected
4. **AC-4**: Revert the violation in a second commit: `test(arch/ci): P2-A4-revert — remove deliberate Fence-A import`
5. **AC-5**: Observe CI run → `go-lint` job exits 0 (green)
6. **AC-6**: Evidence: two CI run URLs (one red, one green) recorded in handoff file

---

## Smoke Check

```bash
# After violation commit:
gh run list --limit 2 --json status,conclusion,name,url
# Confirm go-lint = failure on violation commit, success on revert commit
```

---

## Atomic Commit Format — Violation

```
test(arch/ci): P2-A4-violation — deliberate Fence-A import for CI red proof

Adds forbidden import pkg/module inside pkg/primitive/rsi to verify CI fence enforcement.
Will be reverted in next commit.

Sprint: <sprint>
Task: P2-A4
AC: CI go-lint job exits non-zero on this commit
```

---

## Atomic Commit Format — Revert

```
test(arch/ci): P2-A4-revert — remove deliberate Fence-A import

Reverts P2-A4-violation commit. Confirms CI fence enforcement working correctly.

Sprint: <sprint>
Task: P2-A4
AC: CI go-lint job exits 0 on this commit
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G4   | COMPLETE (fence enforcement proven by CI red/green cycle) |

---

## Dependencies

**Upstream:** P2-A3 (baseline green CI must be established)
**Downstream:** None (G4 complete after this task)

---

## Evidence to Record

- URL of CI run with go-lint RED (violation commit)
- URL of CI run with go-lint GREEN (revert commit)
- Screenshot or log excerpts from both runs
- Timestamps of both runs
