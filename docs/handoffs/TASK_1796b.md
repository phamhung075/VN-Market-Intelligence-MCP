# TASK 1796b — Trim CLAUDE.md to under 120 lines

**Sprint:** 1796
**Wave:** 1 (parallel)
**Type:** FIX
**Priority:** P2
**Owner:** developer
**Estimated effort:** ~45 min

---

## Context

CLAUDE.md is the main terminal's routing file. It has grown beyond 120 lines due to the inline Agent Chaining Protocol section. That section must be extracted to a dedicated knowledge file and replaced with a pointer.

---

## Acceptance Criteria

1. `.claude/knowledge/agent-chaining-protocol.md` is created with the full Agent Chaining Protocol content (pipeline map, parallel spawn rule, agent return template, main terminal spawn template, all rules).
2. CLAUDE.md retains only a pointer line for the Agent Chaining Protocol section, e.g.:
   `> Full protocol: .claude/knowledge/agent-chaining-protocol.md`
3. CLAUDE.md is 120 lines or fewer after extraction.
4. `.claude/knowledge/tree-map.md` is updated to include `agent-chaining-protocol.md` as a child node under `.claude/knowledge/`.
5. No functional routing logic is lost from CLAUDE.md — the pointer must reference the full file.

---

## Files

- Primary: `CLAUDE.md`
- New: `.claude/knowledge/agent-chaining-protocol.md`
- Update: `.claude/knowledge/tree-map.md`

---

## Dependencies

None — Wave 1, no blocking tasks.

---

## Definition of Done

- [ ] `wc -l CLAUDE.md` returns <= 120
- [ ] `.claude/knowledge/agent-chaining-protocol.md` exists and contains full chaining protocol
- [ ] `.claude/knowledge/tree-map.md` references `agent-chaining-protocol.md`
- [ ] Pointer in CLAUDE.md is accurate and readable
- [ ] Commit: `task(1796b): extract agent-chaining-protocol.md — CLAUDE.md under 120 lines`
