---
agents: po
trigger: sprint-analysis, task-review, branch-check
---

# PO: Branch Hygiene Protocol

**Load this:** Every time PO analyzes TASKS.md or plans a sprint

---

## Problem Found (2026-04-23)

5 branches from completed sprints (234, 237, 238, 1295) still existed locally while sprints were archived to TASKS.md.

**Symptom:** Confusion about which work is active vs done. Branch state ≠ TASKS.md state.

**Root cause:** No automated check that branches match TASKS.md.

---

## Protocol: Check Stale Branches

**When to run:** Every time you analyze TASKS.md, plan a sprint, or check branch state

**Steps:**

1. List all local branches:
   ```bash
   git branch -v
   ```

2. For each branch NOT in current TASKS.md (across all sprints):
   - Check if work is merged: `git log main..branch` (should be empty or pure docs)
   - If empty/docs only → **DELETE**: `git branch -D <branch>`
   - If unmerged commits exist → **REPORT** to user (likely orphaned task)

3. Verify all TASKS.md branch references actually exist on disk

4. If you find mismatches:
   - Branches missing from disk? → Create them (if sprint is Todo/In Progress)
   - Branches not in TASKS.md? → Delete them (if sprint is Complete)

---

## Checklist

- [ ] `git branch -v` shows only active branches + main
- [ ] Every branch in TASKS.md exists locally
- [ ] Every local branch is referenced in TASKS.md (or explicitly marked as archived)
- [ ] Deleted branches are fully merged to main (no lost commits)

---

## Example Invocation

```
Agent(type="po", prompt="Analyze TASKS.md and verify all branches match current state. Clean up stale branches. Report findings.")
```

---

## History

| Date | Action | Branches Deleted |
|------|--------|------------------|
| 2026-04-23 | Initial cleanup | 20 merged + 5 stale (234a, 237b, 237d, 238a, 1295b) |
