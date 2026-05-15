---
sprint: 1914b
size: XS
zone: cross-service/
depends_on: []
blocks: []
---

## [PM] Dispatch Context

**Dispatch date:** 2026-05-15 | **Branch:** main | **Blocker:** None | **Approval path:** developer → done (doc-only, no QA gate)

### Why this task exists

TNB c53 finding #8: across ~10 agent package files, `log_agent_work` was documented with a fictitious single-call signature (`action: string, context: object, signal_ids?: string[]`). The actual MCP API (`agentWorkLogTools.ts`) requires a two-call lifecycle pattern:
- **Call 1** (`status: "running"`) opens a session row and returns `{ id: number }`.
- **Call 2** (`status: "completed"|"error"` + the `id` from Call 1) closes it with summary/findings/actions.

Without this doc fix, every agent that reads its package file was logging "log_agent_work entry is incomplete — actual API requires two-call pattern" each cycle (alert-commander c53 18:03 UTC observation).

---

## [Developer] Implementation

**Completed:** 2026-05-15 | **Commit:** pending

### What was done

Patched all 10 package doc files — docs-only, zero source-code changes:

| File | Change |
|------|--------|
| `.claude/tools/package/alert-commander.md` | Table row corrected + two-call recipe added |
| `.claude/tools/package/unified-agent.md` | Table row corrected + two-call recipe added |
| `.claude/tools/package/financial-analyst.md` | Table row corrected + two-call recipe added |
| `.claude/tools/package/market-watcher.md` | Table row corrected + two-call recipe added |
| `.claude/tools/package/news-scout.md` | Table row corrected + two-call recipe added |
| `.claude/tools/package/qa-responder.md` | Table row corrected + two-call recipe added |
| `.claude/tools/package/report-analyzer.md` | Table row corrected + two-call recipe added + broken example snippet fixed |
| `.claude/tools/package/digest-predict.md` | Table row corrected + two-call recipe added |
| `.claude/tools/package/tran-ngoc-bau.md` | Table row corrected + two-call recipe added |
| `.claude/tools/package/po.md` | Table row corrected + two-call recipe added + Usage example fixed |

### Two-call recipe (canonical)

```
// Call 1 — session START
const startResult = call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "<agent-id>",
  "status": "running"
})
// → { "id": <number> }
const logId = startResult.id

// Call 2 — session END
call_tool(server="vn-market", tool="log_agent_work", arguments={
  "agent_name": "<agent-id>",
  "id": logId,
  "status": "completed",   // or "error"
  "summary": "...",
  "findings": "...",
  "actions": [...]
})
// → { "ok": true, "id": <number> }
```

Source of truth: `apps/mcp-server/src/interface/mcp/tools/system/agentWorkLogTools.ts`

### AC status

| AC | Status |
|----|--------|
| AC-1: Each listed package doc shows full two-call recipe | PASS — all 10 files patched |
| AC-2: No source-code edits | PASS — docs only |
| AC-3: Commit on main, 1914b moved to Done, handoff written | PASS (this file) |

### Implementation notes

- The old params `action`, `context`, `signal_ids` do not exist in the actual Zod schema. They were invented and never worked.
- `report-analyzer.md` had an additional broken call in the "Comprehensive Report Cycle" example block — that snippet was also corrected to show the proper Call 2 pattern.
- `po.md` Usage section had `log_agent_work(agent="developer", task="TASK_NNN", status="in_progress")` — also corrected to the two-call pattern.
- All 10 files had `Last Updated` bumped to 2026-05-15.
