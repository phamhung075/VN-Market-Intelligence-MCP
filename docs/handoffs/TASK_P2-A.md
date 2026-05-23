---
title: "TASK_P2-A — Create stock-price-pre-ci Tag"
date: "2026-05-24"
pilot: "stock-price"
phase: "2"
task_id: "P2-A"
owner: "dev-stock-price"
status: "READY"
blocked_by: null
blocks: "P2-B"
ac_count: 3
goal_impacts: "G4 (setup)"
---

## Context

**Pilot:** stock-price (fleet pilot 3)
**Phase:** 2 (Goal closure: G3, G4, G5, G9, G10, G11 + carry-forward EARNED-PENDING G1, G2, G6, G7, G8, G12)
**Task:** P2-A — First Phase-2 action
**Owner:** dev-stock-price
**Blocked by:** none
**Blocks:** P2-B

---

## Summary

The pre-revert tag `stock-price-pre-ci` MUST exist BEFORE any `.golangci.yml` or CI work lands. This is a standalone task so PM can verify the tag before dispatching P2-B. The tag marks the commit state immediately before G4 work begins, establishing a rollback anchor under L5 tag discipline.

**Background:** L5 lesson baked Day 0. The pre-revert tag is created BEFORE any mutation, with no `--force`, no push. This ensures the freeze anchor is unambiguous and the fence integrity can be audited post-creation.

---

## Acceptance Criteria

### AC-1 — Tag points to phase-1 ancestor commit

**Command:**
```bash
git log --oneline stock-price-pre-ci
```

**Expectation:**
Returns exactly one line referencing a Phase-1 commit (the commit that is ancestor of HEAD at Phase-2 kickoff). This is the P1-G close-gate commit or a commit immediately after it.

**Evidence:** Paste the output of `git log --oneline stock-price-pre-ci` to the handoff signal.

---

### AC-2 — Tag exists in local repo

**Command:**
```bash
git tag | grep stock-price-pre-ci
```

**Expectation:**
Returns `stock-price-pre-ci` (tag exists in local repo, no special characters, no errors).

---

### AC-3 — Anchor INTACT (no regression)

**Command:**
```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```

**Expectation:**
Returns non-empty output. The frozen anchor commit `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains a proper ancestor of HEAD after tag creation.

---

## Step 0 — Tag Creation (only action)

```bash
git tag stock-price-pre-ci HEAD
```

**Confirm with:**
```bash
git log --oneline stock-price-pre-ci
```

Must return the current HEAD commit SHA + subject.

---

## Implementation Notes

- **No commit required:** The tag itself is the evidence. No source code change.
- **Revert discipline:** No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push`.
- **Signal file:** Dev creates a signal file documenting the tag SHA and commits it as the evidence record. See Signal File section below.
- **Anchor preservation:** The frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` must remain an ancestor throughout Phase 2.

---

## Signal File

**Name:** `docs/signals/dev-sp-P2-A-done-<UTC>.json`

**Fields:**
```json
{
  "from": "dev-stock-price",
  "to": "pm",
  "type": "task-done",
  "priority": "high",
  "createdAt": "<ISO-UTC-timestamp>",
  "payload": {
    "pilot": "stock-price",
    "phase": "2",
    "task": "P2-A",
    "tag": "stock-price-pre-ci",
    "tagged_sha": "<full-SHA-of-current-HEAD>",
    "anchor_intact": true,
    "ac_verdicts": {
      "AC-1": "PASS — tag points to <commit-sha> (ancestor of HEAD, Phase-1 gate)",
      "AC-2": "PASS — git tag | grep stock-price-pre-ci returns stock-price-pre-ci",
      "AC-3": "PASS — anchor debba8eaff0724d1fb32fc9d28640201cc32d1cc is still ancestor (ancestry-path non-empty)"
    },
    "git_log_output": "<paste output of git log --oneline stock-price-pre-ci>",
    "next_actor": "pm",
    "next_action": "record P2-A DONE, dispatch P2-B"
  }
}
```

**L84 Staging:**
```bash
git add docs/signals/dev-sp-P2-A-done-<UTC>.json
```

(Explicit path per L84, not `-A` or `.`)

---

## Commit

**Commit subject pattern:**
```
chore(stock-price): P2-A — create stock-price-pre-ci tag (pre-revert anchor before G4 work)
```

**Evidence to include in commit:**
- Signal file documenting tag creation and AC verdicts

---

## G-Goal Posture

**NO goal flips.** Tag is infrastructure only. §4.5 SSOT untouched — `decisionMatrix` stays TBD, `goalsEarned` stays 0.

---

## Phase 2 Context

**Total Phase 2 scope:**
- 14 atomic tasks (P2-A through P2-Z)
- 66 acceptance criteria
- WIP=1 sequential (no parallel dispatch)
- Pre-revert tag discipline: P2-A (stock-price-pre-ci), P2-E (stock-price-pre-delete), P2-L (stock-price-pre-inject)

**Task sequence:**
```
P2-A (stock-price-pre-ci tag)
  ↓
P2-B (.golangci.yml Fence-A/B/C + CI job wiring)
  ↓
P2-C (G4 deliberate-violation proof — reverted, NEVER committed)
  ↓
P2-D (G4 freeze anchor confirmation)
  ↓
P2-E (stock-price-pre-delete tag)
  ↓
P2-F (G5a — git mv superseded logic to pkg/_deprecated/)
  ↓
P2-G (G5b/G5c — MCP audit + zero TODO.*migrat)
  ↓
P2-H (G3 — composition root cleanup + OpenAPI contract)
  ↓
P2-I (G6/SI-2 — 3-panel dashboard finalization + SI-2 fleet index)
  ↓
P2-J (G8 honest-red proof)
  ↓
P2-K (G9 PO Playwright Path B)
  ↓
P2-L (stock-price-pre-inject tag + G10 bug injection)
  ↓
P2-M (G10 fix ≤2 cycles + G11 2-trial coupling proof)
  ↓
P2-Z (Phase-2 close-gate — QA)
```

---

## Reference

- **Plan:** docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md §P2-A (lines 156–189)
- **Charter:** docs/architecture-briefs/2026-05-23-stock-price-factory/pilot-charter.md §Pre-Revert Tags
- **SSOT:** docs/data/pilot-status-stock-price.json (phase2.current_task = P2-A)
- **Lesson L5:** Pre-revert tag discipline, created BEFORE mutation, no retag/rewrite/push
- **Frozen anchor:** debba8eaff0724d1fb32fc9d28640201cc32d1cc (set at P0-SP-4, INTACT throughout Phase 2)
