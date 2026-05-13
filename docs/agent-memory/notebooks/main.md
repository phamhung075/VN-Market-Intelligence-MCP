# Dev Team — Sprint Boundary Notebook

**Written:** 2026-05-13T05:48Z (c64 close — SPIKE_006-T2 + 1897a abandon)

## c64 (2026-05-13T05:36Z → 05:48Z, ~12min)

| Step | Action | Result |
|------|--------|--------|
| 0 PREFLIGHT | HEAD.lock age=805s 0B PID 51247 — **15th** recurrence cured | lsof log `20260513T053657Z` |
| 0a Drain | 0 pending signals | empty |
| 1 PO Triage | 0 telegram / 0 unresolved / TASKS.md backlog → BATCH(2) | 1897a CHORE + SPIKE_006-T2 FIX |
| 3 Tier 1 SEQUENTIAL | dev-mcp-server (1897a) → dev-mcp-server (T-2) | both clean ship, contaminated merge |
| MERGE GATE | 4 cherry-picks (3 contam preserve + 1 T-2) + 1 stash-pop | 5 main commits total |

### Merge chain (origin/main after c64)
- `c304dee1` chore(tasks): 1897a abandon — task/1872a-5 deleted (3 commits superseded)
- `ce639414` chore(memory/market-watcher) — cherry-picked from contaminated task branch
- `214957b0` fix(alerts/ac-1) — SPIKE_006-c61-T2 scoreAlert Path 2 → domain scorer (19/19 tests, tsc clean)
- `15c0345e` chore(memory/qa-responder) — cherry-picked from contaminated task branch
- `3577a61e` chore(memory/market-watcher) — stash continuation
- `40e14e00` chore(tasks): c64 completion (PM update + 1897c/d carry)

### CONTAMINATION event (c64 #2 — second this week)
- dev-mcp-server T-2 spawn created `task/spike006-c61-t2-scoreAlert-domain-wiring` on local main HEAD c304dee1
- BUT concurrent cowork agents (market-watcher 909145b4, qa-responder 70a2933a) committed their notebook updates to whatever HEAD pointed to at write time — the task branch.
- Recovery: 3 cherry-picks (preserve order: market-watcher → T-2 → qa-responder) + 1 stash-pop commit. Total 5 commits on main.
- Branch force-deleted `task/spike006-c61-t2-...` (new SHAs).
- **1897c SPIKE escalated to HIGH** — Agent tool `isolation:"worktree"` proven not load-bearing across 2 consecutive cycles (c63, c64).

### HEAD.lock 16th recurrence (mid-operation)
- After 15th cure at 05:36Z and 1897a ship c304dee1, cherry-pick of ebb1395a triggered HEAD.lock + CHERRY_PICK_HEAD.lock + packed-refs.lock all at 07:47 local (05:47Z).
- All 3 locks were 0B, age <1s when caught. PID 51247 (com.apple VirtioFS) confirmed.
- Manual `rm -f` cleared all 3 locks → cherry-pick chain resumed.
- **1897d NEW** — F1 USER ask raised to URGENT. PREFLIGHT alone insufficient: lock can recur DURING a sub-second git operation, not just between cycles.

### c64 BATCH outcomes
| Task | SHA | Status |
|---|---|---|
| 1897a abandon task/1872a-5 | c304dee1 | DONE — branch deleted from origin |
| SPIKE_006-c61-T2 (Path 2 wiring) | 214957b0 | DONE — 19/19 tests, tsc clean, scoreAlert function deleted |
| PM TASKS.md close | 40e14e00 | DONE — 80 lines (cap), 1 archive (T-3), 2 new (1897c/d) |

### c65 carry-forward (priority order — URGENT items rising)
1. **F1 USER ask (1897b)** — **URGENT** — Docker file-sharing exclude `.git/`. Lock now mid-operation, not just between cycles. Only known root-cure.
2. **HEAD.lock 16x escalation (1897d)** — architect rethink: how to harden git operations against VirtioFS interference (lock-retry wrapper, GIT_INDEX_VERSION bump, tmpfs overlay?).
3. **Worktree isolation SPIKE (1897c)** — **HIGH** — 2nd consecutive contamination cycle. Phase 4 `isolation:"worktree"` not creating separate worktree paths. Investigate Agent tool semantics or revert to manual `git worktree add` flow.
4. **task/1872a-5 (1897a)** — CLOSED c64 (this cycle).
5. **SPIKE_006 T-4 (sample-size guard)** — next in ship order per architect design.
6. **SPIKE_006 T-5/T-6** — remainder.
7. **USER Cloudflare bundle (1894a + 1862c-E)** — 14th-cycle ask still BLOCKING.
8. METHODOLOGY-INFRA + SSOT-doc + JANITOR DRY long-tail.
9. RSS aggregator stall (TNB c42 #3).
10. TNB recalibration SPRINT-S.

### Steady state metrics
- HEAD.lock cure: 16/16 (100% PREFLIGHT + manual mid-op success — but escalating frequency)
- Contamination events: 2/2 last cycles (c63, c64) — Phase 4 isolation `0%` effective.
- C2 warnings this cycle: 0 (all commits scope-clean post-recovery).
- T-2 path: branch ship → 3-way contamination recovery → main → branch deleted.
