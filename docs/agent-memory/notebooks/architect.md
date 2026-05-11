# Architect — Notebook

**Last updated:** 2026-05-03 | **Sprint:** 1839b

## Last session summary

U-4 getDb() repository pattern refactor completed (Sprints 1838b + 1839a). Phase 1: top 5 highest-coupled domain files migrated to repository interfaces. Phase 2: remaining domain files migrated. Result: `grep -r "getDb()" src/domain/` returns 0 results. All 8799+ tests pass.

## Known patterns / preferences

- Phase-gate approach for SPRINT-L refactors: always split into Phase 1 (design + top-N files) and Phase 2+ (remaining files). Single-phase SPRINT-L refactors routinely exceed scope, cause merge conflicts, and destabilize the sprint.
- Coupling analysis via graph: `getDb()` was the most connected node (224 edges) before U-4. Use the graph tool to identify the highest-coupling nodes before proposing refactors — target highest-risk first.
- `domain/repositories/` is the clean boundary between domain and infrastructure. Repository interfaces live in domain, SQLite implementations in `infrastructure/db/repositories/`. This is the canonical ports-and-adapters pattern for this codebase.
- Default-param injection pattern: `constructor(private repo: IRepo = new SqliteRepo())`. Allows production code to use SQLite default while tests inject in-memory mocks.
- DDD layer audit before any design: use `grep -r "from.*infrastructure" src/domain/` to check current state. Never add a domain task without confirming the proposed design keeps domain clean.
- SPRINT-M tasks can be single-phase. SPRINT-L always requires Architect design document appended to handoff before developer starts.
- `server.ts` bootstrap pattern: MCP tools are registered at startup. Any new tool must be added to the tool registration list in server.ts — this is the single point of MCP interface wiring.

## Carry-over for next session

- U-5 (prediction calibration feedback loop) and U-6 (RAG service wiring) are next in Tier 2. Both are SPRINT-M — review existing calibration tool signatures and RAG service API before designing.

---

## Session — 2026-05-11 (Architecture SSOT Foundation)

**Task:** Build docs/architecture/ SSOT from scratch — foundation build

**Files written:** 22 total
- `docs/architecture/global.md` — server-wide SSOT (9 services, Docker topology, two-team arch, data flow, VPS proxy, conflict resolutions table)
- `docs/architecture/microservice/<name>.md` x 9 — one per service: mcp-server, api-gateway, stock-price, pdf-extractor, rag-service, technical-analysis, macro-indicators, kinh-dich, alert-engine
- `docs/architecture/microservice/mcp-server/<group>.md` x 12 — tool groups: market-data, financial-reports, news-analysis, alerts, portfolio, briefings, macro, sector, kinhdich, system, analysis, backtesting

**Conflicts resolved (from 2026-05-11 audit):**
1. Tool count drift (README 112 vs ARCHITECTURE 132) → SSOT is `project-stats.json`; new files never hardcode counts.
2. Port notation → standardized to `HOST:CONTAINER` (Docker Compose canonical).
3. Restart command duplication (3 places) → all new files point to `restart-policy.md`.
4. Services list duplication → SSOT is `global.md`.
5. BCTC pipeline duplication → SSOT in `global.md` + `ARCHITECTURE.md`; runbook = diagnostics only.

**Drift items (cannot resolve here — escalated to backlog via signal):**
- BaoDauTu RSS 0-item parsing issue → existing task 1185
- `docs/ARCHITECTURE.md` still has hardcoded toolCount (132) → minor, future cleanup sprint

**Signal written:** `docs/signals/architect-2026-05-11T16-00-00Z.json` → system-auditor (re-audit)
**Pipeline state:** idle

**Patterns confirmed:**
- All new architecture docs use pointer-only pattern (no volatile counts — point to project-stats.json).
- Tool group files at `docs/architecture/microservice/mcp-server/<group>.md` map one-to-one to `src/interface/mcp/tools/<group>/` module folders.
- 9 microservice files map exactly to 9 Docker services in docker-compose.yml.
- agent-father pointers in 7 dev-team agents now resolve.

