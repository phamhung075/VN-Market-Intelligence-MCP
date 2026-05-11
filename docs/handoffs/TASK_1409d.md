# TASK 1409d — Create .claude/knowledge/token-economy.md

**Sprint:** 1409 — Audit Remediation
**Tier:** 1 (parallel with 1409b, 1409c, 1409e)
**Owner:** developer
**Priority:** HIGH
**Type:** docs
**Estimated effort:** ~30 min

---

## Context

Agent-to-agent communication currently has no documented compression policy, leading to inconsistent verbosity across handoffs, RETURN blocks, and caveman messages. The 3-tier policy (ULTRA / FULL / LITE) needs a canonical SSOT in `.claude/knowledge/` so all agents can reference it.

---

## Acceptance Criteria

1. File `.claude/knowledge/token-economy.md` exists and is ≥ 50 chars
2. File defines exactly 3 tiers with:
   - Tier name + alias
   - Target reduction vs. uncompressed baseline
   - When to use (trigger condition)
   - Format rules
   - Example (short)
3. File includes a "Which tier to use" decision matrix
4. File is valid Markdown

---

## Files

- `.claude/knowledge/token-economy.md` — CREATE

---

## Content specification

### Tier definitions

**ULTRA (~75% reduction)**
- Alias: caveman
- Use when: inter-agent status pings, blocker escalations, WIP state changes
- Format: no prose, key=value or 1-line imperative only
- Example: `BLOCKER: 1409d missing dep. OWNER: developer. ACTION: unblock now.`

**FULL (structured compressed)**
- Alias: handoff
- Use when: task handoff files, RETURN blocks, architect design summaries
- Format: structured Markdown with headers, bullet acceptance criteria, no narrative padding
- Reduction target: ~40% vs. uncompressed prose
- Example: standard TASK_NNN.md format

**LITE (terse prose)**
- Alias: summary
- Use when: session logs, sprint retrospectives, PM status updates to user
- Format: flowing prose but no filler sentences, max 3 sentences per point
- Reduction target: ~20% vs. uncompressed prose

### Decision matrix

| Signal | Tier |
|--------|------|
| Agent ping / status check | ULTRA |
| Blocker escalation | ULTRA |
| Task handoff file | FULL |
| RETURN block | FULL |
| Architect design doc | FULL |
| Sprint session log append | LITE |
| User-facing status report | LITE |
| Knowledge file (permanent SSOT) | FULL |

---

## Instructions

1. Create `.claude/knowledge/token-economy.md` with all content specified above
2. Ensure all 3 tiers have name, alias, use-when, format rules, and an example
3. Include the decision matrix table
4. File must be ≥ 50 chars (will be far longer)
5. Commit the new file

---

## Definition of Done

- `.claude/knowledge/token-economy.md` exists, ≥ 50 chars, valid Markdown
- All 3 tiers documented with decision matrix
- Committed with message: `task(1409d): create token-economy.md knowledge file — 3-tier compression policy`

---

## Dependencies

- Blocked by: none (Tier 1)
- Blocks: 1409f (file count update depends on this file existing)
