---
task_id: P2-KD-A
title: "Create kinh-dich-pre-ci Tag (Pre-Revert Anchor Before G4 Work)"
owner: dev-kinh-dich
phase: "2"
pilot: kinh-dich-service
status: READY
date_opened: "2026-05-24T00:00:00Z"
plan_ref: "docs/architecture-briefs/2026-05-23-kinh-dich-factory/phase-2-task-plan-ts.md §P2-KD-A"
ssot_ref: "docs/data/pilot-status-kinh-dich.json"
---

# P2-KD-A — Create `kinh-dich-pre-ci` Tag

**Owner:** dev-kinh-dich

**Blocked by:** — (first Phase 2 task)

**Files touched:** none (tag only)

---

## Background

L5 lesson baked Day 0. The pre-revert tag **MUST exist BEFORE** any `eslint.config.mjs` or CI work lands. Standalone task so PM can verify tag before dispatching P2-KD-B.

---

## Execution Steps

### Step 0 (only action):

```bash
git tag kinh-dich-pre-ci HEAD
```

Confirm with:

```bash
git log --oneline kinh-dich-pre-ci
```

Must return the current HEAD commit SHA + subject (the Phase-1 close-gate commit or a commit after it — specifically a commit that is an ancestor of HEAD at Phase-2 kickoff).

---

## Acceptance Criteria

**AC-1:** `git log --oneline kinh-dich-pre-ci` returns exactly one line referencing a Phase-1 commit.
No `--force`, no push.

**AC-2:** `git tag | grep kinh-dich-pre-ci` returns `kinh-dich-pre-ci` (tag exists in local repo).

**AC-3:** Anchor still INTACT: `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1` returns non-empty output.

---

## Deliverables

**Commit:** No commit required for tag creation. Dev creates a signal file documenting the tag SHA,
stages with L84 explicit path, and commits it as the evidence record.

**Signal file:** `docs/signals/dev-kd-P2-KD-A-done-<UTC>.json` (fields: task=P2-KD-A,
tag=kinh-dich-pre-ci, tagged_sha=<sha>, anchor_intact=true, next=pm).

---

## G-Goal Posture

**NO goal flips.** Tag is infrastructure only. §4.5 SSOT untouched.

---

## Handoff Sign-Off

Dev-kinh-dich: verify all 3 ACs above, create signal file, stage + commit, then emit RETURN.

PM awaits: signal file with tag SHA confirmed. Upon receipt, PM dispatches P2-KD-B immediately.