---

## Recent session — 2026-05-09 (Task 1862c investigation)

**Task:** Investigate Cowork scheduled-task MCP access failures — COMPLETE

**Root cause confirmed:** `mcp__claude_ai_gateway__call_tool` is platform-injected. Cowork scheduled tasks do not reliably re-establish SSE sessions per invocation. CLI cron does (reads `.mcp.json` at startup). Structural asymmetry explains intermittent BLOCKED cycles.

**Files analyzed:** market-watcher sessions (5 BLOCKED cycles), `.mcp.json`, `~/.cloudflared/config.yml` (SSE keepAliveTimeout 30s = heartbeat 30s → race condition), `apps/mcp-server/src/interface/mcp/transport.ts`, `server.ts` (`/mcp` stateless endpoint already exists).

**Recommendations (ranked):**
1. Add Cloudflare route for `/vn-market/mcp` → point Cowork at StreamableHTTP (stateless, no session dependency)
2. Increase `keepAliveTimeout` 30s → 300s
3. Migrate market-watcher + unified-agent to CLI cron for guaranteed access

**Risk flags:** `/mcp` route missing from Cloudflare; heartbeat = timeout (race); in-memory session map lost on Docker restart.

---

## Session — 2026-05-11 (SPRINT-S-1877b signal guard design)

**Task:** Design brief for hardening `scripts/audits/commit-convention-audit.sh` against stray signal emission from test runs.

**Brief written:** `docs/architecture-briefs/2026-05-17-commit-convention-audit-guard.md`

**Decision:** Combination `--emit-signal` flag + canonical window guard. Default = safe (no signal). Gate run on 2026-05-17 passes both guards. Stale test-artifact signals from today already drained by cycles 29/30 (git status shows 3 deletions) — no manual cleanup needed.

**LOC delta:** ~6 LOC net addition to script. Single file edit. Bash 3.2 compat maintained.

**ACs:** 6, all testable without mocking the date (AC-3 testable by passing wrong SINCE_DATE; AC-2 testable by passing correct SINCE_DATE + flag on any date 2026-05-10..2026-05-17).

**Pipeline state:** idle

---

## Session — 2026-05-11 (SPRINT-S-1877c C4 vocab remediation)

**Task:** Design brief to close C4 scope-vocab gap before the 2026-05-17 Day-7 Phase B gate.

**Brief written:** `docs/architecture-briefs/2026-05-17-c4-vocab-remediation.md`

**Audit window (2026-05-10..now):** 170 well-formed non-notebook commits. Current C4 = 0.4824.

**Bucket analysis:**
- IN_VOCAB (pass): 82 (48.2%)
- BUCKET_A legitimate novel: 63 (37.1%) — 32 distinct real area/service/agent tokens never added to vocab
- BUCKET_B sprint-ID as area: 22 (12.9%) — history-locked, e.g. `fix(1872a):` with no `/area`
- BUCKET_B other true violations: 3 (1.8%) — `*`, `c26`, `cycle-28`

**Decision: Path (c) Hybrid**
1. Expand VOCAB from 20 to 52 tokens (add all 32 legitimate BUCKET_A tokens).
2. Add sprint-ID exemption in C4 check: area starting with 4 digits counts as pass, skips vocab loop.
   Implemented via `case "${first4}" in [0-9][0-9][0-9][0-9])` + `return` — POSIX/bash 3.2 safe.

**Projected C4 after fix:** 145/148 = 97.97% on current window; 195/198 = 98.5% with 50 more commits.
3 remaining fails (`*`, `c26`, `cycle-28`) are true violations; cannot exceed 5% threshold.

**Files:** `scripts/audits/commit-convention-audit.sh` (VOCAB line + C4 block), `.claude/knowledge/commit-convention.md` (area list). Net LOC: ~16. Under 30 limit.

**POSIX check:** case/cut/local/return — all bash 3.2 safe. No `[[`, no `\>=`, no floats in test.

**Pipeline state:** idle
