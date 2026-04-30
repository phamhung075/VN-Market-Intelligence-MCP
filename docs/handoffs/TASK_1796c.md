# TASK 1796c — Delete ghost dirs docs/agent-memory/modules/, issues/, patterns/

**Sprint:** 1796
**Wave:** 1 (parallel)
**Type:** FIX
**Priority:** P2
**Owner:** developer
**Estimated effort:** ~20 min

---

## Context

Three directories under docs/agent-memory/ are ghost artifacts from old sprint structures — they are empty or contain stale/orphaned files that are no longer referenced by any agent or knowledge file. They must be removed to reduce noise.

---

## Acceptance Criteria

1. The following paths are deleted entirely (including any contents):
   - `docs/agent-memory/modules/`
   - `docs/agent-memory/issues/`
   - `docs/agent-memory/patterns/`
2. Verify no active agent file or knowledge file references these paths before deleting.
3. If any file inside contains non-trivial content, move it to the appropriate location (docs/agent-memory/sessions/ or docs/TASKS_ARCHIVE.md) rather than silently dropping it.

---

## Files

- Delete: `docs/agent-memory/modules/` (recursive)
- Delete: `docs/agent-memory/issues/` (recursive)
- Delete: `docs/agent-memory/patterns/` (recursive)

---

## Dependencies

None — Wave 1, no blocking tasks.

---

## Definition of Done

- [ ] `ls docs/agent-memory/` no longer shows `modules`, `issues`, or `patterns`
- [ ] No dangling references to deleted paths in .claude/ or docs/
- [ ] Commit: `task(1796c): delete ghost dirs docs/agent-memory/modules+issues+patterns`
