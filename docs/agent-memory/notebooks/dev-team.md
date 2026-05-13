# dev-team notebook

## Current state (c76 close — 2026-05-13T16:30Z)
- Pipeline: idle. Main HEAD `a7db1c66`.
- WIP: 0/2. Branches: main only.
- HEAD.lock cures lifetime: **30/30** (2 fired in c76: #29 mid-housekeeping age=348s, #30 mid-cherry-pick age=847s, both com.apple lsof — auto-cured per protocol).

## c76 cycle log
- PREFLIGHT: clean entry. Drained 1 signal (TNB c46 fingerprint-replay, archived).
- PO triage: BATCH(3) — CLEAN housekeeping + 1898a FIX-HIGH + 1899a-app SCAFFOLD. PO held TNB c46 classification (false-alarm-h4-batch).
- Step 3 execution (parallel, disjoint zones):
  - Track A (developer worktree ae1c6f5a): 1899a-app use-cases.ts (34L). **Contamination** detected: worktree base d532495b predated c76 housekeeping → commit 16064b37 included reverts of CLAUDE.md + notebook-write/SKILL.md. Mitigated by extracting use-cases.ts only → clean commit `98703242`.
  - Track B (ba): 1898a spec → `docs/REQ_1898a.md` commit `99bf48e6`. Verified bug SELF-HEALED post c73 restart. Recommended regression-shape tests only.
  - Tier 2 (dev-mcp-server worktree ae6e989b): 1898a regression tests `2d3ed5c7` (2 test files, 62L). Clean — no hook contamination this time (worktree base was post-c76).
- Merge gate: tree-verify PASS, c2-alert OK on both shipped commits.
- QA gate 1898a: APPROVED `45a74e4d`, full AC mapping verified.
- pm c76 update: `24962042` (TASKS.md state changes, notebook overwrite). c76 close: `a7db1c66`.

## Lessons / patterns
- **Worktree-base drift**: when housekeeping commits land DURING agent execution, worktree commits may include reverts of those changes via hook auto-staging. **Mitigation**: extract specific files via `git checkout <commit> -- <path>` and commit fresh on main. Avoid raw `cherry-pick` when worktree base is stale.
- **Bug self-heal pattern (1898a)**: TNB c45 flagged stale-build artifacts; c73 gateway restart cleared them. BA re-verification cheaper than full FIX. Regression-shape tests guard against silent reintroduction without rewriting production code.
- **`.claire/worktrees/`**: orphan typo directory observed in git status — flag for janitor next cycle.

## Carry-over to c77
- **1899a-routes (Tier 3)** now unblocked (depends 1899a-app DONE, 1899a-reuters-rss DONE — wait still depends on 1899a-bloomberg + 1899a-reuters-fallback adapters).
- **1903a (HIGH)** MCP dispatch hardening bundle from TNB c46 #4+#5 sits in Backlog.
- **1897b-carry (URGENT-F1)** still waits on USER Docker .git/ exclude action.
- **`.claire/` orphan** to clean.
