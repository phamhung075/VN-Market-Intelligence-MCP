# Decision Journal — Sprint ORCH-TASK-CANON · dev-mcp-server

**Sprint goal:** Canonical task schema — id mandatory, done[] serving, journalStore glob
**Agent:** dev-mcp-server
**Started:** 2026-06-06T21:30:00Z

---

### STEP dev-mcp-server-S1 · dev-mcp-server · 2026-06-06T21:30:00Z
**task-id:** F2-MCP
**what-done:** Renamed OrchStateTaskBoardTask field: task_id (mandatory) → id (mandatory); task_id now legacy-optional read-only; added done? to OrchStateTaskBoard; added new optional fields per task-schema.md v1.0.
**what-considered:**
- Keep task_id mandatory, add id optional (rejected: contradicts F1B migration + task-schema.md authority)
- Make id mandatory, task_id optional legacy-only (selected: aligns with task-schema.md v1.0 and F1B corpus)
**why-decision:** task-schema.md authority + F1B migrated all corpus to id-canonical; no data loss risk.
**why-change:** No change from handoff spec D-4.

### STEP dev-mcp-server-S2 · dev-mcp-server · 2026-06-06T21:35:00Z
**task-id:** F2-MCP
**what-done:** Updated buildOrchestrationDto() to project done[] from task_board.done and counts.done from done[].length; updated projectTask() coalesce to prefer id over task_id.
**what-considered:**
- Keep counts.done from active_sprint DONE count (rejected: F1B moved DONE tasks to done[], not active_sprint)
- Source counts.done from done[].length (selected: canonical post-F1B)
**why-decision:** done[] is the authoritative source post-F1B migration; counts.done must match done[].length invariant.
**why-change:** No change from handoff spec.

### STEP dev-mcp-server-S3 · dev-mcp-server · 2026-06-06T21:40:00Z
**task-id:** F2-MCP
**what-done:** Replaced single-file journalStore lookup with readdirSync glob: sprint-${id}*.md matches both legacy and per-agent files; mtime cache preserved per-file.
**what-considered:**
- Use node:fs.glob (not available in Bun/Node 18) — rejected
- readdirSync + Array.filter startsWith+endsWith (selected: portable, simple, deterministic sort)
**why-decision:** readdirSync is available in all Bun/Node environments; filter is readable and testable.
**why-change:** Per-agent file pattern (sprint-ORCH-TASK-CANON-dev-mcp-server.md) required glob, not single-path.

### STEP dev-mcp-server-S4 · dev-mcp-server · 2026-06-06T21:45:00Z
**task-id:** F2-MCP
**what-done:** Wrote 44 new unit tests (1980-f2-canon-schema.test.ts) covering projectTask coalesce, done[] projection, counts.done invariant, journalStore glob multi-file merge, banned field absence; all 103 tests across 4 test files pass.
**what-considered:**
- Inline tests in existing 1977/1979 files (rejected: harder to review + would exceed file size caps)
- New 1980 file (selected: isolated, reviewable, follows naming convention)
**why-decision:** Separation keeps test files under 500L cap; new file is immediately identifiable as F2 work.
**why-change:** No change from handoff spec (25+ tests required).
