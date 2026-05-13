# dev-team notebook

## Current state (c77 close — 2026-05-13T18:55Z)
- Pipeline: idle. Main HEAD `7139f3e3` (pm-c77).
- WIP: 0/2. Branches: main only. Worktrees: main only.
- HEAD.lock cures lifetime: **32/32** (2 fired in c77: #31 first commit attempt age=16s com.apple, #32 cherry-pick attempt age=19s com.apple — both Monitor-waited past 60s then auto-cured).

## c77 cycle log
- PREFLIGHT: clean entry on `a7db1c66`. Drained 1 signal (TNB c47 fingerprint-replay archived).
- PO triage: BATCH(3) initially — but **doc-stale self-heal** triggered: TASKS.md showed `1899a-factory` Todo, but TASK_1899a-factory.md showed `[QA] APPROVED b2b84977` already shipped c75. Removed Todo row + dropped `1899a-factory` from 1899a-bloomberg/reuters-fallback dependency chain. Re-pivoted to 1899a-bloomberg + 1903a (ba spec) since factory unblocked them.
- Tier 1 execution (parallel, disjoint zones):
  - Track A (dev-mainserver-crawls worktree agent-a63fd9e29f6856090): 1899a-bloomberg — Playwright + stealth + DOM/JSON fallback + PerimeterX bypass. Feat `44e2f0a5` + notebook `5fd76f0e`. 29/29 tests, 0 tsc errors, DDD PASS.
  - Track B (ba): 1903a spec → `docs/REQ_1903a.md` commit `3ffe4015`. Live re-verification confirmed both `write_alert_verdict` and `get_macro_snapshot` HEALED post c73 restart. Recommended regression-test-only path (mirrors 1898a precedent).
- Tier 2 execution (dev-mcp-server worktree task-1903a-regression-shape): 1903a regression tests `7415fcd2`. 199L (within split-policy cap). 10/10 pass (WAV-REG-01..07 + GMS-REG-02..04). Test-only patch — no prod code changed.
- Merge gate:
  - 1899a-bloomberg → main `d76fc44b` (tree-verify PASS, c2-alert OK).
  - 1899a-bloomberg notebook → main `bf0f3bdd` (tree-verify PASS, c2-alert OK).
  - 1903a → main `4833b052` (tree-verify PASS, c2-alert OK).
- QA gates:
  - 1899a-bloomberg: APPROVED `b83df34c`. 29/29 + 84/84 full suite, 0 tsc errors. **Non-blocking:** test file 494L exceeds 200L split-policy → follow-up task `1899a-bloomberg-test-split` queued.
  - 1903a: APPROVED `d823fccc`. 10/10 targeted + 32/32 084+089 precedent, 0 tsc errors. 7/7 ACs verified.
- pm c77 update: `7139f3e3` (TASKS.md state changes, 82L 2L over cap — acceptable for milestone rows).

## Lessons / patterns
- **Doc-stale self-heal**: TASKS.md drift vs handoff `[QA] APPROVED` block is a robust signal that a row already shipped silently in a prior cycle. Always cross-reference handoff file before scheduling work that depends on a Todo row.
- **Cherry-pick partial-state recovery**: when HEAD.lock fires mid-cherry-pick, `.git/CHERRY_PICK_HEAD` + `.git/MERGE_MSG` survive — after waiting out the lock, complete via `git commit -F .git/MERGE_MSG` rather than aborting/restarting (preserves index + commit message verbatim).
- **CWD persistence**: cherry-pick must be invoked from main CWD, not the worktree CWD. After ANY Agent return that used `EnterWorktree`, prefix the next git command with `cd <main-path>` or use `git -C <main-path>`.
- **Background hook contamination**: market-watcher/news-scout/qa-responder notebook hooks fire mid-cycle and stage their own files via `-a` style commits. If you have staged work waiting, expect it may get swept into a `chore(memory/...)` commit. Mitigation: commit promptly, or pre-stash unrelated changes.
- **Split-policy decision rubric**: 494L test file with clean non-overlapping logical groups (DOM / JSON / PerimeterX / helper) — non-blocking with follow-up task is the right call. The cap is about reviewability + merge contention; a self-contained test file with no shared state has neither risk.

## Carry-over to c78
- **1899a-reuters-fallback** (HIGH) Todo, fully unblocked. Zone: apps/news-fetch/. Implements Reuters fallback via Playwright stealth (sibling of bloomberg, same factory).
- **1899a-routes** (Tier 3) blocked-by ONLY `1899a-reuters-fallback` now. When it lands, routes can wire.
- **1899a-bloomberg-test-split** (Low) Todo: split 494L test into 4 ≤200L files by logical group.
- **1897b-carry (URGENT-F1)** still waits on USER Docker .git/ exclude action.
- **`.claire/worktrees/` orphan dir** still present (typo from prior cycle) — janitor target.
- **2 preflight lsof logs from c77** (`preflight-lsof-20260513T164358Z.log`, `preflight-lsof-20260513T164759Z.log`) untracked — keep for HEAD.lock root-cause archive; consider rotation policy if log dir grows.
