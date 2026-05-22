---
task_id: P2-A3
title: "Verify CI green on clean codebase (no violations)"
phase: "2"
pilot: "technical-analysis"
owner: "qa"
goals: ["G4"]
files_touched: []
status: "PENDING"
blocked_by: ["P2-A2"]
unblocks: ["P2-A4"]
estimate_hours: 0.25
ac_count: 4
---

# P2-A3 — Verify CI green on clean codebase (no violations)

**Goal:** G4 (Architecture fence enforced in CI)

**Description:**
QA verifies that the newly added go-lint CI job executes successfully on the clean codebase, with no fence violations detected. This confirms the fence configuration is correct and passes baseline.

---

## Files Touched

None (verification only)

---

## Acceptance Criteria

1. **AC-1**: Trigger a push to `main` (or observe the commit from P2-A2) — CI runs both `bun test` and `go-lint` jobs
2. **AC-2**: `go-lint` job exits green (exit 0) on the current codebase with no deliberate violations
3. **AC-3**: `bun test` job is unaffected (still exits 0)
4. **AC-4**: Evidence: CI run URL + screenshot or log excerpt showing `go-lint: passed`

---

## Smoke Check

```bash
# Verify CI status via gh
gh run list --limit 5 --json status,conclusion,name
```

Look for `go-lint` with `conclusion: success`.

---

## Atomic Commit Format

No commit for this task — QA records evidence in handoff file.

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G4   | IN-PROGRESS (gate on P2-A4 deliberate-violation proof) |

---

## Dependencies

**Upstream:** P2-A2 (CI job must exist)
**Downstream:** P2-A4 (deliberate-violation red/green proof)

---

## Evidence to Record in Handoff

- CI run URL
- Screenshot or log excerpt showing `go-lint: passed`
- Timestamp of green CI run
- Confirmation that `bun test` still passes (not broken by P2-A2 changes)
