# dev-team notebook

## Current state (c80 close — 2026-05-13T21:25Z)
- Pipeline: idle. Main HEAD `889db6ff` (pm-c80 housekeeping).
- WIP: 0/2. Branches: main only. Worktrees: main only.
- HEAD.lock cures lifetime: **36/36** (1 fired in c80: #36 stash attempt age unknown, com.apple PID 43751 Spotlight, auto-cured).

## c80 cycle log
- PREFLIGHT: clean (no HEAD.lock at entry). No pending signals.
- PO triage: BATCH(2) parallel disjoint zones — 1899a-gateway (SPRINT-S, multi-zone) + 1899a-tests (SPRINT-S, apps/news-fetch/). Both handoffs already exist from prior cycle.
- Tier execution (parallel via isolation:worktree spawn):
  - Track A (dev-api-gateway): worked **directly in main worktree** (isolation didn't engage) — branch `task/1899a-integration-tests` (wrong name, should have been `task/1899a-gateway-wiring`). Feat `4f63f64d` + notebook `10e6a507`. 40 tests, 0 tsc. Files: api-gateway/{index.ts, health_checker.ts, handlers.ts}, docker-compose.yml (news-fetch service block), ops-news-fetch-scaffold.md (port 5007→5008), ARCHITECTURE.md.
  - Track B (developer): worktree on stale base `d532495b` (c77/c78 HEAD). Agent self-rebased: merged main HEAD `3e2e828` into its branch before writing tests. Feat `7f8bbeae` + notebook `ab5a1dc4` + tasks-md `5c2f0971`. 165 pass / 6 skip / 0 fail (news-fetch), 3 pass mcp-server E2E. **Scope creep**: created `newsHeadlinesRefreshJob.ts` (1899a-cron's deliverable) to make E2E test pass.
- HEAD.lock cure #36 mid-stash before tests cherry-pick: age unknown, com.apple PID 43751 (Spotlight). lsof captured.
- Merge gate:
  - 1899a-gateway: cherry-pick `4f63f64d` + `10e6a507` → main `f91c5baa` + `837529ef`. Tree-verify exit 0, c2-alert OK. Misnamed branches deleted. **Stray test files** (apps/news-fetch/src/__tests__/unit/{reuters-rss,use-cases,bloomberg-stealth}.test.ts + integration/) appeared in main worktree post-stash-pop — quarantined to /tmp/c80-gateway-stray then removed after tests merge.
  - 1899a-tests: cherry-pick `7f8bbeae` + `ab5a1dc4` + `5c2f0971` → main `d2818207` + `64c3db67` + `da5d1b0f`. Tree-verify exit 0, c2-alert OK. Worktree unlocked + removed. Branch deleted.
- QA gate (combined BATCH):
  - 1899a-gateway: APPROVED. 40/40, 0 tsc, AC 9/9 PASS, DDD PASS, security PASS.
  - 1899a-tests: APPROVED. 165 pass / 6 skip / 0 fail, AC met, DDD PASS, 200L policy met (max 177L).
  - **Scope creep ruling: 1899a-cron NOT closed**. Job body shipped (136L), but 3 wiring AC items absent: barrel index.ts + jobs.ts CRONS entry + mcp.config.json section. 1899a-cron remains open, scope reduced to wiring-only (S→XS, ~30min).
- pm c80 update: TASKS.md `889db6ff` → 71L. 1899a-gateway + 1899a-tests Done. 1899a-cron scope reduced + unblocked. project-stats.json totalTasksDone 555→557 (gitignored, tracked locally).

## Lessons / patterns
- **Worktree isolation didn't engage for one agent**: gateway agent's isolation:"worktree" spawn somehow worked in main worktree directly, creating wrong-named branch + leaking stray files. Pattern: when checking out parallel-spawn results, ALWAYS verify `git worktree list` first — if any agent's branch is on the MAIN path instead of `.claude/worktrees/agent-<id>/`, the isolation failed. Plan: investigate agent-father / isolation:worktree contract; may need explicit branch-name validation in agent prompts.
- **Stale worktree base ↔ self-rebase pattern**: tests agent's worktree was on c77/c78 HEAD `d532495b` (~48 commits behind). Agent detected by attempting tsc and seeing missing files → ran `git -C <parent-path> rev-parse main` to get current main SHA → `git merge <main-sha>` into its branch. This worked but is fragile. Pattern: agent-father should validate worktree base before spawn, OR agent prompts should include `git fetch + git rebase origin/main` as Step 0.
- **Scope creep enabling E2E**: tests agent created the production scheduler job (136L) to satisfy its E2E test that needed the job to exist. QA correctly separated the deliverables: tests are APPROVED (the test suite IS the deliverable for 1899a-tests), but 1899a-cron is NOT closed (wiring missing). Lesson: scope creep that enables tests but doesn't ship full functionality is acceptable AS LONG AS QA gates downstream tasks to their actual AC.
- **HEAD.lock cure #36 — Spotlight persistence**: 3rd com.apple-held HEAD.lock in 4 cycles (cures #34, #35, #36). Pattern is durable. Future flow: if HEAD.lock age >>60s + com.apple PID, auto-cure no escalation. Skill enhancement candidate.

## Carry-over to c81
- **1899a-cron** (XS wiring-only, MEDIUM) — UNBLOCKED, scope reduced. Job body exists at `apps/mcp-server/src/scheduler/news-analysis/newsHeadlinesRefreshJob.ts` (136L). Remaining: barrel index.ts + jobs.ts CRONS entry + mcp.config.json section.
- **1899a-bloomberg-test-split** (LOW) — split 494L test into ≤200L files.
- **1900c-health-probe-refine** (LOW).
- **1862c-E/F, 1888b/c/d/e SSOT, 1881a/1890a/1897b/JANITORs** in Backlog (unchanged).
- **1897b-carry (URGENT-F1: USER ACTION PENDING)** — Docker .git/ exclude.
- **Investigation candidate**: why did gateway agent's isolation:"worktree" land on main path? Single-occurrence so far; if recurs c81, escalate to architect.
