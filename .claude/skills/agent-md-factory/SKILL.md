---
name: agent-md-factory
description: >
  Mandatory pre/post-edit discipline for ALL edits to agent .md files, flow .md
  files, skills SKILL.md files, and agent-related CLAUDE.md blocks.
  Enforces SSOT, DRY, lazy-load, tree-DAG, factory-template, and frontmatter
  invariants. Reconstructed 2026-06-07 (was missing from disk; contract sourced
  from feedback_agent_md_factory.md + architecture-briefs references).
version: "2026-06-07"
---

# Agent .md Factory — Pre/Post-Edit Discipline

## Scope — files that REQUIRE this skill before any Edit or Write

- `.claude/agents/*.md`
- `docs/agents/*/flow/*.md` and `docs/agents/*/handlers.md`
- `.claude/skills/**/SKILL.md`
- `docs/AGENT_CREATION_GUIDE.md` and `docs/agents/guides/*.md` (read-only reference — never modify directly)
- Agent-related blocks of `CLAUDE.md` and `memory/MEMORY.md`

---

## Pre-Edit Checklist (run BEFORE any Edit/Write)

### P-1 — Read the SSOT
For the file type being edited, identify and read its SSOT anchor:
- Agent definition (`.claude/agents/<id>.md`) → `docs/AGENT_CREATION_GUIDE.md` § 5 + `guides/guide-agent-definition.md`
- Flow file (`docs/agents/<id>/flow/*.md`) → `guides/guide-flows.md` §6.1 (cowork) or §6.2 (dev)
- Skill (`SKILL.md`) → `guides/guide-skills-registration.md` §15–16

### P-2 — SSOT grep (no doubles)
```bash
grep -rn "<unique-section-heading-or-field>" docs/agents/ .claude/agents/ .claude/skills/ 2>/dev/null
```
Confirm the value you're about to write does NOT already exist in another file.
If it does → DRY: add a pointer/reference instead of duplicating.

### P-3 — Identify file type and pull factory template
| File type | Template section |
|---|---|
| Cowork agent `.md` | `guides/guide-agent-definition.md` §5 + §6.1 |
| Dev-team agent `.md` | `guides/guide-agent-definition.md` §5 + §6.2 |
| Flow main.md | `guides/guide-flows.md` §6 |
| SKILL.md | `guides/guide-skills-registration.md` §15 |

### P-4 — Frontmatter line-1 invariant
Every agent `.md` and every flow `.md` that carries frontmatter MUST have `---` on line 1.
If the target file has a `# ` heading on line 1 instead → do NOT move it unless the task explicitly requires frontmatter addition. Never silently shuffle line ordering.

### P-5 — Lazy-load check
Does the edit add new "always-load" content? Check if the content can be lazy-loaded instead:
- Rule: static context used in < 50% of cycles → lazy-load candidate (pointer only in main, body in sibling `.md`)
- See `guides/guide-lazy-load.md` §4 for the trigger-pattern syntax.

### P-6 — Tree-DAG check (no circular dependencies)
Sketch the dependency arrow: `<this file>` → `<files it references>`.
Confirm none of the referenced files reference back to `<this file>` (direct or transitive cycle).

---

## Post-Edit Checklist (run AFTER every Edit/Write)

### Q-1 — SSOT verify (re-grep after write)
Repeat P-2 search. Confirm zero duplication was introduced.

### Q-2 — Broken-ref scan
```bash
grep -rn "\`\.claude/skills/agent-md-factory" docs/ .claude/ 2>/dev/null | head -5
```
Spot-check that pointers added in the edit resolve to real files.

### Q-3 — Size cap check
- Agent `.md`: no hard cap, but flag if > 200L (suggest lazy-load extraction).
- Flow `main.md`: flag if > 120L without a `<!-- size-justification: ... -->` comment on line 1 or 2.
- SKILL.md: no hard cap, but flag if > 80L (skill should be focused).

### Q-4 — MEMORY.md index update (when adding new skill or new agent)
If a new `.claude/skills/<name>/SKILL.md` was created:
→ The project memory index (`memory/MEMORY.md`) must carry a pointer entry for the new skill.
If a new `.claude/agents/<id>.md` was created:
→ Verify it appears in `docs/references/agent-roster.md` and dispatch table (`.claude/skills/dispatch/SKILL.md`).

### Q-5 — Caveman pass
Return the diff summary to the caller in plain language (no jargon, no markdown tables in the summary line).

---

## Key constraints (always enforce)

- NEVER generate agent content from memory — always verify against guide's current state.
- DRY: a rule stated in one file MUST NOT be restated verbatim in another — use a pointer.
- SSOT: one canonical definition per concept. If two files define the same thing, pick one and make the other a pointer.
- Lazy-load: prefer pointers over inline blocks for context used infrequently.
- Tree-DAG: no circular skill/flow dependencies.
- Frontmatter: `---` on line 1 is mandatory for every file that carries YAML frontmatter.
- No hardcoded stats (tool counts, agent counts, cron counts) — pointer to source JSON only.
