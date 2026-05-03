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
