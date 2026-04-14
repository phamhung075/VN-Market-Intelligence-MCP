# TASKS — VN Market Intelligence MCP

> Archive: `docs/archive/` (split by sprint range) | Index: `docs/TASKS_ARCHIVE.md` | WIP limit: max 2 In Progress | Workflow: Backlog → Todo → In Progress → Review → Done | Branch: `task/NNN-kebab-name` | Report: `reports/TASK_REPORT_NNN.md`

---

## Sprint 075 — Active

Vision: `SPRINT_GOAL.md`

### Kanban

| ID | Title | Agent | Layer | Depends On | Branch | Status |
|----|-------|-------|-------|------------|--------|--------|
| 1189 | get_pipeline_health MCP tool | Dev | interface/application | TECH_075 | — | Done |

**WIP:** 0 In Progress.

---

## Task Details (active tasks only — Done tasks archived)

### 1189 — get_pipeline_health MCP tool

**Branch:** `task/1189-pipeline-health` | **Layer:** application + interface | **Spec:** `docs/TECH_075.md`

**Implementation order (TDD — strict):**
1. Write failing tests — `src/__tests__/1189-pipeline-health.test.ts`
2. Implement use case — `src/application/usecases/getPipelineHealth.ts`
3. Add barrel export — `src/application/usecases/index.ts`
4. Register MCP tool — `src/interface/mcp/tools/systemTools.ts`
5. Update registry counters — `docs/data/tool-registry.json`, `docs/data/project-stats.json`

**Files to read first:**
- `src/application/usecases/assembleEveningSummary.ts` (lazy DB injection pattern)
- `src/interface/mcp/tools/systemTools.ts` (existing `get_system_status` tool structure)
- `src/application/usecases/index.ts` (barrel pattern)

**Files to create/modify:**
- CREATE: `src/__tests__/1189-pipeline-health.test.ts`
- CREATE: `src/application/usecases/getPipelineHealth.ts`
- MODIFY: `src/application/usecases/index.ts` (barrel re-export)
- MODIFY: `src/interface/mcp/tools/systemTools.ts` (add `server.tool()` after `get_system_status`)
- MODIFY: `docs/data/tool-registry.json` (toolCount 96 → 97, add entry to "System & Ops")
- MODIFY: `docs/data/project-stats.json` (toolCount 96 → 97)

**Acceptance criteria:**

Given an in-memory SQLite DB with `rag_analyses` + `vps_push_log` tables and a fixed `nowMs`
When `getPipelineHealth({ db, nowMs, reportsDir })` is called
Then:
- Returns `PipelineHealthResult` with all 5 fields: `ragRows`, `sources`, `vpsPushLast24h`, `eveningReportLastRun`, `generatedAt`
- `ragRows.today` / `ragRows.yesterday` respect the GMT+7 day boundary
- `ragRows.staleMins` is clamped to `>= 0` (no negative on clock drift)
- `sources[]` sorted by count DESC; `null` source_url maps to `"(unknown)"`
- `vpsPushLast24h` = `null` when `vps_push_log` table absent; 0 when table exists but no ok rows
- `bun test src/__tests__/1189-pipeline-health.test.ts` — all 7 cases pass
- `bun tsc --noEmit` — 0 errors
- `bun test` full suite — 0 new failures
- `curl http://localhost:3000/health | jq .toolCount` returns 97
