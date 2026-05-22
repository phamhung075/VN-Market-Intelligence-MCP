---
task_id: P2-B2
title: "Move `technicalIndicators.ts` domain service to `_deprecated/`"
phase: "2"
pilot: "technical-analysis"
owner: "dev-technical-analysis"
goals: ["G5"]
files_touched:
  - "apps/mcp-server/src/domain/services/technicalIndicators.ts (MOVE to apps/mcp-server/src/_deprecated/technicalIndicators.ts)"
  - "apps/mcp-server/src/__tests__/1302-technical-indicators.test.ts (MOVE to apps/mcp-server/src/_deprecated/1302-technical-indicators.test.ts)"
status: "PENDING"
blocked_by: ["P2-B1"]
unblocks: ["P2-B3"]
estimate_hours: 0.25
ac_count: 6
---

# P2-B2 — Move `technicalIndicators.ts` domain service to `_deprecated/`

**Goal:** G5 (Old TA code deleted)

**Description:**
Move (not delete) the old TypeScript technical-analysis domain service and its test file to `_deprecated/` folder. This quarantines the code while preserving git history for reference.

---

## Files Touched

- `apps/mcp-server/src/domain/services/technicalIndicators.ts` (MOVE to `apps/mcp-server/src/_deprecated/technicalIndicators.ts`)
- `apps/mcp-server/src/__tests__/1302-technical-indicators.test.ts` (MOVE to `apps/mcp-server/src/_deprecated/1302-technical-indicators.test.ts`)

---

## Acceptance Criteria

1. **AC-1**: `apps/mcp-server/src/domain/services/technicalIndicators.ts` no longer exists at the original path
2. **AC-2**: File moved (not deleted) to `apps/mcp-server/src/_deprecated/technicalIndicators.ts` — preserves git history via rename
3. **AC-3**: Test file moved similarly: `1302-technical-indicators.test.ts` → `_deprecated/1302-technical-indicators.test.ts`
4. **AC-4**: `bun test` still passes (no broken imports referencing the old path)
5. **AC-5**: `find apps/mcp-server/src -path "*technical*" -name "*.ts" -not -path "*_deprecated*"` returns 0 results (only tool handler remains, already rewired)
6. **AC-6**: A header comment added to both `_deprecated/` files: `// DEPRECATED: G5 Phase 2. Moved from domain/services/. Delete after G5 verification passes.`

---

## Smoke Check

```bash
cd apps/mcp-server && bun test && find apps/mcp-server/src -path "*technical*" -name "*.ts" -not -path "*_deprecated*" | wc -l
# Second command must print 0 (or 1 if technicalIndicatorTools.ts path doesn't contain "technical" — adjust grep as needed)
```

---

## Atomic Commit Format

```
refactor(technical-analysis): P2-B2 — move technicalIndicators.ts to _deprecated/

G5 Phase 2: quarantine TS domain service + test to _deprecated/.
Original callers already rewired via HTTP (P2-B1).
Preserved in _deprecated/ for git-history reference; will be deleted post-G5-verification.

Sprint: <sprint>
Task: P2-B2
AC: original path empty / _deprecated/ files present / bun test passes / find returns 0 results outside _deprecated
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G5   | IN-PROGRESS (domain service quarantined) |

---

## Dependencies

**Upstream:** P2-B1 (callers already rewired to HTTP)
**Downstream:** P2-B3 (TODO comment cleanup)

---

## Notes

- Use `git mv` to move files — this preserves history as renames, not deletes + creates.
- The `_deprecated/` folder may already exist; create if needed.
- Post-G5-verification, these files will be deleted entirely. For now, quarantine preserves reference.
