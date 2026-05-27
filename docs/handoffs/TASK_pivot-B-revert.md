---
task_id: "pivot-B-revert"
title: "Revert 6 TS Phase-1 commits to enable Go reboot"
owner_preferred: "dev-technical-analysis"
owner_fallback: "developer"
status: "READY-FOR-DISPATCH"
created: "2026-05-22"
created_by: "po"
decision_ref: "docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md"
charter_ref: "docs/architecture-briefs/2026-05-22-refactor/pilot-charter.md"
priority: "P0 — unblocks the entire Phase 1 Go reboot"
estimated_effort: "20-40 minutes mechanical git work + verification"
---

# TASK pivot-B-revert — Revert 6 Phase-1 TS commits

**Authority:** PO decision `docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md` (Option B verdict, user direct).

**Goal:** restore `apps/technical-analysis/` to its pre-Phase-1 state so that the Go reboot can scaffold on a clean baseline. ONE atomic revert commit.

---

## Owner

**Preferred owner:** `dev-technical-analysis` IF its flow `.claude/flows/dev-technical-analysis/main.md` can execute pure `git revert` operations without invoking TS-specific tooling (it can — `git revert` is language-agnostic).

**Fallback owner:** `developer` (general dev agent) — use this if dev-technical-analysis flow rejects on a TS-only guard.

**Confirm-on-dispatch:** main terminal selects the owner based on the dispatch skill and current load. PO does not pin this further.

---

## Exact revert sequence

Run these as a sequence on `main` (no branch — repository policy is single-branch). Commits are listed **newest-first** because that is the order `git revert` requires when reverting a contiguous range.

```sh
git revert --no-edit 6248f3da 20ed83d5 241631af 3f522dc3 a22acdf3 16a04a00
```

`--no-edit` produces six default revert messages. After the sequence, **squash them into ONE commit** using `git reset --soft HEAD~6 && git commit` (see "Atomic commit" section below).

If the squash via `--soft` reset is not the dev's preferred workflow, an equivalent path is:
```sh
git revert --no-commit 6248f3da 20ed83d5 241631af 3f522dc3 a22acdf3 16a04a00
git commit -F /tmp/revert-message.txt
```
where the message file content is specified below.

Either approach is acceptable. PO does not block on workflow choice — only on the final outcome being a single atomic commit on `main`.

---

## Atomic commit message

Use this exact body via HEREDOC per repo commit convention:

```
revert(technical-analysis): pivot Phase 1 to Go per user verdict 2026-05-22

Reverts 6 Phase-1 TS commits to enable Go reboot of the TA pilot.

Reverted commits (newest-first):
- 6248f3da packages/primitives/technical-analysis/calculate-rsi.ts + test + scenarios
- 20ed83d5 DELETE apps/technical-analysis/src/index.ts (restored)
- 241631af apps/technical-analysis/src/interface/openapi.yaml (created)
- 3f522dc3 apps/technical-analysis/Dockerfile CMD + COPY
- a22acdf3 apps/technical-analysis/package.json entry point
- 16a04a00 apps/technical-analysis/composition-root.ts (created)

Reason: Option B language pivot per user verdict 2026-05-22
(see docs/po-decisions/2026-05-22-language-pivot-technical-analysis.md).
Charter goals G1-G12 unchanged. Phase 1 reboots in Go on same deadline 2026-07-03.

Scenario JSON files from 6248f3da are intentionally NOT preserved in this
revert (clean baseline). They will be regenerated in P1-B1g (Go RSI primitive)
using the Wilder test vector documented in p0-4-composition-root-plan.md.

openapi.yaml from 241631af is also reverted; the Go composition root will
re-author it as part of the Go P1-A4g scaffold step.
```

> **Owner override:** if owner judges the scenario JSONs OR openapi.yaml can be cleanly preserved through the revert (e.g., by `git checkout` to a holding dir, revert, then re-commit them in a follow-up), that is an acceptable optimization. In that case, amend the commit message above to note the preservation. PO accepts both paths; the clean-baseline path is the safer default.

---

## Post-revert verification (mandatory, before declaring done)

Run all of these from repo root. Each must produce the expected result.

### File-state checks

