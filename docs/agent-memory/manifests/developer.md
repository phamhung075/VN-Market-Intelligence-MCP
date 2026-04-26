# Developer Memory Manifest

**Load when:** Starting work on a task from TASKS.md. Uses PM's handoff file (`docs/handoffs/TASK_NNN.md`) as primary routing. This manifest is secondary.

| Task Type | Load |
|-----------|------|
| writing-scheduler | patterns/date-handling.md, modules/scheduler.md |
| adding-http-fetcher | patterns/circuit-breaker.md, patterns/rate-limiter.md, patterns/SQL-injection.md |
| fixing-bug | issues/[BUGNAME].md, modules/[MODULENAME].md (see handoff) |
| domain-refactor | modules/domain.md, patterns/DDD-violations.md |
| infrastructure-refactor | modules/scheduler.md |
| starting-fresh | sessions/LATEST.md |

**Load sequence:**
1. Load `docs/handoffs/TASK_NNN.md` (PM provides exact context)
2. Load files listed in handoff's `knowledge_needed:` field
3. Load this manifest ONLY if handoff is missing the `knowledge_needed:` field

**Total load cost:** 50–100 tokens (manifest + handoff) + 200–400 tokens (task-specific files)

---

**Priority:** Handoff file > manifest. The PM's TASK_NNN.md is the source of truth for what to load.
