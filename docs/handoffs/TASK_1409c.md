# TASK 1409c — Create .claude/knowledge/agent-spawn-template.md

**Sprint:** 1409 — Audit Remediation
**Tier:** 1 (parallel with 1409b, 1409d, 1409e)
**Owner:** claude-manager-helper
**Priority:** MEDIUM
**Type:** chore
**Estimated effort:** ~20 min

---

## Context

CLAUDE.md contains the "Main Terminal Spawn Template" and "Parallel Spawn Rule" inline. These are operational policies that agents and the main terminal need to reference. They belong in the `.claude/knowledge/` SSOT tree, not embedded in CLAUDE.md prose. CLAUDE.md already has a pointer comment but the target file does not exist yet.

---

## Acceptance Criteria

1. File `.claude/knowledge/agent-spawn-template.md` exists and is ≥ 50 chars
2. File contains:
   - Main Terminal Spawn Template (exact format block)
   - Parallel Spawn Rule (with the 3-case example: independent / dependent / same stage)
   - At least 2 worked examples showing how to build a spawn prompt from a RETURN block
3. CLAUDE.md is NOT modified (it already has the pointer; the file just needs to exist)
4. File is valid Markdown

---

## Files

- `.claude/knowledge/agent-spawn-template.md` — CREATE

---

## Content to include

Extract and expand from CLAUDE.md "Agent Chaining Protocol" section:

**Main Terminal Spawn Template block:**
```
Task [NNN]. Handoff: docs/handoffs/TASK_NNN.md. [Previous agent DONE sentence]. [NEXT sentence — what you must do now.]
```

**Parallel Spawn Rule:**
```
Independent tasks (different files, no deps) → spawn ALL in one message
Dependent tasks → spawn sequentially (wait for return before next)
Same pipeline stage, no conflict → always parallel
```

**Examples to include:**

Example 1 — Sequential (architect → pm):
```
DONE: Architect completed design for Sprint 1409 with 6 tasks across 2 tiers.
NEXT: pm | Create handoff files for all 6 tasks and update TASKS.md.

→ Spawn: "Task 1409. Handoff: docs/handoffs/TASK_1409-arch.md. Architect completed design for Sprint 1409 with 6 tasks across 2 tiers. Create handoff files for all 6 tasks and update TASKS.md."
```

Example 2 — Parallel (Tier 1 tasks):
```
Tasks 1409b, 1409c, 1409d, 1409e have no shared files or deps.
→ Spawn all 4 in a single message: Agent(claude-manager-helper, 1409b) + Agent(claude-manager-helper, 1409c) + Agent(developer, 1409d) + Agent(claude-manager-helper, 1409e)
```

---

## Instructions

1. Create `.claude/knowledge/agent-spawn-template.md` with the content described above
2. Ensure file is ≥ 50 chars (it will be far longer)
3. Do NOT modify CLAUDE.md
4. Commit the new file

---

## Definition of Done

- `.claude/knowledge/agent-spawn-template.md` exists, ≥ 50 chars, valid Markdown
- Contains template, parallel rule, and 2 examples
- Committed with message: `task(1409c): create agent-spawn-template.md knowledge file`

---

## Dependencies

- Blocked by: none (Tier 1)
- Blocks: 1409f (file count update depends on this file existing)
