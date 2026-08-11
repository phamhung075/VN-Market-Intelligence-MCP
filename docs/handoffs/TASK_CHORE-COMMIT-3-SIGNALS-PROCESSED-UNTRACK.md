---
sprint: CHORE-COMMIT-OVERHEAD
branch: task/chore-commit-3-signals-processed-untrack
size: S
priority: P2
depends_on: []
blocks: []
---

## TLDR

Finish the half-shipped 2026-07-12 untracking fix (P7 from `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md`): 536 `docs/signals/processed/*.json` files are still git-tracked and re-staged/committed on every drain. `signals.db` was already untracked; the `processed/` half stalled and git churn GREW from ~7.7/day to ~32/day. Add `.gitignore` rule, run one-time migration with `git rm --cached`, update `drain-signals.md`, and verify on clean checkout.

## [PM] Planning Context

**Root Cause:** August 2026 audit found:
- July 2026 brief (2026-07-12 P7) proposed untracking both `signals.db` and `docs/signals/processed/`
- `signals.db` shipped (confirmed untracked, covered by `*.db` rule in `.gitignore`)
- `docs/signals/processed/` half NEVER shipped — 536 files remain git-tracked
- Churn rate GREW: ~7.7/day (July) → ~32/day (August), not shrunk — this is the stalled fix getting worse

**Acceptance Criteria:**
- [ ] AC-1: Add `docs/signals/processed/` to `.gitignore` (new explicit line, not relying on existing `*.db` coverage since these are `.json` files)
- [ ] AC-2: One-time migration: `git rm --cached docs/signals/processed/*.json` — untrack all 536 existing files in one commit
- [ ] AC-3: Update `docs/agents/dev-team/flow/drain-signals.md` — remove the `git add -- docs/signals/processed/` line from the MANDATORY PERSIST GUARD staging step (line ~9, currently says "the second `git add` picks up the drain's own newly-moved `processed/` files")
- [ ] AC-4: Validation from clean checkout: on a fresh `git clone`, confirm that `git status docs/signals/processed/` shows nothing (files are not re-tracked after they're created by the drain). This requires running the full drain cycle or at least verifying that new processed/ files created by drain remain untracked. Document validation result clearly
- [ ] AC-5: Confirm no other scripts or flows still try to `git add docs/signals/processed/` — search for the pattern and document findings

**Files to read first:**
- `.gitignore` — current rules, line-by-line review
- `docs/agents/dev-team/flow/drain-signals.md` — MANDATORY PERSIST GUARD section (§ lines 6-11), commit staging prose
- `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md` — P7 (Recommended Fixes)
- `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` — §5 Finding 3 (half-shipped status)

**Files to modify:**
- `.gitignore` — add one line: `docs/signals/processed/`
- `docs/agents/dev-team/flow/drain-signals.md` — remove `git add -- docs/signals/processed/` from staging step; update prose to reflect untracked state
- (One-time) commit message that explains the half-shipped finish + archival note

**Key Validation Requirement (PO-Flagged):**
From `docs/agent-memory/decisions/sprint-CHORE-COMMIT-OVERHEAD-po.md`:

> **FIX-SIGNALS-PROCESSED-UNTRACK-GITIGNORE**: orch-validate Stage 1c hard-blocks any fleet-wide `orch-apply.sh` write on a dangling `detail_ref` — untracking these files makes any live `detail_ref` pointing at them dangle on a clean checkout, guaranteed not racy. Task must specify: **AC must be validated from a clean checkout, not the current working machine**. Also `.gitignore` currently has no `signals/processed` line — `signals.db` is only covered by a generic `*.db` rule, so this task needs an actual new gitignore rule, not just relying on existing coverage.

This is critical: you MUST validate the gitignore behavior on a fresh clone, not just in your working tree.

**Knowledge needed:**
- `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md` § P7 proposal
- `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` § Finding 3 context
- `docs/agent-memory/decisions/sprint-CHORE-COMMIT-OVERHEAD-po.md` § AC requirement for clean-checkout validation

---

## Architecture Reference

From `docs/architecture-briefs/2026-07-12-ultracode-workflow-improvement-audit.md`:

> **P7:** Untrack `docs/signals/processed/*.json` from git. `git rm --cached` the 536 tracked files, add `docs/signals/processed/` to `.gitignore`, drop the `git add -- docs/signals/processed/` line from the drain flow's commit-staging step. Full audit trail survives elsewhere (`docs/data/orch/archive/`, signal_queue history, durable pending_triage_inbox).

From `docs/architecture-briefs/2026-08-11-chore-commit-overhead-audit.md` § Finding 3:

> Only HALF shipped: `signals.db` is now gitignored (confirmed: `git ls-files docs/signals/signals.db` → empty), but **536** `docs/signals/processed/*.json` files remain git-tracked and are still staged/committed on every drain tick (`drain-signals.md` still runs `git add -- docs/signals/processed/`). The rate this finding flagged has since **grown**, not shrunk — 45 `chore(signals): drain + prune` commits landed in this sample's ≈1.4 effective live days (≈32/day), vs ≈7.7/day in July. This IS the genuine "diagnosed but stalled" gap.

---

## Scope Boundary

**IN SCOPE:**
- Adding `.gitignore` rule
- One-time `git rm --cached` migration
- Updating `drain-signals.md` prose to remove the staging line
- Clean-checkout validation (required)
- Searching for other `git add docs/signals/processed/` patterns

**OUT OF SCOPE (don't touch):**
- Modifying the drain-signals.js script (it should NOT try to add these files anyway)
- Changing the drain logic or file-move behavior
- Altering the archive location or retention policy
- Modifying `signals.db` gitignore rule (that is already done)

---

## Clean-Checkout Validation Plan

**Steps (MANDATORY):**
1. Commit `.gitignore` change + `drain-signals.md` update + `git rm --cached` all together in ONE atomic commit
2. On the SAME machine, in a DIFFERENT directory (or different clone):
   - `git clone <repo> test-checkout`
   - `cd test-checkout`
   - `git status` → confirm `docs/signals/processed/` does NOT appear in any tracked files
   - (Optional but recommended) Simulate a drain cycle or at least verify that if new `.json` files were created in `docs/signals/processed/`, `git status` shows them as untracked (`??`) not staged
3. Document the validation result in the commit message or a verification note

**Why this matters:** If validation is done in your working tree where the files already exist with git history, you might miss the case where a fresh checkout rebuilds them (if some script tries to recreate them). Clean checkout catches this.

---

## Success Criteria

1. `.gitignore` has explicit `docs/signals/processed/` line
2. 536 files untracked via one-time `git rm --cached` commit
3. `drain-signals.md` updated to remove staging line
4. Clean-checkout validation PASSED (documented)
5. On merge: drain commits no longer include churn from `processed/*.json` file mutations; commit count should decrease ~5-10% (those files were the volatile component of the ~45-59 drain+prune commits/window)
