# dev-team notebook

## Current state (c82 close — 2026-05-13T20:55Z)
- Pipeline: idle. Main HEAD `7ff3bd5b` (pm c82 notebook).
- WIP: 0/2. Branches: main only. Worktrees: main only.
- HEAD.lock cures lifetime: **39/39** (2 fired in c82: #38 + #39, both during merge-gate, both auto-cured after >60s age verification).

## c82 cycle log
- PREFLIGHT: clean (no HEAD.lock at entry). worktree prune empty. signals/ empty.
- PO triage: BATCH(2) — 1903a (HIGH FIX, M, apps/mcp-server/, 2-cycle TNB evidence) + 1888b (HIGH SSOT, XS, .claude/AGENT_MODELS_README.md).
- Tier execution (parallel via isolation:worktree):
  - Track A (dev-mcp-server): worktree `agent-a656e72ae289f2091`. **Re-verification found BOTH sub-bugs STALE.** Bug A (write_alert_verdict) returns correct `{success, id, ticker, verdict}` shape (alertVerdictTools.ts:64,87). Bug B (get_macro_snapshot) emits correct regime snapshot (macroTools.ts). Root cause of TNB evidence: stale `.js` artifacts in container, cleared on c73 restart. Regression tests landed at c77 (`4833b052`). No production code change needed. Notebook-only commit `be25b299`.
  - Track B (developer): worktree `agent-aa1716eee14b98f65`. Branch `task/1888b-agent-models-ssot` (later resolved as worktree-auto branch). Commits `f381bc12` (fix) + `a68e8c79` (notebook). 4 hardcoded count sites replaced with SSOT pointers (`#devAgentCount` + `#microserviceAgentCount`). Verified values exist in project-stats.json (devAgentCount=17, microserviceAgentCount=9).
- Merge gate (MESSY — significant cleanup needed):
  - 2 background market-watcher commits landed mid-gate (`2120aec3` notebook + `89bf0da0` self-heal), advancing main HEAD twice.
  - HEAD.lock cure #38: age=88s, auto-cured.
  - 18 stale test file deletions in main worktree (unstaged) — restored via `git restore`. Cause: unknown rogue agent or interrupted operation. Files exist in HEAD `2120aec3` and were correctly restored.
  - Cherry-pick A `be25b299` initially failed (uncommitted state). After clean restore, re-attempted: succeeded as `4221b371`, then was rewound by accidental `--abort` during B prep. Re-cherry-picked as `d5251193`.
  - HEAD.lock cure #39: triggered post-A cherry-pick, age=78s, auto-cured.
  - Cherry-pick B succeeded: `49f5d1eb` (fix) + `ff618e1d` (notebook).
  - Worktrees unlocked + force-removed. All task + worktree-agent-* branches deleted.
- QA gate:
  - 1903a: APPROVED (stale-resolved). Regression tests `1903a-dispatch-regression.test.ts` 10/10 pass. No "Message sent to WORK channel" in alert path. tsc 0 errors.
  - 1888b: APPROVED. No hardcoded counts remain. SSOT pointers present + values verified.
- pm c82 update: TASKS.md `5b725af0` → 70L. Done rows: `1903a-SHIPPED-c82` (stale-resolved), `1888b-SHIPPED-c82`. project-stats.json totalTasksDone +2.

## Lessons / patterns
- **Stale-bug re-verification is essential**: 1903a TNB evidence was 2 cycles old. Re-running grep + tests BEFORE coding revealed both bugs already self-healed by c73 restart + c77 regression tests. Saved a wasted ba→architect→developer chain. Pattern: for HIGH FIX with >1-cycle-old evidence, FIRST step is always re-verification, not fix planning. If agent finds stale, close as "stale-resolved" with the verifying regression tests as receipt.
- **Background commits can advance main during gate**: market-watcher cron + self-heal landed 2 commits mid-merge-gate (`2120aec3`, `89bf0da0`). Cherry-picks still worked because they're SHA-anchored, not HEAD-relative. Pattern is safe but requires re-reading HEAD before final close commit.
- **Unstaged test file deletions in main worktree**: 18 monorepo test files deleted (unstaged) in working tree but still in HEAD. Cause unknown — possibly an aborted janitor or rogue process. Recovery: `git restore <paths>` brings them back. Add to investigation backlog: identify what's deleting these and prevent it.
- **HEAD.lock pattern continues** (#38, #39 in c82 alone, 5 cures in 6 cycles). Both auto-cured after age>60s with no live git pid. Pattern is durable. Still no auto-cure-without-escalation in skill — c83 candidate for code-janitor: detect com.apple/macOS-VM Spotlight-pattern locks and auto-handle silently.
- **`git cherry-pick --abort` rewinds HEAD silently**: if you abort while another cherry-pick is in flight (e.g., due to second cherry-pick blocking), it can undo a prior successful cherry-pick. Pattern: always check `git log --oneline -2` after abort to confirm what landed; re-apply if needed.
- **Worktree branch naming inconsistency**: dev-mcp-server (Track A) created `task/1903a-mcp-dispatch-collision` AND that branch contained the notebook commit; developer (Track B) reported the same convention but the actual branch in worktree list was `worktree-agent-aa1716eee14b98f65`. Both worked because cherry-pick is SHA-based, not branch-name-based. But the naming inconsistency is worth standardizing in c83.

## Carry-over to c83
- **1881a** (HIGH METHODOLOGY) — source_tier retrofit ~15 tools.
- **1888c/d/g** (HIGH/MEDIUM SSOT) — doc-only XS batch.
- **1899a-bloomberg-test-split** (LOW).
- **1900c-health-probe-refine** (LOW OPS).
- **1862c-E-dashboard** (USER-action).
- **1897b-carry** (URGENT-F1 USER-action).
- **1862c-F** (MEDIUM FIX, blocked on container-rebuild).
- **Investigation candidate**: who/what is deleting test files in main worktree? If recurs c83, escalate.
- **Skill enhancement candidate**: auto-cure HEAD.lock without escalation for Spotlight/com.apple/macOS-VM PID patterns + age>60s. 5 cures in 6 cycles justifies durable handling.
