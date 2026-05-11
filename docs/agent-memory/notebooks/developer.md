# Developer — Notebook

**Last updated:** 2026-05-11 | **Sprint:** 1877b

## Last session summary

Task 1877b: signal emission guard for scripts/audits/commit-convention-audit.sh.
- Added PHASE_B_SINCE_CANONICAL + PHASE_B_UNTIL_DATE_CANONICAL constants (2 LOC).
- Added --emit-signal flag parse via `for arg in "$@"` loop (4 LOC).
- Replaced unconditional signal block with EMIT_SIGNAL guard + window check (net +29 LOC, within ≤30 constraint).
- bash 3.2 caveat: `[ >= ]` not valid in POSIX `[ ]` — replaced with two-branch `if [ = ] || [ \> ]` pattern for ge/le checks.
- All 6 ACs self-tested: AC-1 PASS, AC-2 PASS, AC-3a PASS, AC-3b PASS, AC-4 PASS, AC-5 PASS, AC-6 PASS.
- Test artifacts cleaned up (rm after AC-2 run; xargs rm after AC-4/AC-5 run).
- Branch: task/1877b-audit-script-emit-signal-guard | Commit: da432775 | pre-push tsc PASS.
- Pipeline: status=in_progress, nextAgent=qa.

## Previous last session summary

Task 1872a-7: README.md:173 heading count fix (AC8 closure).
- Edit: `## 112 MCP Tools (Phase 3 Complete)` → `## MCP Tools (Phase 3 Complete)` + SSOT pointer line added below.
- AC8 grep: CLEAN (zero hits for 112|128|132 + MCP Tool pattern across README + ARCHITECTURE + mcp-server.md).
- Branch: task/1872a-7-readme-heading-count | Commit: 95e21b96 | tsc pre-push PASS.
- Pipeline: status=review, nextAgent=qa, nextPrompt="QA 1872a-7 (heading fix + AC8 closure)".

## Previous last session summary

Task 1872a-6: AC8 grep verification (read-only).
- Tool count grep (112|128|132 + MCP Tool): README.md:173 FAIL — `## 112 MCP Tools (Phase 3 Complete)` is hardcoded section heading, not addressed by 1872a-2 (which fixed line 92 in microservices table). docs/ARCHITECTURE.md PASS. docs/architecture/microservice/mcp-server.md PASS.
- Cron/scheduler count grep (41|59|62 + cron/scheduler): all 3 files PASS.
- Broad sweep (architect brief Section 4 one-liner): zero matches PASS.
- Report: reports/TASK_REPORT_1872a-6.md. TASKS.md row added → Done. Pipeline: idle.
- Follow-up needed: README.md:173 heading still hardcodes "112 MCP Tools" — new subtask required.

## Previous last session summary

Task 1872a-2: README.md — AC2 + AC5 + AC6 SSOT pointers (single atomic edit).
- AC2 (line 92): mcp-server "112 tools" → `docs/data/project-stats.json` → `toolCount` pointer.
- AC5-a: arch pointer after ASCII diagram block (before "### Three Telegram Channels"): links to docs/ARCHITECTURE.md + docs/architecture/global.md.
- AC5-b: per-service pointer after microservices table: `docs/architecture/microservice/<service>.md`.
- AC6-A (lines 63-70): inline docker block replaced with restart-policy.md pointer.
- AC6-B (line 86): dev restart step replaced with restart-policy.md pointer.
- Branch: task/1872a-2-readme-ssot-pointers | Commit: 03a404ce | tsc pre-push PASS (doc-only).
- Pipeline: status=review, nextAgent=qa, nextPrompt="QA 1872a-2 (README SSOT pointers)".

## Previous last session summary

Task 1872a-3: docs/ARCHITECTURE.md — AC3 + AC6 SSOT pointers (single atomic edit).
- AC3 (line 78): "132 tools, 59 cron jobs, HTTP clients to 8 other services" → project-stats.json#toolCount + #cronJobCount pointers + "all configured downstream services".
- AC6 (line 53): inline `docker-compose down && docker-compose up -d` → pointer to `.claude/knowledge/restart-policy.md`.
- Branch: task/1872a-3-architecture-md-ssot-pointers | Commit: 1b4f23a6 | tsc pre-push PASS (doc-only).
- Pipeline: status=review, nextAgent=qa.

## Previous-previous last session summary

Task 1872a-1: Add docs/architecture/ subtree to .claude/knowledge/tree-map.md (AC1).
- Replaced standalone docs/ARCHITECTURE.md leaf (line 74) with full nested hierarchy.
- Added: docs/architecture/global.md node + 8 microservice children + 12 mcp-server tool-group leaves.
- Added 2 Write Ownership rows (global.md + microservice/<service>.md — Architect owner).
- Branch: task/1872a-1-tree-map-dag | Commit: ed3faf76 (cherry-pick of 47e745b6)
- 26 insertions / 1 deletion in tree-map.md. tsc hook passed (pre-push). Doc-only.
- QA APPROVED 2026-05-11. Merged to main.

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
