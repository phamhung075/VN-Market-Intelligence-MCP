---
task_id: P2-B3
title: "Remove all \"TODO: migrate\" comments from mcp-server + technical-analysis"
phase: "2"
pilot: "technical-analysis"
owner: "dev-technical-analysis"
goals: ["G5"]
files_touched:
  - "Any .ts files under apps/mcp-server/src/ or apps/technical-analysis/ containing TODO.*migrat patterns"
status: "PENDING"
blocked_by: ["P2-B2"]
unblocks: ["P2-B4"]
estimate_hours: 0.25
ac_count: 3
---

# P2-B3 — Remove all "TODO: migrate" comments from mcp-server + technical-analysis

**Goal:** G5 (Old TA code deleted)

**Description:**
Search for and remove all TODO comments referencing migration from TypeScript to Go. This is a cleanup task confirming that all migration work is complete.

---

## Files Touched

Any `.ts` files under `apps/mcp-server/src/` or `apps/technical-analysis/` containing `TODO.*migrat` patterns

---

## Acceptance Criteria

1. **AC-1**: `grep -r "TODO.*migrat" apps/mcp-server/src/ apps/technical-analysis/ --include="*.ts" --include="*.go"` returns 0 results
2. **AC-2**: Removal is comment-only — no logic changes
3. **AC-3**: Both `bun test` and `go test` still pass

---

## Smoke Check

```bash
grep -r "TODO.*migrat" apps/mcp-server/src/ apps/technical-analysis/ --include="*.ts" --include="*.go" | wc -l
# Must print 0
cd apps/technical-analysis && go test ./... && cd ../../apps/mcp-server && bun test
```

---

## Atomic Commit Format

```
chore(technical-analysis): P2-B3 — remove TODO:migrate comments (G5 cleanup)

Clears all TODO:migrate markers from mcp-server + technical-analysis.
Both bun test + go test pass.

Sprint: <sprint>
Task: P2-B3
AC: grep TODO migrate = 0 results / bun test passes / go test passes
```

---

## Goal Mapping

| Goal | Status |
|------|--------|
| G5   | IN-PROGRESS (migration markers cleaned) |

---

## Dependencies

**Upstream:** P2-B2 (code quarantined, migration effectively complete)
**Downstream:** P2-B4 (integration test verification)

---

## Notes

- Regex pattern to search: `TODO.*migrat` (case-sensitive)
- Affects both Go and TypeScript files
- This is a pure cleanup task — no functional changes
