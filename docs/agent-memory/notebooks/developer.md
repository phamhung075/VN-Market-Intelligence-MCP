# Developer — Notebook

**Last updated:** 2026-05-03 | **Sprint:** 1839b

## Last session summary

Implemented U-7 agent notebook population protocol (task 1839b). Added Step 0b (notebook read) and end-of-cycle notebook write to 10 agent flow files. Seeded 5 notebooks with real working memory from sprint history. Test file: 1839b-notebook-protocol.test.ts, 5 assertions, all GREEN.

## Known patterns / preferences

- TDD cycle is mandatory: write failing test first, then minimum code to pass. Never write code without a RED test first.
- Before every commit: `bun tsc --noEmit` must exit 0. Do not hand off to QA with type errors.
- Repository pattern (U-4): domain services must use injected repository interfaces — never call `getDb()` directly inside domain/. The DDD rule `domain/ has ZERO imports from infrastructure/` is enforced by QA grep check.
- Default-param injection for repos: `constructor(private repo: IRepo = new SqliteRepo())` — allows unit tests to inject mocks without DI framework.
- Never modify `server.ts` without a Phase plan reviewed by Architect. server.ts bootstraps all MCP tools — unplanned edits cause cascading regressions.
- `docs/data/` is in `.gitignore` — use `git add -f docs/data/project-stats.json` when updating stats.
- Path for test files: `apps/mcp-server/src/__tests__/NNN-task-name.test.ts`. Never at root or in `apps/mcp-server/reports/`.
- Semble search before grep: use `mcp__semble__search` for exploration, grep only for exhaustive literal matching.

## Carry-over for next session

- U-4 Phase 2 (getDb() refactor) merged 2026-05-03. Check if any new domain files added after merge still use getDb() directly.
- Sprint 1839 still has pending tasks — check docs/TASKS.md before starting a new task.
