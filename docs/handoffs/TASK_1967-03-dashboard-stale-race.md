# Handoff — TASK_1967-03: DASHBOARD stale-race on sprint close

**Task:** 1967-03 | **Sprint:** 1967c | **Severity:** HIGH | **Size:** XS

---

## Summary

When PM reads TASKS.md to author a signal and by write time the sprint is already closed, orphaned signals pollute DASHBOARD. The pm flow does not perform a CAS (compare-and-swap) check on sprint state before emitting plan_blocked.

---

## Evidence

**Brief cross-link:** `docs/architecture-briefs/2026-05-21-orchestration-bug-conflict-audit.md` § ITEM-03

**Repro path:line:**
- `docs/signals/processed/1962-B-01` (2026-05-20T22:30Z after PO closed sprint at 20:48Z)
- 1962-B-01 DASHBOARD row: pm `plan_blocked` written at 22:30Z after po closed sprint at 20:48Z

**Live example:** 1962-B-01 row in DASHBOARD marked CLOSED as "stale-race" after manual triage

---

## Current Behavior

- PM reads TASKS.md snapshot
- PM authors signal (e.g., `plan_blocked`)
- By signal write time, PO has already closed the sprint
- Signal lands in DASHBOARD but sprint is no longer active
- Orphaned signals require manual pruning

---

## Expected Behavior

- PM flow reads `pipeline-state.json` status immediately before writing DASHBOARD signal
- If sprint idle/closed → skip signal emission
- No orphaned signals in DASHBOARD for closed sprints

---

## Proposed Fix

**Zone:** `.claude/flows/pm/main.md`

**Fix surface:** pm flow Step N (before `call_tool(signal_dashboard, ...)`):
1. Read `pipeline-state.json` (refresh, do not use cached snapshot)
2. Check `status` field: if `idle` or `closed` → skip signal, return early
3. If `active` → proceed with signal write

**Blast radius:** Low — only affects pm `plan_blocked` signal emission; stale signals are harmless but pollute DASHBOARD

**Dependency chain:** None — standalone flow edit

---

## Acceptance Criteria

1. [ ] pm flow reads pipeline-state.json immediately before DASHBOARD write (no cached snapshot)
2. [ ] CAS check: if status ∈ {idle, closed} → return early without signal
3. [ ] If status = active → proceed with signal write
4. [ ] Test: pm flow with active sprint emits signal ✓
5. [ ] Test: pm flow with closed sprint skips signal ✓
6. [ ] tsc 0 errors (if TypeScript)

---

## Owner & Zone

- **Dev agent:** agent-father
- **Zone:** `.claude/flows/pm/main.md`
- **Model:** claude-haiku-4-5-20251001

---

## Related

- REQ-1967-4b (stale-race — pm `plan_blocked` after PO sprint close)
- ITEM-03 (same finding)
