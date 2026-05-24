---
task: P2-A
title: Create `alert-engine-pre-ci` Tag (Pre-Revert Anchor Before G4 Work)
owner: dev-alert-engine
phase: 2
blockedBy: null
blocks: P2-B
acCount: 3
sequencedAt: 2026-05-24T082100Z
---

# TASK P2-A — Create `alert-engine-pre-ci` Tag

**Owner:** dev-alert-engine  
**Blocked by:** — (first Phase 2 task)  
**Files touched:** none (tag only)

---

## Background

L5 lesson baked Day 0. The pre-revert tag MUST exist BEFORE any `.golangci.yml` or CI job work lands. Standalone task so PM can verify the tag before dispatching P2-B.

---

## Execution

**Step 0 (only action):**
```bash
git tag alert-engine-pre-ci HEAD
```

Confirm with:
```bash
git log --oneline alert-engine-pre-ci
```

Must return the current HEAD commit SHA + subject (the Phase-1 close-gate commit or a commit after it — specifically `d6eab5bf` or later).

---

## Acceptance Criteria

### AC-1: Tag created at Phase-1 anchor or later
`git log --oneline alert-engine-pre-ci` returns exactly one line referencing a Phase-1 commit.
No `--force`, no push.

### AC-2: Tag exists in local repo
`git tag | grep alert-engine-pre-ci` returns `alert-engine-pre-ci` (tag exists in local repo).

### AC-3: Anchor still INTACT
`git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1` returns non-empty output.

---

## Commit & Signal

**Commit:** No commit required for tag creation. Dev creates a signal file documenting the tag SHA, stages with L84 explicit path, and commits it as the evidence record.

**Signal file:** `docs/signals/dev-ae-P2-A-done-<UTC>.json` with fields:
- `task`: "P2-A"
- `tag`: "alert-engine-pre-ci"
- `tagged_sha`: <sha from AC-1>
- `anchor_intact`: true
- `next_actor`: "pm"

**Commit subject pattern:**
```
chore(alert-engine): P2-A — alert-engine-pre-ci tag created (pre-revert anchor)
```

---

## G-Goal Posture

NO goal flips. Tag is infrastructure only. §4.5 SSOT untouched.

---

## Notes

- Charter §4.5 ZERO-CREDS SSOT freeze: do NOT modify goals, decisionMatrix, or goalsEarned. Keep all at TBD/0.
- Pre-revert tag discipline binds Phase 2 task sequence. Tag creation gates P2-B dispatch.
- Frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` must remain ancestor of HEAD.
