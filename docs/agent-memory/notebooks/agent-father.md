# Agent Father — Notebook

**Last updated:** 2026-05-13
**Sprint:** c57 / HEADLOCK-DIAGNOSTIC+WORKTREE-GC-c57

## Last Session Summary

HEADLOCK-DIAGNOSTIC+WORKTREE-GC-c57: two atomic flow+protocol edits. Augmented dev-team/main.md Step 0-PREFLIGHT with T1 (lsof capture before safe-remove + GIT_TRACE comment for future commit wrapping), T2 (lock-size via stat -f %z), T5 (git worktree prune with WORK alert), T6 (24h worktree lock expiry sweep in .claude/worktrees/). PREFLIGHT block 31L → 62L; main.md 136L → 165L (under 170L soft cap). Updated head-lock-self-cure.md 89L → 118L (under 120L cap) with c57 section documenting all changes, H2 elimination, evidence paths, next-step gate. Tree-map registration confirmed (no new row needed). PREFLIGHT dry-run clean (HEAD.lock absent, worktree prune nothing, .claude/worktrees/ scanned with no stale locks).

## Commits (c57)

- `749a0b02` fix(dev-team/c57): PREFLIGHT diagnostic + worktree gc — flow edit
- `3ff05127` docs(protocol/c57): head-lock-self-cure c57 update — H2 eliminated, diagnostic instrumentation

## H2 Elimination (c57 pre-PO probe)

No executable commit hooks in .git/hooks/ (only pre-push symlink). gpgsign=false confirmed. H2 eliminated. Remaining hypotheses: H1 (rapid sequential race), H3 (SDK signal handling), H4 (APFS-on-Docker-VM). Evidence collection now active via preflight-lsof-*.log.

## Lessons Learned

- [c57] PREFLIGHT algorithm can grow beyond split-policy 120L if the dispatcher needs the algorithm inline. Size-justification comment must document the overage explicitly.
- [c57] When no .claude/worktrees/ dir exists, the T6 sweep silently skips — correct behavior, avoids noise.
- [c57] Dry-run the new algorithm immediately after edit to catch bash syntax errors before commit.
- HEAD.lock recurrence is a known pathology (c55 self-cure added PREFLIGHT). Within a single session it can fire multiple times — each occurrence: verify 0-byte + no live pid → rm is safe.
- index.lock can auto-clear between git add and git commit — re-stage required.
- TASKS.md "≤80 lines" constraint requires trimming cosmetic blank lines.
- [c53] index.lock from a prior process — safe to rm if no other git process running.
- docs/agents/ (not .claude/agents/) is canonical home for knowledge.md + handlers.md

## Cross-Team Notes

- cowork-refactory-expert: live tool surface rewrites — do not duplicate
- claude-manager-helper: DAG integrity + tree-map enforcement — do not duplicate
