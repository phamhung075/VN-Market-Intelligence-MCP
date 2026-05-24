---
task_id: "P2-E"
pilot: "alert-engine"
phase: "2"
title: "Create alert-engine-pre-delete tag (pre-revert anchor before G5a work)"
owner: "dev-alert-engine"
blocked_by: "P2-D (G4 evidence confirmed — fence proven before deletion)"
blocks: "P2-F"
estimated_duration: "5 minutes"
acceptance_criteria_count: 3
goal_advanced: "G5 (setup)"
goal_posture: "NO goal flips — tag infrastructure only. §4.5 SSOT untouched."
---

# P2-E — Create alert-engine-pre-delete Tag

**Owner:** dev-alert-engine  
**Blocked by:** P2-D DONE (G4 evidence confirmed — fence proven before deletion)  
**Blocks:** P2-F  
**Files touched:** none (tag only)

---

## Background

L5 tag discipline. The `alert-engine-pre-delete` tag MUST exist BEFORE any `git mv`
of superseded domain logic. This sequencing ensures the G4 fence is proven on the pre-deletion
codebase, so any fence violation introduced during the `git mv` operation is immediately detectable.

---

## Step 0 (only action)

```bash
git tag alert-engine-pre-delete HEAD
```

Confirm:
```bash
git log --oneline alert-engine-pre-delete
```

Must return the HEAD commit at P2-D close (the G4 evidence commit).

---

## Acceptance Criteria

### AC-1: Pre-delete tag created at current HEAD

```bash
git log --oneline alert-engine-pre-delete
```

Must return the commit at or immediately after P2-D (the G4 evidence signal commit).

**Verdict:** _____ (PASS / FAIL)

---

### AC-2: Tag visible in local repository

```bash
git tag | grep alert-engine-pre-delete
```

Must return `alert-engine-pre-delete`.

**Verdict:** _____ (PASS / FAIL)

---

### AC-3: Frozen anchor INTACT

```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```

Must return non-empty output (anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` is still a proper
ancestor of HEAD — no rebase, no force-push).

**Verdict:** _____ (PASS / FAIL)

---

## Signal Specification

Create file: `docs/signals/dev-ae-P2-E-done-<UTC>.json`

Template:
```json
{
  "task": "P2-E",
  "pilot": "alert-engine",
  "phase": "2",
  "title": "Create alert-engine-pre-delete tag",
  "status": "DONE",
  "completed_at": "<ISO-8601 UTC timestamp>",
  "owner": "dev-alert-engine",
  "tag_name": "alert-engine-pre-delete",
  "tagged_sha": "<commit SHA>",
  "anchor_intact": true,
  "ac_verdicts": {
    "AC-1_tag_at_current_head": "PASS",
    "AC-2_tag_visible": "PASS",
    "AC-3_anchor_intact": "PASS"
  },
  "next_actor": "pm",
  "next_action": "mark P2-D DONE, sequence P2-F, update SSOT phase2.current_task"
}
```

---

## Goal Posture

**NO goal flips.** Tag is infrastructure only. All 3 ACs are infrastructure verification, not business logic.
§4.5 SSOT untouched — `goalsEarned` stays 0, `decisionMatrix` stays all-TBD.

---

## Commit

**No commit required from dev-alert-engine for tag creation.** Signal file is committed by PM as part of the
P2-E dispatch cycle (after router verifies AC signatures).

If dev prefers to commit the signal file immediately:
```bash
git add -f docs/signals/dev-ae-P2-E-done-<UTC>.json
git commit -m "docs(signal): dev-ae-P2-E-done — alert-engine-pre-delete tag created"
```

Otherwise, PM fetches this signal, verifies ACs, and commits it as part of P2-E DONE → P2-F SEQUENCED transition.