```sh
# 1. composition-root.ts must be GONE
test ! -f apps/technical-analysis/composition-root.ts && echo PASS || echo FAIL

# 2. src/index.ts must be RESTORED
test -f apps/technical-analysis/src/index.ts && echo PASS || echo FAIL

# 3. RSI primitive must be GONE
test ! -f packages/primitives/technical-analysis/calculate-rsi.ts && echo PASS || echo FAIL
test ! -f packages/primitives/technical-analysis/calculate-rsi.test.ts && echo PASS || echo FAIL

# 4. openapi.yaml must be GONE (or preserved per owner-override above; document choice in commit body)
test ! -f apps/technical-analysis/src/interface/openapi.yaml && echo PASS || echo FAIL

# 5. package.json entry point must be back to pre-P1 value
grep -E '"module"\s*:\s*"src/index.ts"' apps/technical-analysis/package.json && echo PASS || echo FAIL

# 6. Dockerfile must be back to pre-P1 CMD
grep -E 'CMD\s*\[\s*"bun"\s*,\s*"run"\s*,\s*"src/index.ts"\s*\]' apps/technical-analysis/Dockerfile && echo PASS || echo FAIL
```

### Behaviour checks (TS service must still run as it did pre-Phase-1)

```sh
# 7. TS tests still pass (the pre-Phase-1 baseline was green)
cd apps/technical-analysis && bun install && bun test
# Expect: pre-Phase-1 test count, all green. Document the count in the commit
# or as a comment in this handoff if it differs from the count noted in the
# original phase-1-task-plan.md (which said 24 pass, 0 fail before P1-A5).

# 8. Typecheck still passes
cd apps/technical-analysis && bun tsc --noEmit
# Expect: 0 errors.
```

### Git checks

```sh
# 9. Exactly ONE new commit on main since the dispatch
git log -1 --oneline
# Expect: a single revert commit referencing all 6 reverted hashes in its body.

# 10. The 6 original commits remain in history (revert does NOT rewrite history)
git log --oneline | grep -E '(6248f3da|20ed83d5|241631af|3f522dc3|a22acdf3|16a04a00)' | wc -l
# Expect: 6
```

---

## Acceptance criteria (DoD)

The task is DONE when **all** of these are true:

1. All 10 verification checks above produce PASS / expected output.
2. The repo has **exactly one** new commit on `main` containing all 6 reverts.
3. The commit message body lists all 6 reverted hashes and references this handoff + the PO decision doc.
4. Owner has appended a one-line completion note at the bottom of this handoff file in the form:
   ```
   ## Completion
   - Done at: <ISO timestamp>
   - Atomic revert commit: <new commit hash>
   - Pre-revert TS test count restored: <N pass / M fail>
   - Owner: <agent id>
   ```
5. Owner has NOT touched any file outside the 6 reverted scopes. No drive-by edits. No formatting changes. No notebook updates (that is a separate cycle).

---

## Blockers / risks

- **`.git/index.lock` race** — if a parallel cron is holding a lock, follow the project memory note "Git stale locks" (verify no live git process, then `rm` the lock).
- **Merge conflict during revert** — none expected (the 6 commits are recent and contiguous), but if one occurs: STOP, do not force-resolve, report back via TASK file completion section with the conflict details. PO will route to architect.
- **TS test count drift** — if pre-revert vs post-revert test counts differ for reasons unrelated to the 6 commits (e.g., a sibling test was added/removed in the interim), record both numbers in the completion note and flag for QA.

---

## What this task does NOT do

- Does NOT scaffold any Go code. That is `P1-A1g` and beyond, in `phase-1-task-plan-go.md`, dispatched separately.
- Does NOT edit `pilot-status.json`. PO has already updated it.
- Does NOT edit the charter. PO has already amended it.
- Does NOT delete the obsolete `phase-1-task-plan.md`. Architect MAY add an obsolescence banner later; not in this task's scope.

---

## Next after this task completes

Main terminal will dispatch `architect` to author the Go composition-root spec (`cmd/server/main.go`, `internal/`, `go.mod`, multi-stage Dockerfile). After that spec is PO-approved, `pm` fills out `phase-1-task-plan-go.md` with concrete Per-Task Specs, and dev resumes at P1-A1g.

---

## Completion

- Done at: 2026-05-22T00:00Z
- Atomic revert commit: 0ef01be8
- Pre-revert TS test count restored: 24 pass / 0 fail
- Owner: developer
