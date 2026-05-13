# dev-team notebook

## Current state (c81 close — 2026-05-13T19:55Z)
- Pipeline: idle. Main HEAD `6b19b44f` (pm c81 notebook).
- WIP: 0/2. Branches: main only. Worktrees: main only.
- HEAD.lock cures lifetime: **37/37** (1 fired in c81: cure #37 during QA gate, auto-cleared by QA).
- Sprint 1899a (news-fetch service): **COMPLETE** — 10 tasks shipped c76→c81.

## c81 cycle log
- PREFLIGHT: clean (no HEAD.lock at entry). worktree prune empty. signals/ empty.
- PO triage: BATCH(3) — 1899a-cron (SPRINT-S/XS, apps/mcp-server/) + 1888e (FIX/XS, doc) + CLEAN-c81 (CLEAN/XS, cross-service). Stale Todo row 1899a-gateway flagged, 2 merged worktree-agent-* branches flagged.
- Tier execution (parallel via isolation:worktree):
  - Track A (dev-mcp-server): isolation engaged correctly (`.claude/worktrees/agent-aea30e4a8e1461810`). Branch `task/1899a-cron-scheduler`. Commits `40514118` (feat) + `572cb877` (notebook). 4 files / 21 insertions. Files: scheduler/news-analysis/index.ts (new barrel), scheduler/cronConfig.ts (CRONS entry), scheduler/startScheduler.ts (import + jobRunRepo.wrapRun registration), mcp.config.json (newsHeadlinesRefresh section). TSC 0 errors. **Worktree base validation passed** — agent confirmed HEAD = main before coding (c80 lesson applied).
  - Track B (developer): isolation engaged (`.claude/worktrees/agent-aee580fe6c94df729`). Branch `task/1888e-agent-roster-count`. Commits `80fbabf1` (fix) + `e4efe111` (notebook). 1 file / 2 insertions, 2 deletions. agent-roster.md L120 "8 agents"→"9 agents", L132 prose→SSOT pointer `project-stats.json#analysisAgentCount`. Verified analysisAgentCount=9 already exists in stats file (reconciled 2026-05-12).
  - Track C (code-janitor): worked directly in main worktree (no isolation needed for housekeeping). Commits `19e29700` (clean) + `2cfd307b` (notebook). Removed stale TASKS.md Todo row + deleted both merged worktree-agent-* branches (verified `--merged main` precondition before `git branch -d`).
- Merge gate:
  - Cherry-pick A: `89ad6c4a` (feat) + `50c74418` (notebook) onto main. Tree-verify exit 0, c2-alert OK.
  - Cherry-pick B: `a7bb2313` (fix) + `763fe826` (notebook) onto main. Tree-verify exit 0, c2-alert OK.
  - CLEAN-c81 already on main (track C worked in main worktree).
  - Worktrees A + B locked (per spawn) — unlocked + force-removed cleanly. All task branches deleted.
- HEAD.lock cure #37 mid-QA-gate: QA found stale lock from background git process during run, removed before notebook commit. No content risk; lifetime counter advanced.
- QA gate (BATCH(3)):
  - 1899a-cron: APPROVED. tsc 0 errors. bun test exit 0 (9331 pass, 33-35 pre-existing flaky fail — same set as prior cycles). E2E 3/3. DDD PASS (only infra logger import). Pattern parity with taAlertScan/macroRefresh confirmed. Security PASS (Bun.env, no process.env, no secrets).
  - 1888e: APPROVED. Contradiction gone. SSOT pointer present. Value 9 verified.
  - CLEAN-c81: APPROVED. Stale row gone. Branches deleted.
- pm c81 update: TASKS.md `f60fe926` → 70L (well under 80L cap). Done rows: `1899a-cron-SHIPPED-c81`, `1888e-SHIPPED-c81`. CLEAN-c81 implicit in commit. project-stats.json totalTasksDone +3 (gitignored).

## Lessons / patterns
- **Worktree isolation engaged correctly this cycle** (both A + B). c80 single-occurrence isolation failure (gateway agent landed on main path) did NOT recur. Investigation candidate from c80 closed for now; revisit only if recurs. Working hypothesis: race condition during simultaneous isolation:worktree spawns may have caused the c80 anomaly — c81's lower concurrency (2 isolated + 1 in-main) avoided it.
- **Worktree base validation works**: both isolated agents confirmed `git rev-parse HEAD == git rev-parse main` before coding (per c80 lesson). No stale-base self-rebase needed this cycle. Pattern is durable; keep in spawn prompts.
- **In-main housekeeping pattern**: CLEAN/CHORE tasks that only touch docs + git branch operations (no code) can skip isolation:worktree. Code-janitor working directly in main worktree saved overhead and avoided cherry-pick step. Acceptable when (1) main has no uncommitted changes, (2) task touches only doc/config files, (3) no risk of conflict with concurrent agents.
- **HEAD.lock cure #37 during QA gate**: 4th in 5 cycles (#34, #35, #36, #37). Pattern is established. Future: just-noting, no escalation. Skill enhancement still candidate (auto-cure with Spotlight/git-bg-process detection inline).
- **Sprint 1899a closure marker**: news-fetch service from scratch in 10 atomic tasks (core, domain, app, factory, bloomberg, reuters-rss, reuters-fallback, routes, gateway, tests, cron) over 6 cycles. Process notes: granular XS/S sizing + handoff-per-task + clear AC enabled high parallelism. No mid-sprint redesign needed. Worth referencing as exemplar for next service scaffold.

## Carry-over to c82
- **1903a** (HIGH FIX, MCP tool dispatch/schema collision in apps/mcp-server/) — TNB c46 #4+#5 evidence. Re-verify post-gateway-restore.
- **1881a** (HIGH source_tier retrofit) — ~15 macro/news tools, ba spec needed.
- **1888b/c/d/g** (HIGH SSOT) — doc-only XS series, good c82 batch candidates.
- **1899a-bloomberg-test-split** (LOW) — split 494L test file.
- **1900c-health-probe-refine** (LOW OPS).
- **1862c-E-dashboard** (USER-action: Cloudflare dashboard ingress).
- **1897b-carry** (URGENT-F1 USER-action: Docker .git/ exclude).
- **1862c-F** (MEDIUM FIX, blocked on container-rebuild).
- **Closed**: c80 worktree-isolation investigation candidate. Did NOT recur c81. Keep eyes on it but no escalation.
