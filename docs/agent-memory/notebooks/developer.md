# Developer — Notebook

**Last updated:** 2026-05-11 | **Sprint:** 1872a

## Last session summary

Task 1872a-1: Add docs/architecture/ subtree to .claude/knowledge/tree-map.md (AC1).
- Replaced standalone docs/ARCHITECTURE.md leaf (line 74) with full nested hierarchy.
- Added: docs/architecture/global.md node + 8 microservice children + 12 mcp-server tool-group leaves.
- Added 2 Write Ownership rows (global.md + microservice/<service>.md — Architect owner).
- Branch: task/1872a-1-tree-map-dag | Commit: ed3faf76 (cherry-pick of 47e745b6)
- 26 insertions / 1 deletion in tree-map.md. tsc hook passed (pre-push). Doc-only.

## Previous session — 1869c

Task 1869c: Extended 1865a UTC timestamp guard to qa-responder + news-scout flow files.
- Root cause: 1865a only added guard to news-scout session-log step (Step 4 `log_agent_work`), not to the notebook append block immediately after. qa-responder had zero guards.
- Applied identical "Notebook timestamp guard" block (invariant + 3 bullet rules) to: `news-scout/cycle.md` before notebook append, `qa-responder/cycle.md` before notebook commit (Step 6).
- market-watcher guard verified unchanged (line 84-89).
- Test result: 9267 pass / 15 fail. All 15 failures pre-existing (Task 178 + infra). Flow-only edits, no TypeScript changes.
- Key lesson: when a guard is added to a "session log" step, check if the SAME flow writes timestamps in a separate notebook-commit step — both need the guard.
- Deviation: task said `main.md` but actual files are `cycle.md`.

## Known patterns / preferences

- TDD cycle is mandatory: write failing test first, then minimum code to pass. Never write code without a RED test first.
- Before every commit: `bun tsc --noEmit` must exit 0. Do not hand off to QA with type errors.
- Repository pattern (U-4): domain services must use injected repository interfaces — never call `getDb()` directly inside domain/. The DDD rule `domain/ has ZERO imports from infrastructure/` is enforced by QA grep check.
- Default-param injection for repos: `constructor(private repo: IRepo = new SqliteRepo())` — allows unit tests to inject mocks without DI framework.
- Never modify `server.ts` without a Phase plan reviewed by Architect. server.ts bootstraps all MCP tools — unplanned edits cause cascading regressions.
- `docs/data/` is in `.gitignore` — use `git add -f docs/data/project-stats.json` when updating stats.
- Path for test files: `apps/mcp-server/src/__tests__/NNN-task-name.test.ts`. Never at root or in `apps/mcp-server/reports/`.
- Semble search before grep: use `mcp__semble__search` for exploration, grep only for exhaustive literal matching.
- When adding dedup/gate logic to postSignal(), use type-aware defaults — don't apply spam suppression to chain_catalyst/price_confirmation signals by default or you will break enrichment-chain tests.
- UTC timestamp guards in flow files must cover ALL timestamp-writing steps (session log AND notebook commit), not just the first one.

## Carry-over for next session

- 1871b DONE: pushed. AC all green. Awaiting QA/merge.
- 1871a DONE: task/1871a-arch-counts pushed. AC all green. Awaiting QA/merge.
- Note: cronConfig.ts has 59 keys (brief said 56 — brief was already 3 stale). Used 59 as actual.
- Note: docs/data/ is gitignored — always `git add -f` when editing project-stats.json.
- 15 pre-existing failures in full suite (Task 178 + infra) — unchanged (no code touched).
- Check docs/TASKS.md for next task before starting.

---

## Recent session — 2026-05-10 (multiple tasks)

**1862h — Replace hardcoded "112 tools" literals:**
- Fixed 4 literals in restart-policy.md (2) + ops-incident-response.md (2) → pointer to docs/data/project-stats.json.

**1862j — W-3 sigma dedup safeguard (CRITICAL):**
- Root cause: `runWeeklyAudit` W-3 DELETE wiped all intraday readings → sigma data: 417 stocks → 2 READY.
- Fix: Pre-count + dry-run; abort if wouldDelete/preCount > 50% (severity=critical). 5 tests GREEN. Branch: task/1862j-sigma-data-safeguard | Commit: fd5db6b6.

**1862g — urgent_news 4h signal dedup:**
- `dedupWindowMinutes`: 240m default for urgent_news, 0 for all other types. 10 tests GREEN. Branch: task/1862g-signal-dedup.
