---
task_id: P2-E
phase: "2"
pilot: "stock-price"
goal_focus: "G5 (setup)"
owner: "dev-stock-price"
date: "2026-05-24"
blocked_by: "P2-D (DONE 2026-05-24T02:20:59Z)"
blocks: "P2-F (git mv superseded domain logic to _deprecated/)"
---

# P2-E — Create `stock-price-pre-delete` Tag

## Background

**L5 pre-revert tag discipline.** The `stock-price-pre-delete` tag must exist BEFORE any `git mv` of superseded domain/application logic. This sequencing ensures:

1. **G4 fence proven on pre-deletion codebase:** G4 fence was proven to catch violations on the current `.golangci.yml` state (P2-D).
2. **Git mv isolation:** Any fence violation introduced during P2-F's `git mv` operation is immediately detectable by comparing pre-delete tag state with post-move state.
3. **Rollback point:** Tag marks a known-good state before structural code moves.

---

## Task Definition

**Owner:** dev-stock-price

**Blocked by:** P2-D DONE (G4 evidence confirmed, freeze anchor locked)

**Blocks:** P2-F (G5a git mv; P2-F must verify pre-delete tag exists before moving files)

**Files touched:** None (tag-only operation)

**Estimated effort:** 5 minutes

---

## Acceptance Criteria

### AC-1: Tag Created at P2-D Commit

**Action:**
```bash
git tag stock-price-pre-delete HEAD
```

**Verify:**
```bash
git log --oneline stock-price-pre-delete | head -1
```

**PASS:** Output is the commit immediately after P2-D (the G4 evidence commit `e086cdf7`), OR a commit that is a proper descendant of `e086cdf7`. Tag name is `stock-price-pre-delete`, no `--force`, no `--no-verify`.

**Evidence:** Paste `git log --oneline stock-price-pre-delete` output to handoff.

---

### AC-2: Tag Exists in Local Repo

**Action:**
```bash
git tag | grep stock-price-pre-delete
```

**PASS:** Output contains exactly `stock-price-pre-delete` (one match, no duplicates).

**Evidence:** Paste output.

---

### AC-3: Frozen Anchor INTACT

**Action:**
```bash
git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1
```

**PASS:** Output is non-empty (the frozen anchor `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains a proper ancestor of HEAD).

**Evidence:** Paste output.

---

## Commit & Staging

**No source-code changes.** Tag creation does NOT require a code commit. However, per the phase-2 plan, you MAY optionally commit a signal file documenting the tag creation (similar to P2-A pattern).

**If committing a signal file:**
- Create `docs/signals/dev-sp-P2-E-tag-done-<UTC>.json` with fields:
  - `task: "P2-E"`
  - `tag_created: "stock-price-pre-delete"`
  - `tag_sha: "<output of git rev-parse stock-price-pre-delete>"`
  - `anchor_intact: true`
  - `next_actor: "pm"`
  - `next_action: "verify P2-E done, dispatch P2-F"`
- Stage with explicit path: `git add docs/signals/dev-sp-P2-E-tag-done-<UTC>.json`
- Commit: `git commit -m "chore(stock-price): P2-E — stock-price-pre-delete tag created (L5 pre-revert discipline)"`

**If tag-only (no signal commit):**
- No staging required. PM will detect the tag via `git tag | grep stock-price-pre-delete` and consider P2-E DONE when QA signals completion.

---

## Hard Constraints (Binding)

| Constraint | Rule |
|---|---|
| **No destructive git** | No `--force`, no `--no-verify`, no `--no-gpg-sign` |
| **No push** | Tag remains local; user owns pushing to remote when ready |
| **Anchor INTACT** | `debba8eaff0724d1fb32fc9d28640201cc32d1cc` remains ancestor of HEAD before AND after this task |
| **SSOT untouched** | Do NOT modify `docs/data/pilot-status-stock-price.json` (PM-owned) |
| **Charter §4.5** | NO goal flips. G5 setup does NOT flip any goal to YES |
| **No source changes** | This task is tag-creation only. ZERO changes to `apps/stock-price/**` |
| **L84 staging** | If committing signal file, use explicit path only: `git add docs/signals/...` |

---

## G-Goal Posture

**NO goal flips.** Tag creation is infrastructure-only. The P2-E task advances G5 setup (tagging discipline) but does NOT flip any G-goal state. §4.5 SSOT remains untouched.

---

## Blocking & Sequencing

- **Blocked by:** P2-D DONE (G4 evidence confirmed). Anchor is proven locked at `debba8eaff0724d1fb32fc9d28640201cc32d1cc`.
- **Next task:** P2-F (G5a `git mv` of `pkg/domain/services.go` to `pkg/domain/_deprecated/`). P2-F MUST verify `stock-price-pre-delete` tag exists before any file move.
- **Pre-condition for P2-F:** P2-F handoff step 0 will check `git log --oneline stock-price-pre-delete` before proceeding. If tag is missing, P2-F STOPS.

---

## References

- **Phase-2 plan (spec):** `docs/architecture-briefs/2026-05-23-stock-price-factory/phase-2-task-plan-go.md §P2-E`
- **Frozen anchor:** `debba8eaff0724d1fb32fc9d28640201cc32d1cb` (set at Phase 0)
- **L5 lesson:** `docs/policies/pre-revert-tags-l5.md` (or reference section of phase-2-task-plan)
- **P2-D evidence:** `docs/handoffs/TASK_P2-D-sp-g4-evidence.md` (proves G4 fence ready for P2-F sequencing)

---

## Evidence Checklist

- [ ] AC-1: `git log --oneline stock-price-pre-delete` output pasted
- [ ] AC-2: `git tag | grep stock-price-pre-delete` output pasted (one match)
- [ ] AC-3: `git log --oneline --ancestry-path debba8eaff0724d1fb32fc9d28640201cc32d1cc..HEAD | tail -1` non-empty output pasted
- [ ] Signal file created and committed (optional), OR tag-only confirmed ready for PM verification
