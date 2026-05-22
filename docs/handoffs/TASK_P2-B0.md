---
task_id: P2-B0
title: "Brownfield inventory scan: all TS TA callers in mcp-server"
phase: "2"
pilot: "technical-analysis"
owner: "dev-technical-analysis"
goals: ["G5"]
files_touched:
  - "docs/architecture-briefs/2026-05-22-refactor/p2-b-caller-inventory.md (NEW — inventory output)"
status: "PENDING"
blocked_by: []
unblocks: ["P2-B1"]
estimate_hours: 0.333
ac_count: 4
---

# P2-B0 — Brownfield inventory scan: all TS TA callers in mcp-server

**Goal:** G5 (Old TA code deleted)

**Description:**
Scan the mcp-server codebase to identify all TypeScript files that import or call the old technical-analysis domain service. This inventory feeds into the deletion and rewire strategy for P2-B1 and P2-B2.

---

## Files Touched

- `docs/architecture-briefs/2026-05-22-refactor/p2-b-caller-inventory.md` (NEW — inventory output)

---

## Pre-scan Findings (Architect Brownfield, Confirmed 2026-05-23)

Three TS files confirmed as TA code targets:

1. `apps/mcp-server/src/domain/services/technicalIndicators.ts` — pure domain service (RSI/MACD/BB/MA math). **G5 deletion target.**
2. `apps/mcp-server/src/interface/mcp/tools/market-data/technicalIndicatorTools.ts` — MCP tool handler. **HTTP rewire target.**
3. `apps/mcp-server/src/__tests__/1302-technical-indicators.test.ts` — test file. **Quarantine target.**
4. `apps/mcp-server/src/infrastructure/microservices/clients.ts` — HTTP client ALREADY IN PLACE at port 5003. **No changes needed.**

---

## Acceptance Criteria

1. **AC-1**: File `docs/architecture-briefs/2026-05-22-refactor/p2-b-caller-inventory.md` created with confirmed list of all TS files touching technical-analysis domain service
2. **AC-2**: Each entry: file path, import line, what it calls, rewire plan (HTTP or delete)
3. **AC-3**: Run `find apps/mcp-server/src -path "*technical*" -name "*.ts"` — output matches the inventory
4. **AC-4**: Run `grep -r "from.*technicalIndicators\|computeAllIndicators" apps/mcp-server/src/ --include="*.ts"` — output matches the inventory

---

## Smoke Check

```bash
find apps/mcp-server/src -path "*technical*" -name "*.ts" && grep -r "from.*technicalIndicators\|computeAllIndicators" apps/mcp-server/src/ --include="*.ts"
```

Both must match the inventory exactly (no surprises).

---

## Atomic Commit Format

```
docs(arch/technical-analysis): P2-B0 — brownfield inventory: TS TA callers in mcp-server

3 files identified: technicalIndicators.ts (delete), technicalIndicatorTools.ts (rewire),
1302-technical-indicators.test.ts (quarantine). HTTP client infrastructure already present
in clients.ts (port 5003). P2-B1 rewire is low-risk.

Sprint: <sprint>
Task: P2-B0
AC: inventory doc created / find + grep output matched / 3 files identified
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G5   | IN-PROGRESS (prerequisite brownfield scan) |

---

## Dependencies

**Upstream:** None (can start immediately)
**Downstream:** P2-B1 (rewire tools), P2-B2 (delete domain service)

---

## Rollback Strategy

Before any deletion commit in P2-B2, create a tag on the current HEAD:

```bash
git tag p2-b-pre-delete
```

If rollback is needed:

```bash
git revert <delete-commit-hash>
```

(Single atomic commit to revert; no force-push required because we stay on main with no branches)

---

## Notes

- Reference: `docs/architecture-briefs/2026-05-22-refactor/phase-2-task-plan-go.md` §P2-B0 (lines 291–335)
