# TASK_P2-KD-E — Create `kinh-dich-pre-delete` Tag

**Pilot:** kinh-dich-service (fleet pilot-4)
**Phase:** 2
**Task ID:** P2-KD-E
**Owner:** dev-kinh-dich
**Blocked by:** P2-KD-D DONE (G4 evidence confirmed)
**Blocks:** P2-KD-F (G5a `git mv` of superseded domain/services.ts)
**Est hours:** 0.08
**AC count:** 3
**Date issued:** 2026-05-24
**PM-Approved at:** 2026-05-24T23:30:00Z

---

## Background

L5 (pre-revert tags) discipline. The `kinh-dich-pre-delete` tag MUST exist BEFORE any `git mv` of superseded domain logic. This sequencing ensures G4 fence is proven on the pre-deletion codebase, so any fence violation introduced during the `git mv` operation is immediately detectable.

The tag is infrastructure-only (no code changes). This is a gate task that creates a rollback anchor before the destructive G5a phase begins.

---

## Acceptance Criteria

### AC-1 — Tag Created at Current HEAD

**Command:**
```bash
git tag kinh-dich-pre-delete HEAD
```

**Verify:**
```bash
git log --oneline kinh-dich-pre-delete
```

Must return exactly one line showing the current HEAD commit SHA + subject. The commit must be at or immediately after the P2-KD-D evidence signal.

**Status:** PASS when tag is created and resolves to HEAD.

---

### AC-2 — Tag Exists Locally

**Command:**
```bash
git tag | grep kinh-dich-pre-delete
```

Must return `kinh-dich-pre-delete` (tag name only, no error).

**Status:** PASS when grep returns the tag name.

---

### AC-3 — Anchor Still INTACT

**Command:**
```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```

Must return non-empty output (the most recent commit on the ancestry path from the frozen anchor to HEAD). This confirms the anchor at commit `debba8ea...` remains an ancestor of all subsequent work.

**Status:** PASS when command returns non-empty.

---

## Implementation Steps

1. **Verify pre-condition:** Confirm P2-KD-D is complete by checking the g4-evidence.md file exists:
   ```bash
   test -f docs/handoffs/TASK_P2-KD-D-g4-evidence.md && echo "P2-KD-D evidence found"
   ```

2. **Create the tag:**
   ```bash
   git tag kinh-dich-pre-delete HEAD
   ```
   No `--force`, no push. Tag is local-only at this stage.

3. **Verify all 3 ACs pass** (see Acceptance Criteria above).

4. **Create signal file** (see Signal & Handoff Submission below).

5. **Stage + commit** the signal file (see Staging & Commit below).

---

## Signal & Handoff Submission

**Signal file location:**
```
docs/signals/dev-kinh-dich-P2-KD-E-done-<UTCstamp>.json
```

**Signal file format:**
```json
{
  "agent": "dev-kinh-dich",
  "task_id": "P2-KD-E",
  "task_title": "Create kinh-dich-pre-delete tag",
  "status": "DONE",
  "timestamp": "2026-05-24T<HH:MM:SS>Z",
  "evidence": {
    "tag_created": "kinh-dich-pre-delete",
    "tag_sha": "<current-HEAD-sha>",
    "tag_exists_locally": true,
    "anchor_intact": true,
    "anchor_verification_output": "<git log output>"
  },
  "ac_verdicts": {
    "AC-1": "PASS",
    "AC-2": "PASS",
    "AC-3": "PASS"
  },
  "next_actor": "main-router",
  "next_action": "Fan out dev-kinh-dich for P2-KD-F (G5a git mv of superseded domain/services.ts)"
}
```

Replace `<UTCstamp>` with ISO 8601 UTC timestamp (e.g., `20260524T233000Z`).

---

## Constraints & Rules

| Constraint | Rule |
|---|---|
| **L84 staging** | `git add docs/signals/dev-kinh-dich-P2-KD-E-done-*.json` (explicit path only). NEVER `git add -A` or `git add .` |
| **No force/push** | No `--force`, no `--no-verify`, no `--no-gpg-sign`, no `git push` of this task's output |
| **Anchor INTACT** | Anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` must remain ancestor. Verify with AC-3 command. |
| **SSOT untouched** | Do NOT modify `docs/data/pilot-status-kinh-dich.json`. PM owns this file. |
| **No goal flips** | NO change to any G-goal status field in SSOT. Tag is infrastructure only. |
| **No branches** | All work on `main`. No feature branches. |
| **Single-committer serialization** | Before staging: `git diff --cached --name-only`. If FOREIGN paths appear, WAIT. Never `git reset HEAD` a foreign path. |

---

## Commit Message Template

```
chore(kinh-dich): P2-KD-E — create kinh-dich-pre-delete tag (pre-revert anchor before G5a)
```

Body (optional):
```
Tag created at HEAD (P2-KD-D close point) per L5 discipline.
Protects rollback point before git mv of superseded domain/services.ts.
AC-1/AC-2/AC-3 all PASS.
```

---

## G-Goal Posture

**NO goal flips.** This task is infrastructure-only. The `goalsEarned` counter stays at 0. The decisionMatrix stays TBD.

Per Charter §4.5, goal flips are PO-only, atomic at 12/12 terminal close in Phase 3.

---

## Success Criteria (for PM verification post-return)

- [ ] Signal file created with correct timestamp
- [ ] All 3 ACs documented in signal with PASS verdict
- [ ] Tag `kinh-dich-pre-delete` exists locally (git tag shows it)
- [ ] Commit made with L84 explicit staging (git add <path> only)
- [ ] No foreign paths staged
- [ ] Anchor still INTACT (AC-3 command returns non-empty)
- [ ] SSOT file untouched (pilot-status-kinh-dich.json not modified by dev)

---

## Next Task

After PM confirms P2-KD-E DONE, next task is **P2-KD-F** (G5a — `git mv` of superseded domain logic).

Dispatch will route dev-kinh-dich to TASK_P2-KD-F.md for the first destructive phase of G5.
