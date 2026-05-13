# Developer — Notebook

**Last updated:** 2026-05-13 | **Sprint:** c82 / 1888b

## Last session summary

Task 1888b — SSOT doc fix: replace hardcoded agent counts in `.claude/AGENT_MODELS_README.md`.

**What was done:**

- Merged main (c908475a) into worktree branch before editing (fast-forward, 91 files).
- Read `.claude/AGENT_MODELS_README.md` — found that Sprint 1878 (31f63982) had already replaced "All 13 agents" with "All dev-team agents" (no pointer). Task 1888b requires the SSOT pointer step.
- Read `docs/data/project-stats.json` — confirmed fields: `devAgentCount: 17`, `microserviceAgentCount: 9`.
- Inspected sibling 1888e pattern (git show a7bb2313) for pointer prose style.
- Made 4 edits (minimal):
  - L15: eco mode — added `(see docs/data/project-stats.json#devAgentCount)`
  - L21-23: normal mode 11+1+1 breakdown (implicit 13) — replaced with single SSOT pointer line
  - L26: performance mode — added `(see docs/data/project-stats.json#devAgentCount)`
  - L52: Two-Team section — added `(count: docs/data/project-stats.json#devAgentCount)`
- Verified: `grep -nE "[0-9]+ agents?"` returns empty.

**Commits:**
- `f381bc12 fix(1888b): AGENT_MODELS_README SSOT — replace hardcoded counts`
- Branch: task/1888b-agent-models-ssot

## Previous last session summary

Task 1888e — SSOT doc fix: eliminate "7 agents" vs "8 agents" self-contradiction in agent-roster.md.

**What was done:**

- Read `docs/references/agent-roster.md` — found two contradictory mentions:
  - Line 120: `ANALYSIS TEAM (Claude Cowork — 8 agents, cloud)`
  - Line 132: `7 numbered agents + 1 Unified Coordinator ... = 8 total`
- Read `docs/data/project-stats.json` — SSOT field `analysisAgentCount: 9` (reconciled 2026-05-12).
- Analysis Team table has 9 rows (Unified Coordinator, News Scout, Financial Analyst, Market Watcher, Alert Commander, Digest & Predict, QA Responder, Tran Ngoc Bau, Report Analyzer).
- Fixed both lines to 9 and replaced the stale clarification with a pointer to SSOT field.

**Commits:**
- `80fbabf1 fix(1888e): agent-roster SSOT — eliminate 7-vs-8 contradiction`
- Branch: task/1888e-agent-roster-count

## Known patterns / preferences

- TDD cycle is mandatory: write failing test first, then minimum code to pass.
- Before every commit: `bun tsc --noEmit` must exit 0.
- Repository pattern (U-4): domain services must use injected repository interfaces.
- Default-param injection for repos: `constructor(private repo: IRepo = new SqliteRepo())`.
- Never modify `server.ts` without Architect review.
- `docs/data/` in `.gitignore` — use `git add -f docs/data/project-stats.json` for stats.
- Semble search before grep for exploration.
- `withTimeout()` pattern for microservice fan-outs: Promise.race against Symbol sentinel.
- Worktree sessions: verify CWD and merge from parent main if worktree branch is behind.
- mock.module() must be declared before module import in Bun test files.
- Sprint 1878 already did a pass removing hardcoded counts — check git log before duplicating work.

## Carry-over for next session

- Branch task/1888b-agent-models-ssot ready for QA.
- Branch task/1888e-agent-roster-count also ready for QA (prior task).
- Pre-existing playwright tsc errors in news-fetch (2 files) — QA should confirm pre-existing.
- mcp-server 134 pre-existing failures (unrelated to 1899a-tests task).
